import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Check, ChevronLeft, ChevronRight, Home, Inbox, Loader2, Plus, Trash2, X } from 'lucide-react';
import styles from '../styles/CalendarPage.module.css';
import {
  createGroupCalendarEvent,
  createGroupCalendarPeriod,
  createMyCalendarEvent,
  deleteGroupCalendarEvent,
  deleteGroupCalendarPeriod,
  deleteMyCalendarEvent,
  getGroupCalendarEvents,
  getGroupCalendarPeriods,
  getMyCalendar,
  respondToCalendarInvite,
  respondToCalendarPeriodInvite,
} from '../http/calendarAPI';
import { getMyGroups } from '../http/groupAPI';
import { getToken } from '../http/userAPI';

function pad2(n) {
  return String(n).padStart(2, '0');
}

function monthLabel(date) {
  const fmt = new Intl.DateTimeFormat('ru-RU', { month: 'long', year: 'numeric' });
  return fmt.format(date);
}

function startOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function daysInMonth(date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
}

function buildMonthGrid(date) {
  const first = startOfMonth(date);
  const firstWeekday = (first.getDay() + 6) % 7; // Monday=0
  const total = daysInMonth(date);

  const cells = [];
  for (let i = 0; i < firstWeekday; i += 1) cells.push(null);
  for (let d = 1; d <= total; d += 1) cells.push(new Date(date.getFullYear(), date.getMonth(), d));
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

function startOfDay(d) {
  const dt = d instanceof Date ? d : new Date(d);
  return new Date(dt.getFullYear(), dt.getMonth(), dt.getDate(), 0, 0, 0, 0);
}

function eachDayInclusive(from, to) {
  const start = startOfDay(from);
  const end = startOfDay(to);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return [];
  const out = [];
  for (let cur = start; cur.getTime() <= end.getTime(); cur = new Date(cur.getFullYear(), cur.getMonth(), cur.getDate() + 1)) {
    out.push(cur);
  }
  return out;
}

function isoDateKey(d) {
  if (!d) return null;
  const dt = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(dt.getTime())) return null;
  return `${dt.getFullYear()}-${pad2(dt.getMonth() + 1)}-${pad2(dt.getDate())}`;
}

function timeLabel(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const fmt = new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit' });
  return fmt.format(d);
}

function typeLabel(type) {
  const t = String(type || '').toUpperCase();
  const map = {
    CT: 'ЦТ',
    COLLOQUIUM: 'Коллоквиум',
    EXAM: 'Экзамен',
    DEADLINE: 'ДЗ',
    HOMEWORK: 'ДЗ',
    OTHER: 'Другое',
  };
  return map[t] || t || 'Событие';
}

function periodTypeLabel(type) {
  const t = String(type || '').toUpperCase();
  const map = {
    SEMESTER: 'Семестр',
    SESSION: 'Сессия',
    VACATION: 'Каникулы',
  };
  return map[t] || t || 'Период';
}

function periodUnderlineColor(type) {
  const t = String(type || '').toUpperCase();
  // Muted underline colors (visible but not flashy).
  if (t === 'SESSION') return 'rgba(239, 68, 68, 0.70)';
  if (t === 'VACATION') return 'rgba(34, 197, 94, 0.70)';
  return 'rgba(14, 165, 233, 0.70)'; // SEMESTER
}

function periodPriority(type) {
  const t = String(type || '').toUpperCase();
  // If multiple overlap, pick the most important.
  if (t === 'SESSION') return 3;
  if (t === 'VACATION') return 2;
  if (t === 'SEMESTER') return 1;
  return 0;
}

function tagColor(tag) {
  const colors = {
    ЦТ: '#3b82f6',
    Коллоквиум: '#a855f7',
    Экзамен: '#f59e0b',
    ДЗ: '#111827',
    Другое: '#64748b',
    Семестр: '#0ea5e9',
    Сессия: '#ef4444',
    Каникулы: '#22c55e',
  };
  return colors[tag] || '#64748b';
}

function parseMaterialsText(text) {
  const raw = String(text || '').trim();
  if (!raw) return [];
  const lines = raw
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);
  const out = [];
  for (const line of lines) {
    // Supported formats:
    // - URL
    // - Title | URL
    const parts = line.split('|').map((p) => p.trim()).filter(Boolean);
    if (!parts.length) continue;
    const url = parts.length === 1 ? parts[0] : parts[parts.length - 1];
    const title = parts.length >= 2 ? parts.slice(0, -1).join(' | ') : '';
    if (!url) continue;
    out.push(title ? { title, url } : { url });
  }
  return out;
}

export default function CalendarPage() {
  const navigate = useNavigate();
  const [token, setToken] = useState(() => getToken());
  const inboxRef = useRef(null);

  const [cursor, setCursor] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const cells = useMemo(() => buildMonthGrid(cursor), [cursor]);
  const [selectedDayKey, setSelectedDayKey] = useState(() => isoDateKey(new Date()));
  const [view, setView] = useState('month'); // 'month' | 'day'
  const [details, setDetails] = useState(null); // { kind: 'MY'|'GROUP'|'PERIOD', event }

  const [groups, setGroups] = useState([]);
  const [loadingGroups, setLoadingGroups] = useState(false);
  const myGroup = useMemo(() => (Array.isArray(groups) && groups.length ? groups[0] : null), [groups]);
  const myGroupId = myGroup?.groupId || null;
  const canManageMyGroup = myGroup?.myRole === 'OWNER' || myGroup?.myRole === 'ADMIN';
  const [mode, setMode] = useState('my'); // 'my' | 'starosta'

  const [calendar, setCalendar] = useState(null);
  const [loadingCalendar, setLoadingCalendar] = useState(false);
  const [calendarError, setCalendarError] = useState(null);
  const [respondingInviteId, setRespondingInviteId] = useState(null);
  const [deletingMyEventId, setDeletingMyEventId] = useState(null);

  // Starosta mode state
  const [groupEvents, setGroupEvents] = useState([]);
  const [groupPeriods, setGroupPeriods] = useState([]);
  const [loadingGroup, setLoadingGroup] = useState(false);
  const [groupError, setGroupError] = useState(null);
  const [creatingGroupEvent, setCreatingGroupEvent] = useState(false);
  const [creatingGroupPeriod, setCreatingGroupPeriod] = useState(false);
  const [deletingGroupId, setDeletingGroupId] = useState(null); // 'e:ID' | 'p:ID'

  const [gTitle, setGTitle] = useState('');
  const [gType, setGType] = useState('CT');
  const [gSubject, setGSubject] = useState('');
  const [gDate, setGDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [gAllDay, setGAllDay] = useState(true);
  const [gTime, setGTime] = useState('09:00');
  const [gComment, setGComment] = useState('');
  const [gMaterialsText, setGMaterialsText] = useState('');

  const [pType, setPType] = useState('SEMESTER');
  const [pTitle, setPTitle] = useState('');
  const [pStart, setPStart] = useState(() => new Date().toISOString().slice(0, 10));
  const [pEnd, setPEnd] = useState(() => new Date().toISOString().slice(0, 10));

  const [myTitle, setMyTitle] = useState('');
  const [myType, setMyType] = useState('CT');
  const [mySubject, setMySubject] = useState('');
  const [myDate, setMyDate] = useState(() => new Date().toISOString().slice(0, 10)); // YYYY-MM-DD
  const [myAllDay, setMyAllDay] = useState(true);
  const [myTime, setMyTime] = useState('09:00');
  const [myComment, setMyComment] = useState('');
  const [myMaterialsText, setMyMaterialsText] = useState('');
  const [creatingMyEvent, setCreatingMyEvent] = useState(false);

  useEffect(() => {
    const onStorage = (e) => {
      if (e.key === 'token') setToken(e.newValue);
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const monthParam = useMemo(() => `${cursor.getFullYear()}-${pad2(cursor.getMonth() + 1)}`, [cursor]);

  const loadGroups = useCallback(async () => {
    if (!token) {
      setGroups([]);
      return;
    }
    setLoadingGroups(true);
    try {
      const data = await getMyGroups();
      setGroups(Array.isArray(data) ? data : []);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('Failed to load groups:', e);
      setGroups([]);
    } finally {
      setLoadingGroups(false);
    }
  }, [token]);

  const loadCalendar = useCallback(async () => {
    if (!token) {
      setCalendar(null);
      setCalendarError(null);
      return;
    }
    setLoadingCalendar(true);
    setCalendarError(null);
    try {
      const data = await getMyCalendar({ month: monthParam });
      setCalendar(data || null);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('Failed to load calendar:', e);
      setCalendar(null);
      setCalendarError(e?.response?.data?.error || e?.message || 'Failed to load calendar');
    } finally {
      setLoadingCalendar(false);
    }
  }, [monthParam, token]);

  const loadGroupData = useCallback(async () => {
    if (!token || !myGroupId || !canManageMyGroup) {
      setGroupEvents([]);
      setGroupPeriods([]);
      setGroupError(null);
      return;
    }
    setLoadingGroup(true);
    setGroupError(null);
    try {
      const [ev, pr] = await Promise.all([
        getGroupCalendarEvents(myGroupId, { month: monthParam }),
        getGroupCalendarPeriods(myGroupId, { month: monthParam }),
      ]);
      setGroupEvents(Array.isArray(ev?.events) ? ev.events : []);
      setGroupPeriods(Array.isArray(pr?.periods) ? pr.periods : []);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('Failed to load group calendar:', e);
      setGroupEvents([]);
      setGroupPeriods([]);
      setGroupError(e?.response?.data?.error || e?.message || 'Failed to load group calendar');
    } finally {
      setLoadingGroup(false);
    }
  }, [token, myGroupId, canManageMyGroup, monthParam]);

  useEffect(() => {
    loadGroups();
  }, [loadGroups]);

  useEffect(() => {
    loadCalendar();
  }, [loadCalendar]);

  useEffect(() => {
    if (mode !== 'starosta') return;
    loadGroupData();
  }, [mode, loadGroupData]);

  const today = new Date();
  const isSameDay = (d1, d2) =>
    d1 && d2 && d1.getFullYear() === d2.getFullYear() && d1.getMonth() === d2.getMonth() && d1.getDate() === d2.getDate();

  const goMonth = (dir) => {
    setCursor((d) => new Date(d.getFullYear(), d.getMonth() + dir, 1));
  };

  const shiftSelectedDay = (deltaDays) => {
    const cur = selectedDayKey ? new Date(selectedDayKey) : new Date();
    if (Number.isNaN(cur.getTime())) return;
    const next = new Date(cur.getFullYear(), cur.getMonth(), cur.getDate() + Number(deltaDays || 0));
    const key = isoDateKey(next);
    if (!key) return;
    setSelectedDayKey(key);
    // Keep month cursor aligned with the day we are viewing.
    setCursor(new Date(next.getFullYear(), next.getMonth(), 1));
  };

  const confirmedEventsByDay = useMemo(() => {
    const map = new Map();
    const monthStart = startOfMonth(cursor);
    const monthEnd = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0);

    const confirmed = Array.isArray(calendar?.confirmed) ? calendar.confirmed : [];
    for (const row of confirmed) {
      const ev = row?.event;
      const key = isoDateKey(ev?.startsAt);
      if (!key) continue;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push({ kind: 'GROUP', event: ev });
    }
    const mine = Array.isArray(calendar?.myEvents) ? calendar.myEvents : [];
    for (const ev of mine) {
      const key = isoDateKey(ev?.startsAt);
      if (!key) continue;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push({ kind: 'MY', event: ev });
    }
    const periods = Array.isArray(calendar?.confirmedPeriods) ? calendar.confirmedPeriods : [];
    for (const row of periods) {
      const p = row?.period;
      if (!p?.startsAt || !p?.endsAt) continue;
      const pStart = startOfDay(p.startsAt);
      const pEnd = startOfDay(p.endsAt);
      // Render only days that intersect current month grid.
      const clipFrom = pStart > monthStart ? pStart : monthStart;
      const clipTo = pEnd < monthEnd ? pEnd : monthEnd;
      for (const day of eachDayInclusive(clipFrom, clipTo)) {
        const key = isoDateKey(day);
        if (!key) continue;
        if (!map.has(key)) map.set(key, []);
        map.get(key).push({ kind: 'PERIOD', event: p });
      }
    }
    return map;
  }, [calendar, cursor]);

  const pendingInvites = useMemo(() => (Array.isArray(calendar?.pending) ? calendar.pending : []), [calendar]);
  const pendingPeriodInvites = useMemo(
    () => (Array.isArray(calendar?.pendingPeriods) ? calendar.pendingPeriods : []),
    [calendar]
  );
  const inboxCount = pendingInvites.length + pendingPeriodInvites.length;

  // Keep selected day within current month when switching months.
  useEffect(() => {
    const selected = selectedDayKey ? new Date(selectedDayKey) : null;
    const curMonth = cursor.getMonth();
    const curYear = cursor.getFullYear();
    const selectedIsInMonth = selected && !Number.isNaN(selected.getTime()) && selected.getMonth() === curMonth && selected.getFullYear() === curYear;
    if (selectedIsInMonth) return;
    setSelectedDayKey(isoDateKey(new Date(curYear, curMonth, 1)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cursor]);

  // Autocomplete: prefill create forms with currently selected day.
  useEffect(() => {
    if (!selectedDayKey) return;
    if (!myTitle.trim()) setMyDate(selectedDayKey);
    if (!gTitle.trim()) setGDate(selectedDayKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDayKey]);

  const selectedDayItems = useMemo(() => {
    const key = selectedDayKey;
    if (!key) return { events: [], periods: [] };
    const items = confirmedEventsByDay.get(key) || [];
    const events = items.filter((x) => x.kind !== 'PERIOD');
    const periods = (() => {
      const seen = new Set();
      const out = [];
      for (const it of items) {
        if (it.kind !== 'PERIOD') continue;
        const pid = it?.event?.periodId;
        if (!pid || seen.has(pid)) continue;
        seen.add(pid);
        out.push(it.event);
      }
      return out;
    })();
    return { events, periods };
  }, [confirmedEventsByDay, selectedDayKey]);

  const respond = async (inviteId, status) => {
    if (!inviteId || !status) return;
    setRespondingInviteId(inviteId);
    try {
      await respondToCalendarInvite(inviteId, status);
      await loadCalendar();
    } catch (e) {
      // eslint-disable-next-line no-alert
      alert(e?.response?.data?.error || e?.message || 'Failed to respond');
    } finally {
      setRespondingInviteId(null);
    }
  };

  const respondPeriod = async (inviteId, status) => {
    if (!inviteId || !status) return;
    setRespondingInviteId(`p-${inviteId}`);
    try {
      await respondToCalendarPeriodInvite(inviteId, status);
      await loadCalendar();
    } catch (e) {
      // eslint-disable-next-line no-alert
      alert(e?.response?.data?.error || e?.message || 'Failed to respond');
    } finally {
      setRespondingInviteId(null);
    }
  };

  const submitCreateMy = async (e) => {
    e.preventDefault();
    if (!myTitle.trim()) return;

    setCreatingMyEvent(true);
    try {
      const timePart = myAllDay ? '00:00' : myTime || '09:00';
      const startsAt = new Date(`${myDate}T${timePart}`).toISOString();
      await createMyCalendarEvent({
        title: myTitle.trim(),
        type: myType,
        subject: mySubject.trim() || null,
        comment: myComment.trim() || null,
        materials: parseMaterialsText(myMaterialsText),
        startsAt,
        allDay: Boolean(myAllDay),
      });
      setMyTitle('');
      setMySubject('');
      setMyComment('');
      setMyMaterialsText('');
      await loadCalendar();
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('Failed to create my event:', err);
      // eslint-disable-next-line no-alert
      alert(err?.response?.data?.error || 'Failed to create event');
    } finally {
      setCreatingMyEvent(false);
    }
  };

  const submitCreateGroupEvent = async (e) => {
    e.preventDefault();
    if (!myGroupId) return;
    if (!gTitle.trim()) return;
    setCreatingGroupEvent(true);
    try {
      const timePart = gAllDay ? '00:00' : gTime || '09:00';
      const startsAt = new Date(`${gDate}T${timePart}`).toISOString();
      await createGroupCalendarEvent(myGroupId, {
        title: gTitle.trim(),
        type: gType,
        subject: gSubject.trim() || null,
        comment: gComment.trim() || null,
        materials: parseMaterialsText(gMaterialsText),
        startsAt,
        allDay: Boolean(gAllDay),
      });
      setGTitle('');
      setGSubject('');
      setGComment('');
      setGMaterialsText('');
      await loadGroupData();
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('Failed to create group event:', err);
      // eslint-disable-next-line no-alert
      alert(err?.response?.data?.error || 'Failed to create');
    } finally {
      setCreatingGroupEvent(false);
    }
  };

  const submitCreateGroupPeriod = async (e) => {
    e.preventDefault();
    if (!myGroupId) return;
    setCreatingGroupPeriod(true);
    try {
      const startsAt = new Date(`${pStart}T00:00`).toISOString();
      const endsAt = new Date(`${pEnd}T23:59`).toISOString();
      await createGroupCalendarPeriod(myGroupId, {
        type: pType,
        title: pTitle.trim() || undefined,
        startsAt,
        endsAt,
        allDay: true,
      });
      setPTitle('');
      await loadGroupData();
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('Failed to create group period:', err);
      // eslint-disable-next-line no-alert
      alert(err?.response?.data?.error || 'Failed to create');
    } finally {
      setCreatingGroupPeriod(false);
    }
  };

  const deleteGroupItem = async (kind, id) => {
    if (!myGroupId || !id) return;
    const key = `${kind}:${id}`;
    setDeletingGroupId(key);
    try {
      if (kind === 'e') await deleteGroupCalendarEvent(myGroupId, id);
      else await deleteGroupCalendarPeriod(myGroupId, id);
      await loadGroupData();
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('Failed to delete group item:', err);
      // eslint-disable-next-line no-alert
      alert(err?.response?.data?.error || 'Failed to delete');
    } finally {
      setDeletingGroupId(null);
    }
  };

  const deleteMy = async (myEventId) => {
    if (!myEventId) return;
    setDeletingMyEventId(myEventId);
    try {
      await deleteMyCalendarEvent(myEventId);
      await loadCalendar();
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('Failed to delete my event:', e);
      // eslint-disable-next-line no-alert
      alert(e?.response?.data?.error || e?.message || 'Failed to delete');
    } finally {
      setDeletingMyEventId(null);
    }
  };

  return (
    <div className={styles.page}>
      <header className={styles.top}>
        <div className={styles.left}>
          <Link to="/home" className={styles.home}>
            <Home size={18} />
            <span>Home</span>
          </Link>
        </div>
        <div className={styles.center}>
          <button type="button" className={styles.navBtn} onClick={() => goMonth(-1)} aria-label="Previous month">
            <ChevronLeft size={18} />
          </button>
          <div className={styles.month}>{monthLabel(cursor)}</div>
          <button type="button" className={styles.navBtn} onClick={() => goMonth(1)} aria-label="Next month">
            <ChevronRight size={18} />
          </button>
        </div>
        <div className={styles.right}>
          {canManageMyGroup ? (
            <div className={styles.modeTabs}>
              <button
                type="button"
                className={`${styles.modeBtn} ${mode === 'my' ? styles.modeBtnActive : ''}`}
                onClick={() => setMode('my')}
              >
                Мой календарь
              </button>
              <button
                type="button"
                className={`${styles.modeBtn} ${mode === 'starosta' ? styles.modeBtnActive : ''}`}
                onClick={() => setMode('starosta')}
              >
                Староста
              </button>
            </div>
          ) : (
            <button type="button" className={`${styles.modeBtn} ${styles.modeBtnActive}`} disabled>
              Мой календарь
            </button>
          )}
          <div className={styles.modeTabs} aria-label="Режим отображения">
            <button
              type="button"
              className={`${styles.modeBtn} ${view === 'month' ? styles.modeBtnActive : ''}`}
              onClick={() => setView('month')}
            >
              Месяц
            </button>
            <button
              type="button"
              className={`${styles.modeBtn} ${view === 'day' ? styles.modeBtnActive : ''}`}
              onClick={() => setView('day')}
            >
              День
            </button>
          </div>
        </div>
      </header>

      <main className={styles.main}>
        {!token ? (
          <div className={styles.emptyState}>
            <div className={styles.emptyTitle}>Войдите, чтобы видеть календарь</div>
            <div className={styles.emptySub}>События добавляются старостой/админом группы, вы подтверждаете их у себя.</div>
            <button type="button" className={styles.primaryBtn} onClick={() => navigate('/auth')}>
              Перейти к входу
            </button>
          </div>
        ) : (
          <>
            {mode === 'starosta' ? (
              <div className={styles.starostaLayout}>
                <div className={styles.starostaLeft}>
                  <div className={styles.blockTitle}>Периоды</div>
                  <div className={styles.blockSub}>Семестр / сессия / каникулы (будут приглашения студентам)</div>
                  <form className={styles.createForm} onSubmit={submitCreateGroupPeriod}>
                    <label className={styles.formLabel}>
                      Тип
                      <select className={styles.select} value={pType} onChange={(e) => setPType(e.target.value)}>
                        <option value="SEMESTER">Семестр</option>
                        <option value="SESSION">Сессия</option>
                        <option value="VACATION">Каникулы</option>
                      </select>
                    </label>
                    <label className={styles.formLabel}>
                      Название (опц.)
                      <input className={styles.input} value={pTitle} onChange={(e) => setPTitle(e.target.value)} placeholder="Можно оставить пустым" />
                    </label>
                    <div className={styles.row2}>
                      <label className={styles.formLabel}>
                        Начало
                        <input className={styles.input} type="date" value={pStart} onChange={(e) => setPStart(e.target.value)} required />
                      </label>
                      <label className={styles.formLabel}>
                        Конец
                        <input className={styles.input} type="date" value={pEnd} onChange={(e) => setPEnd(e.target.value)} required />
                      </label>
                    </div>
                    <button type="submit" className={styles.primaryBtn} disabled={creatingGroupPeriod}>
                      {creatingGroupPeriod ? <Loader2 size={16} className={styles.spinner} /> : <Plus size={16} />}
                      Добавить период
                    </button>
                  </form>

                  <div className={styles.list}>
                    {loadingGroup ? <div className={styles.loadingInline}><Loader2 size={16} className={styles.spinner} />Загрузка...</div> : null}
                    {groupError ? <div className={styles.error}>{groupError}</div> : null}
                    {groupPeriods.map((p) => {
                      const label = periodTypeLabel(p.type);
                      const busy = deletingGroupId === `p:${p.periodId}`;
                      return (
                        <div key={p.periodId} className={styles.listItem}>
                          <div className={styles.listLeft}>
                            <div className={styles.tags}>
                              <span className={styles.tag} style={{ background: tagColor(label) }}>{label}</span>
                              <span className={styles.tag} style={{ background: '#64748b' }}>
                                {new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: 'short' }).format(new Date(p.startsAt))}
                                {' — '}
                                {new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: 'short' }).format(new Date(p.endsAt))}
                              </span>
                            </div>
                            <div className={styles.title}>{p.title}</div>
                            <div className={styles.muted}>Подтверждения: {p.stats?.confirmed ?? 0}/{p.stats?.total ?? 0} (ожид: {p.stats?.pending ?? 0})</div>
                          </div>
                          <button
                            type="button"
                            className={styles.iconBtn}
                            onClick={() => deleteGroupItem('p', p.periodId)}
                            disabled={busy}
                            title="Удалить период"
                            aria-label="Удалить период"
                          >
                            {busy ? <Loader2 size={16} className={styles.spinner} /> : <Trash2 size={16} />}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className={styles.starostaRight}>
                  <div className={styles.blockTitle}>События группы</div>
                  <div className={styles.blockSub}>ЦТ / коллоквиум / экзамен / дедлайн</div>
                  <form className={styles.createForm} onSubmit={submitCreateGroupEvent}>
                    <label className={styles.formLabel}>
                      Название *
                      <input className={styles.input} value={gTitle} onChange={(e) => setGTitle(e.target.value)} required />
                    </label>
                    <div className={styles.row2}>
                      <label className={styles.formLabel}>
                        Тип
                        <select className={styles.select} value={gType} onChange={(e) => setGType(e.target.value)}>
                          <option value="CT">ЦТ</option>
                          <option value="EXAM">Экзамен</option>
                          <option value="COLLOQUIUM">Коллоквиум</option>
                          <option value="HOMEWORK">ДЗ</option>
                          <option value="OTHER">Другое</option>
                        </select>
                      </label>
                      <label className={styles.formLabel}>
                        Дата
                        <input className={styles.input} type="date" value={gDate} onChange={(e) => setGDate(e.target.value)} required />
                      </label>
                    </div>
                    <div className={styles.row2}>
                      <label className={styles.formLabel}>
                        Режим
                        <select
                          className={styles.select}
                          value={gAllDay ? 'allDay' : 'time'}
                          onChange={(e) => setGAllDay(e.target.value === 'allDay')}
                        >
                          <option value="allDay">Весь день</option>
                          <option value="time">Указать время</option>
                        </select>
                      </label>
                      <label className={styles.formLabel}>
                        Время
                        <input className={styles.input} type="time" value={gTime} onChange={(e) => setGTime(e.target.value)} disabled={gAllDay} />
                      </label>
                    </div>
                    <label className={styles.formLabel}>
                      Предмет (опц.)
                      <input className={styles.input} value={gSubject} onChange={(e) => setGSubject(e.target.value)} />
                    </label>
                    <label className={styles.formLabel}>
                      Комментарий (опц.)
                      <textarea className={styles.textarea} value={gComment} onChange={(e) => setGComment(e.target.value)} />
                    </label>
                    <label className={styles.formLabel}>
                      Материалы (опц.)
                      <textarea
                        className={styles.textarea}
                        value={gMaterialsText}
                        onChange={(e) => setGMaterialsText(e.target.value)}
                        placeholder={'Ссылки, по одной на строку\nили: Название | https://...'}
                      />
                    </label>
                    <button type="submit" className={styles.primaryBtn} disabled={creatingGroupEvent || !gTitle.trim()}>
                      {creatingGroupEvent ? <Loader2 size={16} className={styles.spinner} /> : <Plus size={16} />}
                      Добавить событие
                    </button>
                  </form>

                  <div className={styles.list}>
                    {groupEvents.map((ev) => {
                      const t = typeLabel(ev.type);
                      const time = ev?.allDay ? '' : timeLabel(ev?.startsAt);
                      const busy = deletingGroupId === `e:${ev.eventId}`;
                      return (
                        <div key={ev.eventId} className={styles.listItem}>
                          <div className={styles.listLeft}>
                            <div className={styles.tags}>
                              <span className={styles.tag} style={{ background: tagColor(t) }}>{t}</span>
                              <span className={styles.tag} style={{ background: '#64748b' }}>
                                {new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: 'short' }).format(new Date(ev.startsAt))}
                                {time ? ` • ${time}` : ''}
                              </span>
                            </div>
                            <div className={styles.title}>{ev.title}</div>
                            <div className={styles.muted}>
                              {ev.subject ? `${ev.subject} • ` : ''}
                              Подтверждения: {ev.stats?.confirmed ?? 0}/{ev.stats?.total ?? 0} (ожид: {ev.stats?.pending ?? 0})
                            </div>
                          </div>
                          <button
                            type="button"
                            className={styles.iconBtn}
                            onClick={() => deleteGroupItem('e', ev.eventId)}
                            disabled={busy}
                            title="Удалить событие"
                            aria-label="Удалить событие"
                          >
                            {busy ? <Loader2 size={16} className={styles.spinner} /> : <Trash2 size={16} />}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            ) : (
              <>
                <div className={styles.inboxTop}>
                  <button
                    type="button"
                    className={styles.inboxBtn}
                    onClick={() => inboxRef.current?.scrollIntoView?.({ behavior: 'smooth', block: 'start' })}
                  >
                    <Inbox size={16} />
                    <span>Входящие</span>
                    {inboxCount ? <span className={styles.inboxBadge}>{inboxCount}</span> : null}
                  </button>
                </div>

                <div className={styles.split}>
                  {view === 'month' ? (
                    <div>
                      <div className={styles.weekHeader}>
                        {['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].map((d) => (
                          <div key={d} className={styles.weekDay}>
                            {d}
                          </div>
                        ))}
                      </div>

                      <div className={styles.grid}>
                        {cells.map((date, idx) => {
                          const key = date ? isoDateKey(date) : `empty-${idx}`;
                          const events = date ? confirmedEventsByDay.get(key) || [] : [];
                          const isToday = isSameDay(date, today);
                          const periodItems = date ? events.filter((x) => x.kind === 'PERIOD') : [];
                          const underline = (() => {
                            if (!periodItems.length) return null;
                            let bestType = null;
                            let bestPri = -1;
                            for (const it of periodItems) {
                              const t = it?.event?.type;
                              const pri = periodPriority(t);
                              if (pri > bestPri) {
                                bestPri = pri;
                                bestType = t;
                              }
                            }
                            return bestType ? periodUnderlineColor(bestType) : null;
                          })();
                          const isSelected = Boolean(date && key === selectedDayKey);
                          const nonPeriodCount = date ? events.filter((x) => x.kind !== 'PERIOD').length : 0;
                          return (
                            <div
                              // eslint-disable-next-line react/no-array-index-key
                              key={idx}
                              className={`${styles.cell} ${date ? styles.cellClickable : styles.cellEmpty} ${isToday ? styles.cellToday : ''} ${isSelected ? styles.cellSelected : ''}`}
                              role={date ? 'button' : undefined}
                              tabIndex={date ? 0 : -1}
                              onClick={date ? () => setSelectedDayKey(key) : undefined}
                              onKeyDown={
                                date
                                  ? (e) => {
                                      if (e.key === 'Enter' || e.key === ' ') {
                                        e.preventDefault();
                                        setSelectedDayKey(key);
                                      }
                                    }
                                  : undefined
                              }
                            >
                              <div className={styles.cellTop}>
                                <div
                                  className={`${styles.dateNum} ${underline ? styles.dateNumPeriod : ''}`}
                                  style={underline ? { '--periodUnderline': underline } : undefined}
                                >
                                  {date ? date.getDate() : ''}
                                </div>
                                {nonPeriodCount ? <div className={styles.count}>{nonPeriodCount}</div> : null}
                              </div>

                              {/* Intentionally no per-day cards here (minimal month view). */}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ) : (
                    <div className={styles.sidebarBlock}>
                      <div className={styles.titleRow}>
                        <div className={styles.sidebarTitle}>
                          {selectedDayKey
                            ? new Intl.DateTimeFormat('ru-RU', { weekday: 'long', day: '2-digit', month: 'long' }).format(new Date(selectedDayKey))
                            : 'День'}
                        </div>
                        <div className={styles.modeTabs}>
                          <button type="button" className={styles.navBtn} onClick={() => shiftSelectedDay(-1)} aria-label="Предыдущий день">
                            <ChevronLeft size={18} />
                          </button>
                          <button type="button" className={styles.navBtn} onClick={() => shiftSelectedDay(1)} aria-label="Следующий день">
                            <ChevronRight size={18} />
                          </button>
                        </div>
                      </div>
                      <div className={styles.sidebarSub}>Режим “День”: все события выбранной даты.</div>

                      {selectedDayItems.periods.length ? (
                        <div className={styles.dayList}>
                          {selectedDayItems.periods.map((p) => {
                            const label = periodTypeLabel(p?.type);
                            return (
                              <div key={`dp-${p.periodId}`} className={styles.dayRow}>
                                <span className={styles.dayDot} style={{ background: tagColor(label) }} />
                                <div className={styles.dayMain}>
                                  <div className={styles.dayTitle}>{p?.title || label}</div>
                                  <div className={styles.dayMeta}>
                                    {label} • до{' '}
                                    {p?.endsAt ? new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: 'short' }).format(new Date(p.endsAt)) : ''}
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ) : null}

                      {selectedDayItems.events.length ? (
                        <div className={styles.dayList}>
                          {selectedDayItems.events.map(({ kind, event: ev }) => {
                            const isMy = kind === 'MY';
                            const t = typeLabel(ev?.type);
                            const time = ev?.allDay ? 'Весь день' : timeLabel(ev?.startsAt);
                            return (
                              <div key={isMy ? `de-${ev.myEventId}` : `ge-${ev.eventId}`} className={styles.dayRow}>
                                <span className={styles.dayDot} style={{ background: tagColor(t) }} />
                                <div
                                  className={styles.dayMain}
                                  role="button"
                                  tabIndex={0}
                                  onClick={() => setDetails({ kind: isMy ? 'MY' : 'GROUP', event: ev })}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter' || e.key === ' ') {
                                      e.preventDefault();
                                      setDetails({ kind: isMy ? 'MY' : 'GROUP', event: ev });
                                    }
                                  }}
                                >
                                  <div className={styles.dayTitle}>
                                    {ev?.title || 'Событие'}
                                    {isMy ? <span className={styles.dayPill}>моё</span> : null}
                                  </div>
                                  <div className={styles.dayMeta}>
                                    {t} • {time}
                                    {ev?.subject ? ` • ${ev.subject}` : ''}
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div className={styles.emptyInline}>Нет событий на выбранный день.</div>
                      )}
                    </div>
                  )}

                  <aside className={styles.sidebar}>
                    {view === 'month' ? (
                      <div className={styles.sidebarBlock}>
                        <div className={styles.sidebarTitle}>
                          {selectedDayKey
                            ? `События на ${new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: 'long' }).format(new Date(selectedDayKey))}`
                            : 'События дня'}
                        </div>
                        <div className={styles.sidebarSub}>Кликните по дню в календаре, чтобы посмотреть детали.</div>

                        {selectedDayItems.periods.length ? (
                          <div className={styles.dayList}>
                            {selectedDayItems.periods.map((p) => {
                              const label = periodTypeLabel(p?.type);
                              return (
                                <div key={`dp-${p.periodId}`} className={styles.dayRow}>
                                  <span className={styles.dayDot} style={{ background: tagColor(label) }} />
                                  <div className={styles.dayMain}>
                                    <div className={styles.dayTitle}>{p?.title || label}</div>
                                    <div className={styles.dayMeta}>
                                      {label} • до{' '}
                                      {p?.endsAt
                                        ? new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: 'short' }).format(new Date(p.endsAt))
                                        : ''}
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        ) : null}

                        {selectedDayItems.events.length ? (
                          <div className={styles.dayList}>
                            {selectedDayItems.events.map(({ kind, event: ev }) => {
                              const isMy = kind === 'MY';
                              const t = typeLabel(ev?.type);
                              const time = ev?.allDay ? '' : timeLabel(ev?.startsAt);
                              const canDelete = isMy && ev?.myEventId;
                              const busyDelete = deletingMyEventId === ev?.myEventId;
                              return (
                                <div key={isMy ? `de-${ev.myEventId}` : `ge-${ev.eventId}`} className={styles.dayRow}>
                                  <span className={styles.dayDot} style={{ background: tagColor(t) }} />
                                  <div
                                    className={styles.dayMain}
                                    role="button"
                                    tabIndex={0}
                                    onClick={() => setDetails({ kind: isMy ? 'MY' : 'GROUP', event: ev })}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter' || e.key === ' ') {
                                        e.preventDefault();
                                        setDetails({ kind: isMy ? 'MY' : 'GROUP', event: ev });
                                      }
                                    }}
                                  >
                                    <div className={styles.dayTitle}>
                                      {ev?.title || 'Событие'}
                                      {isMy ? <span className={styles.dayPill}>моё</span> : null}
                                    </div>
                                    <div className={styles.dayMeta}>
                                      {t}
                                      {time ? ` • ${time}` : ''}
                                      {ev?.subject ? ` • ${ev.subject}` : ''}
                                    </div>
                                  </div>
                                  {canDelete ? (
                                    <button
                                      type="button"
                                      className={styles.iconBtn}
                                      onClick={() => deleteMy(ev.myEventId)}
                                      disabled={busyDelete}
                                      aria-label="Удалить событие"
                                      title="Удалить"
                                    >
                                      {busyDelete ? <Loader2 size={16} className={styles.spinner} /> : <Trash2 size={16} />}
                                    </button>
                                  ) : null}
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <div className={styles.emptyInline}>Нет событий на выбранный день.</div>
                        )}
                      </div>
                    ) : null}

                    <div className={styles.sidebarBlock}>
                      <div className={styles.sidebarTitle}>Добавить событие себе</div>
                      <div className={styles.sidebarSub}>Личное событие видно только вам. Удаляется без подтверждений.</div>
                      <form className={styles.createForm} onSubmit={submitCreateMy}>
                        <label className={styles.formLabel}>
                          Название *
                          <input
                            className={styles.input}
                            value={myTitle}
                            onChange={(e) => setMyTitle(e.target.value)}
                            placeholder="Например: подготовка к экзамену"
                            required
                          />
                        </label>
                        <div className={styles.row2}>
                          <label className={styles.formLabel}>
                            Тип
                            <select className={styles.select} value={myType} onChange={(e) => setMyType(e.target.value)}>
                              <option value="CT">ЦТ</option>
                              <option value="EXAM">Экзамен</option>
                              <option value="COLLOQUIUM">Коллоквиум</option>
                              <option value="HOMEWORK">ДЗ</option>
                              <option value="OTHER">Другое</option>
                            </select>
                          </label>
                          <label className={styles.formLabel}>
                            Дата
                            <input className={styles.input} type="date" value={myDate} onChange={(e) => setMyDate(e.target.value)} required />
                          </label>
                        </div>
                        <div className={styles.row2}>
                          <label className={styles.formLabel}>
                            Режим
                            <select
                              className={styles.select}
                              value={myAllDay ? 'allDay' : 'time'}
                              onChange={(e) => setMyAllDay(e.target.value === 'allDay')}
                            >
                              <option value="allDay">Весь день</option>
                              <option value="time">Указать время</option>
                            </select>
                          </label>
                          <label className={styles.formLabel}>
                            Время
                            <input
                              className={styles.input}
                              type="time"
                              value={myTime}
                              onChange={(e) => setMyTime(e.target.value)}
                              disabled={myAllDay}
                            />
                          </label>
                        </div>
                        <label className={styles.formLabel}>
                          Предмет (опц.)
                          <input className={styles.input} value={mySubject} onChange={(e) => setMySubject(e.target.value)} placeholder="Например: Анатомия" />
                        </label>
                        <label className={styles.formLabel}>
                          Комментарий (опц.)
                          <textarea
                            className={styles.textarea}
                            value={myComment}
                            onChange={(e) => setMyComment(e.target.value)}
                            placeholder="Что нужно сделать/подготовить…"
                          />
                        </label>
                        <label className={styles.formLabel}>
                          Материалы (опц.)
                          <textarea
                            className={styles.textarea}
                            value={myMaterialsText}
                            onChange={(e) => setMyMaterialsText(e.target.value)}
                            placeholder={'Ссылки, по одной на строку\nили: Название | https://...'}
                          />
                        </label>
                        <button type="submit" className={styles.primaryBtn} disabled={creatingMyEvent || !myTitle.trim()}>
                          {creatingMyEvent ? <Loader2 size={16} className={styles.spinner} /> : <Plus size={16} />}
                          Добавить
                        </button>
                      </form>
                    </div>

                    <div className={styles.sidebarBlock} ref={inboxRef}>
                      <div className={styles.sidebarTitle}>Ожидают подтверждения</div>
                      <div className={styles.sidebarSub}>
                        {pendingInvites.length || pendingPeriodInvites.length ? 'Подтвердите, чтобы добавить в календарь.' : 'Нет новых приглашений.'}
                      </div>

                      {pendingInvites.length || pendingPeriodInvites.length ? (
                        <div className={styles.inviteList}>
                          {pendingPeriodInvites.map((row) => {
                            const p = row?.period;
                            const t = periodTypeLabel(p?.type);
                            const when = p?.startsAt ? new Date(p.startsAt) : null;
                            const whenLabel =
                              when && !Number.isNaN(when.getTime())
                                ? new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: 'short' }).format(when)
                                : '';
                            const busy = respondingInviteId === `p-${row.inviteId}`;
                            return (
                              <div key={`p-${row.inviteId}`} className={styles.inviteCard}>
                                <div className={styles.inviteMain}>
                                  <div className={styles.inviteTopRow}>
                                    <span className={styles.inviteType} style={{ background: tagColor(t) }}>
                                      {t}
                                    </span>
                                    {whenLabel ? <span className={styles.inviteWhen}>{whenLabel}</span> : null}
                                  </div>
                                  <div className={styles.inviteTitle}>{p?.title || 'Период'}</div>
                                  <div className={styles.inviteMeta}>
                                    {p?.endsAt ? (
                                      <span className={styles.muted}>
                                        до {new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: 'short' }).format(new Date(p.endsAt))}
                                      </span>
                                    ) : null}
                                  </div>
                                </div>
                                <div className={styles.inviteActions}>
                                  <button
                                    type="button"
                                    className={styles.btnPrimary}
                                    onClick={() => respondPeriod(row.inviteId, 'CONFIRMED')}
                                    disabled={busy}
                                    title="Добавить в мой календарь"
                                  >
                                    {busy ? <Loader2 size={16} className={styles.spinner} /> : <Check size={16} />}
                                    Confirm
                                  </button>
                                  <button
                                    type="button"
                                    className={styles.btnDanger}
                                    onClick={() => respondPeriod(row.inviteId, 'DECLINED')}
                                    disabled={busy}
                                    title="Отклонить"
                                  >
                                    <X size={16} />
                                    Decline
                                  </button>
                                </div>
                              </div>
                            );
                          })}

                          {pendingInvites.map((row) => {
                            const ev = row?.event;
                            const t = typeLabel(ev?.type);
                            const when = ev?.startsAt ? new Date(ev.startsAt) : null;
                            const whenLabel =
                              when && !Number.isNaN(when.getTime())
                                ? new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: 'short' }).format(when)
                                : '';
                            const busy = respondingInviteId === row.inviteId;
                            return (
                              <div key={row.inviteId} className={styles.inviteCard}>
                                <div className={styles.inviteMain}>
                                  <div className={styles.inviteTopRow}>
                                    <span className={styles.inviteType} style={{ background: tagColor(t) }}>
                                      {t}
                                    </span>
                                    {whenLabel ? <span className={styles.inviteWhen}>{whenLabel}</span> : null}
                                  </div>
                                  <div className={styles.inviteTitle}>{ev?.title || 'Событие'}</div>
                                  <div className={styles.inviteMeta}>
                                    {ev?.subject ? <span className={styles.muted}>{ev.subject}</span> : null}
                                  </div>
                                </div>
                                <div className={styles.inviteActions}>
                                  <button
                                    type="button"
                                    className={styles.btnPrimary}
                                    onClick={() => respond(row.inviteId, 'CONFIRMED')}
                                    disabled={busy}
                                    title="Добавить в мой календарь"
                                  >
                                    {busy ? <Loader2 size={16} className={styles.spinner} /> : <Check size={16} />}
                                    Confirm
                                  </button>
                                  <button
                                    type="button"
                                    className={styles.btnDanger}
                                    onClick={() => respond(row.inviteId, 'DECLINED')}
                                    disabled={busy}
                                    title="Отклонить"
                                  >
                                    <X size={16} />
                                    Decline
                                  </button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ) : null}
                    </div>

                    {loadingCalendar ? (
                      <div className={styles.loadingInline}>
                        <Loader2 size={16} className={styles.spinner} />
                        <span>Загрузка...</span>
                      </div>
                    ) : null}
                    {calendarError ? <div className={styles.error}>{calendarError}</div> : null}
                  </aside>
                </div>
              </>
            )}
          </>
        )}
      </main>

      {details?.event ? (
        <div className={styles.modalOverlay} role="presentation" onClick={() => setDetails(null)}>
          <div className={styles.modal} role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
            <div className={styles.titleRow}>
              <div className={styles.modalTitle}>{details.event?.title || 'Событие'}</div>
              <button type="button" className={styles.iconBtn} onClick={() => setDetails(null)} aria-label="Закрыть">
                <X size={16} />
              </button>
            </div>

            <div className={styles.modalMeta}>
              <span className={styles.tag} style={{ background: tagColor(typeLabel(details.event?.type)) }}>
                {typeLabel(details.event?.type)}
              </span>
              <span className={styles.modalText}>
                {details.event?.startsAt
                  ? new Intl.DateTimeFormat('ru-RU', {
                      day: '2-digit',
                      month: 'long',
                      year: 'numeric',
                      ...(details.event?.allDay ? {} : { hour: '2-digit', minute: '2-digit' }),
                    }).format(new Date(details.event.startsAt))
                  : ''}
                {details.event?.allDay ? ' • весь день' : ''}
              </span>
              {details.event?.subject ? <span className={styles.modalText}>• {details.event.subject}</span> : null}
              {details.kind === 'MY' ? <span className={styles.dayPill}>моё</span> : null}
            </div>

            {(details.event?.comment || details.event?.description) ? (
              <div className={styles.modalBlock}>
                <div className={styles.label}>Комментарий</div>
                <div className={styles.modalTextBlock}>{details.event.comment || details.event.description}</div>
              </div>
            ) : null}

            {Array.isArray(details.event?.materials) && details.event.materials.length ? (
              <div className={styles.modalBlock}>
                <div className={styles.label}>Материалы</div>
                <div className={styles.modalList}>
                  {details.event.materials.map((m, idx) => {
                    const url = m?.url;
                    const title = m?.title;
                    if (!url) return null;
                    return (
                      // eslint-disable-next-line react/no-array-index-key
                      <a key={`${url}-${idx}`} className={styles.modalLink} href={url} target="_blank" rel="noreferrer">
                        {title || url}
                      </a>
                    );
                  })}
                </div>
              </div>
            ) : null}

            {details.kind === 'MY' && details.event?.myEventId ? (
              <div className={styles.modalActions}>
                <button
                  type="button"
                  className={styles.btnDanger}
                  onClick={async () => {
                    await deleteMy(details.event.myEventId);
                    setDetails(null);
                  }}
                  disabled={deletingMyEventId === details.event.myEventId}
                >
                  {deletingMyEventId === details.event.myEventId ? <Loader2 size={16} className={styles.spinner} /> : <Trash2 size={16} />}
                  Удалить
                </button>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}


