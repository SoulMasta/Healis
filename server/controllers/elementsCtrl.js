const sequelize = require('../db');
const { Desk, Element, Note, NoteVersion, Text, Document, Link, Drawing, Connector, Frame } = require('../models/models');
const { canReadDesk, canManageDesk } = require('../utils/deskAccess');
const { emitToDesk } = require('../realtime/bus');

const TYPE_TO_MODEL = {
  note: Note,
  text: Text,
  document: Document,
  link: Link,
  drawing: Drawing,
  connector: Connector,
  frame: Frame,
};

const TYPE_ALLOWED_FIELDS = {
  note: ['text', 'bold', 'italic', 'underline'],
  text: ['content', 'fontFamily', 'fontSize', 'color', 'bold', 'italic', 'underline'],
  document: ['title', 'url'],
  link: ['title', 'url', 'previewImageUrl'],
  drawing: ['data'],
  connector: ['data'],
  frame: ['title'],
};

function elementInclude() {
  // One-of relationship: only one of these is expected to exist for a given element.type
  return [
    { model: Note, required: false },
    { model: Text, required: false },
    { model: Document, required: false },
    { model: Link, required: false },
    { model: Drawing, required: false },
    { model: Connector, required: false },
    { model: Frame, required: false },
  ];
}

function pickDefined(obj) {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined));
}

function pickAllowed(obj, allowed) {
  const out = {};
  for (const key of allowed) {
    if (obj[key] !== undefined) out[key] = obj[key];
  }
  return out;
}

async function createNoteVersion({ elementId, text, userId, changeType = 'EDIT', transaction }) {
  // "Best effort" monotonic versioning. If 2 writes race, UNIQUE(elementId,version) will force retry.
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

class ElementsController {
  async getAllByDesk(req, res) {
    try {
      const { deskId } = req.params;
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ error: 'Not authorized' });

      const desk = await Desk.findByPk(deskId);
      if (!desk) return res.status(404).json({ error: 'Workspace not found' });
      const ok = await canReadDesk(desk, userId);
      if (!ok) return res.status(404).json({ error: 'Workspace not found' });

      const elements = await Element.findAll({
        where: { deskId },
        include: elementInclude(),
        order: [['zIndex', 'ASC'], ['elementId', 'ASC']],
      });

      const payload = elements.map((el) => (typeof el?.toJSON === 'function' ? el.toJSON() : el));
      return res.json(payload);
    } catch (error) {
      console.error('[elementsCtrl.getAllByDesk]', error?.message || error, error?.stack);
      return res.status(500).json({ error: error.message || 'Internal server error' });
    }
  }

  async getOne(req, res) {
    try {
      const { elementId } = req.params;
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ error: 'Not authorized' });
      const element = await Element.findByPk(elementId, { include: elementInclude() });
      if (!element) return res.status(404).json({ error: 'Element not found' });

      const desk = await Desk.findByPk(element.deskId);
      if (!desk) return res.status(404).json({ error: 'Element not found' });
      const ok = await canReadDesk(desk, userId);
      if (!ok) return res.status(404).json({ error: 'Element not found' });
      return res.json(element);
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  }

  async createOnDesk(req, res) {
    const t = await sequelize.transaction();
    try {
      const { deskId } = req.params;
      const userId = req.user?.id;
      if (!userId) {
        await t.rollback();
        return res.status(401).json({ error: 'Not authorized' });
      }
      const {
        type,
        x,
        y,
        width,
        height,
        rotation,
        zIndex,
        locked,
        // type-specific payload:
        payload,
        // also allow passing type-specific fields at top-level:
        ...rest
      } = req.body || {};

      if (!type) return res.status(400).json({ error: 'type is required' });
      const ChildModel = TYPE_TO_MODEL[type];
      if (!ChildModel) return res.status(400).json({ error: `Unsupported type: ${type}` });
      const allowedFields = TYPE_ALLOWED_FIELDS[type] || [];

      const desk = await Desk.findByPk(deskId);
      if (!desk) return res.status(404).json({ error: 'Workspace not found' });
      const canManage = await canManageDesk(desk, userId);
      if (!canManage) return res.status(403).json({ error: 'Forbidden' });

      const element = await Element.create(
        {
          deskId,
          type,
          ...pickDefined({ x, y, width, height, rotation, zIndex, locked }),
        },
        { transaction: t }
      );

      const childPayload = payload && typeof payload === 'object' ? payload : rest;
      const filteredChildPayload = pickAllowed(childPayload, allowedFields);

      if ((type === 'document' || type === 'link') && !filteredChildPayload.url) {
        await t.rollback();
        return res.status(400).json({ error: 'url is required for document/link' });
      }

      await ChildModel.create(
        {
          elementId: element.elementId,
          ...filteredChildPayload,
        },
        { transaction: t }
      );

      if (type === 'note') {
        await createNoteVersion({
          elementId: element.elementId,
          text: filteredChildPayload.text ?? '',
          userId,
          changeType: 'CREATE',
          transaction: t,
        });
      }

      await t.commit();
      const full = await Element.findByPk(element.elementId, { include: elementInclude() });
      // Realtime broadcast to other connected users on the same desk.
      emitToDesk(Number(deskId), 'element:created', typeof full?.toJSON === 'function' ? full.toJSON() : full);
      return res.status(201).json(full);
    } catch (error) {
      await t.rollback();
      return res.status(500).json({ error: error.message });
    }
  }

  async update(req, res) {
    const t = await sequelize.transaction();
    try {
      const { elementId } = req.params;
      const userId = req.user?.id;
      if (!userId) {
        await t.rollback();
        return res.status(401).json({ error: 'Not authorized' });
      }
      const { type, payload, ...rest } = req.body || {};

      const element = await Element.findByPk(elementId, { include: elementInclude(), transaction: t });
      if (!element) return res.status(404).json({ error: 'Element not found' });

      const desk = await Desk.findByPk(element.deskId, { transaction: t });
      if (!desk) {
        await t.rollback();
        return res.status(404).json({ error: 'Element not found' });
      }
      const canManage = await canManageDesk(desk, userId);
      if (!canManage) {
        await t.rollback();
        return res.status(403).json({ error: 'Forbidden' });
      }

      if (type && type !== element.type) {
        return res.status(400).json({ error: 'Changing type is not supported' });
      }

      const baseFields = pickDefined({
        x: rest.x,
        y: rest.y,
        width: rest.width,
        height: rest.height,
        rotation: rest.rotation,
        zIndex: rest.zIndex,
        locked: rest.locked,
      });
      if (Object.keys(baseFields).length) {
        await element.update(baseFields, { transaction: t });
      }

      const ChildModel = TYPE_TO_MODEL[element.type];
      const allowedFields = TYPE_ALLOWED_FIELDS[element.type] || [];
      const childPayload = payload && typeof payload === 'object' ? payload : rest;
      const filteredChildPayload = pickAllowed(childPayload, allowedFields);

      if (ChildModel) {
        const existingChild = await ChildModel.findByPk(element.elementId, { transaction: t });
        const beforeNoteText =
          element.type === 'note' && existingChild ? String(existingChild.text ?? '') : null;
        if (existingChild) {
          await existingChild.update(filteredChildPayload, { transaction: t });
        } else if (Object.keys(filteredChildPayload).length) {
          await ChildModel.create({ elementId: element.elementId, ...filteredChildPayload }, { transaction: t });
        }

        if (element.type === 'note' && 'text' in filteredChildPayload) {
          const afterNoteText = String(filteredChildPayload.text ?? '');
          if (beforeNoteText === null || beforeNoteText !== afterNoteText) {
            await createNoteVersion({
              elementId: element.elementId,
              text: afterNoteText,
              userId,
              changeType: 'EDIT',
              transaction: t,
            });
          }
        }
      }

      await t.commit();
      const full = await Element.findByPk(element.elementId, { include: elementInclude() });
      emitToDesk(
        Number(element.deskId),
        'element:updated',
        typeof full?.toJSON === 'function' ? full.toJSON() : full
      );
      return res.json(full);
    } catch (error) {
      await t.rollback();
      return res.status(500).json({ error: error.message });
    }
  }

  async delete(req, res) {
    const t = await sequelize.transaction();
    try {
      const { elementId } = req.params;
      const userId = req.user?.id;
      if (!userId) {
        await t.rollback();
        return res.status(401).json({ error: 'Not authorized' });
      }
      const element = await Element.findByPk(elementId, { transaction: t });
      if (!element) {
        await t.rollback();
        return res.status(404).json({ error: 'Element not found' });
      }
      const deskId = element.deskId;

      const desk = await Desk.findByPk(element.deskId, { transaction: t });
      if (!desk) {
        await t.rollback();
        return res.status(404).json({ error: 'Element not found' });
      }
      const canManage = await canManageDesk(desk, userId);
      if (!canManage) {
        await t.rollback();
        return res.status(403).json({ error: 'Forbidden' });
      }

      // Delete type-specific child row first (e.g. Frame) to avoid FK violation:
      // DB constraint frames_elementId_fkey may not have ON DELETE CASCADE
      const ChildModel = TYPE_TO_MODEL[element.type];
      if (ChildModel) {
        await ChildModel.destroy({ where: { elementId }, transaction: t });
      }
      await element.destroy({ transaction: t });

      await t.commit();
      emitToDesk(Number(deskId), 'element:deleted', { deskId, elementId: Number(elementId) });
      return res.json({ message: 'Element deleted successfully' });
    } catch (error) {
      await t.rollback();
      return res.status(500).json({ error: error.message });
    }
  }
}

module.exports = new ElementsController();


