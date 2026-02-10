import React, { useState, useEffect, useLayoutEffect, useRef, useCallback } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { X, Bold, List, Code, Heading2, Undo2, Redo2, MoreVertical, Paperclip, PenLine, ChevronLeft, Italic, Underline, Strikethrough, AlignLeft, AlignCenter, AlignRight, ListOrdered, Copy, Upload, Trash2, LayoutGrid, ChevronRight } from 'lucide-react';
import {
  updateMaterialCard,
  uploadMaterialCardFile,
  addMaterialCardLink,
  deleteMaterialCardLink,
  deleteMaterialCardFile,
  setMaterialCardTags,
} from '../../http/materialBlocksAPI';
import { getApiBaseUrl } from '../../config/runtime';
import FileUploader from './FileUploader';
import styles from './MaterialCardEditor.module.css';

const AUTOSAVE_DELAY_MS = 800;
const IMAGE_TYPES = /^image\/(png|jpe?g|webp|gif)$/i;
function resolveFileUrl(url) {
  if (!url) return '';
  if (/^https?:\/\//i.test(url)) return url;
  const base = getApiBaseUrl();
  return base ? `${base.replace(/\/+$/, '')}${url}` : url;
}

function isImageFile(f) {
  if (!f) return false;
  return (f.type && IMAGE_TYPES.test(f.type)) || /\.(png|jpe?g|webp|gif)$/i.test(f.name || '');
}

export default function MaterialCardEditor({ card, blockTitle, onClose, onBack, isMobile }) {
  const queryClient = useQueryClient();
  const [title, setTitle] = useState(card?.title ?? '');
  const [attachments, setAttachments] = useState(card?.attachments ?? []);
  const [links, setLinks] = useState(card?.links ?? []);
  const [tags, setTagsState] = useState(card?.tags ?? []);
  const [tagInput, setTagInput] = useState('');
  const [linkUrl, setLinkUrl] = useState('');
  const [linkTitle, setLinkTitle] = useState('');
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
  const photoLongPressRef = useRef(null);
  const photoLongPressHandledRef = useRef(false);
  const photoInputRef = useRef(null);
  const docInputRef = useRef(null);
  const titleInputRef = useRef(null);
  const mobileLayout = Boolean(isMobile);

  useEffect(() => {
    setTitle(card?.title ?? '');
    setAttachments(card?.attachments ?? []);
    setLinks(card?.links ?? []);
    setTagsState(card?.tags ?? []);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sync only when switching card (card.id)
  }, [card?.id]);

  const EMPTY_HEADING_HTML = '<div class="mobile-first-heading" data-block="heading"><br></div>';
  useLayoutEffect(() => {
    if (!contentRef.current || card?.id == null) return;
    const raw = (card?.content ?? '').trim();
    contentRef.current.innerHTML = !raw || raw === '<br>' ? EMPTY_HEADING_HTML : card?.content ?? '';
    // eslint-disable-next-line react-hooks/exhaustive-deps -- set content only on card open to avoid overwriting edits
  }, [card?.id]);

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
    const html = el.innerHTML;
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => saveContent(html), AUTOSAVE_DELAY_MS);
  }, [saveContent]);

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
    if (el) saveContent(el.innerHTML);
  }, [saveContent]);

  const execCmd = useCallback((cmd, value = null) => {
    document.execCommand(cmd, false, value);
    contentRef.current?.focus();
  }, []);

  const uploadMutation = useMutation({
    mutationFn: (file) => uploadMaterialCardFile(cardId, file),
    onSuccess: (data) => {
      setAttachments((prev) => [...prev, { id: data.id, file_url: data.file_url, file_type: data.file_type, size: data.size }]);
    },
  });

  const addLinkMutation = useMutation({
    mutationFn: (payload) => addMaterialCardLink(cardId, payload),
    onSuccess: (data) => {
      setLinks((prev) => [...prev, { id: data.id, url: data.url, title: data.title }]);
      setLinkUrl('');
      setLinkTitle('');
    },
  });

  const deleteLinkMutation = useMutation({
    mutationFn: (linkId) => deleteMaterialCardLink(linkId),
    onSuccess: (_, linkId) => {
      setLinks((prev) => prev.filter((l) => l.id !== linkId));
    },
  });

  const deleteFileMutation = useMutation({
    mutationFn: (fileId) => deleteMaterialCardFile(fileId),
    onSuccess: (_, fileId) => {
      setAttachments((prev) => prev.filter((f) => f.id !== fileId));
    },
  });

  const tagsMutation = useMutation({
    mutationFn: (tagList) => setMaterialCardTags(cardId, tagList),
    onSuccess: (_, tagList) => setTagsState(tagList),
  });

  const addTag = useCallback(() => {
    const t = tagInput.trim();
    if (!t || tags.includes(t)) return;
    const next = [...tags, t];
    setTagsState(next);
    setTagInput('');
    tagsMutation.mutate(next);
  }, [tagInput, tags, tagsMutation]);

  const removeTag = useCallback(
    (tag) => {
      const next = tags.filter((x) => x !== tag);
      setTagsState(next);
      tagsMutation.mutate(next);
    },
    [tags, tagsMutation]
  );

  const createdBy = card?.created_by;
  const createdAt = card?.created_at || card?.createdAt;
  const updatedAt = card?.updated_at || card?.updatedAt;

  const handleClose = useCallback(async () => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
      saveTimeoutRef.current = null;
    }
    const el = contentRef.current;
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

  const handlePhotoSelected = useCallback(
    (e) => {
      const file = e.target?.files?.[0];
      e.target.value = '';
      if (!file || !isImageFile(file)) return;
      uploadMutation.mutate(file, {
        onSuccess: (data) => {
          const url = resolveFileUrl(data?.file_url);
          if (url) {
            const html = `<img src="${url.replace(/"/g, '&quot;')}" alt="" class="inline-photo" data-preview-size="large" style="max-width:100%;height:auto;" loading="lazy" />`;
            insertMediaAtCursor(html, 'img.inline-photo');
          }
        },
      });
    },
    [uploadMutation, insertMediaAtCursor]
  );

  const insertDocCard = useCallback(
    (url, filename, attachmentId) => {
      const safeUrl = url.replace(/"/g, '&quot;');
      const name = (filename || 'Документ').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      const html = `<span class="inline-doc-card" contenteditable="false" data-attachment-id="${attachmentId}"><a href="${safeUrl}" target="_blank" rel="noopener noreferrer" class="inline-doc-card-link"><span class="inline-doc-card-icon">📄</span><span class="inline-doc-card-name">${name}</span></a></span>`;
      insertMediaAtCursor(html, '.inline-doc-card');
    },
    [insertMediaAtCursor]
  );

  const handleDocSelected = useCallback(
    (e) => {
      const file = e.target?.files?.[0];
      e.target.value = '';
      if (!file) return;
      uploadMutation.mutate(file, {
        onSuccess: (data) => {
          const url = resolveFileUrl(data?.file_url);
          const name = data?.file_url?.split?.('/')?.pop() || file.name || 'Документ';
          if (url) insertDocCard(url, name, data?.id);
        },
      });
    },
    [uploadMutation, insertDocCard]
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
    setPhotoMenu({ src, previewSize: previewSize || 'large' });
    setPhotoMenuPreviewOpen(false);
  }, []);
  const closePhotoMenu = useCallback(() => { setPhotoMenu(null); setPhotoMenuPreviewOpen(false); }, []);

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

  const handleContentPointerDown = useCallback(
    (e) => {
      const img = e.target?.closest?.('img');
      if (!img?.src || !mobileLayout || !contentRef.current?.contains(img)) return;
      photoLongPressRef.current = setTimeout(() => {
        photoLongPressRef.current = null;
        openPhotoMenu(img.src, img.getAttribute('data-preview-size') || 'large');
      }, LONG_PRESS_MS);
    },
    [mobileLayout, openPhotoMenu]
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
      if (isImageFile(file)) {
        uploadMutation.mutate(file, {
          onSuccess: (data) => {
            const url = resolveFileUrl(data?.file_url);
            if (url) {
              const html = `<img src="${url.replace(/"/g, '&quot;')}" alt="" class="inline-photo" data-preview-size="large" style="max-width:100%;height:auto;" loading="lazy" />`;
              insertMediaAtCursor(html, 'img.inline-photo');
            }
          },
        });
      } else {
        uploadMutation.mutate(file, {
          onSuccess: (data) => {
            const url = resolveFileUrl(data?.file_url);
            const name = data?.file_url?.split?.('/')?.pop() || file.name || 'Документ';
            if (url) insertDocCard(url, name, data?.id);
          },
        });
      }
    },
    [uploadMutation, insertMediaAtCursor, insertDocCard]
  );

  return (
    <div className={`${styles.editorWrap} ${mobileLayout ? styles.mobileWrap : ''}`}>
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

      <div className={styles.main}>
        <div className={`${styles.editorArea} ${mobileLayout ? styles.mobileEditorArea : ''}`}>
          {!mobileLayout && (
            <div className={styles.toolbar}>
              <button type="button" className={styles.toolbarBtn} onClick={() => execCmd('bold')} title="Жирный">
                <Bold size={16} />
              </button>
              <button type="button" className={styles.toolbarBtn} onClick={() => execCmd('insertUnorderedList')} title="Список">
                <List size={16} />
              </button>
              <button type="button" className={styles.toolbarBtn} onClick={() => execCmd('formatBlock', 'h2')} title="Заголовок">
                <Heading2 size={16} />
              </button>
              <button type="button" className={styles.toolbarBtn} onClick={() => execCmd('formatBlock', 'pre')} title="Код">
                <Code size={16} />
              </button>
            </div>
          )}
          <div
            ref={contentRef}
            className={`${styles.contentEditable} ${mobileLayout ? styles.mobileContent : ''}`}
            contentEditable
            suppressContentEditableWarning
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
              if (!img?.src || !mobileLayout || !contentRef.current?.contains(img)) return;
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

        {!mobileLayout && (
          <aside className={styles.sidebar}>
            <section className={styles.sidebarSection}>
              <h3 className={styles.sidebarTitle}>Файлы</h3>
              <FileUploader onUpload={(file) => uploadMutation.mutate(file)} disabled={uploadMutation.isPending}>
                Перетащите файл или нажмите для выбора
              </FileUploader>
              <ul className={styles.fileList}>
                {attachments.map((f) => (
                  <li key={f.id} className={styles.fileItem}>
                    <a href={resolveFileUrl(f.file_url)} target="_blank" rel="noopener noreferrer" className={styles.fileLink}>
                      {f.file_url?.split('/').pop() || 'Файл'}
                    </a>
                    <button type="button" className={styles.removeFile} onClick={() => deleteFileMutation.mutate(f.id)} aria-label="Удалить">×</button>
                  </li>
                ))}
              </ul>
            </section>
            <section className={styles.sidebarSection}>
              <h3 className={styles.sidebarTitle}>Ссылки</h3>
              <input type="url" className={styles.tagsInput} placeholder="URL" value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} />
              <input type="text" className={styles.tagsInput} placeholder="Название (необязательно)" value={linkTitle} onChange={(e) => setLinkTitle(e.target.value)} />
              <button
                type="button"
                className={styles.addCardBtn}
                style={{ marginTop: 6, width: '100%' }}
                onClick={() => linkUrl.trim() && addLinkMutation.mutate({ url: linkUrl.trim(), title: linkTitle.trim() || undefined })}
              >
                Добавить ссылку
              </button>
              <ul className={styles.linkList}>
                {links.map((l) => (
                  <li key={l.id} className={styles.linkItem}>
                    <a href={l.url} target="_blank" rel="noopener noreferrer" className={styles.linkUrl}>{l.title || l.url}</a>
                    <button type="button" className={styles.removeFile} onClick={() => deleteLinkMutation.mutate(l.id)} aria-label="Удалить">×</button>
                  </li>
                ))}
              </ul>
            </section>
            <section className={styles.sidebarSection}>
              <h3 className={styles.sidebarTitle}>Теги</h3>
              <input type="text" className={styles.tagsInput} placeholder="Добавить тег" value={tagInput} onChange={(e) => setTagInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addTag())} />
              <div className={styles.tagsList}>
                {tags.map((tag) => (
                  <span key={tag} className={styles.tag}>
                    {tag}{' '}
                    <button type="button" onClick={() => removeTag(tag)} aria-label={`Удалить тег ${tag}`} style={{ marginLeft: 4, background: 'none', border: 'none', cursor: 'pointer' }}>×</button>
                  </span>
                ))}
              </div>
            </section>
            <section className={styles.sidebarSection}>
              <h3 className={styles.sidebarTitle}>Метаданные</h3>
              {createdBy && <p className={styles.metaText}>Создал: {createdBy.nickname || createdBy.username || `ID ${createdBy.id}`}</p>}
              {createdAt && <p className={styles.metaText}>Создано: {new Date(createdAt).toLocaleString('ru-RU')}</p>}
              {updatedAt && <p className={styles.metaText}>Изменено: {new Date(updatedAt).toLocaleString('ru-RU')}</p>}
            </section>
          </aside>
        )}
      </div>

      {mobileLayout && (
        <div className={styles.mobileToolbar}>
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

      {mobileLayout && photoMenu && (
        <div className={styles.photoMenuOverlay} onClick={closePhotoMenu} role="presentation">
          <div className={styles.photoMenuCenter} onClick={(e) => e.stopPropagation()}>
            <img src={photoMenu.src} alt="" className={styles.photoMenuImg} />
          </div>
          <div className={styles.photoMenuSheet} onClick={(e) => e.stopPropagation()}>
            <button type="button" className={styles.photoMenuItem} onClick={() => { copyImageToClipboard(photoMenu.src); }}>
              <Copy size={18} /> Скопировать
            </button>
            <button type="button" className={styles.photoMenuItem} onClick={() => { closePhotoMenu(); if (navigator.share) fetch(photoMenu.src).then((r) => r.blob()).then((b) => { const f = new File([b], 'image.png', { type: 'image/png' }); navigator.share({ files: [f] }); }); }}>
              <Upload size={18} /> Поделиться
            </button>
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
            <button type="button" className={styles.photoMenuItemDanger} onClick={() => { const el = contentRef.current && Array.from(contentRef.current.querySelectorAll('img')).find((i) => i.src === photoMenu.src); if (el) { el.remove(); handleContentInput(); flushContentSave(); } closePhotoMenu(); }}>
              <Trash2 size={18} /> Удалить
            </button>
          </div>
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

      {docViewer && (
        <div className={styles.docViewerOverlay} onClick={() => setDocViewer(null)}>
          <div className={styles.docViewerBox} onClick={(e) => e.stopPropagation()}>
            <button type="button" className={styles.docViewerClose} onClick={() => setDocViewer(null)} aria-label="Закрыть">×</button>
            {/\.pdf$/i.test(docViewer) ? (
              <embed src={docViewer} type="application/pdf" className={styles.docEmbed} />
            ) : (
              <a href={docViewer} target="_blank" rel="noopener noreferrer" className={styles.docViewerLink}>
                Открыть документ
              </a>
            )}
          </div>
        </div>
      )}

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
