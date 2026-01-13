import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronRight, LayoutGrid, CalendarDays, Settings, Plus, X, Loader2 } from 'lucide-react';
import { getAllWorkspaces, createWorkspace } from '../http/workspaceAPI';
import styles from '../styles/HomePage.module.css';

const MENU = [
  { key: 'workspace', label: 'Workspace', icon: LayoutGrid, to: '/workspace' },
  { key: 'calendar', label: 'Calendar of events', icon: CalendarDays, to: '/calendar' },
  { key: 'settings', label: 'Settings', icon: Settings, to: '/settings' },
];

function randomTiles() {
  const palette = ['#f59e0b', '#f97316', '#f43f5e', '#a855f7', '#60a5fa', '#22c55e', '#fde047'];
  const tiles = [];
  for (let i = 0; i < 24; i += 1) {
    tiles.push(palette[(i * 7 + 3) % palette.length]);
  }
  return tiles;
}

function CreateBoardModal({ isOpen, onClose, onCreate, loading }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    onCreate({ name: name.trim(), description: description.trim() });
  };

  const handleClose = () => {
    setName('');
    setDescription('');
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className={styles.modalOverlay} onClick={handleClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <h2 className={styles.modalTitle}>Create New Board</h2>
          <button type="button" className={styles.modalClose} onClick={handleClose} aria-label="Close">
            <X size={20} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className={styles.modalForm}>
          <div className={styles.formGroup}>
            <label htmlFor="boardName" className={styles.formLabel}>Board Name *</label>
            <input
              id="boardName"
              type="text"
              className={styles.formInput}
              placeholder="Enter board name..."
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
              required
            />
          </div>
          <div className={styles.formGroup}>
            <label htmlFor="boardDesc" className={styles.formLabel}>Description (optional)</label>
            <textarea
              id="boardDesc"
              className={styles.formTextarea}
              placeholder="Add a description for your board..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
            />
          </div>
          <div className={styles.modalActions}>
            <button type="button" className={styles.cancelBtn} onClick={handleClose}>
              Cancel
            </button>
            <button type="submit" className={styles.submitBtn} disabled={!name.trim() || loading}>
              {loading ? <Loader2 size={18} className={styles.spinner} /> : null}
              Create Board
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function WorkspaceCard({ workspace, onClick }) {
  const gradients = [
    'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
    'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
    'linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)',
    'linear-gradient(135deg, #fa709a 0%, #fee140 100%)',
    'linear-gradient(135deg, #a8edea 0%, #fed6e3 100%)',
  ];
  const gradient = gradients[workspace.id % gradients.length];

  return (
    <button type="button" className={styles.workspaceCard} onClick={onClick}>
      <div className={styles.workspaceThumb} style={{ background: gradient }}>
        <span className={styles.workspaceInitial}>{workspace.name.charAt(0).toUpperCase()}</span>
      </div>
      <div className={styles.workspaceInfo}>
        <div className={styles.workspaceName}>{workspace.name}</div>
        {workspace.description && (
          <div className={styles.workspaceDesc}>{workspace.description}</div>
        )}
      </div>
    </button>
  );
}

export default function HomePage() {
  const [active, setActive] = useState(MENU[0].key);
  const [workspaces, setWorkspaces] = useState([]);
  const [loadingWorkspaces, setLoadingWorkspaces] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const navigate = useNavigate();
  const tiles = useMemo(() => randomTiles(), []);

  const activeItem = MENU.find((m) => m.key === active) || MENU[0];

  const fetchWorkspaces = useCallback(async () => {
    setLoadingWorkspaces(true);
    try {
      const data = await getAllWorkspaces();
      setWorkspaces(data);
    } catch (err) {
      console.error('Failed to load workspaces:', err);
    } finally {
      setLoadingWorkspaces(false);
    }
  }, []);

  useEffect(() => {
    if (active === 'workspace') {
      fetchWorkspaces();
    }
  }, [active, fetchWorkspaces]);

  const handleCreateBoard = async ({ name, description }) => {
    setCreating(true);
    try {
      // Using userId=1 as placeholder (should come from auth context in real app)
      const newWorkspace = await createWorkspace({ name, description, userId: 1 });
      setShowCreateModal(false);
      navigate(`/workspace/${newWorkspace.id}`);
    } catch (err) {
      console.error('Failed to create workspace:', err);
      alert(err.response?.data?.error || 'Failed to create workspace');
    } finally {
      setCreating(false);
    }
  };

  const handleWorkspaceClick = (workspace) => {
    navigate(`/workspace/${workspace.id}`);
  };

  const renderWorkspaceContent = () => {
    if (loadingWorkspaces) {
      return (
        <div className={styles.loadingState}>
          <Loader2 size={32} className={styles.spinner} />
          <span>Loading workspaces...</span>
        </div>
      );
    }

    if (workspaces.length === 0) {
      return (
        <div className={styles.emptyState}>
          <div className={styles.emptyIcon}>
            <LayoutGrid size={48} />
          </div>
          <div className={styles.emptyTitle}>No workspaces yet</div>
          <div className={styles.emptySub}>Create your first board to get started</div>
          <button
            type="button"
            className={styles.createFirstBtn}
            onClick={() => setShowCreateModal(true)}
          >
            <Plus size={18} />
            Create Board
          </button>
        </div>
      );
    }

    return (
      <div className={styles.workspaceGrid}>
        <button
          type="button"
          className={styles.addWorkspaceCard}
          onClick={() => setShowCreateModal(true)}
        >
          <Plus size={28} />
          <span>New Board</span>
        </button>
        {workspaces.map((ws) => (
          <WorkspaceCard
            key={ws.id}
            workspace={ws}
            onClick={() => handleWorkspaceClick(ws)}
          />
        ))}
      </div>
    );
  };

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.brand}>
          <div className={styles.logo}>H</div>
          <div className={styles.brandText}>
            <div className={styles.brandName}>Healis</div>
            <div className={styles.brandSub}>Where would you like to start?</div>
          </div>
        </div>
        <div className={styles.headerRight}>
          <div className={styles.pill}>Free</div>
        </div>
      </header>

      <main className={styles.main}>
        <div className={styles.card}>
          <aside className={styles.left}>
            <div className={styles.leftTitle}>Start</div>
            <nav className={styles.nav} aria-label="Main menu">
              {MENU.map((item) => {
                const Icon = item.icon;
                const isActive = item.key === active;
                return (
                  <button
                    key={item.key}
                    type="button"
                    className={`${styles.navItem} ${isActive ? styles.navItemActive : ''}`}
                    onClick={() => setActive(item.key)}
                  >
                    <span className={styles.navIcon} aria-hidden="true">
                      <Icon size={18} />
                    </span>
                    <span className={styles.navLabel}>{item.label}</span>
                    <span className={styles.navChevron} aria-hidden="true">
                      <ChevronRight size={16} />
                    </span>
                  </button>
                );
              })}
            </nav>
            <div className={styles.leftFooter}>
              <div className={styles.hint}>I want to start from scratch</div>
            </div>
          </aside>

          <section className={styles.right}>
            <div className={styles.rightTop}>
              <div>
                <div className={styles.rightTitle}>{activeItem.label}</div>
                <div className={styles.rightSub}>
                  {active === 'workspace'
                    ? 'Your boards and workspaces'
                    : 'Pick a page and continue'}
                </div>
              </div>
              {active === 'workspace' && workspaces.length > 0 && (
                <button
                  type="button"
                  className={styles.primary}
                  onClick={() => setShowCreateModal(true)}
                >
                  <Plus size={18} />
                  New Board
                </button>
              )}
              {active !== 'workspace' && (
                <button
                  type="button"
                  className={styles.primary}
                  onClick={() => navigate(activeItem.to)}
                >
                  Let&apos;s start
                </button>
              )}
            </div>

            {active === 'workspace' ? (
              renderWorkspaceContent()
            ) : (
              <div className={styles.preview}>
                {tiles.map((c, idx) => (
                  <div
                    // eslint-disable-next-line react/no-array-index-key
                    key={idx}
                    className={styles.tile}
                    style={{ background: c }}
                  />
                ))}
              </div>
            )}
          </section>
        </div>
      </main>

      <CreateBoardModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onCreate={handleCreateBoard}
        loading={creating}
      />
    </div>
  );
}
