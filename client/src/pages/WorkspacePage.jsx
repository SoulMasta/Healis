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
  Type,
  Users,
  Loader2,
  Trash2,
} from 'lucide-react';
import { getHealth } from '../http/health';
import { getWorkspace } from '../http/workspaceAPI';
import { createElementOnDesk, getElementsByDesk, updateElement, deleteElement } from '../http/elementsAPI';
import UserMenu from '../components/UserMenu';
import styles from '../styles/WorkspacePage.module.css';
import note2Img from '../static/note2.png';

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
  { id: 'note', label: 'Note', Icon: Square, hotspot: [12, 12], fallbackCursor: 'copy' },
  { id: 'text', label: 'Text', Icon: Type, hotspot: [8, 18], fallbackCursor: 'text' },
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
  const [actionError, setActionError] = useState(null);
  const [activeTool, setActiveTool] = useState(TOOLS[0].id);
  const [viewOffset, setViewOffset] = useState({ x: 0, y: 0 });
  const [selectionRect, setSelectionRect] = useState(null);
  const [isPanning, setIsPanning] = useState(false);
  const [elements, setElements] = useState([]);
  const [editingElementId, setEditingElementId] = useState(null);
  const [deletingElementId, setDeletingElementId] = useState(null);

  const selectStartRef = useRef(null);
  const panStartRef = useRef(null);
  const interactionRef = useRef(null);

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

  const extractContent = (el) => {
    if (!el) return '';
    if (el.type === 'note') return el.note?.text ?? el.Note?.text ?? '';
    if (el.type === 'text') return el.text?.content ?? el.Text?.content ?? '';
    return '';
  };

  const elementToVm = (el) => {
    if (!el || typeof el !== 'object') return el;
    return {
      ...el,
      id: el.id ?? el.elementId,
      content: el.content ?? extractContent(el),
    };
  };

  const persistElement = async (el) => {
    if (!el?.id) return;
    const base = {
      x: Math.round(el.x ?? 0),
      y: Math.round(el.y ?? 0),
      width: Math.max(40, Math.round(el.width ?? 0)),
      height: Math.max(30, Math.round(el.height ?? 0)),
      rotation: el.rotation ?? 0,
      zIndex: el.zIndex ?? 0,
    };
    const payload =
      el.type === 'note'
        ? { text: el.content ?? '' }
        : el.type === 'text'
          ? { content: el.content ?? '' }
          : undefined;

    const updated = await updateElement(el.id, { ...base, payload });
    const vm = elementToVm(updated);
    setElements((prev) => prev.map((x) => (x.id === vm.id ? { ...x, ...vm } : x)));
  };

  const endEditing = async () => {
    if (!editingElementId) return;
    const current = elementsRef.current.find((el) => el.id === editingElementId);
    setEditingElementId(null);
    if (current) {
      try {
        await persistElement(current);
      } catch {
        // ignore
      }
    }
  };

  const onElementPointerDown = (elementId, e) => {
    // Let "hand" tool pan even when pointer is over an element.
    if (activeTool === 'hand') return;

    // Prevent the canvas from calling preventDefault()/pointerCapture which breaks focus + dblclick.
    e.stopPropagation();

    // If the user clicks another element while editing, first commit the previous edit.
    if (editingElementId && editingElementId !== elementId) {
      endEditing();
    }

    // More reliable than dblclick (which can be suppressed by pointer handlers).
    if (e.detail === 2) {
      setEditingElementId(elementId);
    }
  };

  const updateLocalElement = (elementId, patch) => {
    setElements((prev) => prev.map((el) => (el.id === elementId ? { ...el, ...patch } : el)));
  };

  const handleDeleteElement = async (el) => {
    if (!el?.id) return;
    const ok = window.confirm('Удалить элемент с доски? Несохранённые изменения будут потеряны.');
    if (!ok) return;

    setDeletingElementId(el.id);
    setActionError(null);
    try {
      await deleteElement(el.id);
      setEditingElementId((cur) => (cur === el.id ? null : cur));
      setElements((prev) => prev.filter((x) => x.id !== el.id));
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('Failed to delete element:', err?.response?.data || err);
      setActionError(err?.response?.data?.error || err?.message || 'Failed to delete element');
      window.setTimeout(() => setActionError(null), 4000);
    } finally {
      setDeletingElementId(null);
    }
  };

  const startDrag = (elementId, e) => {
    e.stopPropagation();
    e.preventDefault();
    const el = elements.find((x) => x.id === elementId);
    if (!el) return;

    const startX = e.clientX;
    const startY = e.clientY;
    interactionRef.current = { kind: 'drag', elementId, startX, startY, origin: { x: el.x, y: el.y } };

    const onMove = (ev) => {
      const cur = interactionRef.current;
      if (!cur || cur.kind !== 'drag' || cur.elementId !== elementId) return;
      const dx = ev.clientX - cur.startX;
      const dy = ev.clientY - cur.startY;
      updateLocalElement(elementId, { x: cur.origin.x + dx, y: cur.origin.y + dy });
    };

    const onUp = async () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      interactionRef.current = null;
      const latest = elementsRef.current.find((x) => x.id === elementId);
      if (latest) {
        try {
          await persistElement(latest);
        } catch {
          // ignore
        }
      }
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp, { once: true });
  };

  const startResize = (elementId, handle, e) => {
    e.stopPropagation();
    e.preventDefault();
    const el = elements.find((x) => x.id === elementId);
    if (!el) return;

    const startX = e.clientX;
    const startY = e.clientY;
    interactionRef.current = {
      kind: 'resize',
      elementId,
      handle,
      startX,
      startY,
      origin: { x: el.x, y: el.y, width: el.width, height: el.height },
    };

    const minW = 120;
    const minH = el.type === 'text' ? 50 : 80;

    const onMove = (ev) => {
      const cur = interactionRef.current;
      if (!cur || cur.kind !== 'resize' || cur.elementId !== elementId) return;
      const dx = ev.clientX - cur.startX;
      const dy = ev.clientY - cur.startY;
      let { x, y, width, height } = cur.origin;

      const leftHandles = ['nw', 'w', 'sw'];
      const rightHandles = ['ne', 'e', 'se'];
      const topHandles = ['nw', 'n', 'ne'];
      const bottomHandles = ['sw', 's', 'se'];

      if (rightHandles.includes(cur.handle)) width = Math.max(minW, cur.origin.width + dx);
      if (bottomHandles.includes(cur.handle)) height = Math.max(minH, cur.origin.height + dy);
      if (leftHandles.includes(cur.handle)) {
        const nextW = Math.max(minW, cur.origin.width - dx);
        x = cur.origin.x + (cur.origin.width - nextW);
        width = nextW;
      }
      if (topHandles.includes(cur.handle)) {
        const nextH = Math.max(minH, cur.origin.height - dy);
        y = cur.origin.y + (cur.origin.height - nextH);
        height = nextH;
      }

      updateLocalElement(elementId, { x, y, width, height });
    };

    const onUp = async () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      interactionRef.current = null;
      const latest = elementsRef.current.find((x) => x.id === elementId);
      if (latest) {
        try {
          await persistElement(latest);
        } catch {
          // ignore
        }
      }
    };

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp, { once: true });
  };

  const elementsRef = useRef(elements);
  useEffect(() => {
    elementsRef.current = elements;
  }, [elements]);

  const onCanvasPointerDown = (e) => {
    // For touch/pen pointer events, `button` can be -1; we still want creation to work.
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const target = e.currentTarget;
    try {
      target.setPointerCapture(e.pointerId);
    } catch {
      // ignore
    }
    e.preventDefault();

    // Exit edit mode on click outside element.
    // Important UX: the first click outside should *only* finish editing, and not create a new element.
    if (editingElementId) {
      const insideEditing = e.target?.closest?.(`[data-element-id="${editingElementId}"]`);
      if (!insideEditing) {
        endEditing();
        return;
      }
    }

    // Create elements for note/text tools.
    if (activeTool === 'note' || activeTool === 'text') {
      const hitElement = e.target?.closest?.('[data-element-id]');
      if (hitElement) return;
      const p = getCanvasPoint(e);
      // Backend expects integer coordinates (Sequelize INTEGER fields).
      const x = Math.round(p.x - viewOffset.x);
      const y = Math.round(p.y - viewOffset.y);
      const zIndex = Math.round(elements.reduce((m, el) => Math.max(m, el.zIndex ?? 0), 0) + 1);
      const type = activeTool === 'note' ? 'note' : 'text';
      const width = Math.round(type === 'note' ? 260 : 240);
      const height = Math.round(type === 'note' ? 200 : 80);

      const deskId = workspace?.id ?? workspace?.deskId ?? id;
      setActionError(null);

      (async () => {
        try {
          const created = await createElementOnDesk(deskId, {
            type,
            x,
            y,
            width,
            height,
            zIndex,
            payload: type === 'note' ? { text: '' } : { content: '' },
          });
          const vm = elementToVm(created);
          setElements((prev) => [...prev, vm]);
          setEditingElementId(vm.id);
        } catch (err) {
          // eslint-disable-next-line no-console
          console.error('Failed to create element:', err?.response?.data || err);
          setActionError(err?.response?.data?.error || err?.message || 'Failed to create element');
          window.setTimeout(() => setActionError(null), 4000);
        }
      })();
      return;
    }

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

  useEffect(() => {
    let mounted = true;
    if (!workspace?.id && !workspace?.deskId && !id) return () => {};

    const deskId = workspace?.id ?? workspace?.deskId ?? id;
    getElementsByDesk(deskId)
      .then((data) => {
        if (!mounted) return;
        setElements(Array.isArray(data) ? data.map(elementToVm) : []);
      })
      .catch(() => mounted && setElements([]));

    return () => {
      mounted = false;
    };
  }, [workspace?.id, workspace?.deskId, id]);

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
            '--view-offset-x': `${viewOffset.x}px`,
            '--view-offset-y': `${viewOffset.y}px`,
            '--note-bg': `url(${note2Img})`,
          }}
        >
          <div className={styles.grid} />
          {actionError ? <div className={styles.actionError}>{actionError}</div> : null}
          <div className={styles.boardContent}>
            {elements.map((el) => {
              const isEditing = editingElementId === el.id;
              const innerClass =
                el.type === 'note'
                  ? `${styles.elementInner} ${styles.noteInner}`
                  : `${styles.elementInner} ${styles.textInner}`;
              const displayTextClass =
                el.type === 'note' ? `${styles.displayText} ${styles.notePad}` : styles.displayText;
              const editorClass =
                el.type === 'note' ? `${styles.editor} ${styles.noteEditorPad}` : styles.editor;

              return (
                <div
                  key={el.id}
                  data-element-id={el.id}
                  className={styles.element}
                  style={{
                    left: el.x ?? 0,
                    top: el.y ?? 0,
                    width: el.width ?? 240,
                    height: el.height ?? 160,
                    zIndex: el.zIndex ?? 0,
                    transform: `rotate(${el.rotation ?? 0}deg)`,
                  }}
                  onPointerDown={(ev) => onElementPointerDown(el.id, ev)}
                  onDoubleClick={() => setEditingElementId(el.id)}
                >
                  <div className={innerClass}>
                    {isEditing ? (
                      <textarea
                        className={editorClass}
                        value={el.content ?? ''}
                        autoFocus
                        onPointerDown={(ev) => ev.stopPropagation()}
                        onChange={(ev) => updateLocalElement(el.id, { content: ev.target.value })}
                        onKeyDown={async (ev) => {
                          if (ev.key === 'Enter' && !ev.shiftKey) {
                            ev.preventDefault();
                            setEditingElementId(null);
                            try {
                              await persistElement({ ...el, content: ev.currentTarget.value });
                            } catch {
                              // ignore
                            }
                          }
                        }}
                      />
                    ) : (
                      <div className={displayTextClass}>{el.content ?? ''}</div>
                    )}
                  </div>

                  {isEditing ? (
                    <div className={styles.transformBox}>
                      <div className={styles.elementActions}>
                        <button
                          type="button"
                          className={styles.deleteElementBtn}
                          onPointerDown={(ev) => ev.stopPropagation()}
                          onClick={(ev) => {
                            ev.stopPropagation();
                            handleDeleteElement(el);
                          }}
                          disabled={deletingElementId === el.id}
                          aria-label="Delete element"
                          title="Delete element"
                        >
                          {deletingElementId === el.id ? (
                            <Loader2 size={16} className={styles.spinner} />
                          ) : (
                            <Trash2 size={16} />
                          )}
                        </button>
                      </div>
                      <div className={styles.dragHandle} onPointerDown={(ev) => startDrag(el.id, ev)} />
                      <div
                        className={`${styles.resizeHandle} ${styles.hNW}`}
                        onPointerDown={(ev) => startResize(el.id, 'nw', ev)}
                      />
                      <div
                        className={`${styles.resizeHandle} ${styles.hN}`}
                        onPointerDown={(ev) => startResize(el.id, 'n', ev)}
                      />
                      <div
                        className={`${styles.resizeHandle} ${styles.hNE}`}
                        onPointerDown={(ev) => startResize(el.id, 'ne', ev)}
                      />
                      <div
                        className={`${styles.resizeHandle} ${styles.hE}`}
                        onPointerDown={(ev) => startResize(el.id, 'e', ev)}
                      />
                      <div
                        className={`${styles.resizeHandle} ${styles.hSE}`}
                        onPointerDown={(ev) => startResize(el.id, 'se', ev)}
                      />
                      <div
                        className={`${styles.resizeHandle} ${styles.hS}`}
                        onPointerDown={(ev) => startResize(el.id, 's', ev)}
                      />
                      <div
                        className={`${styles.resizeHandle} ${styles.hSW}`}
                        onPointerDown={(ev) => startResize(el.id, 'sw', ev)}
                      />
                      <div
                        className={`${styles.resizeHandle} ${styles.hW}`}
                        onPointerDown={(ev) => startResize(el.id, 'w', ev)}
                      />
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
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
