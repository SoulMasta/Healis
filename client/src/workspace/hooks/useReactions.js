import { useCallback, useEffect, useRef, useState } from 'react';

const REACTION_SLOTS = [
  { xPct: 18, yPct: 0, side: 'top' },
  { xPct: 50, yPct: 0, side: 'top' },
  { xPct: 82, yPct: 0, side: 'top' },
  { xPct: 18, yPct: 100, side: 'bottom' },
  { xPct: 50, yPct: 100, side: 'bottom' },
  { xPct: 82, yPct: 100, side: 'bottom' },
  { xPct: 0, yPct: 50, side: 'left' },
  { xPct: 100, yPct: 50, side: 'right' },
  { xPct: 0, yPct: 25, side: 'left' },
  { xPct: 0, yPct: 75, side: 'left' },
  { xPct: 100, yPct: 25, side: 'right' },
  { xPct: 100, yPct: 75, side: 'right' },
];

export function useReactions({
  setElements,
  socketRef,
  workspace,
  deskIdParam: id,
  setActionError,
  sameId,
} = {}) {
  const [reactionPicker, setReactionPicker] = useState(null);
  const [reactionCustomEmoji, setReactionCustomEmoji] = useState('');
  const reactionPickerRef = useRef(null);
  const reactionSlotsRef = useRef(new Map());

  const normalizeReactions = useCallback((reactions) => {
    if (!reactions || typeof reactions !== 'object') return {};
    const out = {};
    for (const [emoji, users] of Object.entries(reactions)) {
      const e = String(emoji || '').trim();
      if (!e) continue;
      if (!Array.isArray(users)) continue;
      const ids = users
        .map((x) => Number(x))
        .filter((x) => Number.isFinite(x))
        .map((x) => Math.trunc(x));
      const uniq = Array.from(new Set(ids));
      if (uniq.length) out[e] = uniq;
    }
    return out;
  }, []);

  const layoutReactionBubbles = useCallback(
    (elementId, reactions) => {
      const r = normalizeReactions(reactions);
      const base = Object.entries(r)
        .filter(([, users]) => Array.isArray(users) && users.length > 0)
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([emoji, users]) => ({ emoji, count: users.length }));
      if (!base.length) return base;
      const key = String(elementId ?? '');
      if (!reactionSlotsRef.current.has(key)) reactionSlotsRef.current.set(key, new Map());
      const slots = reactionSlotsRef.current.get(key);
      const current = new Set(base.map((b) => b.emoji));
      for (const e of Array.from(slots.keys())) {
        if (!current.has(e)) slots.delete(e);
      }
      const used = new Set(slots.values());
      const claimNextFreeSlot = () => {
        for (let i = 0; i < REACTION_SLOTS.length; i += 1) {
          if (!used.has(i)) return i;
        }
        return null;
      };
      for (const b of base) {
        if (slots.has(b.emoji)) continue;
        const idx = claimNextFreeSlot();
        if (idx == null) break;
        slots.set(b.emoji, idx);
        used.add(idx);
      }
      return base.map((b) => {
        const slotIndex = slots.get(b.emoji);
        const pos = slotIndex != null ? REACTION_SLOTS[slotIndex] : null;
        return pos ? { ...b, ...pos, slotIndex } : { ...b, xPct: 50, yPct: 100, side: 'bottom' };
      });
    },
    [normalizeReactions]
  );

  const openReactionPicker = useCallback((elementId, x, y) => {
    if (!elementId) return;
    setReactionCustomEmoji('');
    setReactionPicker({ elementId, x: Number(x) || 0, y: Number(y) || 0 });
  }, []);

  const toggleReaction = useCallback(
    (elementId, emojiRaw) => {
      const emoji = String(emojiRaw ?? '').trim();
      const socket = socketRef?.current;
      const deskId = workspace?.id ?? workspace?.deskId ?? id;
      if (!socket || !deskId || !elementId || !emoji) return;
      socket.emit('reaction:toggle', { deskId, elementId, emoji }, (ack = {}) => {
        if (!ack?.ok) {
          setActionError?.(String(ack?.error || 'Reaction failed'));
          window.setTimeout(() => setActionError?.(null), 4500);
          return;
        }
        const next = normalizeReactions(ack?.reactions);
        setElements?.((prev) => prev.map((el) => (sameId(el.id, elementId) ? { ...el, reactions: next } : el)));
      });
    },
    [socketRef, workspace, id, setActionError, normalizeReactions, setElements, sameId]
  );

  useEffect(() => {
    if (!reactionPicker) return () => {};
    const onPointerDown = (ev) => {
      const node = reactionPickerRef.current;
      if (node && !node.contains(ev.target)) setReactionPicker(null);
    };
    const onKeyDown = (ev) => {
      if (ev.key === 'Escape') setReactionPicker(null);
    };
    window.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [reactionPicker]);

  return {
    reactionPicker,
    setReactionPicker,
    reactionCustomEmoji,
    setReactionCustomEmoji,
    reactionPickerRef,
    normalizeReactions,
    layoutReactionBubbles,
    openReactionPicker,
    toggleReaction,
  };
}
