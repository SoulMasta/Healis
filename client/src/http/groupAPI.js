import axios from 'axios';

const API_BASE = '/api/groups';

function normalizeWorkspace(ws) {
  if (!ws || typeof ws !== 'object') return ws;
  if (ws.id == null && ws.deskId != null) return { ...ws, id: ws.deskId };
  return ws;
}

function normalizeWorkspaceList(list) {
  if (!Array.isArray(list)) return list;
  return list.map(normalizeWorkspace);
}

export async function getMyGroups() {
  const res = await axios.get(`${API_BASE}`);
  return res.data;
}

export async function getMyGroupInvites() {
  const res = await axios.get(`${API_BASE}/invites`);
  return res.data;
}

export async function getMyGroupJoinRequests() {
  const res = await axios.get(`${API_BASE}/requests`);
  return res.data;
}

export async function createGroup({ name, description }) {
  const res = await axios.post(`${API_BASE}`, { name, description });
  return res.data;
}

export async function updateGroup(groupId, { name, description }) {
  const res = await axios.put(`${API_BASE}/${groupId}`, { name, description });
  return res.data;
}

export async function deleteGroup(groupId) {
  const res = await axios.delete(`${API_BASE}/${groupId}`);
  return res.data;
}

export async function getGroupMembers(groupId) {
  const res = await axios.get(`${API_BASE}/${groupId}/members`);
  return res.data;
}

export async function getGroupJoinRequests(groupId) {
  const res = await axios.get(`${API_BASE}/${groupId}/requests`);
  return res.data;
}

export async function approveGroupJoinRequest(groupId, userId) {
  const res = await axios.post(`${API_BASE}/${groupId}/requests/${userId}/approve`);
  return res.data;
}

export async function denyGroupJoinRequest(groupId, userId) {
  const res = await axios.post(`${API_BASE}/${groupId}/requests/${userId}/deny`);
  return res.data;
}

export async function inviteToGroup(groupId, { username, email, userId } = {}) {
  const res = await axios.post(`${API_BASE}/${groupId}/invite`, { username, email, userId });
  return res.data;
}

export async function acceptGroupInvite(groupId) {
  const res = await axios.post(`${API_BASE}/${groupId}/invite/accept`);
  return res.data;
}

export async function declineGroupInvite(groupId) {
  const res = await axios.post(`${API_BASE}/${groupId}/invite/decline`);
  return res.data;
}

export async function setGroupMemberRole(groupId, userId, role) {
  const res = await axios.patch(`${API_BASE}/${groupId}/members/${userId}/role`, { role });
  return res.data;
}

export async function removeGroupMember(groupId, userId) {
  const res = await axios.delete(`${API_BASE}/${groupId}/members/${userId}`);
  return res.data;
}

export async function getGroupDesks(groupId) {
  const res = await axios.get(`${API_BASE}/${groupId}/desks`);
  const payload = res.data || {};
  return {
    ...payload,
    desks: normalizeWorkspaceList(payload.desks),
  };
}

export async function createGroupDesk(groupId, { name, description, type }) {
  const res = await axios.post(`${API_BASE}/${groupId}/desks`, { name, description, type });
  return normalizeWorkspace(res.data);
}

export async function joinGroupByCode(code) {
  const res = await axios.post(`${API_BASE}/join`, { code });
  return res.data;
}

export async function regenerateGroupInviteCode(groupId) {
  const res = await axios.post(`${API_BASE}/${groupId}/inviteCode/regenerate`);
  return res.data; // { inviteCode }
}


