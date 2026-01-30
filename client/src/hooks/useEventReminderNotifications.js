import { useEffect, useRef } from 'react';
import { getMyCalendar } from '../http/calendarAPI';
import { getToken } from '../http/userAPI';
import { loadPreferences } from '../utils/preferences';
import { toast } from '../utils/toast';
import { pushNotificationFeed } from '../utils/notificationFeed';

const SENT_KEY = 'healis.eventReminders.sent.v1';

function safeParseJson(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

function monthParam(d) {
  const dt = d instanceof Date ? d : new Date();
  return `${dt.getFullYear()}-${pad2(dt.getMonth() + 1)}`;
}

function startOfLocalDay(d) {
  const dt = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(dt.getTime())) return null;
  return new Date(dt.getFullYear(), dt.getMonth(), dt.getDate());
}

function daysUntil(isoStartsAt, now = new Date()) {
  const a = startOfLocalDay(now);
  const b = startOfLocalDay(new Date(isoStartsAt));
  if (!a || !b) return null;
  const diff = (b.getTime() - a.getTime()) / 86400000;
  // Robust for DST shifts: round to nearest day boundary.
  return Math.round(diff);
}

function eventKey(ev) {
  const id = ev?.id ?? ev?.eventId;
  if (id !== undefined && id !== null && String(id)) return `id:${String(id)}`;
  return `t:${String(ev?.title || '')}|s:${String(ev?.startsAt || '')}`;
}

function loadSent() {
  const raw = window.localStorage.getItem(SENT_KEY);
  const parsed = raw ? safeParseJson(raw) : null;
  if (!parsed || typeof parsed !== 'object') return {};
  return parsed;
}

function saveSent(next) {
  window.localStorage.setItem(SENT_KEY, JSON.stringify(next || {}));
}

function reminderLabel(days) {
  if (days === 1) return 'за 1 день';
  return `за ${days} дней`;
}

function buildTitle(ev) {
  const title = String(ev?.title || '').trim();
  return title || 'Событие';
}

function buildBody(ev, days) {
  const dt = new Date(ev?.startsAt);
  const when = Number.isNaN(dt.getTime())
    ? ''
    : new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: '2-digit' }).format(dt);
  const subject = String(ev?.subject || '').trim();
  const parts = [];
  parts.push(`Напоминание: «${buildTitle(ev)}» ${reminderLabel(days)}.`);
  if (subject) parts.push(`Предмет: ${subject}.`);
  if (when) parts.push(`Дата: ${when}.`);
  return parts.join('\n');
}

function tryBrowserNotification(title, body) {
  try {
    if (!('Notification' in window)) return;
    if (window.Notification.permission !== 'granted') return;
    // eslint-disable-next-line no-new
    new window.Notification(title, { body });
  } catch {
    // ignore
  }
}

export function useEventReminderNotifications() {
  const runningRef = useRef(false);

  useEffect(() => {
    const tick = async () => {
      if (runningRef.current) return;
      runningRef.current = true;
      try {
        const prefs = loadPreferences();
        if (!prefs.notifications) return;
        if (!getToken()) return;

        const now = new Date();
        const thisMonth = monthParam(now);
        const nextMonth = monthParam(new Date(now.getFullYear(), now.getMonth() + 1, 1));

        const [a, b] = await Promise.all([getMyCalendar({ month: thisMonth }), getMyCalendar({ month: nextMonth })]);

        const rows = [];
        for (const data of [a, b]) {
          const confirmed = Array.isArray(data?.confirmed) ? data.confirmed : [];
          for (const row of confirmed) rows.push(row?.event);
          const mine = Array.isArray(data?.myEvents) ? data.myEvents : [];
          for (const ev of mine) rows.push(ev);
        }

        const sent = loadSent();
        const thresholds = [7, 3, 1];

        for (const ev of rows.filter(Boolean)) {
          const d = daysUntil(ev?.startsAt, now);
          if (d === null) continue;
          if (!thresholds.includes(d)) continue;
          if (d < 0) continue;

          const key = eventKey(ev);
          const prev = sent[key] && typeof sent[key] === 'object' ? sent[key] : {};
          if (prev[String(d)]) continue;

          const body = buildBody(ev, d);
          toast({
            kind: 'info',
            title: 'Ближайшее событие',
            message: body,
            durationMs: 7000,
          });
          tryBrowserNotification('Ближайшее событие', body);
          pushNotificationFeed({
            id: `reminder:${key}:${d}`,
            kind: 'calendar',
            title: 'Напоминание о событии',
            message: body,
            createdAt: Date.now(),
            meta: { eventKey: key, daysBefore: d, startsAt: ev?.startsAt, eventTitle: buildTitle(ev) },
          });

          sent[key] = { ...prev, [String(d)]: true, last: Date.now() };
        }

        saveSent(sent);
      } catch {
        // Silent: reminders should never break UI.
      } finally {
        runningRef.current = false;
      }
    };

    // Initial check + periodic checks while the app is open.
    tick();
    const intervalId = window.setInterval(tick, 60 * 60 * 1000);

    const onPref = () => tick();
    const onFocus = () => tick();
    window.addEventListener('healis:preferences', onPref);
    window.addEventListener('focus', onFocus);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener('healis:preferences', onPref);
      window.removeEventListener('focus', onFocus);
    };
  }, []);
}

