const { Notification } = require('../models/models');

function toInt(value) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

class NotificationsController {
  async listMy(req, res) {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ error: 'Not authorized' });

      const limit = Math.min(Math.max(toInt(req.query.limit) || 30, 1), 200);
      const offset = Math.max(toInt(req.query.offset) || 0, 0);
      const unread = String(req.query.unread || '').trim() === '1';

      const where = { userId };
      if (unread) where.readAt = null;

      const rows = await Notification.findAll({
        where,
        order: [['createdAt', 'DESC'], ['id', 'DESC']],
        limit,
        offset,
      });

      return res.json({ notifications: rows });
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  }

  async markRead(req, res) {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ error: 'Not authorized' });
      const id = toInt(req.params.id);
      if (!id) return res.status(400).json({ error: 'Invalid id' });

      const n = await Notification.findByPk(id);
      if (!n || Number(n.userId) !== Number(userId)) return res.status(404).json({ error: 'Not found' });

      if (!n.readAt) await n.update({ readAt: new Date() });
      return res.json({ ok: true, notification: n });
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  }
}

module.exports = new NotificationsController();


