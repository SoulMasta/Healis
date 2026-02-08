import React from 'react';

export function ElementWrapper({
  element,
  dragPos,
  resizeOffset,
  children,
  registerNode,
  onPointerDown,
  onClick,
  onContextMenu,
  onDoubleClick,
  onPointerUp,
  startResize,
  isSelected,
  renderActions,
  elementType,
  className,
  extraClassName,
  styles,
  dataAttrName,
}) {
  const elementId = element?.id;
  const dataAttr = dataAttrName || 'data-element-id';
  const ex = Number(resizeOffset?.x ?? dragPos?.x ?? (element?.x ?? 0));
  const ey = Number(resizeOffset?.y ?? dragPos?.y ?? (element?.y ?? 0));
  const width = resizeOffset?.width ?? element?.width ?? 240;
  const height = resizeOffset?.height ?? element?.height ?? 160;
  const zIndex = element?.zIndex ?? 0;
  const rotation = element?.rotation ?? 0;
  const s = styles || {};

  return (
    <div
      {...{ [dataAttr]: elementId }}
      className={`${className || ''} ${extraClassName || ''}`.trim()}
      ref={(node) => registerNode?.(elementId, node)}
      style={{
        left: 0,
        top: 0,
        width,
        height,
        zIndex,
        transform: `translate3d(${ex}px, ${ey}px, 0) rotate(${rotation}deg)`,
      }}
      onPointerDown={(ev) => onPointerDown?.(elementId, ev)}
      onClick={(ev) => onClick?.(elementId, ev)}
      onPointerUp={(ev) => onPointerUp?.(elementId, ev)}
      onContextMenu={onContextMenu}
      onDoubleClick={onDoubleClick}
    >
      {children}
      {isSelected && renderActions ? (
        <div className={s.transformBox}>
          {renderActions}
          {elementType !== 'note' ? (
            <>
              <div className={`${s.resizeHandle} ${s.hNW}`} onPointerDown={(ev) => startResize?.(elementId, 'nw', ev)} />
              <div className={`${s.resizeHandle} ${s.hN}`} onPointerDown={(ev) => startResize?.(elementId, 'n', ev)} />
              <div className={`${s.resizeHandle} ${s.hNE}`} onPointerDown={(ev) => startResize?.(elementId, 'ne', ev)} />
              <div className={`${s.resizeHandle} ${s.hE}`} onPointerDown={(ev) => startResize?.(elementId, 'e', ev)} />
              <div className={`${s.resizeHandle} ${s.hSE}`} onPointerDown={(ev) => startResize?.(elementId, 'se', ev)} />
              <div className={`${s.resizeHandle} ${s.hS}`} onPointerDown={(ev) => startResize?.(elementId, 's', ev)} />
              <div className={`${s.resizeHandle} ${s.hSW}`} onPointerDown={(ev) => startResize?.(elementId, 'sw', ev)} />
              <div className={`${s.resizeHandle} ${s.hW}`} onPointerDown={(ev) => startResize?.(elementId, 'w', ev)} />
            </>
          ) : (
            <>
              <div className={`${s.resizeHandle} ${s.hNW}`} onPointerDown={(ev) => startResize?.(elementId, 'nw', ev)} />
              <div className={`${s.resizeHandle} ${s.hNE}`} onPointerDown={(ev) => startResize?.(elementId, 'ne', ev)} />
              <div className={`${s.resizeHandle} ${s.hSE}`} onPointerDown={(ev) => startResize?.(elementId, 'se', ev)} />
              <div className={`${s.resizeHandle} ${s.hSW}`} onPointerDown={(ev) => startResize?.(elementId, 'sw', ev)} />
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
