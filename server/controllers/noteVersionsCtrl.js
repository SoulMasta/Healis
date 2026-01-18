const sequelize = require('../db');
const { Desk, Element, Note, NoteVersion } = require('../models/models');
const { canReadDesk, canManageDesk } = require('../utils/deskAccess');

function toInt(value) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : null;
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

class NoteVersionsController {
  async list(req, res) {
    try {
      const { elementId } = req.params;
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ error: 'Not authorized' });

      const elId = toInt(elementId);
      if (!elId) return res.status(400).json({ error: 'Invalid elementId' });

      const element = await Element.findByPk(elId);
      if (!element || element.type !== 'note') return res.status(404).json({ error: 'Note not found' });

      const desk = await Desk.findByPk(element.deskId);
      if (!desk) return res.status(404).json({ error: 'Note not found' });
      const ok = await canReadDesk(desk, userId);
      if (!ok) return res.status(404).json({ error: 'Note not found' });

      const limit = Math.min(Math.max(toInt(req.query.limit) || 50, 1), 200);
      const offset = Math.max(toInt(req.query.offset) || 0, 0);

      const versions = await NoteVersion.findAll({
        where: { elementId: elId },
        order: [['version', 'DESC']],
        limit,
        offset,
        attributes: ['id', 'elementId', 'version', 'updatedBy', 'changeType', 'createdAt'],
      });

      return res.json({ elementId: elId, versions });
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  }

  async get(req, res) {
    try {
      const { elementId, version } = req.params;
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ error: 'Not authorized' });

      const elId = toInt(elementId);
      const ver = toInt(version);
      if (!elId || !ver) return res.status(400).json({ error: 'Invalid elementId/version' });

      const element = await Element.findByPk(elId);
      if (!element || element.type !== 'note') return res.status(404).json({ error: 'Note not found' });

      const desk = await Desk.findByPk(element.deskId);
      if (!desk) return res.status(404).json({ error: 'Note not found' });
      const ok = await canReadDesk(desk, userId);
      if (!ok) return res.status(404).json({ error: 'Note not found' });

      const v = await NoteVersion.findOne({ where: { elementId: elId, version: ver } });
      if (!v) return res.status(404).json({ error: 'Version not found' });

      return res.json(v);
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  }

  async restore(req, res) {
    const t = await sequelize.transaction();
    try {
      const { elementId, version } = req.params;
      const userId = req.user?.id;
      if (!userId) {
        await t.rollback();
        return res.status(401).json({ error: 'Not authorized' });
      }

      const elId = toInt(elementId);
      const ver = toInt(version);
      if (!elId || !ver) {
        await t.rollback();
        return res.status(400).json({ error: 'Invalid elementId/version' });
      }

      const element = await Element.findByPk(elId, { transaction: t });
      if (!element || element.type !== 'note') {
        await t.rollback();
        return res.status(404).json({ error: 'Note not found' });
      }

      const desk = await Desk.findByPk(element.deskId, { transaction: t });
      if (!desk) {
        await t.rollback();
        return res.status(404).json({ error: 'Note not found' });
      }
      const canManage = await canManageDesk(desk, userId);
      if (!canManage) {
        await t.rollback();
        return res.status(403).json({ error: 'Forbidden' });
      }

      const snap = await NoteVersion.findOne({ where: { elementId: elId, version: ver }, transaction: t });
      if (!snap) {
        await t.rollback();
        return res.status(404).json({ error: 'Version not found' });
      }

      const existing = await Note.findByPk(elId, { transaction: t });
      if (existing) {
        await existing.update({ text: snap.text ?? '' }, { transaction: t });
      } else {
        await Note.create({ elementId: elId, text: snap.text ?? '' }, { transaction: t });
      }

      const newV = await createNoteVersion({
        elementId: elId,
        text: snap.text ?? '',
        userId,
        changeType: 'RESTORE',
        transaction: t,
      });

      await t.commit();
      return res.json({ restoredFromVersion: ver, newVersion: newV.version, elementId: elId });
    } catch (error) {
      await t.rollback();
      return res.status(500).json({ error: error.message });
    }
  }
}

module.exports = new NoteVersionsController();


