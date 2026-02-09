import { useRef, useCallback } from 'react';

const DOUBLE_TAP_MS = 400;
const DOUBLE_TAP_PX = 25;

/**
 * Returns handlers to detect double-tap (mobile) or double-click (desktop).
 * Call the returned onPointerUp from the element that should open edit on double-tap/dblclick.
 * Also pass onDoubleClick for desktop; callback is invoked on either.
 */
export function useDoubleTap(callback) {
  const lastTapRef = useRef(null);

  const onPointerUp = useCallback(
    (e) => {
      if (e.pointerType === 'mouse') return; // desktop: use onDoubleClick
      const now = Date.now();
      const x = e.clientX;
      const y = e.clientY;
      const prev = lastTapRef.current;
      if (prev && now - prev.time < DOUBLE_TAP_MS && Math.hypot(x - prev.x, y - prev.y) < DOUBLE_TAP_PX) {
        lastTapRef.current = null;
        e.preventDefault();
        e.stopPropagation();
        callback();
        return;
      }
      lastTapRef.current = { time: now, x, y };
    },
    [callback]
  );

  return { onPointerUp };
}
