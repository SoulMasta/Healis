import React, { useEffect, useMemo, useState } from 'react';
import styles from './ToastHost.module.css';

function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}

export default function ToastHost() {
  const [items, setItems] = useState([]);

  useEffect(() => {
    const onToast = (e) => {
      const t = e?.detail;
      if (!t?.id) return;
      const durationMs = clamp(Number(t.durationMs ?? 4200), 1200, 12000);
      const item = {
        id: String(t.id),
        title: String(t.title || ''),
        message: String(t.message || ''),
        kind: String(t.kind || 'info'),
        durationMs,
      };
      setItems((prev) => {
        // de-dupe same id
        const next = prev.filter((x) => x.id !== item.id);
        next.push(item);
        return next.slice(-4);
      });

      window.setTimeout(() => {
        setItems((prev) => prev.filter((x) => x.id !== item.id));
      }, durationMs);
    };

    window.addEventListener('healis:toast', onToast);
    return () => window.removeEventListener('healis:toast', onToast);
  }, []);

  const rendered = useMemo(
    () =>
      items.map((t) => (
        <div key={t.id} className={`${styles.toast} ${styles[`toast_${t.kind}`] || ''}`} role="status" aria-live="polite">
          {t.title ? <div className={styles.title}>{t.title}</div> : null}
          {t.message ? <div className={styles.message}>{t.message}</div> : null}
        </div>
      )),
    [items]
  );

  if (!items.length) return null;
  return <div className={styles.host}>{rendered}</div>;
}

