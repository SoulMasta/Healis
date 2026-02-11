import axios from 'axios';
import { uploadFile } from './uploadService';

const API_BASE = '/api/user';

// Access token only in memory (survives tab refresh via refresh cookie, no XSS via localStorage).
let accessToken = null;

function getDeviceId() {
  try {
    const s = localStorage.getItem('healis:deviceId');
    if (s) return s;
    const id = crypto.randomUUID ? crypto.randomUUID() : `d${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
    localStorage.setItem('healis:deviceId', id);
    return id;
  } catch {
    return null;
  }
}

function setAuthToken(token) {
  accessToken = token;
  if (token) {
    axios.defaults.headers.common.Authorization = `Bearer ${token}`;
  } else {
    delete axios.defaults.headers.common.Authorization;
  }
}

function notifyTokenChanged() {
  window.dispatchEvent(new Event('healis:token'));
}

export function getToken() {
  return accessToken;
}

export function logout() {
  accessToken = null;
  setAuthToken(null);
  notifyTokenChanged();
}

function authHeaders() {
  const h = { withCredentials: true };
  const did = getDeviceId();
  if (did) h.headers = { 'X-Device-Id': did };
  return h;
}

export async function registration(payload) {
  const res = await axios.post(`${API_BASE}/registration`, payload, authHeaders());
  const token = res.data?.token;
  if (token) {
    setAuthToken(token);
    notifyTokenChanged();
  }
  return res.data;
}

export async function login(email, password) {
  const res = await axios.post(`${API_BASE}/login`, { email, password }, authHeaders());
  const token = res.data?.token;
  if (token) {
    setAuthToken(token);
    notifyTokenChanged();
  }
  return res.data;
}

export async function googleAuth(credential) {
  const res = await axios.post(`${API_BASE}/google`, { credential }, authHeaders());
  const token = res.data?.token;
  if (token) {
    setAuthToken(token);
    notifyTokenChanged();
  }
  return res.data;
}

// Get a new access token using httpOnly refresh cookie (server rotates refresh token).
export async function refreshAuth() {
  const res = await axios.post(`${API_BASE}/refresh`, null, authHeaders());
  const newToken = res.data?.token;
  if (newToken) {
    setAuthToken(newToken);
    notifyTokenChanged();
  }
  return res.data;
}

export async function serverLogout() {
  try {
    await axios.post(`${API_BASE}/logout`, null, { withCredentials: true });
  } finally {
    logout();
  }
}

// --- Axios 401 auto-refresh: queue during refresh, no logout on network/5xx ---
let refreshInFlight = null;

function isAuthEndpoint(url) {
  const s = String(url || '');
  return (
    s.includes('/api/user/login') ||
    s.includes('/api/user/registration') ||
    s.includes('/api/user/google') ||
    s.includes('/api/user/refresh') ||
    s.includes('/api/user/logout')
  );
}

axios.interceptors.response.use(
  (resp) => resp,
  async (error) => {
    const status = error?.response?.status;
    const original = error?.config;
    const url = String(original?.url || '');

    if (!original || original._retry || isAuthEndpoint(url)) {
      return Promise.reject(error);
    }

    // 5xx / network: do not logout, let user retry.
    if (status && status >= 500) return Promise.reject(error);
    if (!error.response && error.code) return Promise.reject(error);

    if (status !== 401) return Promise.reject(error);

    original._retry = true;

    try {
      if (!refreshInFlight) {
        refreshInFlight = refreshAuth().finally(() => {
          refreshInFlight = null;
        });
      }
      await refreshInFlight;

      const token = getToken();
      if (token) {
        original.headers = original.headers || {};
        original.headers.Authorization = `Bearer ${token}`;
      }
      return axios(original);
    } catch (e) {
      // Only logout when refresh returned 401 (no valid refresh cookie). Never logout on 5xx/network.
      if (e?.response?.status === 401) logout();
      return Promise.reject(e);
    }
  }
);

export async function checkAuth() {
  const token = getToken();
  const opts = authHeaders();
  const res = await axios.get(`${API_BASE}/auth`, {
    ...opts,
    headers: { ...opts.headers, ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  });
  const newToken = res.data?.token;
  if (newToken) {
    setAuthToken(newToken);
    notifyTokenChanged();
  }
  return res.data;
}

function applyTokenFromResponse(data) {
  const newToken = data?.token;
  if (newToken) {
    setAuthToken(newToken);
    notifyTokenChanged();
  }
}

export async function getProfile() {
  const res = await axios.get(`${API_BASE}/profile`);
  return res.data;
}

export async function updateProfile(payload) {
  const res = await axios.patch(`${API_BASE}/profile`, payload);
  applyTokenFromResponse(res.data);
  return res.data;
}

/**
 * Upload an avatar to Supabase and save the URL to the backend
 * @param {File} file - Avatar image file
 * @param {Object} options - Upload options
 * @param {function} options.onProgress - Progress callback (0-100)
 * @returns {Promise<{profile: Object, token: string}>}
 */
export async function uploadAvatar(file, options = {}) {
  const { onProgress } = options;

  // Upload to Supabase Storage
  const uploaded = await uploadFile(file, {
    folder: 'avatars',
    onProgress,
    isAvatar: true,
  });

  // Save the URL to the backend
  const res = await axios.post(`${API_BASE}/avatar`, {
    avatarUrl: uploaded.url,
  });

  applyTokenFromResponse(res.data);
  return res.data;
}


