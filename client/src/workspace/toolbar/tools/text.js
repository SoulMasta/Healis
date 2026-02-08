export function createTextTool(ctx) {
  const { createNoteOrTextAtDeskPointRef } = ctx;

  return {
    onPointerDown(e, deskP) {
      createNoteOrTextAtDeskPointRef?.current?.('text', deskP, { beginEdit: true });
    },
  };
}
