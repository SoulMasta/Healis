import React, { useCallback } from 'react';
import { Bold, Italic, Underline, Trash2, Copy, Lock, Unlock } from 'lucide-react';
import styles from './ElementToolbar.module.css';

const DUPLICATE_OFFSET = 20;

function supportsText(type) {
  return type === 'note' || type === 'text';
}

function getTextStyle(el) {
  if (el?.type === 'note') {
    const n = el.note ?? el.Note ?? {};
    return { bold: Boolean(n.bold), italic: Boolean(n.italic), underline: Boolean(n.underline) };
  }
  if (el?.type === 'text') {
    const t = el.text ?? el.Text ?? {};
    return { bold: Boolean(t.bold), italic: Boolean(t.italic), underline: Boolean(t.underline) };
  }
  return null;
}

function ElementToolbarInner({
  target,
  isMobile,
  onUpdate,
  onDelete,
  onDuplicate,
  onToggleLock,
  desktopPosition,
}) {
  const isBlock = target?.type === 'materialBlock';
  const element = target?.type === 'element' ? target.data : null;
  const textStyle = element ? getTextStyle(element) : null;
  const showTextTools = Boolean(element && supportsText(element.type) && textStyle !== null);
  const locked = Boolean(element?.locked);

  const handleTextToggle = useCallback(
    (key) => {
      if (!onUpdate || !element || !showTextTools) return;
      if (element.type === 'note') {
        const n = element.note ?? element.Note ?? {};
        onUpdate(element.id, { [key]: !n[key] });
      } else {
        const t = element.text ?? element.Text ?? {};
        onUpdate(element.id, { [key]: !t[key] });
      }
    },
    [onUpdate, showTextTools, element]
  );

  const stopProp = useCallback((e) => {
    e.stopPropagation();
  }, []);

  if (!target?.data) return null;

  const toolbarContent = (
    <div
      className={isMobile ? styles.toolbarMobile : styles.toolbarDesktop}
      role="toolbar"
      aria-label="Element actions"
      onPointerDown={stopProp}
      onClick={stopProp}
    >
      {showTextTools ? (
        <>
          <button
            type="button"
            className={`${styles.toolBtn} ${textStyle.bold ? styles.toolBtnActive : ''}`}
            aria-label="Bold"
            aria-pressed={textStyle.bold}
            onClick={() => handleTextToggle('bold')}
          >
            <Bold size={18} />
          </button>
          <button
            type="button"
            className={`${styles.toolBtn} ${textStyle.italic ? styles.toolBtnActive : ''}`}
            aria-label="Italic"
            aria-pressed={textStyle.italic}
            onClick={() => handleTextToggle('italic')}
          >
            <Italic size={18} />
          </button>
          <button
            type="button"
            className={`${styles.toolBtn} ${textStyle.underline ? styles.toolBtnActive : ''}`}
            aria-label="Underline"
            aria-pressed={textStyle.underline}
            onClick={() => handleTextToggle('underline')}
          >
            <Underline size={18} />
          </button>
          <span className={styles.sep} aria-hidden="true" />
        </>
      ) : null}
      <button
        type="button"
        className={styles.toolBtn}
        aria-label="Duplicate"
        onClick={() => onDuplicate?.(target)}
      >
        <Copy size={18} />
      </button>
      {!isBlock ? (
        <>
          <button
            type="button"
            className={`${styles.toolBtn} ${locked ? styles.toolBtnActive : ''}`}
            aria-label={locked ? 'Unlock' : 'Lock'}
            aria-pressed={locked}
            onClick={() => onToggleLock?.(target)}
          >
            {locked ? <Lock size={18} /> : <Unlock size={18} />}
          </button>
          <span className={styles.sep} aria-hidden="true" />
        </>
      ) : null}
      <button
        type="button"
        className={styles.toolBtnDanger}
        aria-label="Delete"
        onClick={() => onDelete?.(target)}
      >
        <Trash2 size={18} />
      </button>
    </div>
  );

  if (isMobile) {
    return (
      <div className={styles.mobileWrap} onPointerDown={stopProp} onClick={stopProp}>
        {toolbarContent}
      </div>
    );
  }

  if (desktopPosition) {
    return (
      <div
        className={styles.desktopWrap}
        style={{ left: desktopPosition.x, top: desktopPosition.y }}
        onPointerDown={stopProp}
        onClick={stopProp}
      >
        {toolbarContent}
      </div>
    );
  }

  return null;
}

export const ElementToolbar = React.memo(ElementToolbarInner);
export { DUPLICATE_OFFSET };
