import React, { useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { io } from 'socket.io-client';
import {
  ArrowLeft,
  Bell,
  ChevronDown,
  CircleHelp,
  File,
  FileArchive,
  FileImage,
  FileSpreadsheet,
  FileText,
  Eraser,
  Hand,
  Link2,
  MessageCircle,
  MousePointer2,
  Paperclip,
  PenLine,
  Search,
  Square,
  Type,
  Loader2,
  Trash2,
  Download,
  ExternalLink,
  Undo2,
  Redo2,
  X,
} from 'lucide-react';
import { getHealth } from '../http/health';
import { getWorkspace } from '../http/workspaceAPI';
import { getToken } from '../http/userAPI';
import {
  createElementOnDesk,
  getElementsByDesk,
  updateElement,
  deleteElement,
  uploadFileToDesk,
  getLinkPreview,
} from '../http/elementsAPI';
import { createElementComment, getElementComments } from '../http/commentsAPI';
import UserMenu from '../components/UserMenu';
import MembersMenu from '../components/MembersMenu';
import styles from '../styles/WorkspacePage.module.css';
import note2Img from '../static/note2.png';
import { DEFAULT_SHORTCUTS, formatShortcut, loadShortcuts, matchShortcut } from '../utils/shortcuts';
import { buildManualBoardSearchIndex, makeSnippet, runManualBoardSearch } from '../utils/boardSearch';

const TEXT_PREVIEW_EXTS = new Set(['txt', 'md', 'csv', 'rtf']);
const MAX_PREVIEW_CHARS = 2200;

const BRUSH_COLORS = ['#0f172a', '#ef4444', '#22c55e', '#3b82f6', '#f59e0b', '#a855f7', '#ffffff'];
const DEFAULT_BRUSH_COLOR = '#0f172a';
const DEFAULT_BRUSH_WIDTH = 4;

const QUICK_REACTIONS = ['😍', '😢', '😁', '🤣', '😌', '😎'];

function escapeRegExp(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function renderHighlightedText(text, query, markClassName) {
  const s = String(text ?? '');
  const q = String(query ?? '').trim();
  if (!q) return s;

  // Case-insensitive highlight, without allowing regex injection.
  const re = new RegExp(escapeRegExp(q), 'ig');
  const nodes = [];
  let last = 0;
  let m = null;
  let key = 0;
  while ((m = re.exec(s))) {
    const start = m.index;
    const end = start + m[0].length;
    if (start > last) nodes.push(<React.Fragment key={`t-${key++}`}>{s.slice(last, start)}</React.Fragment>);
    nodes.push(
      <mark key={`m-${key++}`} className={markClassName}>
        {s.slice(start, end)}
      </mark>
    );
    last = end;
    if (end === start) re.lastIndex++; // safety
  }
  if (last < s.length) nodes.push(<React.Fragment key={`t-${key++}`}>{s.slice(last)}</React.Fragment>);
  return nodes.length ? nodes : s;
}

function IconBtn({ label, title, children, onClick, disabled, buttonRef }) {
  return (
    <button
      type="button"
      className={styles.iconBtn}
      ref={buttonRef}
      onClick={onClick}
      aria-label={label}
      title={title || label}
      disabled={disabled}
    >
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
  { id: 'eraser', label: 'Eraser', Icon: Eraser, hotspot: [2, 20], fallbackCursor: 'crosshair' },
  { id: 'attach', label: 'Attach file', Icon: Paperclip, hotspot: [2, 2], fallbackCursor: 'pointer' },
  { id: 'link', label: 'Link', Icon: Link2, hotspot: [2, 2], fallbackCursor: 'pointer' },
];

function distToSegmentSquared(p, a, b) {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const apx = p.x - a.x;
  const apy = p.y - a.y;
  const abLen2 = abx * abx + aby * aby;
  if (abLen2 <= 1e-9) return apx * apx + apy * apy;
  let t = (apx * abx + apy * aby) / abLen2;
  t = Math.max(0, Math.min(1, t));
  const cx = a.x + t * abx;
  const cy = a.y + t * aby;
  const dx = p.x - cx;
  const dy = p.y - cy;
  return dx * dx + dy * dy;
}

function pointsToSvgPath(points = []) {
  if (!Array.isArray(points) || points.length === 0) return '';
  if (points.length === 1) {
    const p = points[0];
    return `M ${p.x} ${p.y} L ${p.x + 0.01} ${p.y + 0.01}`;
  }
  const [p0, ...rest] = points;
  return `M ${p0.x} ${p0.y} ${rest.map((p) => `L ${p.x} ${p.y}`).join(' ')}`;
}

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

function getExt(nameOrUrl) {
  const s = String(nameOrUrl || '').split('?')[0].split('#')[0];
  const m = s.match(/\.([a-z0-9]+)$/i);
  return (m?.[1] || '').toLowerCase();
}

function normalizeUrlClient(input) {
  const raw = String(input || '').trim();
  if (!raw) return '';
  const withProto = /^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(raw) ? raw : `https://${raw}`;
  try {
    const u = new URL(withProto);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return raw;
    return u.toString();
  } catch {
    return raw;
  }
}

function safeHostname(inputUrl) {
  try {
    const u = new URL(normalizeUrlClient(inputUrl));
    return u.hostname;
  } catch {
    return '';
  }
}

function fixMojibakeNameClient(name) {
  const s = String(name || '');
  const looksMojibake = /[ÐÑ]/.test(s) && !/[А-Яа-яЁё]/.test(s);
  if (!looksMojibake) return s;
  try {
    const bytes = Uint8Array.from(Array.from(s, (ch) => ch.charCodeAt(0)));
    return new TextDecoder('utf-8').decode(bytes);
  } catch {
    return s;
  }
}

function pickDocIcon(ext) {
  if (['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'svg'].includes(ext)) return FileImage;
  if (['xls', 'xlsx', 'csv'].includes(ext)) return FileSpreadsheet;
  if (['zip', 'rar', '7z'].includes(ext)) return FileArchive;
  if (!ext) return File;
  return FileText;
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename || 'file';
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

async function fetchFileBlob(url) {
  const res = await axios.get(url, { responseType: 'blob' });
  return res.data;
}

export default function WorkspacePage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const canvasRef = useRef(null);
  const fileInputRef = useRef(null);
  const linkInputRef = useRef(null);
  const socketRef = useRef(null);
  const noteVersionsRef = useRef(new Map()); // elementId -> version
  const noteEditTimersRef = useRef(new Map()); // elementId -> timeoutId
  const [health, setHealth] = useState(null);
  const [workspace, setWorkspace] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [actionError, setActionError] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [creatingLink, setCreatingLink] = useState(false);
  const [linkDraftUrl, setLinkDraftUrl] = useState('');
  const [activeTool, setActiveTool] = useState(TOOLS[0].id);
  const [viewOffset, setViewOffset] = useState({ x: 0, y: 0 });
  const [selectionRect, setSelectionRect] = useState(null);
  const [isPanning, setIsPanning] = useState(false);
  const [elements, setElements] = useState([]);
  const [editingElementId, setEditingElementId] = useState(null);
  const [deletingElementId, setDeletingElementId] = useState(null);
  const [docTextPreview, setDocTextPreview] = useState({});
  const [presentUserIds, setPresentUserIds] = useState([]);
  const [shortcuts, setShortcuts] = useState(() => loadShortcuts());
  const [historyMeta, setHistoryMeta] = useState({ canUndo: false, canRedo: false });
  const [brushColor, setBrushColor] = useState(DEFAULT_BRUSH_COLOR);
  const [brushWidth, setBrushWidth] = useState(DEFAULT_BRUSH_WIDTH);
  const [liveStroke, setLiveStroke] = useState(null); // { points:[{x,y}], color, width }
  const [reactionPicker, setReactionPicker] = useState(null); // { elementId, x, y }
  const [reactionCustomEmoji, setReactionCustomEmoji] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const commentsEnabled = Boolean(workspace?.groupId);
  const [commentsPanel, setCommentsPanel] = useState(null); // { elementId }
  const [commentDraft, setCommentDraft] = useState('');
  const [commentsByElement, setCommentsByElement] = useState({}); // elementId -> Comment[]
  const [commentsLoading, setCommentsLoading] = useState({}); // elementId -> boolean
  const commentInputRef = useRef(null);
  const commentsListRef = useRef(null);

  const selectStartRef = useRef(null);
  const panStartRef = useRef(null);
  const interactionRef = useRef(null);
  const fetchingPreviewsRef = useRef(new Set());
  const historyRef = useRef({ past: [], future: [] });
  const applyingHistoryRef = useRef(false);
  const editStartSnapRef = useRef(new Map()); // elementId -> snapshot
  const handHoldRef = useRef({ active: false, previousTool: null });
  const liveStrokeRef = useRef(null);
  const eraseStateRef = useRef({ active: false, erasedIds: new Set(), lastTs: 0 });
  const reactionPickerRef = useRef(null);
  const searchBtnRef = useRef(null);
  const searchPopoverRef = useRef(null);
  const searchInputRef = useRef(null);

  const activeToolDef = TOOLS.find((t) => t.id === activeTool) || TOOLS[0];
  const canvasCursor = iconToCursorValue(
    activeToolDef.Icon,
    activeToolDef.hotspot,
    activeToolDef.fallbackCursor
  );
  const effectiveCursor = activeTool === 'hand' && isPanning ? 'grabbing' : canvasCursor;

  useEffect(() => {
    if (activeTool !== 'link') return;
    // Let the popover render first, then focus.
    window.setTimeout(() => linkInputRef.current?.focus?.(), 0);
  }, [activeTool]);

  useEffect(() => {
    if (!reactionPicker) return () => {};
    const onPointerDown = (ev) => {
      const node = reactionPickerRef.current;
      if (node && !node.contains(ev.target)) setReactionPicker(null);
    };
    const onKeyDown = (ev) => {
      if (ev.key === 'Escape') setReactionPicker(null);
    };
    window.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [reactionPicker]);

  const manualSearchIndex = useMemo(() => buildManualBoardSearchIndex(elements), [elements]);
  const manualSearchHits = useMemo(
    () => runManualBoardSearch(manualSearchIndex, searchQuery, { limit: 60 }),
    [manualSearchIndex, searchQuery]
  );

  const manualSearchHitIds = useMemo(() => {
    const ids = new Set();
    for (const h of manualSearchHits) ids.add(h.elementId);
    return ids;
  }, [manualSearchHits]);

  const manualSearchResults = useMemo(() => {
    const byId = new Map();
    for (const h of manualSearchHits) {
      if (!h?.elementId) continue;
      const cur = byId.get(h.elementId) || { elementId: h.elementId, elementType: h.elementType, hits: [] };
      cur.hits.push(h);
      byId.set(h.elementId, cur);
    }
    return Array.from(byId.values());
  }, [manualSearchHits]);

  useEffect(() => {
    if (!searchOpen) return () => {};
    window.setTimeout(() => searchInputRef.current?.focus?.(), 0);

    const onPointerDown = (ev) => {
      const pop = searchPopoverRef.current;
      const btn = searchBtnRef.current;
      if (pop && pop.contains(ev.target)) return;
      if (btn && btn.contains(ev.target)) return;
      setSearchOpen(false);
    };
    window.addEventListener('pointerdown', onPointerDown);
    return () => window.removeEventListener('pointerdown', onPointerDown);
  }, [searchOpen]);

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

  const isEditableTarget = (target) => {
    const el = target;
    if (!el) return false;
    const tag = String(el.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || tag === 'select') return true;
    if (el.isContentEditable) return true;
    return false;
  };

  const elementToPayload = (el) => {
    if (!el) return undefined;
    const doc = el.type === 'document' ? el.document ?? el.Document : null;
    const link = el.type === 'link' ? el.link ?? el.Link : null;
    if (el.type === 'note') return { text: el.content ?? '' };
    if (el.type === 'text') return { content: el.content ?? '' };
    if (el.type === 'document') return { title: doc?.title, url: doc?.url };
    if (el.type === 'link') return { title: link?.title, url: link?.url, previewImageUrl: link?.previewImageUrl };
    return undefined;
  };

  const snapshotForHistory = (el) => {
    if (!el?.id) return null;
    return {
      elementId: el.id,
      type: el.type,
      x: Math.round(el.x ?? 0),
      y: Math.round(el.y ?? 0),
      width: Math.max(40, Math.round(el.width ?? 0)),
      height: Math.max(30, Math.round(el.height ?? 0)),
      rotation: el.rotation ?? 0,
      zIndex: el.zIndex ?? 0,
      payload: elementToPayload(el),
    };
  };

  const snapshotEquals = (a, b) => {
    if (!a || !b) return false;
    return (
      a.elementId === b.elementId &&
      a.type === b.type &&
      a.x === b.x &&
      a.y === b.y &&
      a.width === b.width &&
      a.height === b.height &&
      a.rotation === b.rotation &&
      a.zIndex === b.zIndex &&
      JSON.stringify(a.payload ?? null) === JSON.stringify(b.payload ?? null)
    );
  };

  const updateHistoryMeta = () => {
    const { past, future } = historyRef.current;
    setHistoryMeta({ canUndo: past.length > 0, canRedo: future.length > 0 });
  };

  const pushHistory = (entry) => {
    if (!entry) return;
    const store = historyRef.current;
    store.past.push(entry);
    if (store.past.length > 120) store.past.splice(0, store.past.length - 120);
    store.future = [];
    updateHistoryMeta();
  };

  const normalizeReactions = (reactions) => {
    if (!reactions || typeof reactions !== 'object') return {};
    const out = {};
    for (const [emoji, users] of Object.entries(reactions)) {
      const e = String(emoji || '').trim();
      if (!e) continue;
      if (!Array.isArray(users)) continue;
      const ids = users
        .map((x) => Number(x))
        .filter((x) => Number.isFinite(x))
        .map((x) => Math.trunc(x));
      const uniq = Array.from(new Set(ids));
      if (uniq.length) out[e] = uniq;
    }
    return out;
  };

  const hash32 = (str) => {
    let h = 2166136261;
    const s = String(str ?? '');
    for (let i = 0; i < s.length; i += 1) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  };

  const clamp = (n, min, max) => Math.max(min, Math.min(max, n));

  const layoutReactionBubbles = (elementId, width, height, reactions) => {
    const r = normalizeReactions(reactions);
    const entries = Object.entries(r)
      .filter(([, users]) => Array.isArray(users) && users.length > 0)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    if (!entries.length) return [];

    const w = Number(width ?? 240) || 240;
    const h = Number(height ?? 160) || 160;
    const baseRadius = clamp(Math.max(w, h) / 2 + 18, 26, 140);
    const minSep = clamp(32 / baseRadius, 0.32, Math.PI / 2.2);

    const usedAngles = [];
    const out = [];
    for (const [emoji, users] of entries) {
      const seed = hash32(`${elementId}:${emoji}`);
      let angle = ((seed % 3600) / 3600) * Math.PI * 2;
      let tries = 0;
      while (
        usedAngles.some((a) => {
          const d = Math.atan2(Math.sin(angle - a), Math.cos(angle - a));
          return Math.abs(d) < minSep;
        }) &&
        tries < 30
      ) {
        angle += minSep * 1.15;
        tries += 1;
      }
      usedAngles.push(angle);

      const jitterR = ((seed >> 8) % 9) - 4; // [-4..4]
      const jitterA = (((seed >> 16) % 9) - 4) * 0.02; // small
      const rr = baseRadius + jitterR;
      const aa = angle + jitterA;
      out.push({
        emoji,
        count: users.length,
        dx: Math.cos(aa) * rr,
        dy: Math.sin(aa) * rr,
      });
    }
    return out;
  };

  const elementToVm = (el) => {
    if (!el || typeof el !== 'object') return el;
    const vm = {
      ...el,
      id: el.id ?? el.elementId,
      content: el.content ?? extractContent(el),
      reactions: normalizeReactions(el.reactions),
    };
    // Normalize association names (Sequelize can return lower-case; legacy code used UpperCamelCase).
    if (vm.note == null && vm.Note != null) vm.note = vm.Note;
    if (vm.text == null && vm.Text != null) vm.text = vm.Text;
    if (vm.document == null && vm.Document != null) vm.document = vm.Document;
    if (vm.link == null && vm.Link != null) vm.link = vm.Link;
    if (vm.drawing == null && vm.Drawing != null) vm.drawing = vm.Drawing;
    return vm;
  };

  const openReactionPicker = (elementId, x, y) => {
    if (!elementId) return;
    setReactionCustomEmoji('');
    setReactionPicker({ elementId, x: Number(x) || 0, y: Number(y) || 0 });
  };

  const toggleReaction = (elementId, emojiRaw) => {
    const emoji = String(emojiRaw ?? '').trim();
    const socket = socketRef.current;
    const deskId = workspace?.id ?? workspace?.deskId ?? id;
    if (!socket || !deskId || !elementId || !emoji) return;
    socket.emit('reaction:toggle', { deskId, elementId, emoji }, (ack = {}) => {
      if (!ack?.ok) {
        setActionError(String(ack?.error || 'Reaction failed'));
        window.setTimeout(() => setActionError(null), 4500);
        return;
      }
      const next = normalizeReactions(ack?.reactions);
      setElements((prev) => prev.map((el) => (el.id === elementId ? { ...el, reactions: next } : el)));
    });
  };

  const persistElement = async (el, opts = {}) => {
    if (!el?.id) return;
    const base = {
      x: Math.round(el.x ?? 0),
      y: Math.round(el.y ?? 0),
      width: Math.max(40, Math.round(el.width ?? 0)),
      height: Math.max(30, Math.round(el.height ?? 0)),
      rotation: el.rotation ?? 0,
      zIndex: el.zIndex ?? 0,
    };
    const doc = el.type === 'document' ? el.document ?? el.Document : null;
    const link = el.type === 'link' ? el.link ?? el.Link : null;
    const payload =
      el.type === 'note'
        ? { text: el.content ?? '' }
        : el.type === 'text'
          ? { content: el.content ?? '' }
          : el.type === 'document'
            ? { title: doc?.title, url: doc?.url }
            : el.type === 'link'
              ? { title: link?.title, url: link?.url, previewImageUrl: link?.previewImageUrl }
              : undefined;

    const updated = await updateElement(el.id, { ...base, payload });
    const vm = elementToVm(updated);
    setElements((prev) => prev.map((x) => (x.id === vm.id ? { ...x, ...vm } : x)));

    if (!opts.skipHistory && !applyingHistoryRef.current && opts.historyBefore) {
      const afterSnap = snapshotForHistory({ ...el, ...vm });
      if (afterSnap && !snapshotEquals(opts.historyBefore, afterSnap)) {
        pushHistory({
          kind: 'update-element',
          elementId: el.id,
          before: opts.historyBefore,
          after: afterSnap,
        });
      }
    }
  };

  const beginEditing = (elementId, explicitBeforeSnap) => {
    if (!elementId) return;
    if (!editStartSnapRef.current.has(elementId)) {
      const before = explicitBeforeSnap || snapshotForHistory(elementsRef.current.find((x) => x.id === elementId));
      if (before) editStartSnapRef.current.set(elementId, before);
    }
    setEditingElementId(elementId);
  };

  const endEditing = async () => {
    if (!editingElementId) return;
    const current = elementsRef.current.find((el) => el.id === editingElementId);
    setEditingElementId(null);
    if (current) {
      try {
        const before = editStartSnapRef.current.get(editingElementId) || null;
        editStartSnapRef.current.delete(editingElementId);
        await persistElement(current, { historyBefore: before });
      } catch {
        // ignore
      }
    }
  };

  const onElementPointerDown = (elementId, e) => {
    // Let "hand" tool pan even when pointer is over an element.
    if (activeTool === 'hand') return;
    // Allow drawing tools to work over elements (don't stop bubbling to the canvas).
    if (activeTool === 'pen' || activeTool === 'eraser') return;

    // Prevent the canvas from calling preventDefault()/pointerCapture which breaks focus + dblclick.
    e.stopPropagation();

    // If the user clicks another element while editing, first commit the previous edit.
    if (editingElementId && editingElementId !== elementId) {
      endEditing();
    }

    // More reliable than dblclick (which can be suppressed by pointer handlers).
    if (e.detail === 2) {
      beginEditing(elementId);
    }
  };

  const updateLocalElement = (elementId, patch) => {
    setElements((prev) => prev.map((el) => (el.id === elementId ? { ...el, ...patch } : el)));
  };

  const queueNoteEdit = (elementId, text) => {
    const socket = socketRef.current;
    const deskId = workspace?.id ?? workspace?.deskId ?? id;
    if (!socket || !deskId) return;

    const prevTimer = noteEditTimersRef.current.get(elementId);
    if (prevTimer) window.clearTimeout(prevTimer);

    const timer = window.setTimeout(() => {
      const baseVersion = noteVersionsRef.current.get(elementId);
      socket.emit(
        'note:edit',
        { deskId, elementId, text, baseVersion },
        (ack = {}) => {
          if (!ack?.ok) {
            if (ack?.error === 'VERSION_CONFLICT') {
              if (ack.currentVersion != null) noteVersionsRef.current.set(elementId, ack.currentVersion);
              updateLocalElement(elementId, { content: String(ack.currentText ?? '') });
              setActionError('This note was updated by someone else. Synced to the latest version.');
              window.setTimeout(() => setActionError(null), 4500);
              return;
            }
            setActionError(String(ack?.error || 'Realtime update failed'));
            window.setTimeout(() => setActionError(null), 4500);
            return;
          }
          if (ack?.version != null) noteVersionsRef.current.set(elementId, ack.version);
        }
      );
    }, 220);

    noteEditTimersRef.current.set(elementId, timer);
  };

  const handleDeleteElement = async (el) => {
    if (!el?.id) return;
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

  const openDocument = async (docUrl) => {
    if (!docUrl) return;
    try {
      const blob = await fetchFileBlob(docUrl);
      const blobUrl = URL.createObjectURL(blob);
      window.open(blobUrl, '_blank', 'noopener,noreferrer');
      window.setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('Failed to open document:', err?.response?.data || err);
      setActionError(err?.response?.data?.error || err?.message || 'Failed to open file');
      window.setTimeout(() => setActionError(null), 4000);
    }
  };

  const openExternalUrl = (url) => {
    const normalized = normalizeUrlClient(url);
    if (!normalized) return;
    window.open(normalized, '_blank', 'noopener,noreferrer');
  };

  const downloadDocument = async (docUrl, docTitle) => {
    if (!docUrl) return;
    try {
      const blob = await fetchFileBlob(docUrl);
      downloadBlob(blob, docTitle);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('Failed to download document:', err?.response?.data || err);
      setActionError(err?.response?.data?.error || err?.message || 'Failed to download file');
      window.setTimeout(() => setActionError(null), 4000);
    }
  };

  const openAttachDialog = () => {
    if (uploading) return;
    setActionError(null);
    fileInputRef.current?.click?.();
  };

  const handleAttachSelected = async (e) => {
    const file = e.target?.files?.[0];
    // Allow picking the same file again.
    // eslint-disable-next-line no-param-reassign
    e.target.value = '';
    if (!file) return;

    const deskId = workspace?.id ?? workspace?.deskId ?? id;
    if (!deskId) return;

    const width = 320;
    const height = 200;
    const rect = canvasRef.current?.getBoundingClientRect?.();
    const canvasW = rect?.width ?? 1200;
    const canvasH = rect?.height ?? 800;
    const x = Math.round(canvasW / 2 - width / 2 - viewOffset.x);
    const y = Math.round(canvasH / 2 - height / 2 - viewOffset.y);
    const zIndex = Math.round(elementsRef.current.reduce((m, el) => Math.max(m, el.zIndex ?? 0), 0) + 1);

    setUploading(true);
    setActionError(null);
    try {
      const uploaded = await uploadFileToDesk(deskId, file);
      const created = await createElementOnDesk(deskId, {
        type: 'document',
        x,
        y,
        width,
        height,
        zIndex,
        payload: { title: uploaded?.title || file.name, url: uploaded?.url },
      });
      const vm = elementToVm(created);
      setElements((prev) => [...prev, vm]);
      beginEditing(vm.id, snapshotForHistory(vm));
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('Failed to upload/create document:', err?.response?.data || err);
      setActionError(err?.response?.data?.error || err?.message || 'Failed to upload file');
      window.setTimeout(() => setActionError(null), 5000);
    } finally {
      setUploading(false);
    }
  };

  const submitLink = async () => {
    const deskId = workspace?.id ?? workspace?.deskId ?? id;
    if (!deskId) return;
    const raw = linkDraftUrl;
    const url = normalizeUrlClient(raw);
    if (!url) return;

    const width = 360;
    const height = 220;
    const rect = canvasRef.current?.getBoundingClientRect?.();
    const canvasW = rect?.width ?? 1200;
    const canvasH = rect?.height ?? 800;
    const x = Math.round(canvasW / 2 - width / 2 - viewOffset.x);
    const y = Math.round(canvasH / 2 - height / 2 - viewOffset.y);
    const zIndex = Math.round(elementsRef.current.reduce((m, el) => Math.max(m, el.zIndex ?? 0), 0) + 1);

    setCreatingLink(true);
    setActionError(null);
    try {
      let preview = null;
      try {
        preview = await getLinkPreview(url);
      } catch {
        preview = null;
      }
      const payload = {
        url: preview?.url || url,
        title: preview?.title || safeHostname(url) || url,
        previewImageUrl: preview?.previewImageUrl || null,
      };

      const created = await createElementOnDesk(deskId, {
        type: 'link',
        x,
        y,
        width,
        height,
        zIndex,
        payload,
      });
      const vm = elementToVm(created);
      setElements((prev) => [...prev, vm]);
      beginEditing(vm.id, snapshotForHistory(vm));
      setLinkDraftUrl('');
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('Failed to create link:', err?.response?.data || err);
      setActionError(err?.response?.data?.error || err?.message || 'Failed to create link');
      window.setTimeout(() => setActionError(null), 5000);
    } finally {
      setCreatingLink(false);
    }
  };

  const startDrag = (elementId, e) => {
    e.stopPropagation();
    e.preventDefault();
    const el = elements.find((x) => x.id === elementId);
    if (!el) return;
    const before = snapshotForHistory(el);

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
          await persistElement(latest, { historyBefore: before });
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
    const before = snapshotForHistory(el);

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
          await persistElement(latest, { historyBefore: before });
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

  const applySnapshot = async (snap) => {
    if (!snap?.elementId) return;
    applyingHistoryRef.current = true;
    setActionError(null);
    try {
      const updated = await updateElement(snap.elementId, {
        x: snap.x,
        y: snap.y,
        width: snap.width,
        height: snap.height,
        rotation: snap.rotation,
        zIndex: snap.zIndex,
        payload: snap.payload,
      });
      const vm = elementToVm(updated);
      setElements((prev) => prev.map((x) => (x.id === vm.id ? { ...x, ...vm, content: vm.content ?? x.content } : x)));
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('Failed to apply history snapshot:', err?.response?.data || err);
      setActionError(err?.response?.data?.error || err?.message || 'Failed to apply history change');
      window.setTimeout(() => setActionError(null), 4500);
    } finally {
      applyingHistoryRef.current = false;
    }
  };

  const undo = async () => {
    const store = historyRef.current;
    const entry = store.past.pop();
    if (!entry) return;
    store.future.push(entry);
    updateHistoryMeta();
    if (entry.kind === 'update-element') {
      await applySnapshot(entry.before);
    }
  };

  const redo = async () => {
    const store = historyRef.current;
    const entry = store.future.pop();
    if (!entry) return;
    store.past.push(entry);
    updateHistoryMeta();
    if (entry.kind === 'update-element') {
      await applySnapshot(entry.after);
    }
  };

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

    const p = getCanvasPoint(e);
    const deskP = { x: p.x - viewOffset.x, y: p.y - viewOffset.y };

    // Exit edit mode on click outside element.
    // Important UX: the first click outside should *only* finish editing, and not create a new element.
    if (editingElementId) {
      const insideEditing = e.target?.closest?.(`[data-element-id="${editingElementId}"]`);
      if (!insideEditing) {
        endEditing();
        return;
      }
    }

    if (activeTool === 'pen') {
      const stroke = { points: [{ x: deskP.x, y: deskP.y }], color: brushColor, width: brushWidth };
      liveStrokeRef.current = stroke;
      setLiveStroke(stroke);
      return;
    }

    if (activeTool === 'eraser') {
      eraseStateRef.current.active = true;
      eraseStateRef.current.lastTs = 0;
      // keep erasedIds set across a drag
      return;
    }

    // Create elements for note/text tools.
    if (activeTool === 'note' || activeTool === 'text') {
      const hitElement = e.target?.closest?.('[data-element-id]');
      if (hitElement) return;
      // Backend expects integer coordinates (Sequelize INTEGER fields).
      const x = Math.round(deskP.x);
      const y = Math.round(deskP.y);
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
          beginEditing(vm.id, snapshotForHistory(vm));
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
      selectStartRef.current = p;
      setSelectionRect({ left: p.x, top: p.y, width: 0, height: 0 });
    }

    if (activeTool === 'hand') {
      panStartRef.current = { p, startOffset: viewOffset };
      setIsPanning(true);
    }
  };

  const onCanvasPointerMove = (e) => {
    if (activeTool === 'pen' && liveStrokeRef.current) {
      const p = getCanvasPoint(e);
      const deskP = { x: p.x - viewOffset.x, y: p.y - viewOffset.y };
      const stroke = liveStrokeRef.current;
      const prev = stroke.points[stroke.points.length - 1];
      const dx = deskP.x - prev.x;
      const dy = deskP.y - prev.y;
      if (dx * dx + dy * dy < 0.9) return;
      stroke.points.push({ x: deskP.x, y: deskP.y });
      // Keep UI responsive; avoid setting state for every move on high frequency devices.
      if (!interactionRef.current || interactionRef.current.kind !== 'draw') {
        interactionRef.current = { kind: 'draw' };
      }
      if (!interactionRef.current.raf) {
        interactionRef.current.raf = window.requestAnimationFrame(() => {
          interactionRef.current.raf = null;
          setLiveStroke({ ...stroke, points: [...stroke.points] });
        });
      }
      return;
    }

    if (activeTool === 'eraser' && eraseStateRef.current.active) {
      const now = performance.now();
      if (now - (eraseStateRef.current.lastTs || 0) < 28) return;
      eraseStateRef.current.lastTs = now;

      const p = getCanvasPoint(e);
      const deskP = { x: p.x - viewOffset.x, y: p.y - viewOffset.y };
      const radius = Math.max(8, brushWidth * 2);

      const strokes = elementsRef.current.filter((el) => el?.type === 'drawing' && el?.drawing?.data);
      for (const el of strokes) {
        if (!el?.id) continue;
        if (eraseStateRef.current.erasedIds.has(el.id)) continue;
        const x = Number(el.x ?? 0);
        const y = Number(el.y ?? 0);
        const w = Number(el.width ?? 0);
        const h = Number(el.height ?? 0);
        if (deskP.x < x - radius || deskP.x > x + w + radius || deskP.y < y - radius || deskP.y > y + h + radius) continue;

        const data = el.drawing?.data;
        const pts = Array.isArray(data?.points) ? data.points : Array.isArray(data?.pts) ? data.pts : [];
        if (!pts.length) continue;
        const absPts = pts.map((p0) => ({ x: x + Number(p0.x ?? 0), y: y + Number(p0.y ?? 0) }));
        const strokeW = Number(data?.width ?? 4);
        const hitR2 = (radius + strokeW / 2) * (radius + strokeW / 2);

        let hit = false;
        if (absPts.length === 1) {
          const dx = deskP.x - absPts[0].x;
          const dy = deskP.y - absPts[0].y;
          hit = dx * dx + dy * dy <= hitR2;
        } else {
          for (let i = 1; i < absPts.length; i += 1) {
            const d2 = distToSegmentSquared(deskP, absPts[i - 1], absPts[i]);
            if (d2 <= hitR2) {
              hit = true;
              break;
            }
          }
        }
        if (!hit) continue;

        eraseStateRef.current.erasedIds.add(el.id);
        // Optimistic remove; socket broadcast will reconcile for others.
        setElements((prev) => prev.filter((xEl) => xEl.id !== el.id));
        // Fire-and-forget delete.
        deleteElement(el.id).catch(() => {
          // ignore
        });
      }
      return;
    }

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

  const finalizeStroke = async () => {
    const stroke = liveStrokeRef.current;
    liveStrokeRef.current = null;
    setLiveStroke(null);
    if (!stroke?.points?.length) return;

    const deskId = workspace?.id ?? workspace?.deskId ?? id;
    if (!deskId) return;

    const pts = stroke.points;
    let minX = pts[0].x;
    let minY = pts[0].y;
    let maxX = pts[0].x;
    let maxY = pts[0].y;
    for (const p of pts) {
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x);
      maxY = Math.max(maxY, p.y);
    }
    const pad = Math.max(2, stroke.width / 2 + 2);
    const x = Math.floor(minX - pad);
    const y = Math.floor(minY - pad);
    const width = Math.ceil(maxX - minX + pad * 2);
    const height = Math.ceil(maxY - minY + pad * 2);

    const relPoints = pts.map((p) => ({
      x: Math.round((p.x - x) * 10) / 10,
      y: Math.round((p.y - y) * 10) / 10,
    }));

    try {
      const created = await createElementOnDesk(deskId, {
        type: 'drawing',
        x: Math.round(x),
        y: Math.round(y),
        width: Math.max(4, Math.round(width)),
        height: Math.max(4, Math.round(height)),
        zIndex: 0,
        payload: {
          data: {
            v: 1,
            kind: 'stroke',
            tool: 'brush',
            color: stroke.color,
            width: stroke.width,
            points: relPoints,
          },
        },
      });
      const vm = elementToVm(created);
      if (vm?.id) setElements((prev) => (prev.some((e) => e.id === vm.id) ? prev : [...prev, vm]));
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('Failed to create drawing stroke:', err?.response?.data || err);
      setActionError(err?.response?.data?.error || err?.message || 'Failed to save drawing');
      window.setTimeout(() => setActionError(null), 4500);
    }
  };

  const onCanvasPointerUp = (e) => {
    if (activeTool === 'pen' && liveStrokeRef.current) {
      finalizeStroke();
    }
    if (activeTool === 'eraser') {
      eraseStateRef.current.active = false;
      eraseStateRef.current.erasedIds = new Set();
    }
    stopInteractions(e);
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

  useEffect(() => {
    const onStorage = (e) => {
      if (e.key !== 'healis.shortcuts.v1') return;
      setShortcuts(loadShortcuts());
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.repeat) return;
      if (isEditableTarget(e.target)) return;

      if ((e.ctrlKey || e.metaKey) && String(e.key || '').toLowerCase() === 'f') {
        e.preventDefault();
        setSearchOpen(true);
        return;
      }

      if (e.key === 'Escape') {
        if (activeTool === 'pen' || activeTool === 'eraser') {
          e.preventDefault();
          liveStrokeRef.current = null;
          setLiveStroke(null);
          eraseStateRef.current.active = false;
          eraseStateRef.current.erasedIds = new Set();
          setActiveTool('select');
          return;
        }
      }

      if (matchShortcut(e, shortcuts['history.undo'])) {
        e.preventDefault();
        undo();
        return;
      }
      if (matchShortcut(e, shortcuts['history.redo'])) {
        e.preventDefault();
        redo();
        return;
      }
      if (matchShortcut(e, shortcuts['tool.text'])) {
        e.preventDefault();
        setActionError(null);
        setActiveTool('text');
        return;
      }
      if (matchShortcut(e, shortcuts['tool.handHold'])) {
        e.preventDefault();
        if (!handHoldRef.current.active) {
          handHoldRef.current.active = true;
          handHoldRef.current.previousTool = activeTool;
          setActiveTool('hand');
        }
      }
    };

    const onKeyUp = (e) => {
      if (!matchShortcut(e, shortcuts['tool.handHold'])) return;
      if (!handHoldRef.current.active) return;
      handHoldRef.current.active = false;
      const prev = handHoldRef.current.previousTool;
      handHoldRef.current.previousTool = null;
      if (prev) setActiveTool(prev);
    };

    window.addEventListener('keydown', onKeyDown, { capture: true });
    window.addEventListener('keyup', onKeyUp, { capture: true });
    return () => {
      window.removeEventListener('keydown', onKeyDown, { capture: true });
      window.removeEventListener('keyup', onKeyUp, { capture: true });
    };
  }, [shortcuts, activeTool]);

  const focusElement = (elementId) => {
    const el = elementsRef.current?.find?.((x) => x?.id === elementId) || elements.find((x) => x?.id === elementId);
    const canvas = canvasRef.current;
    if (!el || !canvas) return;
    const rect = canvas.getBoundingClientRect();
    const cx = rect.width / 2;
    const cy = rect.height / 2;
    const ex = (el.x ?? 0) + (el.width ?? 240) / 2;
    const ey = (el.y ?? 0) + (el.height ?? 160) / 2;
    setViewOffset({ x: cx - ex, y: cy - ey });
  };

  useEffect(() => {
    const deskId = workspace?.id ?? workspace?.deskId ?? id;
    const token = getToken();
    if (!deskId || !token) return () => {};

    // In dev: React runs on :3000, backend on :5000. CRA proxy sometimes misses WS; prefer explicit base.
    const inferredBase =
      window.location.port === '3000'
        ? `${window.location.protocol}//${window.location.hostname}:5000`
        : window.location.origin;
    const socketBase = process.env.REACT_APP_SOCKET_URL || inferredBase;

    const socket = io(socketBase, {
      auth: { token },
      // Allow fallback to polling if websocket is blocked.
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      socket.emit('desk:join', { deskId }, (ack = {}) => {
        if (!ack?.ok) {
          setActionError(String(ack?.error || 'Failed to join realtime room'));
          window.setTimeout(() => setActionError(null), 4500);
        }
      });
    });

    socket.on('connect_error', (err) => {
      setActionError(`Realtime connection failed: ${err?.message || 'unknown error'}`);
      window.setTimeout(() => setActionError(null), 4500);
    });

    socket.on('desk:presence', (p = {}) => {
      if (Number(p.deskId) !== Number(deskId)) return;
      const next = Array.isArray(p.users) ? p.users.map((u) => u.userId).filter((x) => x != null) : [];
      setPresentUserIds(next);
    });

    socket.on('note:updated', (msg = {}) => {
      if (Number(msg.deskId) !== Number(deskId)) return;
      const elementId = Number(msg.elementId);
      if (!elementId) return;
      if (msg.version != null) noteVersionsRef.current.set(elementId, msg.version);
      setElements((prev) =>
        prev.map((el) => (el.id === elementId ? { ...el, content: String(msg.text ?? '') } : el))
      );
    });

    socket.on('element:created', (raw) => {
      const vm = elementToVm(raw);
      if (!vm?.id) return;
      setElements((prev) => (prev.some((e) => e.id === vm.id) ? prev : [...prev, vm]));
    });

    socket.on('element:updated', (raw) => {
      const vm = elementToVm(raw);
      if (!vm?.id) return;
      setElements((prev) => prev.map((e) => (e.id === vm.id ? { ...e, ...vm } : e)));
    });

    socket.on('element:reactions', (msg = {}) => {
      if (Number(msg.deskId) !== Number(deskId)) return;
      const elementId = Number(msg.elementId);
      if (!elementId) return;
      const reactions = normalizeReactions(msg.reactions);
      setElements((prev) => prev.map((el) => (el.id === elementId ? { ...el, reactions } : el)));
    });

    socket.on('element:deleted', (msg = {}) => {
      if (Number(msg.deskId) !== Number(deskId)) return;
      const elementId = Number(msg.elementId);
      if (!elementId) return;
      setElements((prev) => prev.filter((e) => e.id !== elementId));
      setEditingElementId((cur) => (cur === elementId ? null : cur));
      setCommentsPanel((cur) => (cur?.elementId === elementId ? null : cur));
    });

    socket.on('comment:created', (msg = {}) => {
      if (!commentsEnabled) return;
      if (Number(msg.deskId) !== Number(deskId)) return;
      const elementId = Number(msg.elementId);
      const c = msg.comment;
      if (!elementId || !c?.id) return;
      setCommentsByElement((prev) => {
        const existing = prev[elementId] || [];
        if (existing.some((x) => Number(x?.id) === Number(c.id))) return prev;
        return { ...prev, [elementId]: [...existing, c] };
      });
    });

    socket.on('disconnect', () => {
      setPresentUserIds([]);
    });

    return () => {
      try {
        socket.emit('desk:leave', { deskId });
      } catch {
        // ignore
      }
      for (const t of noteEditTimersRef.current.values()) window.clearTimeout(t);
      noteEditTimersRef.current.clear();
      socket.disconnect();
      socketRef.current = null;
      setPresentUserIds([]);
    };
  }, [workspace?.id, workspace?.deskId, id, commentsEnabled]);

  useEffect(() => {
    if (!commentsPanel) return () => {};
    // Let the panel render first.
    window.setTimeout(() => commentInputRef.current?.focus?.(), 0);
  }, [commentsPanel]);

  useEffect(() => {
    const elementId = commentsPanel?.elementId;
    if (!commentsEnabled || !elementId) return () => {};
    const list = commentsByElement[elementId] || [];
    if (!list.length) return () => {};
    // Best-effort autoscroll to latest.
    window.setTimeout(() => {
      const node = commentsListRef.current;
      if (node) node.scrollTop = node.scrollHeight;
    }, 0);
  }, [commentsEnabled, commentsPanel?.elementId, commentsByElement]);

  const openComments = async (elementId) => {
    if (!commentsEnabled) return;
    if (!elementId) return;
    setCommentsPanel({ elementId });
    setCommentDraft('');
    if (commentsByElement[elementId]) return;
    setCommentsLoading((prev) => ({ ...prev, [elementId]: true }));
    try {
      const list = await getElementComments(elementId);
      setCommentsByElement((prev) => ({ ...prev, [elementId]: Array.isArray(list) ? list : [] }));
    } catch {
      // ignore (e.g., not group desk -> 404)
      setCommentsByElement((prev) => ({ ...prev, [elementId]: prev[elementId] || [] }));
    } finally {
      setCommentsLoading((prev) => ({ ...prev, [elementId]: false }));
    }
  };

  const submitComment = async () => {
    if (!commentsEnabled) return;
    const elementId = commentsPanel?.elementId;
    const text = String(commentDraft || '').trim();
    if (!elementId || !text) return;
    setCommentDraft('');
    try {
      const created = await createElementComment(elementId, text);
      if (created?.id) {
        setCommentsByElement((prev) => {
          const existing = prev[elementId] || [];
          if (existing.some((x) => Number(x?.id) === Number(created.id))) return prev;
          return { ...prev, [elementId]: [...existing, created] };
        });
      }
    } catch (err) {
      setActionError(err?.response?.data?.error || err?.message || 'Failed to send comment');
      window.setTimeout(() => setActionError(null), 4500);
    }
  };

  useEffect(() => {
    // Best-effort previews for text-like formats. For everything else we show an icon/thumbnail/pdf embed.
    let cancelled = false;

    const docs = elements
      .filter((el) => el?.type === 'document')
      .map((el) => {
        const doc = el.document ?? el.Document;
        const title = doc?.title || 'Document';
        const url = doc?.url;
        const ext = getExt(title) || getExt(url);
        return { url, title, ext };
      })
      .filter((d) => d.url && TEXT_PREVIEW_EXTS.has(d.ext));

    const need = docs.filter((d) => docTextPreview[d.url] == null && !fetchingPreviewsRef.current.has(d.url));
    if (!need.length) return () => {};

    (async () => {
      for (const d of need.slice(0, 6)) {
        fetchingPreviewsRef.current.add(d.url);
        try {
          const res = await axios.get(d.url, { responseType: 'text' });
          if (cancelled) return;
          const text = String(res.data ?? '')
            .replace(/\r\n/g, '\n')
            .slice(0, MAX_PREVIEW_CHARS);
          setDocTextPreview((prev) => ({ ...prev, [d.url]: text }));
        } catch {
          if (cancelled) return;
          // Avoid refetch loops.
          setDocTextPreview((prev) => ({ ...prev, [d.url]: '' }));
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [elements, docTextPreview]);

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
          </div>
        </div>

        <div className={styles.center}>
          <div className={styles.toolbar}>
            <div className={styles.historyGroup} aria-label="History">
              <IconBtn
                label="Undo"
                title={`Undo (${formatShortcut(shortcuts['history.undo'] || DEFAULT_SHORTCUTS['history.undo'])})`}
                onClick={undo}
                disabled={!historyMeta.canUndo}
              >
                <Undo2 size={18} />
              </IconBtn>
              <IconBtn
                label="Redo"
                title={`Redo (${formatShortcut(shortcuts['history.redo'] || DEFAULT_SHORTCUTS['history.redo'])})`}
                onClick={redo}
                disabled={!historyMeta.canRedo}
              >
                <Redo2 size={18} />
              </IconBtn>
            </div>
            <div className={styles.searchWrap}>
              <IconBtn
                label="Поиск"
                title="Поиск (Ctrl+F)"
                buttonRef={searchBtnRef}
                onClick={() => setSearchOpen((v) => !v)}
              >
                <Search size={18} />
              </IconBtn>
              {searchOpen ? (
                <div
                  ref={searchPopoverRef}
                  className={styles.searchPopover}
                  onPointerDown={(ev) => ev.stopPropagation()}
                  role="dialog"
                  aria-label="Search on board"
                >
                  <div className={styles.searchRow}>
                    <input
                      ref={searchInputRef}
                      className={styles.searchInput}
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Поиск по доске…"
                      onKeyDown={(e) => {
                        if (e.key === 'Escape') {
                          e.preventDefault();
                          setSearchOpen(false);
                        }
                      }}
                    />
                    <button
                      type="button"
                      className={styles.searchClearBtn}
                      onClick={() => setSearchQuery('')}
                      disabled={!searchQuery.trim()}
                      aria-label="Clear search"
                      title="Clear"
                    >
                      ×
                    </button>
                  </div>
                  <div className={styles.searchMeta}>
                    {searchQuery.trim()
                      ? `${manualSearchResults.length} результатов · ${manualSearchHitIds.size} элементов`
                      : 'Введите текст для поиска по заметкам, текстовым полям, названиям файлов и ссылок'}
                  </div>
                  {searchQuery.trim() ? (
                    <div className={styles.searchResults} aria-label="Search results">
                      {manualSearchResults.length ? (
                        manualSearchResults.slice(0, 10).map((r) => {
                          const first = r.hits?.[0];
                          const snippet = first ? makeSnippet(first.text, searchQuery, 30) : '';
                          const kind =
                            r.elementType === 'note'
                              ? 'Заметка'
                              : r.elementType === 'text'
                                ? 'Текст'
                                : r.elementType === 'document'
                                  ? 'Файл'
                                  : r.elementType === 'link'
                                    ? 'Ссылка'
                                    : 'Элемент';

                          return (
                            <button
                              key={r.elementId}
                              type="button"
                              className={styles.searchResult}
                              onClick={() => {
                                focusElement(r.elementId);
                              }}
                              title="Показать на доске"
                            >
                              <div className={styles.searchResultTop}>
                                <span className={styles.searchResultKind}>{kind}</span>
                                <span className={styles.searchResultCount}>{r.hits?.length || 1}</span>
                              </div>
                              <div className={styles.searchResultSnippet}>
                                {renderHighlightedText(snippet, searchQuery, styles.searchMark)}
                              </div>
                            </button>
                          );
                        })
                      ) : (
                        <div className={styles.searchEmpty}>Ничего не найдено</div>
                      )}
                    </div>
                  ) : null}
                  <div className={styles.searchHint}>Клик по результату — показать · Esc — закрыть</div>
                </div>
              ) : null}
            </div>
            <MembersMenu
              groupId={workspace?.groupId}
              presentUserIds={new Set(presentUserIds)}
              buttonClassName={styles.iconBtn}
            />
            
          </div>
        </div>

        <div className={styles.right}>
          <div className={styles.health}>
            <span className={`${styles.dot} ${health?.ok ? styles.dotOk : styles.dotBad}`} />
            <span className={styles.healthText}>
              {health?.ok ? 'backend online' : 'backend offline'}
            </span>
          </div>
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
            const isActive = toolId !== 'attach' && activeTool === toolId;
            const btn = (
              <button
                key={toolId}
                type="button"
                className={`${styles.tool} ${isActive ? styles.toolActive : ''}`}
                aria-label={label}
                aria-pressed={isActive}
                onClick={() => {
                  if (toolId === 'attach') {
                    openAttachDialog();
                    return;
                  }
                  setActionError(null);
                  setActiveTool(toolId);
                }}
              >
                {toolId === 'attach' && uploading ? (
                  <Loader2 size={18} className={styles.spinner} />
                ) : (
                  <Icon size={18} />
                )}
              </button>
            );

            if (toolId !== 'link' && toolId !== 'pen') return btn;

            return (
              <div key={toolId} className={styles.toolWrap}>
                {btn}
                {activeTool === 'link' && toolId === 'link' ? (
                  <div className={styles.toolPopover} onPointerDown={(ev) => ev.stopPropagation()}>
                    <div className={styles.toolPopoverRow}>
                      <input
                        ref={linkInputRef}
                        className={styles.linkInput}
                        placeholder="Paste URL and press Enter"
                        value={linkDraftUrl}
                        disabled={creatingLink}
                        onChange={(ev) => setLinkDraftUrl(ev.target.value)}
                        onKeyDown={(ev) => {
                          if (ev.key === 'Escape') {
                            ev.preventDefault();
                            setLinkDraftUrl('');
                            setActiveTool('select');
                            return;
                          }
                          if (ev.key === 'Enter' && !ev.shiftKey) {
                            ev.preventDefault();
                            submitLink();
                          }
                        }}
                      />
                      {creatingLink ? <Loader2 size={16} className={styles.spinner} /> : null}
                    </div>
                    <div className={styles.toolPopoverHint}>Enter — add to board · Esc — close</div>
                  </div>
                ) : null}

                {activeTool === 'pen' && toolId === 'pen' ? (
                  <div className={styles.toolPopover} onPointerDown={(ev) => ev.stopPropagation()}>
                    <div className={styles.toolPopoverRow}>
                      <div className={styles.swatches} aria-label="Brush color">
                        {BRUSH_COLORS.map((c) => (
                          <button
                            key={c}
                            type="button"
                            className={`${styles.swatch} ${brushColor === c ? styles.swatchActive : ''}`}
                            style={{ background: c }}
                            onClick={() => setBrushColor(c)}
                            aria-label={`Color ${c}`}
                            aria-pressed={brushColor === c}
                          />
                        ))}
                      </div>
                    </div>
                    <div className={styles.toolPopoverRow}>
                      <div className={styles.widthRow}>
                        <input
                          className={styles.widthSlider}
                          type="range"
                          min={1}
                          max={24}
                          value={brushWidth}
                          onChange={(ev) => setBrushWidth(Number(ev.target.value))}
                          aria-label="Brush width"
                        />
                        <div className={styles.widthLabel}>{brushWidth}px</div>
                      </div>
                    </div>
                    <div className={styles.toolPopoverHint}>Drag — draw · Esc — switch tool</div>
                  </div>
                ) : null}
              </div>
            );
          })}
        </aside>
        <input
          ref={fileInputRef}
          type="file"
          className={styles.hiddenFileInput}
          onChange={handleAttachSelected}
          accept=".txt,.md,.rtf,.csv,.pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.zip,.rar,.7z,.png,.jpg,.jpeg,.webp"
        />

        <main
          className={styles.canvas}
          aria-label="Workspace canvas"
          ref={canvasRef}
          onPointerDown={onCanvasPointerDown}
          onPointerMove={onCanvasPointerMove}
          onPointerUp={onCanvasPointerUp}
          onPointerCancel={onCanvasPointerUp}
          onPointerLeave={onCanvasPointerUp}
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
              if (el?.type === 'drawing') {
                const data = el.drawing?.data || el.Drawing?.data || {};
                const pts = Array.isArray(data?.points) ? data.points : [];
                const strokeColor = String(data?.color || '#0f172a');
                const strokeW = Number(data?.width ?? 4);
                const path = pointsToSvgPath(pts);
                return (
                  <div
                    key={el.id}
                    data-element-id={el.id}
                    className={`${styles.element} ${styles.drawingElement}`}
                    style={{
                      left: el.x ?? 0,
                      top: el.y ?? 0,
                      width: el.width ?? 10,
                      height: el.height ?? 10,
                      zIndex: el.zIndex ?? 0,
                      transform: `rotate(${el.rotation ?? 0}deg)`,
                    }}
                    onPointerDown={(ev) => onElementPointerDown(el.id, ev)}
                  >
                    <svg
                      className={styles.drawingSvg}
                      width={el.width ?? 10}
                      height={el.height ?? 10}
                      viewBox={`0 0 ${el.width ?? 10} ${el.height ?? 10}`}
                      aria-hidden="true"
                    >
                      <path
                        d={path}
                        fill="none"
                        stroke={strokeColor}
                        strokeWidth={strokeW}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </div>
                );
              }

              const isEditing = editingElementId === el.id;
              const isDocument = el.type === 'document';
              const isLink = el.type === 'link';
              const innerClass =
                isDocument || isLink
                  ? `${styles.elementInner} ${styles.documentInner} ${isLink ? styles.linkInner : ''}`
                  : el.type === 'note'
                    ? `${styles.elementInner} ${styles.noteInner}`
                    : `${styles.elementInner} ${styles.textInner}`;
              const displayTextClass = el.type === 'note' ? `${styles.displayText} ${styles.notePad}` : styles.displayText;
              const editorClass = el.type === 'note' ? `${styles.editor} ${styles.noteEditorPad}` : styles.editor;

              const doc = isDocument ? el.document ?? el.Document : null;
              const docTitle = fixMojibakeNameClient(doc?.title || 'Document');
              const docUrl = doc?.url;
              const docExt = getExt(docTitle) || getExt(docUrl);
              const DocIcon = pickDocIcon(docExt);

              const link = isLink ? el.link ?? el.Link : null;
              const linkUrl = link?.url || '';
              const linkTitle = fixMojibakeNameClient(link?.title || safeHostname(linkUrl) || linkUrl || 'Link');
              const linkPreview = link?.previewImageUrl || '';
              const linkHost = safeHostname(linkUrl);

              const reactionBubbles = layoutReactionBubbles(
                el.id,
                el.width ?? 240,
                el.height ?? 160,
                el.reactions
              );

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
                  onContextMenu={(ev) => {
                    if (activeTool === 'pen' || activeTool === 'eraser') return;
                    ev.preventDefault();
                    ev.stopPropagation();
                    openReactionPicker(el.id, ev.clientX, ev.clientY);
                  }}
                  onDoubleClick={() => {
                    if (activeTool === 'pen' || activeTool === 'eraser') return;
                    beginEditing(el.id);
                  }}
                >
                  {commentsEnabled ? (
                    <button
                      type="button"
                      className={styles.commentBtn}
                      onPointerDown={(ev) => ev.stopPropagation()}
                      onClick={(ev) => {
                        ev.stopPropagation();
                        openComments(el.id);
                      }}
                      aria-label="Comments"
                      title="Комментарии"
                    >
                      <MessageCircle size={16} />
                    </button>
                  ) : null}
                  <div
                    className={`${innerClass} ${
                      searchQuery.trim() && manualSearchHitIds.has(el.id) ? styles.elementSearchHit : ''
                    }`}
                  >
                    {isDocument ? (
                      <div className={styles.docCard}>
                        <div className={styles.docHeader}>
                          <div className={styles.docIcon}>
                            <DocIcon size={18} />
                          </div>
                          <div className={styles.docInfo}>
                            <div className={styles.docTitleRow}>
                              <button
                                type="button"
                                className={styles.docTitleBtn}
                                onPointerDown={(ev) => ev.stopPropagation()}
                                onClick={(ev) => {
                                  ev.stopPropagation();
                                  openDocument(docUrl);
                                }}
                                disabled={!docUrl}
                                title={docUrl ? 'Open' : 'No file'}
                              >
                                {renderHighlightedText(docTitle, searchQuery, styles.searchMark)}
                              </button>
                              <div className={styles.docActions}>
                                <button
                                  type="button"
                                  className={styles.docActionBtn}
                                  onPointerDown={(ev) => ev.stopPropagation()}
                                  onClick={(ev) => {
                                    ev.stopPropagation();
                                    openDocument(docUrl);
                                  }}
                                  disabled={!docUrl}
                                  aria-label="Open file"
                                  title="Open"
                                >
                                  <ExternalLink size={16} />
                                </button>
                                <button
                                  type="button"
                                  className={styles.docActionBtn}
                                  onPointerDown={(ev) => ev.stopPropagation()}
                                  onClick={(ev) => {
                                    ev.stopPropagation();
                                    downloadDocument(docUrl, docTitle);
                                  }}
                                  disabled={!docUrl}
                                  aria-label="Download file"
                                  title="Download"
                                >
                                  <Download size={16} />
                                </button>
                              </div>
                            </div>
                            <div className={styles.docMeta}>{docExt ? docExt.toUpperCase() : 'FILE'}</div>
                          </div>
                        </div>
                        <div className={styles.docPreview}>
                          {docUrl && ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'svg'].includes(docExt) ? (
                            <img
                              className={styles.docThumb}
                              src={docUrl}
                              alt={docTitle}
                              draggable={false}
                              onPointerDown={(ev) => ev.stopPropagation()}
                            />
                          ) : docUrl && docExt === 'pdf' ? (
                            <object
                              className={styles.docPdf}
                              data={docUrl}
                              type="application/pdf"
                              aria-label={docTitle}
                            >
                              <div className={styles.docPreviewFallback}>Preview not available</div>
                            </object>
                          ) : docUrl && TEXT_PREVIEW_EXTS.has(docExt) ? (
                            <div className={styles.docTextPreview} aria-label="Text preview">
                              <pre className={styles.docTextPre}>
                                {docTextPreview[docUrl] != null
                                  ? docTextPreview[docUrl] || 'Preview not available'
                                  : 'Loading preview...'}
                              </pre>
                            </div>
                          ) : (
                            <div className={styles.docPreviewFallback}>
                              <div className={styles.docFallbackIcon}>
                                <DocIcon size={34} />
                              </div>
                              <div className={styles.docFallbackExt}>{docExt ? docExt.toUpperCase() : 'FILE'}</div>
                            </div>
                          )}
                        </div>
                      </div>
                    ) : isLink ? (
                      <div className={styles.linkCard}>
                        <div className={styles.linkHeader}>
                          <div className={styles.linkIcon}>
                            <Link2 size={18} />
                          </div>
                          <div className={styles.linkInfo}>
                            {isEditing ? (
                              <div className={styles.linkEdit}>
                                <input
                                  className={styles.linkEditTitle}
                                  value={link?.title ?? ''}
                                  placeholder="Title (optional)"
                                  onPointerDown={(ev) => ev.stopPropagation()}
                                  onChange={(ev) => {
                                    const next = { ...(link || {}), title: ev.target.value };
                                    updateLocalElement(el.id, { link: next, Link: next });
                                  }}
                                />
                                <input
                                  className={styles.linkEditUrl}
                                  value={linkUrl}
                                  placeholder="https://example.com"
                                  onPointerDown={(ev) => ev.stopPropagation()}
                                  onChange={(ev) => {
                                    const next = { ...(link || {}), url: ev.target.value };
                                    updateLocalElement(el.id, { link: next, Link: next });
                                  }}
                                  onKeyDown={(ev) => {
                                    if (ev.key === 'Escape') {
                                      ev.preventDefault();
                                      setEditingElementId(null);
                                      return;
                                    }
                                    if (ev.key === 'Enter' && !ev.shiftKey) {
                                      ev.preventDefault();
                                      const nextUrl = normalizeUrlClient(ev.currentTarget.value);
                                      const nextLink = { ...(link || {}), url: nextUrl };
                                      updateLocalElement(el.id, { link: nextLink, Link: nextLink });
                                      setEditingElementId(null);
                                      (async () => {
                                        try {
                                          let preview = null;
                                          try {
                                            preview = await getLinkPreview(nextUrl);
                                          } catch {
                                            preview = null;
                                          }
                                          const hydrated =
                                            preview && (preview.title || preview.previewImageUrl || preview.url)
                                              ? {
                                                  ...nextLink,
                                                  url: preview.url || nextUrl,
                                                  title: nextLink.title || preview.title,
                                                  previewImageUrl: preview.previewImageUrl || nextLink.previewImageUrl,
                                                }
                                              : nextLink;
                                          updateLocalElement(el.id, { link: hydrated, Link: hydrated });
                                          const before = editStartSnapRef.current.get(el.id) || null;
                                          editStartSnapRef.current.delete(el.id);
                                          await persistElement({ ...el, link: hydrated, Link: hydrated }, { historyBefore: before });
                                        } catch {
                                          // ignore
                                        }
                                      })();
                                    }
                                  }}
                                />
                              </div>
                            ) : (
                              <div className={styles.linkTitleRow}>
                                <button
                                  type="button"
                                  className={styles.linkTitleBtn}
                                  onPointerDown={(ev) => ev.stopPropagation()}
                                  onClick={(ev) => {
                                    ev.stopPropagation();
                                    openExternalUrl(linkUrl);
                                  }}
                                  disabled={!linkUrl}
                                  title={linkUrl || 'No url'}
                                >
                                  {renderHighlightedText(linkTitle, searchQuery, styles.searchMark)}
                                </button>
                                <div className={styles.docActions}>
                                  <button
                                    type="button"
                                    className={styles.docActionBtn}
                                    onPointerDown={(ev) => ev.stopPropagation()}
                                    onClick={(ev) => {
                                      ev.stopPropagation();
                                      openExternalUrl(linkUrl);
                                    }}
                                    disabled={!linkUrl}
                                    aria-label="Open link"
                                    title="Open"
                                  >
                                    <ExternalLink size={16} />
                                  </button>
                                </div>
                              </div>
                            )}
                            <div className={styles.linkMeta}>
                              {renderHighlightedText(linkHost || 'LINK', searchQuery, styles.searchMark)}
                            </div>
                          </div>
                        </div>

                        <div className={styles.linkPreview}>
                          {linkPreview ? (
                            <img
                              className={styles.linkThumb}
                              src={linkPreview}
                              alt={linkTitle}
                              draggable={false}
                              onPointerDown={(ev) => ev.stopPropagation()}
                            />
                          ) : (
                            <div className={styles.linkPreviewFallback}>
                              <div className={styles.linkFallbackIcon}>
                                <Link2 size={34} />
                              </div>
                              <div className={styles.linkFallbackHost}>{linkHost || 'PREVIEW'}</div>
                            </div>
                          )}
                        </div>
                      </div>
                    ) : isEditing ? (
                      <textarea
                        className={editorClass}
                        value={el.content ?? ''}
                        autoFocus
                        onPointerDown={(ev) => ev.stopPropagation()}
                        onChange={(ev) => {
                          const next = ev.target.value;
                          updateLocalElement(el.id, { content: next });
                          if (el.type === 'note') queueNoteEdit(el.id, next);
                        }}
                        onKeyDown={async (ev) => {
                          if (ev.key === 'Enter' && !ev.shiftKey) {
                            ev.preventDefault();
                            await endEditing();
                          }
                        }}
                      />
                    ) : (
                      <div className={displayTextClass}>
                        {renderHighlightedText(el.content ?? '', searchQuery, styles.searchMark)}
                      </div>
                    )}
                  </div>

                  {reactionBubbles.length ? (
                    <div className={styles.reactionsLayer} aria-label="Reactions">
                      {reactionBubbles.map((b) => (
                        <button
                          key={b.emoji}
                          type="button"
                          className={styles.reactionBubble}
                          style={{
                            left: '50%',
                            top: '50%',
                            transform: `translate(-50%, -50%) translate(${b.dx}px, ${b.dy}px)`,
                          }}
                          onPointerDown={(ev) => ev.stopPropagation()}
                          onClick={(ev) => {
                            ev.stopPropagation();
                            toggleReaction(el.id, b.emoji);
                          }}
                          title={b.count > 1 ? `${b.emoji} · ${b.count}` : b.emoji}
                          aria-label={b.count > 1 ? `${b.emoji} ${b.count}` : b.emoji}
                        >
                          <span className={styles.reactionEmoji}>{b.emoji}</span>
                          {b.count > 1 ? <span className={styles.reactionCount}>{b.count}</span> : null}
                        </button>
                      ))}
                    </div>
                  ) : null}

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
            {liveStroke?.points?.length ? (
              (() => {
                const pts = liveStroke.points;
                let minX = pts[0].x;
                let minY = pts[0].y;
                let maxX = pts[0].x;
                let maxY = pts[0].y;
                for (const p of pts) {
                  minX = Math.min(minX, p.x);
                  minY = Math.min(minY, p.y);
                  maxX = Math.max(maxX, p.x);
                  maxY = Math.max(maxY, p.y);
                }
                const pad = Math.max(2, liveStroke.width / 2 + 2);
                const x = Math.floor(minX - pad);
                const y = Math.floor(minY - pad);
                const w = Math.ceil(maxX - minX + pad * 2);
                const h = Math.ceil(maxY - minY + pad * 2);
                const rel = pts.map((p) => ({ x: p.x - x, y: p.y - y }));
                const d = pointsToSvgPath(rel);
                return (
                  <div
                    className={styles.liveStroke}
                    style={{ left: x, top: y, width: w, height: h, zIndex: 1 }}
                    aria-hidden="true"
                  >
                    <svg className={styles.drawingSvg} width={w} height={h} viewBox={`0 0 ${w} ${h}`}>
                      <path
                        d={d}
                        fill="none"
                        stroke={liveStroke.color}
                        strokeWidth={liveStroke.width}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </div>
                );
              })()
            ) : null}
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

      {commentsEnabled && commentsPanel ? (
        <div
          className={styles.commentsPanel}
          role="dialog"
          aria-label="Comments"
          onPointerDown={(ev) => ev.stopPropagation()}
        >
          <div className={styles.commentsPanelHeader}>
            <div className={styles.commentsPanelTitle}>Комментарии</div>
            <button
              type="button"
              className={styles.commentsPanelClose}
              onClick={() => setCommentsPanel(null)}
              aria-label="Close comments"
              title="Закрыть"
            >
              <X size={18} />
            </button>
          </div>

          <div className={styles.commentsPanelMeta}>
            Элемент #{commentsPanel.elementId}
            {commentsLoading[commentsPanel.elementId] ? ' · загрузка…' : ''}
          </div>

          <div ref={commentsListRef} className={styles.commentsList} aria-label="Comments list">
            {(commentsByElement[commentsPanel.elementId] || []).length ? (
              (commentsByElement[commentsPanel.elementId] || []).map((c) => (
                <div key={c.id} className={styles.commentItem}>
                  <div className={styles.commentTop}>
                    <span className={styles.commentAuthor}>{c?.user?.email || c?.User?.email || 'User'}</span>
                    <span className={styles.commentTime}>
                      {c?.createdAt ? new Date(c.createdAt).toLocaleString() : ''}
                    </span>
                  </div>
                  <div className={styles.commentText}>{String(c?.text ?? '')}</div>
                </div>
              ))
            ) : (
              <div className={styles.commentsEmpty}>Пока нет комментариев — напишите первый.</div>
            )}
          </div>

          <div className={styles.commentComposer}>
            <textarea
              ref={commentInputRef}
              className={styles.commentInput}
              value={commentDraft}
              placeholder="Написать комментарий…"
              onChange={(ev) => setCommentDraft(ev.target.value)}
              onKeyDown={(ev) => {
                if (ev.key === 'Escape') {
                  ev.preventDefault();
                  setCommentsPanel(null);
                  return;
                }
                if (ev.key === 'Enter' && !ev.shiftKey) {
                  ev.preventDefault();
                  submitComment();
                }
              }}
            />
            <button
              type="button"
              className={styles.commentSendBtn}
              onClick={submitComment}
              disabled={!String(commentDraft || '').trim()}
            >
              Отправить
            </button>
          </div>
        </div>
      ) : null}

      {reactionPicker ? (
        <div
          ref={reactionPickerRef}
          className={styles.reactionPicker}
          style={{ left: reactionPicker.x, top: reactionPicker.y }}
          onPointerDown={(ev) => ev.stopPropagation()}
        >
          <div className={styles.reactionPickerRow} aria-label="Quick reactions">
            {QUICK_REACTIONS.map((emo) => (
              <button
                key={emo}
                type="button"
                className={styles.reactionPickerBtn}
                onClick={(ev) => {
                  ev.stopPropagation();
                  toggleReaction(reactionPicker.elementId, emo);
                  setReactionPicker(null);
                }}
                aria-label={emo}
                title={emo}
              >
                {emo}
              </button>
            ))}
          </div>
          <div className={styles.reactionPickerRow}>
            <input
              className={styles.reactionPickerInput}
              value={reactionCustomEmoji}
              placeholder="Emoji…"
              onChange={(ev) => setReactionCustomEmoji(ev.target.value)}
              onKeyDown={(ev) => {
                if (ev.key === 'Escape') {
                  ev.preventDefault();
                  setReactionPicker(null);
                  return;
                }
                if (ev.key === 'Enter') {
                  ev.preventDefault();
                  toggleReaction(reactionPicker.elementId, reactionCustomEmoji);
                  setReactionPicker(null);
                }
              }}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
