import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import MobileLayout from './MobileLayout';
import styles from './MobileCalendarPage.module.css';
import { createMyCalendarEvent, getMyCalendar } from '../http/calendarAPI';
import { getToken } from '../http/userAPI';

function pad2(n) {
  return String(n).padStart(2, '0');
}

function monthParam(date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}`;
}

function monthLabel(date) {
  return new Intl.DateTimeFormat('ru-RU', { month: 'long', year: 'numeric' }).format(date);
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

function isoDateKey(d) {
  const dt = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(dt.getTime())) return null;
  return `${dt.getFullYear()}-${pad2(dt.getMonth() + 1)}-${pad2(dt.getDate())}`;
}

function timeLabel(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit' }).format(d);
}

function CreateEventSheet({ open, onClose, onCreated }) {
  const [title, setTitle] = useState('');
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) {
      setTitle('');
      setDate(new Date().toISOString().slice(0, 10));
      setBusy(false);
    }
  }, [open]);

  const submit = async (e) => {
    e.preventDefault();
    if (!title.trim()) return;
    setBusy(true);
    try {
      const startsAt = new Date(`${date}T00:00`).toISOString();
      await createMyCalendarEvent({ title: title.trim(), type: 'CT', subject: null, startsAt, allDay: true });
      onCreated?.();
      onClose?.();
    } catch (err) {
      // eslint-disable-next-line no-alert
      alert(err?.response?.data?.error || err?.message || 'Не удалось создать событие');
    } finally {
      setBusy(false);
    }
  };

  if (!open) return null;

  return (
    <div className={styles.sheetOverlay} onClick={onClose} role="presentation">
      <div className={styles.sheet} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className={styles.sheetHandle} aria-hidden="true" />
        <div className={styles.sheetTitle}>Добавить событие</div>
        <form className={styles.sheetForm} onSubmit={submit}>
          <label className={styles.field}>
            <div className={styles.fieldLabel}>Название *</div>
            <input className={styles.input} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Например: Лекция" autoFocus />
          </label>
          <label className={styles.field}>
            <div className={styles.fieldLabel}>Дата</div>
            <input className={styles.input} type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
          <div className={styles.sheetActions}>
            <button type="button" className={styles.btnGhost} onClick={onClose} disabled={busy}>
              Отмена
            </button>
            <button type="submit" className={styles.btnPrimary} disabled={busy || !title.trim()}>
              <Plus size={16} />
              Добавить
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function MobileCalendarPage() {
  const [token, setToken] = useState(() => getToken());
  const [cursor, setCursor] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [selectedKey, setSelectedKey] = useState(() => isoDateKey(new Date()));
  const [calendar, setCalendar] = useState(null);
  const [loading, setLoading] = useState(false);
  const [showCreate, setShowCreate] = useState(false);

  const cells = useMemo(() => buildMonthGrid(cursor), [cursor]);

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

  const load = useCallback(async () => {
    if (!token) {
      setCalendar(null);
      return;
    }
    setLoading(true);
    try {
      const data = await getMyCalendar({ month: monthParam(cursor) });
      setCalendar(data || null);
    } catch (e) {
      setCalendar(null);
    } finally {
      setLoading(false);
    }
  }, [cursor, token]);

  useEffect(() => {
    load();
  }, [load]);

  // Keep selection inside the current month.
  useEffect(() => {
    const sel = selectedKey ? new Date(selectedKey) : null;
    const inMonth =
      sel && !Number.isNaN(sel.getTime()) && sel.getMonth() === cursor.getMonth() && sel.getFullYear() === cursor.getFullYear();
    if (inMonth) return;
    setSelectedKey(isoDateKey(new Date(cursor.getFullYear(), cursor.getMonth(), 1)));
  }, [cursor, selectedKey]);

  const eventsByDay = useMemo(() => {
    const map = new Map();
    const confirmed = Array.isArray(calendar?.confirmed) ? calendar.confirmed : [];
    for (const row of confirmed) {
      const ev = row?.event;
      const key = isoDateKey(ev?.startsAt);
      if (!key) continue;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(ev);
    }
    const mine = Array.isArray(calendar?.myEvents) ? calendar.myEvents : [];
    for (const ev of mine) {
      const key = isoDateKey(ev?.startsAt);
      if (!key) continue;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(ev);
    }
    // sort by startsAt
    for (const [k, list] of map.entries()) {
      list.sort((a, b) => String(a?.startsAt || '').localeCompare(String(b?.startsAt || '')));
      map.set(k, list);
    }
    return map;
  }, [calendar]);

  const selectedEvents = useMemo(() => {
    if (!selectedKey) return [];
    return eventsByDay.get(selectedKey) || [];
  }, [eventsByDay, selectedKey]);

  const selectedTitle = useMemo(() => {
    if (!selectedKey) return 'События';
    const d = new Date(selectedKey);
    if (Number.isNaN(d.getTime())) return 'События';
    const now = new Date();
    const isToday = d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
    if (isToday) return 'Сегодня';
    return new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: 'long' }).format(d);
  }, [selectedKey]);

  const title = monthLabel(cursor);

  return (
    <MobileLayout title="Календарь" padded={false}>
      <div className={styles.wrap}>
        <div className={styles.calCard}>
          <div className={styles.calHeader}>
            <button
              type="button"
              className={`${styles.iconBtn} tapTarget`}
              onClick={() => setCursor((d) => new Date(d.getFullYear(), d.getMonth() - 1, 1))}
              aria-label="Предыдущий месяц"
            >
              <ChevronLeft size={20} />
            </button>
            <div className={styles.monthTitle}>{title}</div>
            <button
              type="button"
              className={`${styles.iconBtn} tapTarget`}
              onClick={() => setCursor((d) => new Date(d.getFullYear(), d.getMonth() + 1, 1))}
              aria-label="Следующий месяц"
            >
              <ChevronRight size={20} />
            </button>
          </div>

          <div className={styles.weekRow} aria-hidden="true">
            {['П', 'В', 'С', 'Ч', 'П', 'С', 'В'].map((d) => (
              <div key={d} className={styles.weekDay}>
                {d}
              </div>
            ))}
          </div>

          <div className={styles.grid} role="grid" aria-label="Календарь">
            {cells.map((d, idx) => {
              const key = d ? isoDateKey(d) : `e-${idx}`;
              const isSel = d && isoDateKey(d) === selectedKey;
              const hasEvents = d && (eventsByDay.get(isoDateKey(d)) || []).length > 0;
              return (
                <button
                  key={key}
                  type="button"
                  className={`${styles.cell} ${isSel ? styles.cellActive : ''}`}
                  onClick={() => d && setSelectedKey(isoDateKey(d))}
                  disabled={!d}
                  role="gridcell"
                  aria-selected={isSel}
                >
                  {d ? <span className={styles.dayNum}>{d.getDate()}</span> : <span className={styles.dayNum} />}
                  {hasEvents ? <span className={styles.dot} aria-hidden="true" /> : null}
                </button>
              );
            })}
          </div>
        </div>

        <div className={styles.listCard}>
          <div className={styles.listHeader}>
            <div className={styles.listTitle}>{selectedTitle}</div>
            {token ? (
              <button type="button" className={styles.addBtn} onClick={() => setShowCreate(true)}>
                <Plus size={16} />
                Добавить
              </button>
            ) : null}
          </div>

          {!token ? (
            <div className={styles.state}>Войдите, чтобы видеть календарь.</div>
          ) : loading ? (
            <div className={styles.state}>Загрузка…</div>
          ) : selectedEvents.length ? (
            <div className={styles.eventList}>
              {selectedEvents.map((ev, i) => (
                <div key={`${ev?.id || ev?.eventId || i}`} className={styles.eventRow}>
                  <div className={styles.time}>{timeLabel(ev?.startsAt) || '—'}</div>
                  <div className={styles.eventCard}>
                    <div className={styles.eventTitle}>{ev?.title || 'Событие'}</div>
                    {ev?.subject ? <div className={styles.eventSub}>{ev.subject}</div> : null}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className={styles.state}>На выбранный день событий нет.</div>
          )}
        </div>
      </div>

      <CreateEventSheet open={showCreate} onClose={() => setShowCreate(false)} onCreated={load} />
    </MobileLayout>
  );
}


