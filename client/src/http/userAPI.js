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

function notifyTokenChanged() {
  // storage event doesn't fire in the same tab, so we emit a custom event too.
  window.dispatchEvent(new Event('healis:token'));
}

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

// Initialize axios auth header on app load/refresh (so other API calls are authorized).
setAuthToken(getToken());

export function logout() {
  localStorage.removeItem(TOKEN_KEY);
  setAuthToken(null);
  notifyTokenChanged();
}

export async function registration(payload) {
  const res = await axios.post(`${API_BASE}/registration`, payload, { withCredentials: true });
  const token = res.data?.token;
  if (token) {
    localStorage.setItem(TOKEN_KEY, token);
    setAuthToken(token);
    notifyTokenChanged();
  }
  return res.data;
}

export async function login(email, password) {
  const res = await axios.post(`${API_BASE}/login`, { email, password }, { withCredentials: true });
  const token = res.data?.token;
  if (token) {
    localStorage.setItem(TOKEN_KEY, token);
    setAuthToken(token);
    notifyTokenChanged();
  }
  return res.data;
}

export async function googleAuth(credential) {
  const res = await axios.post(`${API_BASE}/google`, { credential }, { withCredentials: true });
  const token = res.data?.token;
  if (token) {
    localStorage.setItem(TOKEN_KEY, token);
    setAuthToken(token);
    notifyTokenChanged();
  }
  return res.data;
}

// Get a new access token using httpOnly refresh cookie (server rotates refresh token).
export async function refreshAuth() {
  const res = await axios.post(`${API_BASE}/refresh`, null, { withCredentials: true });
  const newToken = res.data?.token;
  if (newToken) {
    localStorage.setItem(TOKEN_KEY, newToken);
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

// --- Axios 401 auto-refresh (best-effort) ---
let refreshInFlight = null;
axios.interceptors.response.use(
  (resp) => resp,
  async (error) => {
    const status = error?.response?.status;
    const original = error?.config;

    // Do not loop on auth endpoints.
    const url = String(original?.url || '');
    const isAuthEndpoint =
      url.includes('/api/user/login') ||
      url.includes('/api/user/registration') ||
      url.includes('/api/user/google') ||
      url.includes('/api/user/refresh') ||
      url.includes('/api/user/logout');

    if (status !== 401 || !original || original._retry || isAuthEndpoint) {
      return Promise.reject(error);
    }

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
      logout();
      return Promise.reject(e);
    }
  }
);

export async function checkAuth() {
  const token = getToken();
  const res = await axios.get(`${API_BASE}/auth`, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
  const newToken = res.data?.token;
  if (newToken) {
    localStorage.setItem(TOKEN_KEY, newToken);
    setAuthToken(newToken);
    notifyTokenChanged();
  }
  return res.data;
}

function applyTokenFromResponse(data) {
  const newToken = data?.token;
  if (newToken) {
    localStorage.setItem(TOKEN_KEY, newToken);
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

export async function uploadAvatar(file) {
  const form = new FormData();
  form.append('avatar', file);
  const res = await axios.post(`${API_BASE}/avatar`, form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  applyTokenFromResponse(res.data);
  return res.data;
}


