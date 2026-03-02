import axios from 'axios';

export const USER_EVENT_TYPES = Object.freeze({
  login: 'login',
  open_material: 'open_material',
  create_material: 'create_material',
  edit_material: 'edit_material',
  upload_file: 'upload_file',
  view_file: 'view_file',
  like_material: 'like_material',
});

/**
 * Best-effort pilot event recorder.
 * - never throws
 * - callers should NOT await (non-blocking)
 */
export function recordUserEvent({ eventType, entityId = null, entityType = null, metadata = null } = {}) {
  try {
    if (!eventType) return;
    // Fire-and-forget: axios promise is handled to avoid unhandled rejection noise.
    Promise.resolve(
      axios.post('/api/user/events', {
        eventType,
        entityId,
        entityType,
        metadata,
      })
    ).catch(() => {});
  } catch {
    // swallow
  }
}

