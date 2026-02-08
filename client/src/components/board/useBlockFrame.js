import { useCallback, useEffect, useRef } from 'react';

export function useBlockFrame(opts) {
  const {
    setMaterialBlocks,
    setMaterialBlockDragOffset,
    setSelectedMaterialBlockId,
    materialBlockNodeRef,
    materialBlockInteractionRef,
    viewScaleRef,
    updateMaterialBlock,
  } = opts;

  const dragPendingRef = useRef(null);
  const dragRafRef = useRef(null);

  const flushDragVisual = useCallback(() => {
    dragRafRef.current = null;
    const pending = dragPendingRef.current;
    if (!pending?.blockId) return;
    const node = materialBlockNodeRef.current.get(pending.blockId);
    if (!node) return;
    node.style.transform = `translate3d(${pending.x}px, ${pending.y}px, 0)`;
  }, [materialBlockNodeRef]);

  const scheduleDragVisual = useCallback(
    (blockId, x, y) => {
      if (!blockId) return;
      dragPendingRef.current = { blockId, x, y };
      if (dragRafRef.current == null) {
        dragRafRef.current = window.requestAnimationFrame(flushDragVisual);
      }
    },
    [flushDragVisual]
  );

  const startBlockDrag = useCallback(
    (e, block) => {
      e.stopPropagation();
      e.preventDefault();
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      if (materialBlockInteractionRef.current) return;
      const startX = e.clientX;
      const startY = e.clientY;
      const blockId = block.id;
      const pointerId = e.pointerId;
      const threshold = 10;

      const node = materialBlockNodeRef.current.get(blockId);
      if (node) {
        node.style.willChange = 'transform';
        try {
          node.setPointerCapture(pointerId);
        } catch (_) {}
      }

      const beginDragNow = () => {
        materialBlockInteractionRef.current = {
          kind: 'drag',
          blockId,
          pointerId,
          startX,
          startY,
          origin: { x: block.x, y: block.y },
          latest: { x: block.x, y: block.y },
        };
        setSelectedMaterialBlockId(blockId);
        if (node) node.style.cursor = 'grabbing';
      };

      const onMove = (ev) => {
        const cur = materialBlockInteractionRef.current;
        if (!cur || cur.kind !== 'drag' || cur.blockId !== blockId) return;
        if (cur.pointerId != null && ev.pointerId != null && ev.pointerId !== cur.pointerId) return;
        const s = Number(viewScaleRef.current || 1) || 1;
        const dx = (ev.clientX - cur.startX) / s;
        const dy = (ev.clientY - cur.startY) / s;
        const latest = { x: cur.origin.x + dx, y: cur.origin.y + dy };
        cur.latest = latest;
        scheduleDragVisual(blockId, latest.x, latest.y);
      };

      const onUp = () => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        const cur = materialBlockInteractionRef.current;
        materialBlockInteractionRef.current = null;
        const latest = cur?.kind === 'drag' && cur?.blockId === blockId ? cur.latest : null;

        if (node) {
          node.style.willChange = '';
          node.style.cursor = '';
          try {
            node.releasePointerCapture(pointerId);
          } catch (_) {}
        }
        if (dragRafRef.current != null) {
          window.cancelAnimationFrame(dragRafRef.current);
          dragRafRef.current = null;
        }
        dragPendingRef.current = latest ? { blockId, x: latest.x, y: latest.y } : null;
        flushDragVisual();
        dragPendingRef.current = null;

        setMaterialBlockDragOffset((prev) => {
          const next = { ...prev };
          delete next[blockId];
          return next;
        });
        if (latest) {
          setMaterialBlocks((prev) => prev.map((b) => (b.id === blockId ? { ...b, x: latest.x, y: latest.y } : b)));
          updateMaterialBlock(blockId, { x: Math.round(latest.x), y: Math.round(latest.y) })
            .then((updated) => {
              setMaterialBlocks((prev) => prev.map((b) => (b.id === blockId ? { ...b, ...updated } : b)));
            })
            .catch(() => {});
        }
      };

      const onFirstMove = (ev) => {
        if (ev.pointerId !== pointerId) return;
        const dx = ev.clientX - startX;
        const dy = ev.clientY - startY;
        if (dx * dx + dy * dy < threshold * threshold) return;
        window.removeEventListener('pointermove', onFirstMove);
        window.removeEventListener('pointerup', onFirstUp);
        beginDragNow();
        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp, { once: true });
      };

      const onFirstUp = () => {
        window.removeEventListener('pointermove', onFirstMove, true);
        window.removeEventListener('pointerup', onFirstUp, true);
        if (node) {
          node.style.willChange = '';
          node.style.cursor = '';
          try {
            node.releasePointerCapture(pointerId);
          } catch (_) {}
        }
      };

      window.addEventListener('pointermove', onFirstMove, true);
      window.addEventListener('pointerup', onFirstUp, true);
    },
    [
      materialBlockInteractionRef,
      materialBlockNodeRef,
      viewScaleRef,
      scheduleDragVisual,
      setSelectedMaterialBlockId,
      setMaterialBlockDragOffset,
      setMaterialBlocks,
      updateMaterialBlock,
      flushDragVisual,
    ]
  );

  const startBlockResize = useCallback(
    (e, block, handle) => {
      e.stopPropagation();
      e.preventDefault();
      if (materialBlockInteractionRef.current) return;
      const startX = e.clientX;
      const startY = e.clientY;
      const blockId = block.id;
      const origin = { x: block.x, y: block.y, width: block.width || 280, height: block.height || 160 };
      materialBlockInteractionRef.current = {
        kind: 'resize',
        blockId,
        handle,
        startX,
        startY,
        origin,
        latest: { ...origin },
      };
      setSelectedMaterialBlockId(blockId);

      const minW = 160;
      const minH = 120;
      const maxW = 600;
      const maxH = 400;

      const onMove = (ev) => {
        const cur = materialBlockInteractionRef.current;
        if (!cur || cur.kind !== 'resize' || cur.blockId !== blockId) return;
        const s = Number(viewScaleRef.current || 1) || 1;
        const dx = (ev.clientX - cur.startX) / s;
        const dy = (ev.clientY - cur.startY) / s;
        let { x, y, width, height } = cur.origin;
        const left = ['nw', 'w', 'sw'].includes(cur.handle);
        const right = ['ne', 'e', 'se'].includes(cur.handle);
        const top = ['nw', 'n', 'ne'].includes(cur.handle);
        const bottom = ['sw', 's', 'se'].includes(cur.handle);
        if (right) width = Math.min(maxW, Math.max(minW, width + dx));
        if (left) width = Math.min(maxW, Math.max(minW, width - dx));
        if (bottom) height = Math.min(maxH, Math.max(minH, height + dy));
        if (top) height = Math.min(maxH, Math.max(minH, height - dy));
        if (left) x = cur.origin.x + (cur.origin.width - width);
        if (top) y = cur.origin.y + (cur.origin.height - height);
        cur.latest = { x, y, width, height };
        setMaterialBlockDragOffset((prev) => ({ ...prev, [blockId]: { x, y, width, height } }));
      };
      const onUp = () => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        const cur = materialBlockInteractionRef.current;
        materialBlockInteractionRef.current = null;
        const latest = cur?.kind === 'resize' && cur?.blockId === blockId ? cur.latest : null;
        setMaterialBlockDragOffset((prev) => {
          const next = { ...prev };
          delete next[blockId];
          return next;
        });
        if (latest && (latest.width !== origin.width || latest.height !== origin.height || latest.x !== origin.x || latest.y !== origin.y)) {
          updateMaterialBlock(blockId, {
            x: Math.round(latest.x),
            y: Math.round(latest.y),
            width: Math.round(latest.width),
            height: Math.round(latest.height),
          })
            .then((updated) => {
              setMaterialBlocks((prev) => prev.map((b) => (b.id === blockId ? { ...b, ...updated } : b)));
            })
            .catch(() => {});
        }
      };
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp, { once: true });
    },
    [
      materialBlockInteractionRef,
      setSelectedMaterialBlockId,
      setMaterialBlockDragOffset,
      setMaterialBlocks,
      updateMaterialBlock,
      viewScaleRef,
    ]
  );

  useEffect(() => {
    return () => {
      if (dragRafRef.current != null) {
        window.cancelAnimationFrame(dragRafRef.current);
        dragRafRef.current = null;
      }
      dragPendingRef.current = null;
    };
  }, []);

  return { startBlockDrag, startBlockResize };
}
