import { useCallback, useMemo, useRef, useState } from 'react';
import { TOOLS } from '../../constants/workspace';
import { iconToCursorValue } from '../../utils/cursorUtils';
import {
  createPenTool,
  createEraserTool,
  createSelectTool,
  createHandTool,
  createConnectorTool,
  createFrameTool,
  createNoteTool,
  createTextTool,
  createMaterialBlockTool,
} from './tools';

const DEFAULT_BRUSH_COLOR = '#0f172a';
const DEFAULT_BRUSH_WIDTH = 4;

export function useToolManager({
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
}) {
  const [activeTool, setActiveTool] = useState(() => (isMobile ? 'hand' : TOOLS[0].id));
  const [selectionRect, setSelectionRect] = useState(null);
  const [liveFrameRect, setLiveFrameRect] = useState(null);
  const [brushColor, setBrushColor] = useState(DEFAULT_BRUSH_COLOR);
  const [brushWidth, setBrushWidth] = useState(DEFAULT_BRUSH_WIDTH);
  const [liveStroke, setLiveStroke] = useState(null);

  const handHoldRef = useRef({ active: false, previousTool: null });
  const liveStrokeRef = useRef(null);
  const eraseStateRef = useRef({ active: false, erasedIds: new Set(), lastTs: 0 });
  const selectStartRef = useRef(null);
  const selectRafRef = useRef(null);
  const selectPendingEndRef = useRef(null);

  const {
    canvasRef,
    getCanvasPoint,
    viewOffsetRef,
    viewScaleRef,
    setIsPanning,
    panStartRef,
    ensurePanRaf,
    mobilePinchRef,
    stopViewportInteractions,
  } = viewport;

  const {
    setSelectedConnectorId,
    setConnectorHoverElementId,
    setConnectorHoverBlockId,
    pickHoverElementId,
    pickHoverBlockId,
  } = connectorsRef?.current || {};

  const activeToolDef = useMemo(() => TOOLS.find((t) => t.id === activeTool) || TOOLS[0], [activeTool]);
  const canvasCursor = useMemo(
    () => iconToCursorValue(activeToolDef.Icon, activeToolDef.hotspot, activeToolDef.fallbackCursor),
    [activeToolDef]
  );

  const ctx = useMemo(
    () => ({
      getCanvasPoint,
      viewOffsetRef,
      viewScaleRef,
      brushColor,
      brushWidth,
      liveStrokeRef,
      setLiveStroke,
      elementsRef,
      setElements,
      pushHistory,
      applyingHistoryRef,
      createdElementIdsRef,
      elementToVm,
      snapshotForHistory,
      workspace,
      deskIdParam: id,
      upsertById,
      sameId,
      idKey,
      setActionError,
      interactionRef,
      eraseStateRef,
      selectStartRef,
      selectRafRef,
      selectPendingEndRef,
      setSelectionRect,
      setSelectedElementIds,
      setEditingElementId,
      setSelectedMaterialBlockId,
      panStartRef,
      setIsPanning,
      ensurePanRaf,
      pushInputDebug,
      inputDebugEnabled,
      pickHoverElementId,
      pickHoverBlockId,
      setConnectorHoverElementId,
      setConnectorHoverBlockId,
      isMobile,
      createNoteOrTextAtDeskPointRef,
      createFrameAtDeskRectRef,
      setLiveFrameRect,
      setMaterialBlocks,
      setActiveTool,
    }),
    [
      getCanvasPoint,
      viewOffsetRef,
      viewScaleRef,
      brushColor,
      brushWidth,
      setLiveStroke,
      pushHistory,
      applyingHistoryRef,
      elementToVm,
      snapshotForHistory,
      workspace,
      id,
      upsertById,
      sameId,
      idKey,
      setSelectionRect,
      setSelectedElementIds,
      setEditingElementId,
      setSelectedMaterialBlockId,
      panStartRef,
      setIsPanning,
      ensurePanRaf,
      inputDebugEnabled,
      pickHoverElementId,
      pickHoverBlockId,
      isMobile,
      setMaterialBlocks,
      createFrameAtDeskRectRef,
      setLiveFrameRect,
      createNoteOrTextAtDeskPointRef,
      createdElementIdsRef,
      elementsRef,
      interactionRef,
      pushInputDebug,
      setActionError,
      setConnectorHoverBlockId,
      setConnectorHoverElementId,
      setElements,
    ]
  );

  const tools = useMemo(
    () => ({
      pen: createPenTool(ctx),
      eraser: createEraserTool(ctx),
      select: createSelectTool(ctx),
      hand: createHandTool(ctx),
      connector: createConnectorTool(ctx),
      frame: createFrameTool(ctx),
      note: createNoteTool(ctx),
      text: createTextTool(ctx),
      material_block: createMaterialBlockTool(ctx),
    }),
    [ctx]
  );

  const cancelTools = useCallback(() => {
    selectStartRef.current = null;
    setSelectionRect(null);
    setLiveFrameRect(null);
    liveStrokeRef.current = null;
    setLiveStroke(null);
    eraseStateRef.current.active = false;
    eraseStateRef.current.erasedIds = new Set();
    tools.pen?.cancel?.();
    tools.eraser?.cancel?.();
    tools.select?.cancel?.();
    tools.frame?.cancel?.();
  }, [tools.pen, tools.eraser, tools.select, tools.frame, setSelectionRect, setLiveStroke, setLiveFrameRect]);

  const onCanvasPointerDown = useCallback(
    (e, editingElementId, editingElementIdRef) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      const target = e.currentTarget;
      try {
        target.setPointerCapture(e.pointerId);
      } catch {
        // ignore
      }
      if (inputDebugEnabled) {
        let hasCap = null;
        try {
          hasCap = typeof target?.hasPointerCapture === 'function' ? target.hasPointerCapture(e.pointerId) : null;
        } catch {
          hasCap = null;
        }
        pushInputDebug('pointer.down', {
          type: e.type,
          pid: e.pointerId,
          pType: e.pointerType,
          primary: e.isPrimary,
          buttons: e.buttons,
          cancelable: Boolean(e.cancelable),
          prevented: Boolean(e.defaultPrevented),
          hasCap,
          x: Math.round(e.clientX),
          y: Math.round(e.clientY),
        });
      }
      e.preventDefault();

      if (isMobile && e.pointerType === 'touch') {
        const pinch = mobilePinchRef.current;
        if (pinch.pointers.size === 0) {
          const node = canvasRef.current;
          const rect = node?.getBoundingClientRect?.();
          if (rect) pinch.rect = { left: rect.left, top: rect.top };
        }
        pinch.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

        if (pinch.pointers.size === 2) {
          const pts = Array.from(pinch.pointers.values());
          const a = pts[0];
          const b = pts[1];
          const dx = Number(b.x - a.x);
          const dy = Number(b.y - a.y);
          const dist = Math.hypot(dx, dy) || 1;
          const midClient = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
          const mid = { x: midClient.x - (pinch.rect?.left ?? 0), y: midClient.y - (pinch.rect?.top ?? 0) };
          const off0 = viewOffsetRef.current;
          const s0 = viewScaleRef.current || 1;
          pinch.active = true;
          pinch.startDist = dist;
          pinch.startScale = s0;
          pinch.startOffset = { ...off0 };
          pinch.deskMid = { x: (mid.x - off0.x) / s0, y: (mid.y - off0.y) / s0 };
          viewport.ensurePinchRaf?.();
          if (inputDebugEnabled) {
            pushInputDebug('pinch.start', {
              pCount: pinch.pointers.size,
              dist: Math.round(dist),
              startScale: Number((s0 || 1).toFixed(4)),
            });
          }
          cancelTools();
          interactionRef.current = null;
          materialBlockInteractionRef.current = null;
          setIsPanning(false);
          panStartRef.current = null;
          return;
        }
      }

      const p = getCanvasPoint(e);
      const off = viewOffsetRef.current;
      const s = viewScaleRef.current || 1;
      const deskP = { x: (p.x - off.x) / s, y: (p.y - off.y) / s };

      const activeEditingId = editingElementIdRef?.current ?? editingElementId;
      if (activeEditingId) {
        const insideEditing = e.target?.closest?.(`[data-element-id="${activeEditingId}"]`);
        if (!insideEditing) {
          endEditingRef?.current?.();
          if (activeTool !== 'hand' && !handHoldRef.current.active) return;
        }
      }

      setSelectedConnectorId?.(null);

      if (activeTool === 'connector') {
        setSelectedConnectorId?.(null);
        return;
      }

      const hitElement = e.target?.closest?.('[data-element-id]');
      const hitMaterialBlock = e.target?.closest?.('[data-material-block-id]');
      if (hitElement || hitMaterialBlock) return;

      setSelectedElementIds(new Set());
      setEditingElementId(null);
      setSelectedMaterialBlockId(null);

      if (activeTool === 'select' && isMobile && e.pointerType === 'touch') {
        selectStartRef.current = null;
        setSelectionRect(null);
        panStartRef.current = {
          pointerId: e.pointerId,
          startClientX: e.clientX,
          startClientY: e.clientY,
          lastClientX: e.clientX,
          lastClientY: e.clientY,
          startOffset: { ...viewOffsetRef.current },
        };
        setIsPanning(true);
        ensurePanRaf();
        if (inputDebugEnabled) pushInputDebug('pan.start', { fromTool: 'select', pid: e.pointerId });
        return;
      }

      const t = tools[activeTool];
      if (t?.onPointerDown) t.onPointerDown(e, deskP, p);
    },
    [
      activeTool,
      cancelTools,
      setSelectedConnectorId,
      endEditingRef,
      ensurePanRaf,
      getCanvasPoint,
      inputDebugEnabled,
      isMobile,
      materialBlockInteractionRef,
      mobilePinchRef,
      panStartRef,
      pushInputDebug,
      setEditingElementId,
      setSelectedElementIds,
      setSelectedMaterialBlockId,
      tools,
      viewOffsetRef,
      viewScaleRef,
      viewport,
      interactionRef,
      setIsPanning,
      canvasRef,
    ]
  );

  const onCanvasPointerMove = useCallback(
    (e) => {
      if (activeTool !== 'connector') setConnectorHoverBlockId(null);
      if (isMobile && e.pointerType === 'touch' && e.cancelable) {
        const pinchActive = Boolean(mobilePinchRef.current?.active);
        const panActive = Boolean(panStartRef.current);
        const drawActive = Boolean(liveStrokeRef.current);
        const eraseActive = Boolean(eraseStateRef.current?.active);
        if (pinchActive || panActive || drawActive || eraseActive) {
          e.preventDefault();
          if (inputDebugEnabled)
            pushInputDebug('move.preventDefault', { pinchActive, panActive, drawActive, eraseActive });
        }
      }
      if (inputDebugEnabled && inputDebugLastMoveLogRef?.current) {
        const last = inputDebugLastMoveLogRef.current;
        if (last) {
          const prevTs = last.get(e.pointerId) || 0;
          const now = performance.now();
          if (now - prevTs > 45) {
            last.set(e.pointerId, now);
            let coalesced = null;
            try {
              coalesced = typeof e.getCoalescedEvents === 'function' ? e.getCoalescedEvents()?.length ?? 0 : null;
            } catch {
              coalesced = null;
            }
            pushInputDebug('pointer.move', {
              pid: e.pointerId,
              pType: e.pointerType,
              x: Math.round(e.clientX),
              y: Math.round(e.clientY),
              mx: Number(e.movementX ?? 0),
              my: Number(e.movementY ?? 0),
              coalesced,
            });
          }
        }
      }
      if (isMobile && e.pointerType === 'touch') {
        const pinch = mobilePinchRef.current;
        if (pinch.pointers.has(e.pointerId)) {
          pinch.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
        }
        if (pinch.active && pinch.pointers.size >= 2) {
          viewport.ensurePinchRaf?.();
          return;
        }
      }

      const t = tools[activeTool];
      if (t?.onPointerMove) t.onPointerMove(e);

      if (panStartRef.current) {
        const pan = panStartRef.current;
        if (pan?.pointerId === e.pointerId) {
          pan.lastClientX = e.clientX;
          pan.lastClientY = e.clientY;
          ensurePanRaf();
        }
      }
    },
    [
      activeTool,
      ensurePanRaf,
      inputDebugEnabled,
      inputDebugLastMoveLogRef,
      isMobile,
      mobilePinchRef,
      panStartRef,
      pushInputDebug,
      setConnectorHoverBlockId,
      tools,
      viewport,
    ]
  );

  const onCanvasPointerUp = useCallback(
    (e) => {
      if (inputDebugEnabled) {
        pushInputDebug('pointer.up', {
          type: e.type,
          pid: e.pointerId,
          pType: e.pointerType,
          x: Math.round(e.clientX),
          y: Math.round(e.clientY),
        });
      }
      if (isMobile && e.pointerType === 'touch') {
        const pinch = mobilePinchRef.current;
        if (pinch.pointers.has(e.pointerId)) pinch.pointers.delete(e.pointerId);
        if (pinch.active && pinch.pointers.size < 2) {
          pinch.active = false;
          if (viewport.pinchRafRef?.current != null) {
            window.cancelAnimationFrame(viewport.pinchRafRef.current);
            viewport.pinchRafRef.current = null;
          }
          if (inputDebugEnabled) pushInputDebug('pinch.end', { remaining: pinch.pointers.size });
          viewport.persistViewDebounced?.({ offset: viewOffsetRef.current, scale: viewScaleRef.current }, {
            immediate: true,
          });
        }
      }

      const t = tools[activeTool];
      if (t?.onPointerUp) t.onPointerUp(e);

      selectStartRef.current = null;
      setSelectionRect(null);
      stopViewportInteractions?.(e);
    },
    [
      activeTool,
      inputDebugEnabled,
      isMobile,
      mobilePinchRef,
      pushInputDebug,
      tools,
      viewport,
      viewOffsetRef,
      viewScaleRef,
      stopViewportInteractions,
    ]
  );

  return {
    activeTool,
    setActiveTool,
    brushColor,
    brushWidth,
    setBrushColor,
    setBrushWidth,
    liveStroke,
    selectionRect,
    liveFrameRect,
    liveStrokeRef,
    eraseStateRef,
    selectStartRef,
    handHoldRef,
    cancelTools,
    canvasCursor,
    onCanvasPointerDown,
    onCanvasPointerMove,
    onCanvasPointerUp,
    finalizeStroke: tools.pen?.finalizeStroke,
  };
}
