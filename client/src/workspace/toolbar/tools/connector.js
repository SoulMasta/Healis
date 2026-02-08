export function createConnectorTool(ctx) {
  const { getCanvasPoint, viewOffsetRef, viewScaleRef, pickHoverElementId, pickHoverBlockId, setConnectorHoverElementId, setConnectorHoverBlockId, isMobile } = ctx;

  return {
    onPointerMove(e) {
      const p = getCanvasPoint(e);
      const off = viewOffsetRef.current;
      const s = viewScaleRef.current || 1;
      const deskP = { x: (p.x - off.x) / s, y: (p.y - off.y) / s };
      const hoverId = pickHoverElementId(deskP, isMobile ? 24 : 15);
      const hoverBlockId = pickHoverBlockId(deskP, isMobile ? 24 : 15);
      setConnectorHoverElementId(hoverId);
      setConnectorHoverBlockId(hoverBlockId);
    },
  };
}
