import React, { useState, useEffect, useLayoutEffect, useRef, useCallback } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { X, Bold, List, Code, Heading2, Plus, Type, Image, FileText, Link } from 'lucide-react';
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
  const [fabOpen, setFabOpen] = useState(false);
  const [fullscreenImg, setFullscreenImg] = useState(null);
  const [fullscreenImgs, setFullscreenImgs] = useState([]);
  const [docViewer, setDocViewer] = useState(null);
  const [linkDialog, setLinkDialog] = useState(false);
  const photoInputRef = useRef(null);
  const docInputRef = useRef(null);

  useEffect(() => {
    setTitle(card?.title ?? '');
    setAttachments(card?.attachments ?? []);
    setLinks(card?.links ?? []);
    setTagsState(card?.tags ?? []);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- sync only when switching card (card.id)
  }, [card?.id]);

  useLayoutEffect(() => {
    if (contentRef.current && card?.id != null) contentRef.current.innerHTML = card?.content ?? '';
    // eslint-disable-next-line react-hooks/exhaustive-deps -- set content only on card open to avoid overwriting edits
  }, [card?.id]);

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

  const insertAtCursor = useCallback((html) => {
    const el = contentRef.current;
    if (!el) return;
    el.focus();
    document.execCommand('insertHTML', false, html);
    handleContentInput();
  }, [handleContentInput]);

  const addHeading = useCallback(() => {
    setFabOpen(false);
    document.execCommand('formatBlock', false, 'h2');
    contentRef.current?.focus();
    handleContentInput();
  }, [handleContentInput]);

  const handlePhotoSelected = useCallback(
    (e) => {
      const file = e.target?.files?.[0];
      e.target.value = '';
      if (!file || !isImageFile(file)) return;
      setFabOpen(false);
      uploadMutation.mutate(file, {
        onSuccess: (data) => {
          const url = resolveFileUrl(data?.file_url);
          if (url) insertAtCursor(`<img src="${url}" alt="" style="max-width:100%;height:auto;" loading="lazy" />`);
        },
      });
    },
    [uploadMutation, insertAtCursor]
  );

  const handleDocSelected = useCallback(
    (e) => {
      const file = e.target?.files?.[0];
      e.target.value = '';
      if (!file) return;
      setFabOpen(false);
      uploadMutation.mutate(file);
    },
    [uploadMutation]
  );

  const addLink = useCallback(
    (url, title) => {
      setFabOpen(false);
      setLinkDialog(false);
      if (!url?.trim()) return;
      const text = title?.trim() || url.trim();
      insertAtCursor(`<a href="${url.trim()}" target="_blank" rel="noopener noreferrer">${text}</a>`);
    },
    [insertAtCursor]
  );

  const openFullscreenImage = useCallback((src, allSrcs) => {
    setFullscreenImgs(Array.isArray(allSrcs) ? allSrcs : [src]);
    setFullscreenImg(src);
  }, []);

  const closeFullscreenImage = useCallback(() => setFullscreenImg(null), []);

  const docAttachments = attachments.filter((a) => !/\.(png|jpe?g|webp|gif)$/i.test(a.file_url || ''));

  const mobileLayout = Boolean(isMobile);

  useEffect(() => {
    if (!fabOpen) return;
    const close = () => setFabOpen(false);
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, [fabOpen]);

  const fabMenu = fabOpen && (
    <div className={styles.fabMenu} role="menu">
      <button type="button" className={styles.fabMenuItem} onClick={addHeading}>
        <Type size={18} /> Заголовок
      </button>
      <button type="button" className={styles.fabMenuItem} onClick={() => photoInputRef.current?.click()}>
        <Image size={18} /> Фото
      </button>
      <button type="button" className={styles.fabMenuItem} onClick={() => docInputRef.current?.click()}>
        <FileText size={18} /> Документ
      </button>
      <button type="button" className={styles.fabMenuItem} onClick={() => { setFabOpen(false); setLinkDialog(true); }}>
        <Link size={18} /> Ссылка
      </button>
    </div>
  );

  return (
    <div className={`${styles.editorWrap} ${mobileLayout ? styles.mobileWrap : ''}`}>
      <input ref={photoInputRef} type="file" accept="image/*" className={styles.hiddenInput} onChange={handlePhotoSelected} />
      <input ref={docInputRef} type="file" accept=".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.txt,.md,.zip,.rar" className={styles.hiddenInput} onChange={handleDocSelected} />

      <header className={styles.editorHeader}>
        {mobileLayout && onBack ? (
          <button type="button" className={styles.backBtn} onClick={onBack} aria-label="Назад">
            ←
          </button>
        ) : null}
        <input
          type="text"
          className={styles.editorTitle}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={() => saveTitle(title)}
          placeholder="Название"
          aria-label="Название"
        />
        <button type="button" className={styles.closeBtn} onClick={handleClose} aria-label="Закрыть">
          <X size={18} />
        </button>
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
            onBlur={() => flushContentSave()}
            onClick={(e) => {
              const img = e.target?.closest?.('img');
              if (img?.src && mobileLayout) {
                e.preventDefault();
                e.stopPropagation();
                const imgs = contentRef.current?.querySelectorAll?.('img');
                openFullscreenImage(img.src, imgs ? Array.from(imgs).map((i) => i.src) : [img.src]);
              }
            }}
          />
          {mobileLayout && docAttachments.length > 0 && (
            <div className={styles.inlineDocs}>
              {docAttachments.map((f) => (
                <div key={f.id} className={styles.docCard}>
                  <button
                    type="button"
                    className={styles.docCardBtn}
                    onClick={() => setDocViewer(resolveFileUrl(f.file_url))}
                  >
                    <FileText size={20} />
                    <span>{f.file_url?.split('/').pop() || 'Документ'}</span>
                  </button>
                  <button
                    type="button"
                    className={styles.docRemove}
                    onClick={() => deleteFileMutation.mutate(f.id)}
                    aria-label="Удалить"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
          {mobileLayout && (
            <footer className={styles.mobileMeta}>
              {(createdAt || updatedAt || tags.length > 0) && (
                <div className={styles.metaMuted}>
                  {createdAt && <span>{new Date(createdAt).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' })}</span>}
                  {updatedAt && createdAt !== updatedAt && <span> · Изм. {new Date(updatedAt).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}</span>}
                  {tags.length > 0 && <span> · {tags.join(', ')}</span>}
                </div>
              )}
            </footer>
          )}
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
        <>
          <button type="button" className={styles.fab} onClick={() => setFabOpen((o) => !o)} aria-label="Добавить" aria-expanded={fabOpen}>
            <Plus size={24} />
          </button>
          {fabMenu}
        </>
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
