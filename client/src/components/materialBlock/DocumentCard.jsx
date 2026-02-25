import React from 'react';
import styles from './DocumentCard.module.css';

/**
 * Карточка документа: превью (или иконка), название, мета (Документ · EXT).
 * Клик по всей карточке открывает оверлей. contentEditable=false в редакторе.
 */
export default function DocumentCard({ title, previewUrl, fileUrl, onOpen, variant = 'inline', className }) {
  const ext = fileUrl ? (fileUrl.split('.').pop() || '').split('?')[0].toUpperCase() || 'FILE' : 'FILE';
  const isPdf = /\.pdf$/i.test(fileUrl || '');

  return (
    <div
      className={`${styles.card} ${styles[variant]} ${className || ''}`}
      contentEditable={false}
      data-document-card
      suppressContentEditableWarning
      onClick={onOpen}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen?.(); } }}
    >
      <div className={styles.inner}>
        <div className={styles.preview}>
          {previewUrl && !isPdf ? (
            <img src={previewUrl} alt="" className={styles.previewImg} />
          ) : isPdf && fileUrl ? (
            <iframe src={fileUrl} title={title} className={styles.previewIframe} />
          ) : (
            <span className={styles.previewIcon} aria-hidden>📄</span>
          )}
        </div>
        <div className={styles.body}>
          <span className={styles.name} title={title}>{title || 'Документ'}</span>
          <div className={styles.meta}>
            <span className={styles.ext}>Документ · {ext}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
