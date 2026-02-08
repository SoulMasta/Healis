export function createNoteTool(ctx) {
  const { createNoteOrTextAtDeskPointRef } = ctx;

  return {
    onPointerDown(e, deskP) {
      createNoteOrTextAtDeskPointRef?.current?.('note', deskP, { beginEdit: true });
    },
  };
}
