import React, { useCallback, useState, useRef, useEffect } from 'react';
import { Trash2 } from 'lucide-react';
import styles from './MaterialBlock.module.css';
import elementStyles from '../../styles/WorkspacePage.module.css';
import { ElementWrapper } from '../board/ElementWrapper';
import { useDoubleTap } from '../../hooks/useDoubleTap';

const MaterialBlock = React.memo(function MaterialBlock({
  block,
  isSelected,
  dragOffset,
  showConnectorEndpoints,
  onPointerDown,
  onOpen,
  onResizeStart,
  onSelect,
  onRegisterNode,
  onUpdateTitle,
  onDelete,
  onConnectorEndpointPointerDown,
}) {
  const { id, title, x, y, width, height, cardsCount = 0 } = block;
  const w = Math.max(160, dragOffset?.width ?? width ?? 280);
  const h = Math.max(120, dragOffset?.height ?? height ?? 160);
  const elementShape = { id, x, y, width: w, height: h };
  const dragPos = dragOffset ? { x: dragOffset.x ?? x, y: dragOffset.y ?? y } : null;

  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editTitleValue, setEditTitleValue] = useState(title || 'Материалы');
  const titleInputRef = useRef(null);
  const prevSelectedRef = useRef(isSelected);

  useEffect(() => {
    setEditTitleValue(title || 'Материалы');
  }, [title]);

  // Exit edit mode when another element/block is selected (same behavior as other board elements).
  useEffect(() => {
    if (prevSelectedRef.current && !isSelected && isEditingTitle) {
      setIsEditingTitle(false);
      const v = String(editTitleValue || '').trim() || 'Материалы';
      if (v !== (title || 'Материалы')) onUpdateTitle?.(id, v);
    }
    prevSelectedRef.current = isSelected;
  }, [isSelected, isEditingTitle, editTitleValue, title, id, onUpdateTitle]);

  useEffect(() => {
    if (isEditingTitle && titleInputRef.current) {
      titleInputRef.current.focus();
      titleInputRef.current.select();
    }
  }, [isEditingTitle]);

  const handleOpen = useCallback(
    (e) => {
      e.stopPropagation();
      e.preventDefault();
      onOpen?.(block);
    },
    [block, onOpen]
  );

  const commitTitle = useCallback(() => {
    setIsEditingTitle(false);
    const v = String(editTitleValue || '').trim() || 'Материалы';
    if (v !== (title || 'Материалы')) onUpdateTitle?.(id, v);
  }, [editTitleValue, title, id, onUpdateTitle]);

  const handleTitleKeyDown = useCallback(
    (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        commitTitle();
      }
      if (e.key === 'Escape') {
        setEditTitleValue(title || 'Материалы');
        setIsEditingTitle(false);
        titleInputRef.current?.blur();
      }
    },
    [commitTitle, title]
  );

  const openTitleEdit = useCallback(() => {
    onSelect?.(block);
    setIsEditingTitle(true);
  }, [block, onSelect]);
  const { onPointerUp: onTitleDoubleTapUp } = useDoubleTap(openTitleEdit);

  const handleWrapperPointerDown = useCallback(
    (blockId, ev) => {
      if (ev.target.closest?.('[data-material-open-btn]')) return;
      if (ev.target.closest?.('[data-material-handle]')) return;
      if (ev.target.closest?.('[data-material-title-input]')) return;
      if (ev.target.closest?.('[data-material-connector-endpoint]')) return;
      if (ev.target.closest?.('[data-material-delete-btn]')) return;
      if (ev.target.closest?.('[data-material-title]')) {
        ev.stopPropagation();
        ev.preventDefault();
        return;
      }
      onPointerDown?.(ev, block);
      onSelect?.(block);
    },
    [block, onPointerDown, onSelect]
  );

  const handleWrapperResize = useCallback(
    (blockId, handle, ev) => {
      onResizeStart?.(ev, block, handle);
    },
    [block, onResizeStart]
  );

  const renderActions = onDelete ? (
    <div className={elementStyles.elementActions}>
      <button
        type="button"
        className={elementStyles.deleteElementBtn}
        data-material-delete-btn
        onPointerDown={(ev) => {
          ev.preventDefault();
          ev.stopPropagation();
          onDelete(block);
        }}
        aria-label="Удалить хранилище"
        title="Удалить"
      >
        <Trash2 size={16} />
      </button>
    </div>
  ) : null;

  return (
    <ElementWrapper
      element={elementShape}
      dragPos={dragPos}
      registerNode={onRegisterNode}
      onPointerDown={handleWrapperPointerDown}
      startResize={handleWrapperResize}
      isSelected={isSelected}
      renderActions={renderActions}
      elementType="block"
      className={`${styles.block} ${isSelected ? styles.selected : ''}`}
      dataAttrName="data-material-block-id"
      styles={elementStyles}
    >
      <div className={styles.blockInner}>
        {isEditingTitle ? (
          <input
            ref={titleInputRef}
            type="text"
            className={styles.titleInput}
            data-material-title-input
            value={editTitleValue}
            onChange={(e) => setEditTitleValue(e.target.value)}
            onBlur={commitTitle}
            onKeyDown={handleTitleKeyDown}
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
            aria-label="Название хранилища"
          />
        ) : (
          <h3
            className={styles.title}
            data-material-title
            title="Двойной клик для изменения названия"
            onPointerDown={(e) => { e.stopPropagation(); e.preventDefault(); }}
            onClick={(e) => { e.stopPropagation(); e.preventDefault(); }}
            onPointerUp={onTitleDoubleTapUp}
            onDoubleClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
              openTitleEdit();
            }}
          >
            {title || 'Материалы'}
          </h3>
        )}
        <div className={styles.meta}>
          <span className={styles.count}>
            {cardsCount === 0 ? 'Нет карточек' : `${cardsCount} ${cardsCount === 1 ? 'карточка' : cardsCount < 5 ? 'карточки' : 'карточек'}`}
          </span>
          <button
            type="button"
            className={styles.openBtn}
            data-material-open-btn
            onClick={handleOpen}
            onPointerDown={(e) => e.stopPropagation()}
          >
            Открыть
          </button>
        </div>
      </div>
      {showConnectorEndpoints ? (
        <div className={elementStyles.connectorEndpointsBox} aria-hidden="true">
          <div className={`${elementStyles.connectorEndpoint} ${elementStyles.epTop}`} data-material-connector-endpoint onPointerDown={(ev) => { ev.stopPropagation(); ev.preventDefault(); onConnectorEndpointPointerDown?.(id, 'top', ev); }} />
          <div className={`${elementStyles.connectorEndpoint} ${elementStyles.epRight}`} data-material-connector-endpoint onPointerDown={(ev) => { ev.stopPropagation(); ev.preventDefault(); onConnectorEndpointPointerDown?.(id, 'right', ev); }} />
          <div className={`${elementStyles.connectorEndpoint} ${elementStyles.epBottom}`} data-material-connector-endpoint onPointerDown={(ev) => { ev.stopPropagation(); ev.preventDefault(); onConnectorEndpointPointerDown?.(id, 'bottom', ev); }} />
          <div className={`${elementStyles.connectorEndpoint} ${elementStyles.epLeft}`} data-material-connector-endpoint onPointerDown={(ev) => { ev.stopPropagation(); ev.preventDefault(); onConnectorEndpointPointerDown?.(id, 'left', ev); }} />
        </div>
      ) : null}
    </ElementWrapper>
  );
});

export default MaterialBlock;
