import { rectFromPoints } from '../../../utils/geometry';

const MIN_FRAME_SIZE = 24;

export function createFrameTool(ctx) {
  const {
    getCanvasPoint,
    viewOffsetRef,
    viewScaleRef,
    setLiveFrameRect,
    createFrameAtDeskRectRef,
    isMobile,
    setActiveTool,
  } = ctx;
  const frameStartRef = { current: null };

  return {
    onPointerDown(e, deskP, canvasP) {
      frameStartRef.current = canvasP;
      setLiveFrameRect({ left: canvasP.x, top: canvasP.y, width: 0, height: 0 });
    },
    onPointerMove(e) {
      if (!frameStartRef.current) return;
      const p = getCanvasPoint(e);
      const rect = rectFromPoints(frameStartRef.current, p);
      setLiveFrameRect(rect);
    },
    onPointerUp(e) {
      const start = frameStartRef.current;
      frameStartRef.current = null;
      setLiveFrameRect(null);
      if (!start) return;
      const p = getCanvasPoint(e);
      const rect = rectFromPoints(start, p);
      if (rect.width < MIN_FRAME_SIZE && rect.height < MIN_FRAME_SIZE) return;
      const off = viewOffsetRef.current;
      const s = viewScaleRef.current || 1;
      const deskRect = {
        left: (rect.left - off.x) / s,
        top: (rect.top - off.y) / s,
        width: rect.width / s,
        height: rect.height / s,
      };
      createFrameAtDeskRectRef?.current?.(deskRect);
      if (isMobile) setActiveTool('hand');
    },
    cancel() {
      frameStartRef.current = null;
      setLiveFrameRect(null);
    },
  };
}
