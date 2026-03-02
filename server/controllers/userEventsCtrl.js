const { logUserEvent, ALLOWED_EVENT_TYPES } = require('../services/userEventLogger');

class UserEventsController {
  async create(req, res) {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ error: 'Not authorized' });

      const { eventType, entityId, entityType, metadata } = req.body || {};
      if (!eventType || !ALLOWED_EVENT_TYPES.has(String(eventType))) {
        return res.status(400).json({ error: 'Invalid eventType' });
      }

      logUserEvent({
        userId,
        eventType: String(eventType),
        entityId: entityId == null ? null : entityId,
        entityType: entityType == null ? null : entityType,
        metadata: metadata == null ? null : metadata,
      });

      return res.status(201).json({ ok: true });
    } catch (error) {
      return res.status(500).json({ error: error?.message || 'Failed to record event' });
    }
  }
}

module.exports = new UserEventsController();

