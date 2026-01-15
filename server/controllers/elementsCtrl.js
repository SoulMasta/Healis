const sequelize = require('../db');
const { Desk, Element, Note, Text, Document, Link, Drawing } = require('../models/models');

const TYPE_TO_MODEL = {
  note: Note,
  text: Text,
  document: Document,
  link: Link,
  drawing: Drawing,
};

const TYPE_ALLOWED_FIELDS = {
  note: ['text'],
  text: ['content', 'fontFamily', 'fontSize', 'color'],
  document: ['title', 'url'],
  link: ['title', 'url', 'previewImageUrl'],
  drawing: ['data'],
};

function elementInclude() {
  // One-of relationship: only one of these is expected to exist for a given element.type
  return [
    { model: Note, required: false },
    { model: Text, required: false },
    { model: Document, required: false },
    { model: Link, required: false },
    { model: Drawing, required: false },
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

class ElementsController {
  async getAllByDesk(req, res) {
    try {
      const { deskId } = req.params;

      const desk = await Desk.findByPk(deskId);
      if (!desk) return res.status(404).json({ error: 'Workspace not found' });

      const elements = await Element.findAll({
        where: { deskId },
        include: elementInclude(),
        order: [['zIndex', 'ASC'], ['elementId', 'ASC']],
      });

      return res.json(elements);
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  }

  async getOne(req, res) {
    try {
      const { elementId } = req.params;
      const element = await Element.findByPk(elementId, { include: elementInclude() });
      if (!element) return res.status(404).json({ error: 'Element not found' });
      return res.json(element);
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  }

  async createOnDesk(req, res) {
    const t = await sequelize.transaction();
    try {
      const { deskId } = req.params;
      const {
        type,
        x,
        y,
        width,
        height,
        rotation,
        zIndex,
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

      const element = await Element.create(
        {
          deskId,
          type,
          ...pickDefined({ x, y, width, height, rotation, zIndex }),
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

      await t.commit();
      const full = await Element.findByPk(element.elementId, { include: elementInclude() });
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
      const { type, payload, ...rest } = req.body || {};

      const element = await Element.findByPk(elementId, { include: elementInclude(), transaction: t });
      if (!element) return res.status(404).json({ error: 'Element not found' });

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
        if (existingChild) {
          await existingChild.update(filteredChildPayload, { transaction: t });
        } else if (Object.keys(filteredChildPayload).length) {
          await ChildModel.create({ elementId: element.elementId, ...filteredChildPayload }, { transaction: t });
        }
      }

      await t.commit();
      const full = await Element.findByPk(element.elementId, { include: elementInclude() });
      return res.json(full);
    } catch (error) {
      await t.rollback();
      return res.status(500).json({ error: error.message });
    }
  }

  async delete(req, res) {
    try {
      const { elementId } = req.params;
      const element = await Element.findByPk(elementId);
      if (!element) return res.status(404).json({ error: 'Element not found' });
      await element.destroy(); // cascades to child rows
      return res.json({ message: 'Element deleted successfully' });
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  }
}

module.exports = new ElementsController();


