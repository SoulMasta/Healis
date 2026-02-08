import { rectFromPoints } from '../../../utils/geometry';

export function createSelectTool(ctx) {
  const {
    getCanvasPoint,
    viewOffsetRef,
    viewScaleRef,
    selectStartRef,
    setSelectionRect,
    selectRafRef,
    selectPendingEndRef,
    elementsRef,
    setSelectedElementIds,
    setEditingElementId,
    setSelectedMaterialBlockId,
    idKey,
  } = ctx;

  return {
    onPointerDown(e, deskP, canvasP) {
      if (ctx.isMobile && e.pointerType === 'touch') {
        selectStartRef.current = null;
        setSelectionRect(null);
        return;
      }
      selectStartRef.current = canvasP;
      setSelectionRect({ left: canvasP.x, top: canvasP.y, width: 0, height: 0 });
    },
    onPointerMove(e) {
      if (!selectStartRef.current) return;
      const p = getCanvasPoint(e);
      setSelectionRect(rectFromPoints(selectStartRef.current, p));

      selectPendingEndRef.current = p;
      if (selectRafRef.current == null) {
        selectRafRef.current = window.requestAnimationFrame(() => {
          selectRafRef.current = null;
          const start = selectStartRef.current;
          const end = selectPendingEndRef.current;
          if (!start || !end) return;
          const rect = rectFromPoints(start, end);
          const minSize = 4;
          if (rect.width < minSize && rect.height < minSize) {
            setSelectedElementIds(new Set());
            setEditingElementId(null);
            setSelectedMaterialBlockId(null);
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
          setSelectedMaterialBlockId(null);
        });
      }
    },
    onPointerUp(e) {
      const start = selectStartRef.current;
      if (!start) return;
      const end = getCanvasPoint(e);
      const rect = rectFromPoints(start, end);
      const minSize = 4;
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
          const intersects = ex <= right && ex + ew >= left && ey <= bottom && ey + eh >= top;
          if (!intersects) continue;
          hits.push(idKey(el.id));
        }

        setSelectedElementIds(new Set(hits));
        setSelectedMaterialBlockId(null);
        if (hits.length !== 1) setEditingElementId(null);
      }
    },
    cancel() {
      selectStartRef.current = null;
      setSelectionRect(null);
    },
  };
}
