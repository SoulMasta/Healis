import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { io } from 'socket.io-client';
import {
  ArrowUp,
  ArrowLeft,
  Bell,
  ChevronDown,
  Eraser,
  Home,
  Share2,
  Spline,
  MessageCircle,
  Plus,
  PenLine,
  Search,
  Square,
  Loader2,
  Trash2,
  Undo2,
  Redo2,
  X,
} from 'lucide-react';
import { getHealth } from '../http/health';
import { getWorkspace } from '../http/workspaceAPI';
import { getToken, refreshAuth } from '../http/userAPI';
import { getApiBaseUrl, getSocketBaseUrl } from '../config/runtime';
import {
  createElementOnDesk,
  updateElement,
  deleteElement,
  uploadFileToDesk,
  getLinkPreview,
} from '../http/elementsAPI';
import {
  getMaterialBlocksByDesk,
  createMaterialBlock,
  updateMaterialBlock,
  deleteMaterialBlock,
} from '../http/materialBlocksAPI';
import { MaterialBlockModal } from '../components/materialBlock';
import UserMenu from '../components/UserMenu';
import MembersMenu from '../components/MembersMenu';
import { useBreakpoints } from '../hooks/useBreakpoints';
import styles from '../styles/WorkspacePage.module.css';
import note2Img from '../static/note2.png';
import { DEFAULT_SHORTCUTS, formatShortcut, loadShortcuts, matchShortcut } from '../utils/shortcuts';
import { makeSnippet } from '../utils/boardSearch';
import { useWorkspace, idKey, sameId, normalizeElementId, upsertById } from '../workspace/useWorkspace';
import { useCanvasViewportState } from '../workspace/Canvas';
import { useElementFrame } from '../components/board/useElementFrame';
import { useBlockFrame } from '../components/board/useBlockFrame';
import { ElementRenderer } from '../components/board/ElementRenderer';
import {
  pointsToSvgPath,
  getExt,
  isPhotoExt,
  safeHostname,
  normalizeUrlClient,
  renderHighlightedText,
  TEXT_PREVIEW_EXTS,
} from '../utils/boardRenderUtils';
import { resolvePublicFileUrl, fetchTextPreview } from '../utils/urlUtils';
import { readImageSizeFromFile, downloadBlob, fetchFileBlob } from '../utils/fileUtils';
import { useEvent } from '../hooks/useEvent';
import IconBtn from '../components/ui/IconBtn';
import { TOOLS, BRUSH_COLORS, QUICK_REACTIONS, AI_PROMPT_SUGGESTIONS } from '../constants/workspace';
import {
  useWorkspaceSearch,
  useReactions,
  useCommentsPanel,
  useAiPanel,
  useWorkspaceHistory,
  useConnectors,
} from '../workspace/hooks';
import { useToolManager } from '../workspace/toolbar/useToolManager';
import Toolbar from '../components/toolbar/Toolbar';

// NoteTextElement and ConnectorsLayer moved to ElementRenderer.jsx

export default function WorkspacePage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { isMobile } = useBreakpoints();
  const apiBaseUrl = useMemo(() => getApiBaseUrl(), []);
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
  const connectorsRef = useRef(null);
  const createNoteOrTextAtDeskPointRef = useRef(null);
  const createFrameAtDeskRectRef = useRef(null);
  const endEditingRef = useRef(null);
  const workspaceState = useWorkspace();
  const { elements, editingElementId, setEditingElementId, setElements, load: loadElements, dedupe: dedupeElements } =
    workspaceState;
  const [selectedElementIds, setSelectedElementIds] = useState(() => new Set()); // Set<string(idKey)>
  const [deletingElementId, setDeletingElementId] = useState(null); // stored as string key
  const [docTextPreview, setDocTextPreview] = useState({});
  const [presentUserIds, setPresentUserIds] = useState([]);
  const [shortcuts, setShortcuts] = useState(() => loadShortcuts());
  const [mobileToolsOpen, setMobileToolsOpen] = useState(false);
  const [mobileSheetDragY, setMobileSheetDragY] = useState(0);
  const [mobileSheetDragging, setMobileSheetDragging] = useState(false);
  const [mobileBrushBarOpen, setMobileBrushBarOpen] = useState(false);
  const [mobileLinkOpen, setMobileLinkOpen] = useState(false);
  const [mobileMembersOpen, setMobileMembersOpen] = useState(false);

  const [materialBlocks, setMaterialBlocks] = useState([]);
  const [materialBlockModal, setMaterialBlockModal] = useState(null);
  const [selectedMaterialBlockId, setSelectedMaterialBlockId] = useState(null);
  const [materialBlockDragOffset, setMaterialBlockDragOffset] = useState({});
  const [elementResizeOffset, setElementResizeOffset] = useState({});
  const materialBlockInteractionRef = useRef(null);
  const materialBlocksRef = useRef(materialBlocks);
  materialBlocksRef.current = materialBlocks;

  // Safety net: reconcile duplicates only when list size changes (avoid per-frame work during drag).
  useEffect(() => {
    dedupeElements();
  }, [elements.length, dedupeElements]);

  const commentsEnabled = Boolean(workspace?.groupId);

  const deskIdKey = useMemo(() => idKey(workspace?.id ?? workspace?.deskId ?? id), [workspace?.id, workspace?.deskId, id]);
  const deskIdNum = useMemo(() => {
    const n = Number(workspace?.id ?? workspace?.deskId ?? id);
    return Number.isFinite(n) ? n : null;
  }, [workspace?.id, workspace?.deskId, id]);

  const viewport = useCanvasViewportState(deskIdKey, deskIdNum, loading);
  const canvasRef = viewport.canvasRef;
  const zoomPctRef = viewport.zoomPctRef;
  const viewOffsetRef = viewport.viewOffsetRef;
  const viewScaleRef = viewport.viewScaleRef;
  const getDeskPointFromClient = viewport.getDeskPointFromClient;
  const scheduleApplyViewVars = viewport.scheduleApplyViewVars;
  const persistViewDebounced = viewport.persistViewDebounced;
  const setViewOffset = viewport.setViewOffset;
  const isPanning = viewport.isPanning;
  const panStartRef = viewport.panStartRef;
  const mobilePinchRef = viewport.mobilePinchRef;

  const {
    searchOpen,
    setSearchOpen,
    searchQuery,
    setSearchQuery,
    hasSearchQuery,
    manualSearchHitIds,
    manualSearchResults,
    searchBtnRef,
    searchPopoverRef,
    searchInputRef,
    mobileSearchBarRef,
  } = useWorkspaceSearch({ elements, isMobile });

  const {
    reactionPicker,
    setReactionPicker,
    reactionCustomEmoji,
    setReactionCustomEmoji,
    reactionPickerRef,
    normalizeReactions,
    layoutReactionBubbles,
    openReactionPicker,
    toggleReaction,
  } = useReactions({
    setElements,
    socketRef,
    workspace,
    deskIdParam: id,
    setActionError,
    sameId,
  });

  const {
    commentsPanel,
    setCommentsPanel,
    commentDraft,
    setCommentDraft,
    commentsByElement,
    setCommentsByElement,
    commentsLoading,
    commentInputRef,
    commentsListRef,
    commentsSheetRef,
    commentsSheetDragY,
    commentsSheetDragging,
    openComments,
    submitComment,
    closeCommentsPanel,
    onCommentsSheetDragStart,
    onCommentsSheetDragMove,
    onCommentsSheetDragEnd,
  } = useCommentsPanel({ commentsEnabled, setActionError });

  const {
    aiPanelOpen,
    setAiPanelOpen,
    aiStatus,
    aiMessages,
    setAiMessages,
    aiDraft,
    setAiDraft,
    aiSending,
    aiError,
    aiInputRef,
    aiListRef,
    aiSheetRef,
    aiSheetDragY,
    aiSheetDragging,
    setAiError,
    sendAiMessage,
    closeAiPanel,
    onAiSheetDragStart,
    onAiSheetDragMove,
    onAiSheetDragEnd,
  } = useAiPanel({ deskIdNum, setActionError });

  const inputDebugEnabled = useMemo(() => {
    try {
      const qs = new URLSearchParams(window.location.search);
      if (qs.get('inputDebug') === '1') return true;
      if (window.localStorage.getItem('healis.inputDebug') === '1') return true;
    } catch {
      // ignore
    }
    return false;
  }, []);

  const [inputDebugText, setInputDebugText] = useState('');
  const inputDebugLinesRef = useRef([]);
  const inputDebugFlushRafRef = useRef(null);
  const inputDebugLastFlushRef = useRef(0);
  const inputDebugLastMoveLogRef = useRef(new Map()); // pointerId -> ts

  const interactionRef = useRef(null);
  const suppressNextElementClickRef = useRef(new Set());
  const mobileSuppressDragPointerIdRef = useRef(null);
  const fetchingPreviewsRef = useRef(new Set());
  const editStartSnapRef = useRef(new Map()); // elementId -> snapshot
  const endingEditRef = useRef(false);
  const editingElementIdRef = useRef(null);
  const elementNodeCacheRef = useRef(new Map()); // idKey(elementId) -> HTMLElement
  const elementsRef = useRef(elements);
  elementsRef.current = elements;
  const materialBlockNodeRef = useRef(new Map()); // blockId -> HTMLElement
  const updateLocalElementRef = useRef(null);
  const mobileSheetRef = useRef(null);
  const mobileSheetDragRef = useRef({ active: false, pointerId: null, startY: 0, lastY: 0 });
  const mobileLongPressRef = useRef({ timerId: null, pointerId: null, elementId: null });

  useEffect(() => {
    if (!isMobile) setMobileToolsOpen(false);
  }, [isMobile]);



  useEffect(() => {
    if (!isMobile) return;
    if (mobileToolsOpen) setSearchOpen(false);
  }, [isMobile, mobileToolsOpen, setSearchOpen]);

  useEffect(() => {
    if (!isMobile) return;
    if (searchOpen) setMobileToolsOpen(false);
  }, [isMobile, searchOpen]);


  useEffect(() => {
    editingElementIdRef.current = editingElementId;
  }, [editingElementId]);

  const pushInputDebug = useCallback(
    (tag, data = null) => {
      if (!inputDebugEnabled) return;
      const ts = Math.round(performance.now());
      let payload = '';
      try {
        payload = data ? ` ${JSON.stringify(data)}` : '';
      } catch {
        payload = ' [unserializable]';
      }
      const lines = inputDebugLinesRef.current;
      lines.push(`[${ts}] ${tag}${payload}`);
      if (lines.length > 240) lines.splice(0, lines.length - 240);

      const scheduleFlush = () => {
        inputDebugFlushRafRef.current = null;
        const now = performance.now();
        // Throttle UI updates; never update in pointermove directly.
        if (now - (inputDebugLastFlushRef.current || 0) < 180) {
          inputDebugFlushRafRef.current = window.requestAnimationFrame(scheduleFlush);
          return;
        }
        inputDebugLastFlushRef.current = now;
        setInputDebugText(lines.join('\n'));
      };
      if (inputDebugFlushRafRef.current == null) inputDebugFlushRafRef.current = window.requestAnimationFrame(scheduleFlush);
    },
    [inputDebugEnabled]
  );

  const extractContent = useCallback((el) => {
    if (!el) return '';
    if (el.type === 'note') return el.note?.text ?? el.Note?.text ?? '';
    if (el.type === 'text') return el.text?.content ?? el.Text?.content ?? '';
    if (el.type === 'frame') return el.frame?.title ?? el.Frame?.title ?? 'Frame';
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

  const elementToPayload = useCallback((el) => {
    if (!el) return undefined;
    const doc = el.type === 'document' ? el.document ?? el.Document : null;
    const link = el.type === 'link' ? el.link ?? el.Link : null;
    const drawing = el.type === 'drawing' ? el.drawing ?? el.Drawing : null;
    const connector = el.type === 'connector' ? el.connector ?? el.Connector : null;
    const frame = el.type === 'frame' ? el.frame ?? el.Frame : null;
    if (el.type === 'note') return { text: el.content ?? '' };
    if (el.type === 'text') return { content: el.content ?? '' };
    if (el.type === 'document') return { title: doc?.title, url: doc?.url };
    if (el.type === 'link') return { title: link?.title, url: link?.url, previewImageUrl: link?.previewImageUrl };
    if (el.type === 'drawing') return { data: drawing?.data };
    if (el.type === 'connector') return { data: connector?.data };
    if (el.type === 'frame') return { title: frame?.title ?? 'Frame' };
    return undefined;
  }, []);

  const snapshotForHistory = useCallback(
    (el) => {
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
    },
    [elementToPayload]
  );

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
    if (vm.frame == null && vm.Frame != null) vm.frame = vm.Frame;

    // Resolve /uploads URLs to the API origin when frontend is hosted separately.
    if (vm.type === 'document') {
      const doc = vm.document ?? vm.Document ?? null;
      if (doc?.url) {
        const resolved = resolvePublicFileUrl(doc.url, apiBaseUrl);
        if (resolved && resolved !== doc.url) {
          const nextDoc = { ...(doc || {}), url: resolved };
          vm.document = nextDoc;
          vm.Document = nextDoc;
        }
      }
    }
    if (vm.type === 'link') {
      const link = vm.link ?? vm.Link ?? null;
      if (link?.previewImageUrl) {
        const resolved = resolvePublicFileUrl(link.previewImageUrl, apiBaseUrl);
        if (resolved && resolved !== link.previewImageUrl) {
          const nextLink = { ...(link || {}), previewImageUrl: resolved };
          vm.link = nextLink;
          vm.Link = nextLink;
        }
      }
    }

    // Normalize connector endpoints to numeric IDs when possible.
    if (vm.type === 'connector') {
      const child = vm.connector ?? vm.Connector ?? null;
      const data = child?.data ?? null;
      if (data?.from?.elementId != null) data.from.elementId = normalizeElementId(data.from.elementId);
      if (data?.to?.elementId != null) data.to.elementId = normalizeElementId(data.to.elementId);
    }
    return vm;
  }, [extractContent, normalizeReactions, apiBaseUrl]);

  const {
    historyMeta,
    pushHistory,
    undo,
    redo,
    applyingHistoryRef,
    createdElementIdsRef,
  } = useWorkspaceHistory({
    setElements,
    setEditingElementId,
    setSelectedElementIds,
    elementToVm,
    snapshotForHistory,
    snapshotEquals,
    workspace,
    deskIdParam: id,
    setActionError,
    idKey,
    sameId,
    upsertById,
  });

  const getElementByIdFromRef = useCallback((elementId) => {
    const k = idKey(elementId);
    if (!k) return null;
    const list = elementsRef.current || [];
    for (const el of list) {
      if (sameId(el?.id, elementId)) return el;
    }
    return null;
  }, []);

  const toolManager = useToolManager({
    connectorsRef,
    isMobile,
    workspace,
    deskIdParam: id,
    viewport,
    elementsRef,
    getDeskPointFromClient,
    setElements,
    setEditingElementId,
    setSelectedElementIds,
    setSelectedMaterialBlockId,
    setMaterialBlocks,
    pushHistory,
    applyingHistoryRef,
    createdElementIdsRef,
    elementToVm,
    snapshotForHistory,
    upsertById,
    sameId,
    idKey,
    setActionError,
    interactionRef,
    materialBlockInteractionRef,
    createNoteOrTextAtDeskPointRef,
    createFrameAtDeskRectRef,
    inputDebugEnabled,
    pushInputDebug,
    endEditingRef,
    inputDebugLastMoveLogRef,
  });

  const connectors = useConnectors({
    activeTool: toolManager.activeTool,
    elementsRef,
    materialBlocksRef,
    elements,
    getDeskPointFromClient,
    setElements,
    workspace,
    deskIdParam: id,
    setActionError,
    elementToVm,
    snapshotForHistory,
    snapshotEquals,
    pushHistory,
    applyingHistoryRef,
    createdElementIdsRef,
    isMobile,
    updateElement,
    updateLocalElementRef,
    canvasRef,
    elementNodeCacheRef,
    materialBlockNodeRef,
    getElementByIdFromRef,
    sameId,
    idKey,
    upsertById,
    setEditingElementId,
  });
  const {
    connectorHoverElementId,
    setConnectorHoverElementId,
    connectorDraft,
    setConnectorDraft,
    selectedConnectorId,
    setSelectedConnectorId,
    connectorsFollowDuringDrag,
    setConnectorsFollowDuringDrag,
    connectorHoverBlockId,
    setConnectorHoverBlockId,
    startConnectorDrag,
    startConnectorDragFromBlock,
    startConnectorBendDrag,
    computeConnectorPathFromAnchors,
    getLiveAnchorPoint,
    connectorElements,
    onSelectConnector,
    connectorDraftRef,
    connectorDraftRafRef,
  } = connectors;
  connectorsRef.current = connectors;

  const stopInteractions = useCallback(
    (e) => {
      toolManager.cancelTools();
      viewport.stopViewportInteractions(e);
      if (inputDebugEnabled) {
        pushInputDebug('stopInteractions', {
          type: e?.type,
          pid: typeof e?.pointerId === 'number' ? e.pointerId : null,
          pType: e?.pointerType,
          cancelable: Boolean(e?.cancelable),
        });
      }
    },
    [inputDebugEnabled, pushInputDebug, viewport, toolManager]
  );

  useEffect(() => {
    const onWindowPointerUpOrCancel = (e) => {
      const isTouch = e?.pointerType === 'touch';
      if (!isTouch) return;

      const panActive = Boolean(panStartRef.current);
      const pinchActive = Boolean(mobilePinchRef.current?.active);
      const drawActive = Boolean(toolManager.liveStrokeRef?.current);
      const eraseActive = Boolean(toolManager.eraseStateRef?.current?.active);
      const boxSelectActive = Boolean(toolManager.selectStartRef?.current);
      if (!panActive && !pinchActive && !drawActive && !eraseActive && !boxSelectActive) return;

      const pid = typeof e?.pointerId === 'number' ? e.pointerId : null;
      const panPid = panStartRef.current?.pointerId ?? null;
      const pinchHas = pid != null ? mobilePinchRef.current?.pointers?.has?.(pid) : false;
      if (pid != null && panPid != null && pid !== panPid && !pinchHas && !drawActive && !eraseActive) return;

      if (inputDebugEnabled) {
        pushInputDebug('window.end', { type: e.type, pid, panActive, pinchActive, drawActive, eraseActive, boxSelectActive });
      }
      stopInteractions(e);
    };

    window.addEventListener('pointerup', onWindowPointerUpOrCancel, true);
    window.addEventListener('pointercancel', onWindowPointerUpOrCancel, true);
    return () => {
      window.removeEventListener('pointerup', onWindowPointerUpOrCancel, true);
      window.removeEventListener('pointercancel', onWindowPointerUpOrCancel, true);
    };
  }, [inputDebugEnabled, pushInputDebug, stopInteractions, toolManager, mobilePinchRef, panStartRef]);

  useEffect(() => {
    if (toolManager.activeTool !== 'link') return;
    window.setTimeout(() => linkInputRef.current?.focus?.(), 0);
  }, [toolManager.activeTool, toolManager]);

  useEffect(() => {
    if (!isMobile) {
      setMobileBrushBarOpen(false);
      setMobileLinkOpen(false);
      return;
    }
    if (toolManager.activeTool !== 'hand' && toolManager.activeTool !== 'pen' && toolManager.activeTool !== 'eraser') {
      toolManager.setActiveTool('hand');
    }
    toolManager.cancelTools();
  }, [isMobile, toolManager.activeTool, toolManager]);

  useEffect(() => {
    if (!isMobile) return;
    if (!mobileBrushBarOpen && (toolManager.activeTool === 'pen' || toolManager.activeTool === 'eraser')) {
      toolManager.setActiveTool('hand');
    }
  }, [isMobile, mobileBrushBarOpen, toolManager.activeTool, toolManager]);

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
    const frame = el.type === 'frame' ? el.frame ?? el.Frame : null;
    const payload =
      el.type === 'note'
        ? { text: el.content ?? '' }
        : el.type === 'text'
          ? { content: el.content ?? '' }
          : el.type === 'document'
            ? { title: doc?.title, url: doc?.url }
            : el.type === 'link'
              ? { title: link?.title, url: link?.url, previewImageUrl: link?.previewImageUrl }
              : el.type === 'frame'
                ? { title: frame?.title ?? 'Frame' }
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

  const beginEditing = (elementId, explicitBeforeSnap) => {
    if (!elementId) return;
    // Selecting an element implies it's the only active selection.
    setSelectedElementIds(new Set([idKey(elementId)]));
    setSelectedMaterialBlockId(null);
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
  endEditingRef.current = endEditing;

  const blockFrame = useBlockFrame({
    setMaterialBlocks,
    setMaterialBlockDragOffset,
    setSelectedMaterialBlockId,
    materialBlockNodeRef,
    materialBlockInteractionRef,
    viewScaleRef,
    updateMaterialBlock,
  });
  const { startBlockDrag, startBlockResize } = blockFrame;

  const elementFrame = useElementFrame({
    elementsRef,
    setElements,
    persistElement,
    viewScaleRef,
    elementNodeCacheRef,
    interactionRef,
    setConnectorsFollowDuringDrag,
    suppressNextElementClickRef,
    snapshotForHistory,
    canvasRef,
    scheduleApplyViewVars,
    setViewOffset,
    persistViewDebounced,
    elements,
    isMobile,
    mobileSuppressDragPointerIdRef,
    setElementResizeOffset,
  });
  const { maybeStartElementDrag, startResize, updateLocalElement, focusElement, getNextZIndex, getMinZIndex } =
    elementFrame;
  updateLocalElementRef.current = updateLocalElement;

  const onElementPointerDown = (elementId, e) => {
    // Hand tool on mobile should still allow interacting with elements (move/edit/long-press),
    // while keeping panning for empty canvas.
    if (toolManager.activeTool === 'hand') {
      if (!isMobile || e.pointerType !== 'touch') return;

      // Prevent the canvas from capturing this pointer for pan.
      e.stopPropagation();
      if (!isEditableTarget(e.target) && !e.target?.closest?.('button')) {
        e.preventDefault();
      }

      setSelectedElementIds(new Set([idKey(elementId)]));
      setEditingElementId(null);
      setSelectedMaterialBlockId(null);

      // Long-press -> reaction picker (more stable than mobile context menu).
      if (!isEditableTarget(e.target) && !e.target?.closest?.('button')) {
        const prev = mobileLongPressRef.current;
        if (prev?.timerId) window.clearTimeout(prev.timerId);
        mobileLongPressRef.current = { timerId: null, pointerId: e.pointerId, elementId };

        const pointerId = e.pointerId;
        const startX = e.clientX;
        const startY = e.clientY;
        const MOVE_CANCEL_PX = 10;

        const cleanup = (onMove, onUp) => {
          window.removeEventListener('pointermove', onMove, true);
          window.removeEventListener('pointerup', onUp, true);
          window.removeEventListener('pointercancel', onUp, true);
        };

        const onMove = (ev) => {
          if (ev.pointerId !== pointerId) return;
          const dx = ev.clientX - startX;
          const dy = ev.clientY - startY;
          if (dx * dx + dy * dy < MOVE_CANCEL_PX * MOVE_CANCEL_PX) return;
          const cur = mobileLongPressRef.current;
          if (cur?.timerId) window.clearTimeout(cur.timerId);
          mobileLongPressRef.current = { timerId: null, pointerId: null, elementId: null };
          cleanup(onMove, onUp);
        };

        const onUp = (ev) => {
          if (ev.pointerId !== pointerId) return;
          const cur = mobileLongPressRef.current;
          if (cur?.timerId) window.clearTimeout(cur.timerId);
          mobileLongPressRef.current = { timerId: null, pointerId: null, elementId: null };
          if (mobileSuppressDragPointerIdRef.current === pointerId) {
            mobileSuppressDragPointerIdRef.current = null;
          }
          cleanup(onMove, onUp);
        };

        const timerId = window.setTimeout(() => {
          // Mark this pointer as consumed so drag detection won't kick in.
          mobileSuppressDragPointerIdRef.current = pointerId;
          suppressNextElementClickRef.current.add(elementId);
          openReactionPicker(elementId, startX, startY);
          mobileLongPressRef.current = { timerId: null, pointerId: null, elementId: null };
          cleanup(onMove, onUp);
        }, 460);

        mobileLongPressRef.current = { timerId, pointerId, elementId };
        window.addEventListener('pointermove', onMove, true);
        window.addEventListener('pointerup', onUp, true);
        window.addEventListener('pointercancel', onUp, true);
      }

      // Allow dragging elements in Hand mode on mobile.
      maybeStartElementDrag(elementId, e);
      return;
    }
    // Allow drawing tools to work over elements (don't stop bubbling to the canvas).
    if (toolManager.activeTool === 'pen' || toolManager.activeTool === 'eraser') return;
    if (toolManager.activeTool === 'connector') {
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
    // Frame: title edit only via double-click on the label, not on the area.
    if (e.detail === 2) {
      const el = elementsRef.current?.find?.((x) => sameId(x?.id, elementId)) ?? null;
      if (el?.type !== 'frame') beginEditing(elementId);
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

    if (isMobile && toolManager.activeTool === 'hand') {
      ev.stopPropagation();
      const el = elementsRef.current?.find?.((x) => sameId(x?.id, elementId)) || null;
      if (el?.type === 'note' || el?.type === 'text') {
        if (editingElementId === elementId) return;
        beginEditing(elementId);
      } else {
        setSelectedElementIds(new Set([idKey(elementId)]));
      }
      return;
    }

    if (toolManager.activeTool === 'hand' || toolManager.activeTool === 'pen' || toolManager.activeTool === 'eraser' || toolManager.activeTool === 'connector') return;
    ev.stopPropagation();
    const el = elementsRef.current?.find?.((x) => sameId(x?.id, elementId)) ?? null;
    // Frame: title edit only via double-click/double-tap on the label.
    if (el?.type === 'frame') {
      setSelectedElementIds(new Set([idKey(elementId)]));
      setEditingElementId(null);
      setSelectedMaterialBlockId(null);
      return;
    }
    if (editingElementId === elementId) return;
    beginEditing(elementId);
  };

  useEffect(() => {
    return () => {
      if (connectorDraftRafRef.current != null) {
        window.cancelAnimationFrame(connectorDraftRafRef.current);
        connectorDraftRafRef.current = null;
      }
      connectorDraftRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- cleanup on unmount only
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
      // Fallback: try opening the URL directly (browser may handle it better).
      try {
        window.open(docUrl, '_blank', 'noopener,noreferrer');
        return;
      } catch {
        // ignore
      }
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
    const zIndex = getNextZIndex();

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
      if (isMobile) toolManager.setActiveTool('hand');
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
    const zIndex = getNextZIndex();

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
      if (isMobile) toolManager.setActiveTool('hand');
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('Failed to create link:', err?.response?.data || err);
      setActionError(err?.response?.data?.error || err?.message || 'Failed to create link');
      window.setTimeout(() => setActionError(null), 5000);
    } finally {
      setCreatingLink(false);
    }
  };

  const registerElementNode = useCallback((elementId, node) => {
    const k = idKey(elementId);
    if (!k) return;
    const m = elementNodeCacheRef.current;
    if (node) m.set(k, node);
    else m.delete(k);
  }, []);

  const undoEv = useEvent(undo);
  const redoEv = useEvent(redo);

  const createNoteOrTextAtDeskPoint = (type, deskP, { beginEdit = true, anchor = 'topLeft' } = {}) => {
    const kind = type === 'note' ? 'note' : 'text';
    const deskId = workspace?.id ?? workspace?.deskId ?? id;
    if (!deskId) return;
    const zIndex = getNextZIndex();
    const width = Math.round(kind === 'note' ? 260 : 240);
    const height = Math.round(kind === 'note' ? 200 : 80);
    const ax = Number(deskP?.x ?? 0);
    const ay = Number(deskP?.y ?? 0);
    const x = Math.round(anchor === 'center' ? ax - width / 2 : ax);
    const y = Math.round(anchor === 'center' ? ay - height / 2 : ay);

    setActionError(null);
    (async () => {
      try {
        const created = await createElementOnDesk(deskId, {
          type: kind,
          x,
          y,
          width,
          height,
          zIndex,
          payload: kind === 'note' ? { text: '' } : { content: '' },
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
        if (beginEdit && vm?.id) beginEditing(vm.id, snapshotForHistory(vm));
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error('Failed to create element:', err?.response?.data || err);
        setActionError(err?.response?.data?.error || err?.message || 'Failed to create element');
        window.setTimeout(() => setActionError(null), 4000);
      } finally {
        // Mobile UX: creation is a one-shot action; always return to Hand.
        if (isMobile) toolManager.setActiveTool('hand');
      }
    })();
  };
  createNoteOrTextAtDeskPointRef.current = createNoteOrTextAtDeskPoint;

  const createFrameAtDeskRect = useCallback(
    (deskRect) => {
      const deskId = workspace?.id ?? workspace?.deskId ?? id;
      if (!deskId) return;
      const x = Math.round(deskRect.left ?? 0);
      const y = Math.round(deskRect.top ?? 0);
      const width = Math.max(80, Math.round(deskRect.width ?? 200));
      const height = Math.max(60, Math.round(deskRect.height ?? 120));
      const zIndex = getMinZIndex();
      setActionError(null);
      (async () => {
        try {
          const created = await createElementOnDesk(deskId, {
            type: 'frame',
            x,
            y,
            width,
            height,
            zIndex,
            payload: { title: 'Frame' },
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
        } catch (err) {
          // eslint-disable-next-line no-console
          console.error('Failed to create frame:', err?.response?.data || err);
          setActionError(err?.response?.data?.error || err?.message || 'Failed to create frame');
          window.setTimeout(() => setActionError(null), 4000);
        }
      })();
    },
    [
      workspace,
      id,
      getMinZIndex,
      setActionError,
      elementToVm,
      setElements,
      applyingHistoryRef,
      createdElementIdsRef,
      snapshotForHistory,
      pushHistory,
    ]
  );
  createFrameAtDeskRectRef.current = createFrameAtDeskRect;

  const registerMaterialBlockNode = useCallback((blockId, node) => {
    const m = materialBlockNodeRef.current;
    if (node) m.set(blockId, node);
    else m.delete(blockId);
  }, []);

  const handleMaterialBlockTitleUpdate = useCallback((blockId, newTitle) => {
    updateMaterialBlock(blockId, { title: newTitle })
      .then((updated) => {
        setMaterialBlocks((prev) => prev.map((b) => (b.id === blockId ? { ...b, ...updated } : b)));
      })
      .catch(() => {});
  }, []);

  const handleDeleteMaterialBlock = useCallback((block) => {
    const blockId = block?.id;
    if (blockId == null) return;
    setMaterialBlockModal((cur) => (cur?.id === blockId ? null : cur));
    setSelectedMaterialBlockId((cur) => (cur === blockId ? null : cur));
    setMaterialBlocks((prev) => prev.filter((b) => b.id !== blockId));
    deleteMaterialBlock(blockId).catch(() => {});
  }, []);

  const handleAddCardToBoard = useCallback(
    (card) => {
      const deskId = workspace?.id ?? workspace?.deskId ?? id;
      const block = materialBlockModal;
      if (!deskId || !block || !card) return;
      const title = card?.title || 'Без названия';
      const content = card?.content ?? '';
      const text = content ? `${title}\n\n${content}` : title;
      const zIndex = getNextZIndex();
      const x = Math.round((block.x ?? 0) + (block.width ?? 280) + 30);
      const y = Math.round(block.y ?? 0);
      (async () => {
        try {
          const created = await createElementOnDesk(deskId, {
            type: 'note',
            x,
            y,
            width: 260,
            height: 200,
            zIndex,
            payload: { text },
          });
          const vm = elementToVm(created);
          if (vm?.id) createdElementIdsRef.current.add(vm.id);
          setElements((prev) => upsertById(prev, vm));
          if (!applyingHistoryRef.current) {
            const snap = snapshotForHistory(vm);
            if (deskId && snap) pushHistory({ kind: 'create-element', deskId, elementId: vm.id, snapshot: snap });
          }
        } catch (err) {
          setActionError(err?.response?.data?.error || err?.message || 'Не удалось добавить на доску');
          window.setTimeout(() => setActionError(null), 4000);
        }
      })();
    },
    [
      workspace?.id,
      workspace?.deskId,
      id,
      materialBlockModal,
      elementToVm,
      snapshotForHistory,
      getNextZIndex,
      pushHistory,
      setElements,
      applyingHistoryRef,
      createdElementIdsRef,
    ]
  );

  const onCanvasPointerDown = (e) => toolManager.onCanvasPointerDown(e, editingElementId, editingElementIdRef);

  const onCanvasPointerMove = (e) => toolManager.onCanvasPointerMove(e);

  const onCanvasPointerUp = (e) => toolManager.onCanvasPointerUp(e);

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
    loadElements(deskId, elementToVm, { isMounted: () => mounted });

    getMaterialBlocksByDesk(deskId)
      .then((data) => {
        if (!mounted) return;
        setMaterialBlocks(Array.isArray(data) ? data : []);
      })
      .catch(() => mounted && setMaterialBlocks([]));

    return () => {
      mounted = false;
    };
  }, [workspace?.id, workspace?.deskId, id, elementToVm, loadElements]);

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
          setConnectorHoverBlockId(null);
          return;
        }
        if (selectedConnectorId) {
          e.preventDefault();
          setSelectedConnectorId(null);
          return;
        }
        if (toolManager.activeTool === 'connector') {
          e.preventDefault();
          setConnectorHoverElementId(null);
          toolManager.setActiveTool(isMobile ? 'hand' : 'select');
          return;
        }
        if (toolManager.activeTool === 'pen' || toolManager.activeTool === 'eraser') {
          e.preventDefault();
          toolManager.cancelTools();
          setMobileBrushBarOpen(false);
          toolManager.setActiveTool(isMobile ? 'hand' : 'select');
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
        toolManager.setActiveTool(isMobile ? 'hand' : 'select');
        return;
      }
      if (matchShortcut(e, shortcuts['tool.text'])) {
        e.preventDefault();
        setActionError(null);
        toolManager.setActiveTool('text');
        return;
      }
      if (matchShortcut(e, shortcuts['tool.handHold'])) {
        e.preventDefault();
        if (!toolManager.handHoldRef.current.active) {
          toolManager.handHoldRef.current.active = true;
          toolManager.handHoldRef.current.previousTool = toolManager.activeTool;
          toolManager.setActiveTool('hand');
        }
      }
    };

    const onKeyUp = (e) => {
      if (!matchShortcut(e, shortcuts['tool.handHold'])) return;
      if (!toolManager.handHoldRef.current.active) return;
      toolManager.handHoldRef.current.active = false;
      const prev = toolManager.handHoldRef.current.previousTool;
      toolManager.handHoldRef.current.previousTool = null;
      if (prev) toolManager.setActiveTool(prev);
    };

    window.addEventListener('keydown', onKeyDown, { capture: true });
    window.addEventListener('keyup', onKeyUp, { capture: true });
    return () => {
      window.removeEventListener('keydown', onKeyDown, { capture: true });
      window.removeEventListener('keyup', onKeyUp, { capture: true });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- key handler: minimal deps to avoid re-subscribing
  }, [shortcuts, toolManager.activeTool, selectedConnectorId, undoEv, redoEv, isMobile, setElements]);

  useEffect(() => {
    const deskId = workspace?.id ?? workspace?.deskId ?? id;
    const token = getToken();
    if (!deskId || !token) return () => {};

    const socketBase = getSocketBaseUrl();

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

    const wsBatchRef = { current: [] };
    let wsFlushScheduled = false;
    const scheduleWsFlush = () => {
      if (wsFlushScheduled) return;
      wsFlushScheduled = true;
      requestAnimationFrame(() => {
        wsFlushScheduled = false;
        const batch = wsBatchRef.current.splice(0);
        if (batch.length === 0) return;
        setElements((prev) => {
          let next = prev;
          for (const op of batch) {
            if (op.type === 'created') next = upsertById(next, op.vm);
            else if (op.type === 'updated') next = next.map((e) => (sameId(e.id, op.vm.id) ? { ...e, ...op.vm } : e));
            else if (op.type === 'deleted') next = next.filter((e) => !sameId(e.id, op.elementId));
            else if (op.type === 'note') next = next.map((el) => (sameId(el.id, op.elementId) ? { ...el, content: String(op.text ?? '') } : el));
            else if (op.type === 'reactions') next = next.map((el) => (sameId(el.id, op.elementId) ? { ...el, reactions: op.reactions } : el));
          }
          return next;
        });
      });
    };

    socket.on('note:updated', (msg = {}) => {
      if (Number(msg.deskId) !== Number(deskId)) return;
      const elementId = msg.elementId;
      if (!idKey(elementId)) return;
      if (msg.version != null) {
        const incomingV = Number(msg.version);
        const curV = noteVersionsRef.current.get(idKey(elementId));
        if (curV != null && Number.isFinite(incomingV) && incomingV <= curV) return;
        noteVersionsRef.current.set(idKey(elementId), incomingV);
      }
      wsBatchRef.current.push({ type: 'note', elementId, text: msg.text });
      scheduleWsFlush();
    });

    socket.on('element:created', (raw) => {
      const vm = elementToVm(raw);
      if (!vm?.id) return;
      wsBatchRef.current.push({ type: 'created', vm });
      scheduleWsFlush();
    });

    socket.on('element:updated', (raw) => {
      const vm = elementToVm(raw);
      if (!vm?.id) return;
      wsBatchRef.current.push({ type: 'updated', vm });
      scheduleWsFlush();
    });

    socket.on('element:reactions', (msg = {}) => {
      if (Number(msg.deskId) !== Number(deskId)) return;
      const elementId = msg.elementId;
      if (!idKey(elementId)) return;
      wsBatchRef.current.push({ type: 'reactions', elementId, reactions: normalizeReactions(msg.reactions) });
      scheduleWsFlush();
    });

    socket.on('element:deleted', (msg = {}) => {
      if (Number(msg.deskId) !== Number(deskId)) return;
      const elementId = msg.elementId;
      if (!idKey(elementId)) return;
      wsBatchRef.current.push({ type: 'deleted', elementId });
      scheduleWsFlush();
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
  }, [
    workspace?.id,
    workspace?.deskId,
    id,
    commentsEnabled,
    elementToVm,
    normalizeReactions,
    setElements,
    setEditingElementId,
    setCommentsByElement,
    setCommentsPanel,
  ]);

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
      if (toolManager.activeTool === 'hand' || toolManager.activeTool === 'pen' || toolManager.activeTool === 'eraser' || toolManager.activeTool === 'connector') return;
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
    [toolManager.activeTool, editingElementId, beginEditingEv]
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
          const text = await fetchTextPreview(d.url);
          if (cancelled) return;
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
      setMobileLinkOpen(false);
      setMobileSheetDragY(0);
      return;
    }
    setMobileSheetDragY(0);
  }, []);

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

  const onWheelZoom = viewport.onWheelZoom;
  const zoomAtCenter = viewport.zoomAtCenter;
  const effectiveCursor = toolManager.activeTool === 'hand' && isPanning ? 'grabbing' : toolManager.canvasCursor;

  return (
    <div className={`${styles.page} ${mobileBrushBarOpen ? styles.pageBrushMode : ''}`}>
      {isMobile ? (
        <header className={`${styles.mobileTopBar} ${searchOpen ? styles.mobileTopBarSearch : ''}`}>
          {!searchOpen ? (
            <>
            <div className={styles.mobileTopPill} role="banner" aria-label="Board header">
              <Link to="/home" className={styles.mobileTopIconBtn} aria-label="Home">
                <Home size={20} />
              </Link>
              {workspace?.groupId ? (
                <button
                  type="button"
                  className={styles.mobileBoardTitleBtn}
                  title={boardTitle}
                  onClick={(e) => {
                    e.preventDefault();
                    setMobileMembersOpen(true);
                  }}
                  aria-label={`${boardTitle}, нажмите чтобы открыть участников`}
                >
                  <span className={styles.mobileBoardTitleText}>{boardTitle}</span>
                  <span className={styles.mobileBoardTitleIndicators}>
                    {presentUserIds.length > 0 ? (
                      <span className={styles.mobileBoardTitleBadge}>{presentUserIds.length}</span>
                    ) : null}
                    <ChevronDown size={12} className={styles.mobileBoardTitleChevron} />
                  </span>
                </button>
              ) : (
                <div className={styles.mobileBoardTitle} title={boardTitle}>
                  {boardTitle}
                </div>
              )}
              <div className={styles.mobileTopIcons}>
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
                  <UserMenu variant="bare" avatarSize="compact" />
                </div>
                <button type="button" className={styles.mobileTopIconBtn} aria-label="Share board" onClick={shareBoard}>
                  <Share2 size={20} />
                </button>
              </div>
            </div>
            {workspace?.groupId ? (
              <MembersMenu
                variant="modal"
                groupId={workspace.groupId}
                presentUserIds={new Set(presentUserIds)}
                open={mobileMembersOpen}
                onClose={() => setMobileMembersOpen(false)}
              />
            ) : null}
            </>
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
                className={styles.iconBtn}
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
            className={aiPanelOpen ? styles.iconBtnActive : styles.iconBtn}
            label="AI Chat"
            title="Чат с ИИ"
            onClick={() => {
              setAiPanelOpen((v) => !v);
              setCommentsPanel(null);
              setActionError(null);
            }}
          >
            <MessageCircle size={18} />
          </IconBtn>
          <IconBtn className={styles.iconBtn} label="Notifications">
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
            <Toolbar
              activeTool={toolManager.activeTool}
              setActiveTool={toolManager.setActiveTool}
              brushColor={toolManager.brushColor}
              brushWidth={toolManager.brushWidth}
              setBrushColor={toolManager.setBrushColor}
              setBrushWidth={toolManager.setBrushWidth}
              linkInputRef={linkInputRef}
              linkDraftUrl={linkDraftUrl}
              setLinkDraftUrl={setLinkDraftUrl}
              creatingLink={creatingLink}
              submitLink={submitLink}
              openAttachDialog={openAttachDialog}
              uploading={uploading}
              setActionError={setActionError}
              styles={styles}
            />

            <div className={styles.historyPanel} aria-label="History">
              {selectedConnectorId ? (
                <button
                  type="button"
                  className={styles.historyBtn}
                  aria-label="Удалить линию"
                  title="Удалить (Delete)"
                  onClick={() => {
                    const idToDelete = selectedConnectorId;
                    if (!idToDelete) return;
                    setSelectedConnectorId(null);
                    deleteElement(idToDelete)
                      .then(() => setElements((prev) => prev.filter((x) => !sameId(x.id, idToDelete))))
                      .catch(() => {});
                  }}
                >
                  <Trash2 size={18} />
                </button>
              ) : null}
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
            {!mobileToolsOpen && !mobileBrushBarOpen ? (
              <div className={styles.mobileFabWrap}>
                {selectedConnectorId ? (
                  <button
                    type="button"
                    className={styles.mobileFabBtn}
                    aria-label="Удалить линию"
                    title="Удалить"
                    onClick={() => {
                      const idToDelete = selectedConnectorId;
                      if (!idToDelete) return;
                      setSelectedConnectorId(null);
                      deleteElement(idToDelete)
                        .then(() => setElements((prev) => prev.filter((x) => !sameId(x.id, idToDelete))))
                        .catch(() => {
                          // ignore
                        });
                    }}
                  >
                    <Trash2 size={22} />
                  </button>
                ) : null}
                <button
                  type="button"
                  className={`${styles.mobileFabBtn} ${aiPanelOpen ? styles.mobileFabBtnActive : ''}`}
                  aria-label="Open AI chat"
                  aria-pressed={aiPanelOpen}
                  title="Чат с ИИ"
                  onClick={() => {
                    setAiPanelOpen(true);
                    setMobileToolsOpen(false);
                    setMobileBrushBarOpen(false);
                    setMobileLinkOpen(false);
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
                  onClick={() => {
                    setMobileBrushBarOpen(false);
                    setMobileLinkOpen(false);
                    setMobileToolsOpen(true);
                  }}
                >
                  <Plus size={22} />
                </button>
              </div>
            ) : null}

            {mobileBrushBarOpen ? (
              <div className={styles.mobileBrushBar} role="toolbar" aria-label="Brush tools">
                <button
                  type="button"
                  className={styles.mobileBrushExit}
                  aria-label="Exit brush"
                  onClick={() => {
                    toolManager.cancelTools();
                    setMobileBrushBarOpen(false);
                    toolManager.setActiveTool('hand');
                  }}
                >
                  <X size={20} />
                </button>

                <div className={styles.mobileBrushModes} aria-label="Brush mode">
                  <button
                    type="button"
                    className={`${styles.mobileBrushModeBtn} ${toolManager.activeTool === 'pen' ? styles.mobileBrushModeBtnActive : ''}`}
                    aria-label="Pen"
                    aria-pressed={toolManager.activeTool === 'pen'}
                    onClick={() => toolManager.setActiveTool('pen')}
                  >
                    <PenLine size={20} />
                  </button>
                  <button
                    type="button"
                    className={`${styles.mobileBrushModeBtn} ${toolManager.activeTool === 'eraser' ? styles.mobileBrushModeBtnActive : ''}`}
                    aria-label="Eraser"
                    aria-pressed={toolManager.activeTool === 'eraser'}
                    onClick={() => toolManager.setActiveTool('eraser')}
                  >
                    <Eraser size={20} />
                  </button>
                </div>

                <div className={styles.mobileBrushSwatches} aria-label="Brush color">
                  {BRUSH_COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      className={`${styles.mobileBrushSwatch} ${toolManager.brushColor === c ? styles.mobileBrushSwatchActive : ''}`}
                      style={{ background: c }}
                      onClick={() => toolManager.setBrushColor(c)}
                      aria-label={`Color ${c}`}
                      aria-pressed={toolManager.brushColor === c}
                    />
                  ))}
                </div>

                <input
                  className={styles.mobileBrushWidth}
                  type="range"
                  min={1}
                  max={24}
                  value={toolManager.brushWidth}
                  onChange={(ev) => toolManager.setBrushWidth(Number(ev.target.value))}
                  aria-label="Brush width"
                />
              </div>
            ) : null}

            {mobileToolsOpen ? (
              <div
                className={styles.mobileSheetOverlay}
                role="presentation"
                onPointerDown={() => {
                  setMobileToolsOpen(false);
                  setMobileLinkOpen(false);
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
                    {TOOLS.filter(({ id: toolId }) => toolId !== 'hand' && toolId !== 'select' && toolId !== 'connector').map(({ id: toolId, label, Icon }) => {
                      return (
                        <button
                          key={toolId}
                          type="button"
                          className={styles.mobileToolItem}
                          aria-label={label}
                          onClick={() => {
                            if (toolId === 'attach') {
                              openAttachDialog();
                              setMobileToolsOpen(false);
                              setMobileLinkOpen(false);
                              return;
                            }
                            if (toolId === 'note' || toolId === 'text') {
                              const rect = canvasRef.current?.getBoundingClientRect?.();
                              if (!rect) return;
                              const centerDesk = getDeskPointFromClient(rect.left + rect.width / 2, rect.top + rect.height / 2);
                              createNoteOrTextAtDeskPoint(toolId, centerDesk, { beginEdit: true, anchor: 'center' });
                              setMobileToolsOpen(false);
                              setMobileLinkOpen(false);
                              return;
                            }
                            if (toolId === 'frame') {
                              const rect = canvasRef.current?.getBoundingClientRect?.();
                              if (!rect) return;
                              const centerDesk = getDeskPointFromClient(rect.left + rect.width / 2, rect.top + rect.height / 2);
                              const w = 200;
                              const h = 120;
                              createFrameAtDeskRectRef.current?.({
                                left: centerDesk.x - w / 2,
                                top: centerDesk.y - h / 2,
                                width: w,
                                height: h,
                              });
                              setMobileToolsOpen(false);
                              setMobileLinkOpen(false);
                              return;
                            }
                            if (toolId === 'material_block') {
                              const deskId = workspace?.id ?? workspace?.deskId ?? id;
                              if (!deskId) return;
                              const rect = canvasRef.current?.getBoundingClientRect?.();
                              if (!rect) return;
                              const centerDesk = getDeskPointFromClient(rect.left + rect.width / 2, rect.top + rect.height / 2);
                              setActionError(null);
                              createMaterialBlock(deskId, { x: Math.round(centerDesk.x), y: Math.round(centerDesk.y) })
                                .then((newBlock) => {
                                  setMaterialBlocks((prev) => [...prev, newBlock]);
                                  setSelectedMaterialBlockId(newBlock.id);
                                  setMobileToolsOpen(false);
                                  setMobileLinkOpen(false);
                                })
                                .catch((err) => {
                                  setActionError(err?.response?.data?.error || err?.message || 'Не удалось создать блок');
                                  window.setTimeout(() => setActionError(null), 4000);
                                });
                              return;
                            }
                            if (toolId === 'pen' || toolId === 'eraser') {
                              setActionError(null);
                              toolManager.setActiveTool(toolId);
                              setMobileBrushBarOpen(true);
                              setMobileToolsOpen(false);
                              setMobileLinkOpen(false);
                              return;
                            }
                            if (toolId === 'link') {
                              setMobileLinkOpen(true);
                              return;
                            }
                          }}
                        >
                          <span className={styles.mobileToolIcon} aria-hidden="true">
                            {toolId === 'attach' && uploading ? (
                              <Loader2 size={20} className={styles.spinner} />
                            ) : (
                              <Icon size={20} />
                            )}
                          </span>
                          <span className={styles.mobileToolLabel}>{label}</span>
                        </button>
                      );
                    })}
                  </div>

                  {mobileLinkOpen ? (
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
                              setMobileLinkOpen(false);
                              return;
                            }
                            if (ev.key === 'Enter' && !ev.shiftKey) {
                              ev.preventDefault();
                              const ok = Boolean(normalizeUrlClient(linkDraftUrl));
                              if (!ok) return;
                              submitLink();
                              setMobileToolsOpen(false);
                              setMobileLinkOpen(false);
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
                            setMobileLinkOpen(false);
                          }}
                        >
                          Add
                        </button>
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
          // IMPORTANT: never end touch gestures on pointerleave (real devices emit it mid-gesture).
          onPointerLeave={isMobile ? undefined : onCanvasPointerUp}
          onWheel={onWheelZoom}
          style={{
            '--canvas-cursor': effectiveCursor,
            '--note-bg': `url(${note2Img})`,
          }}
        >
          {inputDebugEnabled ? (
            <div
              style={{
                position: 'absolute',
                left: 8,
                top: 8,
                zIndex: 9999,
                width: 'min(520px, calc(100vw - 16px))',
                maxHeight: 'min(55vh, 520px)',
                overflow: 'hidden',
                borderRadius: 12,
                border: '1px solid rgba(15, 23, 42, 0.18)',
                background: 'rgba(255, 255, 255, 0.94)',
                backdropFilter: 'blur(10px)',
                boxShadow: '0 10px 30px rgba(15, 23, 42, 0.18)',
                pointerEvents: 'auto',
              }}
              onPointerDown={(ev) => ev.stopPropagation()}
              onPointerMove={(ev) => ev.stopPropagation()}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 8,
                  padding: '10px 10px 8px 10px',
                  borderBottom: '1px solid rgba(15, 23, 42, 0.10)',
                  fontSize: 12,
                  fontWeight: 800,
                  color: 'rgba(15, 23, 42, 0.82)',
                }}
              >
                <div>Input debug (disable: remove `?inputDebug=1`)</div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    type="button"
                    style={{
                      height: 28,
                      padding: '0 10px',
                      borderRadius: 10,
                      border: '1px solid rgba(15, 23, 42, 0.14)',
                      background: 'rgba(255, 255, 255, 0.9)',
                      fontSize: 12,
                      fontWeight: 750,
                      cursor: 'pointer',
                    }}
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(inputDebugText || '');
                      } catch {
                        // ignore
                      }
                    }}
                  >
                    Copy
                  </button>
                  <button
                    type="button"
                    style={{
                      height: 28,
                      padding: '0 10px',
                      borderRadius: 10,
                      border: '1px solid rgba(15, 23, 42, 0.14)',
                      background: 'rgba(255, 255, 255, 0.9)',
                      fontSize: 12,
                      fontWeight: 750,
                      cursor: 'pointer',
                    }}
                    onClick={() => {
                      inputDebugLinesRef.current = [];
                      setInputDebugText('');
                    }}
                  >
                    Clear
                  </button>
                </div>
              </div>
              <pre
                style={{
                  margin: 0,
                  padding: 10,
                  maxHeight: 'calc(min(55vh, 520px) - 42px)',
                  overflow: 'auto',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                  fontSize: 11,
                  lineHeight: 1.25,
                  color: 'rgba(15, 23, 42, 0.86)',
                }}
              >
                {inputDebugText || '[no events yet]'}
              </pre>
            </div>
          ) : null}
          <div className={styles.grid} />
          {actionError ? <div className={styles.actionError}>{actionError}</div> : null}
          <div className={styles.boardContent}>
            <ElementRenderer
              styles={styles}
              connectors={connectorElements}
              connectorDraft={connectorDraft}
              selectedConnectorId={selectedConnectorId}
              onSelectConnector={onSelectConnector}
              startConnectorBendDrag={startConnectorBendDragEv}
              computeConnectorPathFromAnchors={computeConnectorPathFromAnchors}
              getAnchorPoint={getLiveAnchorPoint}
              connectorsFollowDuringDrag={connectorsFollowDuringDrag}
              elements={elements}
              materialBlocks={materialBlocks}
              interactionRef={interactionRef}
              elementResizeOffset={elementResizeOffset}
              selectedElementIds={selectedElementIds}
              setSelectedElementIds={setSelectedElementIds}
              registerElementNode={registerElementNode}
              onElementPointerDown={onElementPointerDown}
              onElementClick={onElementClick}
              startResize={startResize}
              handleDeleteElement={handleDeleteElement}
              editingElementId={editingElementId}
              setEditingElementId={setEditingElementId}
              deletingElementId={deletingElementId}
              isMobile={isMobile}
              commentsEnabled={commentsEnabled}
              searchQuery={searchQuery}
              hasSearchQuery={hasSearchQuery}
              manualSearchHitIds={manualSearchHitIds}
              activeTool={toolManager.activeTool}
              connectorHoverElementId={connectorHoverElementId}
              noteTextActions={noteTextActions}
              layoutReactionBubbles={layoutReactionBubbles}
              openReactionPicker={openReactionPicker}
              beginEditing={beginEditing}
              openComments={openComments}
              updateLocalElement={updateLocalElement}
              queueNoteEdit={queueNoteEdit}
              endEditing={endEditing}
              persistElement={persistElement}
              editStartSnapRef={editStartSnapRef}
              openDocument={openDocument}
              downloadDocument={downloadDocument}
              openExternalUrl={openExternalUrl}
              getLinkPreview={getLinkPreview}
              docTextPreview={docTextPreview}
              toggleReaction={toggleReaction}
              startConnectorDrag={startConnectorDrag}
              selectedMaterialBlockId={selectedMaterialBlockId}
              materialBlockDragOffset={materialBlockDragOffset}
              connectorHoverBlockId={connectorHoverBlockId}
              startBlockDrag={startBlockDrag}
              setMaterialBlockModal={setMaterialBlockModal}
              startBlockResize={startBlockResize}
              setSelectedMaterialBlockId={setSelectedMaterialBlockId}
              registerMaterialBlockNode={registerMaterialBlockNode}
              handleMaterialBlockTitleUpdate={handleMaterialBlockTitleUpdate}
              handleDeleteMaterialBlock={handleDeleteMaterialBlock}
              startConnectorDragFromBlock={startConnectorDragFromBlock}
            />
            {toolManager.liveStroke?.points?.length ? (
              (() => {
                const pts = toolManager.liveStroke.points;
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
                const pad = Math.max(2, toolManager.liveStroke.width / 2 + 2);
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
                        stroke={toolManager.liveStroke.color}
                        strokeWidth={toolManager.liveStroke.width}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </div>
                );
              })()
            ) : null}
          </div>
          {toolManager.selectionRect ? (
            <div
              className={styles.selectionRect}
              style={{
                left: toolManager.selectionRect.left,
                top: toolManager.selectionRect.top,
                width: toolManager.selectionRect.width,
                height: toolManager.selectionRect.height,
              }}
            />
          ) : null}
          {toolManager.liveFrameRect ? (
            <div
              className={styles.liveFrameRect}
              style={{
                left: toolManager.liveFrameRect.left,
                top: toolManager.liveFrameRect.top,
                width: toolManager.liveFrameRect.width,
                height: toolManager.liveFrameRect.height,
              }}
            />
          ) : null}
        </main>

        {!isMobile ? (
          <div className={styles.zoom}>
            <button
              type="button"
              className={styles.zoomBtn}
              onClick={() => zoomAtCenter('out')}
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
              onClick={() => zoomAtCenter('in')}
              aria-label="Zoom in"
              title="Zoom in"
            >
              +
            </button>
          </div>
        ) : null}
      </div>

      {commentsEnabled && commentsPanel ? (
        isMobile ? (
          <div
            className={styles.commentsSheetOverlay}
            role="presentation"
            onPointerDown={() => {
              closeCommentsPanel();
            }}
          >
            <div
              ref={commentsSheetRef}
              className={`${styles.commentsSheet} ${commentsSheetDragging ? styles.commentsSheetDragging : ''}`}
              role="dialog"
              aria-label="Комментарии"
              onPointerDown={(ev) => ev.stopPropagation()}
              onPointerMove={onCommentsSheetDragMove}
              onPointerUp={onCommentsSheetDragEnd}
              onPointerCancel={onCommentsSheetDragEnd}
              style={{ transform: `translateY(${commentsSheetDragY}px)` }}
            >
              <div
                className={styles.commentsSheetHandle}
                aria-hidden="true"
                onPointerDown={onCommentsSheetDragStart}
              />
              <div className={styles.commentsPanelHeader}>
                <div className={styles.commentsPanelTitle}>Комментарии</div>
                <button
                  type="button"
                  className={styles.commentsPanelClose}
                  onClick={() => closeCommentsPanel()}
                  aria-label="Закрыть комментарии"
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
                      closeCommentsPanel();
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
          </div>
        ) : (
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
                onClick={() => closeCommentsPanel()}
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
                    closeCommentsPanel();
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
        )
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

      {materialBlockModal ? (
        <MaterialBlockModal
          block={materialBlockModal}
          onClose={() => setMaterialBlockModal(null)}
          isMobile={isMobile}
          deskId={workspace?.id ?? workspace?.deskId ?? id}
          onAddCardToBoard={handleAddCardToBoard}
        />
      ) : null}
    </div>
  );
}