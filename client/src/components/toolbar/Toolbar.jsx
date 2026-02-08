import React from 'react';
import { Loader2 } from 'lucide-react';
import { TOOLS, BRUSH_COLORS } from '../../constants/workspace';

export default function Toolbar({
  activeTool,
  setActiveTool,
  brushColor,
  brushWidth,
  setBrushColor,
  setBrushWidth,
  linkInputRef,
  linkDraftUrl,
  setLinkDraftUrl,
  creatingLink,
  submitLink,
  openAttachDialog,
  uploading,
  setActionError,
  styles,
}) {
  return (
    <div className={styles?.toolsPanel}>
      {TOOLS.map(({ id: toolId, label, Icon }) => {
        const isActive = toolId !== 'attach' && activeTool === toolId;
        const btn = (
          <button
            key={toolId}
            type="button"
            className={`${styles?.tool ?? ''} ${isActive ? styles?.toolActive ?? '' : ''}`}
            aria-label={label}
            aria-pressed={isActive}
            onClick={() => {
              if (toolId === 'attach') {
                openAttachDialog();
                return;
              }
              setActionError?.(null);
              setActiveTool(toolId);
            }}
          >
            {toolId === 'attach' && uploading ? (
              <Loader2 size={18} className={styles?.spinner} />
            ) : (
              <Icon size={18} />
            )}
          </button>
        );

        if (toolId !== 'link' && toolId !== 'pen') return btn;

        return (
          <div key={toolId} className={styles?.toolWrap}>
            {btn}
            {activeTool === 'link' && toolId === 'link' ? (
              <div className={styles?.toolPopover} onPointerDown={(ev) => ev.stopPropagation()}>
                <div className={styles?.toolPopoverRow}>
                  <input
                    ref={linkInputRef}
                    className={styles?.linkInput}
                    placeholder="Paste URL and press Enter"
                    value={linkDraftUrl}
                    disabled={creatingLink}
                    onChange={(ev) => setLinkDraftUrl(ev.target.value)}
                    onKeyDown={(ev) => {
                      if (ev.key === 'Escape') {
                        ev.preventDefault();
                        setLinkDraftUrl('');
                        setActiveTool('select');
                        return;
                      }
                      if (ev.key === 'Enter' && !ev.shiftKey) {
                        ev.preventDefault();
                        submitLink();
                      }
                    }}
                  />
                  {creatingLink ? <Loader2 size={16} className={styles?.spinner} /> : null}
                </div>
                <div className={styles?.toolPopoverHint}>Enter — add to board · Esc — close</div>
              </div>
            ) : null}

            {activeTool === 'pen' && toolId === 'pen' ? (
              <div className={styles?.toolPopover} onPointerDown={(ev) => ev.stopPropagation()}>
                <div className={styles?.toolPopoverRow}>
                  <div className={styles?.swatches} aria-label="Brush color">
                    {BRUSH_COLORS.map((c) => (
                      <button
                        key={c}
                        type="button"
                        className={`${styles?.swatch ?? ''} ${brushColor === c ? styles?.swatchActive ?? '' : ''}`}
                        style={{ background: c }}
                        onClick={() => setBrushColor(c)}
                        aria-label={`Color ${c}`}
                        aria-pressed={brushColor === c}
                      />
                    ))}
                  </div>
                </div>
                <div className={styles?.toolPopoverRow}>
                  <div className={styles?.widthRow}>
                    <input
                      className={styles?.widthSlider}
                      type="range"
                      min={1}
                      max={24}
                      value={brushWidth}
                      onChange={(ev) => setBrushWidth(Number(ev.target.value))}
                      aria-label="Brush width"
                    />
                    <div className={styles?.widthLabel}>{brushWidth}px</div>
                  </div>
                </div>
                <div className={styles?.toolPopoverHint}>Drag — draw · Esc — switch tool</div>
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
