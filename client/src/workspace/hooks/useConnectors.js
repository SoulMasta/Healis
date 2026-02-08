import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createElementOnDesk } from '../../http/elementsAPI';

export function useConnectors({
  activeTool,
  elementsRef,
  materialBlocksRef,
  elements,
  getDeskPointFromClient,
  setElements,
  workspace,
  deskIdParam: id,
  setActionError,
  elementToVm,
  snapshotForHistory,
  snapshotEquals,
  pushHistory,
  applyingHistoryRef,
  createdElementIdsRef,
  isMobile,
  updateElement,
  updateLocalElementRef,
  canvasRef,
  elementNodeCacheRef,
  materialBlockNodeRef,
  getElementByIdFromRef,
  sameId,
  idKey,
  upsertById,
  setEditingElementId,
} = {}) {
  const [connectorHoverElementId, setConnectorHoverElementId] = useState(null);
  const [connectorDraft, setConnectorDraft] = useState(null);
  const [selectedConnectorId, setSelectedConnectorId] = useState(null);
  const [connectorsFollowDuringDrag, setConnectorsFollowDuringDrag] = useState(false);
  const [connectorHoverBlockId, setConnectorHoverBlockId] = useState(null);
  const connectorDraftRef = useRef(null);
  const connectorDraftRafRef = useRef(null);
  const stableConnectorsRef = useRef([]);

  useEffect(() => {
    if (activeTool === 'connector') return () => {};
    setConnectorHoverElementId(null);
    return () => {};
  }, [activeTool]);

  const isConnectableElement = (el) => Boolean(el?.id) && Boolean(el?.type) && el.type !== 'connector';

  const getAnchorPoint = useCallback((el, side) => {
    const OUTSET = 10;
    const x = Number(el?.x ?? 0);
    const y = Number(el?.y ?? 0);
    const w = Number(el?.width ?? 240);
    const h = Number(el?.height ?? 160);
    const s = String(side || 'right');
    let p = { x: x + w, y: y + h / 2 };
    let dir = { x: 1, y: 0 };
    if (s === 'top') {
      p = { x: x + w / 2, y };
      dir = { x: 0, y: -1 };
    } else if (s === 'bottom') {
      p = { x: x + w / 2, y: y + h };
      dir = { x: 0, y: 1 };
    } else if (s === 'left') {
      p = { x, y: y + h / 2 };
      dir = { x: -1, y: 0 };
    }
    return { x: p.x + dir.x * OUTSET, y: p.y + dir.y * OUTSET, dir };
  }, []);

  const pickHoverElementId = useCallback(
    (deskP, threshold = 15) => {
      const px = Number(deskP?.x ?? 0);
      const py = Number(deskP?.y ?? 0);
      const t = Math.max(0, Number(threshold ?? 0));
      let bestId = null;
      let bestD2 = Infinity;
      const list = elementsRef?.current || [];
      for (const el of list) {
        if (!isConnectableElement(el)) continue;
        const x = Number(el.x ?? 0);
        const y = Number(el.y ?? 0);
        const w = Number(el.width ?? 0);
        const h = Number(el.height ?? 0);
        if (px < x - t || px > x + w + t || py < y - t || py > y + h + t) continue;
        const dx = px < x ? x - px : px > x + w ? px - (x + w) : 0;
        const dy = py < y ? y - py : py > y + h ? py - (y + h) : 0;
        const d2 = dx * dx + dy * dy;
        if (d2 < bestD2) {
          bestD2 = d2;
          bestId = el.id;
        }
      }
      return bestId;
    },
    [elementsRef]
  );

  const pickHoverBlockId = useCallback(
    (deskP, threshold = 15) => {
      const px = Number(deskP?.x ?? 0);
      const py = Number(deskP?.y ?? 0);
      const t = Math.max(26, Math.max(0, Number(threshold ?? 0)));
      const blocks = materialBlocksRef?.current || [];
      for (const b of blocks) {
        const x = Number(b.x ?? 0);
        const y = Number(b.y ?? 0);
        const w = Math.max(160, Number(b.width ?? 280));
        const h = Math.max(120, Number(b.height ?? 160));
        if (px >= x - t && px <= x + w + t && py >= y - t && py <= y + h + t) return b.id;
      }
      return null;
    },
    [materialBlocksRef]
  );

  const pickSideAtPoint = useCallback(
    (el, deskP, radius = 14) => {
      if (!el?.id) return null;
      const px = Number(deskP?.x ?? 0);
      const py = Number(deskP?.y ?? 0);
      const r = Math.max(0, Number(radius ?? 0));
      const r2 = r * r;
      const sides = ['top', 'right', 'bottom', 'left'];
      let best = null;
      let bestD2 = Infinity;
      for (const side of sides) {
        const a = getAnchorPoint(el, side);
        const dx = px - a.x;
        const dy = py - a.y;
        const d2 = dx * dx + dy * dy;
        if (d2 <= r2 && d2 < bestD2) {
          bestD2 = d2;
          best = side;
        }
      }
      return best;
    },
    [getAnchorPoint]
  );

  const pickSideAtPointForBlock = useCallback(
    (block, deskP, radius = 14) => {
      if (!block?.id) return null;
      const rect = {
        x: Number(block.x ?? 0),
        y: Number(block.y ?? 0),
        w: Math.max(160, Number(block.width ?? 280)),
        h: Math.max(120, Number(block.height ?? 160)),
      };
      const px = Number(deskP?.x ?? 0);
      const py = Number(deskP?.y ?? 0);
      const r = Math.max(0, Number(radius ?? 0));
      const r2 = r * r;
      const sides = ['top', 'right', 'bottom', 'left'];
      let best = null;
      let bestD2 = Infinity;
      for (const side of sides) {
        const a = getAnchorPoint({ x: rect.x, y: rect.y, width: rect.w, height: rect.h }, side);
        const dx = px - a.x;
        const dy = py - a.y;
        const d2 = dx * dx + dy * dy;
        if (d2 <= r2 && d2 < bestD2) {
          bestD2 = d2;
          best = side;
        }
      }
      return best;
    },
    [getAnchorPoint]
  );

  const computeConnectorPathFromAnchors = useCallback((fromAnchor, toAnchor, bend) => {
    const p0 = { x: Number(fromAnchor?.x ?? 0), y: Number(fromAnchor?.y ?? 0) };
    const p3 = { x: Number(toAnchor?.x ?? 0), y: Number(toAnchor?.y ?? 0) };
    const d0 = fromAnchor?.dir || { x: 1, y: 0 };
    const d3 = toAnchor?.dir || { x: -1, y: 0 };
    const dx = p3.x - p0.x;
    const dy = p3.y - p0.y;
    const dist = Math.hypot(dx, dy);
    const len = Math.max(40, Math.min(240, dist * 0.35));
    const bx = Number(bend?.x ?? 0);
    const by = Number(bend?.y ?? 0);
    const mid = { x: (p0.x + p3.x) / 2, y: (p0.y + p3.y) / 2 };
    const c1 = { x: p0.x + Number(d0.x ?? 0) * len + bx * 0.5, y: p0.y + Number(d0.y ?? 0) * len + by * 0.5 };
    const c2 = { x: p3.x + Number(d3.x ?? 0) * len + bx * 0.5, y: p3.y + Number(d3.y ?? 0) * len + by * 0.5 };
    const d = `M ${p0.x} ${p0.y} C ${c1.x} ${c1.y} ${c2.x} ${c2.y} ${p3.x} ${p3.y}`;
    return { d, mid, handle: { x: mid.x + bx, y: mid.y + by }, p0, p3 };
  }, []);

  const flushConnectorDraft = useCallback(() => {
    connectorDraftRafRef.current = null;
    const cur = connectorDraftRef.current;
    setConnectorDraft(cur ? { ...cur, from: { ...cur.from }, toHover: { ...cur.toHover }, cursor: { ...cur.cursor } } : null);
  }, []);

  const setConnectorDraftNext = useCallback(
    (next) => {
      connectorDraftRef.current = next;
      if (connectorDraftRafRef.current == null) {
        connectorDraftRafRef.current = window.requestAnimationFrame(flushConnectorDraft);
      }
    },
    [flushConnectorDraft]
  );

  const cancelConnectorDraft = useCallback(() => {
    connectorDraftRef.current = null;
    setConnectorDraft(null);
    setConnectorHoverElementId(null);
    setConnectorHoverBlockId(null);
  }, []);

  const createConnectorOnDesk = useCallback(
    async ({ fromElementId, fromBlockId, fromSide, toElementId, toBlockId, toSide, bend }) => {
      const deskId = workspace?.id ?? workspace?.deskId ?? id;
      if (!deskId || !fromSide || !toSide) return;
      const hasFrom = fromElementId != null || fromBlockId != null;
      const hasTo = toElementId != null || toBlockId != null;
      if (!hasFrom || !hasTo) return;
      if (fromElementId != null && toElementId != null && Number(fromElementId) === Number(toElementId)) return;
      if (fromBlockId != null && toBlockId != null && String(fromBlockId) === String(toBlockId)) return;
      setActionError?.(null);
      try {
        const fromPayload = { side: String(fromSide) };
        if (fromElementId != null) fromPayload.elementId = Number(fromElementId);
        if (fromBlockId != null) fromPayload.blockId = fromBlockId;
        const toPayload = { side: String(toSide) };
        if (toElementId != null) toPayload.elementId = Number(toElementId);
        if (toBlockId != null) toPayload.blockId = toBlockId;
        const payload = {
          data: {
            v: 1,
            kind: 'connector',
            from: fromPayload,
            to: toPayload,
            bend: { x: Number(bend?.x ?? 0), y: Number(bend?.y ?? 0) },
            style: { color: '#0f172a', width: 2, arrowEnd: true },
          },
        };
        const created = await createElementOnDesk(deskId, {
          type: 'connector',
          x: 0,
          y: 0,
          width: 1,
          height: 1,
          zIndex: 0,
          payload,
        });
        const vm = elementToVm?.(created);
        if (vm?.id) createdElementIdsRef?.current?.add?.(vm.id);
        setElements?.((prev) => upsertById(prev, vm));
        setSelectedConnectorId(vm?.id ?? null);
        if (!applyingHistoryRef?.current) {
          const snap = snapshotForHistory?.(vm);
          if (deskId && snap) pushHistory?.({ kind: 'create-element', deskId, elementId: vm.id, snapshot: snap });
        }
      } catch (err) {
        setActionError?.(err?.response?.data?.error || err?.message || 'Failed to create connector');
        window.setTimeout(() => setActionError?.(null), 4500);
      }
    },
    [
      workspace,
      id,
      setActionError,
      elementToVm,
      createdElementIdsRef,
      setElements,
      upsertById,
      applyingHistoryRef,
      snapshotForHistory,
      pushHistory,
    ]
  );

  const startConnectorDrag = useCallback(
    (fromElementId, fromSide, e) => {
      if (!fromElementId || !fromSide) return;
      e.stopPropagation();
      e.preventDefault();
      setSelectedConnectorId(null);
      const pointerId = e.pointerId;
      const startDeskP = getDeskPointFromClient?.(e.clientX, e.clientY);
      const initial = {
        from: { elementId: fromElementId, side: String(fromSide) },
        toHover: { elementId: null, side: null },
        cursor: startDeskP,
      };
      setConnectorDraftNext(initial);
      setConnectorHoverElementId(fromElementId);
      const cleanup = (onMove, onUp) => {
        window.removeEventListener('pointermove', onMove, true);
        window.removeEventListener('pointerup', onUp, true);
      };
      const onMove = (ev) => {
        if (ev.pointerId !== pointerId) return;
        const deskP = getDeskPointFromClient?.(ev.clientX, ev.clientY);
        const hoverElId = pickHoverElementId(deskP, isMobile ? 24 : 15);
        const hoverBlockId = pickHoverBlockId(deskP, isMobile ? 24 : 15);
        const hoverEl = hoverElId ? (elementsRef?.current || []).find((x) => x?.id === hoverElId) : null;
        const elSide = hoverEl ? pickSideAtPoint(hoverEl, deskP, isMobile ? 26 : 18) : null;
        const blocks = materialBlocksRef?.current || [];
        const hoverBlock = hoverBlockId ? blocks.find((b) => b.id === hoverBlockId) : null;
        const blockSide = hoverBlock ? pickSideAtPointForBlock(hoverBlock, deskP, isMobile ? 26 : 18) : null;
        const toHover =
          hoverElId && elSide
            ? { elementId: hoverElId, blockId: null, side: elSide }
            : hoverBlockId && blockSide
              ? { elementId: null, blockId: hoverBlockId, side: blockSide }
              : { elementId: hoverElId || null, blockId: hoverBlockId || null, side: elSide || blockSide };
        setConnectorDraftNext({ from: initial.from, toHover, cursor: deskP });
        setConnectorHoverElementId(hoverElId || null);
        setConnectorHoverBlockId(hoverBlockId || null);
      };
      const onUp = async (ev) => {
        if (ev.pointerId !== pointerId) return;
        cleanup(onMove, onUp);
        const cur = connectorDraftRef.current;
        cancelConnectorDraft();
        if (!cur?.from?.side) return;
        const deskP = getDeskPointFromClient?.(ev.clientX, ev.clientY);
        const hoverElId = pickHoverElementId(deskP, isMobile ? 24 : 15);
        const hoverBlockId = pickHoverBlockId(deskP, isMobile ? 24 : 15);
        const hoverEl = hoverElId ? (elementsRef?.current || []).find((x) => x?.id === hoverElId) : null;
        const elSide = hoverEl ? pickSideAtPoint(hoverEl, deskP, isMobile ? 26 : 18) : null;
        const blocks = materialBlocksRef?.current || [];
        const hoverBlock = hoverBlockId ? blocks.find((b) => b.id === hoverBlockId) : null;
        const blockSide = hoverBlock ? pickSideAtPointForBlock(hoverBlock, deskP, isMobile ? 26 : 18) : null;
        const toId = hoverElId && elSide ? hoverElId : cur?.toHover?.elementId;
        const toBlockId = hoverBlockId && blockSide ? hoverBlockId : cur?.toHover?.blockId;
        const toSide = elSide || blockSide || cur?.toHover?.side;
        const hasTo = (toId != null || toBlockId != null) && toSide;
        if (!hasTo) return;
        await createConnectorOnDesk({
          fromElementId: cur.from.elementId ?? undefined,
          fromBlockId: cur.from.blockId ?? undefined,
          fromSide: cur.from.side,
          toElementId: toId ?? undefined,
          toBlockId: toBlockId ?? undefined,
          toSide,
          bend: { x: 0, y: 0 },
        });
      };
      window.addEventListener('pointermove', onMove, true);
      window.addEventListener('pointerup', onUp, true);
    },
    [
      getDeskPointFromClient,
      setConnectorDraftNext,
      cancelConnectorDraft,
      pickHoverElementId,
      pickHoverBlockId,
      pickSideAtPoint,
      pickSideAtPointForBlock,
      isMobile,
      elementsRef,
      materialBlocksRef,
      createConnectorOnDesk,
    ]
  );

  const startConnectorDragFromBlock = useCallback(
    (blockId, fromSide, e) => {
      if (!blockId || !fromSide) return;
      e.stopPropagation();
      e.preventDefault();
      setSelectedConnectorId(null);
      const pointerId = e.pointerId;
      const target = e.target;
      try {
        if (target?.setPointerCapture) target.setPointerCapture(pointerId);
      } catch (_) {}
      const startDeskP = getDeskPointFromClient?.(e.clientX, e.clientY);
      const initial = {
        from: { blockId, side: String(fromSide) },
        toHover: { elementId: null, blockId: null, side: null },
        cursor: startDeskP,
      };
      setConnectorDraftNext(initial);
      setConnectorHoverBlockId(blockId);
      const cleanup = (onMove, onUp) => {
        try {
          if (target?.releasePointerCapture) target.releasePointerCapture(pointerId);
        } catch (_) {}
        window.removeEventListener('pointermove', onMove, true);
        window.removeEventListener('pointerup', onUp, true);
      };
      const onMove = (ev) => {
        if (ev.pointerId !== pointerId) return;
        const deskP = getDeskPointFromClient?.(ev.clientX, ev.clientY);
        const hoverElId = pickHoverElementId(deskP, isMobile ? 24 : 15);
        const hoverBlockId = pickHoverBlockId(deskP, isMobile ? 24 : 15);
        const hoverEl = hoverElId ? (elementsRef?.current || []).find((x) => x?.id === hoverElId) : null;
        const elSide = hoverEl ? pickSideAtPoint(hoverEl, deskP, isMobile ? 26 : 18) : null;
        const blocks = materialBlocksRef?.current || [];
        const hoverBlock = hoverBlockId ? blocks.find((b) => b.id === hoverBlockId) : null;
        const blockSide = hoverBlock ? pickSideAtPointForBlock(hoverBlock, deskP, isMobile ? 26 : 18) : null;
        const toHover =
          hoverElId && elSide
            ? { elementId: hoverElId, blockId: null, side: elSide }
            : hoverBlockId && blockSide
              ? { elementId: null, blockId: hoverBlockId, side: blockSide }
              : { elementId: hoverElId || null, blockId: hoverBlockId || null, side: elSide || blockSide };
        setConnectorDraftNext({ from: initial.from, toHover, cursor: deskP });
        setConnectorHoverElementId(hoverElId || null);
        setConnectorHoverBlockId(hoverBlockId || null);
      };
      const onUp = async (ev) => {
        if (ev.pointerId !== pointerId) return;
        cleanup(onMove, onUp);
        const cur = connectorDraftRef.current;
        cancelConnectorDraft();
        if (!cur?.from?.side) return;
        const deskP = getDeskPointFromClient?.(ev.clientX, ev.clientY);
        const hoverElId = pickHoverElementId(deskP, isMobile ? 24 : 15);
        const hoverBlockId = pickHoverBlockId(deskP, isMobile ? 24 : 15);
        const hoverEl = hoverElId ? (elementsRef?.current || []).find((x) => x?.id === hoverElId) : null;
        const elSide = hoverEl ? pickSideAtPoint(hoverEl, deskP, isMobile ? 26 : 18) : null;
        const blocks = materialBlocksRef?.current || [];
        const hoverBlock = hoverBlockId ? blocks.find((b) => b.id === hoverBlockId) : null;
        const blockSide = hoverBlock ? pickSideAtPointForBlock(hoverBlock, deskP, isMobile ? 26 : 18) : null;
        const toId = hoverElId && elSide ? hoverElId : cur?.toHover?.elementId;
        const toBlockId = hoverBlockId && blockSide ? hoverBlockId : cur?.toHover?.blockId;
        const toSide = elSide || blockSide || cur?.toHover?.side;
        const hasTo = (toId != null || toBlockId != null) && toSide;
        if (!hasTo) return;
        await createConnectorOnDesk({
          fromBlockId: cur.from.blockId,
          fromSide: cur.from.side,
          toElementId: toId ?? undefined,
          toBlockId: toBlockId ?? undefined,
          toSide,
          bend: { x: 0, y: 0 },
        });
      };
      window.addEventListener('pointermove', onMove, true);
      window.addEventListener('pointerup', onUp, true);
    },
    [
      getDeskPointFromClient,
      setConnectorDraftNext,
      cancelConnectorDraft,
      pickHoverElementId,
      pickHoverBlockId,
      pickSideAtPoint,
      pickSideAtPointForBlock,
      isMobile,
      elementsRef,
      materialBlocksRef,
      createConnectorOnDesk,
    ]
  );

  const startConnectorBendDrag = useCallback(
    (connectorId, e) => {
      e.stopPropagation();
      e.preventDefault();
      setConnectorsFollowDuringDrag(true);
      const idNum = connectorId;
      const el = elementsRef?.current?.find?.((x) => x?.id === idNum) || elements?.find?.((x) => x?.id === idNum);
      if (!el) return;
      const before = snapshotForHistory?.(el);
      const pointerId = e.pointerId;
      const cleanup = (onMove, onUp) => {
        window.removeEventListener('pointermove', onMove, true);
        window.removeEventListener('pointerup', onUp, true);
      };
      const onMove = (ev) => {
        if (ev.pointerId !== pointerId) return;
        const curEl = elementsRef?.current?.find?.((x) => x?.id === idNum) || el;
        const data = curEl?.connector?.data || curEl?.Connector?.data || {};
        const from = data?.from || {};
        const to = data?.to || {};
        const list = elementsRef?.current || [];
        const fromEl = list.find((x) => x?.id === from.elementId);
        const toEl = list.find((x) => x?.id === to.elementId);
        if (!fromEl || !toEl) return;
        const a0 = getAnchorPoint(fromEl, from.side);
        const a1 = getAnchorPoint(toEl, to.side);
        const { mid } = computeConnectorPathFromAnchors(a0, a1, data?.bend);
        const deskP = getDeskPointFromClient?.(ev.clientX, ev.clientY);
        const nextBend = { x: deskP.x - mid.x, y: deskP.y - mid.y };
        const nextData = { ...data, bend: nextBend };
        const child = curEl?.connector ?? curEl?.Connector ?? {};
        const nextChild = { ...child, data: nextData };
        updateLocalElementRef?.current?.(idNum, { connector: nextChild, Connector: nextChild });
      };
      const onUp = async (ev) => {
        if (ev.pointerId !== pointerId) return;
        cleanup(onMove, onUp);
        setConnectorsFollowDuringDrag(false);
        const curEl = elementsRef?.current?.find?.((x) => x?.id === idNum) || el;
        const data = curEl?.connector?.data || curEl?.Connector?.data || {};
        try {
          const updated = await updateElement(idNum, { payload: { data } });
          const vm = elementToVm?.(updated);
          setElements?.((prev) => prev.map((x) => (sameId(x.id, vm.id) ? { ...x, ...vm } : x)));
          if (!applyingHistoryRef?.current && before) {
            const afterSnap = snapshotForHistory?.(vm);
            if (afterSnap && snapshotEquals?.(before, afterSnap) === false) {
              pushHistory?.({ kind: 'update-element', elementId: idNum, before, after: afterSnap });
            }
          }
        } catch {
          // ignore
        }
      };
      window.addEventListener('pointermove', onMove, true);
      window.addEventListener('pointerup', onUp, true);
    },
    [
      elementsRef,
      elements,
      snapshotForHistory,
      getDeskPointFromClient,
      getAnchorPoint,
      computeConnectorPathFromAnchors,
      updateLocalElementRef,
      updateElement,
      elementToVm,
      setElements,
      sameId,
      applyingHistoryRef,
      pushHistory,
      snapshotEquals,
    ]
  );

  const getLiveAnchorPoint = useCallback(
    (elementOrBlockId, side) => {
      const s = String(side || 'right');
      const OUTSET = 10;
      const anchorFromRect = (r) => {
        let ax = r.right;
        let ay = r.top + r.height / 2;
        let dir = { x: 1, y: 0 };
        if (s === 'top') {
          ax = r.left + r.width / 2;
          ay = r.top;
          dir = { x: 0, y: -1 };
        } else if (s === 'bottom') {
          ax = r.left + r.width / 2;
          ay = r.bottom;
          dir = { x: 0, y: 1 };
        } else if (s === 'left') {
          ax = r.left;
          ay = r.top + r.height / 2;
          dir = { x: -1, y: 0 };
        }
        const deskP = getDeskPointFromClient?.(ax, ay);
        return { x: Number(deskP?.x ?? 0) + dir.x * OUTSET, y: Number(deskP?.y ?? 0) + dir.y * OUTSET, dir };
      };
      if (typeof elementOrBlockId === 'string' && elementOrBlockId.startsWith('block:')) {
        const block = (materialBlocksRef?.current || []).find((b) => String(b.id) === String(elementOrBlockId.slice(6)));
        if (!block) return null;
        const node = materialBlockNodeRef?.current?.get?.(block.id);
        if (node && canvasRef?.current) return anchorFromRect(node.getBoundingClientRect());
        return getAnchorPoint(
          { x: block.x ?? 0, y: block.y ?? 0, width: Math.max(160, block.width ?? 280), height: Math.max(120, block.height ?? 160) },
          side
        );
      }
      const k = idKey?.(elementOrBlockId);
      if (!k) return null;
      const node = elementNodeCacheRef?.current?.get?.(k);
      if (node && canvasRef?.current) return anchorFromRect(node.getBoundingClientRect());
      const el = getElementByIdFromRef?.(elementOrBlockId);
      return el ? getAnchorPoint(el, side) : null;
    },
    [getDeskPointFromClient, getElementByIdFromRef, getAnchorPoint, materialBlocksRef, materialBlockNodeRef, canvasRef, elementNodeCacheRef, idKey]
  );

  const connectorElements = useMemo(() => {
    const next = (Array.isArray(elements) ? elements : []).filter((el) => el?.type === 'connector');
    const prev = stableConnectorsRef.current;
    if (prev.length === next.length && prev.every((x, i) => x === next[i])) return prev;
    stableConnectorsRef.current = next;
    return next;
  }, [elements]);

  const onSelectConnector = useCallback(
    (connectorId) => {
      setEditingElementId?.(null);
      setSelectedConnectorId(connectorId);
    },
    [setEditingElementId]
  );

  return {
    connectorHoverElementId,
    setConnectorHoverElementId,
    connectorDraft,
    setConnectorDraft,
    selectedConnectorId,
    setSelectedConnectorId,
    connectorsFollowDuringDrag,
    setConnectorsFollowDuringDrag,
    connectorHoverBlockId,
    setConnectorHoverBlockId,
    flushConnectorDraft,
    setConnectorDraftNext,
    cancelConnectorDraft,
    createConnectorOnDesk,
    startConnectorDrag,
    startConnectorDragFromBlock,
    startConnectorBendDrag,
    getAnchorPoint,
    pickHoverElementId,
    pickSideAtPoint,
    pickHoverBlockId,
    pickSideAtPointForBlock,
    computeConnectorPathFromAnchors,
    isConnectableElement,
    getLiveAnchorPoint,
    connectorElements,
    onSelectConnector,
    connectorDraftRef,
    connectorDraftRafRef,
  };
}
