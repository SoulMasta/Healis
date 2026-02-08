import { useCallback, useEffect, useRef, useState } from 'react';
import { chatWithDesk, getAiStatus } from '../../http/aiAPI';

export function useAiPanel({ deskIdNum, setActionError } = {}) {
  const [aiPanelOpen, setAiPanelOpen] = useState(false);
  const [aiStatus, setAiStatus] = useState(null);
  const [aiMessages, setAiMessages] = useState([]);
  const [aiDraft, setAiDraft] = useState('');
  const [aiSending, setAiSending] = useState(false);
  const [aiError, setAiError] = useState(null);
  const aiInputRef = useRef(null);
  const aiListRef = useRef(null);
  const aiSheetRef = useRef(null);
  const aiSheetDragRef = useRef({ active: false, pointerId: null, startY: 0, lastY: 0 });
  const [aiSheetDragY, setAiSheetDragY] = useState(0);
  const [aiSheetDragging, setAiSheetDragging] = useState(false);

  useEffect(() => {
    let mounted = true;
    getAiStatus()
      .then((s) => mounted && setAiStatus(s))
      .catch(() => mounted && setAiStatus({ enabled: false, provider: null, model: null }));
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!aiPanelOpen) return () => {};
    window.setTimeout(() => aiInputRef.current?.focus?.(), 0);
  }, [aiPanelOpen]);

  useEffect(() => {
    if (!aiPanelOpen) return;
    const node = aiListRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [aiPanelOpen, aiMessages]);

  const sendAiMessage = useCallback(
    async (raw) => {
      const message = String(raw ?? aiDraft ?? '').trim();
      if (!message || !deskIdNum || aiSending) return;
      setAiError(null);
      const userMsg = {
        id: `u-${Date.now()}-${Math.random().toString(16).slice(2)}`,
        role: 'user',
        content: message,
        ts: Date.now(),
      };
      const history = aiMessages
        .filter((m) => m?.role === 'user' || m?.role === 'assistant')
        .slice(-16)
        .map((m) => ({ role: m.role, content: m.content }));
      setAiMessages((prev) => [...prev, userMsg]);
      setAiDraft('');
      setAiSending(true);
      try {
        const data = await chatWithDesk(deskIdNum, { message, history });
        const reply = String(data?.reply ?? '').trim();
        const assistantMsg = {
          id: `a-${Date.now()}-${Math.random().toString(16).slice(2)}`,
          role: 'assistant',
          content: reply || '…',
          ts: Date.now(),
        };
        setAiMessages((prev) => [...prev, assistantMsg]);
        if (data?.provider || data?.model) {
          setAiStatus((cur) => cur || { enabled: true, provider: data.provider || null, model: data.model || null });
        }
      } catch (e) {
        const msg = e?.response?.data?.error || e?.message || 'AI request failed';
        const hint = e?.response?.data?.hint || null;
        setAiError(hint ? `${msg}\n${hint}` : msg);
      } finally {
        setAiSending(false);
      }
    },
    [deskIdNum, aiDraft, aiMessages, aiSending]
  );

  const closeAiPanel = useCallback(() => {
    aiSheetDragRef.current.active = false;
    aiSheetDragRef.current.pointerId = null;
    setAiSheetDragging(false);
    setAiSheetDragY(0);
    setAiPanelOpen(false);
  }, []);

  const onAiSheetDragStart = useCallback((ev) => {
    if (ev.pointerType === 'mouse' && ev.button !== 0) return;
    aiSheetDragRef.current.active = true;
    aiSheetDragRef.current.pointerId = ev.pointerId;
    aiSheetDragRef.current.startY = ev.clientY;
    aiSheetDragRef.current.lastY = ev.clientY;
    setAiSheetDragging(true);
    try {
      (aiSheetRef.current || ev.currentTarget)?.setPointerCapture?.(ev.pointerId);
    } catch {
      // ignore
    }
  }, []);

  const onAiSheetDragMove = useCallback((ev) => {
    const d = aiSheetDragRef.current;
    if (!d.active || d.pointerId !== ev.pointerId) return;
    const dy = Math.max(0, ev.clientY - d.startY);
    d.lastY = ev.clientY;
    setAiSheetDragY(dy);
  }, []);

  const onAiSheetDragEnd = useCallback(
    (ev) => {
      const d = aiSheetDragRef.current;
      if (!d.active || d.pointerId !== ev.pointerId) return;
      d.active = false;
      d.pointerId = null;
      setAiSheetDragging(false);
      const dy = Math.max(0, ev.clientY - d.startY);
      if (dy > 90) {
        closeAiPanel();
        return;
      }
      setAiSheetDragY(0);
    },
    [closeAiPanel]
  );

  return {
    aiPanelOpen,
    setAiPanelOpen,
    aiStatus,
    aiMessages,
    setAiMessages,
    aiDraft,
    setAiDraft,
    aiSending,
    aiError,
    aiInputRef,
    aiListRef,
    aiSheetRef,
    aiSheetDragY,
    setAiSheetDragY,
    aiSheetDragging,
    setAiError,
    sendAiMessage,
    closeAiPanel,
    onAiSheetDragStart,
    onAiSheetDragMove,
    onAiSheetDragEnd,
  };
}
