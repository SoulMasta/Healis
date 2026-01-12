import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Home } from 'lucide-react';
import styles from '../styles/CalendarPage.module.css';

function pad2(n) {
  return String(n).padStart(2, '0');
}

function monthLabel(date) {
  const fmt = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' });
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

const SAMPLE_EVENTS = [
  { date: '2019-08-06', title: 'How to build team time for better mental health at work', tags: ['Lifestyle', 'Business'] },
  { date: '2019-08-08', title: 'All About Accountability: Being Resolute in Resolutions', tags: ['Business'] },
  { date: '2019-08-12', title: 'How We Structure Our CSS', tags: ['Trello', 'Tech'] },
  { date: '2019-08-14', title: 'How to Structure an Editorial Calendar', tags: ['Business'] },
  { date: '2019-08-16', title: 'Meal planning with Trello', tags: ['Lifestyle'] },
  { date: '2019-08-20', title: 'Wedding Planning With Trello', tags: ['Lifestyle'] },
  { date: '2019-08-22', title: 'Trello for Charitable Donations', tags: ['Case study'] },
  { date: '2019-08-26', title: 'Android Material design in depth', tags: ['Trello', 'Tech', 'Financials', 'API'] },
  { date: '2019-08-28', title: 'Using Multiple Boards for a Super Effective Workflow', tags: ['Business'] },
  { date: '2019-08-30', title: 'Create Cards via Email', tags: ['Trello', 'Tech'] },
];

function tagColor(tag) {
  const colors = {
    Lifestyle: '#a855f7',
    Business: '#3b82f6',
    Trello: '#22c55e',
    Tech: '#f59e0b',
    Financials: '#10b981',
    API: '#111827',
    'Case study': '#f97316',
  };
  return colors[tag] || '#64748b';
}

export default function CalendarPage() {
  // default to Aug 2019 to match reference screenshot
  const [cursor, setCursor] = useState(new Date(2019, 7, 1));
  const cells = useMemo(() => buildMonthGrid(cursor), [cursor]);

  const eventsByDay = useMemo(() => {
    const map = new Map();
    for (const e of SAMPLE_EVENTS) {
      const key = e.date;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(e);
    }
    return map;
  }, []);

  const today = new Date();
  const isSameDay = (d1, d2) =>
    d1 && d2 && d1.getFullYear() === d2.getFullYear() && d1.getMonth() === d2.getMonth() && d1.getDate() === d2.getDate();

  const goMonth = (dir) => {
    setCursor((d) => new Date(d.getFullYear(), d.getMonth() + dir, 1));
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
          <button type="button" className={styles.modeBtn}>
            Week
          </button>
          <button type="button" className={`${styles.modeBtn} ${styles.modeBtnActive}`}>
            Month
          </button>
        </div>
      </header>

      <main className={styles.main}>
        <div className={styles.weekHeader}>
          {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
            <div key={d} className={styles.weekDay}>
              {d}
            </div>
          ))}
        </div>

        <div className={styles.grid}>
          {cells.map((date, idx) => {
            const key = date ? `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}` : `empty-${idx}`;
            const events = date ? eventsByDay.get(key) || [] : [];
            const isToday = isSameDay(date, today);
            return (
              <div
                // eslint-disable-next-line react/no-array-index-key
                key={idx}
                className={`${styles.cell} ${date ? '' : styles.cellEmpty} ${isToday ? styles.cellToday : ''}`}
              >
                <div className={styles.cellTop}>
                  <div className={styles.dateNum}>{date ? date.getDate() : ''}</div>
                  {events.length ? <div className={styles.count}>{events.length} card</div> : null}
                </div>

                <div className={styles.cards}>
                  {events.map((e) => (
                    <div key={e.title} className={styles.card}>
                      <div className={styles.tags}>
                        {e.tags.map((t) => (
                          <span key={t} className={styles.tag} style={{ background: tagColor(t) }}>
                            {t}
                          </span>
                        ))}
                      </div>
                      <div className={styles.title}>{e.title}</div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </main>
    </div>
  );
}


