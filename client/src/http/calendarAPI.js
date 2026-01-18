import axios from 'axios';

const API_BASE = '/api/calendar';

export async function getMyCalendar({ month, groupId } = {}) {
  const res = await axios.get(`${API_BASE}/my`, {
    params: {
      month,
      groupId: groupId || undefined,
    },
  });
  return res.data;
}

export async function respondToCalendarInvite(inviteId, status) {
  const res = await axios.post(`${API_BASE}/my/invites/${inviteId}/respond`, { status });
  return res.data;
}

export async function respondToCalendarPeriodInvite(inviteId, status) {
  const res = await axios.post(`${API_BASE}/my/period-invites/${inviteId}/respond`, { status });
  return res.data;
}

export async function createMyCalendarEvent(payload) {
  const res = await axios.post(`${API_BASE}/my/events`, payload);
  return res.data;
}

export async function deleteMyCalendarEvent(myEventId) {
  const res = await axios.delete(`${API_BASE}/my/events/${myEventId}`);
  return res.data;
}

export async function createGroupCalendarEvent(groupId, payload) {
  const res = await axios.post(`${API_BASE}/groups/${groupId}/events`, payload);
  return res.data;
}

export async function deleteGroupCalendarEvent(groupId, eventId) {
  const res = await axios.delete(`${API_BASE}/groups/${groupId}/events/${eventId}`);
  return res.data;
}

export async function getGroupCalendarEvents(groupId, { month, from, to } = {}) {
  const res = await axios.get(`${API_BASE}/groups/${groupId}/events`, { params: { month, from, to } });
  return res.data;
}

export async function createGroupCalendarPeriod(groupId, payload) {
  const res = await axios.post(`${API_BASE}/groups/${groupId}/periods`, payload);
  return res.data;
}

export async function deleteGroupCalendarPeriod(groupId, periodId) {
  const res = await axios.delete(`${API_BASE}/groups/${groupId}/periods/${periodId}`);
  return res.data;
}

export async function getGroupCalendarPeriods(groupId, { month, from, to } = {}) {
  const res = await axios.get(`${API_BASE}/groups/${groupId}/periods`, { params: { month, from, to } });
  return res.data;
}


