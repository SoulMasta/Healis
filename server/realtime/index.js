const jwt = require('jsonwebtoken');
const { Server } = require('socket.io');
const sequelize = require('../db');
const { Desk, Element, Note, NoteVersion } = require('../models/models');
const { canReadDesk, canManageDesk } = require('../utils/deskAccess');
const { createPresenceStore } = require('./presenceStore');
const bus = require('./bus');

function toInt(value) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

function normalizeEmoji(value) {
  const s = String(value ?? '').trim();
  // Keep it simple: allow a short emoji string (including multi-codepoint emojis).
  if (!s) return null;
  if (s.length > 32) return null;
  return s;
}

async function createNoteVersion({ elementId, text, userId, changeType = 'EDIT', transaction }) {
  const current = (await NoteVersion.max('version', { where: { elementId }, transaction })) || 0;
  const version = current + 1;
  try {
    return await NoteVersion.create(
      { elementId, version, text: text ?? '', updatedBy: userId ?? null, changeType },
      { transaction }
    );
  } catch (e) {
    if (e?.name === 'SequelizeUniqueConstraintError') {
      const again = (await NoteVersion.max('version', { where: { elementId }, transaction })) || 0;
      return await NoteVersion.create(
        { elementId, version: again + 1, text: text ?? '', updatedBy: userId ?? null, changeType },
        { transaction }
      );
    }
    throw e;
  }
}

function initRealtime(httpServer) {
  const io = new Server(httpServer, {
    cors: {
      origin: true,
      credentials: true,
    },
  });

  // Allow controllers to broadcast board updates (create/update/delete) to rooms.
  bus.setIo(io);

  const presence = createPresenceStore();

  io.use((socket, next) => {
    try {
      const token =
        socket.handshake.auth?.token ||
        socket.handshake.headers?.authorization?.split(' ')[1] ||
        socket.handshake.query?.token;

      if (!token) return next(new Error('Not authorized'));

      const decoded = jwt.verify(token, process.env.SECRET_KEY);
      socket.data.user = decoded;
      return next();
    } catch (e) {
      return next(new Error('Not authorized'));
    }
  });

  io.on('connection', (socket) => {
    socket.data.joinedDeskIds = new Set();
    // Join a personal room for targeted notifications (calendar, etc.)
    const userId = socket.data.user?.id;
    if (userId) {
      socket.join(`user:${userId}`);
    }

    socket.on('desk:join', async (payload = {}, ack) => {
      try {
        const deskId = toInt(payload.deskId);
        const userId = socket.data.user?.id;
        if (!deskId || !userId) throw new Error('Invalid payload');

        const desk = await Desk.findByPk(deskId);
        if (!desk) throw new Error('Workspace not found');
        const ok = await canReadDesk(desk, userId);
        if (!ok) throw new Error('Workspace not found');

        const room = `desk:${deskId}`;
        await socket.join(room);
        socket.data.joinedDeskIds.add(deskId);

        presence.add({ deskId, userId, socketId: socket.id });

        io.to(room).emit('desk:presence', { deskId, users: presence.listUsers(deskId) });
        if (typeof ack === 'function') ack({ ok: true, deskId });
      } catch (e) {
        if (typeof ack === 'function') ack({ ok: false, error: e?.message || 'Join failed' });
      }
    });

    socket.on('desk:leave', async (payload = {}, ack) => {
      try {
        const deskId = toInt(payload.deskId);
        const userId = socket.data.user?.id;
        if (!deskId || !userId) throw new Error('Invalid payload');

        const room = `desk:${deskId}`;
        await socket.leave(room);
        socket.data.joinedDeskIds.delete(deskId);

        presence.remove({ deskId, userId, socketId: socket.id });
        io.to(room).emit('desk:presence', { deskId, users: presence.listUsers(deskId) });

        if (typeof ack === 'function') ack({ ok: true, deskId });
      } catch (e) {
        if (typeof ack === 'function') ack({ ok: false, error: e?.message || 'Leave failed' });
      }
    });

    socket.on('note:edit', async (payload = {}, ack) => {
      const t = await sequelize.transaction();
      try {
        const deskId = toInt(payload.deskId);
        const elementId = toInt(payload.elementId);
        const baseVersion = payload.baseVersion === undefined ? undefined : toInt(payload.baseVersion);
        const text = payload.text ?? '';

        const userId = socket.data.user?.id;
        if (!deskId || !elementId || !userId) throw new Error('Invalid payload');

        const desk = await Desk.findByPk(deskId, { transaction: t });
        if (!desk) throw new Error('Workspace not found');
        const canManage = await canManageDesk(desk, userId);
        if (!canManage) throw new Error('Forbidden');

        const element = await Element.findByPk(elementId, { transaction: t });
        if (!element || element.deskId !== deskId || element.type !== 'note') throw new Error('Note not found');

        const currentVersion = (await NoteVersion.max('version', { where: { elementId }, transaction: t })) || 0;
        if (baseVersion !== undefined && baseVersion !== currentVersion) {
          const currentNote = await Note.findByPk(elementId, { transaction: t });
          await t.rollback();
          if (typeof ack === 'function') {
            return ack({
              ok: false,
              error: 'VERSION_CONFLICT',
              currentVersion,
              currentText: String(currentNote?.text ?? ''),
            });
          }
          return;
        }

        const existing = await Note.findByPk(elementId, { transaction: t });
        if (existing) {
          await existing.update({ text: String(text) }, { transaction: t });
        } else {
          await Note.create({ elementId, text: String(text) }, { transaction: t });
        }

        const newV = await createNoteVersion({
          elementId,
          text: String(text),
          userId,
          changeType: 'EDIT',
          transaction: t,
        });

        await t.commit();

        const room = `desk:${deskId}`;
        io.to(room).emit('note:updated', {
          deskId,
          elementId,
          text: String(text),
          version: newV.version,
          updatedBy: userId,
        });

        if (typeof ack === 'function') ack({ ok: true, version: newV.version });
      } catch (e) {
        await t.rollback();
        if (typeof ack === 'function') ack({ ok: false, error: e?.message || 'Update failed' });
      }
    });

    socket.on('reaction:toggle', async (payload = {}, ack) => {
      const t = await sequelize.transaction();
      try {
        const deskId = toInt(payload.deskId);
        const elementId = toInt(payload.elementId);
        const emoji = normalizeEmoji(payload.emoji);
        const userId = socket.data.user?.id;
        if (!deskId || !elementId || !emoji || !userId) throw new Error('Invalid payload');

        const desk = await Desk.findByPk(deskId, { transaction: t });
        if (!desk) throw new Error('Workspace not found');
        const canManage = await canManageDesk(desk, userId);
        if (!canManage) throw new Error('Forbidden');

        const element = await Element.findByPk(elementId, { transaction: t });
        if (!element || element.deskId !== deskId) throw new Error('Element not found');
        if (element.type === 'drawing') throw new Error('Reactions are not supported for drawings');

        const current = element.reactions && typeof element.reactions === 'object' ? element.reactions : {};
        const currentListRaw = current[emoji];
        const currentList = Array.isArray(currentListRaw)
          ? currentListRaw.map((x) => toInt(x)).filter((x) => x != null)
          : [];

        const has = currentList.includes(userId);
        const nextList = has ? currentList.filter((id) => id !== userId) : [...currentList, userId];
        const next = { ...current };
        if (nextList.length) next[emoji] = nextList;
        else delete next[emoji];

        await element.update({ reactions: next }, { transaction: t });
        await t.commit();

        bus.emitToDesk(deskId, 'element:reactions', { deskId, elementId, reactions: next });
        if (typeof ack === 'function') ack({ ok: true, deskId, elementId, reactions: next, didAdd: !has });
      } catch (e) {
        await t.rollback();
        if (typeof ack === 'function') ack({ ok: false, error: e?.message || 'Reaction failed' });
      }
    });

    socket.on('disconnect', () => {
      presence.removeSocketEverywhere(socket.id);
      for (const deskId of socket.data.joinedDeskIds || []) {
        io.to(`desk:${deskId}`).emit('desk:presence', { deskId, users: presence.listUsers(deskId) });
      }
    });
  });

  return io;
}

module.exports = { initRealtime };


