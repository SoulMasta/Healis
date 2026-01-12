import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronRight, LayoutGrid, CalendarDays, Settings } from 'lucide-react';
import styles from '../styles/HomePage.module.css';

const MENU = [
  { key: 'workspace', label: 'Workspace', icon: LayoutGrid, to: '/workspace' },
  { key: 'calendar', label: 'Calendar of events', icon: CalendarDays, to: '/calendar' },
  { key: 'settings', label: 'Settings', icon: Settings, to: '/settings' },
];

function randomTiles() {
  const palette = ['#f59e0b', '#f97316', '#f43f5e', '#a855f7', '#60a5fa', '#22c55e', '#fde047'];
  const tiles = [];
  for (let i = 0; i < 24; i += 1) {
    tiles.push(palette[(i * 7 + 3) % palette.length]);
  }
  return tiles;
}

export default function HomePage() {
  const [active, setActive] = useState(MENU[0].key);
  const navigate = useNavigate();
  const tiles = useMemo(() => randomTiles(), []);

  const activeItem = MENU.find((m) => m.key === active) || MENU[0];

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.brand}>
          <div className={styles.logo}>H</div>
          <div className={styles.brandText}>
            <div className={styles.brandName}>Healis</div>
            <div className={styles.brandSub}>Where would you like to start?</div>
          </div>
        </div>
        <div className={styles.headerRight}>
          <div className={styles.pill}>Free</div>
        </div>
      </header>

      <main className={styles.main}>
        <div className={styles.card}>
          <aside className={styles.left}>
            <div className={styles.leftTitle}>Start</div>
            <nav className={styles.nav} aria-label="Main menu">
              {MENU.map((item) => {
                const Icon = item.icon;
                const isActive = item.key === active;
                return (
                  <button
                    key={item.key}
                    type="button"
                    className={`${styles.navItem} ${isActive ? styles.navItemActive : ''}`}
                    onClick={() => setActive(item.key)}
                  >
                    <span className={styles.navIcon} aria-hidden="true">
                      <Icon size={18} />
                    </span>
                    <span className={styles.navLabel}>{item.label}</span>
                    <span className={styles.navChevron} aria-hidden="true">
                      <ChevronRight size={16} />
                    </span>
                  </button>
                );
              })}
            </nav>
            <div className={styles.leftFooter}>
              <div className={styles.hint}>I want to start from scratch</div>
            </div>
          </aside>

          <section className={styles.right}>
            <div className={styles.rightTop}>
              <div>
                <div className={styles.rightTitle}>{activeItem.label}</div>
                <div className={styles.rightSub}>Pick a page and continue</div>
              </div>
              <button
                type="button"
                className={styles.primary}
                onClick={() => navigate(activeItem.to)}
              >
                Let&apos;s start
              </button>
            </div>

            <div className={styles.preview}>
              {tiles.map((c, idx) => (
                <div
                  // eslint-disable-next-line react/no-array-index-key
                  key={idx}
                  className={styles.tile}
                  style={{ background: c }}
                />
              ))}
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}


