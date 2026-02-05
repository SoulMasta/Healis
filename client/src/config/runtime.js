const DEFAULT_PROD_API_URL = 'https://healis.onrender.com';

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
  const fromEnv = normalizeUrl(process.env.REACT_APP_API_URL);
  if (fromEnv) return fromEnv;

  // Helpful fallback for the common "frontend on Vercel, backend elsewhere" setup.
  // This keeps production working even if the env var wasn't configured.
  if (typeof window !== 'undefined' && isLikelyVercelHost(window.location.hostname)) {
    return DEFAULT_PROD_API_URL;
  }

  // Empty means: use same-origin (or CRA proxy in development).
  return '';
}

export function getSocketBaseUrl() {
  const fromEnv = normalizeUrl(process.env.REACT_APP_SOCKET_URL);
  if (fromEnv) return fromEnv;

  // Prefer API base if it exists (often same backend).
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

