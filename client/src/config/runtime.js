const DEFAULT_PROD_API_URL = 'https://healis-production.up.railway.app';

function normalizeUrl(url) {
  const s = String(url || '').trim();
  if (!s) return '';
  // Remove trailing slashes for safe concatenation.
  return s.replace(/\/+$/, '');
}

function isLikelyVercelHost(hostname) {
  return typeof hostname === 'string' && (hostname.endsWith('.vercel.app') || hostname.includes('vercel.app'));
}

export function getApiBaseUrl() {
  // When frontend is on Vercel, always use Railway backend (avoids stale REACT_APP_API_URL pointing to Render).
  if (typeof window !== 'undefined' && isLikelyVercelHost(window.location.hostname)) {
    return DEFAULT_PROD_API_URL;
  }
  const fromEnv = normalizeUrl(process.env.REACT_APP_API_URL);
  if (fromEnv) return fromEnv;
  return '';
}

export function getSocketBaseUrl() {
  // When frontend is on Vercel, socket must use Railway (same as API); ignore stale REACT_APP_SOCKET_URL.
  if (typeof window !== 'undefined' && isLikelyVercelHost(window.location.hostname)) {
    return DEFAULT_PROD_API_URL;
  }
  const fromEnv = normalizeUrl(process.env.REACT_APP_SOCKET_URL);
  if (fromEnv) return fromEnv;
  const api = getApiBaseUrl();
  if (api) return api;

  // Dev convenience: CRA on :3000, backend on :5000.
  if (typeof window !== 'undefined') {
    if (window.location.port === '3000') {
      return `${window.location.protocol}//${window.location.hostname}:5000`;
    }
    return window.location.origin;
  }

  return '';
}

/** Resolve upload/avatar URL for img src: relative paths go to API origin when cross-origin. */
export function resolveUploadUrl(url) {
  if (!url || !String(url).trim()) return '';
  const s = String(url).trim();
  if (/^https?:\/\//i.test(s)) return s;
  const base = getApiBaseUrl();
  return base ? `${normalizeUrl(base)}${s.startsWith('/') ? s : `/${s}`}` : s;
}

