export function createHandTool(ctx) {
  const {
    panStartRef,
    setIsPanning,
    ensurePanRaf,
    viewOffsetRef,
    pushInputDebug,
    inputDebugEnabled,
  } = ctx;

  return {
    onPointerDown(e) {
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
      if (inputDebugEnabled) pushInputDebug('pan.start', { fromTool: 'hand', pid: e.pointerId });
    },
  };
}
