import React from 'react';
import { File, FileArchive, FileImage, FileSpreadsheet, FileText } from 'lucide-react';

export const TEXT_PREVIEW_EXTS = new Set(['txt', 'md', 'csv', 'rtf']);

function escapeRegExp(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

let __fitMeasurerEl = null;
export function getFitMeasurerEl() {
  if (typeof document === 'undefined') return null;
  if (__fitMeasurerEl && document.body?.contains(__fitMeasurerEl)) return __fitMeasurerEl;
  const m = document.createElement('div');
  m.setAttribute('data-fit-measurer', 'true');
  Object.assign(m.style, {
    position: 'fixed',
    left: '-99999px',
    top: '-99999px',
    visibility: 'hidden',
    pointerEvents: 'none',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
    overflowWrap: 'break-word',
    padding: '0',
    margin: '0',
    border: '0',
    boxSizing: 'border-box',
  });
  document.body.appendChild(m);
  __fitMeasurerEl = m;
  return m;
}

export function pointsToSvgPath(points = []) {
  if (!Array.isArray(points) || points.length === 0) return '';
  if (points.length === 1) {
    const p = points[0];
    return `M ${p.x} ${p.y} L ${p.x + 0.01} ${p.y + 0.01}`;
  }
  const [p0, ...rest] = points;
  return `M ${p0.x} ${p0.y} ${rest.map((p) => `L ${p.x} ${p.y}`).join(' ')}`;
}

export function getExt(nameOrUrl) {
  const s = String(nameOrUrl || '').split('?')[0].split('#')[0];
  const m = s.match(/\.([a-z0-9]+)$/i);
  return (m?.[1] || '').toLowerCase();
}

export function isPhotoExt(ext) {
  const e = String(ext || '').toLowerCase();
  return e === 'png' || e === 'jpg' || e === 'jpeg';
}

export function normalizeUrlClient(input) {
  const raw = String(input || '').trim();
  if (!raw) return '';
  const withProto = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(raw) ? raw : `https://${raw}`;
  try {
    const u = new URL(withProto);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return raw;
    return u.toString();
  } catch {
    return raw;
  }
}

export function safeHostname(inputUrl) {
  try {
    const u = new URL(normalizeUrlClient(inputUrl));
    return u.hostname;
  } catch {
    return '';
  }
}

export function fixMojibakeNameClient(name) {
  const s = String(name || '');
  const looksMojibake = /[ÐÑ]/.test(s) && !/[А-Яа-яЁё]/.test(s);
  if (!looksMojibake) return s;
  try {
    const bytes = Uint8Array.from(Array.from(s, (ch) => ch.charCodeAt(0)));
    return new TextDecoder('utf-8').decode(bytes);
  } catch {
    return s;
  }
}

export function pickDocIcon(ext) {
  if (['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'svg'].includes(ext)) return FileImage;
  if (['xls', 'xlsx', 'csv'].includes(ext)) return FileSpreadsheet;
  if (['zip', 'rar', '7z'].includes(ext)) return FileArchive;
  if (!ext) return File;
  return FileText;
}

export function renderHighlightedText(text, query, markClassName) {
  const s = String(text ?? '');
  const q = String(query ?? '').trim();
  if (!q) return s;

  const re = new RegExp(escapeRegExp(q), 'ig');
  const nodes = [];
  let last = 0;
  let m = null;
  let key = 0;
  while ((m = re.exec(s))) {
    const start = m.index;
    const end = start + m[0].length;
    if (start > last) nodes.push(<React.Fragment key={`t-${key++}`}>{s.slice(last, start)}</React.Fragment>);
    nodes.push(
      <mark key={`m-${key++}`} className={markClassName}>
        {s.slice(start, end)}
      </mark>
    );
    last = end;
    if (end === start) re.lastIndex++;
  }
  if (last < s.length) nodes.push(<React.Fragment key={`t-${key++}`}>{s.slice(last)}</React.Fragment>);
  return nodes.length === 1 ? nodes[0] : <>{nodes}</>;
}
