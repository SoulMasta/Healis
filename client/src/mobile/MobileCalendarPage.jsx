import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Loader2, Plus, Trash2, X } from 'lucide-react';
import MobileLayout from './MobileLayout';
import styles from './MobileCalendarPage.module.css';
import {
  createGroupCalendarEvent,
  createGroupCalendarPeriod,
  createMyCalendarEvent,
  deleteGroupCalendarEvent,
  deleteGroupCalendarPeriod,
  getGroupCalendarEvents,
  getGroupCalendarPeriods,
  getMyCalendar,
} from '../http/calendarAPI';
import { getMyGroups } from '../http/groupAPI';
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

function typeLabel(type) {
  const t = String(type || '').toUpperCase();
  const map = {
    CT: 'ЦТ',
    EXAM: 'Экзамен',
    COLLOQUIUM: 'Коллоквиум',
    DEADLINE: 'ДЗ',
    HOMEWORK: 'ДЗ',
    OTHER: 'Другое',
  };
  return map[t] || t || 'Событие';
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
    const parts = line.split('|').map((p) => p.trim()).filter(Boolean);
    if (!parts.length) continue;
    const url = parts.length === 1 ? parts[0] : parts[parts.length - 1];
    const title = parts.length >= 2 ? parts.slice(0, -1).join(' | ') : '';
    if (!url) continue;
    out.push(title ? { title, url } : { url });
  }
  return out;
}

function Tabs({ value, onChange, options, ariaLabel }) {
  return (
    <div className={styles.tabs} role="tablist" aria-label={ariaLabel || 'Tabs'}>
      {options.map((t) => (
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

function CreateEventSheet({ open, onClose, onCreated, defaultDate }) {
  const [title, setTitle] = useState('');
  const [type, setType] = useState('CT');
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [mode, setMode] = useState('allDay'); // allDay | time
  const [time, setTime] = useState('09:00');
  const [subject, setSubject] = useState('');
  const [comment, setComment] = useState('');
  const [materialsText, setMaterialsText] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) {
      setTitle('');
      setType('CT');
      setDate(defaultDate || new Date().toISOString().slice(0, 10));
      setMode('allDay');
      setTime('09:00');
      setSubject('');
      setComment('');
      setMaterialsText('');
      setBusy(false);
    }
  }, [open, defaultDate]);

  const submit = async (e) => {
    e.preventDefault();
    if (!title.trim()) return;
    setBusy(true);
    try {
      const allDay = mode === 'allDay';
      const startsAt = new Date(`${date}T${allDay ? '00:00' : time || '09:00'}`).toISOString();
      await createMyCalendarEvent({
        title: title.trim(),
        type,
        subject: subject.trim() || null,
        comment: comment.trim() || null,
        materials: parseMaterialsText(materialsText),
        startsAt,
        allDay,
      });
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
            <div className={styles.fieldLabel}>Тип</div>
            <select className={styles.input} value={type} onChange={(e) => setType(e.target.value)}>
              <option value="CT">ЦТ</option>
              <option value="EXAM">Экзамен</option>
              <option value="COLLOQUIUM">Коллоквиум</option>
              <option value="HOMEWORK">ДЗ</option>
              <option value="OTHER">Другое</option>
            </select>
          </label>
          <label className={styles.field}>
            <div className={styles.fieldLabel}>Дата</div>
            <input className={styles.input} type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
          <label className={styles.field}>
            <div className={styles.fieldLabel}>Режим</div>
            <select className={styles.input} value={mode} onChange={(e) => setMode(e.target.value)}>
              <option value="allDay">Весь день</option>
              <option value="time">Указать время</option>
            </select>
          </label>
          <label className={styles.field}>
            <div className={styles.fieldLabel}>Время</div>
            <input className={styles.input} type="time" value={time} onChange={(e) => setTime(e.target.value)} disabled={mode !== 'time'} />
          </label>
          <label className={styles.field}>
            <div className={styles.fieldLabel}>Предмет (опц.)</div>
            <input className={styles.input} value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Например: Анатомия" />
          </label>
          <label className={styles.field}>
            <div className={styles.fieldLabel}>Комментарий (опц.)</div>
            <textarea className={styles.textarea} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Что нужно сделать/подготовить…" />
          </label>
          <label className={styles.field}>
            <div className={styles.fieldLabel}>Материалы (опц.)</div>
            <textarea
              className={styles.textarea}
              value={materialsText}
              onChange={(e) => setMaterialsText(e.target.value)}
              placeholder={'Ссылки, по одной на строку\nили: Название | https://...'}
            />
          </label>
          <div className={styles.sheetActions}>
            <button type="button" className={styles.btnGhost} onClick={onClose} disabled={busy}>
              Отмена
            </button>
            <button type="submit" className={styles.btnPrimary} disabled={busy || !title.trim()}>
              {busy ? <Loader2 size={16} className={styles.spinner} /> : <Plus size={16} />}
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
  const [view, setView] = useState('month'); // month | day
  const [mode, setMode] = useState('my'); // my | starosta
  const [calendar, setCalendar] = useState(null);
  const [loading, setLoading] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [showDetails, setShowDetails] = useState(null); // { kind, event }

  const [groups, setGroups] = useState([]);
  const myGroup = useMemo(() => (Array.isArray(groups) && groups.length ? groups[0] : null), [groups]);
  const myGroupId = myGroup?.groupId || null;
  const canManageMyGroup = myGroup?.myRole === 'OWNER' || myGroup?.myRole === 'ADMIN';

  const [groupEvents, setGroupEvents] = useState([]);
  const [groupPeriods, setGroupPeriods] = useState([]);
  const [loadingGroup, setLoadingGroup] = useState(false);
  const [creatingGroupEvent, setCreatingGroupEvent] = useState(false);
  const [creatingGroupPeriod, setCreatingGroupPeriod] = useState(false);
  const [deletingGroupId, setDeletingGroupId] = useState(null); // 'e:ID' | 'p:ID'

  const [gTitle, setGTitle] = useState('');
  const [gType, setGType] = useState('CT');
  const [gDate, setGDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [gMode, setGMode] = useState('allDay'); // allDay | time
  const [gTime, setGTime] = useState('09:00');
  const [gSubject, setGSubject] = useState('');
  const [gComment, setGComment] = useState('');
  const [gMaterialsText, setGMaterialsText] = useState('');

  const [pType, setPType] = useState('SEMESTER');
  const [pTitle, setPTitle] = useState('');
  const [pStart, setPStart] = useState(() => new Date().toISOString().slice(0, 10));
  const [pEnd, setPEnd] = useState(() => new Date().toISOString().slice(0, 10));

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

  const loadGroups = useCallback(async () => {
    if (!token) {
      setGroups([]);
      return;
    }
    try {
      const data = await getMyGroups();
      setGroups(Array.isArray(data) ? data : []);
    } catch {
      setGroups([]);
    }
  }, [token]);

  const loadGroupData = useCallback(async () => {
    if (!token || !myGroupId || !canManageMyGroup) {
      setGroupEvents([]);
      setGroupPeriods([]);
      return;
    }
    setLoadingGroup(true);
    try {
      const [ev, pr] = await Promise.all([
        getGroupCalendarEvents(myGroupId, { month: monthParam(cursor) }),
        getGroupCalendarPeriods(myGroupId, { month: monthParam(cursor) }),
      ]);
      setGroupEvents(Array.isArray(ev?.events) ? ev.events : []);
      setGroupPeriods(Array.isArray(pr?.periods) ? pr.periods : []);
    } catch {
      setGroupEvents([]);
      setGroupPeriods([]);
    } finally {
      setLoadingGroup(false);
    }
  }, [token, myGroupId, canManageMyGroup, cursor]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    loadGroups();
  }, [loadGroups]);

  useEffect(() => {
    if (mode !== 'starosta') return;
    loadGroupData();
  }, [mode, loadGroupData]);

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
      map.get(key).push({ kind: 'GROUP', event: ev });
    }
    const mine = Array.isArray(calendar?.myEvents) ? calendar.myEvents : [];
    for (const ev of mine) {
      const key = isoDateKey(ev?.startsAt);
      if (!key) continue;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push({ kind: 'MY', event: ev });
    }
    // sort by startsAt
    for (const [k, list] of map.entries()) {
      list.sort((a, b) => String(a?.event?.startsAt || '').localeCompare(String(b?.event?.startsAt || '')));
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

  const shiftSelectedDay = (delta) => {
    const cur = selectedKey ? new Date(selectedKey) : new Date();
    if (Number.isNaN(cur.getTime())) return;
    const next = new Date(cur.getFullYear(), cur.getMonth(), cur.getDate() + Number(delta || 0));
    const key = isoDateKey(next);
    if (!key) return;
    setSelectedKey(key);
    setCursor(new Date(next.getFullYear(), next.getMonth(), 1));
  };

  const submitCreateGroupEvent = async (e) => {
    e.preventDefault();
    if (!myGroupId) return;
    if (!gTitle.trim()) return;
    setCreatingGroupEvent(true);
    try {
      const allDay = gMode === 'allDay';
      const startsAt = new Date(`${gDate}T${allDay ? '00:00' : gTime || '09:00'}`).toISOString();
      await createGroupCalendarEvent(myGroupId, {
        title: gTitle.trim(),
        type: gType,
        subject: gSubject.trim() || null,
        comment: gComment.trim() || null,
        materials: parseMaterialsText(gMaterialsText),
        startsAt,
        allDay,
      });
      setGTitle('');
      setGSubject('');
      setGComment('');
      setGMaterialsText('');
      await loadGroupData();
    } catch (err) {
      // eslint-disable-next-line no-alert
      alert(err?.response?.data?.error || err?.message || 'Не удалось создать событие');
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
      // eslint-disable-next-line no-alert
      alert(err?.response?.data?.error || err?.message || 'Не удалось создать период');
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
      // eslint-disable-next-line no-alert
      alert(err?.response?.data?.error || err?.message || 'Не удалось удалить');
    } finally {
      setDeletingGroupId(null);
    }
  };

  return (
    <MobileLayout title="Календарь" padded={false}>
      <div className={styles.wrap}>
        {canManageMyGroup ? (
          <Tabs
            value={mode}
            onChange={setMode}
            ariaLabel="Режим"
            options={[
              { id: 'my', label: 'Мой' },
              { id: 'starosta', label: 'Староста' },
            ]}
          />
        ) : null}

        <Tabs
          value={view}
          onChange={setView}
          ariaLabel="Вид"
          options={[
            { id: 'month', label: 'Месяц' },
            { id: 'day', label: 'День' },
          ]}
        />

        {mode === 'starosta' ? (
          <>
            <div className={styles.listCard}>
              <div className={styles.listHeader}>
                <div className={styles.listTitle}>События группы</div>
              </div>
              <form className={styles.sheetForm} onSubmit={submitCreateGroupEvent}>
                <label className={styles.field}>
                  <div className={styles.fieldLabel}>Название *</div>
                  <input className={styles.input} value={gTitle} onChange={(e) => setGTitle(e.target.value)} placeholder="Например: Коллоквиум" />
                </label>
                <label className={styles.field}>
                  <div className={styles.fieldLabel}>Тип</div>
                  <select className={styles.input} value={gType} onChange={(e) => setGType(e.target.value)}>
                    <option value="CT">ЦТ</option>
                    <option value="EXAM">Экзамен</option>
                    <option value="COLLOQUIUM">Коллоквиум</option>
                    <option value="HOMEWORK">ДЗ</option>
                    <option value="OTHER">Другое</option>
                  </select>
                </label>
                <label className={styles.field}>
                  <div className={styles.fieldLabel}>Дата</div>
                  <input className={styles.input} type="date" value={gDate} onChange={(e) => setGDate(e.target.value)} />
                </label>
                <label className={styles.field}>
                  <div className={styles.fieldLabel}>Режим</div>
                  <select className={styles.input} value={gMode} onChange={(e) => setGMode(e.target.value)}>
                    <option value="allDay">Весь день</option>
                    <option value="time">Указать время</option>
                  </select>
                </label>
                <label className={styles.field}>
                  <div className={styles.fieldLabel}>Время</div>
                  <input className={styles.input} type="time" value={gTime} onChange={(e) => setGTime(e.target.value)} disabled={gMode !== 'time'} />
                </label>
                <label className={styles.field}>
                  <div className={styles.fieldLabel}>Предмет (опц.)</div>
                  <input className={styles.input} value={gSubject} onChange={(e) => setGSubject(e.target.value)} placeholder="Например: Анатомия" />
                </label>
                <label className={styles.field}>
                  <div className={styles.fieldLabel}>Комментарий (опц.)</div>
                  <textarea className={styles.textarea} value={gComment} onChange={(e) => setGComment(e.target.value)} />
                </label>
                <label className={styles.field}>
                  <div className={styles.fieldLabel}>Материалы (опц.)</div>
                  <textarea className={styles.textarea} value={gMaterialsText} onChange={(e) => setGMaterialsText(e.target.value)} />
                </label>
                <button type="submit" className={styles.btnPrimary} disabled={creatingGroupEvent || !gTitle.trim()}>
                  {creatingGroupEvent ? <Loader2 size={16} className={styles.spinner} /> : <Plus size={16} />}
                  Добавить
                </button>
              </form>
              {loadingGroup ? <div className={styles.state}>Загрузка…</div> : null}
              {groupEvents.length ? (
                <div className={styles.eventList}>
                  {groupEvents.map((ev) => {
                    const busy = deletingGroupId === `e:${ev.eventId}`;
                    return (
                      <div key={ev.eventId} className={styles.eventRow}>
                        <div className={styles.time}>{ev.allDay ? '—' : timeLabel(ev.startsAt) || '—'}</div>
                        <div className={styles.eventCard}>
                          <div className={styles.eventTitle}>{ev.title}</div>
                          <div className={styles.eventSub}>{typeLabel(ev.type)}{ev.subject ? ` • ${ev.subject}` : ''}</div>
                          <button
                            type="button"
                            className={styles.inlineIconBtn}
                            onClick={() => deleteGroupItem('e', ev.eventId)}
                            disabled={busy}
                            aria-label="Удалить"
                            title="Удалить"
                          >
                            {busy ? <Loader2 size={16} className={styles.spinner} /> : <Trash2 size={16} />}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : null}
            </div>

            <div className={styles.listCard}>
              <div className={styles.listHeader}>
                <div className={styles.listTitle}>Периоды</div>
              </div>
              <form className={styles.sheetForm} onSubmit={submitCreateGroupPeriod}>
                <label className={styles.field}>
                  <div className={styles.fieldLabel}>Тип</div>
                  <select className={styles.input} value={pType} onChange={(e) => setPType(e.target.value)}>
                    <option value="SEMESTER">Семестр</option>
                    <option value="SESSION">Сессия</option>
                    <option value="VACATION">Каникулы</option>
                  </select>
                </label>
                <label className={styles.field}>
                  <div className={styles.fieldLabel}>Название (опц.)</div>
                  <input className={styles.input} value={pTitle} onChange={(e) => setPTitle(e.target.value)} placeholder="Можно оставить пустым" />
                </label>
                <label className={styles.field}>
                  <div className={styles.fieldLabel}>Начало</div>
                  <input className={styles.input} type="date" value={pStart} onChange={(e) => setPStart(e.target.value)} />
                </label>
                <label className={styles.field}>
                  <div className={styles.fieldLabel}>Конец</div>
                  <input className={styles.input} type="date" value={pEnd} onChange={(e) => setPEnd(e.target.value)} />
                </label>
                <button type="submit" className={styles.btnPrimary} disabled={creatingGroupPeriod}>
                  {creatingGroupPeriod ? <Loader2 size={16} className={styles.spinner} /> : <Plus size={16} />}
                  Добавить период
                </button>
              </form>
              {groupPeriods.length ? (
                <div className={styles.eventList}>
                  {groupPeriods.map((p) => {
                    const busy = deletingGroupId === `p:${p.periodId}`;
                    return (
                      <div key={p.periodId} className={styles.eventRow}>
                        <div className={styles.time}>—</div>
                        <div className={styles.eventCard}>
                          <div className={styles.eventTitle}>{p.title}</div>
                          <div className={styles.eventSub}>
                            {p.type === 'SEMESTER' ? 'Семестр' : p.type === 'SESSION' ? 'Сессия' : 'Каникулы'}
                          </div>
                          <button
                            type="button"
                            className={styles.inlineIconBtn}
                            onClick={() => deleteGroupItem('p', p.periodId)}
                            disabled={busy}
                            aria-label="Удалить"
                            title="Удалить"
                          >
                            {busy ? <Loader2 size={16} className={styles.spinner} /> : <Trash2 size={16} />}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : null}
            </div>
          </>
        ) : view === 'month' ? (
          <>
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
                  {selectedEvents.map(({ kind, event: ev }, i) => (
                    <button
                      // eslint-disable-next-line react/no-array-index-key
                      key={`${ev?.myEventId || ev?.eventId || i}`}
                      type="button"
                      className={styles.eventRowBtn}
                      onClick={() => setShowDetails({ kind, event: ev })}
                    >
                      <div className={styles.time}>{ev?.allDay ? '—' : timeLabel(ev?.startsAt) || '—'}</div>
                      <div className={styles.eventCard}>
                        <div className={styles.eventTitle}>{ev?.title || 'Событие'}</div>
                        <div className={styles.eventSub}>
                          {typeLabel(ev?.type)}
                          {ev?.subject ? ` • ${ev.subject}` : ''}
                          {kind === 'MY' ? ' • моё' : ''}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              ) : (
                <div className={styles.state}>На выбранный день событий нет.</div>
              )}
            </div>
          </>
        ) : (
          <div className={styles.listCard}>
            <div className={styles.listHeader}>
              <button type="button" className={`${styles.iconBtn} tapTarget`} onClick={() => shiftSelectedDay(-1)} aria-label="Предыдущий день">
                <ChevronLeft size={20} />
              </button>
              <div className={styles.listTitle}>{selectedTitle}</div>
              <button type="button" className={`${styles.iconBtn} tapTarget`} onClick={() => shiftSelectedDay(1)} aria-label="Следующий день">
                <ChevronRight size={20} />
              </button>
            </div>
            {token ? (
              <button type="button" className={styles.addBtn} onClick={() => setShowCreate(true)}>
                <Plus size={16} />
                Добавить
              </button>
            ) : null}
            {!token ? (
              <div className={styles.state}>Войдите, чтобы видеть календарь.</div>
            ) : loading ? (
              <div className={styles.state}>Загрузка…</div>
            ) : selectedEvents.length ? (
              <div className={styles.eventList}>
                {selectedEvents.map(({ kind, event: ev }, i) => (
                  <button
                    // eslint-disable-next-line react/no-array-index-key
                    key={`${ev?.myEventId || ev?.eventId || i}-d`}
                    type="button"
                    className={styles.eventRowBtn}
                    onClick={() => setShowDetails({ kind, event: ev })}
                  >
                    <div className={styles.time}>{ev?.allDay ? '—' : timeLabel(ev?.startsAt) || '—'}</div>
                    <div className={styles.eventCard}>
                      <div className={styles.eventTitle}>{ev?.title || 'Событие'}</div>
                      <div className={styles.eventSub}>
                        {typeLabel(ev?.type)}
                        {ev?.subject ? ` • ${ev.subject}` : ''}
                        {kind === 'MY' ? ' • моё' : ''}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <div className={styles.state}>На выбранный день событий нет.</div>
            )}
          </div>
        )}
      </div>

      <CreateEventSheet open={showCreate} onClose={() => setShowCreate(false)} onCreated={load} defaultDate={selectedKey} />

      {showDetails?.event ? (
        <div className={styles.sheetOverlay} onClick={() => setShowDetails(null)} role="presentation">
          <div className={styles.sheet} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
            <div className={styles.sheetHandle} aria-hidden="true" />
            <div className={styles.detailsHeader}>
              <div className={styles.sheetTitle}>{showDetails.event?.title || 'Событие'}</div>
              <button type="button" className={styles.iconBtn} onClick={() => setShowDetails(null)} aria-label="Закрыть">
                <X size={18} />
              </button>
            </div>
            <div className={styles.detailsMeta}>
              {typeLabel(showDetails.event?.type)}
              {showDetails.event?.subject ? ` • ${showDetails.event.subject}` : ''}
              {showDetails.event?.startsAt
                ? ` • ${new Intl.DateTimeFormat('ru-RU', {
                    day: '2-digit',
                    month: '2-digit',
                    ...(showDetails.event?.allDay ? {} : { hour: '2-digit', minute: '2-digit' }),
                  }).format(new Date(showDetails.event.startsAt))}`
                : ''}
              {showDetails.kind === 'MY' ? ' • моё' : ''}
            </div>
            {(showDetails.event?.comment || showDetails.event?.description) ? (
              <div className={styles.detailsBlock}>
                <div className={styles.fieldLabel}>Комментарий</div>
                <div className={styles.detailsText}>{showDetails.event.comment || showDetails.event.description}</div>
              </div>
            ) : null}
            {Array.isArray(showDetails.event?.materials) && showDetails.event.materials.length ? (
              <div className={styles.detailsBlock}>
                <div className={styles.fieldLabel}>Материалы</div>
                <div className={styles.detailsLinks}>
                  {showDetails.event.materials.map((m, idx) => (
                    // eslint-disable-next-line react/no-array-index-key
                    <a key={`${m?.url || idx}`} href={m?.url} target="_blank" rel="noreferrer" className={styles.detailsLink}>
                      {m?.title || m?.url}
                    </a>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </MobileLayout>
  );
}


