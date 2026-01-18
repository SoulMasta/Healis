function createPresenceStore() {
  // deskId -> userId -> Set(socketId)
  const desks = new Map();

  function ensureDesk(deskId) {
    if (!desks.has(deskId)) desks.set(deskId, new Map());
    return desks.get(deskId);
  }

  function add({ deskId, userId, socketId }) {
    const d = ensureDesk(deskId);
    if (!d.has(userId)) d.set(userId, new Set());
    d.get(userId).add(socketId);
  }

  function remove({ deskId, userId, socketId }) {
    const d = desks.get(deskId);
    if (!d) return;
    const set = d.get(userId);
    if (!set) return;
    set.delete(socketId);
    if (set.size === 0) d.delete(userId);
    if (d.size === 0) desks.delete(deskId);
  }

  function removeSocketEverywhere(socketId) {
    for (const [deskId, users] of desks.entries()) {
      for (const [userId, sockets] of users.entries()) {
        if (sockets.has(socketId)) {
          sockets.delete(socketId);
          if (sockets.size === 0) users.delete(userId);
        }
      }
      if (users.size === 0) desks.delete(deskId);
    }
  }

  function listUsers(deskId) {
    const d = desks.get(deskId);
    if (!d) return [];
    return Array.from(d.keys()).map((userId) => ({ userId }));
  }

  return {
    add,
    remove,
    removeSocketEverywhere,
    listUsers,
  };
}

module.exports = { createPresenceStore };


