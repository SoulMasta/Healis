let ioRef = null;

function setIo(io) {
  ioRef = io || null;
}

function emitToUser(userId, event, payload) {
  if (!ioRef) return;
  if (!userId) return;
  ioRef.to(`user:${userId}`).emit(event, payload);
}

function emitToDesk(deskId, event, payload) {
  if (!ioRef) return;
  if (!deskId) return;
  ioRef.to(`desk:${deskId}`).emit(event, payload);
}

module.exports = {
  setIo,
  emitToUser,
  emitToDesk,
};


