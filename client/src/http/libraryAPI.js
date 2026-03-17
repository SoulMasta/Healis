import axios from 'axios';

const API_BASE = '/api/library';

export async function getSubjects(faculty, course) {
  const res = await axios.get(`${API_BASE}/subjects`, { params: { faculty, course } });
  return Array.isArray(res.data) ? res.data : [];
}

export async function createSubjects(faculty, course, subjects) {
  const res = await axios.post(`${API_BASE}/subjects`, { faculty, course, subjects });
  return Array.isArray(res.data) ? res.data : [];
}

export async function getSubjectCategories(subjectId) {
  const res = await axios.get(`${API_BASE}/subjects/${subjectId}/categories`);
  return Array.isArray(res.data) ? res.data : [];
}

export async function getBoards(params) {
  const res = await axios.get(`${API_BASE}/boards`, { params });
  return Array.isArray(res.data) ? res.data : [];
}

export async function getPopular() {
  const res = await axios.get(`${API_BASE}/popular`);
  return Array.isArray(res.data) ? res.data : [];
}

