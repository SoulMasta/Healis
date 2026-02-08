const MAX_PREVIEW_CHARS = 2200;

export function isAbsoluteUrl(url) {
  return /^https?:\/\//i.test(String(url || ''));
}

export function resolvePublicFileUrl(urlRaw, apiBaseUrl) {
  const url = String(urlRaw || '').trim();
  if (!url) return '';
  if (isAbsoluteUrl(url) || url.startsWith('data:') || url.startsWith('blob:')) return url;
  if (url.startsWith('/uploads/') && apiBaseUrl) return `${String(apiBaseUrl).replace(/\/+$/, '')}${url}`;
  return url;
}

export async function fetchTextPreview(urlRaw, { timeoutMs = 8000 } = {}) {
  const url = String(urlRaw || '').trim();
  if (!url) return '';
  const controller = new AbortController();
  const t = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    // Prefer a small range read for speed on large files.
    const res = await fetch(url, {
      method: 'GET',
      headers: { Range: 'bytes=0-8191' },
      signal: controller.signal,
      credentials: 'include',
    });
    const text = await res.text();
    return String(text || '').replace(/\r\n/g, '\n').slice(0, MAX_PREVIEW_CHARS);
  } catch {
    return '';
  } finally {
    window.clearTimeout(t);
  }
}
