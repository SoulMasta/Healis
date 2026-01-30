const STORAGE_KEY = 'healis.notifications.feed.v1';

function safeParseJson(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function loadNotificationFeed() {
  const raw = window.localStorage.getItem(STORAGE_KEY);
  const parsed = raw ? safeParseJson(raw) : null;
  if (!Array.isArray(parsed)) return [];
  return parsed.filter(Boolean);
}

export function pushNotificationFeed(item) {
  const list = loadNotificationFeed();
  const next = [
    ...list,
    {
      id: String(item?.id || `${Date.now()}-${Math.random().toString(16).slice(2)}`),
      kind: String(item?.kind || 'info'),
      title: String(item?.title || ''),
      message: String(item?.message || ''),
      createdAt: Number(item?.createdAt || Date.now()),
      meta: item?.meta ?? null,
    },
  ].slice(-50);
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  window.dispatchEvent(new Event('healis:notificationFeed'));
  return next;
}

export const NOTIFICATION_FEED_STORAGE_KEY = STORAGE_KEY;

