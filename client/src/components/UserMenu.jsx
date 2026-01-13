import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LogIn, LogOut, UserRound, Users, ChevronDown } from 'lucide-react';
import { getToken, logout as apiLogout } from '../http/userAPI';
import styles from '../styles/UserMenu.module.css';

function safeParseJwt(token) {
  try {
    const parts = String(token).split('.');
    if (parts.length < 2) return null;
    const base64Url = parts[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');
    const json = atob(padded);
    return JSON.parse(json);
  } catch {
    return null;
  }
}

export default function UserMenu({ variant = 'default' }) {
  const navigate = useNavigate();
  const rootRef = useRef(null);

  const [token, setToken] = useState(() => getToken());
  const [open, setOpen] = useState(false);

  const user = useMemo(() => (token ? safeParseJwt(token) : null), [token]);
  const email = user?.email || '';
  const initial = (email || 'U').trim().charAt(0).toUpperCase() || 'U';

  useEffect(() => {
    const onStorage = (e) => {
      if (e.key === 'token') setToken(e.newValue);
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  useEffect(() => {
    const onDocDown = (e) => {
      const root = rootRef.current;
      if (!root) return;
      if (!root.contains(e.target)) setOpen(false);
    };
    const onKeyDown = (e) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDocDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onDocDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, []);

  const goAuth = () => {
    setOpen(false);
    navigate('/auth');
  };

  const doLogout = () => {
    apiLogout();
    setToken(null);
    setOpen(false);
    navigate('/home');
  };

  const goAccount = () => {
    setOpen(false);
    navigate('/settings');
  };

  if (!token) {
    return (
      <button
        type="button"
        className={variant === 'compact' ? styles.signInBtnCompact : styles.signInBtn}
        onClick={goAuth}
      >
        <LogIn size={18} />
        <span>Sign in</span>
      </button>
    );
  }

  return (
    <div className={styles.root} ref={rootRef}>
      <button
        type="button"
        className={variant === 'compact' ? styles.avatarBtnCompact : styles.avatarBtn}
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <span className={styles.avatar} aria-hidden="true">
          {initial}
        </span>
        <ChevronDown size={16} className={styles.chev} aria-hidden="true" />
      </button>

      {open ? (
        <div className={styles.menu} role="menu">
          <div className={styles.menuHeader}>
            <div className={styles.menuAvatar} aria-hidden="true">
              {initial}
            </div>
            <div className={styles.menuMeta}>
              <div className={styles.menuTitle}>Account</div>
              <div className={styles.menuSub}>{email || 'Signed in'}</div>
            </div>
          </div>

          <div className={styles.menuList}>
            <button type="button" className={styles.menuItem} onClick={goAccount} role="menuitem">
              <UserRound size={18} />
              <span>Account</span>
            </button>
            <button type="button" className={styles.menuItem} onClick={goAuth} role="menuitem">
              <Users size={18} />
              <span>Switch account</span>
            </button>
            <div className={styles.divider} />
            <button type="button" className={styles.menuItemDanger} onClick={doLogout} role="menuitem">
              <LogOut size={18} />
              <span>Logout</span>
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}


