import { useCallback, useEffect, useRef } from 'react';
import { idKey, sameId } from '../../workspace/useWorkspace';

export function useElementFrame(opts) {
  const {
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
  } = opts;

  const dragVisualPendingRef = useRef(null);
  const dragVisualRafRef = useRef(null);
  const pendingLocalElementPatchesRef = useRef(new Map());
  const localElementPatchRafRef = useRef(null);

  const flushLocalElementPatches = useCallback(() => {
    localElementPatchRafRef.current = null;
    const patches = pendingLocalElementPatchesRef.current;
    if (!patches.size) return;
    setElements((prev) => {
      let didChange = false;
      const next = prev.map((el) => {
        const k = idKey(el?.id);
        if (!k) return el;
        const patch = patches.get(k);
        if (!patch) return el;
        didChange = true;
        return { ...el, ...patch };
      });
      return didChange ? next : prev;
    });
    patches.clear();
  }, [setElements]);

  const updateLocalElement = useCallback(
    (elementId, patch) => {
      if (!elementId || !patch) return;
      const k = idKey(elementId);
      if (!k) return;
      const patches = pendingLocalElementPatchesRef.current;
      const prev = patches.get(k);
      patches.set(k, prev ? { ...prev, ...patch } : patch);
      if (localElementPatchRafRef.current == null) {
        localElementPatchRafRef.current = window.requestAnimationFrame(flushLocalElementPatches);
      }
    },
    [flushLocalElementPatches]
  );

  const flushDragVisual = useCallback(() => {
    dragVisualRafRef.current = null;
    const pending = dragVisualPendingRef.current;
    if (!pending?.elementKey) return;
    const node = elementNodeCacheRef.current.get(pending.elementKey);
    if (!node) return;
    node.style.transform = `translate3d(${pending.x}px, ${pending.y}px, 0) rotate(${pending.rotation ?? 0}deg)`;
  }, [elementNodeCacheRef]);

  const scheduleDragVisual = useCallback(
    (elementKey, x, y, rotation) => {
      if (!elementKey) return;
      dragVisualPendingRef.current = { elementKey, x, y, rotation: Number(rotation ?? 0) };
      if (dragVisualRafRef.current == null) {
        dragVisualRafRef.current = window.requestAnimationFrame(flushDragVisual);
      }
    },
    [flushDragVisual]
  );

  const maybeStartElementDrag = useCallback(
    (elementId, pointerDownEvent) => {
      if (pointerDownEvent.pointerType === 'mouse' && pointerDownEvent.button !== 0) return;
      if (interactionRef.current) return;

      const el = elementsRef.current.find((x) => sameId(x.id, elementId));
      if (!el) return;

      const before = snapshotForHistory(el);
      const startX = pointerDownEvent.clientX;
      const startY = pointerDownEvent.clientY;
      const pointerId = pointerDownEvent.pointerId;
      const threshold = 10;

      const cleanup = (onMove, onUp) => {
        window.removeEventListener('pointermove', onMove, true);
        window.removeEventListener('pointerup', onUp, true);
      };

      const beginDragNow = () => {
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
          const s = Number(viewScaleRef.current || 1) || 1;
          const dx = (ev.clientX - cur.startX) / s;
          const dy = (ev.clientY - cur.startY) / s;
          const nextX = cur.origin.x + dx;
          const nextY = cur.origin.y + dy;
          cur.latest = { x: nextX, y: nextY };
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
              if (cur?.elementKey) {
                const n = elementNodeCacheRef.current.get(cur.elementKey);
                if (n) n.style.willChange = '';
              }
              if (dragVisualRafRef.current != null) {
                window.cancelAnimationFrame(dragVisualRafRef.current);
                dragVisualRafRef.current = null;
              }
              dragVisualPendingRef.current = cur?.elementKey
                ? { elementKey: cur.elementKey, x: latestPos.x, y: latestPos.y, rotation: cur?.rotation ?? 0 }
                : null;
              flushDragVisual();
              dragVisualPendingRef.current = null;
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
        if (isMobile && mobileSuppressDragPointerIdRef?.current === pointerId) {
          cleanup(onMove, onUp);
          return;
        }
        const dx = ev.clientX - startX;
        const dy = ev.clientY - startY;
        if (dx * dx + dy * dy < threshold * threshold) return;
        cleanup(onMove, onUp);
        beginDragNow();
      };

      const onUp = (ev) => {
        if (ev.pointerId !== pointerId) return;
        cleanup(onMove, onUp);
        if (isMobile && mobileSuppressDragPointerIdRef?.current === pointerId) {
          mobileSuppressDragPointerIdRef.current = null;
        }
      };

      window.addEventListener('pointermove', onMove, true);
      window.addEventListener('pointerup', onUp, true);
    },
    [
      elementsRef,
      interactionRef,
      setConnectorsFollowDuringDrag,
      suppressNextElementClickRef,
      elementNodeCacheRef,
      viewScaleRef,
      scheduleDragVisual,
      updateLocalElement,
      setElements,
      persistElement,
      snapshotForHistory,
      isMobile,
      mobileSuppressDragPointerIdRef,
      flushDragVisual,
    ]
  );

  const startResize = useCallback(
    (elementId, handle, e) => {
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
        latest: { x: el.x, y: el.y, width: originW, height: originH },
        lockAspect,
        aspect,
      };

      const minW = el.type === 'frame' ? 80 : 120;
      const minH = el.type === 'text' ? 50 : el.type === 'frame' ? 60 : 80;

      const onMove = (ev) => {
        const cur = interactionRef.current;
        if (!cur || cur.kind !== 'resize' || cur.elementId !== elementId) return;
        const s = Number(viewScaleRef.current || 1) || 1;
        const dx = (ev.clientX - cur.startX) / s;
        const dy = (ev.clientY - cur.startY) / s;
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
        cur.latest = { x, y, width, height };
        setElementResizeOffset?.((prev) => ({ ...prev, [elementId]: { x, y, width, height } }));
      };

      const onUp = async () => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        const cur = interactionRef.current;
        interactionRef.current = null;
        setConnectorsFollowDuringDrag(false);
        setElementResizeOffset?.((prev) => {
          const next = { ...prev };
          delete next[elementId];
          return next;
        });
        const latestDims = cur?.kind === 'resize' && sameId(cur?.elementId, elementId) ? cur.latest : null;
        const base = elementsRef.current.find((x) => sameId(x.id, elementId));
        const latest = base && latestDims ? { ...base, ...latestDims } : base;
        if (latest) {
          try {
            if (latestDims) {
              setElements((prev) => prev.map((el) => (sameId(el.id, elementId) ? { ...el, ...latestDims } : el)));
            }
            await persistElement(latest, { historyBefore: before });
          } catch {
            // ignore
          }
        }
      };

      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp, { once: true });
    },
    [
      elements,
      interactionRef,
      setConnectorsFollowDuringDrag,
      snapshotForHistory,
      setElementResizeOffset,
      elementsRef,
      persistElement,
      setElements,
      viewScaleRef,
    ]
  );

  const focusElement = useCallback(
    (elementId) => {
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
    },
    [elementsRef, elements, canvasRef, viewScaleRef, scheduleApplyViewVars, setViewOffset, persistViewDebounced]
  );

  const getNextZIndex = useCallback(() => {
    const list = elementsRef.current || [];
    return Math.round(list.reduce((m, el) => Math.max(m, el?.zIndex ?? 0), 0) + 1);
  }, [elementsRef]);

  const getMinZIndex = useCallback(() => {
    const list = elementsRef.current || [];
    const min = list.reduce((m, el) => Math.min(m, el?.zIndex ?? 0), 0);
    return min - 1;
  }, [elementsRef]);

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
      if (dragVisualRafRef.current != null) {
        window.cancelAnimationFrame(dragVisualRafRef.current);
        dragVisualRafRef.current = null;
      }
      dragVisualPendingRef.current = null;
    };
  }, []);

  return {
    maybeStartElementDrag,
    startResize,
    scheduleDragVisual,
    updateLocalElement,
    focusElement,
    getNextZIndex,
    getMinZIndex,
  };
}
