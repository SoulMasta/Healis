import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { Bell, CalendarDays, LayoutGrid, ArrowLeft } from 'lucide-react';
import UserMenu from '../components/UserMenu';
import styles from './MobileLayout.module.css';

function TabLink({ to, icon: Icon, label }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) => `${styles.tab} ${isActive ? styles.tabActive : ''}`}
      aria-label={label}
      title={label}
    >
      <span className={styles.tabIcon} aria-hidden="true">
        <Icon size={20} />
      </span>
    </NavLink>
  );
}

export default function MobileLayout({
  title,
  subtitle,
  children,
  backTo,
  leftSlot,
  rightSlot,
  hideTabBar = false,
  padded = true,
}) {
  const navigate = useNavigate();
  return (
    <div className={styles.app}>
      <header className={`${styles.header} safeTopPad`}>
        <div className={styles.headerLeft}>
          {backTo ? (
            <button
              type="button"
              className={`${styles.headerBtn} tapTarget`}
              onClick={() => (backTo === -1 ? navigate(-1) : navigate(backTo))}
              aria-label="Назад"
              title="Назад"
            >
              <ArrowLeft size={20} />
            </button>
          ) : (
            leftSlot || <div className={styles.headerSpacer} />
          )}
        </div>

        <div className={styles.headerCenter}>
          {title ? <div className={styles.headerTitle}>{title}</div> : null}
          {subtitle ? <div className={styles.headerSubtitle}>{subtitle}</div> : null}
        </div>

        <div className={styles.headerRight}>{rightSlot !== undefined ? rightSlot : <UserMenu variant="compact" />}</div>
      </header>

      <main className={`${styles.content} ${hideTabBar ? styles.noTabbar : ''} ${padded ? styles.padded : ''}`}>{children}</main>

      {!hideTabBar ? (
        <nav className={`${styles.tabbar} safeBottomPad`} aria-label="Навигация">
          <div className={styles.tabbarInner}>
            <TabLink to="/home" icon={LayoutGrid} label="Доски" />
            <TabLink to="/notifications" icon={Bell} label="Уведомления" />
            <TabLink to="/calendar" icon={CalendarDays} label="Календарь" />
          </div>
        </nav>
      ) : null}
    </div>
  );
}


