import { useCallback, useLayoutEffect, useRef } from 'react';

// Stable callback wrapper: keeps function identity stable while always calling the latest implementation.
export function useEvent(handler) {
  const handlerRef = useRef(handler);
  useLayoutEffect(() => {
    handlerRef.current = handler;
  });
  return useCallback((...args) => handlerRef.current?.(...args), []);
}
