import axios from 'axios';

const API_BASE = '/workspace';

function normalizeElement(el) {
  if (!el || typeof el !== 'object') return el;
  // Normalize ids for frontend convenience
  const out = { ...el };
  if (out.id == null && out.elementId != null) out.id = out.elementId;
  return out;
}

function normalizeElementList(list) {
  if (!Array.isArray(list)) return list;
  return list.map(normalizeElement);
}

export async function getElementsByDesk(deskId) {
  const res = await axios.get(`${API_BASE}/desk/${deskId}/elements`);
  return normalizeElementList(res.data);
}

export async function createElementOnDesk(deskId, data) {
  const res = await axios.post(`${API_BASE}/desk/${deskId}/elements`, data);
  return normalizeElement(res.data);
}

export async function updateElement(elementId, data) {
  const res = await axios.put(`${API_BASE}/elements/${elementId}`, data);
  return normalizeElement(res.data);
}

export async function deleteElement(elementId) {
  const res = await axios.delete(`${API_BASE}/elements/${elementId}`);
  return res.data;
}

export async function uploadFileToDesk(deskId, file) {
  const form = new FormData();
  form.append('file', file);
  const res = await axios.post(`${API_BASE}/desk/${deskId}/upload`, form);
  return res.data;
}

export async function getLinkPreview(url) {
  const res = await axios.post(`${API_BASE}/link/preview`, { url });
  return res.data;
}


