import React, {
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

const VIEW_SCALE_MIN = 0.2;
const VIEW_SCALE_MAX = 3;
const VIEW_SCALE_BASE = 0.88;

function clampNumber(v, min, max) {
  return Math.min(max, Math.max(min, v));
}

export function clampViewScale(s) {
  return clampNumber(Number(s) || 1, VIEW_SCALE_MIN, VIEW_SCALE_MAX);
}

export function formatViewScalePct(s) {
  const eff = clampViewScale(s);
  const pct = (eff / VIEW_SCALE_BASE) * 100;
  return `${Math.round(pct)}%`;
}

const CanvasViewportContext = React.createContext(null);

export function useCanvasViewport() {
  const ctx = useContext(CanvasViewportContext);
  if (!ctx) throw new Error('useCanvasViewport must be used within Canvas');
  return ctx;
}

export function useCanvasViewportOptional() {
  return useContext(CanvasViewportContext);
}

export function useCanvasViewportState(deskIdKey, deskIdNum, loading) {
  const canvasRef = useRef(null);
  const zoomPctRef = useRef(null);
  const [, setViewOffset] = useState({ x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);

  const viewOffsetRef = useRef({ x: 0, y: 0 });
  const viewScaleRef = useRef(VIEW_SCALE_BASE);
  const viewApplyRafRef = useRef(null);
  const viewPendingRef = useRef(null);
  const viewSaveTimerRef = useRef(null);
  const persistViewDebouncedRef = useRef(null);
  const didRestoreViewRef = useRef(false);

  const panStartRef = useRef(null);
  const panRafRef = useRef(null);
  const pinchRafRef = useRef(null);
  const mobilePinchRef = useRef({
    active: false,
    pointers: new Map(),
    startDist: 0,
    startScale: 1,
    startOffset: { x: 0, y: 0 },
    deskMid: { x: 0, y: 0 },
    rect: { left: 0, top: 0 },
  });

  const viewStorageKey = useMemo(() => {
    if (!deskIdKey) return null;
    return `healis.boardView.v2:${deskIdKey}`;
  }, [deskIdKey]);

  const getCanvasPoint = useCallback((e) => {
    const el = canvasRef.current;
    if (!el) return { x: 0, y: 0 };
    const rect = el.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }, []);

  const getDeskPointFromClient = useCallback((clientX, clientY) => {
    const el = canvasRef.current;
    if (!el) return { x: 0, y: 0 };
    const rect = el.getBoundingClientRect();
    const off = viewOffsetRef.current;
    const s = viewScaleRef.current || 1;
    return { x: (clientX - rect.left - off.x) / s, y: (clientY - rect.top - off.y) / s };
  }, []);

  const applyViewVarsNow = useCallback((next) => {
    const node = canvasRef.current;
    if (!node) return;
    const off = next?.offset || viewOffsetRef.current;
    const s = clampViewScale(next?.scale != null ? next.scale : viewScaleRef.current);

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
      const off = next?.offset || viewOffsetRef.current;
      const s = clampViewScale(next?.scale != null ? next.scale : viewScaleRef.current);
      viewOffsetRef.current = { x: Number(off?.x || 0), y: Number(off?.y || 0) };
      viewScaleRef.current = s;

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
              scale: storedScale,
            })
          );
        } catch {
          // ignore
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

  const runPanFrame = useCallback(() => {
    panRafRef.current = null;
    const pan = panStartRef.current;
    if (!pan) return;
    const dx = Number((pan.lastClientX ?? pan.startClientX) - pan.startClientX);
    const dy = Number((pan.lastClientY ?? pan.startClientY) - pan.startClientY);
    const startOffset = pan.startOffset || viewOffsetRef.current;
    applyViewVarsNow({ offset: { x: startOffset.x + dx, y: startOffset.y + dy } });
    if (panStartRef.current) panRafRef.current = window.requestAnimationFrame(runPanFrame);
  }, [applyViewVarsNow]);

  const ensurePanRaf = useCallback(() => {
    if (panRafRef.current != null) return;
    panRafRef.current = window.requestAnimationFrame(runPanFrame);
  }, [runPanFrame]);

  const runPinchFrame = useCallback(() => {
    pinchRafRef.current = null;
    const pinch = mobilePinchRef.current;
    if (!pinch?.active) return;
    if (!pinch.pointers || pinch.pointers.size < 2) return;
    const pts = Array.from(pinch.pointers.values());
    const a = pts[0];
    const b = pts[1];
    const dx = Number(b.x - a.x);
    const dy = Number(b.y - a.y);
    const dist = Math.hypot(dx, dy) || 1;
    const midClient = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const mid = { x: midClient.x - (pinch.rect?.left ?? 0), y: midClient.y - (pinch.rect?.top ?? 0) };

    const ratio = dist / (pinch.startDist || 1);
    const nextScale = clampViewScale((pinch.startScale || 1) * ratio);
    const nextOffset = {
      x: mid.x - pinch.deskMid.x * nextScale,
      y: mid.y - pinch.deskMid.y * nextScale,
    };
    applyViewVarsNow({ offset: nextOffset, scale: nextScale });
    if (pinch.active) pinchRafRef.current = window.requestAnimationFrame(runPinchFrame);
  }, [applyViewVarsNow]);

  const ensurePinchRaf = useCallback(() => {
    if (pinchRafRef.current != null) return;
    pinchRafRef.current = window.requestAnimationFrame(runPinchFrame);
  }, [runPinchFrame]);

  const stopViewportInteractions = useCallback(
    (e) => {
      if (e?.currentTarget && typeof e.pointerId === 'number') {
        try {
          e.currentTarget.releasePointerCapture(e.pointerId);
        } catch {
          // ignore
        }
      }
      panStartRef.current = null;
      if (panRafRef.current != null) {
        window.cancelAnimationFrame(panRafRef.current);
        panRafRef.current = null;
      }
      if (pinchRafRef.current != null) {
        window.cancelAnimationFrame(pinchRafRef.current);
        pinchRafRef.current = null;
      }
      setIsPanning(false);
      setViewOffset(viewOffsetRef.current);
      persistViewDebounced({ offset: viewOffsetRef.current, scale: viewScaleRef.current }, { immediate: true });
    },
    [persistViewDebounced]
  );

  useLayoutEffect(() => {
    applyViewVarsNow({ offset: viewOffsetRef.current, scale: viewScaleRef.current });
    return () => {
      if (viewApplyRafRef.current != null) {
        window.cancelAnimationFrame(viewApplyRafRef.current);
        viewApplyRafRef.current = null;
      }
      if (panRafRef.current != null) {
        window.cancelAnimationFrame(panRafRef.current);
        panRafRef.current = null;
      }
      if (pinchRafRef.current != null) {
        window.cancelAnimationFrame(pinchRafRef.current);
        pinchRafRef.current = null;
      }
      viewPendingRef.current = null;
      if (viewSaveTimerRef.current) {
        window.clearTimeout(viewSaveTimerRef.current);
        viewSaveTimerRef.current = null;
      }
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
      const nextScale = clampViewScale((scale ?? 1) * VIEW_SCALE_BASE);
      scheduleApplyViewVars({ offset: nextOffset, scale: nextScale });
      setViewOffset(nextOffset);
    };

    if (saved.v === 2 && saved.offset) {
      didRestoreViewRef.current = true;
      apply(saved.offset, saved.scale);
      return;
    }

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

  const onWheelZoom = useCallback(
    (e) => {
      e.preventDefault();
      const p = getCanvasPoint(e);
      const off = viewOffsetRef.current;
      const curScale = viewScaleRef.current || 1;
      const nextScale = clampViewScale(curScale * Math.exp(-e.deltaY * 0.0015));
      if (Math.abs(nextScale - curScale) < 1e-4) return;

      const d = { x: (p.x - off.x) / curScale, y: (p.y - off.y) / curScale };
      const nextOffset = { x: p.x - d.x * nextScale, y: p.y - d.y * nextScale };
      scheduleApplyViewVars({ offset: nextOffset, scale: nextScale });
      persistViewDebounced({ offset: nextOffset, scale: nextScale });
    },
    [getCanvasPoint, scheduleApplyViewVars, persistViewDebounced]
  );

  const zoomAtCenter = useCallback(
    (direction) => {
      const node = canvasRef.current;
      if (!node) return;
      const rect = node.getBoundingClientRect();
      const p = { x: rect.width / 2, y: rect.height / 2 };
      const off = viewOffsetRef.current;
      const curScale = viewScaleRef.current || 1;
      const nextScale = clampViewScale(
        direction === 'in' ? curScale * 1.12 : curScale / 1.12
      );
      const d = { x: (p.x - off.x) / curScale, y: (p.y - off.y) / curScale };
      const nextOffset = { x: p.x - d.x * nextScale, y: p.y - d.y * nextScale };
      scheduleApplyViewVars({ offset: nextOffset, scale: nextScale });
      setViewOffset(nextOffset);
      persistViewDebounced({ offset: nextOffset, scale: nextScale });
    },
    [scheduleApplyViewVars, persistViewDebounced]
  );

  const value = useMemo(
    () => ({
      VIEW_SCALE_BASE,
      canvasRef,
      zoomPctRef,
      viewOffsetRef,
      viewScaleRef,
      getCanvasPoint,
      getDeskPointFromClient,
      applyViewVarsNow,
      scheduleApplyViewVars,
      persistViewDebounced,
      setViewOffset,
      isPanning,
      setIsPanning,
      panStartRef,
      panRafRef,
      runPanFrame,
      ensurePanRaf,
      mobilePinchRef,
      pinchRafRef,
      runPinchFrame,
      ensurePinchRaf,
      stopViewportInteractions,
      onWheelZoom,
      zoomAtCenter,
      clampViewScale,
      formatViewScalePct,
    }),
    [
      getCanvasPoint,
      getDeskPointFromClient,
      applyViewVarsNow,
      scheduleApplyViewVars,
      persistViewDebounced,
      isPanning,
      runPanFrame,
      ensurePanRaf,
      runPinchFrame,
      ensurePinchRaf,
      stopViewportInteractions,
      onWheelZoom,
      zoomAtCenter,
    ]
  );

  return value;
}

export function Canvas({ deskIdKey, deskIdNum, loading, children }) {
  const viewport = useCanvasViewportState(deskIdKey, deskIdNum, loading);
  return (
    <CanvasViewportContext.Provider value={viewport}>
      {children}
    </CanvasViewportContext.Provider>
  );
}
