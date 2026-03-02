const { UserEvent } = require('../models/models');

const ALLOWED_EVENT_TYPES = new Set([
  'login',
  'open_material',
  'create_material',
  'edit_material',
  'upload_file',
  'view_file',
  'like_material',
]);

function safeJson(val) {
  if (val === undefined) return null;
  if (val === null) return null;
  if (typeof val === 'string' || typeof val === 'number' || typeof val === 'boolean') return val;
  if (Array.isArray(val) || typeof val === 'object') return val;
  return String(val);
}

/**
 * Best-effort pilot logging.
 * - never throws
 * - not awaited by callers (doesn't block UX)
 */
function logUserEvent({ userId, eventType, entityId = null, entityType = null, metadata = null } = {}) {
  try {
    if (!userId) return;
    if (!eventType || !ALLOWED_EVENT_TYPES.has(eventType)) return;
    if (!UserEvent) return;

    Promise.resolve()
      .then(() =>
        UserEvent.create({
          userId: Number(userId),
          eventType: String(eventType),
          entityId: entityId == null ? null : String(entityId),
          entityType: entityType == null ? null : String(entityType),
          metadata: metadata == null ? null : safeJson(metadata),
        })
      )
      .catch((e) => {
        // Never break main flows for pilot analytics.
        console.warn('[user_events] record failed:', e?.message || e);
      });
  } catch {
    // swallow
  }
}

module.exports = {
  logUserEvent,
  ALLOWED_EVENT_TYPES,
};

