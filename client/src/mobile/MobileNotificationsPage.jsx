import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CalendarDays, Check, Users, X } from 'lucide-react';
import MobileLayout from './MobileLayout';
import styles from './MobileNotificationsPage.module.css';
import { getToken } from '../http/userAPI';
import {
  acceptGroupInvite,
  declineGroupInvite,
  getMyGroupInvites,
  getMyGroupJoinRequests,
  approveGroupJoinRequest,
  denyGroupJoinRequest,
} from '../http/groupAPI';
import { getMyCalendar, respondToCalendarInvite, respondToCalendarPeriodInvite } from '../http/calendarAPI';
import { listMyNotifications } from '../http/notificationsAPI';
import { loadNotificationFeed, NOTIFICATION_FEED_STORAGE_KEY } from '../utils/notificationFeed';
import { requestNotificationPermissionIfNeeded } from '../utils/systemNotification';
import { toast } from '../utils/toast';

function pad2(n) {
  return String(n).padStart(2, '0');
}

function monthParam(d) {
  const dt = d instanceof Date ? d : new Date();
  return `${dt.getFullYear()}-${pad2(dt.getMonth() + 1)}`;
}

function whenLabel(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(d);
}

function Tabs({ value, onChange }) {
  return (
    <div className={styles.tabs} role="tablist" aria-label="Фильтр">
      {[
        { id: 'all', label: 'Все' },
        { id: 'boards', label: 'Доски' },
        { id: 'calendar', label: 'Календарь' },
      ].map((t) => (
        <button
          key={t.id}
          type="button"
          className={`${styles.tabBtn} ${value === t.id ? styles.tabBtnActive : ''}`}
          onClick={() => onChange(t.id)}
          role="tab"
          aria-selected={value === t.id}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

function Card({ icon, title, subtitle, meta, actions }) {
  return (
    <div className={styles.card}>
      <div className={styles.cardRow}>
        <div className={styles.iconWrap} aria-hidden="true">
          {icon}
        </div>
        <div className={styles.cardMain}>
          <div className={styles.cardTitle}>{title}</div>
          {subtitle ? <div className={styles.cardSub}>{subtitle}</div> : null}
          {meta ? <div className={styles.cardMeta}>{meta}</div> : null}
        </div>
      </div>
      {actions ? <div className={styles.cardActions}>{actions}</div> : null}
    </div>
  );
}

export default function MobileNotificationsPage() {
  const [token, setToken] = useState(() => getToken());
  const [tab, setTab] = useState('all');
  const [loading, setLoading] = useState(false);
  const [feed, setFeed] = useState(() => loadNotificationFeed());
  const [serverNotifications, setServerNotifications] = useState([]);

  const [groupInvites, setGroupInvites] = useState([]);
  const [joinRequests, setJoinRequests] = useState([]);
  const [calendarPending, setCalendarPending] = useState([]);
  const [calendarPendingPeriods, setCalendarPendingPeriods] = useState([]);
  const [busyId, setBusyId] = useState(null);
  const invitesSeenRef = useRef(new Set());
  const invitesInitRef = useRef(false);

  useEffect(() => {
    const onToken = () => setToken(getToken());
    const onStorage = (e) => {
      if (e.key === 'token') setToken(e.newValue);
    };
    window.addEventListener('healis:token', onToken);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener('healis:token', onToken);
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  useEffect(() => {
    const refresh = () => setFeed(loadNotificationFeed());
    const onStorage = (e) => {
      if (e.key === NOTIFICATION_FEED_STORAGE_KEY) refresh();
    };
    window.addEventListener('healis:notificationFeed', refresh);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener('healis:notificationFeed', refresh);
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  const load = useCallback(async () => {
    if (!token) {
      setGroupInvites([]);
      setJoinRequests([]);
      setCalendarPending([]);
      setCalendarPendingPeriods([]);
      setServerNotifications([]);
      return;
    }
    setLoading(true);
    try {
      const [inv, req, cal, noti] = await Promise.all([
        getMyGroupInvites().catch(() => []),
        getMyGroupJoinRequests().catch(() => []),
        getMyCalendar({ month: monthParam(new Date()) }).catch(() => null),
        listMyNotifications({ limit: 50, offset: 0 }).catch(() => ({ notifications: [] })),
      ]);
      setGroupInvites(Array.isArray(inv) ? inv : []);
      setJoinRequests(Array.isArray(req) ? req : []);
      setCalendarPending(Array.isArray(cal?.pending) ? cal.pending : []);
      setCalendarPendingPeriods(Array.isArray(cal?.pendingPeriods) ? cal.pendingPeriods : []);
      setServerNotifications(Array.isArray(noti?.notifications) ? noti.notifications : []);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!token) return () => {};
    const onNew = () => load();
    window.addEventListener('healis:notification:new', onNew);
    return () => window.removeEventListener('healis:notification:new', onNew);
  }, [load, token]);

  useEffect(() => {
    if (!token) {
      invitesSeenRef.current = new Set();
      invitesInitRef.current = false;
      return;
    }
    const seen = invitesSeenRef.current || new Set();
    const rows = Array.isArray(groupInvites) ? groupInvites : [];
    const ids = rows.map((r) => `g:${r?.groupId || r?.id}`).filter(Boolean);
    const next = new Set(ids);

    // Avoid toast spam on first load.
    if (!invitesInitRef.current) {
      invitesInitRef.current = true;
      invitesSeenRef.current = next;
      return;
    }

    const newlyAdded = ids.filter((id) => !seen.has(id));
    if (newlyAdded.length) {
      const first = rows.find((r) => `g:${r?.groupId || r?.id}` === newlyAdded[0]);
      toast({
        kind: 'info',
        title: 'Новое приглашение',
        message: first?.group?.name ? `Вас пригласили в группу «${first.group.name}».` : 'Вас пригласили в группу.',
        durationMs: 7000,
      });
    }
    invitesSeenRef.current = next;
  }, [groupInvites, token]);

  const items = useMemo(() => {
    const out = [];

    // Persistent server inbox (single message, no "Upcoming event", no read button).
    for (const n of Array.isArray(serverNotifications) ? serverNotifications.slice(0, 50) : []) {
      const title = String(n?.title || '').trim();
      if (/upcoming\s+event/i.test(title)) continue;
      const payload = n?.payload || {};
      const isCalendar = String(n?.type || '').toUpperCase().includes('CALENDAR');
      const createdAt = n?.createdAt ? new Date(n.createdAt) : null;
      const createdLabel = createdAt && !Number.isNaN(createdAt.getTime()) ? whenLabel(createdAt.toISOString()) : '';
      const event = payload?.event || {};
      const startsAt = event?.startsAt;
      const when = startsAt ? whenLabel(startsAt) : '';
      const meta = [when, createdLabel].filter(Boolean).join(' • ');
      out.push({
        kind: isCalendar ? 'calendar' : 'boards',
        id: `sn-${n?.id}`,
        title: title || (isCalendar ? 'Календарь' : 'Уведомление'),
        subtitle: String(n?.body || '').trim() || String(event?.title || '').trim(),
        meta: meta || undefined,
        icon: <CalendarDays size={18} />,
        actions: undefined,
      });
    }

    // In-app reminder feed (e.g. calendar reminders).
    for (const row of Array.isArray(feed) ? feed.slice().reverse().slice(0, 20) : []) {
      const meta = row?.meta || {};
      const startsAt = meta?.startsAt;
      const d = meta?.daysBefore;
      const when = startsAt ? whenLabel(startsAt) : '';
      const before = d === 1 ? 'за 1 день' : d ? `за ${d} дней` : '';
      out.push({
        kind: row?.kind === 'boards' ? 'boards' : 'calendar',
        id: String(row?.id || Math.random()),
        title: row?.title || 'Уведомление',
        subtitle: meta?.eventTitle || '',
        meta: [before, when].filter(Boolean).join(' • ') || row?.message,
        icon: <CalendarDays size={18} />,
      });
    }

    for (const row of groupInvites) {
      const gId = row?.groupId;
      out.push({
        kind: 'boards',
        id: `gi-${gId || row?.id || Math.random()}`,
        title: 'Приглашение в группу',
        subtitle: row?.group?.name || row?.name || 'Группа',
        meta: 'Можно принять или отклонить прямо здесь.',
        icon: <Users size={18} />,
        actions: { groupInvite: true, groupId: gId },
      });
    }

    for (const r of joinRequests) {
      const gId = r?.groupId;
      const uId = r?.userId || r?.user?.id;
      out.push({
        kind: 'boards',
        id: `jr-${gId}-${uId}`,
        title: 'Запрос на вступление',
        subtitle: r?.user?.email || r?.email || `Пользователь #${uId || '—'}`,
        meta: r?.group?.name || r?.groupName || (gId ? `Группа #${gId}` : ''),
        icon: <Users size={18} />,
        actions: { groupId: gId, userId: uId },
      });
    }

    for (const row of calendarPendingPeriods) {
      const p = row?.period;
      out.push({
        kind: 'calendar',
        id: `cp-${row?.inviteId}`,
        title: p?.title || 'Период',
        subtitle: 'Приглашение в календарь',
        meta: whenLabel(p?.startsAt),
        icon: <CalendarDays size={18} />,
        actions: { inviteId: row?.inviteId, period: true },
      });
    }

    for (const row of calendarPending) {
      const ev = row?.event;
      out.push({
        kind: 'calendar',
        id: `ce-${row?.inviteId}`,
        title: ev?.title || 'Событие',
        subtitle: 'Приглашение в календарь',
        meta: whenLabel(ev?.startsAt),
        icon: <CalendarDays size={18} />,
        actions: { inviteId: row?.inviteId, period: false },
      });
    }

    return out;
  }, [calendarPending, calendarPendingPeriods, feed, groupInvites, joinRequests, serverNotifications]);

  const filtered = useMemo(() => {
    if (tab === 'all') return items;
    return items.filter((x) => x.kind === tab);
  }, [items, tab]);

  const approve = async ({ groupId, userId }) => {
    if (!groupId || !userId) return;
    setBusyId(`jr-${groupId}-${userId}`);
    try {
      await approveGroupJoinRequest(groupId, userId);
      await load();
    } catch (e) {
      // eslint-disable-next-line no-alert
      alert(e?.response?.data?.error || e?.message || 'Не удалось одобрить');
    } finally {
      setBusyId(null);
    }
  };

  const deny = async ({ groupId, userId }) => {
    if (!groupId || !userId) return;
    setBusyId(`jr-${groupId}-${userId}`);
    try {
      await denyGroupJoinRequest(groupId, userId);
      await load();
    } catch (e) {
      // eslint-disable-next-line no-alert
      alert(e?.response?.data?.error || e?.message || 'Не удалось отклонить');
    } finally {
      setBusyId(null);
    }
  };

  const respondInvite = async ({ inviteId, period }, status) => {
    if (!inviteId) return;
    const id = `${period ? 'cp' : 'ce'}-${inviteId}`;
    setBusyId(id);
    try {
      if (period) await respondToCalendarPeriodInvite(inviteId, status);
      else await respondToCalendarInvite(inviteId, status);
      await load();
    } catch (e) {
      // eslint-disable-next-line no-alert
      alert(e?.response?.data?.error || e?.message || 'Не удалось ответить');
    } finally {
      setBusyId(null);
    }
  };

  const respondGroupInvite = async ({ groupId }, action) => {
    if (!groupId) return;
    const id = `gi-${groupId}`;
    setBusyId(id);
    try {
      if (action === 'accept') {
        await acceptGroupInvite(groupId);
        requestNotificationPermissionIfNeeded();
      } else {
        await declineGroupInvite(groupId);
      }
      await load();
    } catch (e) {
      // eslint-disable-next-line no-alert
      alert(e?.response?.data?.error || e?.message || 'Не удалось выполнить действие');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <MobileLayout title="" padded={false}>
      <div className={styles.wrap}>
        <Tabs value={tab} onChange={setTab} />

        {!token ? (
          <div className={styles.state}>Войдите, чтобы видеть уведомления.</div>
        ) : loading ? (
          <div className={styles.state}>Загрузка…</div>
        ) : filtered.length ? (
          <div className={styles.list}>
            {filtered.map((it) => {
              const a = it.actions;
              const isBusy = busyId === it.id;
              return (
                <Card
                  key={it.id}
                  icon={it.icon}
                  title={it.title}
                  subtitle={it.subtitle}
                  meta={it.meta}
                  actions={
                    a?.groupId && a?.userId ? (
                      <>
                        <button type="button" className={styles.actionOk} onClick={() => approve(a)} disabled={isBusy}>
                          <Check size={16} />
                          Одобрить
                        </button>
                        <button type="button" className={styles.actionNo} onClick={() => deny(a)} disabled={isBusy}>
                          <X size={16} />
                          Отклонить
                        </button>
                      </>
                    ) : a?.groupInvite && a?.groupId ? (
                      <>
                        <button
                          type="button"
                          className={styles.actionOk}
                          onClick={() => respondGroupInvite(a, 'accept')}
                          disabled={isBusy}
                        >
                          <Check size={16} />
                          Принять
                        </button>
                        <button
                          type="button"
                          className={styles.actionNo}
                          onClick={() => respondGroupInvite(a, 'decline')}
                          disabled={isBusy}
                        >
                          <X size={16} />
                          Отклонить
                        </button>
                      </>
                    ) : a?.inviteId ? (
                      <>
                        <button
                          type="button"
                          className={styles.actionOk}
                          onClick={() => respondInvite(a, 'CONFIRMED')}
                          disabled={isBusy}
                        >
                          <Check size={16} />
                          Принять
                        </button>
                        <button
                          type="button"
                          className={styles.actionNo}
                          onClick={() => respondInvite(a, 'DECLINED')}
                          disabled={isBusy}
                        >
                          <X size={16} />
                          Отклонить
                        </button>
                      </>
                    ) : null
                  }
                />
              );
            })}
          </div>
        ) : (
          <div className={styles.state}>Пока нет новых уведомлений.</div>
        )}
      </div>
    </MobileLayout>
  );
}


