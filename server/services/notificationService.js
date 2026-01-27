const { Notification } = require('../models/models');
const { emitToUser } = require('../realtime/bus');

async function createNotificationForUser({
  userId,
  type,
  title = null,
  body = null,
  payload = {},
  dedupeKey = null,
}) {
  if (!userId) return null;
  if (!type) throw new Error('type is required');

  let created = null;
  try {
    created = await Notification.create({
      userId,
      type: String(type),
      title: title == null ? null : String(title),
      body: body == null ? null : String(body),
      payload: payload && typeof payload === 'object' ? payload : {},
      dedupeKey: dedupeKey ? String(dedupeKey) : null,
    });
  } catch (e) {
    // Unique constraint on dedupeKey => already exists.
    if (e?.name === 'SequelizeUniqueConstraintError') return null;
    throw e;
  }

  // Realtime push to user's personal room.
  emitToUser(userId, 'notification:new', typeof created?.toJSON === 'function' ? created.toJSON() : created);
  return created;
}

module.exports = { createNotificationForUser };


