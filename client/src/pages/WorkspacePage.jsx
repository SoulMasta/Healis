import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { io } from 'socket.io-client';
import {
  ArrowUp,
  ArrowLeft,
  Bell,
  File,
  FileArchive,
  FileImage,
  FileSpreadsheet,
  FileText,
  Eraser,
  Hand,
  Home,
  Link2,
  MoreVertical,
  Share2,
  Spline,
  MessageCircle,
  MousePointer2,
  Paperclip,
  Plus,
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
import { getToken, refreshAuth } from '../http/userAPI';
import {
  createElementOnDesk,
  getElementsByDesk,
  updateElement,
  deleteElement,
  uploadFileToDesk,
  getLinkPreview,
} from '../http/elementsAPI';
import { createElementComment, getElementComments } from '../http/commentsAPI';
import { chatWithDesk, getAiStatus } from '../http/aiAPI';
import UserMenu from '../components/UserMenu';
import MembersMenu from '../components/MembersMenu';
import { useBreakpoints } from '../hooks/useBreakpoints';
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

const AI_PROMPT_SUGGESTIONS = [
  {
    label: 'Суммаризация',
    prompt: 'Сделай краткую суммаризацию контента доски и выдели ключевые темы.',
  },
  {
    label: 'Задачи',
    prompt: 'Предложи actionable список задач по содержимому доски. Коротко, по пунктам.',
  },
  {
    label: 'План',
    prompt: 'Составь пошаговый план действий на основе содержимого доски.',
  },
  {
    label: 'Идеи',
    prompt: 'Предложи 5 идей/улучшений по содержимому доски.',
  },
];

const VIEW_SCALE_MIN = 0.2;
const VIEW_SCALE_MAX = 3;
// Baseline board scale. We intentionally render boards slightly smaller to increase field of view.
// UI "100%" corresponds to this baseline.
const VIEW_SCALE_BASE = 0.88;

function clampNumber(v, min, max) {
  return Math.min(max, Math.max(min, v));
}

function clampViewScale(s) {
  return clampNumber(Number(s) || 1, VIEW_SCALE_MIN, VIEW_SCALE_MAX);
}

function formatViewScalePct(s) {
  const eff = clampViewScale(s);
  const pct = (eff / VIEW_SCALE_BASE) * 100;
  return `${Math.round(pct)}%`;
}

function escapeRegExp(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Stable callback wrapper: keeps function identity stable while always calling the latest implementation.
function useEvent(handler) {
  const handlerRef = useRef(handler);
  useLayoutEffect(() => {
    handlerRef.current = handler;
  });
  return useCallback((...args) => handlerRef.current?.(...args), []);
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

function normalizeElementId(raw) {
  const n = Number(raw);
  return Number.isFinite(n) ? n : raw;
}

function idKey(raw) {
  return raw == null ? null : String(raw);
}

function sameId(a, b) {
  const ka = idKey(a);
  const kb = idKey(b);
  return ka != null && kb != null && ka === kb;
}

function upsertById(list, item) {
  if (!Array.isArray(list)) return Array.isArray(item) ? item : [];
  if (!item || item.id == null) return list;
  const idx = list.findIndex((x) => sameId(x?.id, item.id));
  if (idx < 0) return [...list, item];
  const next = list.slice();
  next[idx] = { ...next[idx], ...item };
  return next;
}

function dedupeMergeById(list) {
  if (!Array.isArray(list) || list.length <= 1) return list;
  const indexById = new Map();
  const out = [];
  let changed = false;
  for (const el of list) {
    const k = idKey(el?.id);
    if (!k) {
      out.push(el);
      continue;
    }
    const idx = indexById.get(k);
    if (idx == null) {
      indexById.set(k, out.length);
      out.push(el);
      continue;
    }
    changed = true;
    out[idx] = { ...out[idx], ...el };
  }
  return changed ? out : list;
}

let __fitMeasurerEl = null;
function getFitMeasurerEl() {
  if (typeof document === 'undefined') return null;
  if (__fitMeasurerEl && document.body?.contains(__fitMeasurerEl)) return __fitMeasurerEl;
  const m = document.createElement('div');
  m.setAttribute('data-fit-measurer', 'true');
  Object.assign(m.style, {
    position: 'fixed',
    left: '-99999px',
    top: '-99999px',
    visibility: 'hidden',
    pointerEvents: 'none',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
    overflowWrap: 'break-word',
    padding: '0',
    margin: '0',
    border: '0',
    boxSizing: 'border-box',
  });
  document.body.appendChild(m);
  __fitMeasurerEl = m;
  return m;
}

function IconBtn({ label, title, children, onClick, disabled, buttonRef, className }) {
  return (
    <button
      type="button"
      className={`${styles.iconBtn} ${className || ''}`}
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

const NoteTextElement = React.memo(function NoteTextElement({
  el,
  isSelected,
  isEditing,
  dragX,
  dragY,
  commentsEnabled,
  deletingElementId,
  searchQuery,
  isSearchHit,
  activeTool,
  connectorHoverElementId,
  connectorFromElementId,
  connectorToHoverElementId,
  registerNode,
  actions,
}) {
  const elementId = el?.id;
  const content = el?.content;
  const [draft, setDraft] = React.useState(String(content ?? ''));
  const textElRef = React.useRef(null);
  const [fitStyle, setFitStyle] = React.useState(() => ({
    fontSizePx: 14,
    padY: 18,
  }));

  React.useEffect(() => {
    // When entering edit mode, initialize draft from current content.
    if (!elementId) return;
    if (isEditing) setDraft(String(content ?? ''));
  }, [isEditing, elementId, content]);

  React.useLayoutEffect(() => {
    const node = textElRef.current;
    const measurer = getFitMeasurerEl();
    if (!node || !measurer) return;

    const boxW = Math.max(0, Math.floor(node.clientWidth || 0));
    const boxH = Math.max(0, Math.floor(node.clientHeight || 0));
    if (boxW <= 0 || boxH <= 0) return;

    const cs = window.getComputedStyle(node);
    // Preserve typography; keep wrapping/line-height consistent with our inline style.
    const lineHeight = 1.15;
    measurer.style.fontFamily = cs.fontFamily;
    measurer.style.fontWeight = cs.fontWeight;
    measurer.style.letterSpacing = cs.letterSpacing;
    measurer.style.lineHeight = String(lineHeight);
    measurer.style.whiteSpace = 'pre-wrap';
    measurer.style.wordBreak = 'break-word';
    measurer.style.overflowWrap = 'break-word';
    measurer.style.width = `${boxW}px`;

    const rawText = String(isEditing ? draft : (el?.content ?? ''));
    // Use a non-empty string to keep a stable "empty" caret baseline.
    const measureText = rawText.trim().length ? rawText : 'A';
    measurer.textContent = measureText;

    const minFont = 10;
    const maxFont = Math.min(72, Math.max(18, Math.floor(boxH * 0.6)));
    // Keep some horizontal breathing room; vertical padding will be computed dynamically below.
    const padX = el?.type === 'note' ? 22 : 18;
    const minPadY = 8;
    const availW = Math.max(0, boxW - padX * 2);
    const availH = Math.max(0, boxH - minPadY * 2);
    if (availW <= 0 || availH <= 0) return;

    measurer.style.width = `${availW}px`;

    const fits = () => measurer.scrollHeight <= availH + 0.5 && measurer.scrollWidth <= availW + 0.5;

    let lo = minFont;
    let hi = maxFont;
    // Binary search the largest fitting font size.
    for (let i = 0; i < 10; i += 1) {
      const mid = Math.floor((lo + hi + 1) / 2);
      measurer.style.fontSize = `${mid}px`;
      if (fits()) lo = mid;
      else hi = mid - 1;
      if (hi <= lo) break;
    }
    const fontSizePx = Math.max(minFont, Math.min(maxFont, lo));

    // Compute vertical centering padding using the chosen font size.
    measurer.style.fontSize = `${fontSizePx}px`;
    const textH = Math.max(0, Math.ceil(measurer.scrollHeight || 0));
    const padY = Math.max(minPadY, Math.floor((boxH - textH) / 2));

    setFitStyle((prev) => {
      if (prev.fontSizePx === fontSizePx && prev.padY === padY) return prev;
      return { fontSizePx, padY };
    });
  }, [draft, isEditing, el?.content, el?.width, el?.height, el?.type]);

  if (!elementId) return null;

  const showConnectorEndpoints =
    isSelected ||
    (activeTool === 'connector' && connectorHoverElementId === elementId) ||
    connectorFromElementId === elementId ||
    connectorToHoverElementId === elementId;

  const innerClass =
    el.type === 'note' ? `${styles.elementInner} ${styles.noteInner}` : `${styles.elementInner} ${styles.textInner}`;
  const displayTextClass = el.type === 'note' ? `${styles.displayText} ${styles.notePad}` : styles.displayText;
  const editorClass = el.type === 'note' ? `${styles.editor} ${styles.noteEditorPad}` : styles.editor;
  const padX = el.type === 'note' ? 22 : 18;
  const fitInlineStyle = {
    fontSize: `${fitStyle.fontSizePx}px`,
    lineHeight: 1.15,
    paddingTop: `${fitStyle.padY}px`,
    paddingBottom: `${fitStyle.padY}px`,
    paddingLeft: `${padX}px`,
    paddingRight: `${padX}px`,
    textAlign: 'center',
  };

  const reactionBubbles = actions.layoutReactionBubbles(elementId, el.reactions);
  // If a render happens mid-drag (e.g. due to external state updates), keep the dragged element stable.
  const ex = Number(dragX != null ? dragX : (el.x ?? 0));
  const ey = Number(dragY != null ? dragY : (el.y ?? 0));

  return (
    <div
      data-element-id={elementId}
      className={styles.element}
      ref={(node) => registerNode?.(elementId, node)}
      style={{
        left: 0,
        top: 0,
        width: el.width ?? 240,
        height: el.height ?? 160,
        zIndex: el.zIndex ?? 0,
        transform: `translate3d(${ex}px, ${ey}px, 0) rotate(${el.rotation ?? 0}deg)`,
      }}
      onPointerDown={(ev) => actions.onElementPointerDown(elementId, ev)}
      onPointerUp={(ev) => actions.maybeEnterEditOnPointerUp(elementId, ev)}
      onClick={(ev) => actions.onElementClick(elementId, ev)}
      onContextMenu={(ev) => {
        if (activeTool === 'pen' || activeTool === 'eraser') return;
        ev.preventDefault();
        ev.stopPropagation();
        actions.openReactionPicker(elementId, ev.clientX, ev.clientY);
      }}
      onDoubleClick={() => {
        if (activeTool === 'pen' || activeTool === 'eraser') return;
        actions.beginEditing(elementId);
      }}
    >
      {commentsEnabled ? (
        <button
          type="button"
          className={styles.commentBtn}
          onPointerDown={(ev) => ev.stopPropagation()}
          onClick={(ev) => {
            ev.stopPropagation();
            actions.openComments(elementId);
          }}
          aria-label="Comments"
          title="Комментарии"
        >
          <MessageCircle size={16} />
        </button>
      ) : null}
      <div className={`${innerClass} ${isSearchHit ? styles.elementSearchHit : ''}`}>
        {isEditing ? (
          <textarea
            className={editorClass}
            value={draft}
            ref={textElRef}
            style={fitInlineStyle}
            autoFocus
            onPointerDown={(ev) => ev.stopPropagation()}
            onBlur={(ev) => {
              // Exit edit mode when focus leaves the element entirely (e.g. clicking toolbar).
              const next = ev.relatedTarget;
              if (next && next.closest?.(`[data-element-id="${elementId}"]`)) return;
              actions.endEditing?.();
            }}
            onChange={(ev) => {
              const next = ev.target.value;
              setDraft(next);
              // Keep the latest content in the mutable ref, so endEditing() persists the newest value,
              // without rerendering the whole board on every keystroke.
              actions.mutateElementRef(elementId, { content: next });
              if (el.type === 'note') actions.queueNoteEdit(elementId, next);
            }}
            onKeyDown={async (ev) => {
              if (ev.key === 'Escape') {
                ev.preventDefault();
                ev.stopPropagation();
                await actions.endEditing();
                return;
              }
              if (ev.key === 'Enter' && !ev.shiftKey) {
                ev.preventDefault();
                await actions.endEditing();
              }
            }}
          />
        ) : (
          <div ref={textElRef} className={displayTextClass} style={fitInlineStyle}>
            {renderHighlightedText(el.content ?? '', searchQuery, styles.searchMark)}
          </div>
        )}
      </div>

      {showConnectorEndpoints ? (
        <div className={styles.connectorEndpointsBox} aria-hidden="true">
          <div
            className={`${styles.connectorEndpoint} ${styles.epTop}`}
            onPointerDown={(ev) => actions.startConnectorDrag(elementId, 'top', ev)}
          />
          <div
            className={`${styles.connectorEndpoint} ${styles.epRight}`}
            onPointerDown={(ev) => actions.startConnectorDrag(elementId, 'right', ev)}
          />
          <div
            className={`${styles.connectorEndpoint} ${styles.epBottom}`}
            onPointerDown={(ev) => actions.startConnectorDrag(elementId, 'bottom', ev)}
          />
          <div
            className={`${styles.connectorEndpoint} ${styles.epLeft}`}
            onPointerDown={(ev) => actions.startConnectorDrag(elementId, 'left', ev)}
          />
        </div>
      ) : null}

      {reactionBubbles.length ? (
        <div className={styles.reactionsLayer} aria-label="Reactions">
          {reactionBubbles.map((b) => (
            <button
              key={b.emoji}
              type="button"
              className={`${styles.reactionBubble} ${b.count === 1 ? styles.reactionSolo : ''}`}
              data-side={b.side}
              style={{
                left: `${b.xPct}%`,
                top: `${b.yPct}%`,
              }}
              onPointerDown={(ev) => ev.stopPropagation()}
              onClick={(ev) => {
                ev.stopPropagation();
                actions.toggleReaction(elementId, b.emoji);
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

      {isSelected ? (
        <div className={styles.transformBox}>
          <div className={styles.elementActions}>
            <button
              type="button"
              className={styles.deleteElementBtn}
              onPointerDown={(ev) => {
                ev.preventDefault();
                ev.stopPropagation();
                actions.handleDeleteElement(el);
              }}
              disabled={sameId(deletingElementId, elementId)}
              aria-label="Delete element"
              title="Delete element"
            >
              {sameId(deletingElementId, elementId) ? (
                <Loader2 size={16} className={styles.spinner} />
              ) : (
                <Trash2 size={16} />
              )}
            </button>
          </div>
          <div className={`${styles.resizeHandle} ${styles.hNW}`} onPointerDown={(ev) => actions.startResize(elementId, 'nw', ev)} />
          {el.type !== 'note' ? (
            <div className={`${styles.resizeHandle} ${styles.hN}`} onPointerDown={(ev) => actions.startResize(elementId, 'n', ev)} />
          ) : null}
          <div className={`${styles.resizeHandle} ${styles.hNE}`} onPointerDown={(ev) => actions.startResize(elementId, 'ne', ev)} />
          {el.type !== 'note' ? (
            <div className={`${styles.resizeHandle} ${styles.hE}`} onPointerDown={(ev) => actions.startResize(elementId, 'e', ev)} />
          ) : null}
          <div className={`${styles.resizeHandle} ${styles.hSE}`} onPointerDown={(ev) => actions.startResize(elementId, 'se', ev)} />
          {el.type !== 'note' ? (
            <div className={`${styles.resizeHandle} ${styles.hS}`} onPointerDown={(ev) => actions.startResize(elementId, 's', ev)} />
          ) : null}
          <div className={`${styles.resizeHandle} ${styles.hSW}`} onPointerDown={(ev) => actions.startResize(elementId, 'sw', ev)} />
          {el.type !== 'note' ? (
            <div className={`${styles.resizeHandle} ${styles.hW}`} onPointerDown={(ev) => actions.startResize(elementId, 'w', ev)} />
          ) : null}
        </div>
      ) : null}
    </div>
  );
});

const ConnectorsLayer = React.memo(function ConnectorsLayer({
  connectors,
  connectorDraft,
  selectedConnectorId,
  onSelectConnector,
  startConnectorBendDrag,
  computeConnectorPathFromAnchors,
  getAnchorPoint,
  active,
}) {
  // During drag, elements may move via compositor transforms; keep connectors attached by re-rendering at ~60fps.
  const [, forceTick] = React.useState(0);
  React.useEffect(() => {
    if (!active) return () => {};
    let raf = null;
    const loop = () => {
      forceTick((t) => (t + 1) % 1_000_000);
      raf = window.requestAnimationFrame(loop);
    };
    raf = window.requestAnimationFrame(loop);
    return () => {
      if (raf != null) window.cancelAnimationFrame(raf);
    };
  }, [active]);

  return (
    <svg className={styles.connectorsLayer} aria-hidden="true">
      <defs>
        <marker
          id="connector-arrow"
          viewBox="0 0 10 10"
          refX="9"
          refY="5"
          markerWidth="6"
          markerHeight="6"
          orient="auto-start-reverse"
        >
          <path d="M 0 0 L 10 5 L 0 10 z" fill="currentColor" />
        </marker>
      </defs>

      {(Array.isArray(connectors) ? connectors : []).map((el) => {
        const data = el?.connector?.data || el?.Connector?.data || {};
        const from = data?.from || {};
        const to = data?.to || {};
        if (!from?.elementId || !to?.elementId) return null;

        const a0 = getAnchorPoint?.(from.elementId, from.side);
        const a1 = getAnchorPoint?.(to.elementId, to.side);
        if (!a0 || !a1) return null;

        const bend = data?.bend || { x: 0, y: 0 };
        const { d, handle } = computeConnectorPathFromAnchors(a0, a1, bend);
        const color = String(data?.style?.color || 'rgba(15,23,42,0.75)');
        const w = Math.max(1, Number(data?.style?.width ?? 2));
        const selected = sameId(selectedConnectorId, el.id);
        const arrow = data?.style?.arrowEnd !== false;

        return (
          <g key={el.id} className={selected ? styles.connectorSelected : ''}>
            <path
              d={d}
              fill="none"
              stroke={color}
              strokeWidth={selected ? Math.max(2, w + 0.75) : w}
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ color }}
              markerEnd={arrow ? 'url(#connector-arrow)' : undefined}
            />
            <path
              d={d}
              fill="none"
              stroke="transparent"
              strokeWidth={Math.max(10, w + 10)}
              strokeLinecap="round"
              strokeLinejoin="round"
              onPointerDown={(ev) => {
                ev.stopPropagation();
                ev.preventDefault();
                onSelectConnector?.(el.id);
              }}
            />
            {selected ? (
              <circle
                cx={handle.x}
                cy={handle.y}
                r={7}
                className={styles.connectorBendHandle}
                onPointerDown={(ev) => startConnectorBendDrag?.(el.id, ev)}
              />
            ) : null}
          </g>
        );
      })}

      {connectorDraft?.from?.elementId ? (
        (() => {
          const a0 = getAnchorPoint?.(connectorDraft.from.elementId, connectorDraft.from.side);
          if (!a0) return null;

          let a1 = null;
          if (connectorDraft?.toHover?.elementId && connectorDraft?.toHover?.side) {
            a1 = getAnchorPoint?.(connectorDraft.toHover.elementId, connectorDraft.toHover.side);
          }
          if (!a1) {
            const p3 = connectorDraft.cursor || { x: a0.x + 1, y: a0.y + 1 };
            const dx = Number(p3.x) - a0.x;
            const dy = Number(p3.y) - a0.y;
            const ax = Math.abs(dx);
            const ay = Math.abs(dy);
            const dir = ax >= ay ? { x: dx >= 0 ? -1 : 1, y: 0 } : { x: 0, y: dy >= 0 ? -1 : 1 };
            a1 = { x: Number(p3.x), y: Number(p3.y), dir };
          }

          const { d } = computeConnectorPathFromAnchors(a0, a1, { x: 0, y: 0 });
          return (
            <path
              d={d}
              fill="none"
              stroke="rgba(15,23,42,0.55)"
              strokeWidth={2}
              strokeDasharray="6 6"
              strokeLinecap="round"
              strokeLinejoin="round"
              markerEnd="url(#connector-arrow)"
            />
          );
        })()
      ) : null}
    </svg>
  );
});

const TOOLS = [
  { id: 'select', label: 'Select', Icon: MousePointer2, hotspot: [2, 2], fallbackCursor: 'default' },
  { id: 'hand', label: 'Hand', Icon: Hand, hotspot: [12, 12], fallbackCursor: 'grab' },
  { id: 'connector', label: 'Соединительные линии', Icon: Spline, hotspot: [4, 4], fallbackCursor: 'crosshair' },
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

function isPhotoExt(ext) {
  const e = String(ext || '').toLowerCase();
  return e === 'png' || e === 'jpg' || e === 'jpeg';
}

function readImageSizeFromFile(file) {
  return new Promise((resolve, reject) => {
    try {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        try {
          URL.revokeObjectURL(url);
        } catch {
          // ignore
        }
        resolve({
          width: Number(img.naturalWidth || img.width || 0),
          height: Number(img.naturalHeight || img.height || 0),
        });
      };
      img.onerror = () => {
        try {
          URL.revokeObjectURL(url);
        } catch {
          // ignore
        }
        reject(new Error('Failed to read image'));
      };
      img.src = url;
    } catch (e) {
      reject(e);
    }
  });
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
  const { isMobile } = useBreakpoints();
  const canvasRef = useRef(null);
  const fileInputRef = useRef(null);
  const linkInputRef = useRef(null);
  const zoomPctRef = useRef(null);
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
  const [, setViewOffset] = useState({ x: 0, y: 0 });
  const [selectionRect, setSelectionRect] = useState(null);
  const [isPanning, setIsPanning] = useState(false);
  const [elements, setElements] = useState([]);
  const [selectedElementIds, setSelectedElementIds] = useState(() => new Set()); // Set<string(idKey)>
  const [editingElementId, setEditingElementId] = useState(null);
  const [deletingElementId, setDeletingElementId] = useState(null); // stored as string key
  const [docTextPreview, setDocTextPreview] = useState({});
  const [presentUserIds, setPresentUserIds] = useState([]);
  const [shortcuts, setShortcuts] = useState(() => loadShortcuts());
  const [historyMeta, setHistoryMeta] = useState({ canUndo: false, canRedo: false });
  const [brushColor, setBrushColor] = useState(DEFAULT_BRUSH_COLOR);
  const [brushWidth, setBrushWidth] = useState(DEFAULT_BRUSH_WIDTH);
  const [liveStroke, setLiveStroke] = useState(null); // { points:[{x,y}], color, width }
  const [connectorHoverElementId, setConnectorHoverElementId] = useState(null);
  const [connectorDraft, setConnectorDraft] = useState(null); // { from:{elementId,side}, toHover:{elementId,side|null}, cursor:{x,y} }
  const [selectedConnectorId, setSelectedConnectorId] = useState(null);
  const [connectorsFollowDuringDrag, setConnectorsFollowDuringDrag] = useState(false);
  const [reactionPicker, setReactionPicker] = useState(null); // { elementId, x, y }
  const [reactionCustomEmoji, setReactionCustomEmoji] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [mobileToolsOpen, setMobileToolsOpen] = useState(false);
  const [mobileSheetDragY, setMobileSheetDragY] = useState(0);
  const [mobileSheetDragging, setMobileSheetDragging] = useState(false);
  const [aiSheetDragY, setAiSheetDragY] = useState(0);
  const [aiSheetDragging, setAiSheetDragging] = useState(false);

  // Safety net: reconcile duplicates only when list size changes (avoid per-frame work during drag).
  useEffect(() => {
    setElements((prev) => {
      const seen = new Set();
      for (const el of prev) {
        const k = idKey(el?.id);
        if (!k) continue;
        if (seen.has(k)) return dedupeMergeById(prev);
        seen.add(k);
      }
      return prev;
    });
  }, [elements.length]);

  const commentsEnabled = Boolean(workspace?.groupId);
  const [commentsPanel, setCommentsPanel] = useState(null); // { elementId }
  const [commentDraft, setCommentDraft] = useState('');
  const [commentsByElement, setCommentsByElement] = useState({}); // elementId -> Comment[]
  const [commentsLoading, setCommentsLoading] = useState({}); // elementId -> boolean
  const commentInputRef = useRef(null);
  const commentsListRef = useRef(null);

  const deskIdKey = useMemo(() => idKey(workspace?.id ?? workspace?.deskId ?? id), [workspace?.id, workspace?.deskId, id]);
  const deskIdNum = useMemo(() => {
    const n = Number(workspace?.id ?? workspace?.deskId ?? id);
    return Number.isFinite(n) ? n : null;
  }, [workspace?.id, workspace?.deskId, id]);

  const [aiPanelOpen, setAiPanelOpen] = useState(false);
  const [aiStatus, setAiStatus] = useState(null);
  const [aiMessages, setAiMessages] = useState([]); // [{ id, role: 'user'|'assistant', content, ts }]
  const [aiDraft, setAiDraft] = useState('');
  const [aiSending, setAiSending] = useState(false);
  const [aiError, setAiError] = useState(null);
  const aiInputRef = useRef(null);
  const aiListRef = useRef(null);

  const selectStartRef = useRef(null);
  const selectRafRef = useRef(null);
  const selectPendingEndRef = useRef(null);
  const panStartRef = useRef(null);
  const interactionRef = useRef(null);
  const viewOffsetRef = useRef({ x: 0, y: 0 });
  const viewScaleRef = useRef(VIEW_SCALE_BASE);
  const viewApplyRafRef = useRef(null);
  const viewPendingRef = useRef(null); // { offset:{x,y}, scale:number }
  const viewSaveTimerRef = useRef(null);
  const persistViewDebouncedRef = useRef(null);
  const didRestoreViewRef = useRef(false);
  const suppressNextElementClickRef = useRef(new Set());
  const fetchingPreviewsRef = useRef(new Set());
  const historyRef = useRef({ past: [], future: [] });
  const createdElementIdsRef = useRef(new Set()); // elementIds created in this session (used for delete undo)
  const applyingHistoryRef = useRef(false);
  const editStartSnapRef = useRef(new Map()); // elementId -> snapshot
  const endingEditRef = useRef(false);
  const editingElementIdRef = useRef(null);
  const elementNodeCacheRef = useRef(new Map()); // idKey(elementId) -> HTMLElement
  // Perf: during element drag we update the dragged node's transform imperatively (rAF),
  // and commit to React state once on pointerup. This avoids re-rendering the entire board each frame.
  const dragVisualPendingRef = useRef(null); // { elementKey, x, y, rotation }
  const dragVisualRafRef = useRef(null);
  const handHoldRef = useRef({ active: false, previousTool: null });
  const liveStrokeRef = useRef(null);
  const eraseStateRef = useRef({ active: false, erasedIds: new Set(), lastTs: 0 });
  const connectorDraftRef = useRef(null);
  const connectorDraftRafRef = useRef(null);
  const reactionPickerRef = useRef(null);
  const searchBtnRef = useRef(null);
  const searchPopoverRef = useRef(null);
  const searchInputRef = useRef(null);
  const mobileSearchBarRef = useRef(null);
  const mobileSheetRef = useRef(null);
  const mobileSheetDragRef = useRef({ active: false, pointerId: null, startY: 0, lastY: 0 });
  const aiSheetRef = useRef(null);
  const aiSheetDragRef = useRef({ active: false, pointerId: null, startY: 0, lastY: 0 });
  const mobilePinchRef = useRef({
    active: false,
    pointers: new Map(), // pointerId -> { x, y }
    startDist: 0,
    startScale: 1,
    startOffset: { x: 0, y: 0 },
    deskMid: { x: 0, y: 0 },
  });

  useEffect(() => {
    if (!isMobile) setMobileToolsOpen(false);
  }, [isMobile]);

  useEffect(() => {
    if (!isMobile) return;
    // Keep the mobile UI focused: tools sheet and search shouldn't overlap.
    if (mobileToolsOpen) setSearchOpen(false);
  }, [isMobile, mobileToolsOpen]);

  useEffect(() => {
    if (!isMobile) return;
    if (searchOpen) setMobileToolsOpen(false);
  }, [isMobile, searchOpen]);

  const activeToolDef = TOOLS.find((t) => t.id === activeTool) || TOOLS[0];
  const canvasCursor = iconToCursorValue(
    activeToolDef.Icon,
    activeToolDef.hotspot,
    activeToolDef.fallbackCursor
  );
  const effectiveCursor = activeTool === 'hand' && isPanning ? 'grabbing' : canvasCursor;

  useEffect(() => {
    editingElementIdRef.current = editingElementId;
  }, [editingElementId]);

  const viewStorageKey = useMemo(() => {
    if (!deskIdKey) return null;
    return `healis.boardView.v2:${deskIdKey}`;
  }, [deskIdKey]);

  const applyViewVarsNow = useCallback((next) => {
    const node = canvasRef.current;
    if (!node) return;
    const off = next?.offset || viewOffsetRef.current;
    const s = clampViewScale(next?.scale != null ? next.scale : viewScaleRef.current);

    // Keep refs authoritative.
    viewOffsetRef.current = { x: Number(off?.x || 0), y: Number(off?.y || 0) };
    viewScaleRef.current = s;

    node.style.setProperty('--grid-offset-x', `${viewOffsetRef.current.x}px`);
    node.style.setProperty('--grid-offset-y', `${viewOffsetRef.current.y}px`);
    node.style.setProperty('--view-offset-x', `${viewOffsetRef.current.x}px`);
    node.style.setProperty('--view-offset-y', `${viewOffsetRef.current.y}px`);
    node.style.setProperty('--view-scale', String(s));

    if (zoomPctRef.current) zoomPctRef.current.textContent = formatViewScalePct(s);
  }, []);

  const scheduleApplyViewVars = useCallback(
    (next) => {
      // Update refs immediately so subsequent events (wheel/move) use latest values,
      // but batch DOM writes to rAF for smoothness.
      const off = next?.offset || viewOffsetRef.current;
      const s = clampViewScale(next?.scale != null ? next.scale : viewScaleRef.current);
      viewOffsetRef.current = { x: Number(off?.x || 0), y: Number(off?.y || 0) };
      viewScaleRef.current = s;

      // Persist view (debounced). This covers panning too, not only wheel/zoom buttons.
      try {
        persistViewDebouncedRef.current?.({ offset: viewOffsetRef.current, scale: s });
      } catch {
        // ignore
      }

      viewPendingRef.current = { offset: viewOffsetRef.current, scale: s };
      if (viewApplyRafRef.current != null) return;
      viewApplyRafRef.current = window.requestAnimationFrame(() => {
        viewApplyRafRef.current = null;
        const pending = viewPendingRef.current;
        viewPendingRef.current = null;
        applyViewVarsNow(pending);
      });
    },
    [applyViewVarsNow]
  );

  const persistViewDebounced = useCallback(
    (next, opts = {}) => {
      if (!viewStorageKey) return;
      const immediate = Boolean(opts.immediate);
      if (viewSaveTimerRef.current) {
        window.clearTimeout(viewSaveTimerRef.current);
        viewSaveTimerRef.current = null;
      }

      const run = () => {
        const off = next?.offset || viewOffsetRef.current;
        const scale = clampViewScale(next?.scale != null ? next.scale : viewScaleRef.current);
        const storedScale = Number(((scale || VIEW_SCALE_BASE) / VIEW_SCALE_BASE).toFixed(4));
        try {
          window.localStorage.setItem(
            viewStorageKey,
            JSON.stringify({
              v: 2,
              offset: { x: Number(off?.x ?? 0), y: Number(off?.y ?? 0) },
              // Store scale relative to the baseline so UI "100%" is stable across boards.
              scale: storedScale,
            })
          );
        } catch {
          // ignore (storage disabled/quota)
        }
      };

      if (immediate) {
        run();
        return;
      }
      viewSaveTimerRef.current = window.setTimeout(() => {
        viewSaveTimerRef.current = null;
        run();
      }, 160);
    },
    [viewStorageKey]
  );

  useEffect(() => {
    persistViewDebouncedRef.current = persistViewDebounced;
  }, [persistViewDebounced]);

  useLayoutEffect(() => {
    // Initialize CSS vars without causing heavy React re-renders.
    applyViewVarsNow({ offset: viewOffsetRef.current, scale: viewScaleRef.current });
    return () => {
      if (viewApplyRafRef.current != null) {
        window.cancelAnimationFrame(viewApplyRafRef.current);
        viewApplyRafRef.current = null;
      }
      viewPendingRef.current = null;
      if (viewSaveTimerRef.current) {
        window.clearTimeout(viewSaveTimerRef.current);
        viewSaveTimerRef.current = null;
      }
      // Best-effort: persist the latest view on unmount.
      try {
        persistViewDebouncedRef.current?.(
          { offset: viewOffsetRef.current, scale: viewScaleRef.current },
          { immediate: true }
        );
      } catch {
        // ignore
      }
    };
  }, [applyViewVarsNow]);

  useLayoutEffect(() => {
    if (didRestoreViewRef.current) return;
    if (!viewStorageKey) return;
    if (loading) return;
    const node = canvasRef.current;
    if (!node) return;

    let saved = null;
    try {
      const legacyKeys = [];
      // Backward compatibility with older experiments/versions.
      legacyKeys.push(viewStorageKey);
      if (deskIdKey) legacyKeys.push(`healis.boardView.v1:${deskIdKey}`);
      if (deskIdNum != null) legacyKeys.push(`healis.boardView.v1:${deskIdNum}`);

      let raw = null;
      for (const k of legacyKeys) {
        raw = window.localStorage.getItem(k);
        if (raw) break;
      }
      saved = raw ? JSON.parse(raw) : null;
    } catch {
      saved = null;
    }
    if (!saved) return;

    const apply = (offset, scale) => {
      const nextOffset = { x: Number(offset?.x ?? 0), y: Number(offset?.y ?? 0) };
      // Stored scale is relative to VIEW_SCALE_BASE (UI "100%").
      const nextScale = clampViewScale((scale ?? 1) * VIEW_SCALE_BASE);
      scheduleApplyViewVars({ offset: nextOffset, scale: nextScale });
      setViewOffset(nextOffset);
    };

    // v2: offset + scale (preferred)
    if (saved.v === 2 && saved.offset) {
      didRestoreViewRef.current = true;
      apply(saved.offset, saved.scale);
      return;
    }

    // v1 (legacy): center + scale
    if (saved.v === 1 && saved.center) {
      const rect = node.getBoundingClientRect();
      const p = { x: rect.width / 2, y: rect.height / 2 };
      const storedScale = Number(saved?.scale ?? 1);
      const scale = clampViewScale(storedScale * VIEW_SCALE_BASE);
      const center = saved?.center || null;
      if (!center || !Number.isFinite(Number(center.x)) || !Number.isFinite(Number(center.y))) return;
      const nextOffset = { x: p.x - Number(center.x) * scale, y: p.y - Number(center.y) * scale };
      didRestoreViewRef.current = true;
      scheduleApplyViewVars({ offset: nextOffset, scale });
      setViewOffset(nextOffset);
    }
  }, [viewStorageKey, scheduleApplyViewVars, loading, deskIdKey, deskIdNum]);

  useEffect(() => {
    if (activeTool !== 'link') return;
    // Let the popover render first, then focus.
    window.setTimeout(() => linkInputRef.current?.focus?.(), 0);
  }, [activeTool]);

  useEffect(() => {
    if (activeTool === 'connector') return () => {};
    setConnectorHoverElementId(null);
    return () => {};
  }, [activeTool]);

  useEffect(() => {
    let mounted = true;
    getAiStatus()
      .then((s) => mounted && setAiStatus(s))
      .catch(() => mounted && setAiStatus({ enabled: false, provider: null, model: null }));
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!aiPanelOpen) return () => {};
    window.setTimeout(() => aiInputRef.current?.focus?.(), 0);
  }, [aiPanelOpen]);

  useEffect(() => {
    if (!aiPanelOpen) return;
    const node = aiListRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [aiPanelOpen, aiMessages]);

  const sendAiMessage = async (raw) => {
    const message = String(raw ?? aiDraft ?? '').trim();
    if (!message || !deskIdNum || aiSending) return;

    setAiError(null);
    const userMsg = { id: `u-${Date.now()}-${Math.random().toString(16).slice(2)}`, role: 'user', content: message, ts: Date.now() };
    const history = aiMessages
      .filter((m) => m?.role === 'user' || m?.role === 'assistant')
      .slice(-16)
      .map((m) => ({ role: m.role, content: m.content }));

    setAiMessages((prev) => [...prev, userMsg]);
    setAiDraft('');
    setAiSending(true);

    try {
      const data = await chatWithDesk(deskIdNum, { message, history });
      const reply = String(data?.reply ?? '').trim();
      const assistantMsg = {
        id: `a-${Date.now()}-${Math.random().toString(16).slice(2)}`,
        role: 'assistant',
        content: reply || '…',
        ts: Date.now(),
      };
      setAiMessages((prev) => [...prev, assistantMsg]);
      if (data?.provider || data?.model) {
        setAiStatus((cur) => cur || { enabled: true, provider: data.provider || null, model: data.model || null });
      }
    } catch (e) {
      const msg = e?.response?.data?.error || e?.message || 'AI request failed';
      const hint = e?.response?.data?.hint || null;
      setAiError(hint ? `${msg}\n${hint}` : msg);
    } finally {
      setAiSending(false);
    }
  };

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

  // Perf: building the search index is O(n) over all elements and was happening even when search query was empty,
  // which is disastrous during drag (elements change every rAF). Only build it when actually searching.
  const hasSearchQuery = Boolean(String(searchQuery || '').trim());
  const manualSearchIndex = useMemo(
    () => (hasSearchQuery ? buildManualBoardSearchIndex(elements) : []),
    [hasSearchQuery, elements]
  );
  const manualSearchHits = useMemo(() => {
    if (!hasSearchQuery) return [];
    return runManualBoardSearch(manualSearchIndex, searchQuery, { limit: 60 });
  }, [hasSearchQuery, manualSearchIndex, searchQuery]);

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
      if (isMobile) {
        const bar = mobileSearchBarRef.current;
        const btn = searchBtnRef.current;
        if (bar && bar.contains(ev.target)) return;
        if (btn && btn.contains(ev.target)) return;
        setSearchOpen(false);
        return;
      }

      const pop = searchPopoverRef.current;
      const btn = searchBtnRef.current;
      if (pop && pop.contains(ev.target)) return;
      if (btn && btn.contains(ev.target)) return;
      setSearchOpen(false);
    };
    window.addEventListener('pointerdown', onPointerDown);
    return () => window.removeEventListener('pointerdown', onPointerDown);
  }, [searchOpen, isMobile]);

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

  const getDeskPointFromClient = useCallback((clientX, clientY) => {
    const el = canvasRef.current;
    if (!el) return { x: 0, y: 0 };
    const rect = el.getBoundingClientRect();
    const off = viewOffsetRef.current;
    const s = viewScaleRef.current || 1;
    return { x: (clientX - rect.left - off.x) / s, y: (clientY - rect.top - off.y) / s };
  }, []);

  const isConnectableElement = (el) => Boolean(el?.id) && Boolean(el?.type) && el.type !== 'connector';

  const getAnchorPoint = useCallback((el, side) => {
    // Outset ensures the arrowhead doesn't get hidden under the target element
    // because connectors are rendered beneath elements (z-index).
    const OUTSET = 10;
    const x = Number(el?.x ?? 0);
    const y = Number(el?.y ?? 0);
    const w = Number(el?.width ?? 240);
    const h = Number(el?.height ?? 160);
    const s = String(side || 'right');
    let p = { x: x + w, y: y + h / 2 };
    let dir = { x: 1, y: 0 };
    if (s === 'top') {
      p = { x: x + w / 2, y };
      dir = { x: 0, y: -1 };
    } else if (s === 'bottom') {
      p = { x: x + w / 2, y: y + h };
      dir = { x: 0, y: 1 };
    } else if (s === 'left') {
      p = { x, y: y + h / 2 };
      dir = { x: -1, y: 0 };
    }

    return { x: p.x + dir.x * OUTSET, y: p.y + dir.y * OUTSET, dir };
  }, []);

  const pickHoverElementId = (deskP, threshold = 15) => {
    const px = Number(deskP?.x ?? 0);
    const py = Number(deskP?.y ?? 0);
    const t = Math.max(0, Number(threshold ?? 0));
    let bestId = null;
    let bestD2 = Infinity;

    const list = elementsRef.current || [];
    for (const el of list) {
      if (!isConnectableElement(el)) continue;
      const x = Number(el.x ?? 0);
      const y = Number(el.y ?? 0);
      const w = Number(el.width ?? 0);
      const h = Number(el.height ?? 0);
      if (px < x - t || px > x + w + t || py < y - t || py > y + h + t) continue;

      const dx = px < x ? x - px : px > x + w ? px - (x + w) : 0;
      const dy = py < y ? y - py : py > y + h ? py - (y + h) : 0;
      const d2 = dx * dx + dy * dy;
      if (d2 < bestD2) {
        bestD2 = d2;
        bestId = el.id;
      }
    }
    return bestId;
  };

  const pickSideAtPoint = (el, deskP, radius = 14) => {
    if (!el?.id) return null;
    const px = Number(deskP?.x ?? 0);
    const py = Number(deskP?.y ?? 0);
    const r = Math.max(0, Number(radius ?? 0));
    const r2 = r * r;
    const sides = ['top', 'right', 'bottom', 'left'];
    let best = null;
    let bestD2 = Infinity;
    for (const side of sides) {
      const a = getAnchorPoint(el, side);
      const dx = px - a.x;
      const dy = py - a.y;
      const d2 = dx * dx + dy * dy;
      if (d2 <= r2 && d2 < bestD2) {
        bestD2 = d2;
        best = side;
      }
    }
    return best;
  };

  const computeConnectorPathFromAnchors = useCallback((fromAnchor, toAnchor, bend) => {
    const p0 = { x: Number(fromAnchor?.x ?? 0), y: Number(fromAnchor?.y ?? 0) };
    const p3 = { x: Number(toAnchor?.x ?? 0), y: Number(toAnchor?.y ?? 0) };
    const d0 = fromAnchor?.dir || { x: 1, y: 0 };
    const d3 = toAnchor?.dir || { x: -1, y: 0 };
    const dx = p3.x - p0.x;
    const dy = p3.y - p0.y;
    const dist = Math.hypot(dx, dy);
    const len = Math.max(40, Math.min(240, dist * 0.35));
    const bx = Number(bend?.x ?? 0);
    const by = Number(bend?.y ?? 0);
    const mid = { x: (p0.x + p3.x) / 2, y: (p0.y + p3.y) / 2 };
    const c1 = { x: p0.x + Number(d0.x ?? 0) * len + bx * 0.5, y: p0.y + Number(d0.y ?? 0) * len + by * 0.5 };
    // NOTE: d3 is an "outward" direction at the target; control point should be placed outward too,
    // so the curve approaches the element from outside (instead of bending under it).
    const c2 = { x: p3.x + Number(d3.x ?? 0) * len + bx * 0.5, y: p3.y + Number(d3.y ?? 0) * len + by * 0.5 };
    const handle = { x: mid.x + bx, y: mid.y + by };
    const d = `M ${p0.x} ${p0.y} C ${c1.x} ${c1.y} ${c2.x} ${c2.y} ${p3.x} ${p3.y}`;
    return { d, mid, handle, p0, p3 };
  }, []);

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
    // Commit the latest view offset to state once (avoid doing this in pointermove).
    setViewOffset(viewOffsetRef.current);
    persistViewDebounced({ offset: viewOffsetRef.current, scale: viewScaleRef.current }, { immediate: true });
  };

  const extractContent = useCallback((el) => {
    if (!el) return '';
    if (el.type === 'note') return el.note?.text ?? el.Note?.text ?? '';
    if (el.type === 'text') return el.text?.content ?? el.Text?.content ?? '';
    return '';
  }, []);

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
    const drawing = el.type === 'drawing' ? el.drawing ?? el.Drawing : null;
    const connector = el.type === 'connector' ? el.connector ?? el.Connector : null;
    if (el.type === 'note') return { text: el.content ?? '' };
    if (el.type === 'text') return { content: el.content ?? '' };
    if (el.type === 'document') return { title: doc?.title, url: doc?.url };
    if (el.type === 'link') return { title: link?.title, url: link?.url, previewImageUrl: link?.previewImageUrl };
    if (el.type === 'drawing') return { data: drawing?.data };
    if (el.type === 'connector') return { data: connector?.data };
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

  const normalizeReactions = useCallback((reactions) => {
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
  }, []);

  const reactionSlotsRef = useRef(new Map()); // elementId -> Map(emoji -> slotIndex)

  // Fixed slots around the element (to match the desired "frame" layout):
  // first 6: 3 top + 3 bottom, then sides.
  const REACTION_SLOTS = [
    { xPct: 18, yPct: 0, side: 'top' },
    { xPct: 50, yPct: 0, side: 'top' },
    { xPct: 82, yPct: 0, side: 'top' },
    { xPct: 18, yPct: 100, side: 'bottom' },
    { xPct: 50, yPct: 100, side: 'bottom' },
    { xPct: 82, yPct: 100, side: 'bottom' },
    { xPct: 0, yPct: 50, side: 'left' },
    { xPct: 100, yPct: 50, side: 'right' },
    { xPct: 0, yPct: 25, side: 'left' },
    { xPct: 0, yPct: 75, side: 'left' },
    { xPct: 100, yPct: 25, side: 'right' },
    { xPct: 100, yPct: 75, side: 'right' },
  ];

  const layoutReactionBubbles = (elementId, reactions) => {
    const r = normalizeReactions(reactions);
    const base = Object.entries(r)
      .filter(([, users]) => Array.isArray(users) && users.length > 0)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([emoji, users]) => ({ emoji, count: users.length }));

    if (!base.length) return base;

    const id = String(elementId ?? '');
    if (!reactionSlotsRef.current.has(id)) reactionSlotsRef.current.set(id, new Map());
    const slots = reactionSlotsRef.current.get(id);

    // Drop removed emojis so their slots become available again.
    const current = new Set(base.map((b) => b.emoji));
    for (const e of Array.from(slots.keys())) {
      if (!current.has(e)) slots.delete(e);
    }

    const used = new Set(slots.values());
    const claimNextFreeSlot = () => {
      for (let i = 0; i < REACTION_SLOTS.length; i += 1) {
        if (!used.has(i)) return i;
      }
      return null;
    };

    // Assign new emojis to the next free fixed slot. Existing ones keep their slot => no jumping.
    for (const b of base) {
      if (slots.has(b.emoji)) continue;
      const idx = claimNextFreeSlot();
      if (idx == null) break;
      slots.set(b.emoji, idx);
      used.add(idx);
    }

    return base.map((b) => {
      const slotIndex = slots.get(b.emoji);
      const pos = slotIndex != null ? REACTION_SLOTS[slotIndex] : null;
      return pos ? { ...b, ...pos, slotIndex } : { ...b, xPct: 50, yPct: 100, side: 'bottom' };
    });
  };

  const elementToVm = useCallback((el) => {
    if (!el || typeof el !== 'object') return el;
    const normalizedId = normalizeElementId(el.id ?? el.elementId);
    const vm = {
      ...el,
      id: normalizedId,
      content: el.content ?? extractContent(el),
      reactions: normalizeReactions(el.reactions),
    };
    // Normalize association names (Sequelize can return lower-case; legacy code used UpperCamelCase).
    if (vm.note == null && vm.Note != null) vm.note = vm.Note;
    if (vm.text == null && vm.Text != null) vm.text = vm.Text;
    if (vm.document == null && vm.Document != null) vm.document = vm.Document;
    if (vm.link == null && vm.Link != null) vm.link = vm.Link;
    if (vm.drawing == null && vm.Drawing != null) vm.drawing = vm.Drawing;
    if (vm.connector == null && vm.Connector != null) vm.connector = vm.Connector;
    // Normalize connector endpoints to numeric IDs when possible.
    if (vm.type === 'connector') {
      const child = vm.connector ?? vm.Connector ?? null;
      const data = child?.data ?? null;
      if (data?.from?.elementId != null) data.from.elementId = normalizeElementId(data.from.elementId);
      if (data?.to?.elementId != null) data.to.elementId = normalizeElementId(data.to.elementId);
    }
    return vm;
  }, [extractContent, normalizeReactions]);

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
      setElements((prev) => prev.map((el) => (sameId(el.id, elementId) ? { ...el, reactions: next } : el)));
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
      setElements((prev) => prev.map((x) => (sameId(x.id, vm.id) ? { ...x, ...vm } : x)));

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

  const flushConnectorDraft = () => {
    connectorDraftRafRef.current = null;
    const cur = connectorDraftRef.current;
    setConnectorDraft(cur ? { ...cur, from: { ...cur.from }, toHover: { ...cur.toHover }, cursor: { ...cur.cursor } } : null);
  };

  const setConnectorDraftNext = (next) => {
    connectorDraftRef.current = next;
    if (connectorDraftRafRef.current == null) {
      connectorDraftRafRef.current = window.requestAnimationFrame(flushConnectorDraft);
    }
  };

  const cancelConnectorDraft = () => {
    connectorDraftRef.current = null;
    setConnectorDraft(null);
    setConnectorHoverElementId(null);
  };

  const createConnectorOnDesk = async ({ fromElementId, fromSide, toElementId, toSide, bend }) => {
    const deskId = workspace?.id ?? workspace?.deskId ?? id;
    if (!deskId || !fromElementId || !toElementId || !fromSide || !toSide) return;
    if (Number(fromElementId) === Number(toElementId)) return;

    setActionError(null);
    try {
      const payload = {
        data: {
          v: 1,
          kind: 'connector',
          from: { elementId: Number(fromElementId), side: String(fromSide) },
          to: { elementId: Number(toElementId), side: String(toSide) },
          bend: { x: Number(bend?.x ?? 0), y: Number(bend?.y ?? 0) },
          style: { color: '#0f172a', width: 2, arrowEnd: true },
        },
      };

      const created = await createElementOnDesk(deskId, {
        type: 'connector',
        x: 0,
        y: 0,
        width: 1,
        height: 1,
        zIndex: 0,
        payload,
      });
      const vm = elementToVm(created);
      if (vm?.id) createdElementIdsRef.current.add(vm.id);
      setElements((prev) => upsertById(prev, vm));
      setSelectedConnectorId(vm?.id ?? null);

      if (!applyingHistoryRef.current) {
        const snap = snapshotForHistory(vm);
        if (deskId && snap) {
          pushHistory({
            kind: 'create-element',
            deskId,
            elementId: vm.id,
            snapshot: snap,
          });
        }
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('Failed to create connector:', err?.response?.data || err);
      setActionError(err?.response?.data?.error || err?.message || 'Failed to create connector');
      window.setTimeout(() => setActionError(null), 4500);
    }
  };

  const startConnectorDrag = (fromElementId, fromSide, e) => {
    if (!fromElementId || !fromSide) return;
    e.stopPropagation();
    e.preventDefault();

    setSelectedConnectorId(null);

    const pointerId = e.pointerId;
    const startDeskP = getDeskPointFromClient(e.clientX, e.clientY);
    const initial = {
      from: { elementId: fromElementId, side: String(fromSide) },
      toHover: { elementId: null, side: null },
      cursor: startDeskP,
    };
    setConnectorDraftNext(initial);
    setConnectorHoverElementId(fromElementId);

    const cleanup = (onMove, onUp) => {
      window.removeEventListener('pointermove', onMove, true);
      window.removeEventListener('pointerup', onUp, true);
    };

    const onMove = (ev) => {
      if (ev.pointerId !== pointerId) return;
      const deskP = getDeskPointFromClient(ev.clientX, ev.clientY);
      const hoverId = pickHoverElementId(deskP, 15);
      const hoverEl = hoverId ? (elementsRef.current || []).find((x) => x?.id === hoverId) : null;
      const hoverSide = hoverEl ? pickSideAtPoint(hoverEl, deskP, 18) : null;
      setConnectorDraftNext({
        from: initial.from,
        toHover: { elementId: hoverId, side: hoverSide },
        cursor: deskP,
      });
      setConnectorHoverElementId(hoverId || null);
    };

    const onUp = async (ev) => {
      if (ev.pointerId !== pointerId) return;
      cleanup(onMove, onUp);
      const cur = connectorDraftRef.current;
      cancelConnectorDraft();
      if (!cur?.from?.elementId || !cur?.from?.side) return;
      const toId = cur?.toHover?.elementId;
      const toSide = cur?.toHover?.side;
      if (!toId || !toSide) return;
      await createConnectorOnDesk({
        fromElementId: cur.from.elementId,
        fromSide: cur.from.side,
        toElementId: toId,
        toSide,
        bend: { x: 0, y: 0 },
      });
    };

    window.addEventListener('pointermove', onMove, true);
    window.addEventListener('pointerup', onUp, true);
  };

  const startConnectorBendDrag = (connectorId, e) => {
    e.stopPropagation();
    e.preventDefault();
    setConnectorsFollowDuringDrag(true);
    const idNum = connectorId;
    const el = elementsRef.current?.find?.((x) => x?.id === idNum) || elements.find((x) => x?.id === idNum);
    if (!el) return;

    const before = snapshotForHistory(el);
    const pointerId = e.pointerId;

    const cleanup = (onMove, onUp) => {
      window.removeEventListener('pointermove', onMove, true);
      window.removeEventListener('pointerup', onUp, true);
    };

    const onMove = (ev) => {
      if (ev.pointerId !== pointerId) return;
      const curEl = elementsRef.current?.find?.((x) => x?.id === idNum) || el;
      const data = curEl?.connector?.data || curEl?.Connector?.data || {};
      const from = data?.from || {};
      const to = data?.to || {};
      const list = elementsRef.current || [];
      const fromEl = list.find((x) => x?.id === from.elementId);
      const toEl = list.find((x) => x?.id === to.elementId);
      if (!fromEl || !toEl) return;
      const a0 = getAnchorPoint(fromEl, from.side);
      const a1 = getAnchorPoint(toEl, to.side);
      const { mid } = computeConnectorPathFromAnchors(a0, a1, data?.bend);
      const deskP = getDeskPointFromClient(ev.clientX, ev.clientY);
      const nextBend = { x: deskP.x - mid.x, y: deskP.y - mid.y };
      const nextData = { ...data, bend: nextBend };
      const child = curEl?.connector ?? curEl?.Connector ?? {};
      const nextChild = { ...child, data: nextData };
      updateLocalElement(idNum, { connector: nextChild, Connector: nextChild });
    };

    const onUp = async (ev) => {
      if (ev.pointerId !== pointerId) return;
      cleanup(onMove, onUp);
      setConnectorsFollowDuringDrag(false);
      const curEl = elementsRef.current?.find?.((x) => x?.id === idNum) || el;
      const data = curEl?.connector?.data || curEl?.Connector?.data || {};
      try {
        const updated = await updateElement(idNum, { payload: { data } });
        const vm = elementToVm(updated);
        setElements((prev) => prev.map((x) => (sameId(x.id, vm.id) ? { ...x, ...vm } : x)));

        if (!applyingHistoryRef.current && before) {
          const afterSnap = snapshotForHistory(vm);
          if (afterSnap && !snapshotEquals(before, afterSnap)) {
            pushHistory({
              kind: 'update-element',
              elementId: idNum,
              before,
              after: afterSnap,
            });
          }
        }
      } catch {
        // ignore
      }
    };

    window.addEventListener('pointermove', onMove, true);
    window.addEventListener('pointerup', onUp, true);
  };

  const beginEditing = (elementId, explicitBeforeSnap) => {
    if (!elementId) return;
    // Selecting an element implies it's the only active selection.
    setSelectedElementIds(new Set([idKey(elementId)]));
    // Enforce a single active editor: switching elements should commit the previous one.
    if (editingElementId && editingElementId !== elementId) {
      endEditing();
    }
    if (!editStartSnapRef.current.has(elementId)) {
      const before = explicitBeforeSnap || snapshotForHistory(elementsRef.current.find((x) => sameId(x.id, elementId)));
      if (before) editStartSnapRef.current.set(elementId, before);
    }
    editingElementIdRef.current = elementId;
    setEditingElementId(elementId);
  };

  const endEditing = async () => {
    const activeId = editingElementIdRef.current ?? editingElementId;
    if (!activeId) return;
    if (endingEditRef.current) return;
    endingEditRef.current = true;
    const idToEnd = activeId;
    const current = elementsRef.current.find((el) => el.id === idToEnd);
    // Don't clobber a new editor that may have been opened while we were ending this one.
    setEditingElementId((cur) => (cur === idToEnd ? null : cur));
    if (editingElementIdRef.current === idToEnd) editingElementIdRef.current = null;

    // Release the "ending" lock ASAP so fast UX (Esc/Enter/new element) never gets stuck
    // on a slow/failed network request.
    const before = editStartSnapRef.current.get(idToEnd) || null;
    editStartSnapRef.current.delete(idToEnd);

    // Optimistic: reflect the latest local changes immediately; server sync happens async.
    if (current) setElements((prev) => prev.map((el) => (el.id === idToEnd ? { ...el, ...current } : el)));

    endingEditRef.current = false;

    if (!current) return;
    // Fire-and-forget persistence. This prevents "board freeze" when backend is slow.
    persistElement(current, { historyBefore: before }).catch(() => {
      // ignore
    });
  };

  const flushDragVisual = () => {
    dragVisualRafRef.current = null;
    const pending = dragVisualPendingRef.current;
    if (!pending?.elementKey) return;
    const node = elementNodeCacheRef.current.get(pending.elementKey);
    if (!node) return;
    node.style.transform = `translate3d(${pending.x}px, ${pending.y}px, 0) rotate(${pending.rotation ?? 0}deg)`;
  };

  const scheduleDragVisual = (elementKey, x, y, rotation) => {
    if (!elementKey) return;
    dragVisualPendingRef.current = { elementKey, x, y, rotation: Number(rotation ?? 0) };
    if (dragVisualRafRef.current == null) {
      dragVisualRafRef.current = window.requestAnimationFrame(flushDragVisual);
    }
  };

  useEffect(() => {
    return () => {
      if (dragVisualRafRef.current != null) {
        window.cancelAnimationFrame(dragVisualRafRef.current);
        dragVisualRafRef.current = null;
      }
      dragVisualPendingRef.current = null;
    };
  }, []);

  const maybeStartElementDrag = (elementId, pointerDownEvent) => {
    // For touch/pen pointer events, `button` can be -1; still allow dragging.
    if (pointerDownEvent.pointerType === 'mouse' && pointerDownEvent.button !== 0) return;
    if (interactionRef.current) return; // already dragging/resizing

    const el = elementsRef.current.find((x) => sameId(x.id, elementId));
    if (!el) return;

    const before = snapshotForHistory(el);
    const startX = pointerDownEvent.clientX;
    const startY = pointerDownEvent.clientY;
    const pointerId = pointerDownEvent.pointerId;

    // Higher threshold avoids accidental drags on click (touchpad jitter -> click is treated as drag).
    const threshold = 10; // px

    const cleanup = (onMove, onUp) => {
      window.removeEventListener('pointermove', onMove, true);
      window.removeEventListener('pointerup', onUp, true);
    };

    const beginDragNow = () => {
      // Suppress the click that will fire after a drag, so it doesn't enter edit mode.
      suppressNextElementClickRef.current.add(elementId);
      setConnectorsFollowDuringDrag(true);

      const elementKey = idKey(elementId);
      const node = elementKey ? elementNodeCacheRef.current.get(elementKey) : null;
      if (node) node.style.willChange = 'transform';

      interactionRef.current = {
        kind: 'drag',
        elementId,
        elementKey,
        hasDomNode: Boolean(node),
        startX,
        startY,
        origin: { x: el.x, y: el.y },
        latest: { x: el.x, y: el.y },
        rotation: Number(el.rotation ?? 0),
        pointerId,
      };

      const onDragMove = (ev) => {
        const cur = interactionRef.current;
        if (!cur || cur.kind !== 'drag' || cur.elementId !== elementId) return;
        if (cur.pointerId != null && ev.pointerId != null && ev.pointerId !== cur.pointerId) return;

        // Elements are positioned in desk coordinates inside a scaled container.
        // Convert screen delta -> desk delta for consistent movement at any zoom.
        const s = Number(viewScaleRef.current || 1) || 1;
        const dx = (ev.clientX - cur.startX) / s;
        const dy = (ev.clientY - cur.startY) / s;
        const nextX = cur.origin.x + dx;
        const nextY = cur.origin.y + dy;

        cur.latest = { x: nextX, y: nextY };
        // Perf: update only the dragged node's transform during drag; commit state on pointerup.
        if (cur.hasDomNode) scheduleDragVisual(cur.elementKey, nextX, nextY, cur.rotation);
        else updateLocalElement(elementId, { x: nextX, y: nextY });
      };

      const onDragUp = async () => {
        window.removeEventListener('pointermove', onDragMove);
        window.removeEventListener('pointerup', onDragUp);
        const cur = interactionRef.current;
        interactionRef.current = null;
        setConnectorsFollowDuringDrag(false);
        const latestPos = cur?.kind === 'drag' && cur?.elementId === elementId ? cur.latest : null;
        const latestBase = elementsRef.current.find((x) => sameId(x.id, elementId)) || el;
        if (latestBase && latestPos) {
          try {
            // Clear the transient perf hint.
            if (cur?.elementKey) {
              const node = elementNodeCacheRef.current.get(cur.elementKey);
              if (node) node.style.willChange = '';
            }

            // Ensure the final coords are visible before committing state.
            if (dragVisualRafRef.current != null) {
              window.cancelAnimationFrame(dragVisualRafRef.current);
              dragVisualRafRef.current = null;
            }
            dragVisualPendingRef.current = cur?.elementKey
              ? { elementKey: cur.elementKey, x: latestPos.x, y: latestPos.y, rotation: cur?.rotation ?? 0 }
              : null;
            flushDragVisual();
            dragVisualPendingRef.current = null;

            // Commit coords to state once (avoids per-frame full board work).
            setElements((prev) =>
              prev.map((xEl) => (sameId(xEl?.id, elementId) ? { ...xEl, x: latestPos.x, y: latestPos.y } : xEl))
            );
            await persistElement({ ...latestBase, x: latestPos.x, y: latestPos.y }, { historyBefore: before });
          } catch {
            // ignore
          }
        }
      };

      window.addEventListener('pointermove', onDragMove);
      window.addEventListener('pointerup', onDragUp, { once: true });
    };

    const onMove = (ev) => {
      if (ev.pointerId !== pointerId) return;
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      if (dx * dx + dy * dy < threshold * threshold) return;
      cleanup(onMove, onUp);
      beginDragNow();
    };

    const onUp = (ev) => {
      if (ev.pointerId !== pointerId) return;
      cleanup(onMove, onUp);
    };

    window.addEventListener('pointermove', onMove, true);
    window.addEventListener('pointerup', onUp, true);
  };

  const onElementPointerDown = (elementId, e) => {
    // Let "hand" tool pan even when pointer is over an element.
    if (activeTool === 'hand') return;
    // Allow drawing tools to work over elements (don't stop bubbling to the canvas).
    if (activeTool === 'pen' || activeTool === 'eraser') return;
    if (activeTool === 'connector') {
      // Connector tool interacts only with endpoints; don't start drag/edit on body click.
      e.stopPropagation();
      return;
    }

    // Prevent the canvas from calling preventDefault()/pointerCapture which breaks focus + dblclick.
    e.stopPropagation();
    // Avoid text selection on the board: click is meant to select/edit, not highlight text.
    // Do NOT prevent default if user interacts with an input/textarea/button inside the element.
    if (!isEditableTarget(e.target) && !e.target?.closest?.('button')) {
      e.preventDefault();
    }

    // If the user clicks another element while editing, first commit the previous edit.
    if (editingElementId && editingElementId !== elementId) {
      endEditing();
    }

    // More reliable than dblclick (which can be suppressed by pointer handlers).
    if (e.detail === 2) {
      beginEditing(elementId);
    }

    // Allow dragging elements by holding LMB anywhere on the element.
    // Click-to-edit is handled in onClick and is suppressed after a drag.
    maybeStartElementDrag(elementId, e);
  };

  const onElementClick = (elementId, ev) => {
    // Avoid entering edit mode after a drag gesture.
    if (suppressNextElementClickRef.current.has(elementId)) {
      suppressNextElementClickRef.current.delete(elementId);
      ev.preventDefault();
      ev.stopPropagation();
      return;
    }

    if (activeTool === 'hand' || activeTool === 'pen' || activeTool === 'eraser' || activeTool === 'connector') return;
    ev.stopPropagation();
    if (editingElementId === elementId) return;
    beginEditing(elementId);
  };

  // Avoid UI freezes: pointermove can fire hundreds of times/sec; batching keeps us to ~60fps.
  const pendingLocalElementPatchesRef = useRef(new Map());
  const localElementPatchRafRef = useRef(null);

  const flushLocalElementPatches = () => {
    localElementPatchRafRef.current = null;
    const patches = pendingLocalElementPatchesRef.current;
    if (!patches.size) return;

    // Apply all pending patches in one state update.
    setElements((prev) => {
      let didChange = false;
      const next = prev.map((el) => {
        const patch = patches.get(el.id);
        if (!patch) return el;
        didChange = true;
        return { ...el, ...patch };
      });
      return didChange ? next : prev;
    });

    patches.clear();
  };

  const updateLocalElement = (elementId, patch) => {
    if (!elementId || !patch) return;
    const patches = pendingLocalElementPatchesRef.current;
    const prev = patches.get(elementId);
    patches.set(elementId, prev ? { ...prev, ...patch } : patch);
    if (localElementPatchRafRef.current == null) {
      localElementPatchRafRef.current = window.requestAnimationFrame(flushLocalElementPatches);
    }
  };

  useEffect(() => {
    const pendingPatches = pendingLocalElementPatchesRef.current;
    return () => {
      if (localElementPatchRafRef.current != null) {
        window.cancelAnimationFrame(localElementPatchRafRef.current);
        localElementPatchRafRef.current = null;
      }
      pendingPatches.clear();
    };
  }, []);

  useEffect(() => {
    return () => {
      if (connectorDraftRafRef.current != null) {
        window.cancelAnimationFrame(connectorDraftRafRef.current);
        connectorDraftRafRef.current = null;
      }
      connectorDraftRef.current = null;
    };
  }, []);

  const queueNoteEdit = (elementId, text) => {
    const socket = socketRef.current;
    const deskId = workspace?.id ?? workspace?.deskId ?? id;
    if (!socket || !deskId) return;
    const k = idKey(elementId);
    if (!k) return;

    const prevTimer = noteEditTimersRef.current.get(k);
    if (prevTimer) window.clearTimeout(prevTimer);

    const timer = window.setTimeout(() => {
      const baseVersion = noteVersionsRef.current.get(k);
      socket.emit(
        'note:edit',
        { deskId, elementId, text, baseVersion },
        (ack = {}) => {
          if (!ack?.ok) {
            if (ack?.error === 'VERSION_CONFLICT') {
              if (ack.currentVersion != null) noteVersionsRef.current.set(k, ack.currentVersion);
              updateLocalElement(elementId, { content: String(ack.currentText ?? '') });
              setActionError('This note was updated by someone else. Synced to the latest version.');
              window.setTimeout(() => setActionError(null), 4500);
              return;
            }
            setActionError(String(ack?.error || 'Realtime update failed'));
            window.setTimeout(() => setActionError(null), 4500);
            return;
          }
          if (ack?.version != null) noteVersionsRef.current.set(k, ack.version);
        }
      );
    }, 220);

    noteEditTimersRef.current.set(k, timer);
  };

  const handleDeleteElement = async (elOrId) => {
    const idToDeleteRaw = elOrId?.id ?? elOrId?.elementId ?? elOrId;
    const idToDeleteKey = idKey(idToDeleteRaw);
    if (!idToDeleteKey) {
      // eslint-disable-next-line no-console
      console.error('Failed to delete element: invalid elementId', idToDeleteRaw);
      setActionError('Element not found');
      window.setTimeout(() => setActionError(null), 3000);
      return;
    }

    // Prefer the latest in-memory element snapshot (may include unsaved local edits).
    const latestEl =
      elementsRef.current?.find?.((x) => sameId(x?.id, idToDeleteRaw)) ||
      elements.find?.((x) => sameId(x?.id, idToDeleteRaw)) ||
      null;
    setDeletingElementId(idToDeleteKey);
    setActionError(null);
    try {
      // Optimistic: remove immediately, server sync in background.
      setEditingElementId((cur) => (sameId(cur, idToDeleteRaw) ? null : cur));
      setSelectedElementIds((cur) => {
        const k = idKey(idToDeleteRaw);
        if (!k || !cur?.has?.(k)) return cur;
        const next = new Set(cur);
        next.delete(k);
        return next;
      });
      setCommentsPanel((cur) => (sameId(cur?.elementId, idToDeleteRaw) ? null : cur));
      setElements((prev) => prev.filter((x) => !sameId(x.id, idToDeleteRaw)));
      await deleteElement(idToDeleteRaw);
      if (!applyingHistoryRef.current) {
        const deskId = workspace?.id ?? workspace?.deskId ?? id;
        const snap = snapshotForHistory(latestEl || elOrId);
        if (deskId && snap) {
          pushHistory({
            kind: 'delete-element',
            deskId,
            elementId: idToDeleteRaw,
            snapshot: snap,
          });
        }
      }
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

    let width = 320;
    let height = 200;
    const fileExt = getExt(file.name) || getExt(file.type);
    const isPhotoFile = isPhotoExt(fileExt) || (String(file.type || '').startsWith('image/') && isPhotoExt(getExt(file.name)));
    if (isPhotoFile) {
      try {
        const size = await readImageSizeFromFile(file);
        const w0 = Number(size?.width || 0);
        const h0 = Number(size?.height || 0);
        if (w0 > 0 && h0 > 0) {
          // Start images at a reasonable size but preserve aspect ratio.
          const maxW = 520;
          const maxH = 380;
          const scale = Math.min(maxW / w0, maxH / h0, 1);
          width = Math.max(120, Math.round(w0 * scale));
          height = Math.max(120, Math.round(h0 * scale));
        }
      } catch {
        // ignore: fallback to defaults
      }
    }

    const rect = canvasRef.current?.getBoundingClientRect?.();
    const canvasW = rect?.width ?? 1200;
    const canvasH = rect?.height ?? 800;
    const off = viewOffsetRef.current;
    const s = viewScaleRef.current || 1;
    const x = Math.round((canvasW / 2 - off.x) / s - width / 2);
    const y = Math.round((canvasH / 2 - off.y) / s - height / 2);
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
      if (vm?.id) createdElementIdsRef.current.add(vm.id);
      setElements((prev) => upsertById(prev, vm));
      if (!applyingHistoryRef.current) {
        const snap = snapshotForHistory(vm);
        if (deskId && snap) {
          pushHistory({
            kind: 'create-element',
            deskId,
            elementId: vm.id,
            snapshot: snap,
          });
        }
      }
      beginEditing(vm.id, snapshotForHistory(vm));
      // Mobile UX: adding a document is a one-shot action.
      if (isMobile) setActiveTool('hand');
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
    const off = viewOffsetRef.current;
    const s = viewScaleRef.current || 1;
    const x = Math.round((canvasW / 2 - off.x) / s - width / 2);
    const y = Math.round((canvasH / 2 - off.y) / s - height / 2);
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
      if (vm?.id) createdElementIdsRef.current.add(vm.id);
      setElements((prev) => upsertById(prev, vm));
      if (!applyingHistoryRef.current) {
        const snap = snapshotForHistory(vm);
        if (deskId && snap) {
          pushHistory({
            kind: 'create-element',
            deskId,
            elementId: vm.id,
            snapshot: snap,
          });
        }
      }
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

  const startResize = (elementId, handle, e) => {
    e.stopPropagation();
    e.preventDefault();
    setConnectorsFollowDuringDrag(true);
    const el = elements.find((x) => sameId(x.id, elementId));
    if (!el) return;
    const before = snapshotForHistory(el);

    const startX = e.clientX;
    const startY = e.clientY;
    const originW = Number(el.width ?? 0);
    const originH = Number(el.height ?? 0);
    const lockAspect = el.type === 'note';
    const aspect = lockAspect && originW > 0 && originH > 0 ? originW / originH : 1;
    interactionRef.current = {
      kind: 'resize',
      elementId,
      handle,
      startX,
      startY,
      origin: { x: el.x, y: el.y, width: originW, height: originH },
      lockAspect,
      aspect,
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

      const isLeft = leftHandles.includes(cur.handle);
      const isRight = rightHandles.includes(cur.handle);
      const isTop = topHandles.includes(cur.handle);
      const isBottom = bottomHandles.includes(cur.handle);

      if (cur.lockAspect) {
        const r = Number(cur.aspect) > 0 ? Number(cur.aspect) : 1;
        const deltaW = isRight ? dx : isLeft ? -dx : 0;
        const deltaH = isBottom ? dy : isTop ? -dy : 0;

        const baseW = Math.max(1, Number(cur.origin.width ?? 0));
        const baseH = Math.max(1, Number(cur.origin.height ?? 0));
        const relW = Math.abs(deltaW) / baseW;
        const relH = Math.abs(deltaH) / baseH;

        const clampSize = (w, h) => {
          let nextW = Number(w);
          let nextH = Number(h);
          if (!Number.isFinite(nextW) || !Number.isFinite(nextH)) {
            nextW = baseW;
            nextH = baseH;
          }

          // Enforce mins while preserving ratio (iterate a couple times for stability).
          for (let i = 0; i < 2; i += 1) {
            if (nextW < minW) {
              nextW = minW;
              nextH = nextW / r;
            }
            if (nextH < minH) {
              nextH = minH;
              nextW = nextH * r;
            }
          }

          return { nextW, nextH };
        };

        if (relW >= relH) {
          const desiredW = cur.origin.width + deltaW;
          const { nextW, nextH } = clampSize(desiredW, desiredW / r);
          width = nextW;
          height = nextH;
        } else {
          const desiredH = cur.origin.height + deltaH;
          const { nextW, nextH } = clampSize(desiredH * r, desiredH);
          width = nextW;
          height = nextH;
        }

        if (isLeft) x = cur.origin.x + (cur.origin.width - width);
        if (isTop) y = cur.origin.y + (cur.origin.height - height);
      } else {
        if (isRight) width = Math.max(minW, cur.origin.width + dx);
        if (isBottom) height = Math.max(minH, cur.origin.height + dy);
        if (isLeft) {
          const nextW = Math.max(minW, cur.origin.width - dx);
          x = cur.origin.x + (cur.origin.width - nextW);
          width = nextW;
        }
        if (isTop) {
          const nextH = Math.max(minH, cur.origin.height - dy);
          y = cur.origin.y + (cur.origin.height - nextH);
          height = nextH;
        }
      }

      updateLocalElement(elementId, { x, y, width, height });
    };

    const onUp = async () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      interactionRef.current = null;
      setConnectorsFollowDuringDrag(false);
      const latest = elementsRef.current.find((x) => sameId(x.id, elementId));
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

  const registerElementNode = useCallback((elementId, node) => {
    const k = idKey(elementId);
    if (!k) return;
    const m = elementNodeCacheRef.current;
    if (node) m.set(k, node);
    else m.delete(k);
  }, []);

  const getElementByIdFromRef = useCallback((elementId) => {
    const k = idKey(elementId);
    if (!k) return null;
    const list = elementsRef.current || [];
    for (const el of list) {
      if (sameId(el?.id, elementId)) return el;
    }
    return null;
  }, []);

  const getLiveAnchorPoint = useCallback(
    (elementId, side) => {
      const k = idKey(elementId);
      if (!k) return null;
      const node = elementNodeCacheRef.current.get(k);
      if (node && canvasRef.current) {
        const r = node.getBoundingClientRect();
        const s = String(side || 'right');
        let ax = r.right;
        let ay = r.top + r.height / 2;
        let dir = { x: 1, y: 0 };
        if (s === 'top') {
          ax = r.left + r.width / 2;
          ay = r.top;
          dir = { x: 0, y: -1 };
        } else if (s === 'bottom') {
          ax = r.left + r.width / 2;
          ay = r.bottom;
          dir = { x: 0, y: 1 };
        } else if (s === 'left') {
          ax = r.left;
          ay = r.top + r.height / 2;
          dir = { x: -1, y: 0 };
        }

        const deskP = getDeskPointFromClient(ax, ay);
        const OUTSET = 10;
        return { x: Number(deskP.x) + dir.x * OUTSET, y: Number(deskP.y) + dir.y * OUTSET, dir };
      }

      const el = getElementByIdFromRef(elementId);
      if (!el) return null;
      return getAnchorPoint(el, side);
    },
    [getDeskPointFromClient, getElementByIdFromRef, getAnchorPoint]
  );

  // Keep connector list stable across drag frames so the memoized connectors layer isn't forced to rerender.
  const stableConnectorsRef = useRef([]);
  const connectorElements = useMemo(() => {
    const next = (Array.isArray(elements) ? elements : []).filter((el) => el?.type === 'connector');
    const prev = stableConnectorsRef.current;
    if (prev.length === next.length && prev.every((x, i) => x === next[i])) return prev;
    stableConnectorsRef.current = next;
    return next;
  }, [elements]);

  const onSelectConnector = useCallback((connectorId) => {
    setEditingElementId(null);
    setSelectedConnectorId(connectorId);
  }, []);

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
      setElements((prev) => prev.map((x) => (sameId(x.id, vm.id) ? { ...x, ...vm, content: vm.content ?? x.content } : x)));
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('Failed to apply history snapshot:', err?.response?.data || err);
      setActionError(err?.response?.data?.error || err?.message || 'Failed to apply history change');
      window.setTimeout(() => setActionError(null), 4500);
    } finally {
      applyingHistoryRef.current = false;
    }
  };

  const restoreDeletedElement = async (entry) => {
    const snap = entry?.snapshot;
    const deskId = entry?.deskId ?? (workspace?.id ?? workspace?.deskId ?? id);
    if (!deskId || !snap?.type) return;
    applyingHistoryRef.current = true;
    setActionError(null);
    try {
      const created = await createElementOnDesk(deskId, {
        type: snap.type,
        x: snap.x,
        y: snap.y,
        width: snap.width,
        height: snap.height,
        rotation: snap.rotation ?? 0,
        zIndex: snap.zIndex ?? 0,
        payload: snap.payload,
      });
      const vm = elementToVm(created);
      if (vm?.id) {
        // Backend generates new ids; keep the history entry pointing at the restored element for redo.
        entry.elementId = vm.id;
        entry.snapshot = { ...snap, elementId: vm.id };
        setElements((prev) => upsertById(prev, vm));
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('Failed to restore deleted element:', err?.response?.data || err);
      setActionError(err?.response?.data?.error || err?.message || 'Failed to restore deleted element');
      window.setTimeout(() => setActionError(null), 4500);
    } finally {
      applyingHistoryRef.current = false;
    }
  };

  const deleteElementFromHistory = async (entry, opts = {}) => {
    const elementId = entry?.elementId;
    if (!elementId) return;
    applyingHistoryRef.current = true;
    setActionError(null);
    try {
      await deleteElement(elementId);
      setEditingElementId((cur) => (cur === elementId ? null : cur));
      setSelectedElementIds((cur) => {
        const k = idKey(elementId);
        if (!k || !cur?.has?.(k)) return cur;
        const next = new Set(cur);
        next.delete(k);
        return next;
      });
      setElements((prev) => prev.filter((x) => !sameId(x.id, elementId)));
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('Failed to delete element from history:', err?.response?.data || err);
      setActionError(err?.response?.data?.error || err?.message || opts.errorMessage || 'Failed to apply history delete');
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
      return;
    }
    if (entry.kind === 'delete-element') {
      await restoreDeletedElement(entry);
      return;
    }
    if (entry.kind === 'create-element') {
      await deleteElementFromHistory(entry, { errorMessage: 'Failed to undo create' });
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
      return;
    }
    if (entry.kind === 'delete-element') {
      await deleteElementFromHistory(entry, { errorMessage: 'Failed to redo delete' });
      return;
    }
    if (entry.kind === 'create-element') {
      await restoreDeletedElement(entry);
    }
  };

  const undoEv = useEvent(undo);
  const redoEv = useEvent(redo);

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

    // Mobile pinch-to-zoom: when the 2nd finger touches, switch into pinch mode.
    if (isMobile && e.pointerType === 'touch') {
      const p0 = getCanvasPoint(e);
      const pinch = mobilePinchRef.current;
      pinch.pointers.set(e.pointerId, { x: p0.x, y: p0.y });

      if (pinch.pointers.size === 2) {
        const pts = Array.from(pinch.pointers.values());
        const a = pts[0];
        const b = pts[1];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dist = Math.hypot(dx, dy) || 1;
        const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
        const off0 = viewOffsetRef.current;
        const s0 = viewScaleRef.current || 1;

        pinch.active = true;
        pinch.startDist = dist;
        pinch.startScale = s0;
        pinch.startOffset = { ...off0 };
        pinch.deskMid = { x: (mid.x - off0.x) / s0, y: (mid.y - off0.y) / s0 };

        // Cancel ongoing interactions while pinching.
        selectStartRef.current = null;
        setSelectionRect(null);
        liveStrokeRef.current = null;
        setLiveStroke(null);
        eraseStateRef.current.active = false;
        interactionRef.current = null;
        setIsPanning(false);
        panStartRef.current = null;
        return;
      }
    }

    const p = getCanvasPoint(e);
    const off = viewOffsetRef.current;
    const curScale = viewScaleRef.current || 1;
    const deskP = { x: (p.x - off.x) / curScale, y: (p.y - off.y) / curScale };

    // Exit edit mode on click outside element.
    // Important UX: the first click outside should *only* finish editing, and not create a new element.
    const activeEditingId = editingElementIdRef.current ?? editingElementId;
    if (activeEditingId) {
      const insideEditing = e.target?.closest?.(`[data-element-id="${activeEditingId}"]`);
      if (!insideEditing) {
        endEditing();
        // For the Hand tool: allow the same gesture to start panning immediately after committing edits.
        if (activeTool !== 'hand' && !handHoldRef.current.active) return;
      }
    }

    // Click on empty canvas deselects connector line selection.
    if (selectedConnectorId) setSelectedConnectorId(null);

    if (activeTool === 'connector') {
      // Connector tool starts only from element endpoints.
      setSelectedConnectorId(null);
      return;
    }

    // Clicking empty canvas clears element selection (cursor tool UX).
    // Do this after the "exit edit mode" early-return above, so a click first commits edits.
    setSelectedElementIds(new Set());
    setEditingElementId(null);

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
          if (vm?.id) createdElementIdsRef.current.add(vm.id);
          setElements((prev) => upsertById(prev, vm));
          if (!applyingHistoryRef.current) {
            const snap = snapshotForHistory(vm);
            if (deskId && snap) {
              pushHistory({
                kind: 'create-element',
                deskId,
                elementId: vm.id,
                snapshot: snap,
              });
            }
          }
          beginEditing(vm.id, snapshotForHistory(vm));
          // Mobile UX: element creation is a one-shot action.
          // After placing a note/text, switch back to Hand so the next tap doesn't create again.
          if (isMobile) setActiveTool('hand');
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
      // Mobile UX: swipe should pan the board by default (instead of box-select).
      // Pinch-to-zoom already uses 2 fingers; this enables 1-finger navigation in the default tool.
      if (isMobile && e.pointerType === 'touch') {
        selectStartRef.current = null;
        setSelectionRect(null);
        panStartRef.current = { p, startOffset: { ...viewOffsetRef.current } };
        setIsPanning(true);
        return;
      }
      selectStartRef.current = p;
      setSelectionRect({ left: p.x, top: p.y, width: 0, height: 0 });
    }

    if (activeTool === 'hand') {
      panStartRef.current = { p, startOffset: { ...viewOffsetRef.current } };
      setIsPanning(true);
    }
  };

  const onCanvasPointerMove = (e) => {
    if (isMobile && e.pointerType === 'touch') {
      const pinch = mobilePinchRef.current;
      if (pinch.pointers.has(e.pointerId)) {
        const p0 = getCanvasPoint(e);
        pinch.pointers.set(e.pointerId, { x: p0.x, y: p0.y });
      }

      if (pinch.active && pinch.pointers.size >= 2) {
        const pts = Array.from(pinch.pointers.values());
        const a = pts[0];
        const b = pts[1];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dist = Math.hypot(dx, dy) || 1;
        const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };

        const ratio = dist / (pinch.startDist || 1);
        const nextScale = clampViewScale((pinch.startScale || 1) * ratio);
        const nextOffset = {
          x: mid.x - pinch.deskMid.x * nextScale,
          y: mid.y - pinch.deskMid.y * nextScale,
        };
        scheduleApplyViewVars({ offset: nextOffset, scale: nextScale });
        return;
      }
    }

    if (activeTool === 'pen' && liveStrokeRef.current) {
      const p = getCanvasPoint(e);
      const off = viewOffsetRef.current;
      const s = viewScaleRef.current || 1;
      const deskP = { x: (p.x - off.x) / s, y: (p.y - off.y) / s };
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
      const off = viewOffsetRef.current;
      const s = viewScaleRef.current || 1;
      const deskP = { x: (p.x - off.x) / s, y: (p.y - off.y) / s };
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
        setElements((prev) => prev.filter((xEl) => !sameId(xEl.id, el.id)));
        if (!applyingHistoryRef.current) {
          const deskId = workspace?.id ?? workspace?.deskId ?? id;
          const snap = snapshotForHistory(el);
          if (deskId && snap) {
            pushHistory({
              kind: 'delete-element',
              deskId,
              elementId: el.id,
              snapshot: snap,
            });
          }
        }
        // Fire-and-forget delete.
        deleteElement(el.id).catch(() => {
          // ignore
        });
      }
      return;
    }

    if (activeTool === 'connector' && !connectorDraftRef.current) {
      const p = getCanvasPoint(e);
      const off = viewOffsetRef.current;
      const s = viewScaleRef.current || 1;
      const deskP = { x: (p.x - off.x) / s, y: (p.y - off.y) / s };
      const hoverId = pickHoverElementId(deskP, 15);
      setConnectorHoverElementId(hoverId);
      return;
    }

    if (activeTool === 'select' && selectStartRef.current) {
      const p = getCanvasPoint(e);
      setSelectionRect(rectFromPoints(selectStartRef.current, p));

      // Live box-select feedback (rAF throttled).
      selectPendingEndRef.current = p;
      if (selectRafRef.current == null) {
        selectRafRef.current = window.requestAnimationFrame(() => {
          selectRafRef.current = null;
          const start = selectStartRef.current;
          const end = selectPendingEndRef.current;
          if (!start || !end) return;
          const rect = rectFromPoints(start, end);
          const minSize = 4; // px; treat smaller as a click
          if (rect.width < minSize && rect.height < minSize) {
            setSelectedElementIds(new Set());
            setEditingElementId(null);
            return;
          }

          const off = viewOffsetRef.current;
          const s = viewScaleRef.current || 1;
          const left = (rect.left - off.x) / s;
          const top = (rect.top - off.y) / s;
          const right = (rect.left + rect.width - off.x) / s;
          const bottom = (rect.top + rect.height - off.y) / s;

          const hits = [];
          const list = elementsRef.current || [];
          for (const el of list) {
            if (!el?.id) continue;
            if (el.type === 'connector') continue;
            const ex = Number(el.x ?? 0);
            const ey = Number(el.y ?? 0);
            const ew = Number(el.width ?? 0);
            const eh = Number(el.height ?? 0);
            const intersects = ex <= right && ex + ew >= left && ey <= bottom && ey + eh >= top;
            if (!intersects) continue;
            hits.push(idKey(el.id));
          }

          setSelectedElementIds(new Set(hits));
          setEditingElementId(null);
        });
      }
      return;
    }

    if (panStartRef.current) {
      const p = getCanvasPoint(e);
      const { p: start, startOffset } = panStartRef.current;
      const dx = p.x - start.x;
      const dy = p.y - start.y;
      scheduleApplyViewVars({ offset: { x: startOffset.x + dx, y: startOffset.y + dy } });
    }
  };

  const onCanvasWheel = (e) => {
    // Zoom on wheel up/down. Prevent page scroll while cursor is over the canvas.
    e.preventDefault();
    const p = getCanvasPoint(e);
    const off = viewOffsetRef.current;
    const curScale = viewScaleRef.current || 1;
    const nextScale = clampViewScale(curScale * Math.exp(-e.deltaY * 0.0015));
    if (Math.abs(nextScale - curScale) < 1e-4) return;

    // Keep desk point under cursor stable.
    const d = { x: (p.x - off.x) / curScale, y: (p.y - off.y) / curScale };
    const nextOffset = { x: p.x - d.x * nextScale, y: p.y - d.y * nextScale };
    scheduleApplyViewVars({ offset: nextOffset, scale: nextScale });
    persistViewDebounced({ offset: nextOffset, scale: nextScale });
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
      if (vm?.id) {
        createdElementIdsRef.current.add(vm.id);
        setElements((prev) => upsertById(prev, vm));
        if (!applyingHistoryRef.current) {
          const snap = snapshotForHistory(vm);
          if (deskId && snap) {
            pushHistory({
              kind: 'create-element',
              deskId,
              elementId: vm.id,
              snapshot: snap,
            });
          }
        }
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('Failed to create drawing stroke:', err?.response?.data || err);
      setActionError(err?.response?.data?.error || err?.message || 'Failed to save drawing');
      window.setTimeout(() => setActionError(null), 4500);
    }
  };

  const onCanvasPointerUp = (e) => {
    if (isMobile && e.pointerType === 'touch') {
      const pinch = mobilePinchRef.current;
      if (pinch.pointers.has(e.pointerId)) pinch.pointers.delete(e.pointerId);

      if (pinch.active && pinch.pointers.size < 2) {
        pinch.active = false;
        const off = viewOffsetRef.current;
        const s = viewScaleRef.current || 1;
        setViewOffset(off);
        persistViewDebounced({ offset: off, scale: s }, { immediate: true });
      }
    }

    if (activeTool === 'pen' && liveStrokeRef.current) {
      finalizeStroke();
    }
    if (activeTool === 'eraser') {
      eraseStateRef.current.active = false;
      eraseStateRef.current.erasedIds = new Set();
    }

    // Cursor tool: box-select elements into "edit mode" (selection/transform handles).
    // We intentionally don't open text/link editors for multi-selection.
    if (activeTool === 'select' && selectStartRef.current) {
      const start = selectStartRef.current;
      const end = getCanvasPoint(e);
      const rect = rectFromPoints(start, end);
      const minSize = 4; // px; treat smaller as a click
      if (rect.width >= minSize || rect.height >= minSize) {
        const off = viewOffsetRef.current;
        const s = viewScaleRef.current || 1;
        const left = (rect.left - off.x) / s;
        const top = (rect.top - off.y) / s;
        const right = (rect.left + rect.width - off.x) / s;
        const bottom = (rect.top + rect.height - off.y) / s;

        const hits = [];
        const list = elementsRef.current || [];
        for (const el of list) {
          if (!el?.id) continue;
          if (el.type === 'connector') continue;
          const ex = Number(el.x ?? 0);
          const ey = Number(el.y ?? 0);
          const ew = Number(el.width ?? 0);
          const eh = Number(el.height ?? 0);
          // AABB intersection (touching counts).
          const intersects = ex <= right && ex + ew >= left && ey <= bottom && ey + eh >= top;
          if (!intersects) continue;
          hits.push(idKey(el.id));
        }

        setSelectedElementIds(new Set(hits));
        // If multiple are selected, avoid opening multiple editors.
        if (hits.length !== 1) setEditingElementId(null);
      }
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
        setElements(dedupeMergeById(Array.isArray(data) ? data.map(elementToVm) : []));
      })
      .catch(() => mounted && setElements([]));

    return () => {
      mounted = false;
    };
  }, [workspace?.id, workspace?.deskId, id, elementToVm]);

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
        if (connectorDraftRef.current) {
          e.preventDefault();
          connectorDraftRef.current = null;
          setConnectorDraft(null);
          setConnectorHoverElementId(null);
          return;
        }
        if (selectedConnectorId) {
          e.preventDefault();
          setSelectedConnectorId(null);
          return;
        }
        if (activeTool === 'connector') {
          e.preventDefault();
          setConnectorHoverElementId(null);
          setActiveTool('select');
          return;
        }
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

      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedConnectorId) {
        e.preventDefault();
        const idToDelete = selectedConnectorId;
        setSelectedConnectorId(null);
        deleteElement(idToDelete)
          .then(() => setElements((prev) => prev.filter((x) => !sameId(x.id, idToDelete))))
          .catch(() => {
            // ignore
          });
        return;
      }

      if (matchShortcut(e, shortcuts['history.undo'])) {
        e.preventDefault();
        undoEv();
        return;
      }
      if (matchShortcut(e, shortcuts['history.redo'])) {
        e.preventDefault();
        redoEv();
        return;
      }
      if (matchShortcut(e, shortcuts['tool.select'])) {
        e.preventDefault();
        setActionError(null);
        setActiveTool('select');
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
  }, [shortcuts, activeTool, selectedConnectorId, undoEv, redoEv]);

  const focusElement = (elementId) => {
    const el = elementsRef.current?.find?.((x) => x?.id === elementId) || elements.find((x) => x?.id === elementId);
    const canvas = canvasRef.current;
    if (!el || !canvas) return;
    const rect = canvas.getBoundingClientRect();
    const cx = rect.width / 2;
    const cy = rect.height / 2;
    const ex = (el.x ?? 0) + (el.width ?? 240) / 2;
    const ey = (el.y ?? 0) + (el.height ?? 160) / 2;
    const s = viewScaleRef.current || 1;
    const nextOffset = { x: cx - ex * s, y: cy - ey * s };
    scheduleApplyViewVars({ offset: nextOffset, scale: s });
    setViewOffset(nextOffset);
    persistViewDebounced({ offset: nextOffset, scale: s });
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
    let didAuthRetry = false;
    const noteEditTimers = noteEditTimersRef.current;

    socket.on('connect', () => {
      socket.emit('desk:join', { deskId }, (ack = {}) => {
        if (!ack?.ok) {
          setActionError(String(ack?.error || 'Failed to join realtime room'));
          window.setTimeout(() => setActionError(null), 4500);
        }
      });
    });

    socket.on('connect_error', (err) => {
      const msg = String(err?.message || 'unknown error');
      if (!didAuthRetry && msg.toLowerCase().includes('not authorized')) {
        didAuthRetry = true;
        refreshAuth()
          .then(() => {
            const nextToken = getToken();
            if (nextToken) socket.auth = { token: nextToken };
            socket.connect();
          })
          .catch(() => {
            setActionError('Realtime auth failed. Please sign in again.');
            window.setTimeout(() => setActionError(null), 4500);
          });
        return;
      }
      setActionError(`Realtime connection failed: ${msg}`);
      window.setTimeout(() => setActionError(null), 4500);
    });

    socket.on('desk:presence', (p = {}) => {
      if (Number(p.deskId) !== Number(deskId)) return;
      const next = Array.isArray(p.users) ? p.users.map((u) => u.userId).filter((x) => x != null) : [];
      setPresentUserIds(next);
    });

    socket.on('note:updated', (msg = {}) => {
      if (Number(msg.deskId) !== Number(deskId)) return;
      const elementId = msg.elementId;
      if (!idKey(elementId)) return;
      // Guard against out-of-order websocket delivery: never apply an older version over a newer local state.
      if (msg.version != null) {
        const incomingV = Number(msg.version);
        const curV = noteVersionsRef.current.get(idKey(elementId));
        if (curV != null && Number.isFinite(incomingV) && incomingV <= curV) return;
        noteVersionsRef.current.set(idKey(elementId), incomingV);
      }
      setElements((prev) => prev.map((el) => (sameId(el.id, elementId) ? { ...el, content: String(msg.text ?? '') } : el)));
    });

    socket.on('element:created', (raw) => {
      const vm = elementToVm(raw);
      if (!vm?.id) return;
      setElements((prev) => upsertById(prev, vm));
    });

    socket.on('element:updated', (raw) => {
      const vm = elementToVm(raw);
      if (!vm?.id) return;
      setElements((prev) => prev.map((e) => (sameId(e.id, vm.id) ? { ...e, ...vm } : e)));
    });

    socket.on('element:reactions', (msg = {}) => {
      if (Number(msg.deskId) !== Number(deskId)) return;
      const elementId = msg.elementId;
      if (!idKey(elementId)) return;
      const reactions = normalizeReactions(msg.reactions);
      setElements((prev) => prev.map((el) => (sameId(el.id, elementId) ? { ...el, reactions } : el)));
    });

    socket.on('element:deleted', (msg = {}) => {
      if (Number(msg.deskId) !== Number(deskId)) return;
      const elementId = msg.elementId;
      if (!idKey(elementId)) return;
      setElements((prev) => prev.filter((e) => !sameId(e.id, elementId)));
      setEditingElementId((cur) => (sameId(cur, elementId) ? null : cur));
      setSelectedElementIds((cur) => {
        const k = idKey(elementId);
        if (!k || !cur?.has?.(k)) return cur;
        const next = new Set(cur);
        next.delete(k);
        return next;
      });
      setCommentsPanel((cur) => (sameId(cur?.elementId, elementId) ? null : cur));
    });

    socket.on('comment:created', (msg = {}) => {
      if (!commentsEnabled) return;
      if (Number(msg.deskId) !== Number(deskId)) return;
      const elementId = idKey(msg.elementId);
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
      for (const t of noteEditTimers.values()) window.clearTimeout(t);
      noteEditTimers.clear();
      socket.disconnect();
      socketRef.current = null;
      setPresentUserIds([]);
    };
  }, [workspace?.id, workspace?.deskId, id, commentsEnabled, elementToVm, normalizeReactions]);

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

  const mutateElementRef = useCallback((elementId, patch) => {
    if (!elementId || !patch) return;
    const list = elementsRef.current || [];
    const el = list.find((x) => x?.id === elementId);
    if (!el) return;
    Object.assign(el, patch);
  }, []);

  const beginEditingEv = useEvent(beginEditing);

  const maybeEnterEditOnPointerUp = useCallback(
    (elementId, ev) => {
      if (!elementId) return;
      if (activeTool === 'hand' || activeTool === 'pen' || activeTool === 'eraser' || activeTool === 'connector') return;
      if (ev?.pointerType === 'mouse' && ev?.button !== 0) return;
      // If this pointer sequence turned into a drag, do not enter edit mode.
      if (suppressNextElementClickRef.current.has(elementId)) return;
      // Don't steal clicks from buttons/inputs inside the card (comments/reactions/etc).
      if (isEditableTarget(ev?.target)) return;
      if (ev?.target?.closest?.('button')) return;
      if (editingElementId === elementId) return;
      ev?.preventDefault?.();
      beginEditingEv(elementId);
    },
    [activeTool, editingElementId, beginEditingEv]
  );

  // Stable action wrappers for memoized element components (avoid rerendering all cards on each drag frame).
  const onElementPointerDownEv = useEvent(onElementPointerDown);
  const onElementClickEv = useEvent(onElementClick);
  const endEditingEv = useEvent(endEditing);
  const updateLocalElementEv = useEvent(updateLocalElement);
  const queueNoteEditEv = useEvent(queueNoteEdit);
  const startResizeEv = useEvent(startResize);
  const startConnectorDragEv = useEvent(startConnectorDrag);
  const startConnectorBendDragEv = useEvent(startConnectorBendDrag);
  const openReactionPickerEv = useEvent(openReactionPicker);
  const toggleReactionEv = useEvent(toggleReaction);
  const openCommentsEv = useEvent(openComments);
  const handleDeleteElementEv = useEvent(handleDeleteElement);
  const layoutReactionBubblesEv = useEvent(layoutReactionBubbles);
  const mutateElementRefEv = useEvent(mutateElementRef);
  const maybeEnterEditOnPointerUpEv = useEvent(maybeEnterEditOnPointerUp);

  const noteTextActions = useMemo(
    () => ({
      onElementPointerDown: onElementPointerDownEv,
      onElementClick: onElementClickEv,
      beginEditing: beginEditingEv,
      endEditing: endEditingEv,
      updateLocalElement: updateLocalElementEv,
      queueNoteEdit: queueNoteEditEv,
      startResize: startResizeEv,
      startConnectorDrag: startConnectorDragEv,
      openReactionPicker: openReactionPickerEv,
      toggleReaction: toggleReactionEv,
      openComments: openCommentsEv,
      handleDeleteElement: handleDeleteElementEv,
      layoutReactionBubbles: layoutReactionBubblesEv,
      mutateElementRef: mutateElementRefEv,
      maybeEnterEditOnPointerUp: maybeEnterEditOnPointerUpEv,
    }),
    [
      beginEditingEv,
      endEditingEv,
      handleDeleteElementEv,
      layoutReactionBubblesEv,
      mutateElementRefEv,
      maybeEnterEditOnPointerUpEv,
      onElementClickEv,
      onElementPointerDownEv,
      openCommentsEv,
      openReactionPickerEv,
      queueNoteEditEv,
      startConnectorDragEv,
      startResizeEv,
      toggleReactionEv,
      updateLocalElementEv,
    ]
  );

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

  const docTextPreviewKey = useMemo(() => {
    // Only care about document URLs + extensions that support text preview.
    // Positions change during drag shouldn't re-trigger the preview fetch effect.
    const parts = [];
    for (const el of Array.isArray(elements) ? elements : []) {
      if (el?.type !== 'document') continue;
      const doc = el.document ?? el.Document;
      const title = doc?.title || 'Document';
      const url = doc?.url;
      const ext = getExt(title) || getExt(url);
      if (url && TEXT_PREVIEW_EXTS.has(ext)) parts.push(`${ext}:${url}`);
    }
    parts.sort();
    return parts.join('|');
  }, [elements]);

  useEffect(() => {
    // Best-effort previews for text-like formats. For everything else we show an icon/thumbnail/pdf embed.
    let cancelled = false;

    const docs = String(docTextPreviewKey || '')
      .split('|')
      .map((part) => {
        const idx = part.indexOf(':');
        if (idx <= 0) return null;
        const ext = part.slice(0, idx);
        const url = part.slice(idx + 1);
        return { url, ext };
      })
      .filter(Boolean);

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
  }, [docTextPreviewKey, docTextPreview]);

  const onMobileSheetDragStart = useCallback((ev) => {
    if (ev.pointerType === 'mouse' && ev.button !== 0) return;
    mobileSheetDragRef.current.active = true;
    mobileSheetDragRef.current.pointerId = ev.pointerId;
    mobileSheetDragRef.current.startY = ev.clientY;
    mobileSheetDragRef.current.lastY = ev.clientY;
    setMobileSheetDragging(true);
    try {
      (mobileSheetRef.current || ev.currentTarget)?.setPointerCapture?.(ev.pointerId);
    } catch {
      // ignore
    }
  }, []);

  const onMobileSheetDragMove = useCallback((ev) => {
    const d = mobileSheetDragRef.current;
    if (!d.active || d.pointerId !== ev.pointerId) return;
    const dy = Math.max(0, ev.clientY - d.startY);
    d.lastY = ev.clientY;
    setMobileSheetDragY(dy);
  }, []);

  const onMobileSheetDragEnd = useCallback((ev) => {
    const d = mobileSheetDragRef.current;
    if (!d.active || d.pointerId !== ev.pointerId) return;
    d.active = false;
    d.pointerId = null;
    setMobileSheetDragging(false);

    const dy = Math.max(0, ev.clientY - d.startY);
    const shouldClose = dy > 90;
    if (shouldClose) {
      setMobileToolsOpen(false);
      setMobileSheetDragY(0);
      return;
    }
    setMobileSheetDragY(0);
  }, []);

  const closeAiPanel = useCallback(() => {
    aiSheetDragRef.current.active = false;
    aiSheetDragRef.current.pointerId = null;
    setAiSheetDragging(false);
    setAiSheetDragY(0);
    setAiPanelOpen(false);
  }, []);

  const onAiSheetDragStart = useCallback((ev) => {
    if (ev.pointerType === 'mouse' && ev.button !== 0) return;
    aiSheetDragRef.current.active = true;
    aiSheetDragRef.current.pointerId = ev.pointerId;
    aiSheetDragRef.current.startY = ev.clientY;
    aiSheetDragRef.current.lastY = ev.clientY;
    setAiSheetDragging(true);
    try {
      (aiSheetRef.current || ev.currentTarget)?.setPointerCapture?.(ev.pointerId);
    } catch {
      // ignore
    }
  }, []);

  const onAiSheetDragMove = useCallback((ev) => {
    const d = aiSheetDragRef.current;
    if (!d.active || d.pointerId !== ev.pointerId) return;
    const dy = Math.max(0, ev.clientY - d.startY);
    d.lastY = ev.clientY;
    setAiSheetDragY(dy);
  }, []);

  const onAiSheetDragEnd = useCallback(
    (ev) => {
      const d = aiSheetDragRef.current;
      if (!d.active || d.pointerId !== ev.pointerId) return;
      d.active = false;
      d.pointerId = null;
      setAiSheetDragging(false);

      const dy = Math.max(0, ev.clientY - d.startY);
      const shouldClose = dy > 90;
      if (shouldClose) {
        closeAiPanel();
        return;
      }
      setAiSheetDragY(0);
    },
    [closeAiPanel]
  );

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

  const boardTitle = String(
    workspace?.name ?? workspace?.title ?? workspace?.deskName ?? workspace?.Desk?.name ?? workspace?.Board?.name ?? 'Untitled'
  );

  const shareBoard = async () => {
    try {
      const url = typeof window !== 'undefined' ? window.location.href : '';
      if (typeof navigator !== 'undefined' && navigator.share) {
        await navigator.share({ title: boardTitle, url });
        return;
      }
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
      }
    } catch {
      // ignore share errors
    }
  };

  return (
    <div className={styles.page}>
      {isMobile ? (
        <header className={`${styles.mobileTopBar} ${searchOpen ? styles.mobileTopBarSearch : ''}`}>
          {!searchOpen ? (
            <div className={styles.mobileTopPill} role="banner" aria-label="Board header">
              <Link to="/home" className={styles.mobileTopIconBtn} aria-label="Home">
                <Home size={20} />
              </Link>
              <div className={styles.mobileBoardTitle} title={boardTitle}>
                {boardTitle}
              </div>
              <button
                type="button"
                className={styles.mobileTopIconBtn}
                aria-label="Search"
                ref={searchBtnRef}
                onClick={() => setSearchOpen(true)}
              >
                <Search size={20} />
              </button>
              <div className={styles.mobileAvatarWrap} aria-label="Profile">
                <UserMenu variant="bare" />
              </div>
              <button type="button" className={styles.mobileTopIconBtn} aria-label="Share board" onClick={shareBoard}>
                <Share2 size={20} />
              </button>
              <button type="button" className={styles.mobileTopIconBtn} aria-label="Board settings">
                <MoreVertical size={20} />
              </button>
            </div>
          ) : (
            <div ref={mobileSearchBarRef} className={styles.mobileSearchBar} role="search" aria-label="Search">
              <Search size={20} className={styles.mobileSearchIcon} aria-hidden="true" />
              <input
                ref={searchInputRef}
                className={styles.mobileSearchInput}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search"
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    e.preventDefault();
                    setSearchOpen(false);
                  }
                }}
              />
              <button
                type="button"
                className={styles.mobileSearchClose}
                aria-label="Close search"
                onClick={() => setSearchOpen(false)}
              >
                <X size={22} />
              </button>
            </div>
          )}
        </header>
      ) : (
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
          <IconBtn
            label="AI Chat"
            title="Чат с ИИ"
            onClick={() => {
              setAiPanelOpen((v) => !v);
              setCommentsPanel(null);
              setActionError(null);
            }}
            className={aiPanelOpen ? styles.iconBtnActive : ''}
          >
            <MessageCircle size={18} />
          </IconBtn>
          <IconBtn label="Notifications">
            <Bell size={18} />
          </IconBtn>
          <UserMenu variant="compact" />
        </div>
      </header>
      )}

      <div className={styles.body}>
        {isMobile && !mobileToolsOpen ? (
          <div className={styles.mobileUndoRedo} aria-label="History">
            <button
              type="button"
              className={styles.mobileUndoRedoBtn}
              aria-label="Undo"
              onClick={undo}
              disabled={!historyMeta.canUndo}
            >
              <Undo2 size={18} />
            </button>
            <button
              type="button"
              className={styles.mobileUndoRedoBtn}
              aria-label="Redo"
              onClick={redo}
              disabled={!historyMeta.canRedo}
            >
              <Redo2 size={18} />
            </button>
          </div>
        ) : null}

        {isMobile && searchOpen ? (
          <div
            className={styles.mobileSearchDismiss}
            role="presentation"
            onPointerDown={() => setSearchOpen(false)}
          />
        ) : null}

        {!isMobile ? (
          <aside className={styles.leftRail} aria-label="Tools">
            <div className={styles.toolsPanel}>
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
            </div>

            <div className={styles.historyPanel} aria-label="History">
              <button
                type="button"
                className={styles.historyBtn}
                aria-label="Undo"
                title={`Undo (${formatShortcut(shortcuts['history.undo'] || DEFAULT_SHORTCUTS['history.undo'])})`}
                onClick={undo}
                disabled={!historyMeta.canUndo}
              >
                <Undo2 size={18} />
              </button>
              <button
                type="button"
                className={styles.historyBtn}
                aria-label="Redo"
                title={`Redo (${formatShortcut(shortcuts['history.redo'] || DEFAULT_SHORTCUTS['history.redo'])})`}
                onClick={redo}
                disabled={!historyMeta.canRedo}
              >
                <Redo2 size={18} />
              </button>
            </div>
          </aside>
        ) : (
          <>
            {!mobileToolsOpen ? (
              <div className={styles.mobileFabWrap}>
                <button
                  type="button"
                  className={`${styles.mobileFabBtn} ${aiPanelOpen ? styles.mobileFabBtnActive : ''}`}
                  aria-label="Open AI chat"
                  aria-pressed={aiPanelOpen}
                  title="Чат с ИИ"
                  onClick={() => {
                    setAiPanelOpen(true);
                    setMobileToolsOpen(false);
                    setMobileSheetDragY(0);
                    setMobileSheetDragging(false);
                    setCommentsPanel(null);
                    setActionError(null);
                  }}
                >
                  <MessageCircle size={22} />
                </button>
                <button
                  type="button"
                  className={styles.mobileFabBtn}
                  aria-label="Open tools"
                  aria-expanded={mobileToolsOpen}
                  onClick={() => setMobileToolsOpen(true)}
                >
                  <Plus size={22} />
                </button>
              </div>
            ) : null}

            {mobileToolsOpen ? (
              <div
                className={styles.mobileSheetOverlay}
                role="presentation"
                onPointerDown={() => {
                  setMobileToolsOpen(false);
                  setMobileSheetDragY(0);
                  setMobileSheetDragging(false);
                }}
              >
                <div
                  ref={mobileSheetRef}
                  className={`${styles.mobileSheet} ${mobileSheetDragging ? styles.mobileSheetDragging : ''}`}
                  role="dialog"
                  aria-label="Tools"
                  onPointerDown={(ev) => ev.stopPropagation()}
                  onPointerMove={onMobileSheetDragMove}
                  onPointerUp={onMobileSheetDragEnd}
                  onPointerCancel={onMobileSheetDragEnd}
                  style={{ transform: `translateY(${mobileSheetDragY}px)` }}
                >
                  <div
                    className={styles.mobileSheetHandle}
                    aria-hidden="true"
                    onPointerDown={onMobileSheetDragStart}
                  />

                  <div className={styles.mobileToolGrid}>
                    {TOOLS.filter(({ id: toolId }) => toolId !== 'hand').map(({ id: toolId, label, Icon }) => {
                      const isActive = toolId !== 'attach' && activeTool === toolId;
                      return (
                        <button
                          key={toolId}
                          type="button"
                          className={`${styles.mobileToolItem} ${isActive ? styles.mobileToolItemActive : ''}`}
                          aria-label={label}
                          aria-pressed={isActive}
                          onClick={() => {
                            if (toolId === 'attach') {
                              openAttachDialog();
                              setMobileToolsOpen(false);
                              return;
                            }
                            setActionError(null);
                            setActiveTool(toolId);
                            if (toolId !== 'pen' && toolId !== 'link') setMobileToolsOpen(false);
                          }}
                        >
                          <span className={styles.mobileToolIcon} aria-hidden="true">
                            {toolId === 'attach' && uploading ? (
                              <Loader2 size={20} className={styles.spinner} />
                            ) : (
                              <Icon size={20} />
                            )}
                          </span>
                        </button>
                      );
                    })}
                  </div>

                  {activeTool === 'link' ? (
                    <div className={styles.mobileToolSection}>
                      <div className={styles.mobileToolSectionTitle}>Link</div>
                      <div className={styles.mobileLinkRow}>
                        <input
                          className={styles.mobileLinkInput}
                          placeholder="Paste URL…"
                          value={linkDraftUrl}
                          disabled={creatingLink}
                          onChange={(ev) => setLinkDraftUrl(ev.target.value)}
                          onKeyDown={(ev) => {
                            if (ev.key === 'Escape') {
                              ev.preventDefault();
                              setLinkDraftUrl('');
                              setActiveTool('select');
                              setMobileToolsOpen(false);
                              return;
                            }
                            if (ev.key === 'Enter' && !ev.shiftKey) {
                              ev.preventDefault();
                              const ok = Boolean(normalizeUrlClient(linkDraftUrl));
                              if (!ok) return;
                              submitLink();
                              setMobileToolsOpen(false);
                            }
                          }}
                        />
                        <button
                          type="button"
                          className={styles.mobileLinkBtn}
                          disabled={!normalizeUrlClient(linkDraftUrl) || creatingLink}
                          onClick={() => {
                            const ok = Boolean(normalizeUrlClient(linkDraftUrl));
                            if (!ok) return;
                            submitLink();
                            setMobileToolsOpen(false);
                          }}
                        >
                          Add
                        </button>
                      </div>
                    </div>
                  ) : null}

                  {activeTool === 'pen' ? (
                    <div className={styles.mobileToolSection}>
                      <div className={styles.mobileToolSectionTitle}>Brush</div>
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
                    </div>
                  ) : null}
                </div>
              </div>
            ) : null}
          </>
        )}
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
          onWheel={onCanvasWheel}
          style={{
            '--canvas-cursor': effectiveCursor,
            '--note-bg': `url(${note2Img})`,
          }}
        >
          <div className={styles.grid} />
          {actionError ? <div className={styles.actionError}>{actionError}</div> : null}
          <div className={styles.boardContent}>
            <ConnectorsLayer
              connectors={connectorElements}
              connectorDraft={connectorDraft}
              selectedConnectorId={selectedConnectorId}
              onSelectConnector={onSelectConnector}
              startConnectorBendDrag={startConnectorBendDragEv}
              computeConnectorPathFromAnchors={computeConnectorPathFromAnchors}
              getAnchorPoint={getLiveAnchorPoint}
              active={connectorsFollowDuringDrag}
            />

            {elements.map((el) => {
              if (el?.type === 'connector') return null;
              if (el?.type === 'drawing') {
                const data = el.drawing?.data || el.Drawing?.data || {};
                const pts = Array.isArray(data?.points) ? data.points : [];
                const strokeColor = String(data?.color || '#0f172a');
                const strokeW = Number(data?.width ?? 4);
                const path = pointsToSvgPath(pts);
                const drag = interactionRef.current;
                const dragPos = drag?.kind === 'drag' && sameId(drag.elementId, el.id) ? drag.latest : null;
                const dx = Number(dragPos?.x ?? (el.x ?? 0));
                const dy = Number(dragPos?.y ?? (el.y ?? 0));
                const isSelected = selectedElementIds.has(idKey(el.id));
                return (
                  <div
                    key={el.id}
                    data-element-id={el.id}
                    className={`${styles.element} ${styles.drawingElement}`}
                    ref={(node) => registerElementNode(el.id, node)}
                    style={{
                        left: 0,
                        top: 0,
                      width: el.width ?? 10,
                      height: el.height ?? 10,
                      zIndex: el.zIndex ?? 0,
                      transform: `translate3d(${dx}px, ${dy}px, 0) rotate(${el.rotation ?? 0}deg)`,
                    }}
                    onPointerDown={(ev) => onElementPointerDown(el.id, ev)}
                    onClick={(ev) => {
                      if (activeTool === 'hand' || activeTool === 'pen' || activeTool === 'eraser' || activeTool === 'connector') return;
                      ev.stopPropagation();
                      setSelectedElementIds(new Set([idKey(el.id)]));
                      setEditingElementId(null);
                    }}
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

                    {isSelected ? (
                      <div className={styles.transformBox}>
                        <div className={styles.elementActions}>
                          <button
                            type="button"
                            className={styles.deleteElementBtn}
                            onPointerDown={(ev) => {
                              ev.preventDefault();
                              ev.stopPropagation();
                              handleDeleteElement(el);
                            }}
                            disabled={sameId(deletingElementId, el.id)}
                            aria-label="Delete element"
                            title="Delete element"
                          >
                            {sameId(deletingElementId, el.id) ? (
                              <Loader2 size={16} className={styles.spinner} />
                            ) : (
                              <Trash2 size={16} />
                            )}
                          </button>
                        </div>
                        <div
                          className={`${styles.resizeHandle} ${styles.hNW}`}
                          onPointerDown={(ev) => startResize(el.id, 'nw', ev)}
                        />
                        <div className={`${styles.resizeHandle} ${styles.hN}`} onPointerDown={(ev) => startResize(el.id, 'n', ev)} />
                        <div
                          className={`${styles.resizeHandle} ${styles.hNE}`}
                          onPointerDown={(ev) => startResize(el.id, 'ne', ev)}
                        />
                        <div className={`${styles.resizeHandle} ${styles.hE}`} onPointerDown={(ev) => startResize(el.id, 'e', ev)} />
                        <div
                          className={`${styles.resizeHandle} ${styles.hSE}`}
                          onPointerDown={(ev) => startResize(el.id, 'se', ev)}
                        />
                        <div className={`${styles.resizeHandle} ${styles.hS}`} onPointerDown={(ev) => startResize(el.id, 's', ev)} />
                        <div
                          className={`${styles.resizeHandle} ${styles.hSW}`}
                          onPointerDown={(ev) => startResize(el.id, 'sw', ev)}
                        />
                        <div className={`${styles.resizeHandle} ${styles.hW}`} onPointerDown={(ev) => startResize(el.id, 'w', ev)} />
                      </div>
                    ) : null}
                  </div>
                );
              }

              if (el?.type === 'note' || el?.type === 'text') {
                const isEditing = editingElementId === el.id;
                const isSelected = selectedElementIds.has(idKey(el.id));
                const drag = interactionRef.current;
                const dragPos = drag?.kind === 'drag' && sameId(drag.elementId, el.id) ? drag.latest : null;
                return (
                  <NoteTextElement
                    key={el.id}
                    el={el}
                    isSelected={isSelected}
                    isEditing={isEditing}
                    dragX={dragPos?.x ?? null}
                    dragY={dragPos?.y ?? null}
                    commentsEnabled={commentsEnabled}
                    deletingElementId={deletingElementId}
                    searchQuery={searchQuery}
                    isSearchHit={hasSearchQuery && manualSearchHitIds.has(el.id)}
                    activeTool={activeTool}
                    connectorHoverElementId={connectorHoverElementId}
                    connectorFromElementId={connectorDraft?.from?.elementId ?? null}
                    connectorToHoverElementId={connectorDraft?.toHover?.elementId ?? null}
                    registerNode={registerElementNode}
                    actions={noteTextActions}
                  />
                );
              }

              const isEditing = editingElementId === el.id;
              const isSelected = selectedElementIds.has(idKey(el.id));
              const isDocument = el.type === 'document';
              const isLink = el.type === 'link';
              const showConnectorEndpoints =
                isSelected ||
                (activeTool === 'connector' && connectorHoverElementId === el.id) ||
                (connectorDraft?.from?.elementId === el.id || connectorDraft?.toHover?.elementId === el.id);
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
              const isPhotoDoc = Boolean(docUrl) && isPhotoExt(docExt);

              const link = isLink ? el.link ?? el.Link : null;
              const linkUrl = link?.url || '';
              const linkTitle = fixMojibakeNameClient(link?.title || safeHostname(linkUrl) || linkUrl || 'Link');
              const linkPreview = link?.previewImageUrl || '';
              const linkHost = safeHostname(linkUrl);

              const reactionBubbles = layoutReactionBubbles(el.id, el.reactions);
              const drag = interactionRef.current;
              const dragPos = drag?.kind === 'drag' && sameId(drag.elementId, el.id) ? drag.latest : null;
              const ex = Number(dragPos?.x ?? (el.x ?? 0));
              const ey = Number(dragPos?.y ?? (el.y ?? 0));

              return (
                <div
                  key={el.id}
                  data-element-id={el.id}
                  className={styles.element}
                  ref={(node) => registerElementNode(el.id, node)}
                  style={{
                      left: 0,
                      top: 0,
                    width: el.width ?? 240,
                    height: el.height ?? 160,
                    zIndex: el.zIndex ?? 0,
                      transform: `translate3d(${ex}px, ${ey}px, 0) rotate(${el.rotation ?? 0}deg)`,
                  }}
                  onPointerDown={(ev) => onElementPointerDown(el.id, ev)}
                  onClick={(ev) => onElementClick(el.id, ev)}
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
                      isPhotoDoc ? (
                        <div className={styles.photoCard} aria-label={docTitle}>
                          <img className={styles.photoImg} src={docUrl} alt={docTitle} draggable={false} />
                        </div>
                      ) : (
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
                      )
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
                          if (ev.key === 'Escape') {
                            ev.preventDefault();
                            ev.stopPropagation();
                            await endEditing();
                            return;
                          }
                          if (ev.key === 'Enter' && !ev.shiftKey) {
                            ev.preventDefault();
                            await endEditing();
                          }
                        }}
                        onBlur={(ev) => {
                          // Exit edit mode when focus leaves the element entirely (e.g. clicking toolbar).
                          const next = ev.relatedTarget;
                          if (next && next.closest?.(`[data-element-id="${el.id}"]`)) return;
                          if (editingElementId === el.id) endEditing();
                        }}
                      />
                    ) : (
                      <div className={displayTextClass}>
                        {renderHighlightedText(el.content ?? '', searchQuery, styles.searchMark)}
                      </div>
                    )}
                  </div>

                  {showConnectorEndpoints ? (
                    <div className={styles.connectorEndpointsBox} aria-hidden="true">
                      <div
                        className={`${styles.connectorEndpoint} ${styles.epTop}`}
                        onPointerDown={(ev) => startConnectorDrag(el.id, 'top', ev)}
                      />
                      <div
                        className={`${styles.connectorEndpoint} ${styles.epRight}`}
                        onPointerDown={(ev) => startConnectorDrag(el.id, 'right', ev)}
                      />
                      <div
                        className={`${styles.connectorEndpoint} ${styles.epBottom}`}
                        onPointerDown={(ev) => startConnectorDrag(el.id, 'bottom', ev)}
                      />
                      <div
                        className={`${styles.connectorEndpoint} ${styles.epLeft}`}
                        onPointerDown={(ev) => startConnectorDrag(el.id, 'left', ev)}
                      />
                    </div>
                  ) : null}

                  {reactionBubbles.length ? (
                    <div className={styles.reactionsLayer} aria-label="Reactions">
                      {reactionBubbles.map((b) => (
                        <button
                          key={b.emoji}
                          type="button"
                          className={`${styles.reactionBubble} ${b.count === 1 ? styles.reactionSolo : ''}`}
                          data-side={b.side}
                          style={{
                            left: `${b.xPct}%`,
                            top: `${b.yPct}%`,
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

                  {isSelected ? (
                    <div className={styles.transformBox}>
                      <div className={styles.elementActions}>
                        <button
                          type="button"
                          className={styles.deleteElementBtn}
                          onPointerDown={(ev) => {
                            ev.preventDefault();
                            ev.stopPropagation();
                            handleDeleteElement(el);
                          }}
                          disabled={sameId(deletingElementId, el.id)}
                          aria-label="Delete element"
                          title="Delete element"
                        >
                          {sameId(deletingElementId, el.id) ? (
                            <Loader2 size={16} className={styles.spinner} />
                          ) : (
                            <Trash2 size={16} />
                          )}
                        </button>
                      </div>
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

        {!isMobile ? (
          <div className={styles.zoom}>
            <button
              type="button"
              className={styles.zoomBtn}
              onClick={() => {
                const node = canvasRef.current;
                if (!node) return;
                const rect = node.getBoundingClientRect();
                const p = { x: rect.width / 2, y: rect.height / 2 };
                const off = viewOffsetRef.current;
                const curScale = viewScaleRef.current || 1;
                const nextScale = clampViewScale(curScale / 1.12);
                const d = { x: (p.x - off.x) / curScale, y: (p.y - off.y) / curScale };
                const nextOffset = { x: p.x - d.x * nextScale, y: p.y - d.y * nextScale };
                scheduleApplyViewVars({ offset: nextOffset, scale: nextScale });
                setViewOffset(nextOffset);
                persistViewDebounced({ offset: nextOffset, scale: nextScale });
              }}
              aria-label="Zoom out"
              title="Zoom out"
            >
              −
            </button>
            <div ref={zoomPctRef} className={styles.zoomPct}>
              100%
            </div>
            <button
              type="button"
              className={styles.zoomBtn}
              onClick={() => {
                const node = canvasRef.current;
                if (!node) return;
                const rect = node.getBoundingClientRect();
                const p = { x: rect.width / 2, y: rect.height / 2 };
                const off = viewOffsetRef.current;
                const curScale = viewScaleRef.current || 1;
                const nextScale = clampViewScale(curScale * 1.12);
                const d = { x: (p.x - off.x) / curScale, y: (p.y - off.y) / curScale };
                const nextOffset = { x: p.x - d.x * nextScale, y: p.y - d.y * nextScale };
                scheduleApplyViewVars({ offset: nextOffset, scale: nextScale });
                setViewOffset(nextOffset);
                persistViewDebounced({ offset: nextOffset, scale: nextScale });
              }}
              aria-label="Zoom in"
              title="Zoom in"
            >
              +
            </button>
          </div>
        ) : null}
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

      {aiPanelOpen ? (
        isMobile ? (
          <div
            className={styles.aiSheetOverlay}
            role="presentation"
            onPointerDown={() => {
              closeAiPanel();
            }}
          >
            <div
              ref={aiSheetRef}
              className={`${styles.aiSheet} ${aiSheetDragging ? styles.aiSheetDragging : ''}`}
              role="dialog"
              aria-label="AI chat"
              onPointerDown={(ev) => ev.stopPropagation()}
              onPointerMove={onAiSheetDragMove}
              onPointerUp={onAiSheetDragEnd}
              onPointerCancel={onAiSheetDragEnd}
              style={{ transform: `translateY(${aiSheetDragY}px)` }}
            >
              <div className={styles.aiSheetHandle} aria-hidden="true" onPointerDown={onAiSheetDragStart} />

              <div className={styles.aiSheetHeader}>
                <div className={styles.aiSheetHeaderTitle}>
                  <div className={styles.aiSheetName}>{aiStatus?.model || aiStatus?.provider || 'Sidekick'}</div>
                  <span className={styles.aiSheetBeta}>Beta</span>
                </div>
                <div className={styles.aiSheetHeaderActions}>
                  <button
                    type="button"
                    className={styles.aiSheetIconBtn}
                    aria-label="New chat"
                    title="Новый чат"
                    disabled={aiSending}
                    onClick={() => {
                      setAiMessages([]);
                      setAiDraft('');
                      setAiError(null);
                      window.setTimeout(() => aiInputRef.current?.focus?.(), 0);
                    }}
                  >
                    <PenLine size={18} />
                  </button>
                  <button
                    type="button"
                    className={styles.aiSheetIconBtn}
                    onClick={() => closeAiPanel()}
                    aria-label="Close AI chat"
                    title="Закрыть"
                  >
                    <X size={18} />
                  </button>
                </div>
              </div>

              <div className={styles.aiSheetMeta}>
                {aiStatus?.enabled
                  ? `Подключено: ${aiStatus?.provider || 'unknown'}${aiStatus?.model ? ` · ${aiStatus.model}` : ''}`
                  : 'AI выключен (нужен AI_PROVIDER=ollama на сервере)'}
              </div>

              <div ref={aiListRef} className={styles.aiMessages} aria-label="AI messages">
                {aiMessages.length ? (
                  <>
                    {aiMessages.map((m) => (
                      <div
                        key={m.id}
                        className={`${styles.aiMsgRow} ${m.role === 'user' ? styles.aiMsgRowUser : styles.aiMsgRowAssistant}`}
                      >
                        <div className={`${styles.aiBubble} ${m.role === 'user' ? styles.aiBubbleUser : styles.aiBubbleAssistant}`}>
                          {String(m.content ?? '')}
                        </div>
                      </div>
                    ))}
                    {aiSending ? (
                      <div className={`${styles.aiMsgRow} ${styles.aiMsgRowAssistant}`}>
                        <div className={`${styles.aiBubble} ${styles.aiBubbleAssistant}`}>
                          {(aiStatus?.model || aiStatus?.provider || 'Sidekick')} is thinking…
                        </div>
                      </div>
                    ) : null}
                  </>
                ) : (
                  <div className={styles.aiIntro}>
                    <div className={styles.aiIntroTop}>
                      <span className={styles.aiIntroIcon} aria-hidden="true">
                        <Spline size={18} />
                      </span>
                      <div className={styles.aiIntroTitle}>Привет! Я помогу с доской.</div>
                    </div>
                    <div className={styles.aiIntroText}>
                      Пока функционал небольшой: отвечаю по текстовому слепку элементов и могу суммаризировать, предлагать задачи и планы.
                    </div>
                  </div>
                )}
              </div>

              <div className={styles.aiComposer}>
                {aiError ? <div className={styles.aiError}>{aiError}</div> : null}

                <div className={styles.aiPromptRow} aria-label="Prompt suggestions">
                  {AI_PROMPT_SUGGESTIONS.map((p) => (
                    <button
                      key={p.label}
                      type="button"
                      className={styles.aiPromptChip}
                      onClick={() => sendAiMessage(p.prompt)}
                      disabled={aiSending || !deskIdNum}
                      title={p.prompt}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>

                <div className={styles.aiSendRow}>
                  <textarea
                    ref={aiInputRef}
                    className={styles.aiInput}
                    value={aiDraft}
                    placeholder="Введите сообщение…"
                    onChange={(ev) => setAiDraft(ev.target.value)}
                    onKeyDown={(ev) => {
                      if (ev.key === 'Escape') {
                        ev.preventDefault();
                        closeAiPanel();
                        return;
                      }
                      if (ev.key === 'Enter' && !ev.shiftKey) {
                        ev.preventDefault();
                        sendAiMessage();
                      }
                    }}
                  />
                  <button
                    type="button"
                    className={`${styles.aiSendBtn} ${styles.aiSendBtnIcon}`}
                    onClick={() => sendAiMessage()}
                    disabled={aiSending || !String(aiDraft || '').trim() || !deskIdNum}
                    aria-label="Send"
                    title="Отправить"
                  >
                    {aiSending ? <Square size={16} /> : <ArrowUp size={16} />}
                  </button>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div
            className={styles.aiPanel}
            role="dialog"
            aria-label="AI chat"
            onPointerDown={(ev) => ev.stopPropagation()}
          >
            <div className={styles.aiPanelHeader}>
              <div className={styles.aiPanelTitle}>AI чат</div>
              <button
                type="button"
                className={styles.aiPanelClose}
                onClick={() => setAiPanelOpen(false)}
                aria-label="Close AI chat"
                title="Закрыть"
              >
                <X size={18} />
              </button>
            </div>

            <div className={styles.aiPanelMeta}>
              {aiStatus?.enabled
                ? `provider: ${aiStatus?.provider || 'unknown'}${aiStatus?.model ? ` · model: ${aiStatus.model}` : ''}`
                : 'AI выключен (нужен AI_PROVIDER=ollama на сервере)'}
            </div>

            <div ref={aiListRef} className={styles.aiMessages} aria-label="AI messages">
              {aiMessages.length ? (
                aiMessages.map((m) => (
                  <div
                    key={m.id}
                    className={`${styles.aiMsgRow} ${m.role === 'user' ? styles.aiMsgRowUser : styles.aiMsgRowAssistant}`}
                  >
                    <div className={`${styles.aiBubble} ${m.role === 'user' ? styles.aiBubbleUser : styles.aiBubbleAssistant}`}>
                      {String(m.content ?? '')}
                    </div>
                  </div>
                ))
              ) : (
                <div className={styles.aiEmpty}>
                  Напишите вопрос — ИИ увидит текстовый слепок элементов доски и сможет объяснить/суммаризировать.
                </div>
              )}
            </div>

            <div className={styles.aiComposer}>
              {aiError ? <div className={styles.aiError}>{aiError}</div> : null}
              <div className={styles.aiQuickRow}>
                <button
                  type="button"
                  className={styles.aiQuickBtn}
                  onClick={() => sendAiMessage('Сделай краткую суммаризацию контента доски и выдели ключевые темы.')}
                  disabled={aiSending || !deskIdNum}
                >
                  Суммаризация
                </button>
                <button
                  type="button"
                  className={styles.aiQuickBtn}
                  onClick={() => {
                    setAiMessages([]);
                    setAiError(null);
                  }}
                  disabled={aiSending}
                >
                  Очистить
                </button>
              </div>
              <div className={styles.aiSendRow}>
                <textarea
                  ref={aiInputRef}
                  className={styles.aiInput}
                  value={aiDraft}
                  placeholder="Спросить ИИ…"
                  onChange={(ev) => setAiDraft(ev.target.value)}
                  onKeyDown={(ev) => {
                    if (ev.key === 'Escape') {
                      ev.preventDefault();
                      setAiPanelOpen(false);
                      return;
                    }
                    if (ev.key === 'Enter' && !ev.shiftKey) {
                      ev.preventDefault();
                      sendAiMessage();
                    }
                  }}
                />
                <button
                  type="button"
                  className={styles.aiSendBtn}
                  onClick={() => sendAiMessage()}
                  disabled={aiSending || !String(aiDraft || '').trim() || !deskIdNum}
                >
                  {aiSending ? <Loader2 size={16} className={styles.spinner} /> : 'Отправить'}
                </button>
              </div>
            </div>
          </div>
        )
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
