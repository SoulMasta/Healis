import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, Home, Keyboard, Moon, Shield, User } from 'lucide-react';
import styles from '../styles/SettingsPage.module.css';
import { getProfile, updateProfile, uploadAvatar } from '../http/userAPI';
import {
  DEFAULT_SHORTCUTS,
  SHORTCUT_ACTIONS,
  formatShortcut,
  loadShortcuts,
  resetShortcutsToDefaults,
  saveShortcuts,
  shortcutFromKeyboardEvent,
} from '../utils/shortcuts';

function normalizeError(err) {
  return err?.response?.data?.message || err?.response?.data?.error || err?.message || 'Something went wrong';
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
  const [dark, setDark] = useState(false);
  const [notify, setNotify] = useState(true);
  const [tips, setTips] = useState(true);
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
  }, [capturingActionId, shortcuts]);

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

  return (
    <div className={styles.page}>
      <header className={styles.top}>
        <Link to="/home" className={styles.home}>
          <Home size={18} />
          <span>Home</span>
        </Link>
        <div className={styles.title}>Settings</div>
        <div className={styles.spacer} />
      </header>

      <main className={styles.main}>
        <div className={styles.panel}>
          <div className={styles.sectionTitle}>
            <User size={18} /> Profile
          </div>

          <div className={styles.avatarRow}>
            <div className={styles.avatarBox} aria-hidden="true">
              {profile?.avatarUrl ? (
                <img className={styles.avatarImg} src={profile.avatarUrl} alt="" />
              ) : (
                <div className={styles.avatarPlaceholder}>@</div>
              )}
            </div>
            <div className={styles.avatarMeta}>
              <div className={styles.avatarTitle}>Profile photo</div>
              <div className={styles.avatarDesc}>PNG / JPG / WEBP, up to 5MB.</div>
            </div>
            <div className={styles.avatarActions}>
              <input ref={fileRef} className={styles.fileInput} type="file" accept="image/*" onChange={onAvatarSelected} />
              <button type="button" className={styles.secondary} onClick={onPickAvatar} disabled={profileSaving}>
                Upload
              </button>
            </div>
          </div>

          <div className={styles.fieldRow}>
            <label className={styles.label} htmlFor="username">
              Username
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
                placeholder="your_id"
                autoComplete="off"
              />
            </div>
          </div>

          <div className={styles.fieldRow}>
            <label className={styles.label} htmlFor="nickname">
              Nickname
            </label>
            <input
              className={styles.input}
              id="nickname"
              value={form.nickname}
              onChange={(e) => setForm((s) => ({ ...s, nickname: e.target.value }))}
              placeholder="How to display your name"
              autoComplete="off"
            />
          </div>

          <div className={styles.fieldRow}>
            <label className={styles.label} htmlFor="studyGroup">
              Group
            </label>
            <input
              className={styles.input}
              id="studyGroup"
              value={form.studyGroup}
              onChange={(e) => setForm((s) => ({ ...s, studyGroup: e.target.value }))}
              placeholder="e.g. IKBO-01-23"
              autoComplete="off"
            />
          </div>

          <div className={styles.fieldRow}>
            <label className={styles.label} htmlFor="course">
              Course
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
              Faculty
            </label>
            <input
              className={styles.input}
              id="faculty"
              value={form.faculty}
              onChange={(e) => setForm((s) => ({ ...s, faculty: e.target.value }))}
              placeholder="Your faculty"
              autoComplete="off"
            />
          </div>

          <div className={styles.fieldRow}>
            <label className={styles.label} htmlFor="email">
              Email
            </label>
            <input className={styles.input} id="email" value={profile?.email || ''} readOnly />
          </div>

          {profileLoading ? <div className={styles.inlineHint}>Loading profile…</div> : null}
          {profileError ? (
            <div className={styles.inlineError} role="alert">
              {profileError}
            </div>
          ) : null}
          {profileOk ? <div className={styles.inlineOk}>Saved</div> : null}

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
              Reset
            </button>
            <button type="button" className={styles.primary} onClick={onSaveProfile} disabled={!canSaveProfile}>
              Save profile <ChevronRight size={16} />
            </button>
          </div>
        </div>

        <div className={styles.panel}>
          <div className={styles.sectionTitle}>
            <Shield size={18} /> Preferences
          </div>

          <Toggle
            value={notify}
            onChange={setNotify}
            label="Notifications"
            description="Receive updates about changes and reminders."
          />
          <Toggle
            value={tips}
            onChange={setTips}
            label="Tips & onboarding"
            description="Show hints when the workspace is empty."
          />
          <Toggle
            value={dark}
            onChange={setDark}
            label="Dark mode (UI preview)"
            description="A visual toggle only (no theme persistence yet)."
          />

          <div className={styles.actionRow}>
            <button type="button" className={styles.secondary}>
              Reset to defaults
            </button>
            <button type="button" className={styles.primary}>
              Save changes <ChevronRight size={16} />
            </button>
          </div>
        </div>

        <div className={styles.panel}>
          <div className={styles.sectionTitle}>
            <Keyboard size={18} /> Hotkeys
          </div>
          <div className={styles.hotkeysHint}>
            Hotkeys use <span className={styles.kbd}>KeyboardEvent.code</span> so they work the same in EN/RU layouts.
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
                      {isCapturing ? 'Press keys… (Esc — cancel)' : formatShortcut(current)}
                    </div>
                    <button
                      type="button"
                      className={styles.hotkeyEdit}
                      onClick={() => setCapturingActionId(a.id)}
                      aria-pressed={isCapturing}
                    >
                      {isCapturing ? 'Listening…' : 'Edit'}
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
              Reset hotkeys
            </button>
            <button
              type="button"
              className={styles.primary}
              onClick={() => {
                saveShortcuts(shortcuts);
                setCapturingActionId(null);
              }}
            >
              Save hotkeys <ChevronRight size={16} />
            </button>
          </div>
        </div>

        <div className={styles.note}>
          <Moon size={16} />
          <span>
            Settings UI is ready; when you add backend endpoints later, we can persist these values.
          </span>
        </div>
      </main>
    </div>
  );
}


