import { createElementOnDesk } from '../../../http/elementsAPI';

export function createPenTool(ctx) {
  const {
    getCanvasPoint,
    viewOffsetRef,
    viewScaleRef,
    brushColor,
    brushWidth,
    liveStrokeRef,
    setLiveStroke,
    setElements,
    pushHistory,
    applyingHistoryRef,
    createdElementIdsRef,
    elementToVm,
    snapshotForHistory,
    workspace,
    deskIdParam: id,
    interactionRef,
  } = ctx;

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
        setElements((prev) => ctx.upsertById(prev, vm));
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
      ctx.setActionError?.(err?.response?.data?.error || err?.message || 'Failed to save drawing');
      window.setTimeout(() => ctx.setActionError?.(null), 4500);
    }
  };

  return {
    onPointerDown(e, deskP) {
      const stroke = { points: [{ x: deskP.x, y: deskP.y }], color: brushColor, width: brushWidth };
      liveStrokeRef.current = stroke;
      setLiveStroke(stroke);
    },
    onPointerMove(e) {
      if (!liveStrokeRef.current) return;
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
      if (!interactionRef.current || interactionRef.current.kind !== 'draw') {
        interactionRef.current = { kind: 'draw' };
      }
      if (!interactionRef.current.raf) {
        interactionRef.current.raf = window.requestAnimationFrame(() => {
          interactionRef.current.raf = null;
          setLiveStroke({ ...stroke, points: [...stroke.points] });
        });
      }
    },
    onPointerUp() {
      finalizeStroke();
    },
    cancel() {
      liveStrokeRef.current = null;
      setLiveStroke(null);
    },
    finalizeStroke,
  };
}
