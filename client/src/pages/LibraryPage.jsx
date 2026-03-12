import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, Plus } from 'lucide-react';
import { getAllWorkspaces, createWorkspace } from '../http/workspaceAPI';
import { getToken } from '../http/userAPI';
import styles from '../styles/HomePage.module.css';

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

export default function LibraryPage() {
  const navigate = useNavigate();
  const [token] = useState(() => getToken());
  const user = useMemo(() => (token ? safeParseJwt(token) : null), [token]);

  const [loading, setLoading] = useState(false);
  const [boards, setBoards] = useState([]);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      setLoading(true);
      try {
        const ws = await getAllWorkspaces();
        if (!mounted) return;
        setBoards(Array.isArray(ws) ? ws : []);
      } catch {
        if (!mounted) return;
        setBoards([]);
      } finally {
        if (mounted) setLoading(false);
      }
    };
    load();
    return () => {
      mounted = false;
    };
  }, []);

  const filtered = useMemo(() => {
    // Prefer explicit library flag; fallback to course/faculty matching if available.
    const course = user?.course || user?.courseId || null;
    const faculty = user?.faculty || user?.facultyId || null;
    const lib = boards.filter((b) => {
      if (b?.isLibrary) return true;
      if (course && faculty && b.course && b.faculty) {
        return String(b.course) === String(course) && String(b.faculty) === String(faculty);
      }
      return false;
    });
    return lib;
  }, [boards, user]);

  const openBoard = (b) => navigate(`/workspace/${b.id}`);

  const handleCreate = async () => {
    if (!token) return navigate('/auth');
    const name = window.prompt('Название доски библиотеки');
    if (!name || !name.trim()) return;
    setCreating(true);
    try {
      const created = await createWorkspace({ name: name.trim(), description: 'Library board' });
      // Optionally mark as library on server later; for now navigate to board.
      navigate(`/workspace/${created.id}`);
    } catch (err) {
      // eslint-disable-next-line no-alert
      alert(err?.response?.data?.error || 'Не удалось создать доску');
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className={styles.page}>
      <header className={styles.topbar}>
        <div className={styles.brand}>
          <div className={styles.logo} aria-hidden="true">H</div>
          <div className={styles.brandName}>Healis</div>
        </div>
        <div style={{ flex: 1 }} />
        <div className={styles.topActions}>
          <button type="button" className={styles.btnPrimary} onClick={handleCreate} disabled={creating}>
            {creating ? <Loader2 size={16} className={styles.spinner} /> : <Plus size={16} />}
            Создать доску
          </button>
        </div>
      </header>

      <div className={styles.shell}>
        <main className={styles.content} style={{ width: '100%' }}>
          <div className={styles.contentTop}>
            <div className={styles.contentTitle}>Библиотека</div>
          </div>

          {loading ? (
            <div className={styles.loadingState}>
              <Loader2 size={22} className={styles.spinner} />
              <span>Загрузка...</span>
            </div>
          ) : !filtered.length ? (
            <div className={styles.empty}>
              <div className={styles.emptyTitle}>Материалы библиотеки не найдены</div>
              <div className={styles.emptySub}>Материалы будут отображаться по вашему факультету и курсу.</div>
            </div>
          ) : (
            <div className={styles.boardGrid}>
              {filtered.map((b) => (
                <div
                  key={b.id}
                  className={styles.boardCard}
                  role="button"
                  tabIndex={0}
                  onClick={() => openBoard(b)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      openBoard(b);
                    }
                  }}
                >
                  <div className={styles.cardTop}>
                    <div className={styles.boardTitle}>{b?.name || 'Без названия'}</div>
                  </div>
                  <div className={styles.previewArea} aria-hidden="true" />
                  <div className={styles.metaList}>
                    <div className={styles.boardMeta}>Владелец: {b?.ownerName || b?.userId || '—'}</div>
                    <div className={styles.boardMeta}>Изменена: {b?.updatedAt ? new Date(b.updatedAt).toLocaleString() : '—'}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

