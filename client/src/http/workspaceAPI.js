import axios from 'axios';

const API_BASE = '/workspace';

function normalizeWorkspace(ws) {
  if (!ws || typeof ws !== 'object') return ws;
  // Backend model uses deskId as PK. Frontend historically expects `id`.
  if (ws.id == null && ws.deskId != null) return { ...ws, id: ws.deskId };
  return ws;
}

function normalizeWorkspaceList(list) {
  if (!Array.isArray(list)) return list;
  return list.map(normalizeWorkspace);
}

export async function getAllWorkspaces(userId) {
  // Backend derives userId from JWT; query param is ignored/unsupported now.
  const res = await axios.get(`${API_BASE}/desk`);
  return normalizeWorkspaceList(res.data);
}

export async function getWorkspace(id) {
  const res = await axios.get(`${API_BASE}/desk/${id}`);
  return normalizeWorkspace(res.data);
}

export async function getRecentWorkspaces() {
  const res = await axios.get(`${API_BASE}/desk/recent`);
  return normalizeWorkspaceList(res.data);
}

export async function getFavoriteWorkspaces() {
  const res = await axios.get(`${API_BASE}/desk/favorites`);
  return normalizeWorkspaceList(res.data);
}

export async function toggleFavoriteWorkspace(id) {
  const res = await axios.post(`${API_BASE}/desk/${id}/favorite`);
  return res.data; // { favorite: boolean }
}

export async function duplicateWorkspace(id) {
  const res = await axios.post(`${API_BASE}/desk/${id}/duplicate`);
  return normalizeWorkspace(res.data);
}

export async function createWorkspace({ name, description, userId, type }) {
  // Backend derives userId from JWT; do not send userId from client.
  const res = await axios.post(`${API_BASE}/desk`, { name, description, type });
  return normalizeWorkspace(res.data);
}

export async function updateWorkspace(id, data) {
  const res = await axios.put(`${API_BASE}/desk/${id}`, data);
  return normalizeWorkspace(res.data);
}

export async function deleteWorkspace(id) {
  const res = await axios.delete(`${API_BASE}/desk/${id}`);
  return res.data;
}

