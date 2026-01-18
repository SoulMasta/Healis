import axios from 'axios';

const API_BASE = '/workspace';

function normalizeComment(c) {
  if (!c || typeof c !== 'object') return c;
  // Ensure consistent id field (Sequelize uses `id` already, but keep safe).
  if (c.id == null && c.commentId != null) return { ...c, id: c.commentId };
  return c;
}

export async function getElementComments(elementId) {
  const res = await axios.get(`${API_BASE}/elements/${elementId}/comments`);
  return Array.isArray(res.data) ? res.data.map(normalizeComment) : [];
}

export async function createElementComment(elementId, text) {
  const res = await axios.post(`${API_BASE}/elements/${elementId}/comments`, { text });
  return normalizeComment(res.data);
}


