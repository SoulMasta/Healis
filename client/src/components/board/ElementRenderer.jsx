import React from 'react';
import { MessageCircle, Link2, ExternalLink, Download } from 'lucide-react';
import { ElementWrapper } from './ElementWrapper';
import MaterialBlock from '../materialBlock/MaterialBlock';
import { idKey, sameId } from '../../workspace/useWorkspace';
import {
  getFitMeasurerEl,
  pointsToSvgPath,
  getExt,
  isPhotoExt,
  pickDocIcon,
  fixMojibakeNameClient,
  safeHostname,
  normalizeUrlClient,
  renderHighlightedText,
  TEXT_PREVIEW_EXTS,
} from '../../utils/boardRenderUtils';
import { useDoubleTap } from '../../hooks/useDoubleTap';
import styles from '../../styles/WorkspacePage.module.css';

const FrameElement = React.memo(function FrameElement({
  el,
  isSelected,
  isEditing,
  dragPos,
  resizeOffset,
  activeTool,
  connectorHoverElementId,
  connectorFromElementId,
  connectorToHoverElementId,
  registerNode,
  onPointerDown,
  onElementClick,
  startResize,
  beginEditing,
  endEditing,
  updateLocalElement,
  persistElement,
  startConnectorDrag,
  styles: s,
}) {
  const elementId = el?.id;
  const frame = el?.frame ?? el?.Frame;
  const title = frame?.title ?? 'Frame';
  const [draftTitle, setDraftTitle] = React.useState(title);
  const inputRef = React.useRef(null);
  React.useEffect(() => {
    if (isEditing) {
      setDraftTitle(title);
      inputRef.current?.focus?.();
    }
  }, [isEditing, title]);
  const commitTitle = React.useCallback(() => {
    const t = String(draftTitle ?? '').trim() || 'Frame';
    updateLocalElement?.(elementId, { frame: { ...(frame || {}), title: t } });
    endEditing?.();
    const current = { ...el, frame: { ...(frame || {}), title: t } };
    persistElement?.(current, {}).catch(() => {});
  }, [elementId, draftTitle, frame, el, updateLocalElement, endEditing, persistElement]);
  const openFrameTitleEdit = React.useCallback(() => {
    if (activeTool !== 'pen' && activeTool !== 'eraser') beginEditing(elementId);
  }, [activeTool, beginEditing, elementId]);
  const { onPointerUp: onDoubleTapPointerUp } = useDoubleTap(openFrameTitleEdit);

  const showConnectorEndpoints =
    isSelected ||
    (activeTool === 'connector' && connectorHoverElementId === elementId) ||
    connectorFromElementId === elementId ||
    connectorToHoverElementId === elementId;
  const renderActions = <div className={s.elementActions} />;
  return (
    <ElementWrapper
      element={el}
      dragPos={dragPos}
      resizeOffset={resizeOffset}
      registerNode={registerNode}
      onPointerDown={onPointerDown}
      onClick={onElementClick}
      startResize={startResize}
      isSelected={isSelected}
      renderActions={renderActions}
      elementType="frame"
      className={s.element}
      styles={s}
    >
      <div className={s.frameFill} />
      {isEditing ? (
        <input
          ref={inputRef}
          className={s.frameLabelInput}
          value={draftTitle}
          onChange={(e) => setDraftTitle(e.target.value)}
          onBlur={commitTitle}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              commitTitle();
            }
            if (e.key === 'Escape') {
              setDraftTitle(title);
              endEditing?.();
              e.target.blur();
            }
          }}
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
        />
      ) : (
        <div
          className={s.frameLabel}
          onDoubleClick={(e) => {
            e.stopPropagation();
            openFrameTitleEdit();
          }}
          onPointerUp={onDoubleTapPointerUp}
        >
          {title}
        </div>
      )}
      {showConnectorEndpoints ? (
        <div className={s.connectorEndpointsBox} aria-hidden="true">
          <div
            className={`${s.connectorEndpoint} ${s.epTop}`}
            onPointerDown={(ev) => startConnectorDrag?.(elementId, 'top', ev)}
          />
          <div
            className={`${s.connectorEndpoint} ${s.epRight}`}
            onPointerDown={(ev) => startConnectorDrag?.(elementId, 'right', ev)}
          />
          <div
            className={`${s.connectorEndpoint} ${s.epBottom}`}
            onPointerDown={(ev) => startConnectorDrag?.(elementId, 'bottom', ev)}
          />
          <div
            className={`${s.connectorEndpoint} ${s.epLeft}`}
            onPointerDown={(ev) => startConnectorDrag?.(elementId, 'left', ev)}
          />
        </div>
      ) : null}
    </ElementWrapper>
  );
});

const NoteTextElement = React.memo(function NoteTextElement({
  el,
  isMobile,
  isSelected,
  isEditing,
  dragX,
  dragY,
  resizeOffset,
  commentsEnabled,
  deletingElementId,
  searchQuery,
  isSearchHit,
  activeTool,
  connectorHoverElementId,
  connectorFromElementId,
  connectorToHoverElementId,
  registerNode,
  actions,
}) {
  const elementId = el?.id;
  const content = el?.content;
  const [draft, setDraft] = React.useState(String(content ?? ''));
  const textElRef = React.useRef(null);
  const [fitStyle, setFitStyle] = React.useState(() => ({
    fontSizePx: 14,
    padY: 18,
  }));

  React.useEffect(() => {
    if (!elementId) return;
    if (isEditing) setDraft(String(content ?? ''));
  }, [isEditing, elementId, content]);

  React.useLayoutEffect(() => {
    const node = textElRef.current;
    const measurer = getFitMeasurerEl();
    if (!node || !measurer) return;

    const boxW = Math.max(0, Math.floor(node.clientWidth || 0));
    const boxH = Math.max(0, Math.floor(node.clientHeight || 0));
    if (boxW <= 0 || boxH <= 0) return;

    const cs = window.getComputedStyle(node);
    const lineHeight = 1.15;
    measurer.style.fontFamily = cs.fontFamily;
    measurer.style.fontWeight = cs.fontWeight;
    measurer.style.letterSpacing = cs.letterSpacing;
    measurer.style.lineHeight = String(lineHeight);
    measurer.style.whiteSpace = 'pre-wrap';
    measurer.style.wordBreak = 'break-word';
    measurer.style.overflowWrap = 'break-word';
    measurer.style.width = `${boxW}px`;

    const rawText = String(isEditing ? draft : (el?.content ?? ''));
    const measureText = rawText.trim().length ? rawText : 'A';
    measurer.textContent = measureText;

    const minFont = 10;
    const maxFont = Math.min(72, Math.max(18, Math.floor(boxH * 0.6)));
    const padX = el?.type === 'note' ? 22 : 18;
    const minPadY = 8;
    const availW = Math.max(0, boxW - padX * 2);
    const availH = Math.max(0, boxH - minPadY * 2);
    if (availW <= 0 || availH <= 0) return;

    measurer.style.width = `${availW}px`;

    const fits = () => measurer.scrollHeight <= availH + 0.5 && measurer.scrollWidth <= availW + 0.5;

    let lo = minFont;
    let hi = maxFont;
    for (let i = 0; i < 10; i += 1) {
      const mid = Math.floor((lo + hi + 1) / 2);
      measurer.style.fontSize = `${mid}px`;
      if (fits()) lo = mid;
      else hi = mid - 1;
      if (hi <= lo) break;
    }
    const fontSizePx = Math.max(minFont, Math.min(maxFont, lo));

    measurer.style.fontSize = `${fontSizePx}px`;
    const textH = Math.max(0, Math.ceil(measurer.scrollHeight || 0));
    const padY = Math.max(minPadY, Math.floor((boxH - textH) / 2));

    setFitStyle((prev) => {
      if (prev.fontSizePx === fontSizePx && prev.padY === padY) return prev;
      return { fontSizePx, padY };
    });
  }, [draft, isEditing, el?.content, el?.width, el?.height, el?.type, resizeOffset?.width, resizeOffset?.height]);

  if (!elementId) return null;

  const showConnectorEndpoints =
    isSelected ||
    (activeTool === 'connector' && connectorHoverElementId === elementId) ||
    connectorFromElementId === elementId ||
    connectorToHoverElementId === elementId;

  const innerClass =
    el.type === 'note' ? `${styles.elementInner} ${styles.noteInner}` : `${styles.elementInner} ${styles.textInner}`;
  const displayTextClass = el.type === 'note' ? `${styles.displayText} ${styles.notePad}` : styles.displayText;
  const editorClass = el.type === 'note' ? `${styles.editor} ${styles.noteEditorPad}` : styles.editor;
  const padX = el.type === 'note' ? 22 : 18;
  const textStyle = el.type === 'note' ? (el.note ?? el.Note) : (el.text ?? el.Text);
  const fitInlineStyle = {
    fontSize: `${fitStyle.fontSizePx}px`,
    lineHeight: 1.15,
    paddingTop: `${fitStyle.padY}px`,
    paddingBottom: `${fitStyle.padY}px`,
    paddingLeft: `${padX}px`,
    paddingRight: `${padX}px`,
    textAlign: 'center',
    fontWeight: textStyle?.bold ? 'bold' : undefined,
    fontStyle: textStyle?.italic ? 'italic' : undefined,
    textDecoration: textStyle?.underline ? 'underline' : undefined,
  };

  const reactionBubbles = actions.layoutReactionBubbles(elementId, el.reactions);
  const dragPos = dragX != null || dragY != null ? { x: dragX ?? el.x ?? 0, y: dragY ?? el.y ?? 0 } : null;

  const renderActions = <div className={styles.elementActions} />;

  return (
    <ElementWrapper
      element={el}
      dragPos={dragPos}
      resizeOffset={resizeOffset}
      registerNode={registerNode}
      onPointerDown={actions.onElementPointerDown}
      onClick={actions.onElementClick}
      onContextMenu={(ev) => {
        if (isMobile) return;
        if (activeTool === 'pen' || activeTool === 'eraser') return;
        ev.preventDefault();
        ev.stopPropagation();
        actions.openReactionPicker(elementId, ev.clientX, ev.clientY);
      }}
      onDoubleClick={() => {
        if (activeTool === 'pen' || activeTool === 'eraser') return;
        actions.beginEditing(elementId);
      }}
      onPointerUp={(ev) => actions.maybeEnterEditOnPointerUp?.(elementId, ev)}
      startResize={actions.startResize}
      isSelected={isSelected}
      renderActions={renderActions}
      elementType={el.type}
      className={styles.element}
      styles={styles}
    >
      {commentsEnabled ? (
        <button
          type="button"
          className={styles.commentBtn}
          onPointerDown={(ev) => ev.stopPropagation()}
          onClick={(ev) => {
            ev.stopPropagation();
            actions.openComments(elementId);
          }}
          aria-label="Comments"
          title="Комментарии"
        >
          <MessageCircle size={16} />
        </button>
      ) : null}
      <div className={`${innerClass} ${isSearchHit ? styles.elementSearchHit : ''}`}>
        {isEditing ? (
          <textarea
            className={editorClass}
            value={draft}
            ref={textElRef}
            style={fitInlineStyle}
            autoFocus
            onPointerDown={(ev) => ev.stopPropagation()}
            onBlur={(ev) => {
              const next = ev.relatedTarget;
              if (next && next.closest?.(`[data-element-id="${elementId}"]`)) return;
              actions.endEditing?.();
            }}
            onChange={(ev) => {
              const next = ev.target.value;
              setDraft(next);
              actions.mutateElementRef(elementId, { content: next });
              if (el.type === 'note') actions.queueNoteEdit(elementId, next);
            }}
            onKeyDown={async (ev) => {
              if (ev.key === 'Escape') {
                ev.preventDefault();
                ev.stopPropagation();
                await actions.endEditing();
                return;
              }
              if (ev.key === 'Enter' && !ev.shiftKey) {
                ev.preventDefault();
                await actions.endEditing();
              }
            }}
          />
        ) : (
          <div ref={textElRef} className={displayTextClass} style={fitInlineStyle}>
            {renderHighlightedText(el.content ?? '', searchQuery, styles.searchMark)}
          </div>
        )}
      </div>

      {showConnectorEndpoints ? (
        <div className={styles.connectorEndpointsBox} aria-hidden="true">
          <div
            className={`${styles.connectorEndpoint} ${styles.epTop}`}
            onPointerDown={(ev) => actions.startConnectorDrag(elementId, 'top', ev)}
          />
          <div
            className={`${styles.connectorEndpoint} ${styles.epRight}`}
            onPointerDown={(ev) => actions.startConnectorDrag(elementId, 'right', ev)}
          />
          <div
            className={`${styles.connectorEndpoint} ${styles.epBottom}`}
            onPointerDown={(ev) => actions.startConnectorDrag(elementId, 'bottom', ev)}
          />
          <div
            className={`${styles.connectorEndpoint} ${styles.epLeft}`}
            onPointerDown={(ev) => actions.startConnectorDrag(elementId, 'left', ev)}
          />
        </div>
      ) : null}

      {reactionBubbles.length ? (
        <div className={styles.reactionsLayer} aria-label="Reactions">
          {reactionBubbles.map((b) => (
            <button
              key={b.emoji}
              type="button"
              className={`${styles.reactionBubble} ${b.count === 1 ? styles.reactionSolo : ''}`}
              data-side={b.side}
              style={{
                left: `${b.xPct}%`,
                top: `${b.yPct}%`,
              }}
              onPointerDown={(ev) => ev.stopPropagation()}
              onClick={(ev) => {
                ev.stopPropagation();
                actions.toggleReaction(elementId, b.emoji);
              }}
              title={b.count > 1 ? `${b.emoji} · ${b.count}` : b.emoji}
              aria-label={b.count > 1 ? `${b.emoji} ${b.count}` : b.emoji}
            >
              <span className={styles.reactionEmoji}>{b.emoji}</span>
              {b.count > 1 ? <span className={styles.reactionCount}>{b.count}</span> : null}
            </button>
          ))}
        </div>
      ) : null}
    </ElementWrapper>
  );
});

const ConnectorsLayer = React.memo(function ConnectorsLayer({
  connectors,
  connectorDraft,
  selectedConnectorId,
  onSelectConnector,
  startConnectorBendDrag,
  computeConnectorPathFromAnchors,
  getAnchorPoint,
  active,
}) {
  const [, forceTick] = React.useState(0);
  React.useEffect(() => {
    if (!active) return () => {};
    let raf = null;
    const loop = () => {
      forceTick((t) => (t + 1) % 1_000_000);
      raf = window.requestAnimationFrame(loop);
    };
    raf = window.requestAnimationFrame(loop);
    return () => {
      if (raf != null) window.cancelAnimationFrame(raf);
    };
  }, [active]);

  return (
    <svg className={styles.connectorsLayer} aria-hidden="true">
      <defs>
        <marker
          id="connector-arrow"
          viewBox="0 0 10 10"
          refX="9"
          refY="5"
          markerWidth="6"
          markerHeight="6"
          orient="auto-start-reverse"
        >
          <path d="M 0 0 L 10 5 L 0 10 z" fill="currentColor" />
        </marker>
      </defs>

      {(Array.isArray(connectors) ? connectors : []).map((el) => {
        const data = el?.connector?.data || el?.Connector?.data || {};
        const from = data?.from || {};
        const to = data?.to || {};
        const fromId = from?.blockId != null ? `block:${from.blockId}` : from?.elementId;
        const toId = to?.blockId != null ? `block:${to.blockId}` : to?.elementId;
        if (!fromId || !toId || !from?.side || !to?.side) return null;

        const a0 = getAnchorPoint?.(fromId, from.side);
        const a1 = getAnchorPoint?.(toId, to.side);
        if (!a0 || !a1) return null;

        const bend = data?.bend || { x: 0, y: 0 };
        const { d, handle } = computeConnectorPathFromAnchors(a0, a1, bend);
        const color = String(data?.style?.color || 'rgba(15,23,42,0.75)');
        const w = Math.max(1, Number(data?.style?.width ?? 2));
        const selected = sameId(selectedConnectorId, el.id);
        const arrow = data?.style?.arrowEnd !== false;

        return (
          <g key={el.id} className={selected ? styles.connectorSelected : ''}>
            {selected ? (
              <path
                d={d}
                fill="none"
                stroke="rgba(43, 108, 255, 0.55)"
                strokeWidth={Math.max(8, w + 8)}
                strokeLinecap="round"
                strokeLinejoin="round"
                pointerEvents="none"
              />
            ) : null}
            <path
              d={d}
              fill="none"
              stroke={color}
              strokeWidth={selected ? Math.max(2, w + 0.75) : w}
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ color }}
              markerEnd={arrow ? 'url(#connector-arrow)' : undefined}
            />
            <path
              d={d}
              fill="none"
              stroke="transparent"
              strokeWidth={Math.max(10, w + 10)}
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ pointerEvents: 'auto' }}
              onPointerDown={(ev) => {
                ev.stopPropagation();
                ev.preventDefault();
                onSelectConnector?.(el.id);
              }}
            />
            {selected ? (
              <circle
                cx={handle.x}
                cy={handle.y}
                r={9}
                className={styles.connectorBendHandle}
                style={{ pointerEvents: 'auto' }}
                onPointerDown={(ev) => startConnectorBendDrag?.(el.id, ev)}
              />
            ) : null}
          </g>
        );
      })}

      {(connectorDraft?.from?.elementId || connectorDraft?.from?.blockId) && connectorDraft?.from?.side ? (
        (() => {
          const fromId =
            connectorDraft.from.blockId != null
              ? `block:${connectorDraft.from.blockId}`
              : connectorDraft.from.elementId;
          const a0 = getAnchorPoint?.(fromId, connectorDraft.from.side);
          if (!a0) return null;

          let a1 = null;
          const th = connectorDraft?.toHover;
          if (th?.side && (th?.elementId != null || th?.blockId != null)) {
            const toId = th.blockId != null ? `block:${th.blockId}` : th.elementId;
            a1 = getAnchorPoint?.(toId, th.side);
          }
          if (!a1) {
            const p3 = connectorDraft.cursor || { x: a0.x + 1, y: a0.y + 1 };
            const dx = Number(p3.x) - a0.x;
            const dy = Number(p3.y) - a0.y;
            const ax = Math.abs(dx);
            const ay = Math.abs(dy);
            const dir = ax >= ay ? { x: dx >= 0 ? -1 : 1, y: 0 } : { x: 0, y: dy >= 0 ? -1 : 1 };
            a1 = { x: Number(p3.x), y: Number(p3.y), dir };
          }

          const { d } = computeConnectorPathFromAnchors(a0, a1, { x: 0, y: 0 });
          return (
            <path
              d={d}
              fill="none"
              stroke="rgba(15,23,42,0.55)"
              strokeWidth={2}
              strokeDasharray="6 6"
              strokeLinecap="round"
              strokeLinejoin="round"
              markerEnd="url(#connector-arrow)"
            />
          );
        })()
      ) : null}
    </svg>
  );
});

export function ElementRenderer({
  styles: stylesProp,
  connectors,
  connectorDraft,
  selectedConnectorId,
  onSelectConnector,
  startConnectorBendDrag,
  computeConnectorPathFromAnchors,
  getAnchorPoint,
  connectorsFollowDuringDrag,
  elements,
  materialBlocks,
  interactionRef,
  elementResizeOffset,
  selectedElementIds,
  registerElementNode,
  onElementPointerDown,
  onElementClick,
  startResize,
  handleDeleteElement,
  editingElementId,
  setEditingElementId,
  setSelectedElementIds,
  deletingElementId,
  isMobile,
  commentsEnabled,
  searchQuery,
  hasSearchQuery,
  manualSearchHitIds,
  activeTool,
  connectorHoverElementId,
  noteTextActions,
  layoutReactionBubbles,
  openReactionPicker,
  beginEditing,
  openComments,
  updateLocalElement,
  queueNoteEdit,
  endEditing,
  persistElement,
  editStartSnapRef,
  openDocument,
  openPhotoPreview,
  downloadDocument,
  openExternalUrl,
  getLinkPreview,
  docTextPreview,
  toggleReaction,
  startConnectorDrag,
  selectedMaterialBlockId,
  materialBlockDragOffset,
  connectorHoverBlockId,
  startBlockDrag,
  setMaterialBlockModal,
  startBlockResize,
  setSelectedMaterialBlockId,
  onSelectMaterialBlock,
  registerMaterialBlockNode,
  handleMaterialBlockTitleUpdate,
  handleDeleteMaterialBlock,
  startConnectorDragFromBlock,
}) {
  const s = stylesProp || styles;
  const lastDocTapRef = React.useRef({ elementId: null, time: 0, x: 0, y: 0 });
  const handleDocCardPointerUp = React.useCallback(
    (e, el) => {
      if (e.pointerType === 'mouse') return;
      const now = Date.now();
      const x = e.clientX;
      const y = e.clientY;
      const prev = lastDocTapRef.current;
      const isDoubleTap =
        prev &&
        prev.elementId === el.id &&
        now - prev.time < 400 &&
        Math.hypot(x - prev.x, y - prev.y) < 25;
      if (isDoubleTap) {
        lastDocTapRef.current = { elementId: null, time: 0, x: 0, y: 0 };
        e.preventDefault();
        e.stopPropagation();
        if (el.type === 'document') {
          const doc = el.document ?? el.Document;
          const docUrl = doc?.url;
          if (docUrl) {
            const docTitle = fixMojibakeNameClient(doc?.title || 'Document');
            openPhotoPreview?.(docUrl, docTitle);
            return;
          }
        }
        beginEditing?.(el.id);
        return;
      }
      lastDocTapRef.current = { elementId: el.id, time: now, x, y };
    },
    [openPhotoPreview, beginEditing]
  );

  return (
    <>
      <ConnectorsLayer
        connectors={connectors}
        connectorDraft={connectorDraft}
        selectedConnectorId={selectedConnectorId}
        onSelectConnector={onSelectConnector}
        startConnectorBendDrag={startConnectorBendDrag}
        computeConnectorPathFromAnchors={computeConnectorPathFromAnchors}
        getAnchorPoint={getAnchorPoint}
        active={connectorsFollowDuringDrag}
      />

      {elements.map((el) => {
        if (el?.type === 'connector') return null;
        if (el?.type === 'drawing') {
          const data = el.drawing?.data || el.Drawing?.data || {};
          const pts = Array.isArray(data?.points) ? data.points : [];
          const strokeColor = String(data?.color || '#0f172a');
          const strokeW = Number(data?.width ?? 4);
          const path = pointsToSvgPath(pts);
          const drag = interactionRef.current;
          const dragPos = drag?.kind === 'drag' && sameId(drag.elementId, el.id) ? drag.latest : null;
          const ro = elementResizeOffset[el.id];
          const dx = Number(ro?.x ?? dragPos?.x ?? (el.x ?? 0));
          const dy = Number(ro?.y ?? dragPos?.y ?? (el.y ?? 0));
          const dw = ro?.width ?? el.width ?? 10;
          const dh = ro?.height ?? el.height ?? 10;
          const isSelected = selectedElementIds.has(idKey(el.id));
          return (
            <div
              key={el.id}
              data-element-id={el.id}
              className={`${s.element} ${s.drawingElement}`}
              ref={(node) => registerElementNode(el.id, node)}
              style={{
                left: 0,
                top: 0,
                width: dw,
                height: dh,
                zIndex: el.zIndex ?? 0,
                transform: `translate3d(${dx}px, ${dy}px, 0) rotate(${el.rotation ?? 0}deg)`,
              }}
              onPointerDown={(ev) => onElementPointerDown(el.id, ev)}
              onClick={(ev) => {
                if (activeTool === 'hand' || activeTool === 'pen' || activeTool === 'eraser' || activeTool === 'connector')
                  return;
                ev.stopPropagation();
                setSelectedElementIds(new Set([idKey(el.id)]));
                setEditingElementId(null);
                setSelectedMaterialBlockId(null);
              }}
            >
              <svg
                className={s.drawingSvg}
                width={dw}
                height={dh}
                viewBox={`0 0 ${dw} ${dh}`}
                aria-hidden="true"
              >
                <path
                  d={path}
                  fill="none"
                  stroke={strokeColor}
                  strokeWidth={strokeW}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>

              {isSelected ? (
                <div className={s.transformBox}>
                  <div className={s.elementActions} />
                  <div
                    className={`${s.resizeHandle} ${s.hNW}`}
                    onPointerDown={(ev) => startResize(el.id, 'nw', ev)}
                  />
                  <div className={`${s.resizeHandle} ${s.hN}`} onPointerDown={(ev) => startResize(el.id, 'n', ev)} />
                  <div
                    className={`${s.resizeHandle} ${s.hNE}`}
                    onPointerDown={(ev) => startResize(el.id, 'ne', ev)}
                  />
                  <div className={`${s.resizeHandle} ${s.hE}`} onPointerDown={(ev) => startResize(el.id, 'e', ev)} />
                  <div
                    className={`${s.resizeHandle} ${s.hSE}`}
                    onPointerDown={(ev) => startResize(el.id, 'se', ev)}
                  />
                  <div className={`${s.resizeHandle} ${s.hS}`} onPointerDown={(ev) => startResize(el.id, 's', ev)} />
                  <div
                    className={`${s.resizeHandle} ${s.hSW}`}
                    onPointerDown={(ev) => startResize(el.id, 'sw', ev)}
                  />
                  <div className={`${s.resizeHandle} ${s.hW}`} onPointerDown={(ev) => startResize(el.id, 'w', ev)} />
                </div>
              ) : null}
            </div>
          );
        }

        if (el?.type === 'frame') {
          const isEditing = editingElementId === el.id;
          const isSelected = selectedElementIds.has(idKey(el.id));
          const drag = interactionRef.current;
          const dragPos = drag?.kind === 'drag' && sameId(drag.elementId, el.id) ? drag.latest : null;
          return (
            <FrameElement
              key={el.id}
              el={el}
              isSelected={isSelected}
              isEditing={isEditing}
              dragPos={dragPos}
              resizeOffset={elementResizeOffset[el.id]}
              activeTool={activeTool}
              connectorHoverElementId={connectorHoverElementId}
              connectorFromElementId={connectorDraft?.from?.elementId ?? null}
              connectorToHoverElementId={connectorDraft?.toHover?.elementId ?? null}
              registerNode={registerElementNode}
              onPointerDown={onElementPointerDown}
              onElementClick={onElementClick}
              startResize={startResize}
              beginEditing={beginEditing}
              endEditing={endEditing}
              updateLocalElement={updateLocalElement}
              persistElement={persistElement}
              startConnectorDrag={startConnectorDrag}
              styles={s}
            />
          );
        }

        if (el?.type === 'note' || el?.type === 'text') {
          const isEditing = editingElementId === el.id;
          const isSelected = selectedElementIds.has(idKey(el.id));
          const drag = interactionRef.current;
          const dragPos = drag?.kind === 'drag' && sameId(drag.elementId, el.id) ? drag.latest : null;
          return (
            <NoteTextElement
              key={el.id}
              el={el}
              isMobile={isMobile}
              isSelected={isSelected}
              isEditing={isEditing}
              dragX={dragPos?.x ?? null}
              dragY={dragPos?.y ?? null}
              resizeOffset={elementResizeOffset[el.id]}
              commentsEnabled={commentsEnabled}
              deletingElementId={deletingElementId}
              searchQuery={searchQuery}
              isSearchHit={hasSearchQuery && manualSearchHitIds.has(el.id)}
              activeTool={activeTool}
              connectorHoverElementId={connectorHoverElementId}
              connectorFromElementId={connectorDraft?.from?.elementId ?? null}
              connectorToHoverElementId={connectorDraft?.toHover?.elementId ?? null}
              registerNode={registerElementNode}
              actions={noteTextActions}
            />
          );
        }

        const isEditing = editingElementId === el.id;
        const isSelected = selectedElementIds.has(idKey(el.id));
        const isDocument = el.type === 'document';
        const isLink = el.type === 'link';
        const showConnectorEndpoints =
          isSelected ||
          (activeTool === 'connector' && connectorHoverElementId === el.id) ||
          connectorDraft?.from?.elementId === el.id ||
          connectorDraft?.toHover?.elementId === el.id;
        const innerClass =
          isDocument || isLink
            ? `${s.elementInner} ${s.documentInner} ${isLink ? s.linkInner : ''}`
            : el.type === 'note'
              ? `${s.elementInner} ${s.noteInner}`
              : `${s.elementInner} ${s.textInner}`;
        const displayTextClass = el.type === 'note' ? `${s.displayText} ${s.notePad}` : s.displayText;
        const editorClass = el.type === 'note' ? `${s.editor} ${s.noteEditorPad}` : s.editor;
        const noteTextStyle =
          el.type === 'note' || el.type === 'text'
            ? (() => {
                const t = el.type === 'note' ? (el.note ?? el.Note) : (el.text ?? el.Text);
                return {
                  fontWeight: t?.bold ? 'bold' : undefined,
                  fontStyle: t?.italic ? 'italic' : undefined,
                  textDecoration: t?.underline ? 'underline' : undefined,
                };
              })()
            : undefined;

        const doc = isDocument ? el.document ?? el.Document : null;
        const docTitle = fixMojibakeNameClient(doc?.title || 'Document');
        const docUrl = doc?.url;
        const docExt = getExt(docTitle) || getExt(docUrl);
        const DocIcon = pickDocIcon(docExt);
        const isPhotoDoc = Boolean(docUrl) && isPhotoExt(docExt);

        const link = isLink ? el.link ?? el.Link : null;
        const linkUrl = link?.url || '';
        const linkTitle = fixMojibakeNameClient(link?.title || safeHostname(linkUrl) || linkUrl || 'Link');
        const linkPreview = link?.previewImageUrl || '';
        const linkHost = safeHostname(linkUrl);

        const reactionBubbles = layoutReactionBubbles(el.id, el.reactions);
        const drag = interactionRef.current;
        const dragPos = drag?.kind === 'drag' && sameId(drag.elementId, el.id) ? drag.latest : null;
        const ro = elementResizeOffset[el.id];
        const ex = Number(ro?.x ?? dragPos?.x ?? (el.x ?? 0));
        const ey = Number(ro?.y ?? dragPos?.y ?? (el.y ?? 0));
        const ew = ro?.width ?? el.width ?? 240;
        const eh = ro?.height ?? el.height ?? 160;

        return (
          <div
            key={el.id}
            data-element-id={el.id}
            className={s.element}
            ref={(node) => registerElementNode(el.id, node)}
            style={{
              left: 0,
              top: 0,
              width: ew,
              height: eh,
              zIndex: el.zIndex ?? 0,
              transform: `translate3d(${ex}px, ${ey}px, 0) rotate(${el.rotation ?? 0}deg)`,
            }}
            onPointerDown={(ev) => onElementPointerDown(el.id, ev)}
            onClick={(ev) => onElementClick(el.id, ev)}
            onContextMenu={(ev) => {
              if (isMobile) return;
              if (activeTool === 'pen' || activeTool === 'eraser') return;
              ev.preventDefault();
              ev.stopPropagation();
              openReactionPicker(el.id, ev.clientX, ev.clientY);
            }}
            onDoubleClick={() => {
              if (activeTool === 'pen' || activeTool === 'eraser') return;
              if (isDocument && docUrl) {
                openPhotoPreview?.(docUrl, docTitle);
                return;
              }
              beginEditing(el.id);
            }}
            onPointerUp={(ev) => handleDocCardPointerUp(ev, el)}
          >
            {commentsEnabled ? (
              <button
                type="button"
                className={s.commentBtn}
                onPointerDown={(ev) => ev.stopPropagation()}
                onClick={(ev) => {
                  ev.stopPropagation();
                  openComments(el.id);
                }}
                aria-label="Comments"
                title="Комментарии"
              >
                <MessageCircle size={16} />
              </button>
            ) : null}
            <div
              className={`${innerClass} ${
                searchQuery.trim() && manualSearchHitIds.has(el.id) ? s.elementSearchHit : ''
              }`}
            >
              {isDocument ? (
                isPhotoDoc ? (
                  <div className={s.photoCard} aria-label={docTitle}>
                    <img className={s.photoImg} src={docUrl} alt={docTitle} draggable={false} />
                  </div>
                ) : (
                  <div className={s.docCard}>
                    <div className={s.docHeader}>
                      <div className={s.docIcon}>
                        <DocIcon size={18} />
                      </div>
                      <div className={s.docInfo}>
                        <div className={s.docTitleRow}>
                          <button
                            type="button"
                            className={s.docTitleBtn}
                            onPointerDown={(ev) => ev.stopPropagation()}
                            onClick={(ev) => {
                              ev.stopPropagation();
                              openDocument(docUrl);
                            }}
                            disabled={!docUrl}
                            title={docUrl ? 'Open' : 'No file'}
                          >
                            {renderHighlightedText(docTitle, searchQuery, s.searchMark)}
                          </button>
                          <div className={s.docActions}>
                            <button
                              type="button"
                              className={s.docActionBtn}
                              onPointerDown={(ev) => ev.stopPropagation()}
                              onClick={(ev) => {
                                ev.stopPropagation();
                                openDocument(docUrl);
                              }}
                              disabled={!docUrl}
                              aria-label="Open file"
                              title="Open"
                            >
                              <ExternalLink size={16} />
                            </button>
                            <button
                              type="button"
                              className={s.docActionBtn}
                              onPointerDown={(ev) => ev.stopPropagation()}
                              onClick={(ev) => {
                                ev.stopPropagation();
                                downloadDocument(docUrl, docTitle);
                              }}
                              disabled={!docUrl}
                              aria-label="Download file"
                              title="Download"
                            >
                              <Download size={16} />
                            </button>
                          </div>
                        </div>
                        <div className={s.docMeta}>{docExt ? docExt.toUpperCase() : 'FILE'}</div>
                      </div>
                    </div>
                    <div className={s.docPreview}>
                      {docUrl && ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'svg'].includes(docExt) ? (
                        <img
                          className={s.docThumb}
                          src={docUrl}
                          alt={docTitle}
                          draggable={false}
                          onPointerDown={(ev) => ev.stopPropagation()}
                        />
                      ) : docUrl && docExt === 'pdf' ? (
                        <object
                          className={s.docPdf}
                          data={docUrl}
                          type="application/pdf"
                          aria-label={docTitle}
                        >
                          <div className={s.docPreviewFallback}>Preview not available</div>
                        </object>
                      ) : docUrl && TEXT_PREVIEW_EXTS.has(docExt) ? (
                        <div className={s.docTextPreview} aria-label="Text preview">
                          <pre className={s.docTextPre}>
                            {docTextPreview[docUrl] != null
                              ? docTextPreview[docUrl] || 'Preview not available'
                              : 'Loading preview...'}
                          </pre>
                        </div>
                      ) : (
                        <div className={s.docPreviewFallback}>
                          <div className={s.docFallbackIcon}>
                            <DocIcon size={34} />
                          </div>
                          <div className={s.docFallbackExt}>{docExt ? docExt.toUpperCase() : 'FILE'}</div>
                        </div>
                      )}
                    </div>
                  </div>
                )
              ) : isLink ? (
                <div className={s.linkCard}>
                  <div className={s.linkHeader}>
                    <div className={s.linkIcon}>
                      <Link2 size={18} />
                    </div>
                    <div className={s.linkInfo}>
                      {isEditing ? (
                        <div className={s.linkEdit}>
                          <input
                            className={s.linkEditTitle}
                            value={link?.title ?? ''}
                            placeholder="Title (optional)"
                            onPointerDown={(ev) => ev.stopPropagation()}
                            onChange={(ev) => {
                              const next = { ...(link || {}), title: ev.target.value };
                              updateLocalElement(el.id, { link: next, Link: next });
                            }}
                          />
                          <input
                            className={s.linkEditUrl}
                            value={linkUrl}
                            placeholder="https://example.com"
                            onPointerDown={(ev) => ev.stopPropagation()}
                            onChange={(ev) => {
                              const next = { ...(link || {}), url: ev.target.value };
                              updateLocalElement(el.id, { link: next, Link: next });
                            }}
                            onKeyDown={(ev) => {
                              if (ev.key === 'Escape') {
                                ev.preventDefault();
                                setEditingElementId(null);
                                return;
                              }
                              if (ev.key === 'Enter' && !ev.shiftKey) {
                                ev.preventDefault();
                                const nextUrl = normalizeUrlClient(ev.currentTarget.value);
                                const nextLink = { ...(link || {}), url: nextUrl };
                                updateLocalElement(el.id, { link: nextLink, Link: nextLink });
                                setEditingElementId(null);
                                (async () => {
                                  try {
                                    let preview = null;
                                    try {
                                      preview = await getLinkPreview(nextUrl);
                                    } catch {
                                      preview = null;
                                    }
                                    const hydrated =
                                      preview && (preview.title || preview.previewImageUrl || preview.url)
                                        ? {
                                            ...nextLink,
                                            url: preview.url || nextUrl,
                                            title: nextLink.title || preview.title,
                                            previewImageUrl: preview.previewImageUrl || nextLink.previewImageUrl,
                                          }
                                        : nextLink;
                                    updateLocalElement(el.id, { link: hydrated, Link: hydrated });
                                    const before = editStartSnapRef.current.get(el.id) || null;
                                    editStartSnapRef.current.delete(el.id);
                                    await persistElement(
                                      { ...el, link: hydrated, Link: hydrated },
                                      { historyBefore: before }
                                    );
                                  } catch {
                                    // ignore
                                  }
                                })();
                              }
                            }}
                          />
                        </div>
                      ) : (
                        <div className={s.linkTitleRow}>
                          <button
                            type="button"
                            className={s.linkTitleBtn}
                            onPointerDown={(ev) => ev.stopPropagation()}
                            onClick={(ev) => {
                              ev.stopPropagation();
                              openExternalUrl(linkUrl);
                            }}
                            disabled={!linkUrl}
                            title={linkUrl || 'No url'}
                          >
                            {renderHighlightedText(linkTitle, searchQuery, s.searchMark)}
                          </button>
                          <div className={s.docActions}>
                            <button
                              type="button"
                              className={s.docActionBtn}
                              onPointerDown={(ev) => ev.stopPropagation()}
                              onClick={(ev) => {
                                ev.stopPropagation();
                                openExternalUrl(linkUrl);
                              }}
                              disabled={!linkUrl}
                              aria-label="Open link"
                              title="Open"
                            >
                              <ExternalLink size={16} />
                            </button>
                          </div>
                        </div>
                      )}
                      <div className={s.linkMeta}>
                        {renderHighlightedText(linkHost || 'LINK', searchQuery, s.searchMark)}
                      </div>
                    </div>
                  </div>

                  <div className={s.linkPreview}>
                    {linkPreview ? (
                      <img
                        className={s.linkThumb}
                        src={linkPreview}
                        alt={linkTitle}
                        draggable={false}
                        onPointerDown={(ev) => ev.stopPropagation()}
                      />
                    ) : (
                      <div className={s.linkPreviewFallback}>
                        <div className={s.linkFallbackIcon}>
                          <Link2 size={34} />
                        </div>
                        <div className={s.linkFallbackHost}>{linkHost || 'PREVIEW'}</div>
                      </div>
                    )}
                  </div>
                </div>
              ) : isEditing ? (
                <textarea
                  className={editorClass}
                  value={el.content ?? ''}
                  autoFocus
                  onPointerDown={(ev) => ev.stopPropagation()}
                  onChange={(ev) => {
                    const next = ev.target.value;
                    updateLocalElement(el.id, { content: next });
                    if (el.type === 'note') queueNoteEdit(el.id, next);
                  }}
                  onKeyDown={async (ev) => {
                    if (ev.key === 'Escape') {
                      ev.preventDefault();
                      ev.stopPropagation();
                      await endEditing();
                      return;
                    }
                    if (ev.key === 'Enter' && !ev.shiftKey) {
                      ev.preventDefault();
                      await endEditing();
                    }
                  }}
                  onBlur={(ev) => {
                    const next = ev.relatedTarget;
                    if (next && next.closest?.(`[data-element-id="${el.id}"]`)) return;
                    if (editingElementId === el.id) endEditing();
                  }}
                />
              ) : (
                <div className={displayTextClass} style={noteTextStyle}>
                  {renderHighlightedText(el.content ?? '', searchQuery, s.searchMark)}
                </div>
              )}
            </div>

            {showConnectorEndpoints ? (
              <div className={s.connectorEndpointsBox} aria-hidden="true">
                <div
                  className={`${s.connectorEndpoint} ${s.epTop}`}
                  onPointerDown={(ev) => startConnectorDrag(el.id, 'top', ev)}
                />
                <div
                  className={`${s.connectorEndpoint} ${s.epRight}`}
                  onPointerDown={(ev) => startConnectorDrag(el.id, 'right', ev)}
                />
                <div
                  className={`${s.connectorEndpoint} ${s.epBottom}`}
                  onPointerDown={(ev) => startConnectorDrag(el.id, 'bottom', ev)}
                />
                <div
                  className={`${s.connectorEndpoint} ${s.epLeft}`}
                  onPointerDown={(ev) => startConnectorDrag(el.id, 'left', ev)}
                />
              </div>
            ) : null}

            {reactionBubbles.length ? (
              <div className={s.reactionsLayer} aria-label="Reactions">
                {reactionBubbles.map((b) => (
                  <button
                    key={b.emoji}
                    type="button"
                    className={`${s.reactionBubble} ${b.count === 1 ? s.reactionSolo : ''}`}
                    data-side={b.side}
                    style={{
                      left: `${b.xPct}%`,
                      top: `${b.yPct}%`,
                    }}
                    onPointerDown={(ev) => ev.stopPropagation()}
                    onClick={(ev) => {
                      ev.stopPropagation();
                      toggleReaction(el.id, b.emoji);
                    }}
                    title={b.count > 1 ? `${b.emoji} · ${b.count}` : b.emoji}
                    aria-label={b.count > 1 ? `${b.emoji} ${b.count}` : b.emoji}
                  >
                    <span className={s.reactionEmoji}>{b.emoji}</span>
                    {b.count > 1 ? <span className={s.reactionCount}>{b.count}</span> : null}
                  </button>
                ))}
              </div>
            ) : null}

            {isSelected ? (
              <div className={s.transformBox}>
                <div className={s.elementActions} />
                <div
                  className={`${s.resizeHandle} ${s.hNW}`}
                  onPointerDown={(ev) => startResize(el.id, 'nw', ev)}
                />
                <div className={`${s.resizeHandle} ${s.hN}`} onPointerDown={(ev) => startResize(el.id, 'n', ev)} />
                <div
                  className={`${s.resizeHandle} ${s.hNE}`}
                  onPointerDown={(ev) => startResize(el.id, 'ne', ev)}
                />
                <div className={`${s.resizeHandle} ${s.hE}`} onPointerDown={(ev) => startResize(el.id, 'e', ev)} />
                <div
                  className={`${s.resizeHandle} ${s.hSE}`}
                  onPointerDown={(ev) => startResize(el.id, 'se', ev)}
                />
                <div className={`${s.resizeHandle} ${s.hS}`} onPointerDown={(ev) => startResize(el.id, 's', ev)} />
                <div
                  className={`${s.resizeHandle} ${s.hSW}`}
                  onPointerDown={(ev) => startResize(el.id, 'sw', ev)}
                />
                <div className={`${s.resizeHandle} ${s.hW}`} onPointerDown={(ev) => startResize(el.id, 'w', ev)} />
              </div>
            ) : null}
          </div>
        );
      })}

      {materialBlocks.map((block) => (
        <MaterialBlock
          key={block.id}
          block={block}
          isSelected={selectedMaterialBlockId === block.id}
          dragOffset={materialBlockDragOffset[block.id]}
          showConnectorEndpoints={
            selectedMaterialBlockId === block.id ||
            activeTool === 'connector' ||
            connectorDraft?.from?.blockId === block.id ||
            connectorDraft?.toHover?.blockId === block.id
          }
          onPointerDown={startBlockDrag}
          onOpen={(b) => setMaterialBlockModal(b)}
          onResizeStart={startBlockResize}
          onSelect={onSelectMaterialBlock ?? ((b) => setSelectedMaterialBlockId(b?.id ?? null))}
          onRegisterNode={registerMaterialBlockNode}
          onUpdateTitle={handleMaterialBlockTitleUpdate}
          onDelete={handleDeleteMaterialBlock}
          onConnectorEndpointPointerDown={
            activeTool === 'connector' || selectedMaterialBlockId === block.id
              ? (blockId, side, e) => startConnectorDragFromBlock(blockId, side, e)
              : undefined
          }
        />
      ))}
    </>
  );
}
