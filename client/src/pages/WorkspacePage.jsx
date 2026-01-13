import React, { useEffect, useState } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Bell,
  ChevronDown,
  CircleHelp,
  Hand,
  Image,
  Link2,
  MousePointer2,
  PenLine,
  Search,
  Square,
  StickyNote,
  Type,
  Users,
  Loader2,
} from 'lucide-react';
import { getHealth } from '../http/health';
import { getWorkspace } from '../http/workspaceAPI';
import styles from '../styles/WorkspacePage.module.css';

function IconBtn({ label, children, onClick }) {
  return (
    <button type="button" className={styles.iconBtn} onClick={onClick} aria-label={label}>
      {children}
    </button>
  );
}

export default function WorkspacePage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [health, setHealth] = useState(null);
  const [workspace, setWorkspace] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let mounted = true;
    getHealth()
      .then((data) => mounted && setHealth(data))
      .catch(() => mounted && setHealth({ ok: false }));
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    let mounted = true;
    
    async function fetchWorkspace() {
      if (!id) {
        setError('No workspace ID provided');
        setLoading(false);
        return;
      }
      
      try {
        const data = await getWorkspace(id);
        if (mounted) {
          setWorkspace(data);
          setLoading(false);
        }
      } catch (err) {
        if (mounted) {
          if (err.response?.status === 404) {
            setError('Workspace not found');
          } else {
            setError(err.response?.data?.error || 'Failed to load workspace');
          }
          setLoading(false);
        }
      }
    }
    
    fetchWorkspace();
    return () => {
      mounted = false;
    };
  }, [id]);

  if (loading) {
    return (
      <div className={styles.page}>
        <div className={styles.loadingContainer}>
          <Loader2 size={40} className={styles.spinner} />
          <span>Loading workspace...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.page}>
        <div className={styles.errorContainer}>
          <div className={styles.errorTitle}>Oops!</div>
          <div className={styles.errorMessage}>{error}</div>
          <button 
            type="button" 
            className={styles.backHomeBtn}
            onClick={() => navigate('/home')}
          >
            Back to Home
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <header className={styles.topBar}>
        <div className={styles.left}>
          <Link className={styles.back} to="/home" aria-label="Back to home">
            <ArrowLeft size={18} />
          </Link>
          <div className={styles.brand}>
            <div className={styles.logo}>H</div>
            <div className={styles.boardName}>
              {workspace?.name || 'Workspace'} <span className={styles.badge}>free</span>
            </div>
          </div>
        </div>

        <div className={styles.center}>
          <div className={styles.toolbar}>
            <IconBtn label="Search">
              <Search size={18} />
            </IconBtn>
            <IconBtn label="Share options">
              <Users size={18} />
            </IconBtn>
            <IconBtn label="Help">
              <CircleHelp size={18} />
            </IconBtn>
          </div>
        </div>

        <div className={styles.right}>
          <div className={styles.health}>
            <span className={`${styles.dot} ${health?.ok ? styles.dotOk : styles.dotBad}`} />
            <span className={styles.healthText}>
              {health?.ok ? 'backend online' : 'backend offline'}
            </span>
          </div>
          <button type="button" className={styles.presentBtn}>
            Present <ChevronDown size={16} />
          </button>
          <button type="button" className={styles.shareBtn}>
            Share
          </button>
          <IconBtn label="Notifications">
            <Bell size={18} />
          </IconBtn>
        </div>
      </header>

      <div className={styles.body}>
        <aside className={styles.leftRail} aria-label="Tools">
          <button type="button" className={`${styles.tool} ${styles.toolActive}`} aria-label="Select">
            <MousePointer2 size={18} />
          </button>
          <button type="button" className={styles.tool} aria-label="Hand">
            <Hand size={18} />
          </button>
          <button type="button" className={styles.tool} aria-label="Sticky note">
            <StickyNote size={18} />
          </button>
          <button type="button" className={styles.tool} aria-label="Text">
            <Type size={18} />
          </button>
          <button type="button" className={styles.tool} aria-label="Shape">
            <Square size={18} />
          </button>
          <button type="button" className={styles.tool} aria-label="Pen">
            <PenLine size={18} />
          </button>
          <button type="button" className={styles.tool} aria-label="Image">
            <Image size={18} />
          </button>
          <button type="button" className={styles.tool} aria-label="Link">
            <Link2 size={18} />
          </button>
        </aside>

        <main className={styles.canvas} aria-label="Workspace canvas">
          <div className={styles.grid} />
          <div className={styles.emptyHint}>
            <div className={styles.emptyTitle}>{workspace?.name}</div>
            <div className={styles.emptySub}>
              {workspace?.description || 'This board starts empty — add items using the left toolbar.'}
            </div>
          </div>
        </main>

        <div className={styles.zoom}>
          <button type="button" className={styles.zoomBtn}>
            −
          </button>
          <div className={styles.zoomPct}>100%</div>
          <button type="button" className={styles.zoomBtn}>
            +
          </button>
        </div>
      </div>
    </div>
  );
}
