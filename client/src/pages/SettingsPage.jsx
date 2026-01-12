import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, Home, Moon, Shield, User } from 'lucide-react';
import styles from '../styles/SettingsPage.module.css';

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
          <div className={styles.fieldRow}>
            <label className={styles.label} htmlFor="name">
              Name
            </label>
            <input className={styles.input} id="name" defaultValue="User" />
          </div>
          <div className={styles.fieldRow}>
            <label className={styles.label} htmlFor="email">
              Email
            </label>
            <input className={styles.input} id="email" defaultValue="user@example.com" />
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


