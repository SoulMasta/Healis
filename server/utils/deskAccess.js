const { GroupMember } = require('../models/models');

async function getGroupRole(groupId, userId) {
  if (!groupId || !userId) return null;
  const m = await GroupMember.findOne({ where: { groupId, userId, status: 'ACTIVE' } });
  return m?.role || null;
}

async function canReadDesk(desk, userId) {
  if (!desk || !userId) return false;
  if (desk.userId === userId) return true;
  if (!desk.groupId) return false;
  const role = await getGroupRole(desk.groupId, userId);
  return Boolean(role);
}

async function canManageDesk(desk, userId) {
  if (!desk || !userId) return false;
  if (desk.userId === userId) return true;
  if (!desk.groupId) return false;
  const role = await getGroupRole(desk.groupId, userId);
  return Boolean(role); // any active group member can edit the board
}

module.exports = {
  getGroupRole,
  canReadDesk,
  canManageDesk,
};


