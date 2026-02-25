import React, { useState, useEffect, useLayoutEffect, useRef, useCallback, useMemo } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { X, Bold, List, Heading2, Undo2, Redo2, MoreVertical, Paperclip, PenLine, ChevronLeft, Italic, Underline, Strikethrough, AlignLeft, AlignCenter, AlignRight, ListOrdered, Copy, Upload, Trash2, LayoutGrid, ChevronRight } from 'lucide-react';
import {
  updateMaterialCard,
  uploadMaterialCardFile,
} from '../../http/materialBlocksAPI';
import { compressImageForUpload } from '../../http/uploadService';
import { getApiBaseUrl } from '../../config/runtime';
import { getToken } from '../../http/userAPI';
import { createPortal } from 'react-dom';
import DocumentCard from './DocumentCard';
import DocumentPreviewOverlay from './DocumentPreviewOverlay';
import styles from './MaterialCardEditor.module.css';

function safeParseJwt(token) {
  try {
    const parts = String(token).split('.');
    if (parts.length < 2) return null;
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');
    return JSON.parse(atob(padded));
  } catch {
    return null;
  }
}

const AUTOSAVE_DELAY_MS = 800;
const IMAGE_TYPES = /^image\/(png|jpe?g|webp|gif)$/i;
function resolveFileUrl(url) {
  if (!url) return '';
  if (/^https?:\/\//i.test(url)) return url;
  const base = getApiBaseUrl();
  return base ? `${base.replace(/\/+$/, '')}${url}` : url;
}
function decodeDocName(str) {
  if (str == null || str === '') return 'Документ';
  try {
    return decodeURIComponent(String(str));
  } catch {
    return String(str);
  }
}
/** Перед сохранением оставляем в .inline-doc-card только data-атрибуты (порталы размонтированы при сериализации). Удаляем ZWS после карточки. */
function normalizeDocumentCardsForSave(root) {
  if (!root?.querySelectorAll) return;
  const ZWS = '\u200B';
  root.querySelectorAll('.inline-doc-card').forEach((span) => {
    const title = span.getAttribute('data-doc-title') || span.querySelector('.inline-doc-card-name')?.textContent?.trim() || 'Документ';
    const url = span.getAttribute('data-doc-url') || span.querySelector('.inline-doc-card-link')?.getAttribute('href');
    span.setAttribute('data-doc-title', title);
    if (url) span.setAttribute('data-doc-url', url);
    span.innerHTML = '';
    const next = span.nextSibling;
    if (next?.nodeType === Node.TEXT_NODE && next.textContent === ZWS) next.remove();
  });
}

function isImageFile(f) {
  if (!f) return false;
  return (f.type && IMAGE_TYPES.test(f.type)) || /\.(png|jpe?g|webp|gif)$/i.test(f.name || '');
}

export default function MaterialCardEditor({ card, blockTitle, onClose, onBack, isMobile, socketRef, deskId }) {
  const queryClient = useQueryClient();
  const [title, setTitle] = useState(card?.title ?? '');
  const [, setAttachments] = useState(card?.attachments ?? []);
  const [, setLinks] = useState(card?.links ?? []);
  const [, setTagsState] = useState(card?.tags ?? []);
  const contentRef = useRef(null);
  const saveTimeoutRef = useRef(null);

  const cardId = card?.id;
  const [fullscreenImg, setFullscreenImg] = useState(null);
  const [fullscreenImgs, setFullscreenImgs] = useState([]);
  const [docViewer, setDocViewer] = useState(null);
  const [linkDialog, setLinkDialog] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [formatSheetOpen, setFormatSheetOpen] = useState(false);
  const [formatActive, setFormatActive] = useState({ bold: false, italic: false, underline: false, strikeThrough: false });
  const [photoMenu, setPhotoMenu] = useState(null);
  const [photoMenuPreviewOpen, setPhotoMenuPreviewOpen] = useState(false);
  const [insertMenuOpen, setInsertMenuOpen] = useState(false);
  const photoLongPressRef = useRef(null);
  const photoLongPressHandledRef = useRef(false);
  const photoInputRef = useRef(null);
  const docInputRef = useRef(null);
  const titleInputRef = useRef(null);
  const mobileLayout = Boolean(isMobile);
  const [keyboardBottomOffset, setKeyboardBottomOffset] = useState(0);
  const [toolbarViewportStyle, setToolbarViewportStyle] = useState(null);
  const [uploadProgress, setUploadProgress] = useState(null);
  const [uploadError, setUploadError] = useState(null);
  const [uploadRetryPayload, setUploadRetryPayload] = useState(null);
  const currentUserId = useMemo(() => {
    const t = getToken();
    if (!t) return null;
    const p = safeParseJwt(t);
    return p?.id ?? p?.sub ?? null;
  }, []);

  const keyboardScrollTimeoutRef = useRef(null);
  const CURSOR_MARGIN_ABOVE_KEYBOARD = 24;
  const KEYBOARD_OPEN_THRESHOLD = 50;

  const scrollToKeepCursorVisible = useCallback(
    (opts = {}) => {
      const { smooth = false, center = false } = opts;
      if (!mobileLayout || !contentRef.current || typeof window === 'undefined' || !window.visualViewport) return;
      const el = contentRef.current;
      if (!el.contains(document.activeElement)) return;
      const vv = window.visualViewport;
      const keyboardOpen = window.innerHeight - vv.height > KEYBOARD_OPEN_THRESHOLD;
      if (!keyboardOpen) return;
      const sel = document.getSelection();
      if (!sel || sel.rangeCount === 0) return;
      const range = sel.getRangeAt(0);
      if (!el.contains(range.commonAncestorContainer)) return;
      const rect = range.getBoundingClientRect();
      const safeBottom = vv.offsetTop + vv.height - CURSOR_MARGIN_ABOVE_KEYBOARD;
      if (center) {
        const targetTop = vv.offsetTop + vv.height * 0.35;
        if (rect.top <= targetTop + 10 && rect.bottom <= safeBottom + 10) return;
        const delta = rect.top - targetTop;
        if (Math.abs(delta) < 4) return;
        if (smooth) el.scrollBy({ top: delta, behavior: 'smooth' });
        else el.scrollTop += delta;
      } else {
        if (rect.bottom <= safeBottom) return;
        const delta = rect.bottom - safeBottom;
        el.scrollTop += delta;
      }
    },
    [mobileLayout]
  );

  const scheduleScrollAfterKeyboard = useCallback(() => {
    if (!mobileLayout) return;
    if (keyboardScrollTimeoutRef.current) clearTimeout(keyboardScrollTimeoutRef.current);
    keyboardScrollTimeoutRef.current = setTimeout(() => {
      keyboardScrollTimeoutRef.current = null;
      requestAnimationFrame(() => scrollToKeepCursorVisible({ smooth: true, center: true }));
    }, 320);
  }, [mobileLayout, scrollToKeepCursorVisible]);

  useEffect(() => {
    if (!mobileLayout || typeof window === 'undefined' || !window.visualViewport) return;
    const vv = window.visualViewport;
    let prevOffset = window.innerHeight - vv.height;
    const update = () => {
      const nextOffset = Math.max(0, window.innerHeight - vv.height);
      setKeyboardBottomOffset(nextOffset);
      setToolbarViewportStyle({
        top: vv.offsetTop + vv.height,
        left: vv.offsetLeft,
        right: 'auto',
        width: vv.width,
        transform: 'translateY(-100%)',
      });
      if (prevOffset < KEYBOARD_OPEN_THRESHOLD && nextOffset > KEYBOARD_OPEN_THRESHOLD && contentRef.current?.contains(document.activeElement)) {
        scheduleScrollAfterKeyboard();
      }
      prevOffset = nextOffset;
    };
    update();
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
      if (keyboardScrollTimeoutRef.current) {
        clearTimeout(keyboardScrollTimeoutRef.current);
        keyboardScrollTimeoutRef.current = null;
      }
    };
  }, [mobileLayout, scheduleScrollAfterKeyboard]);

  useEffect(() => {
    if (!mobileLayout) return;
    let raf = null;
    const onSelectionChange = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = null;
        scrollToKeepCursorVisible({ smooth: false, center: false });
      });
    };
    document.addEventListener('selectionchange', onSelectionChange);
    return () => {
      document.removeEventListener('selectionchange', onSelectionChange);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [mobileLayout, scrollToKeepCursorVisible]);

  useEffect(() => {
    setTitle(card?.title ?? '');
    setAttachments(card?.attachments ?? []);
    setLinks(card?.links ?? []);
    setTagsState(card?.tags ?? []);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sync only when switching card (card.id)
  }, [card?.id]);

  const EMPTY_HEADING_HTML = '<div class="mobile-first-heading" data-block="heading"><br></div>';
  const [docCardTargets, setDocCardTargets] = useState([]);

  const ZWS = '\u200B';
  const migrateOldDocCards = useCallback((root) => {
    if (!root?.querySelectorAll) return;
    root.querySelectorAll('.inline-doc-card').forEach((el) => {
      const link = el.querySelector('.inline-doc-card-link');
      const nameEl = el.querySelector('.inline-doc-card-name');
      const href = link?.getAttribute('href') || el.getAttribute('data-doc-url') || '#';
      const title = (nameEl?.textContent || el.getAttribute('data-doc-title') || 'Документ').trim();
      if (href && href !== '#') el.setAttribute('data-doc-url', href);
      el.setAttribute('data-doc-title', title);
      el.innerHTML = '';
      const next = el.nextSibling;
      if (!next || next.nodeType !== Node.TEXT_NODE || next.textContent !== ZWS) {
        el.parentNode?.insertBefore(document.createTextNode(ZWS), next);
      }
    });
  }, []);

  useLayoutEffect(() => {
    if (!contentRef.current || card?.id == null) return;
    const raw = (card?.content ?? '').trim();
    contentRef.current.innerHTML = !raw || raw === '<br>' ? EMPTY_HEADING_HTML : card?.content ?? '';
    migrateOldDocCards(contentRef.current);
    const targets = [];
    contentRef.current.querySelectorAll('.inline-doc-card').forEach((node, i) => {
      const url = node.getAttribute('data-doc-url');
      const title = node.getAttribute('data-doc-title') || 'Документ';
      if (url) targets.push({ id: node.getAttribute('data-attachment-id') || `doc-${i}-${url}`, node, url, title });
    });
    setDocCardTargets(targets);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- set content only on card open to avoid overwriting edits
  }, [card?.id, migrateOldDocCards, mobileLayout]);

  const isInHeadingBlock = useCallback(() => {
    const sel = document.getSelection();
    if (!sel?.anchorNode || !contentRef.current?.contains(sel.anchorNode)) return false;
    let n = sel.anchorNode;
    while (n && n !== contentRef.current) {
      if (n.nodeType === 1 && (n.getAttribute?.('data-block') === 'heading' || n.classList?.contains('mobile-first-heading'))) return true;
      n = n.parentNode;
    }
    return false;
  }, []);

  const updateMutation = useMutation({
    mutationFn: (payload) => {
      if (cardId == null) return Promise.reject(new Error('No card id'));
      return updateMaterialCard(cardId, payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['material-cards'] });
    },
  });

  const saveTitle = useCallback(
    (newTitle) => {
      if (newTitle === (card?.title ?? '')) return;
      updateMutation.mutate({ title: newTitle });
    },
    [card?.title, updateMutation]
  );

  const saveContent = useCallback(
    (newContent) => {
      if (cardId == null) return;
      if (newContent === (card?.content ?? '')) return;
      updateMutation.mutate({ content: newContent });
    },
    [cardId, card?.content, updateMutation]
  );

  useEffect(() => {
    const t = title;
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => saveTitle(t), AUTOSAVE_DELAY_MS);
    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    };
  }, [title, saveTitle]);

  const handleContentInput = useCallback(() => {
    const el = contentRef.current;
    if (!el) return;
    const clone = el.cloneNode(true);
    normalizeDocumentCardsForSave(clone);
    const html = clone.innerHTML;
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => saveContent(html), AUTOSAVE_DELAY_MS);
    requestAnimationFrame(() => {
      const targets = [];
      el.querySelectorAll('.inline-doc-card').forEach((node, i) => {
        const u = node.getAttribute('data-doc-url');
        const t = node.getAttribute('data-doc-title') || 'Документ';
        if (u) targets.push({ id: node.getAttribute('data-attachment-id') || `doc-${i}-${u}`, node, url: u, title: t });
      });
      setDocCardTargets(targets);
    });
    if (mobileLayout) requestAnimationFrame(() => scrollToKeepCursorVisible({ smooth: false, center: false }));
  }, [saveContent, mobileLayout, scrollToKeepCursorVisible]);

  // Realtime: pull card updates from socket (other participants on group board)
  useEffect(() => {
    const socket = socketRef?.current;
    const did = deskId != null ? Number(deskId) : null;
    if (!socket || !did || cardId == null) return;
    const handler = (msg = {}) => {
      if (Number(msg.cardId) !== Number(cardId)) return;
      if (currentUserId != null && Number(msg.updatedBy) === Number(currentUserId)) return;
      if (msg.title !== undefined) setTitle(msg.title);
      if (Array.isArray(msg.attachments)) setAttachments(msg.attachments);
      if (Array.isArray(msg.links)) setLinks(msg.links);
      if (Array.isArray(msg.tags)) setTagsState(msg.tags);
      const el = contentRef.current;
      if (el && msg.content !== undefined) {
        const editorFocused = el.contains(document.activeElement);
        if (!editorFocused) {
          el.innerHTML = msg.content;
          migrateOldDocCards(el);
          const targets = [];
          el.querySelectorAll('.inline-doc-card').forEach((node, i) => {
            const u = node.getAttribute('data-doc-url');
            const t = node.getAttribute('data-doc-title') || 'Документ';
            if (u) targets.push({ id: node.getAttribute('data-attachment-id') || `doc-${i}-${u}`, node, url: u, title: t });
          });
          setDocCardTargets(targets);
        }
      }
    };
    socket.on('material_card:updated', handler);
    return () => socket.off('material_card:updated', handler);
  }, [cardId, deskId, socketRef, currentUserId, migrateOldDocCards]);

  const handleContentKeyDown = useCallback(
    (e) => {
      if (!mobileLayout || e.key !== 'Enter') return;
      if (!isInHeadingBlock()) return;
      e.preventDefault();
      const el = contentRef.current;
      const heading = el?.querySelector?.('[data-block="heading"], .mobile-first-heading');
      const next = document.createElement('div');
      next.innerHTML = '<br>';
      heading?.insertAdjacentElement('afterend', next);
      const r = document.createRange();
      r.setStart(next, 0);
      r.collapse(true);
      const sel = document.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(r);
      handleContentInput();
    },
    [mobileLayout, isInHeadingBlock, handleContentInput]
  );

  const flushContentSave = useCallback(() => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = null;
    }
    const el = contentRef.current;
    if (!el) return;
    const clone = el.cloneNode(true);
    normalizeDocumentCardsForSave(clone);
    saveContent(clone.innerHTML);
  }, [saveContent]);

  const execCmd = useCallback((cmd, value = null) => {
    document.execCommand(cmd, false, value);
    contentRef.current?.focus();
  }, []);

  const deskToolbarRef = useRef(null);

  const uploadMutation = useMutation({
    mutationFn: (payload) => {
      const file = payload?.file ?? payload;
      const onProgress = typeof payload?.onProgress === 'function' ? payload.onProgress : undefined;
      return uploadMaterialCardFile(cardId, file, { onProgress });
    },
    onSuccess: (data) => {
      setAttachments((prev) => [...prev, { id: data.id, file_url: data.file_url, file_type: data.file_type, size: data.size }]);
    },
  });

  const runUpload = useCallback(
    (file, opts = {}) => {
      const { asImage, fileName, onSuccessInsert } = opts;
      setUploadError(null);
      setUploadRetryPayload(null);
      setUploadProgress(0);
      uploadMutation.mutate(
        {
          file,
          onProgress: (p) => setUploadProgress(p),
        },
        {
          onSuccess: (data) => {
            setUploadProgress(null);
            setUploadError(null);
            setUploadRetryPayload(null);
            if (onSuccessInsert) onSuccessInsert(data);
          },
          onError: (err) => {
            setUploadProgress(null);
            setUploadError(err?.message || 'Ошибка загрузки');
            setUploadRetryPayload({ file, asImage, fileName, withInsert: !!onSuccessInsert });
          },
        }
      );
    },
    [uploadMutation]
  );

  const setSelectionAfter = useCallback((node) => {
    const sel = document.getSelection();
    if (!sel || !node) return;
    const range = document.createRange();
    range.setStartAfter(node);
    range.collapse(true);
    sel.removeAllRanges();
    sel.addRange(range);
  }, []);

  const insertAtCursor = useCallback((html) => {
    const el = contentRef.current;
    if (!el) return;
    el.focus();
    document.execCommand('insertHTML', false, html);
    handleContentInput();
  }, [handleContentInput]);

  const insertMediaAtCursor = useCallback(
    (html, selector) => {
      const el = contentRef.current;
      if (!el) return;
      el.focus();
      document.execCommand('insertHTML', false, html);
      handleContentInput();
      requestAnimationFrame(() => {
        const nodes = el.querySelectorAll(selector);
        const last = nodes[nodes.length - 1];
        if (last) {
          setSelectionAfter(last);
          last.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        }
      });
    },
    [handleContentInput, setSelectionAfter]
  );

  const insertDocCard = useCallback(
    (url, filename, attachmentId) => {
      const safeUrl = url.replace(/"/g, '&quot;');
      const rawName = filename ? decodeDocName(filename) : 'Документ';
      const safeTitle = rawName.replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      /* После span вставляем нулевой пробел (&#8203;), чтобы курсор мог стоять справа от карточки, как у фото. */
      const html = `<span class="inline-doc-card" contenteditable="false" data-attachment-id="${attachmentId}" data-doc-url="${safeUrl}" data-doc-title="${safeTitle}"></span>&#8203;`;
      insertMediaAtCursor(html, '.inline-doc-card');
      requestAnimationFrame(() => {
        const targets = [];
        contentRef.current?.querySelectorAll('.inline-doc-card').forEach((node, i) => {
          const u = node.getAttribute('data-doc-url');
          const t = node.getAttribute('data-doc-title') || 'Документ';
          if (u) targets.push({ id: node.getAttribute('data-attachment-id') || `doc-${i}-${u}`, node, url: u, title: t });
        });
        setDocCardTargets(targets);
      });
    },
    [insertMediaAtCursor]
  );

  const getInsertHandlerForRetry = useCallback(
    (payload) => {
      if (!payload) return undefined;
      return (data) => {
        const url = resolveFileUrl(data?.file_url);
        if (!url) return;
        if (payload.asImage) {
          const html = `<img src="${url.replace(/"/g, '&quot;')}" alt="" class="inline-photo" data-preview-size="large" style="max-width:85%;height:auto;" loading="lazy" />`;
          insertMediaAtCursor(html, 'img.inline-photo');
        } else {
          const name = payload.fileName || decodeDocName(data?.file_url?.split?.('/')?.pop()) || 'Документ';
          insertDocCard(url, name, data?.id);
        }
      };
    },
    [insertMediaAtCursor, insertDocCard]
  );

  const createdAt = card?.created_at || card?.createdAt;
  const updatedAt = card?.updated_at || card?.updatedAt;

  const handleClose = useCallback(async () => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = null;
    }
    const el = contentRef.current;
    if (el) normalizeDocumentCardsForSave(el);
    const html = el?.innerHTML ?? '';
    const contentChanged = html !== (card?.content ?? '');
    const titleChanged = title !== (card?.title ?? '');
    if ((contentChanged || titleChanged) && cardId != null) {
      try {
        const payload = {};
        if (titleChanged) payload.title = title;
        if (contentChanged) payload.content = html;
        await updateMutation.mutateAsync(payload);
      } catch {
        // attempt was made
      }
    }
    onClose();
  }, [cardId, card?.content, card?.title, title, updateMutation, onClose]);

  const handlePhotoSelected = useCallback(
    (e) => {
      const file = e.target?.files?.[0];
      e.target.value = '';
      if (!file || !isImageFile(file)) return;
      const doUpload = (f) => {
        runUpload(f, {
          asImage: true,
          onSuccessInsert: (data) => {
            const url = resolveFileUrl(data?.file_url);
            if (url) {
              const html = `<img src="${url.replace(/"/g, '&quot;')}" alt="" class="inline-photo" data-preview-size="large" style="max-width:85%;height:auto;" loading="lazy" />`;
              insertMediaAtCursor(html, 'img.inline-photo');
            }
          },
        });
      };
      if (mobileLayout) {
        compressImageForUpload(file).then(doUpload);
      } else {
        doUpload(file);
      }
    },
    [runUpload, insertMediaAtCursor, mobileLayout]
  );

  const handleDocSelected = useCallback(
    (e) => {
      const file = e.target?.files?.[0];
      e.target.value = '';
      if (!file) return;
      runUpload(file, {
        asImage: false,
        fileName: file.name,
        onSuccessInsert: (data) => {
          const url = resolveFileUrl(data?.file_url);
          const name = file.name || decodeDocName(data?.file_url?.split?.('/')?.pop()) || 'Документ';
          if (url) insertDocCard(url, name, data?.id);
        },
      });
    },
    [runUpload, insertDocCard]
  );

  const addLink = useCallback(
    (url, title) => {
      setLinkDialog(false);
      if (!url?.trim()) return;
      const text = title?.trim() || url.trim();
      insertAtCursor(`<a href="${url.trim()}" target="_blank" rel="noopener noreferrer">${text}</a>`);
    },
    [insertAtCursor]
  );

  const LONG_PRESS_MS = 450;
  const openPhotoMenu = useCallback((src, previewSize) => {
    photoLongPressHandledRef.current = true;
    const sel = document.getSelection();
    if (sel) sel.removeAllRanges();
    setPhotoMenu({ src, previewSize: previewSize || 'large' });
    setPhotoMenuPreviewOpen(false);
    setPhotoMenuPosition(null);
  }, []);
  const closePhotoMenu = useCallback(() => {
    setPhotoMenu(null);
    setPhotoMenuPreviewOpen(false);
    setPhotoMenuPosition(null);
  }, []);

  const copyImageToClipboard = useCallback((src) => {
    closePhotoMenu();
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(img, 0, 0);
        canvas.toBlob((blob) => {
          if (blob && navigator.clipboard?.write) navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
        }, 'image/png');
      } catch (_) {}
    };
    img.onerror = () => {};
    img.src = src;
  }, [closePhotoMenu]);

  const setPhotoPreviewSize = useCallback((size) => {
    if (!photoMenu?.src) return;
    const el = contentRef.current && Array.from(contentRef.current.querySelectorAll('img')).find((i) => i.src === photoMenu.src);
    if (el) {
      el.setAttribute('data-preview-size', size);
      el.style.maxWidth = size === 'small' ? '160px' : '100%';
      el.classList.add('inline-photo');
      handleContentInput();
      flushContentSave();
    }
    setPhotoMenu((m) => (m ? { ...m, previewSize: size } : null));
    setPhotoMenuPreviewOpen(false);
    closePhotoMenu();
  }, [photoMenu?.src, closePhotoMenu, handleContentInput, flushContentSave]);

  useEffect(() => {
    if (mobileLayout) return;
    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        if (photoMenu && !mobileLayout) closePhotoMenu();
        else if (insertMenuOpen) setInsertMenuOpen(false);
        return;
      }
      if (!contentRef.current?.contains(document.activeElement)) return;
      if (e.ctrlKey || e.metaKey) {
        switch (e.key?.toLowerCase()) {
          case 'b': e.preventDefault(); execCmd('bold'); break;
          case 'i': e.preventDefault(); execCmd('italic'); break;
          case 'z': e.preventDefault(); execCmd(e.shiftKey ? 'redo' : 'undo'); break;
          case 'y': if (e.shiftKey) break; e.preventDefault(); execCmd('redo'); break;
          default: break;
        }
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [mobileLayout, execCmd, photoMenu, insertMenuOpen, closePhotoMenu]);

  useEffect(() => {
    if (!insertMenuOpen) return;
    const close = (e) => {
      if (deskToolbarRef.current?.contains(e.target)) return;
      setInsertMenuOpen(false);
    };
    const t = setTimeout(() => document.addEventListener('click', close), 0);
    return () => { clearTimeout(t); document.removeEventListener('click', close); };
  }, [insertMenuOpen]);

  const [photoMenuPosition, setPhotoMenuPosition] = useState(null);
  const [photoMenuClamped, setPhotoMenuClamped] = useState(null);
  const photoMenuPopoverRef = useRef(null);
  const [hoveredImage, setHoveredImage] = useState(null);
  const hoveredImageRef = useRef(null);
  const openPhotoMenuAt = useCallback((src, previewSize, clientX, clientY) => {
    photoLongPressHandledRef.current = true;
    const sel = document.getSelection();
    if (sel) sel.removeAllRanges();
    setPhotoMenu({ src, previewSize: previewSize || 'large' });
    setPhotoMenuPreviewOpen(false);
    setPhotoMenuPosition(!mobileLayout && clientX != null ? { x: clientX, y: clientY } : null);
    setPhotoMenuClamped(null);
  }, [mobileLayout]);

  useLayoutEffect(() => {
    if (!photoMenuPosition || !photoMenuPopoverRef.current) return;
    const r = photoMenuPopoverRef.current.getBoundingClientRect();
    const pad = 8;
    const dx = 4;
    const dy = 4;
    let x = photoMenuPosition.x;
    let y = photoMenuPosition.y;
    if (x + dx + r.width > window.innerWidth - pad) x = window.innerWidth - pad - r.width - dx;
    if (y + dy + r.height > window.innerHeight - pad) y = window.innerHeight - pad - r.height - dy;
    if (x + dx < pad) x = pad - dx;
    if (y + dy < pad) y = pad - dy;
    setPhotoMenuClamped({ x, y });
  }, [photoMenuPosition]);

  const handleContentPointerDown = useCallback(
    (e) => {
      const img = e.target?.closest?.('img');
      if (!img?.src || !contentRef.current?.contains(img)) return;
      if (mobileLayout) {
        e.preventDefault();
        photoLongPressRef.current = setTimeout(() => {
          photoLongPressRef.current = null;
          openPhotoMenu(img.src, img.getAttribute('data-preview-size') || 'large');
        }, LONG_PRESS_MS);
      }
    },
    [mobileLayout, openPhotoMenu]
  );

  const handleContentContextMenu = useCallback(
    (e) => {
      const img = e.target?.closest?.('img');
      if (img?.src && contentRef.current?.contains(img) && !mobileLayout) {
        e.preventDefault();
        openPhotoMenuAt(img.src, img.getAttribute('data-preview-size') || 'large', e.clientX, e.clientY);
      }
    },
    [mobileLayout, openPhotoMenuAt]
  );

  const handleContentDrop = useCallback(
    (e) => {
      e.preventDefault();
      setDropActive(false);
      const items = e.dataTransfer?.files;
      if (!items?.length || !contentRef.current) return;
      contentRef.current.focus();
      const file = items[0];
      const asImage = isImageFile(file);
      const doInsert = (f) => {
        if (asImage) {
          runUpload(f, {
            asImage: true,
            onSuccessInsert: (data) => {
              const url = resolveFileUrl(data?.file_url);
              if (url) {
                const html = `<img src="${url.replace(/"/g, '&quot;')}" alt="" class="inline-photo" data-preview-size="large" style="max-width:85%;height:auto;" loading="lazy" />`;
                insertMediaAtCursor(html, 'img.inline-photo');
              }
            },
          });
        } else {
          runUpload(f, {
            asImage: false,
            fileName: f.name,
            onSuccessInsert: (data) => {
              const url = resolveFileUrl(data?.file_url);
              const name = f.name || decodeDocName(data?.file_url?.split?.('/')?.pop()) || 'Документ';
              if (url) insertDocCard(url, name, data?.id);
            },
          });
        }
      };
      if (asImage && mobileLayout) compressImageForUpload(file).then(doInsert);
      else doInsert(file);
    },
    [runUpload, insertMediaAtCursor, insertDocCard, mobileLayout]
  );

  const [dropActive, setDropActive] = useState(false);
  const handleContentDragOver = useCallback((e) => {
    if (e.dataTransfer?.types?.includes('Files')) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
      setDropActive(true);
    }
  }, []);
  const handleContentDragLeave = useCallback((e) => {
    if (!contentRef.current?.contains(e.relatedTarget)) setDropActive(false);
  }, []);

  const handleContentMouseMove = useCallback((e) => {
    if (mobileLayout) return;
    const img = e.target?.closest?.('img.inline-photo');
    if (img?.src && contentRef.current?.contains(img)) {
      const rect = img.getBoundingClientRect();
      setHoveredImage({ src: img.src, rect });
      hoveredImageRef.current = img;
    } else {
      setHoveredImage(null);
      hoveredImageRef.current = null;
    }
  }, [mobileLayout]);

  const handleContentMouseLeave = useCallback(() => {
    if (mobileLayout) return;
    setHoveredImage(null);
    hoveredImageRef.current = null;
  }, [mobileLayout]);

  const handleContentPaste = useCallback(
    (e) => {
      const files = e.clipboardData?.files;
      if (!files?.length) return;
      const file = Array.from(files).find((f) => isImageFile(f) || f.type === 'application/pdf' || /\.(docx?|xlsx?|pptx?|txt|md)$/i.test(f.name || ''));
      if (!file) return;
      e.preventDefault();
      const asImage = isImageFile(file);
      const doInsert = (f) => {
        if (asImage) {
          runUpload(f, {
            asImage: true,
            onSuccessInsert: (data) => {
              const url = resolveFileUrl(data?.file_url);
              if (url) {
                const html = `<img src="${url.replace(/"/g, '&quot;')}" alt="" class="inline-photo" data-preview-size="large" style="max-width:85%;height:auto;" loading="lazy" />`;
                insertMediaAtCursor(html, 'img.inline-photo');
              }
            },
          });
        } else {
          runUpload(f, {
            asImage: false,
            fileName: f.name,
            onSuccessInsert: (data) => {
              const url = resolveFileUrl(data?.file_url);
              const name = f.name || decodeDocName(data?.file_url?.split?.('/')?.pop()) || 'Документ';
              if (url) insertDocCard(url, name, data?.id);
            },
          });
        }
      };
      if (asImage && mobileLayout) compressImageForUpload(file).then(doInsert);
      else doInsert(file);
    },
    [runUpload, insertMediaAtCursor, insertDocCard, mobileLayout]
  );

  const handleContentPointerUp = useCallback(() => {
    if (photoLongPressRef.current) {
      clearTimeout(photoLongPressRef.current);
      photoLongPressRef.current = null;
    }
  }, []);

  const handleContentPointerCancel = useCallback(() => {
    if (photoLongPressRef.current) {
      clearTimeout(photoLongPressRef.current);
      photoLongPressRef.current = null;
    }
  }, []);

  const openFullscreenImage = useCallback((src, allSrcs) => {
    setFullscreenImgs(Array.isArray(allSrcs) ? allSrcs : [src]);
    setFullscreenImg(src);
  }, []);

  const closeFullscreenImage = useCallback(() => setFullscreenImg(null), []);

  const attachInputRef = useRef(null);
  const handleAttachSelected = useCallback(
    (e) => {
      const file = e.target?.files?.[0];
      e.target.value = '';
      if (!file) return;
      const asImage = isImageFile(file);
      const doUpload = (f) => {
        if (asImage) {
          runUpload(f, {
            asImage: true,
            onSuccessInsert: (data) => {
              const url = resolveFileUrl(data?.file_url);
              if (url) {
                const html = `<img src="${url.replace(/"/g, '&quot;')}" alt="" class="inline-photo" data-preview-size="large" style="max-width:85%;height:auto;" loading="lazy" />`;
                insertMediaAtCursor(html, 'img.inline-photo');
              }
            },
          });
        } else {
          runUpload(f, {
            asImage: false,
            fileName: f.name,
            onSuccessInsert: (data) => {
              const url = resolveFileUrl(data?.file_url);
              const name = f.name || decodeDocName(data?.file_url?.split?.('/')?.pop()) || 'Документ';
              if (url) insertDocCard(url, name, data?.id);
            },
          });
        }
      };
      if (mobileLayout && asImage) {
        compressImageForUpload(file).then(doUpload);
      } else {
        doUpload(file);
      }
    },
    [runUpload, insertMediaAtCursor, insertDocCard, mobileLayout]
  );

  const docCardTargetsConnected = docCardTargets.filter((t) => t.node?.isConnected);

  return (
    <div className={`${styles.editorWrap} ${mobileLayout ? styles.mobileWrap : ''} ${!mobileLayout ? styles.deskUnified : ''}`}>
      {docCardTargetsConnected.map((t) =>
        createPortal(
          <div key={t.id} className={styles.docCardInlineWrap}>
            <DocumentCard
              title={t.title}
              fileUrl={t.url}
              previewUrl={null}
              onOpen={() => setDocViewer({ url: t.url, title: t.title })}
            />
          </div>,
          t.node
        )
      )}
      <input ref={photoInputRef} type="file" accept="image/*" className={styles.hiddenInput} onChange={handlePhotoSelected} />
      <input ref={docInputRef} type="file" accept=".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.txt,.md,.zip,.rar" className={styles.hiddenInput} onChange={handleDocSelected} />
      <input ref={attachInputRef} type="file" accept="image/*,.pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.txt,.md,.zip,.rar" className={styles.hiddenInput} onChange={handleAttachSelected} />

      <header className={styles.editorHeader}>
        {mobileLayout && onBack ? (
          <button type="button" className={styles.mobileBackBtn} onClick={onBack} aria-label="Назад">
            <ChevronLeft size={24} strokeWidth={2} />
          </button>
        ) : null}
        <input
          ref={titleInputRef}
          type="text"
          className={styles.editorTitle}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onFocus={() => setIsEditing(true)}
          onBlur={() => {
            saveTitle(title);
            setTimeout(() => setIsEditing(document.activeElement === titleInputRef.current || contentRef.current?.contains(document.activeElement)), 0);
          }}
          placeholder="Название"
          aria-label="Название"
        />
        {mobileLayout ? (
          <div className={styles.mobileHeaderRight}>
            {isEditing ? (
              <>
                <button type="button" className={styles.mobileHeaderIconBtn} onClick={() => execCmd('undo')} aria-label="Отменить">
                  <Undo2 size={20} />
                </button>
                <button type="button" className={styles.mobileHeaderIconBtn} onClick={() => execCmd('redo')} aria-label="Повторить">
                  <Redo2 size={20} />
                </button>
                <button type="button" className={styles.mobileHeaderIconBtn} onClick={() => {}} aria-label="Настройки">
                  <MoreVertical size={20} />
                </button>
                <button type="button" className={styles.mobileDoneBtn} onClick={() => { contentRef.current?.blur(); titleInputRef.current?.blur(); setIsEditing(false); }}>
                  Готово
                </button>
              </>
            ) : (
              <button type="button" className={styles.mobileHeaderIconBtn} onClick={() => {}} aria-label="Настройки">
                <MoreVertical size={20} />
              </button>
            )}
          </div>
        ) : (
          <button type="button" className={styles.closeBtn} onClick={handleClose} aria-label="Закрыть">
            <X size={18} />
          </button>
        )}
      </header>

      {(uploadProgress != null || uploadError) && (
        <div className={styles.uploadStatus}>
          {uploadProgress != null && (
            <div className={styles.uploadProgressWrap}>
              <div className={styles.uploadProgressBar} style={{ width: `${uploadProgress}%` }} />
              <span className={styles.uploadProgressText}>Загрузка… {uploadProgress}%</span>
            </div>
          )}
          {uploadError && (
            <div className={styles.uploadErrorBar}>
              <span className={styles.uploadErrorText}>{uploadError}</span>
              <div className={styles.uploadErrorActions}>
                {uploadRetryPayload && (
                  <button type="button" className={styles.uploadRetryBtn} onClick={() => runUpload(uploadRetryPayload.file, { asImage: uploadRetryPayload.asImage, fileName: uploadRetryPayload.fileName, onSuccessInsert: uploadRetryPayload.withInsert ? getInsertHandlerForRetry(uploadRetryPayload) : undefined })}>
                    Повторить
                  </button>
                )}
                <button type="button" className={styles.uploadDismissBtn} onClick={() => { setUploadError(null); setUploadRetryPayload(null); }}>Закрыть</button>
              </div>
            </div>
          )}
        </div>
      )}

      <div className={styles.main}>
        <div className={`${styles.editorArea} ${mobileLayout ? styles.mobileEditorArea : ''} ${!mobileLayout ? styles.deskEditorArea : ''}`}>
          {!mobileLayout && (
            <div ref={deskToolbarRef} className={styles.deskToolbar}>
              <button type="button" className={styles.toolbarBtn} onClick={() => execCmd('bold')} title="Жирный (Ctrl+B)">
                <Bold size={16} />
              </button>
              <button type="button" className={styles.toolbarBtn} onClick={() => execCmd('italic')} title="Курсив (Ctrl+I)">
                <Italic size={16} />
              </button>
              <button type="button" className={styles.toolbarBtn} onClick={() => execCmd('insertUnorderedList')} title="Список">
                <List size={16} />
              </button>
              <button type="button" className={styles.toolbarBtn} onClick={() => execCmd('formatBlock', 'h2')} title="Заголовок">
                <Heading2 size={16} />
              </button>
              <button type="button" className={styles.deskPlusBtn} onClick={() => setInsertMenuOpen((o) => !o)} title="Вставить медиа" aria-haspopup="true" aria-expanded={insertMenuOpen}>
                ＋
              </button>
              {insertMenuOpen && (
                <div className={styles.insertMenuPopover} role="menu">
                  <button type="button" className={styles.insertMenuItem} onClick={() => { photoInputRef.current?.click(); setInsertMenuOpen(false); }} role="menuitem">Фото</button>
                  <button type="button" className={styles.insertMenuItem} onClick={() => { docInputRef.current?.click(); setInsertMenuOpen(false); }} role="menuitem">Документ</button>
                  <button type="button" className={styles.insertMenuItem} onClick={() => { setLinkDialog(true); setInsertMenuOpen(false); }} role="menuitem">Ссылка</button>
                </div>
              )}
            </div>
          )}
          {mobileLayout ? (
            <div className={styles.mobileContentWrap}>
              <div
                ref={contentRef}
                className={`${styles.contentEditable} ${styles.mobileContent}`}
                contentEditable
                suppressContentEditableWarning
                style={{ paddingBottom: `calc(44px + ${keyboardBottomOffset}px + env(safe-area-inset-bottom, 0px) + 16px)` }}
                onInput={handleContentInput}
                onKeyDown={handleContentKeyDown}
                onPointerDown={handleContentPointerDown}
                onPointerUp={handleContentPointerUp}
                onPointerCancel={handleContentPointerCancel}
                onFocus={() => setIsEditing(true)}
                onBlur={() => {
                  flushContentSave();
                  setTimeout(() => setIsEditing(document.activeElement === titleInputRef.current || contentRef.current?.contains(document.activeElement)), 0);
                }}
                onClick={(e) => {
                  const img = e.target?.closest?.('img');
                  if (!img?.src || !contentRef.current?.contains(img)) return;
                  if (photoLongPressHandledRef.current) {
                    photoLongPressHandledRef.current = false;
                    e.preventDefault();
                    return;
                  }
                  e.preventDefault();
                  e.stopPropagation();
                  const imgs = contentRef.current?.querySelectorAll?.('img');
                  openFullscreenImage(img.src, imgs ? Array.from(imgs).map((i) => i.src) : [img.src]);
                }}
              />
            </div>
          ) : (
            <div
              ref={contentRef}
              className={`${styles.contentEditable} ${styles.deskContent} ${dropActive ? styles.deskContentDropActive : ''}`}
              contentEditable
              suppressContentEditableWarning
              onInput={handleContentInput}
              onKeyDown={handleContentKeyDown}
              onPointerDown={handleContentPointerDown}
              onPointerUp={handleContentPointerUp}
              onPointerCancel={handleContentPointerCancel}
              onContextMenu={handleContentContextMenu}
              onDrop={handleContentDrop}
              onDragOver={handleContentDragOver}
              onDragLeave={handleContentDragLeave}
              onPaste={handleContentPaste}
              onMouseMove={handleContentMouseMove}
              onMouseLeave={handleContentMouseLeave}
              onFocus={() => { setIsEditing(true); setInsertMenuOpen(false); }}
              onBlur={() => {
                flushContentSave();
                setTimeout(() => setIsEditing(document.activeElement === titleInputRef.current || contentRef.current?.contains(document.activeElement)), 0);
              }}
              onClick={(e) => {
                const img = e.target?.closest?.('img');
                if (!img?.src || !contentRef.current?.contains(img)) return;
                if (photoLongPressHandledRef.current) {
                  photoLongPressHandledRef.current = false;
                  e.preventDefault();
                  return;
                }
                e.preventDefault();
                e.stopPropagation();
                const imgs = contentRef.current?.querySelectorAll?.('img');
                openFullscreenImage(img.src, imgs ? Array.from(imgs).map((i) => i.src) : [img.src]);
              }}
            />
          )}
        </div>

        {!mobileLayout && (createdAt || updatedAt) && (
          <footer className={styles.deskMetaFooter}>
            {createdAt && <span className={styles.deskMetaItem}>Создано: {new Date(createdAt).toLocaleString('ru-RU')}</span>}
            {updatedAt && <span className={styles.deskMetaItem}>Изменено: {new Date(updatedAt).toLocaleString('ru-RU')}</span>}
          </footer>
        )}
      </div>

      {mobileLayout && (
        <div
          className={styles.mobileToolbar}
          style={toolbarViewportStyle ? { ...toolbarViewportStyle, bottom: 'auto' } : undefined}
        >
          {isEditing && (
            <button
              type="button"
              className={styles.mobileToolbarBtn}
              onClick={() => {
                try {
                  setFormatActive({
                    bold: document.queryCommandState('bold'),
                    italic: document.queryCommandState('italic'),
                    underline: document.queryCommandState('underline'),
                    strikeThrough: document.queryCommandState('strikeThrough'),
                  });
                } catch (_) {}
                setFormatSheetOpen(true);
              }}
              aria-label="Форматирование"
            >
              <span className={styles.aaIcon}>Aa</span>
            </button>
          )}
          <button type="button" className={styles.mobileToolbarBtn} onClick={() => { execCmd('insertUnorderedList'); contentRef.current?.focus(); }} aria-label="Список">
            <List size={22} />
          </button>
          <button type="button" className={styles.mobileToolbarBtn} onClick={() => attachInputRef.current?.click()} aria-label="Прикрепить фото или файл">
            <Paperclip size={22} />
          </button>
          <button type="button" className={styles.mobileToolbarBtn} onClick={() => {}} aria-label="Рисование">
            <PenLine size={22} />
          </button>
        </div>
      )}

      {mobileLayout && formatSheetOpen && (
        <div className={styles.formatSheetOverlay} role="presentation">
          <div className={styles.formatSheet}>
            <div className={styles.formatSheetHeader}>
              <span className={styles.formatSheetTitle}>Форматирование</span>
              <button type="button" className={styles.formatSheetClose} onClick={() => setFormatSheetOpen(false)} aria-label="Закрыть">
                <X size={20} />
              </button>
            </div>
            <div className={styles.formatSheetRow}>
              <button type="button" className={styles.formatPill} onClick={() => { execCmd('formatBlock', 'h2'); contentRef.current?.focus(); setFormatSheetOpen(false); }}>Заголовок</button>
              <button type="button" className={styles.formatPill} onClick={() => { execCmd('formatBlock', 'h3'); contentRef.current?.focus(); setFormatSheetOpen(false); }}>Подзаголовок</button>
              <button type="button" className={styles.formatPillActive} onClick={() => { execCmd('formatBlock', 'p'); contentRef.current?.focus(); setFormatSheetOpen(false); }}>Основной текст</button>
            </div>
            <div className={styles.formatSheetRow}>
              <button type="button" className={`${styles.formatIconBtn} ${formatActive.bold ? styles.formatIconBtnActive : ''}`} onClick={() => { execCmd('bold'); setTimeout(() => setFormatActive((a) => ({ ...a, bold: document.queryCommandState('bold') })), 0); }} aria-label="Жирный"><Bold size={20} /></button>
              <button type="button" className={`${styles.formatIconBtn} ${formatActive.italic ? styles.formatIconBtnActive : ''}`} onClick={() => { execCmd('italic'); setTimeout(() => setFormatActive((a) => ({ ...a, italic: document.queryCommandState('italic') })), 0); }} aria-label="Курсив"><Italic size={20} /></button>
              <button type="button" className={`${styles.formatIconBtn} ${formatActive.underline ? styles.formatIconBtnActive : ''}`} onClick={() => { execCmd('underline'); setTimeout(() => setFormatActive((a) => ({ ...a, underline: document.queryCommandState('underline') })), 0); }} aria-label="Подчёркивание"><Underline size={20} /></button>
              <button type="button" className={`${styles.formatIconBtn} ${formatActive.strikeThrough ? styles.formatIconBtnActive : ''}`} onClick={() => { execCmd('strikeThrough'); setTimeout(() => setFormatActive((a) => ({ ...a, strikeThrough: document.queryCommandState('strikeThrough') })), 0); }} aria-label="Зачёркивание"><Strikethrough size={20} /></button>
            </div>
            <div className={styles.formatSheetRow}>
              <button type="button" className={styles.formatIconBtn} onClick={() => execCmd('insertUnorderedList')} aria-label="Маркированный список"><List size={20} /></button>
              <button type="button" className={styles.formatIconBtn} onClick={() => execCmd('insertOrderedList')} aria-label="Нумерованный список"><ListOrdered size={20} /></button>
              <button type="button" className={styles.formatIconBtn} onClick={() => execCmd('justifyLeft')} aria-label="По левому краю"><AlignLeft size={20} /></button>
              <button type="button" className={styles.formatIconBtn} onClick={() => execCmd('justifyCenter')} aria-label="По центру"><AlignCenter size={20} /></button>
              <button type="button" className={styles.formatIconBtn} onClick={() => execCmd('justifyRight')} aria-label="По правому краю"><AlignRight size={20} /></button>
            </div>
          </div>
        </div>
      )}

      {photoMenu && mobileLayout && (
        <div className={styles.photoMenuOverlay} onClick={closePhotoMenu} role="presentation">
          <div className={styles.photoMenuCenter} onClick={(e) => e.stopPropagation()}>
            <img src={photoMenu.src} alt="" className={styles.photoMenuImg} />
          </div>
          <div className={styles.photoMenuSheet} onClick={(e) => e.stopPropagation()}>
            <button type="button" className={styles.photoMenuItem} onClick={() => { copyImageToClipboard(photoMenu.src); }}><Copy size={18} /> Скопировать</button>
            <button type="button" className={styles.photoMenuItem} onClick={() => { closePhotoMenu(); if (navigator.share) fetch(photoMenu.src).then((r) => r.blob()).then((b) => { const f = new File([b], 'image.png', { type: 'image/png' }); navigator.share({ files: [f] }); }); }}><Upload size={18} /> Поделиться</button>
            <div className={styles.photoMenuDropdown}>
              <button type="button" className={styles.photoMenuItemPreview} onClick={() => setPhotoMenuPreviewOpen((o) => !o)} aria-expanded={photoMenuPreviewOpen}>
                <LayoutGrid size={18} className={styles.photoMenuPreviewIcon} />
                <span className={styles.photoMenuItemPreviewText}>
                  <span className={styles.photoMenuItemPreviewMain}>Режим предпросмотра</span>
                  <span className={styles.photoMenuItemPreviewSub}>{photoMenu.previewSize === 'small' ? 'Мелкий' : 'Крупный'}</span>
                </span>
                <ChevronRight size={18} className={styles.photoMenuPreviewChevron} />
              </button>
              {photoMenuPreviewOpen && (
                <div className={styles.photoMenuDropdownList}>
                  <button type="button" className={styles.photoMenuDropdownItem} onClick={() => setPhotoPreviewSize('large')}>Крупный</button>
                  <button type="button" className={styles.photoMenuDropdownItem} onClick={() => setPhotoPreviewSize('small')}>Мелкий</button>
                </div>
              )}
            </div>
            <button type="button" className={styles.photoMenuItemDanger} onClick={() => { const el = contentRef.current && Array.from(contentRef.current.querySelectorAll('img')).find((i) => i.src === photoMenu.src); if (el) { el.remove(); handleContentInput(); flushContentSave(); } closePhotoMenu(); }}><Trash2 size={18} /> Удалить</button>
          </div>
        </div>
      )}
      {photoMenu && !mobileLayout && photoMenuPosition && (
        <>
          <div className={styles.photoMenuBackdrop} onClick={closePhotoMenu} aria-hidden="true" />
          <div ref={photoMenuPopoverRef} className={styles.photoMenuPopover} style={{ left: (photoMenuClamped ?? photoMenuPosition).x, top: (photoMenuClamped ?? photoMenuPosition).y }} onClick={(e) => e.stopPropagation()}>
            <button type="button" className={styles.photoMenuItem} onClick={() => { copyImageToClipboard(photoMenu.src); }}><Copy size={18} /> Скопировать</button>
            <div className={styles.photoMenuDropdown}>
              <button type="button" className={styles.photoMenuItemPreview} onClick={() => setPhotoMenuPreviewOpen((o) => !o)} aria-expanded={photoMenuPreviewOpen}>
                <LayoutGrid size={18} className={styles.photoMenuPreviewIcon} />
                <span className={styles.photoMenuItemPreviewText}>
                  <span className={styles.photoMenuItemPreviewMain}>Размер</span>
                  <span className={styles.photoMenuItemPreviewSub}>{photoMenu.previewSize === 'small' ? 'Мелкий' : 'Крупный'}</span>
                </span>
                <ChevronRight size={18} className={styles.photoMenuPreviewChevron} />
              </button>
              {photoMenuPreviewOpen && (
                <div className={styles.photoMenuDropdownList}>
                  <button type="button" className={styles.photoMenuDropdownItem} onClick={() => setPhotoPreviewSize('large')}>Крупный</button>
                  <button type="button" className={styles.photoMenuDropdownItem} onClick={() => setPhotoPreviewSize('small')}>Мелкий</button>
                </div>
              )}
            </div>
            <button type="button" className={styles.photoMenuItemDanger} onClick={() => { const el = contentRef.current && Array.from(contentRef.current.querySelectorAll('img')).find((i) => i.src === photoMenu.src); if (el) { el.remove(); handleContentInput(); flushContentSave(); } closePhotoMenu(); }}><Trash2 size={18} /> Удалить</button>
          </div>
        </>
      )}

      {!mobileLayout && hoveredImage?.rect && (
        <div
          className={styles.deskImageHoverBar}
          style={{
            left: hoveredImage.rect.left,
            top: hoveredImage.rect.bottom + 6,
          }}
        >
          <button type="button" className={styles.deskImageHoverBtn} onClick={() => { const imgs = contentRef.current?.querySelectorAll?.('img.inline-photo'); openFullscreenImage(hoveredImage.src, imgs ? Array.from(imgs).map((i) => i.src) : [hoveredImage.src]); setHoveredImage(null); }} title="Открыть">Открыть</button>
          <button type="button" className={styles.deskImageHoverBtnDanger} onClick={() => { const el = contentRef.current?.querySelectorAll?.('img.inline-photo'); const img = el && Array.from(el).find((i) => i.src === hoveredImage.src); if (img) { img.remove(); handleContentInput(); flushContentSave(); } setHoveredImage(null); }} title="Удалить">Удалить</button>
        </div>
      )}

      {fullscreenImg && (
        <FullscreenImageViewer
          currentSrc={fullscreenImg}
          allSrcs={fullscreenImgs}
          onClose={closeFullscreenImage}
          onNavigate={(src) => setFullscreenImg(src)}
        />
      )}

      <DocumentPreviewOverlay
        isOpen={Boolean(docViewer)}
        onClose={() => setDocViewer(null)}
        url={docViewer?.url}
        title={docViewer?.title}
      />

      {linkDialog && (
        <LinkDialog
          onAdd={(url, title) => { addLink(url, title); setLinkDialog(false); }}
          onCancel={() => setLinkDialog(false)}
        />
      )}
    </div>
  );
}

function FullscreenImageViewer({ currentSrc, allSrcs, onClose, onNavigate }) {
  const idx = allSrcs.indexOf(currentSrc);
  const hasPrev = idx > 0;
  const hasNext = idx >= 0 && idx < allSrcs.length - 1;
  const [touchStart, setTouchStart] = useState(null);
  const handleTouchStart = (e) => setTouchStart(e.touches?.[0]?.clientX);
  const handleTouchEnd = (e) => {
    const x = e.changedTouches?.[0]?.clientX;
    if (touchStart == null || x == null) return;
    const dx = x - touchStart;
    if (dx < -50 && hasNext) onNavigate(allSrcs[idx + 1]);
    else if (dx > 50 && hasPrev) onNavigate(allSrcs[idx - 1]);
    setTouchStart(null);
  };
  return (
    <div className={styles.fullscreenOverlay} onClick={onClose} role="dialog" aria-modal="true">
      <button type="button" className={styles.fullscreenClose} onClick={onClose} aria-label="Закрыть">×</button>
      <div
        className={styles.fullscreenImgWrap}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        onClick={(e) => e.stopPropagation()}
      >
        <img src={currentSrc} alt="" className={styles.fullscreenImg} />
      </div>
      {hasPrev && (
        <button type="button" className={styles.fullscreenNav} style={{ left: 8 }} onClick={(e) => { e.stopPropagation(); onNavigate(allSrcs[idx - 1]); }} aria-label="Предыдущее">‹</button>
      )}
      {hasNext && (
        <button type="button" className={styles.fullscreenNav} style={{ right: 8 }} onClick={(e) => { e.stopPropagation(); onNavigate(allSrcs[idx + 1]); }} aria-label="Следующее">›</button>
      )}
    </div>
  );
}

function LinkDialog({ onAdd, onCancel }) {
  const [url, setUrl] = useState('');
  const [title, setTitle] = useState('');
  const inputRef = useRef(null);
  useEffect(() => { inputRef.current?.focus(); }, []);
  const handleSubmit = () => {
    if (url.trim()) onAdd(url.trim(), title.trim());
    else onCancel();
  };
  return (
    <div className={styles.linkDialogOverlay} onClick={onCancel}>
      <div className={styles.linkDialogBox} onClick={(e) => e.stopPropagation()}>
        <input ref={inputRef} type="url" placeholder="URL" value={url} onChange={(e) => setUrl(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleSubmit()} className={styles.linkDialogInput} />
        <input type="text" placeholder="Название (необязательно)" value={title} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleSubmit()} className={styles.linkDialogInput} />
        <div className={styles.linkDialogActions}>
          <button type="button" className={styles.linkDialogBtn} onClick={onCancel}>Отмена</button>
          <button type="button" className={`${styles.linkDialogBtn} ${styles.linkDialogBtnPrimary}`} onClick={handleSubmit}>Добавить</button>
        </div>
      </div>
    </div>
  );
}
