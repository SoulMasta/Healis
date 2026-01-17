const net = require('net');
const http = require('http');
const https = require('https');
const zlib = require('zlib');

function normalizeUrl(input) {
  const raw = String(input || '').trim();
  if (!raw) return null;
  const withProto = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(raw) ? raw : `https://${raw}`;
  let u;
  try {
    u = new URL(withProto);
  } catch {
    return null;
  }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
  return u.toString();
}

function isBlockedHost(hostname) {
  const h = String(hostname || '').toLowerCase();
  if (!h) return true;
  if (h === 'localhost' || h.endsWith('.localhost')) return true;

  const ipType = net.isIP(h);
  if (!ipType) return false;
  // Block loopback and common private ranges for basic SSRF safety.
  if (h === '127.0.0.1' || h === '0.0.0.0' || h === '::1') return true;
  if (h.startsWith('10.')) return true;
  if (h.startsWith('192.168.')) return true;
  if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(h)) return true;
  return false;
}

function stripTags(s) {
  return String(s || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function decodeHtmlEntities(s) {
  return String(s || '')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function findMetaContent(html, key) {
  if (!html) return null;
  const k = String(key || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // Match both <meta property="og:.." content=".."> and content first.
  const r1 = new RegExp(`<meta[^>]+(?:property|name)=["']${k}["'][^>]+content=["']([^"']+)["'][^>]*>`, 'i');
  const r2 = new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${k}["'][^>]*>`, 'i');
  const m = html.match(r1) || html.match(r2);
  if (!m) return null;
  return decodeHtmlEntities(stripTags(m[1])).slice(0, 300);
}

function findTitleTag(html) {
  const m = String(html || '').match(/<title[^>]*>([\s\S]{1,300}?)<\/title>/i);
  if (!m) return null;
  return decodeHtmlEntities(stripTags(m[1])).slice(0, 300);
}

function findFaviconHref(html) {
  const s = String(html || '');
  // Prefer explicit icons; accept rel="icon" / "shortcut icon" / "apple-touch-icon"
  const m =
    s.match(/<link[^>]+rel=["'][^"']*(?:icon|shortcut icon|apple-touch-icon)[^"']*["'][^>]+href=["']([^"']+)["'][^>]*>/i) ||
    s.match(/<link[^>]+href=["']([^"']+)["'][^>]+rel=["'][^"']*(?:icon|shortcut icon|apple-touch-icon)[^"']*["'][^>]*>/i);
  if (!m) return null;
  return decodeHtmlEntities(m[1]).trim();
}

function absolutizeUrl(maybeRelative, baseUrl) {
  const raw = String(maybeRelative || '').trim();
  if (!raw) return null;
  try {
    return new URL(raw, baseUrl).toString();
  } catch {
    return null;
  }
}

async function fetchHtmlWithLimits(url, timeoutMs = 4500, maxChars = 250_000) {
  const maxBytes = Math.max(10_000, Number(maxChars) * 4); // UTF-8 worst-case-ish; still bounded.
  const headers = {
    'user-agent': 'healis-link-preview/1.0',
    accept: 'text/html,application/xhtml+xml',
  };

  function decodeStream(res) {
    const enc = String(res.headers['content-encoding'] || '').toLowerCase().trim();
    if (!enc || enc === 'identity') return res;
    if (enc.includes('br') && zlib.createBrotliDecompress) return res.pipe(zlib.createBrotliDecompress());
    if (enc.includes('gzip')) return res.pipe(zlib.createGunzip());
    if (enc.includes('deflate')) return res.pipe(zlib.createInflate());
    // Unknown encoding -> just pass through (parsing will likely fail but we won't crash).
    return res;
  }

  function requestOnce(currentUrl) {
    return new Promise((resolve) => {
      let u;
      try {
        u = new URL(currentUrl);
      } catch (e) {
        resolve({
          ok: false,
          finalUrl: currentUrl,
          statusCode: 0,
          headers: {},
          redirectLocation: null,
          html: '',
          contentType: '',
          error: e?.message || String(e),
        });
        return;
      }

      const lib = u.protocol === 'https:' ? https : http;
      const req = lib.request(
        u,
        {
          method: 'GET',
          headers,
        },
        (res) => {
          const statusCode = Number(res.statusCode || 0);
          const location = res.headers.location;
          const contentType = String(res.headers['content-type'] || '').toLowerCase();
          let resolved = false;

          // Handle redirects (caller decides whether to follow).
          if (statusCode >= 300 && statusCode < 400 && location) {
            res.resume();
            resolved = true;
            resolve({
              ok: true,
              finalUrl: currentUrl,
              statusCode,
              headers: res.headers,
              redirectLocation: location,
              html: '',
              contentType,
            });
            return;
          }

          // Not HTML -> we still consider it ok, but return empty html (fallback to hostname).
          if (!contentType.includes('text/html')) {
            res.resume();
            resolved = true;
            resolve({
              ok: statusCode >= 200 && statusCode < 300,
              finalUrl: currentUrl,
              statusCode,
              headers: res.headers,
              redirectLocation: null,
              html: '',
              contentType,
            });
            return;
          }

          const stream = decodeStream(res);
          const chunks = [];
          let total = 0;
          stream.on('data', (chunk) => {
            total += chunk.length;
            if (total > maxBytes) {
              if (resolved) return;
              resolved = true;
              // Best-effort: resolve with whatever we already buffered.
              try {
                stream.removeAllListeners('data');
                stream.removeAllListeners('end');
              } catch {
                // ignore
              }
              try {
                res.destroy();
              } catch {
                // ignore
              }
              const buf = Buffer.concat(chunks);
              const text = buf.toString('utf8');
              resolve({
                ok: statusCode >= 200 && statusCode < 300,
                finalUrl: currentUrl,
                statusCode,
                headers: res.headers,
                redirectLocation: null,
                html: text.length > maxChars ? text.slice(0, maxChars) : text,
                contentType,
              });
              return;
            }
            chunks.push(chunk);
          });
          stream.on('end', () => {
            if (resolved) return;
            resolved = true;
            const buf = Buffer.concat(chunks);
            const text = buf.toString('utf8');
            resolve({
              ok: statusCode >= 200 && statusCode < 300,
              finalUrl: currentUrl,
              statusCode,
              headers: res.headers,
              redirectLocation: null,
              html: text.length > maxChars ? text.slice(0, maxChars) : text,
              contentType,
            });
          });
          stream.on('error', (err) => {
            if (resolved) return;
            resolved = true;
            resolve({
              ok: false,
              finalUrl: currentUrl,
              statusCode,
              headers: res.headers,
              redirectLocation: null,
              html: '',
              contentType,
              error: err?.message || String(err),
            });
          });
        }
      );

      req.on('error', (err) =>
        resolve({
          ok: false,
          finalUrl: currentUrl,
          statusCode: 0,
          headers: {},
          redirectLocation: null,
          html: '',
          contentType: '',
          error: err?.message || String(err),
        })
      );
      req.setTimeout(timeoutMs, () => {
        try {
          req.destroy(new Error('Timeout'));
        } catch {
          // ignore
        }
      });
      req.end();
    });
  }

  // Follow a few redirects manually so we can re-apply SSRF checks.
  let current = url;
  let lastResult = { ok: false, finalUrl: url, html: '' };
  for (let i = 0; i < 5; i += 1) {
    // Validate each hop.
    const hop = new URL(current);
    if (hop.protocol !== 'http:' && hop.protocol !== 'https:') {
      return { ok: false, finalUrl: current, html: '' };
    }
    if (isBlockedHost(hop.hostname)) {
      return { ok: false, finalUrl: current, html: '' };
    }

    // eslint-disable-next-line no-await-in-loop
    const res = await requestOnce(current);
    lastResult = { ok: Boolean(res.ok), finalUrl: res.finalUrl || current, html: res.html || '' };

    if (res.redirectLocation) {
      const next = absolutizeUrl(res.redirectLocation, current);
      if (!next) break;
      current = next;
      continue;
    }

    break;
  }

  return lastResult;
}

class LinkPreviewController {
  async preview(req, res) {
    try {
      const userId = req.user?.id;
      if (!userId) return res.status(401).json({ error: 'Not authorized' });

      const inputUrl = req.body?.url;
      const url = normalizeUrl(inputUrl);
      if (!url) return res.status(400).json({ error: 'Invalid url' });

      const u = new URL(url);
      if (isBlockedHost(u.hostname)) return res.status(400).json({ error: 'Blocked url host' });

      const { finalUrl, html } = await fetchHtmlWithLimits(url);

      const ogTitle = findMetaContent(html, 'og:title');
      const twTitle = findMetaContent(html, 'twitter:title');
      const titleTag = findTitleTag(html);
      const title = ogTitle || twTitle || titleTag || u.hostname;

      const ogImage = findMetaContent(html, 'og:image');
      const twImage = findMetaContent(html, 'twitter:image');
      const favHref = findFaviconHref(html);

      const previewImageUrl =
        absolutizeUrl(ogImage || twImage, finalUrl) ||
        absolutizeUrl(favHref, finalUrl) ||
        absolutizeUrl('/favicon.ico', finalUrl) ||
        null;

      return res.json({
        url: finalUrl || url,
        title,
        previewImageUrl,
      });
    } catch (error) {
      return res.status(500).json({ error: error.message });
    }
  }
}

module.exports = new LinkPreviewController();


