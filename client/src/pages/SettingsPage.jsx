import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ChevronRight, Home, Keyboard, Moon, Shield, User, LogOut } from 'lucide-react';
import styles from '../styles/SettingsPage.module.css';
import { getProfile, updateProfile, uploadAvatar, serverLogout } from '../http/userAPI';
import { resolveUploadUrl } from '../config/runtime';
import { useBreakpoints } from '../hooks/useBreakpoints';
import MobileLayout from '../mobile/MobileLayout';
import {
  DEFAULT_SHORTCUTS,
  SHORTCUT_ACTIONS,
  formatShortcut,
  loadShortcuts,
  resetShortcutsToDefaults,
  saveShortcuts,
  shortcutFromKeyboardEvent,
} from '../utils/shortcuts';
import { applyThemePreference, loadPreferences, resetPreferences, savePreferences } from '../utils/preferences';
import { requestNotificationPermissionIfNeeded } from '../utils/systemNotification';
import { toast } from '../utils/toast';

function normalizeError(err) {
  return err?.response?.data?.message || err?.response?.data?.error || err?.message || 'Что-то пошло не так';
}

function Toggle({ value, onChange, label, description }) {
  return (
    <div className={styles.toggleRow}>
      <div>
        <div className={styles.toggleLabel}>{label}</div>
        <div className={styles.toggleDesc}>{description}</div>
      </div>
      <button
        type="button"
        className={`${styles.toggle} ${value ? styles.toggleOn : ''}`}
        onClick={() => onChange(!value)}
        aria-pressed={value}
      >
        <span className={styles.toggleKnob} />
      </button>
    </div>
  );
}

export default function SettingsPage() {
  const navigate = useNavigate();
  const { isMobile } = useBreakpoints();

  const initialPrefs = useMemo(() => loadPreferences(), []);
  const [dark, setDark] = useState(Boolean(initialPrefs.dark));
  const [notify, setNotify] = useState(Boolean(initialPrefs.notifications));
  const [tips, setTips] = useState(Boolean(initialPrefs.tips));
  const [prefsOk, setPrefsOk] = useState(false);

  const [shortcuts, setShortcuts] = useState(() => loadShortcuts());
  const [capturingActionId, setCapturingActionId] = useState(null);

  const fileRef = useRef(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileError, setProfileError] = useState(null);
  const [profileOk, setProfileOk] = useState(false);

  const [profile, setProfile] = useState(null);
  const [form, setForm] = useState({
    username: '',
    nickname: '',
    studyGroup: '',
    course: '',
    faculty: '',
  });

  // Sync theme immediately when toggled.
  useEffect(() => {
    applyThemePreference({ dark });
  }, [dark]);

  // Keep toggles in sync if preferences were changed in another tab/page.
  useEffect(() => {
    const apply = () => {
      const p = loadPreferences();
      setDark(Boolean(p.dark));
      setNotify(Boolean(p.notifications));
      setTips(Boolean(p.tips));
    };
    const onStorage = (e) => {
      if (e.key === 'healis.preferences.v1') apply();
    };
    window.addEventListener('healis:preferences', apply);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener('healis:preferences', apply);
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  useEffect(() => {
    let alive = true;
    setProfileLoading(true);
    setProfileError(null);
    getProfile()
      .then((data) => {
        if (!alive) return;
        const p = data?.profile || null;
        setProfile(p);
        setForm({
          username: p?.username || '',
          nickname: p?.nickname || '',
          studyGroup: p?.studyGroup || '',
          course: p?.course ? String(p.course) : '',
          faculty: p?.faculty || '',
        });
      })
      .catch((err) => {
        if (!alive) return;
        setProfileError(normalizeError(err));
      })
      .finally(() => {
        if (!alive) return;
        setProfileLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    if (isMobile) return () => {};
    if (!capturingActionId) return () => {};

    const onKeyDown = (e) => {
      if (e.code === 'Escape') {
        e.preventDefault();
        setCapturingActionId(null);
        return;
      }
      // Avoid capturing pure modifier keys.
      if (['ShiftLeft', 'ShiftRight', 'ControlLeft', 'ControlRight', 'AltLeft', 'AltRight', 'MetaLeft', 'MetaRight'].includes(e.code)) {
        e.preventDefault();
        return;
      }
      e.preventDefault();
      const next = { ...shortcuts, [capturingActionId]: shortcutFromKeyboardEvent(e) };
      setShortcuts(next);
      saveShortcuts(next);
      setCapturingActionId(null);
    };

    window.addEventListener('keydown', onKeyDown, { capture: true });
    return () => window.removeEventListener('keydown', onKeyDown, { capture: true });
  }, [capturingActionId, shortcuts, isMobile]);

  const canSaveProfile = useMemo(() => {
    if (profileLoading || profileSaving) return false;
    if (!form.username.trim()) return false;
    return true;
  }, [profileLoading, profileSaving, form.username]);

  const onSaveProfile = async () => {
    setProfileError(null);
    setProfileOk(false);
    setProfileSaving(true);
    try {
      const res = await updateProfile({
        username: form.username,
        nickname: form.nickname,
        studyGroup: form.studyGroup,
        course: form.course,
        faculty: form.faculty,
      });
      const p = res?.profile || null;
      setProfile(p);
      setForm({
        username: p?.username || '',
        nickname: p?.nickname || '',
        studyGroup: p?.studyGroup || '',
        course: p?.course ? String(p.course) : '',
        faculty: p?.faculty || '',
      });
      setProfileOk(true);
      window.setTimeout(() => setProfileOk(false), 1800);
    } catch (err) {
      setProfileError(normalizeError(err));
    } finally {
      setProfileSaving(false);
    }
  };

  const onPickAvatar = () => fileRef.current?.click();

  const onAvatarSelected = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setProfileError(null);
    setProfileOk(false);
    setProfileSaving(true);
    try {
      const res = await uploadAvatar(file);
      const p = res?.profile || null;
      setProfile(p);
      setProfileOk(true);
      window.setTimeout(() => setProfileOk(false), 1800);
    } catch (err) {
      setProfileError(normalizeError(err));
    } finally {
      setProfileSaving(false);
      // allow re-uploading the same file
      e.target.value = '';
    }
  };

  const requestBrowserNotificationsPermission = async () => {
    await requestNotificationPermissionIfNeeded();
    if ('Notification' in window && window.Notification.permission !== 'granted') {
      toast({
        kind: 'warning',
        title: 'Уведомления',
        message: 'Разрешение на уведомления не выдано. Напоминания будут показываться только внутри приложения.',
      });
    }
  };

  const savePrefsUi = () => {
    setPrefsOk(false);
    const next = savePreferences({ notifications: notify, tips, dark });
    applyThemePreference(next);
    setPrefsOk(true);
    window.setTimeout(() => setPrefsOk(false), 1800);
    toast({ kind: 'success', title: 'Настройки', message: 'Изменения сохранены.' });
  };

  const resetPrefsUi = () => {
    setPrefsOk(false);
    const next = resetPreferences();
    setNotify(Boolean(next.notifications));
    setTips(Boolean(next.tips));
    setDark(Boolean(next.dark));
    applyThemePreference(next);
    setPrefsOk(true);
    window.setTimeout(() => setPrefsOk(false), 1800);
    toast({ kind: 'success', title: 'Настройки', message: 'Настройки сброшены.' });
  };

  const onLogout = async () => {
    try {
      await serverLogout();
    } catch {
      // ignore
    } finally {
      navigate('/home');
      window.dispatchEvent(new Event('healis:token'));
    }
  };

  const content = (
    <main className={styles.main}>
        <div className={styles.panel}>
          <div className={styles.sectionTitle}>
            <User size={18} /> Профиль
          </div>

          <div className={styles.avatarRow}>
            <div className={styles.avatarBox} aria-hidden="true">
              {profile?.avatarUrl ? (
                <img className={styles.avatarImg} src={resolveUploadUrl(profile.avatarUrl)} alt="" />
              ) : (
                <div className={styles.avatarPlaceholder}>@</div>
              )}
            </div>
            <div className={styles.avatarMeta}>
              <div className={styles.avatarTitle}>Фото профиля</div>
              <div className={styles.avatarDesc}>PNG / JPG / WEBP, до 5 МБ.</div>
            </div>
            <div className={styles.avatarActions}>
              <input ref={fileRef} className={styles.fileInput} type="file" accept="image/*" onChange={onAvatarSelected} />
              <button type="button" className={styles.secondary} onClick={onPickAvatar} disabled={profileSaving}>
                Загрузить
              </button>
            </div>
          </div>

          <div className={styles.fieldRow}>
            <label className={styles.label} htmlFor="username">
              Имя пользователя
            </label>
            <div className={styles.usernameWrap}>
              <span className={styles.at}>@</span>
              <input
                className={styles.input}
                id="username"
                value={form.username}
                onChange={(e) => {
                  const v = e.target.value;
                  setForm((s) => ({ ...s, username: v.startsWith('@') ? v.slice(1) : v }));
                }}
                placeholder="ваш_id"
                autoComplete="off"
              />
            </div>
          </div>

          <div className={styles.fieldRow}>
            <label className={styles.label} htmlFor="nickname">
              Ник
            </label>
            <input
              className={styles.input}
              id="nickname"
              value={form.nickname}
              onChange={(e) => setForm((s) => ({ ...s, nickname: e.target.value }))}
              placeholder="Как показывать ваше имя"
              autoComplete="off"
            />
          </div>

          <div className={styles.fieldRow}>
            <label className={styles.label} htmlFor="studyGroup">
              Группа
            </label>
            <input
              className={styles.input}
              id="studyGroup"
              value={form.studyGroup}
              onChange={(e) => setForm((s) => ({ ...s, studyGroup: e.target.value }))}
              placeholder="например: ИКБО-01-23"
              autoComplete="off"
            />
          </div>

          <div className={styles.fieldRow}>
            <label className={styles.label} htmlFor="course">
              Курс
            </label>
            <input
              className={styles.input}
              id="course"
              inputMode="numeric"
              value={form.course}
              onChange={(e) => setForm((s) => ({ ...s, course: e.target.value }))}
              placeholder="1"
              autoComplete="off"
            />
          </div>

          <div className={styles.fieldRow}>
            <label className={styles.label} htmlFor="faculty">
              Факультет
            </label>
            <input
              className={styles.input}
              id="faculty"
              value={form.faculty}
              onChange={(e) => setForm((s) => ({ ...s, faculty: e.target.value }))}
              placeholder="Ваш факультет"
              autoComplete="off"
            />
          </div>

          <div className={styles.fieldRow}>
            <label className={styles.label} htmlFor="email">
              Почта
            </label>
            <input className={styles.input} id="email" value={profile?.email || ''} readOnly />
          </div>

          {profileLoading ? <div className={styles.inlineHint}>Загрузка профиля…</div> : null}
          {profileError ? (
            <div className={styles.inlineError} role="alert">
              {profileError}
            </div>
          ) : null}
          {profileOk ? <div className={styles.inlineOk}>Сохранено</div> : null}

          <div className={styles.actionRow}>
            <button
              type="button"
              className={styles.secondary}
              onClick={() => {
                const p = profile;
                setForm({
                  username: p?.username || '',
                  nickname: p?.nickname || '',
                  studyGroup: p?.studyGroup || '',
                  course: p?.course ? String(p.course) : '',
                  faculty: p?.faculty || '',
                });
                setProfileOk(false);
                setProfileError(null);
              }}
              disabled={profileSaving || profileLoading}
            >
              Сбросить
            </button>
            <button type="button" className={styles.primary} onClick={onSaveProfile} disabled={!canSaveProfile}>
              Сохранить <ChevronRight size={16} />
            </button>
          </div>
        </div>

        <div className={styles.panel}>
          <div className={styles.sectionTitle}>
            <Shield size={18} /> Предпочтения
          </div>

          <Toggle
            value={notify}
            onChange={(v) => {
              setNotify(v);
              if (v) requestBrowserNotificationsPermission();
            }}
            label="Уведомления"
            description="Напоминания о ближайших событиях (за неделю, за 3 дня и за 1 день)."
          />
          <Toggle
            value={tips}
            onChange={setTips}
            label="Подсказки"
            description="Показывать подсказки в пустых разделах (если они предусмотрены)."
          />
          <Toggle
            value={dark}
            onChange={setDark}
            label="Тёмная тема"
            description="Тема сохраняется в настройках устройства/браузера."
          />

          <div className={styles.actionRow}>
            <button type="button" className={styles.secondary} onClick={resetPrefsUi}>
              Сбросить
            </button>
            <button type="button" className={styles.primary} onClick={savePrefsUi}>
              Сохранить <ChevronRight size={16} />
            </button>
          </div>
          {prefsOk ? <div className={styles.inlineOk}>Сохранено</div> : null}
        </div>

        {!isMobile ? (
          <div className={styles.panel}>
            <div className={styles.sectionTitle}>
              <Keyboard size={18} /> Горячие клавиши
            </div>
            <div className={styles.hotkeysHint}>
              Горячие клавиши используют <span className={styles.kbd}>KeyboardEvent.code</span>, поэтому работают одинаково в EN/RU раскладках.
            </div>

            <div className={styles.hotkeysList}>
              {SHORTCUT_ACTIONS.map((a) => {
                const current = shortcuts[a.id] || DEFAULT_SHORTCUTS[a.id];
                const isCapturing = capturingActionId === a.id;
                return (
                  <div key={a.id} className={styles.hotkeyRow}>
                    <div>
                      <div className={styles.hotkeyLabel}>{a.label}</div>
                      <div className={styles.hotkeyDesc}>{a.description}</div>
                    </div>
                    <div className={styles.hotkeyRight}>
                      <div className={`${styles.hotkeyValue} ${isCapturing ? styles.hotkeyValueActive : ''}`}>
                        {isCapturing ? 'Нажмите клавиши… (Esc — отмена)' : formatShortcut(current)}
                      </div>
                      <button
                        type="button"
                        className={styles.hotkeyEdit}
                        onClick={() => setCapturingActionId(a.id)}
                        aria-pressed={isCapturing}
                      >
                        {isCapturing ? 'Слушаю…' : 'Изменить'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className={styles.actionRow}>
              <button
                type="button"
                className={styles.secondary}
                onClick={() => {
                  const next = resetShortcutsToDefaults();
                  setShortcuts(next);
                  setCapturingActionId(null);
                }}
              >
                Сбросить хоткеи
              </button>
              <button
                type="button"
                className={styles.primary}
                onClick={() => {
                  saveShortcuts(shortcuts);
                  setCapturingActionId(null);
                  toast({ kind: 'success', title: 'Хоткеи', message: 'Сохранено.' });
                }}
              >
                Сохранить <ChevronRight size={16} />
              </button>
            </div>
          </div>
        ) : null}

        <div className={styles.panel}>
          <div className={styles.sectionTitle}>
            <LogOut size={18} /> Аккаунт
          </div>
          <div className={styles.actionRow}>
            <Link to="/auth" className={styles.secondary}>
              Сменить аккаунт
            </Link>
            <button type="button" className={styles.primary} onClick={onLogout}>
              Выйти <ChevronRight size={16} />
            </button>
          </div>
        </div>

        <div className={styles.note}>
          <Moon size={16} />
          <span>
            Настройки сохраняются в браузере. Когда появятся эндпоинты на бэкенде — перенесём сохранение в профиль.
          </span>
        </div>
      </main>
  );

  if (isMobile) {
    return (
      <MobileLayout title="Настройки" backTo="/home" rightSlot={null} padded={false}>
        {content}
      </MobileLayout>
    );
  }

  return (
    <div className={styles.page}>
      <header className={styles.top}>
        <Link to="/home" className={styles.home}>
          <Home size={18} />
          <span>Главная</span>
        </Link>
        <div className={styles.title}>Настройки</div>
        <div className={styles.spacer} />
      </header>

      {content}
    </div>
  );
}


