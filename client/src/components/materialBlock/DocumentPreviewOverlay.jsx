import React, { useEffect } from 'react';
import { getApiBaseUrl } from '../../config/runtime';
import { getExt } from '../../utils/boardRenderUtils';
import styles from './DocumentPreviewOverlay.module.css';

function resolveUrl(url) {
  if (!url) return '';
  if (/^https?:\/\//i.test(url)) return url;
  const base = getApiBaseUrl();
  return base ? `${base.replace(/\/+$/, '')}${url}` : url;
}

const IMAGE_EXTS = ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'svg'];
function isImageUrl(u) {
  return IMAGE_EXTS.includes((getExt(u) || '').toLowerCase());
}

/**
 * Оверлей просмотра документа: затемнение, закрытие по клику вне и по Esc.
 * Отображает документ внутри (изображение, PDF embed, Office iframe, или ссылка).
 */
export default function DocumentPreviewOverlay({ isOpen, onClose, url, title }) {
  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const fullUrl = resolveUrl(url);
  const isImage = isImageUrl(url || '');
  const isPdf = /\.pdf$/i.test(url || '');
  const isOffice = /\.(docx?|xlsx?|pptx?)$/i.test(url || '');

  return (
    <div
      className={styles.overlay}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Просмотр документа"
    >
      <div className={styles.box} onClick={(e) => e.stopPropagation()}>
        <header className={styles.header}>
          <h2 className={styles.title} title={title}>{title || 'Документ'}</h2>
          <button type="button" className={styles.closeBtn} onClick={onClose} aria-label="Закрыть">×</button>
        </header>
        {isImage && fullUrl ? (
          <div className={styles.imageWrap}>
            <img src={fullUrl} alt={title || 'Изображение'} className={styles.image} draggable={false} />
          </div>
        ) : isPdf && url ? (
          <embed src={url} type="application/pdf" className={styles.embed} />
        ) : isOffice && fullUrl ? (
          <iframe
            title={title || 'Документ'}
            src={`https://docs.google.com/viewer?url=${encodeURIComponent(fullUrl)}&embedded=true`}
            className={styles.embed}
          />
        ) : (
          <div className={styles.fallback}>
            <a href={fullUrl} target="_blank" rel="noopener noreferrer" className={styles.fallbackLink}>
              Открыть документ
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
