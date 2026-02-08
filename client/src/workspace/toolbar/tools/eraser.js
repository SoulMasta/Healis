import { deleteElement } from '../../../http/elementsAPI';
import { distToSegmentSquared } from '../../../utils/geometry';

export function createEraserTool(ctx) {
  const {
    getCanvasPoint,
    viewOffsetRef,
    viewScaleRef,
    brushWidth,
    eraseStateRef,
    elementsRef,
    setElements,
    pushHistory,
    applyingHistoryRef,
    elementToVm,
    snapshotForHistory,
    workspace,
    deskIdParam: id,
    sameId,
  } = ctx;

  return {
    onPointerDown() {
      eraseStateRef.current.active = true;
      eraseStateRef.current.lastTs = 0;
    },
    onPointerMove(e) {
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
        if (deskP.x < x - radius || deskP.x > x + w + radius || deskP.y < y - radius || deskP.y > y + h + radius)
          continue;

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
        deleteElement(el.id).catch(() => {});
      }
    },
    onPointerUp() {
      eraseStateRef.current.active = false;
      eraseStateRef.current.erasedIds = new Set();
    },
    cancel() {
      eraseStateRef.current.active = false;
      eraseStateRef.current.erasedIds = new Set();
    },
  };
}
