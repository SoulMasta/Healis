import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LogIn, LogOut, UserRound, Users, ChevronDown } from 'lucide-react';
import { getToken, serverLogout } from '../http/userAPI';
import { resolveUploadUrl } from '../config/runtime';
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

export default function UserMenu({ variant = 'default', iconClickMode = 'menu', avatarSize }) {
  const navigate = useNavigate();
  const rootRef = useRef(null);

  const [token, setToken] = useState(() => getToken());
  const [open, setOpen] = useState(false);

  const user = useMemo(() => (token ? safeParseJwt(token) : null), [token]);
  const email = user?.email || '';
  const username = user?.username ? `@${user.username}` : '';
  const avatarUrl = resolveUploadUrl(user?.avatarUrl || '');
  const initial = (email || 'U').trim().charAt(0).toUpperCase() || 'U';

  useEffect(() => {
    const onStorage = (e) => {
      if (e.key === 'token') setToken(e.newValue);
    };
    const onToken = () => setToken(getToken());
    window.addEventListener('storage', onStorage);
    window.addEventListener('healis:token', onToken);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('healis:token', onToken);
    };
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

  const doLogout = async () => {
    await serverLogout();
    setToken(null);
    setOpen(false);
    navigate('/home');
  };

  const goAccount = () => {
    setOpen(false);
    navigate('/settings');
  };

  const isCompact = variant === 'compact';
  const isIcon = variant === 'icon';
  const isBare = variant === 'bare';

  if (!token) {
    return (
      <button
        type="button"
        className={
          isBare ? styles.signInBtnBare : isIcon ? styles.signInBtnIcon : isCompact ? styles.signInBtnCompact : styles.signInBtn
        }
        onClick={goAuth}
        aria-label={isIcon || isBare ? 'Войти' : undefined}
        title={isIcon || isBare ? 'Войти' : undefined}
      >
        <LogIn size={18} />
        {isIcon || isBare ? null : <span>Войти</span>}
      </button>
    );
  }

  const isCompactAvatar = avatarSize === 'compact';
  return (
    <div className={`${styles.root} ${isCompactAvatar ? styles.rootAvatarCompact : ''}`} ref={rootRef}>
      <button
        type="button"
        className={
          isBare ? styles.avatarBtnBare : isIcon ? styles.avatarBtnIcon : isCompact ? styles.avatarBtnCompact : styles.avatarBtn
        }
        onClick={() => {
          if ((isIcon || isBare) && iconClickMode === 'settings') {
            goAccount();
            return;
          }
          setOpen((v) => !v);
        }}
        aria-haspopup={(isIcon || isBare) && iconClickMode === 'settings' ? undefined : 'menu'}
        aria-expanded={(isIcon || isBare) && iconClickMode === 'settings' ? undefined : open}
        aria-label={isIcon || isBare ? 'Профиль' : undefined}
        title={isIcon || isBare ? 'Профиль' : undefined}
      >
        <span className={styles.avatar} aria-hidden="true">
          {avatarUrl ? <img className={styles.avatarImg} src={avatarUrl} alt="" /> : initial}
        </span>
        {isIcon || isBare ? null : <ChevronDown size={16} className={styles.chev} aria-hidden="true" />}
      </button>

      {open ? (
        <div className={styles.menu} role="menu">
          <div className={styles.menuHeader}>
            <div className={styles.menuAvatar} aria-hidden="true">
              {avatarUrl ? <img className={styles.menuAvatarImg} src={avatarUrl} alt="" /> : initial}
            </div>
            <div className={styles.menuMeta}>
              <div className={styles.menuTitle}>Аккаунт</div>
              <div className={styles.menuSub}>{username || email || 'Вы вошли'}</div>
            </div>
          </div>

          <div className={styles.menuList}>
            <button type="button" className={styles.menuItem} onClick={goAccount} role="menuitem">
              <UserRound size={18} />
              <span>Настройки</span>
            </button>
            <button type="button" className={styles.menuItem} onClick={goAuth} role="menuitem">
              <Users size={18} />
              <span>Сменить аккаунт</span>
            </button>
            <div className={styles.divider} />
            <button type="button" className={styles.menuItemDanger} onClick={doLogout} role="menuitem">
              <LogOut size={18} />
              <span>Выйти</span>
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}


