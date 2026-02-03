import axios from 'axios';

const API_BASE = '/api/notifications';

export async function listMyNotifications({ limit = 30, offset = 0, unread = false } = {}) {
  const res = await axios.get(`${API_BASE}/my`, {
    params: {
      limit,
      offset,
      unread: unread ? 1 : undefined,
    },
  });
  return res.data;
}

export async function markNotificationRead(id) {
  const res = await axios.post(`${API_BASE}/${id}/read`);
  return res.data;
}

