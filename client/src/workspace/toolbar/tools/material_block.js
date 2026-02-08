import { createMaterialBlock } from '../../../http/materialBlocksAPI';

export function createMaterialBlockTool(ctx) {
  const {
    workspace,
    deskIdParam: id,
    setMaterialBlocks,
    setSelectedMaterialBlockId,
    setActionError,
    isMobile,
    setActiveTool,
  } = ctx;

  return {
    onPointerDown(e, deskP) {
      const deskId = workspace?.id ?? workspace?.deskId ?? id;
      if (!deskId) return;
      setActionError?.(null);
      createMaterialBlock(deskId, { x: Math.round(deskP.x), y: Math.round(deskP.y) })
        .then((newBlock) => {
          setMaterialBlocks((prev) => [...prev, newBlock]);
          setSelectedMaterialBlockId(newBlock.id);
          if (isMobile) setActiveTool('hand');
        })
        .catch((err) => {
          setActionError?.(err?.response?.data?.error || err?.message || 'Не удалось создать блок');
          window.setTimeout(() => setActionError?.(null), 4000);
        });
    },
  };
}
