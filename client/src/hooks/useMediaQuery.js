import { useEffect, useMemo, useState } from 'react';

/**
 * Subscribe to a CSS media query.
 * Example: useMediaQuery('(max-width: 640px)')
 */
export function useMediaQuery(query) {
  const q = String(query || '').trim();
  const mql = useMemo(() => {
    if (!q) return null;
    if (typeof window === 'undefined' || !window.matchMedia) return null;
    return window.matchMedia(q);
  }, [q]);

  const [matches, setMatches] = useState(() => (mql ? mql.matches : false));

  useEffect(() => {
    if (!mql) return;

    const onChange = (e) => setMatches(Boolean(e.matches));
    setMatches(Boolean(mql.matches));

    // Safari < 14 uses addListener/removeListener.
    if (mql.addEventListener) {
      mql.addEventListener('change', onChange);
      return () => mql.removeEventListener('change', onChange);
    }
    mql.addListener(onChange);
    return () => mql.removeListener(onChange);
  }, [mql]);

  return matches;
}


