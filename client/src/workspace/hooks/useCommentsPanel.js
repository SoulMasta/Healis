import { useCallback, useEffect, useRef, useState } from 'react';
import { createElementComment, getElementComments } from '../../http/commentsAPI';

export function useCommentsPanel({
  commentsEnabled,
  setActionError,
} = {}) {
  const [commentsPanel, setCommentsPanel] = useState(null);
  const [commentDraft, setCommentDraft] = useState('');
  const [commentsByElement, setCommentsByElement] = useState({});
  const [commentsLoading, setCommentsLoading] = useState({});
  const commentInputRef = useRef(null);
  const commentsListRef = useRef(null);
  const commentsSheetRef = useRef(null);
  const commentsSheetDragRef = useRef({ active: false, pointerId: null, startY: 0, lastY: 0 });
  const [commentsSheetDragY, setCommentsSheetDragY] = useState(0);
  const [commentsSheetDragging, setCommentsSheetDragging] = useState(false);

  useEffect(() => {
    if (!commentsPanel) return () => {};
    window.setTimeout(() => commentInputRef.current?.focus?.(), 0);
  }, [commentsPanel]);

  useEffect(() => {
    const elementId = commentsPanel?.elementId;
    if (!commentsEnabled || !elementId) return () => {};
    const list = commentsByElement[elementId] || [];
    if (!list.length) return () => {};
    window.setTimeout(() => {
      const node = commentsListRef.current;
      if (node) node.scrollTop = node.scrollHeight;
    }, 0);
  }, [commentsEnabled, commentsPanel?.elementId, commentsByElement]);

  const openComments = useCallback(
    async (elementId) => {
      if (!commentsEnabled || !elementId) return;
      setCommentsPanel({ elementId });
      setCommentDraft('');
      if (commentsByElement[elementId]) return;
      setCommentsLoading((prev) => ({ ...prev, [elementId]: true }));
      try {
        const list = await getElementComments(elementId);
        setCommentsByElement((prev) => ({ ...prev, [elementId]: Array.isArray(list) ? list : [] }));
      } catch {
        setCommentsByElement((prev) => ({ ...prev, [elementId]: prev[elementId] || [] }));
      } finally {
        setCommentsLoading((prev) => ({ ...prev, [elementId]: false }));
      }
    },
    [commentsEnabled, commentsByElement]
  );

  const closeCommentsPanel = useCallback(() => {
    commentsSheetDragRef.current.active = false;
    commentsSheetDragRef.current.pointerId = null;
    setCommentsSheetDragging(false);
    setCommentsSheetDragY(0);
    setCommentsPanel(null);
  }, []);

  const onCommentsSheetDragStart = useCallback((ev) => {
    if (ev.pointerType === 'mouse' && ev.button !== 0) return;
    commentsSheetDragRef.current.active = true;
    commentsSheetDragRef.current.pointerId = ev.pointerId;
    commentsSheetDragRef.current.startY = ev.clientY;
    commentsSheetDragRef.current.lastY = ev.clientY;
    setCommentsSheetDragging(true);
    try {
      (commentsSheetRef.current || ev.currentTarget)?.setPointerCapture?.(ev.pointerId);
    } catch {
      // ignore
    }
  }, []);

  const onCommentsSheetDragMove = useCallback((ev) => {
    const d = commentsSheetDragRef.current;
    if (!d.active || d.pointerId !== ev.pointerId) return;
    const dy = Math.max(0, ev.clientY - d.startY);
    d.lastY = ev.clientY;
    setCommentsSheetDragY(dy);
  }, []);

  const onCommentsSheetDragEnd = useCallback(
    (ev) => {
      const d = commentsSheetDragRef.current;
      if (!d.active || d.pointerId !== ev.pointerId) return;
      d.active = false;
      d.pointerId = null;
      setCommentsSheetDragging(false);
      const dy = Math.max(0, ev.clientY - d.startY);
      if (dy > 90) {
        closeCommentsPanel();
        return;
      }
      setCommentsSheetDragY(0);
    },
    [closeCommentsPanel]
  );

  const submitComment = useCallback(async () => {
    if (!commentsEnabled) return;
    const elementId = commentsPanel?.elementId;
    const text = String(commentDraft || '').trim();
    if (!elementId || !text) return;
    setCommentDraft('');
    try {
      const created = await createElementComment(elementId, text);
      if (created?.id) {
        setCommentsByElement((prev) => {
          const existing = prev[elementId] || [];
          if (existing.some((x) => Number(x?.id) === Number(created.id))) return prev;
          return { ...prev, [elementId]: [...existing, created] };
        });
      }
    } catch (err) {
      setActionError?.(err?.response?.data?.error || err?.message || 'Failed to send comment');
      window.setTimeout(() => setActionError?.(null), 4500);
    }
  }, [commentsEnabled, commentsPanel?.elementId, commentDraft, setActionError]);

  return {
    commentsPanel,
    setCommentsPanel,
    commentDraft,
    setCommentDraft,
    commentsByElement,
    setCommentsByElement,
    commentsLoading,
    commentInputRef,
    commentsListRef,
    commentsSheetRef,
    commentsSheetDragRef,
    commentsSheetDragY,
    setCommentsSheetDragY,
    commentsSheetDragging,
    openComments,
    submitComment,
    closeCommentsPanel,
    onCommentsSheetDragStart,
    onCommentsSheetDragMove,
    onCommentsSheetDragEnd,
  };
}
