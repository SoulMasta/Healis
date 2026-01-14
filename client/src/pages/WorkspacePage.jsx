import React, { useEffect, useRef, useState } from 'react';
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
import UserMenu from '../components/UserMenu';
import styles from '../styles/WorkspacePage.module.css';

function IconBtn({ label, children, onClick }) {
  return (
    <button type="button" className={styles.iconBtn} onClick={onClick} aria-label={label}>
      {children}
    </button>
  );
}

const TOOLS = [
  { id: 'select', label: 'Select', Icon: MousePointer2, hotspot: [2, 2], fallbackCursor: 'default' },
  { id: 'hand', label: 'Hand', Icon: Hand, hotspot: [12, 12], fallbackCursor: 'grab' },
  { id: 'sticky', label: 'Sticky note', Icon: StickyNote, hotspot: [2, 2], fallbackCursor: 'copy' },
  { id: 'text', label: 'Text', Icon: Type, hotspot: [8, 18], fallbackCursor: 'text' },
  { id: 'shape', label: 'Shape', Icon: Square, hotspot: [12, 12], fallbackCursor: 'crosshair' },
  { id: 'pen', label: 'Pen', Icon: PenLine, hotspot: [2, 20], fallbackCursor: 'crosshair' },
  { id: 'image', label: 'Image', Icon: Image, hotspot: [2, 2], fallbackCursor: 'crosshair' },
  { id: 'link', label: 'Link', Icon: Link2, hotspot: [2, 2], fallbackCursor: 'pointer' },
];

function nodeToAttrs(attrs) {
  return Object.entries(attrs)
    .map(([k, v]) => `${k}="${String(v).replace(/"/g, '&quot;')}"`)
    .join(' ');
}

function iconToCursorValue(IconComponent, hotspot = [2, 2], fallbackCursor = 'auto') {
  const iconNode = IconComponent?.iconNode;
  if (!Array.isArray(iconNode)) return fallbackCursor;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="rgba(15,23,42,0.95)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${iconNode
    .map(([tag, attrs]) => `<${tag} ${nodeToAttrs(attrs)} />`)
    .join('')}</svg>`;

  const encoded = encodeURIComponent(svg).replace(/'/g, '%27');
  const [hx, hy] = hotspot;
  return `url("data:image/svg+xml,${encoded}") ${hx} ${hy}, ${fallbackCursor}`;
}

export default function WorkspacePage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const canvasRef = useRef(null);
  const [health, setHealth] = useState(null);
  const [workspace, setWorkspace] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTool, setActiveTool] = useState(TOOLS[0].id);
  const [viewOffset, setViewOffset] = useState({ x: 0, y: 0 });
  const [selectionRect, setSelectionRect] = useState(null);
  const [isPanning, setIsPanning] = useState(false);

  const selectStartRef = useRef(null);
  const panStartRef = useRef(null);

  const activeToolDef = TOOLS.find((t) => t.id === activeTool) || TOOLS[0];
  const canvasCursor = iconToCursorValue(
    activeToolDef.Icon,
    activeToolDef.hotspot,
    activeToolDef.fallbackCursor
  );
  const effectiveCursor = activeTool === 'hand' && isPanning ? 'grabbing' : canvasCursor;

  const getCanvasPoint = (e) => {
    const el = canvasRef.current;
    if (!el) return { x: 0, y: 0 };
    const rect = el.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const rectFromPoints = (a, b) => {
    const left = Math.min(a.x, b.x);
    const top = Math.min(a.y, b.y);
    const width = Math.abs(a.x - b.x);
    const height = Math.abs(a.y - b.y);
    return { left, top, width, height };
  };

  const stopInteractions = (e) => {
    if (e?.currentTarget && typeof e.pointerId === 'number') {
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        // ignore
      }
    }
    selectStartRef.current = null;
    panStartRef.current = null;
    setSelectionRect(null);
    setIsPanning(false);
  };

  const onCanvasPointerDown = (e) => {
    if (e.button !== 0) return;
    const target = e.currentTarget;
    try {
      target.setPointerCapture(e.pointerId);
    } catch {
      // ignore
    }
    e.preventDefault();

    if (activeTool === 'select') {
      const p = getCanvasPoint(e);
      selectStartRef.current = p;
      setSelectionRect({ left: p.x, top: p.y, width: 0, height: 0 });
    }

    if (activeTool === 'hand') {
      const p = getCanvasPoint(e);
      panStartRef.current = { p, startOffset: viewOffset };
      setIsPanning(true);
    }
  };

  const onCanvasPointerMove = (e) => {
    if (activeTool === 'select' && selectStartRef.current) {
      const p = getCanvasPoint(e);
      setSelectionRect(rectFromPoints(selectStartRef.current, p));
      return;
    }

    if (activeTool === 'hand' && panStartRef.current) {
      const p = getCanvasPoint(e);
      const { p: start, startOffset } = panStartRef.current;
      const dx = p.x - start.x;
      const dy = p.y - start.y;
      setViewOffset({ x: startOffset.x + dx, y: startOffset.y + dy });
    }
  };

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
          <UserMenu variant="compact" />
        </div>
      </header>

      <div className={styles.body}>
        <aside className={styles.leftRail} aria-label="Tools">
          {TOOLS.map(({ id: toolId, label, Icon }) => {
            const isActive = activeTool === toolId;
            return (
              <button
                key={toolId}
                type="button"
                className={`${styles.tool} ${isActive ? styles.toolActive : ''}`}
                aria-label={label}
                aria-pressed={isActive}
                onClick={() => setActiveTool(toolId)}
              >
                <Icon size={18} />
              </button>
            );
          })}
        </aside>

        <main
          className={styles.canvas}
          aria-label="Workspace canvas"
          ref={canvasRef}
          onPointerDown={onCanvasPointerDown}
          onPointerMove={onCanvasPointerMove}
          onPointerUp={stopInteractions}
          onPointerCancel={stopInteractions}
          onPointerLeave={stopInteractions}
          style={{
            '--canvas-cursor': effectiveCursor,
            '--grid-offset-x': `${viewOffset.x}px`,
            '--grid-offset-y': `${viewOffset.y}px`,
          }}
        >
          <div className={styles.grid} />
          {selectionRect ? (
            <div
              className={styles.selectionRect}
              style={{
                left: selectionRect.left,
                top: selectionRect.top,
                width: selectionRect.width,
                height: selectionRect.height,
              }}
            />
          ) : null}
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
