import axios from 'axios';

const API_BASE = '/api/user';
const TOKEN_KEY = 'token';

function setAuthToken(token) {
  if (token) {
    axios.defaults.headers.common.Authorization = `Bearer ${token}`;
  } else {
    delete axios.defaults.headers.common.Authorization;
  }
}

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function logout() {
  localStorage.removeItem(TOKEN_KEY);
  setAuthToken(null);
}

export async function registration(email, password) {
  const res = await axios.post(`${API_BASE}/registration`, { email, password });
  const token = res.data?.token;
  if (token) {
    localStorage.setItem(TOKEN_KEY, token);
    setAuthToken(token);
  }
  return res.data;
}

export async function login(email, password) {
  const res = await axios.post(`${API_BASE}/login`, { email, password });
  const token = res.data?.token;
  if (token) {
    localStorage.setItem(TOKEN_KEY, token);
    setAuthToken(token);
  }
  return res.data;
}

export async function checkAuth() {
  const token = getToken();
  const res = await axios.get(`${API_BASE}/auth`, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
  const newToken = res.data?.token;
  if (newToken) {
    localStorage.setItem(TOKEN_KEY, newToken);
    setAuthToken(newToken);
  }
  return res.data;
}


