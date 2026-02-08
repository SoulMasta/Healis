import React, { useState, useEffect, useLayoutEffect, useRef, useCallback } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, X, Bold, List, Code, Heading2 } from 'lucide-react';
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

function resolveFileUrl(url) {
  if (!url) return '';
  if (/^https?:\/\//i.test(url)) return url;
  const base = getApiBaseUrl();
  return base ? `${base.replace(/\/+$/, '')}${url}` : url;
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
    mutationFn: (payload) => updateMaterialCard(cardId, payload),
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
      if (newContent === (card?.content ?? '')) return;
      updateMutation.mutate({ content: newContent });
    },
    [card?.content, updateMutation]
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

  return (
    <div className={styles.editorWrap}>
      <header className={styles.editorHeader}>
        <button type="button" className={styles.backBtn} onClick={onBack} aria-label="Назад к списку">
          <ArrowLeft size={18} style={{ verticalAlign: 'middle' }} />
          {isMobile ? '' : ' Назад'}
        </button>
        <input
          type="text"
          className={styles.editorTitle}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={() => saveTitle(title)}
          placeholder="Название карточки"
          aria-label="Название"
        />
        <button type="button" className={styles.backBtn} onClick={onClose} aria-label="Закрыть">
          <X size={18} />
        </button>
      </header>

      <div className={styles.main}>
        <div className={styles.editorArea}>
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
          <div
            ref={contentRef}
            className={styles.contentEditable}
            contentEditable
            suppressContentEditableWarning
            onInput={handleContentInput}
          />
        </div>

        <aside className={styles.sidebar}>
          <section className={styles.sidebarSection}>
            <h3 className={styles.sidebarTitle}>Файлы</h3>
            <FileUploader onUpload={(file) => uploadMutation.mutate(file)} disabled={uploadMutation.isPending}>
              Перетащите файл или нажмите для выбора
            </FileUploader>
            <ul className={styles.fileList}>
              {attachments.map((f) => (
                <li key={f.id} className={styles.fileItem}>
                  <a
                    href={resolveFileUrl(f.file_url)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={styles.fileLink}
                  >
                    {f.file_url?.split('/').pop() || 'Файл'}
                  </a>
                  <button
                    type="button"
                    className={styles.removeFile}
                    onClick={() => deleteFileMutation.mutate(f.id)}
                    aria-label="Удалить"
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          </section>

          <section className={styles.sidebarSection}>
            <h3 className={styles.sidebarTitle}>Ссылки</h3>
            <input
              type="url"
              className={styles.tagsInput}
              placeholder="URL"
              value={linkUrl}
              onChange={(e) => setLinkUrl(e.target.value)}
            />
            <input
              type="text"
              className={styles.tagsInput}
              placeholder="Название (необязательно)"
              value={linkTitle}
              onChange={(e) => setLinkTitle(e.target.value)}
            />
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
                  <a href={l.url} target="_blank" rel="noopener noreferrer" className={styles.linkUrl}>
                    {l.title || l.url}
                  </a>
                  <button
                    type="button"
                    className={styles.removeFile}
                    onClick={() => deleteLinkMutation.mutate(l.id)}
                    aria-label="Удалить"
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          </section>

          <section className={styles.sidebarSection}>
            <h3 className={styles.sidebarTitle}>Теги</h3>
            <input
              type="text"
              className={styles.tagsInput}
              placeholder="Добавить тег"
              value={tagInput}
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addTag())}
            />
            <div className={styles.tagsList}>
              {tags.map((tag) => (
                <span key={tag} className={styles.tag}>
                  {tag}{' '}
                  <button type="button" onClick={() => removeTag(tag)} aria-label={`Удалить тег ${tag}`} style={{ marginLeft: 4, background: 'none', border: 'none', cursor: 'pointer' }}>
                    ×
                  </button>
                </span>
              ))}
            </div>
          </section>

          <section className={styles.sidebarSection}>
            <h3 className={styles.sidebarTitle}>Метаданные</h3>
            {createdBy && (
              <p className={styles.metaText}>
                Создал: {createdBy.nickname || createdBy.username || `ID ${createdBy.id}`}
              </p>
            )}
            {createdAt && (
              <p className={styles.metaText}>Создано: {new Date(createdAt).toLocaleString('ru-RU')}</p>
            )}
            {updatedAt && (
              <p className={styles.metaText}>Изменено: {new Date(updatedAt).toLocaleString('ru-RU')}</p>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}
