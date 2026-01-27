import axios from 'axios';

const API_BASE = '/api/ai';

export async function getAiStatus() {
  const res = await axios.get(`${API_BASE}/status`);
  return res.data;
}

export async function summarizeDesk(deskId) {
  const res = await axios.post(`${API_BASE}/desks/${deskId}/summary`);
  return res.data;
}

export async function chatWithDesk(deskId, { message, history } = {}) {
  const res = await axios.post(`${API_BASE}/desks/${deskId}/chat`, { message, history });
  return res.data;
}


