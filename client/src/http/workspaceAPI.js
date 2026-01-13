import axios from 'axios';

const API_BASE = '/workspace';

export async function getAllWorkspaces(userId) {
  const params = userId ? { userId } : {};
  const res = await axios.get(`${API_BASE}/desk`, { params });
  return res.data;
}

export async function getWorkspace(id) {
  const res = await axios.get(`${API_BASE}/desk/${id}`);
  return res.data;
}

export async function createWorkspace({ name, description, userId, type }) {
  const res = await axios.post(`${API_BASE}/desk`, { name, description, userId, type });
  return res.data;
}

export async function updateWorkspace(id, data) {
  const res = await axios.put(`${API_BASE}/desk/${id}`, data);
  return res.data;
}

export async function deleteWorkspace(id) {
  const res = await axios.delete(`${API_BASE}/desk/${id}`);
  return res.data;
}

