function normalize(s) {
  return String(s ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/**
 * Manual (non-AI) search index for board content.
 *
 * Design note (future AI assistant):
 * - Keep UI working off of "results" produced by a provider.
 * - Today the provider is a simple substring matcher over this index.
 * - Later we can swap provider to an AI-backed search that returns:
 *   - ranked results
 *   - match ranges / explanations
 *   - semantic similarity hits
 * without changing the UI contract much.
 */
export function buildManualBoardSearchIndex(elements = []) {
  const idx = [];
  for (const el of Array.isArray(elements) ? elements : []) {
    if (!el?.id || !el?.type) continue;

    if (el.type === 'note' || el.type === 'text') {
      const text = String(el.content ?? '');
      idx.push({
        elementId: el.id,
        elementType: el.type,
        field: 'content',
        label: 'Text',
        text,
        norm: normalize(text),
      });
      continue;
    }

    if (el.type === 'document') {
      const doc = el.document ?? el.Document ?? {};
      const title = String(doc?.title ?? '');
      const url = String(doc?.url ?? '');
      if (title) {
        idx.push({
          elementId: el.id,
          elementType: el.type,
          field: 'fileTitle',
          label: 'File name',
          text: title,
          norm: normalize(title),
        });
      }
      // We keep URL as a fallback field for future use (e.g. AI context or diagnostics).
      if (url) {
        idx.push({
          elementId: el.id,
          elementType: el.type,
          field: 'fileUrl',
          label: 'File URL',
          text: url,
          norm: normalize(url),
        });
      }
      continue;
    }

    if (el.type === 'link') {
      const link = el.link ?? el.Link ?? {};
      const title = String(link?.title ?? '');
      const url = String(link?.url ?? '');
      if (title) {
        idx.push({
          elementId: el.id,
          elementType: el.type,
          field: 'linkTitle',
          label: 'Link title',
          text: title,
          norm: normalize(title),
        });
      }
      if (url) {
        idx.push({
          elementId: el.id,
          elementType: el.type,
          field: 'linkUrl',
          label: 'Link URL',
          text: url,
          norm: normalize(url),
        });
      }
      continue;
    }

    if (el.type === 'frame') {
      const frame = el.frame ?? el.Frame ?? {};
      const title = String(frame?.title ?? 'Frame');
      idx.push({
        elementId: el.id,
        elementType: el.type,
        field: 'title',
        label: 'Frame',
        text: title,
        norm: normalize(title),
      });
      continue;
    }
  }
  return idx;
}

export function runManualBoardSearch(index = [], query = '', { limit = 40 } = {}) {
  const q = normalize(query);
  if (!q) return [];
  const hits = [];

  for (const entry of Array.isArray(index) ? index : []) {
    if (!entry?.elementId) continue;
    if (!entry?.norm || !entry.norm.includes(q)) continue;
    hits.push(entry);
    if (hits.length >= limit) break;
  }

  return hits;
}

export function makeSnippet(text, query, radius = 28) {
  const s = String(text ?? '');
  const q = normalize(query);
  if (!q) return s.slice(0, Math.max(0, radius * 2));
  const low = s.toLowerCase();
  const i = low.indexOf(q);
  if (i < 0) return s.slice(0, Math.max(0, radius * 2));
  const start = Math.max(0, i - radius);
  const end = Math.min(s.length, i + q.length + radius);
  const prefix = start > 0 ? '…' : '';
  const suffix = end < s.length ? '…' : '';
  return `${prefix}${s.slice(start, end)}${suffix}`;
}


