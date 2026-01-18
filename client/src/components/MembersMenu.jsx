import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Users, X, Loader2 } from 'lucide-react';
import styles from '../styles/MembersMenu.module.css';
import { getGroupMembers } from '../http/groupAPI';

function emailToUsername(email) {
  const s = String(email || '').trim();
  if (!s) return 'User';
  return s.split('@')[0] || s;
}

export default function MembersMenu({ groupId, presentUserIds = new Set(), buttonClassName }) {
  const rootRef = useRef(null);

  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [members, setMembers] = useState([]);

  const activeMembers = useMemo(() => {
    if (!Array.isArray(members)) return [];
    // Prefer ACTIVE members first; keep invited below.
    const list = members.slice();
    list.sort((a, b) => {
      const as = a?.status === 'ACTIVE' ? 0 : 1;
      const bs = b?.status === 'ACTIVE' ? 0 : 1;
      return as - bs;
    });
    return list;
  }, [members]);

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

  useEffect(() => {
    if (!open) return;
    if (!groupId) {
      setMembers([]);
      setError(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);
    getGroupMembers(groupId)
      .then((data) => {
        if (cancelled) return;
        setMembers(Array.isArray(data) ? data : []);
      })
      .catch((err) => {
        if (cancelled) return;
        setMembers([]);
        setError(err?.response?.data?.error || err?.message || 'Failed to load members');
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, groupId]);

  const onlineCount = useMemo(() => {
    let n = 0;
    for (const m of activeMembers) {
      const userId = m?.user?.id ?? m?.userId;
      if (userId != null && presentUserIds.has(userId)) n += 1;
    }
    return n;
  }, [activeMembers, presentUserIds]);

  return (
    <div className={styles.root} ref={rootRef}>
      <button
        type="button"
        className={`${styles.buttonBase} ${buttonClassName || styles.button}`}
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label="Members"
      >
        <Users size={18} />
        {onlineCount > 0 ? <span className={styles.badge}>{onlineCount}</span> : null}
      </button>

      {open ? (
        <div className={styles.menu} role="dialog" aria-label="Members list">
          <div className={styles.header}>
            <div className={styles.title}>Members</div>
            <button type="button" className={styles.closeBtn} onClick={() => setOpen(false)} aria-label="Close">
              <X size={16} />
            </button>
          </div>

          <div className={styles.body}>
            {!groupId ? <div className={styles.empty}>This workspace is not linked to a group.</div> : null}

            {loading ? (
              <div className={styles.loading}>
                <Loader2 size={16} className={styles.spinner} />
                <span>Loading...</span>
              </div>
            ) : null}

            {error ? <div className={styles.error}>{error}</div> : null}

            {!loading && groupId && !error ? (
              <div className={styles.list}>
                {activeMembers.map((m) => {
                  const email = m?.user?.email || '';
                  const username = emailToUsername(email);
                  const userId = m?.user?.id ?? m?.userId;
                  const isOnline = userId != null ? presentUserIds.has(userId) : false;
                  const initial = (username || 'U').trim().charAt(0).toUpperCase() || 'U';
                  const statusLabel =
                    m?.status === 'INVITED' ? 'invited' : isOnline ? 'online on board' : 'offline';
                  return (
                    <div key={`${m?.id ?? ''}-${userId ?? ''}`} className={styles.item}>
                      <div className={styles.avatar} aria-hidden="true">
                        {initial}
                      </div>
                      <div className={styles.meta}>
                        <div className={styles.nameRow}>
                          <div className={styles.name}>{username}</div>
                          <span className={`${styles.dot} ${isOnline ? styles.dotOnline : styles.dotOffline}`} />
                        </div>
                        <div className={styles.sub}>
                          {statusLabel}
                          {m?.role ? ` · ${String(m.role).toLowerCase()}` : ''}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}


