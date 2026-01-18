const { Desk, Element, Comment, User } = require('../models/models');
const { canReadDesk } = require('../utils/deskAccess');
const { emitToDesk } = require('../realtime/bus');

function toInt(value) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

function normalizeText(value) {
  const s = String(value ?? '').trim();
  if (!s) return null;
  // Keep payload bounded (prevents abuse + accidental huge pastes).
  if (s.length > 5000) return s.slice(0, 5000);
  return s;
}

class CommentsController {
  async listByElement(req, res) {
    try {
      const elementId = toInt(req.params.elementId);
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ error: 'Not authorized' });
      if (!elementId) return res.status(400).json({ error: 'Invalid elementId' });

      const element = await Element.findByPk(elementId);
      if (!element) return res.status(404).json({ error: 'Element not found' });

      // Comments are not supported for drawings (brush strokes).
      if (element.type === 'drawing') return res.status(404).json({ error: 'Not found' });

      const desk = await Desk.findByPk(element.deskId);
      if (!desk) return res.status(404).json({ error: 'Element not found' });

      // Comments are enabled ONLY for group desks.
      if (!desk.groupId) return res.status(404).json({ error: 'Not found' });

      const ok = await canReadDesk(desk, userId);
      if (!ok) return res.status(404).json({ error: 'Not found' });

      const comments = await Comment.findAll({
        where: { deskId: desk.deskId, elementId },
        include: [{ model: User, attributes: ['id', 'email'] }],
        order: [['createdAt', 'ASC'], ['id', 'ASC']],
      });

      return res.json(comments);
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  }

  async create(req, res) {
    try {
      const elementId = toInt(req.params.elementId);
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ error: 'Not authorized' });
      if (!elementId) return res.status(400).json({ error: 'Invalid elementId' });

      const text = normalizeText(req.body?.text);
      if (!text) return res.status(400).json({ error: 'text is required' });

      const element = await Element.findByPk(elementId);
      if (!element) return res.status(404).json({ error: 'Element not found' });

      // Comments are not supported for drawings (brush strokes).
      if (element.type === 'drawing') return res.status(404).json({ error: 'Not found' });

      const desk = await Desk.findByPk(element.deskId);
      if (!desk) return res.status(404).json({ error: 'Element not found' });

      // Comments are enabled ONLY for group desks.
      if (!desk.groupId) return res.status(404).json({ error: 'Not found' });

      const ok = await canReadDesk(desk, userId);
      if (!ok) return res.status(404).json({ error: 'Not found' });

      const created = await Comment.create({
        deskId: desk.deskId,
        elementId,
        userId,
        text,
      });

      const full = await Comment.findByPk(created.id, { include: [{ model: User, attributes: ['id', 'email'] }] });

      emitToDesk(Number(desk.deskId), 'comment:created', {
        deskId: Number(desk.deskId),
        elementId: Number(elementId),
        comment: typeof full?.toJSON === 'function' ? full.toJSON() : full,
      });

      return res.status(201).json(full);
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  }
}

module.exports = new CommentsController();


