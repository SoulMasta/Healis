import { useCallback, useRef, useState } from 'react';
import { createElementOnDesk, updateElement, deleteElement } from '../../http/elementsAPI';

export function useWorkspaceHistory({
  setElements,
  setEditingElementId,
  setSelectedElementIds,
  elementToVm,
  snapshotForHistory,
  snapshotEquals,
  workspace,
  deskIdParam: id,
  setActionError,
  idKey,
  sameId,
  upsertById,
} = {}) {
  const historyRef = useRef({ past: [], future: [] });
  const createdElementIdsRef = useRef(new Set());
  const applyingHistoryRef = useRef(false);
  const [historyMeta, setHistoryMeta] = useState({ canUndo: false, canRedo: false });

  const updateHistoryMeta = useCallback(() => {
    const { past, future } = historyRef.current;
    setHistoryMeta({ canUndo: past.length > 0, canRedo: future.length > 0 });
  }, []);

  const pushHistory = useCallback(
    (entry) => {
      if (!entry) return;
      const store = historyRef.current;
      store.past.push(entry);
      if (store.past.length > 10) store.past.splice(0, store.past.length - 10);
      store.future = [];
      updateHistoryMeta();
    },
    [updateHistoryMeta]
  );

  const applySnapshot = useCallback(
    async (snap) => {
      if (!snap?.elementId) return;
      applyingHistoryRef.current = true;
      setActionError?.(null);
      try {
        const updated = await updateElement(snap.elementId, {
          x: snap.x,
          y: snap.y,
          width: snap.width,
          height: snap.height,
          rotation: snap.rotation,
          zIndex: snap.zIndex,
          payload: snap.payload,
        });
        const vm = elementToVm?.(updated);
        setElements?.((prev) => prev.map((x) => (sameId(x.id, vm.id) ? { ...x, ...vm, content: vm.content ?? x.content } : x)));
      } catch (err) {
        setActionError?.(err?.response?.data?.error || err?.message || 'Failed to apply history change');
        window.setTimeout(() => setActionError?.(null), 4500);
      } finally {
        applyingHistoryRef.current = false;
      }
    },
    [setElements, setActionError, elementToVm, sameId]
  );

  const restoreDeletedElement = useCallback(
    async (entry) => {
      const snap = entry?.snapshot;
      const deskId = entry?.deskId ?? workspace?.id ?? workspace?.deskId ?? id;
      if (!deskId || !snap?.type) return;
      applyingHistoryRef.current = true;
      setActionError?.(null);
      try {
        const created = await createElementOnDesk(deskId, {
          type: snap.type,
          x: snap.x,
          y: snap.y,
          width: snap.width,
          height: snap.height,
          rotation: snap.rotation ?? 0,
          zIndex: snap.zIndex ?? 0,
          payload: snap.payload,
        });
        const vm = elementToVm?.(created);
        if (vm?.id) {
          entry.elementId = vm.id;
          entry.snapshot = { ...snap, elementId: vm.id };
          setElements?.((prev) => upsertById(prev, vm));
        }
      } catch (err) {
        setActionError?.(err?.response?.data?.error || err?.message || 'Failed to restore deleted element');
        window.setTimeout(() => setActionError?.(null), 4500);
      } finally {
        applyingHistoryRef.current = false;
      }
    },
    [workspace, id, setElements, setActionError, elementToVm, upsertById]
  );

  const deleteElementFromHistory = useCallback(
    async (entry, opts = {}) => {
      const elementId = entry?.elementId;
      if (!elementId) return;
      applyingHistoryRef.current = true;
      setActionError?.(null);
      try {
        await deleteElement(elementId);
        setEditingElementId?.((cur) => (cur === elementId ? null : cur));
        setSelectedElementIds?.((cur) => {
          const k = idKey?.(elementId);
          if (!k || !cur?.has?.(k)) return cur;
          const next = new Set(cur);
          next.delete(k);
          return next;
        });
        setElements?.((prev) => prev.filter((x) => !sameId(x.id, elementId)));
      } catch (err) {
        setActionError?.(err?.response?.data?.error || err?.message || opts.errorMessage || 'Failed to apply history delete');
        window.setTimeout(() => setActionError?.(null), 4500);
      } finally {
        applyingHistoryRef.current = false;
      }
    },
    [setElements, setEditingElementId, setSelectedElementIds, setActionError, idKey, sameId]
  );

  const undo = useCallback(async () => {
    const store = historyRef.current;
    const entry = store.past.pop();
    if (!entry) return;
    store.future.push(entry);
    updateHistoryMeta();
    if (entry.kind === 'update-element') {
      await applySnapshot(entry.before);
      return;
    }
    if (entry.kind === 'delete-element') {
      await restoreDeletedElement(entry);
      return;
    }
    if (entry.kind === 'create-element') {
      await deleteElementFromHistory(entry, { errorMessage: 'Failed to undo create' });
    }
  }, [updateHistoryMeta, applySnapshot, restoreDeletedElement, deleteElementFromHistory]);

  const redo = useCallback(async () => {
    const store = historyRef.current;
    const entry = store.future.pop();
    if (!entry) return;
    store.past.push(entry);
    updateHistoryMeta();
    if (entry.kind === 'update-element') {
      await applySnapshot(entry.after);
      return;
    }
    if (entry.kind === 'delete-element') {
      await deleteElementFromHistory(entry, { errorMessage: 'Failed to redo delete' });
      return;
    }
    if (entry.kind === 'create-element') {
      await restoreDeletedElement(entry);
    }
  }, [updateHistoryMeta, applySnapshot, restoreDeletedElement, deleteElementFromHistory]);

  return {
    historyMeta,
    pushHistory,
    undo,
    redo,
    historyRef,
    applyingHistoryRef,
    createdElementIdsRef,
  };
}
