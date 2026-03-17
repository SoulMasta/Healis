import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, Plus } from 'lucide-react';
import { getAllWorkspaces, createWorkspace } from '../http/workspaceAPI';
import { getToken } from '../http/userAPI';
import { getSubjects } from '../http/libraryAPI';
import styles from '../styles/HomePage.module.css';

function safeParseJwt(token) {
  try {
    const parts = String(token).split('.');
    if (parts.length < 2) return null;
    const base64Url = parts[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');
    const binary = atob(padded);
    try {
      if (typeof TextDecoder !== 'undefined') {
        const bytes = Uint8Array.from(binary.split('').map((c) => c.charCodeAt(0)));
        const json = new TextDecoder('utf-8').decode(bytes);
        return JSON.parse(json);
      }
    } catch (_) {}
    const jsonFallback = decodeURIComponent(
      binary
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
    return JSON.parse(jsonFallback);
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
  const [subjects, setSubjects] = useState([]);
  const [creating, setCreating] = useState(false);
  const [selectedSubject, setSelectedSubject] = useState(null);

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

  // Load subjects from server when user available
  useEffect(() => {
    let mounted = true;
    const loadSubjects = async () => {
      if (!user) return;
      try {
        const subs = await getSubjects(user.faculty || user.facultyId, user.course || user.courseId);
        if (!mounted) return;
        setSubjects(Array.isArray(subs) ? subs : []);
      } catch (e) {
        if (!mounted) return;
        setSubjects([]);
      }
    };
    loadSubjects();
    return () => {
      mounted = false;
    };
  }, [user]);

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
          ) : selectedSubject ? (
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
                <button type="button" className={styles.btnSecondary} onClick={() => setSelectedSubject(null)}>
                  ← Назад
                </button>
                <h3 style={{ margin: 0 }}>{selectedSubject.name}</h3>
              </div>

              <div style={{ marginBottom: 12, color: '#444' }}>Категории</div>
              <div className={styles.boardGrid}>
                {['Notes', 'Exams', 'Flashcards', 'Tables', 'Practice'].map((cat) => {
                  const subjectBoards = filtered.filter((b) =>
                    String(b.name || '').toLowerCase().includes((selectedSubject.name || '').toLowerCase())
                  );
                  return (
                    <div key={cat} className={styles.boardCard}>
                      <div className={styles.cardTop}>
                        <div className={styles.boardTitle}>{cat}</div>
                        <div style={{ marginLeft: 'auto', fontSize: 12, color: '#666' }}>
                          {subjectBoards.length} досок
                        </div>
                      </div>
                      <div style={{ padding: 8 }}>
                        {subjectBoards.length ? (
                          subjectBoards.slice(0, 10).map((b) => (
                            <div key={b.id} style={{ padding: 8, borderBottom: '1px solid #eee' }}>
                              <div style={{ fontWeight: 600 }}>{b.name}</div>
                              <div style={{ fontSize: 12, color: '#666' }}>
                                {b.ownerName || b.userId || '—'} · {b.updatedAt ? new Date(b.updatedAt).toLocaleDateString() : '—'}
                              </div>
                            </div>
                          ))
                        ) : (
                          <div style={{ color: '#777' }}>No materials exist for this subject yet. Create the first board.</div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : !subjects.length ? (
            <div className={styles.empty}>
              <div className={styles.emptyTitle}>Материалы библиотеки не найдены</div>
              <div className={styles.emptySub}>Материалы будут отображаться по вашему факультету и курсу.</div>
            </div>
          ) : (
            <div>
              <div style={{ marginBottom: 12, color: '#444' }}>Предметы</div>
              <div className={styles.boardGrid}>
                {subjects.map((s) => {
                  const count = filtered.filter((b) => String(b.name || '').toLowerCase().includes((s.name || '').toLowerCase())).length;
                  return (
                    <div
                      key={s.id}
                      className={styles.boardCard}
                      role="button"
                      tabIndex={0}
                      onClick={() => setSelectedSubject(s)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          setSelectedSubject(s);
                        }
                      }}
                    >
                      <div className={styles.cardTop}>
                        <div className={styles.boardTitle}>{s.name}</div>
                      </div>
                      <div className={styles.previewArea} aria-hidden="true" />
                      <div className={styles.metaList}>
                        <div className={styles.boardMeta}>Досок: {count}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

