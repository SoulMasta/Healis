const DEFAULT_PROD_API_URL = 'https://healis-production.up.railway.app';

function normalizeUrl(url) {
  const s = String(url || '').trim();
  if (!s) return '';
  return s.replace(/\/+$/, '');
}

function isRenderUrl(url) {
  return typeof url === 'string' && url.includes('onrender.com');
}

function isLikelyVercelHost(hostname) {
  return typeof hostname === 'string' && (hostname.endsWith('.vercel.app') || hostname.includes('vercel.app'));
}

function isProductionOrigin() {
  if (typeof window === 'undefined') return false;
  const { hostname, protocol } = window.location;
  return protocol === 'https:' && hostname !== 'localhost' && !hostname.startsWith('127.');
}

export function getApiBaseUrl() {
  const fromEnv = normalizeUrl(process.env.REACT_APP_API_URL);
  if (fromEnv && isRenderUrl(fromEnv)) return DEFAULT_PROD_API_URL;
  if (typeof window !== 'undefined' && isLikelyVercelHost(window.location.hostname)) return DEFAULT_PROD_API_URL;
  if (fromEnv) return fromEnv;
  if (isProductionOrigin()) return DEFAULT_PROD_API_URL;
  return '';
}

export function getSocketBaseUrl() {
  const fromEnv = normalizeUrl(process.env.REACT_APP_SOCKET_URL);
  if (fromEnv && isRenderUrl(fromEnv)) return DEFAULT_PROD_API_URL;
  if (typeof window !== 'undefined' && isLikelyVercelHost(window.location.hostname)) return DEFAULT_PROD_API_URL;
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

