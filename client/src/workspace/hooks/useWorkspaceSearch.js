import { useEffect, useMemo, useRef, useState } from 'react';
import { buildManualBoardSearchIndex, runManualBoardSearch } from '../../utils/boardSearch';

export function useWorkspaceSearch({ elements = [], isMobile } = {}) {
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const searchBtnRef = useRef(null);
  const searchPopoverRef = useRef(null);
  const searchInputRef = useRef(null);
  const mobileSearchBarRef = useRef(null);

  const hasSearchQuery = Boolean(String(searchQuery || '').trim());
  const manualSearchIndex = useMemo(
    () => (hasSearchQuery ? buildManualBoardSearchIndex(elements) : []),
    [hasSearchQuery, elements]
  );
  const manualSearchHits = useMemo(() => {
    if (!hasSearchQuery) return [];
    return runManualBoardSearch(manualSearchIndex, searchQuery, { limit: 60 });
  }, [hasSearchQuery, manualSearchIndex, searchQuery]);
  const manualSearchHitIds = useMemo(() => {
    const ids = new Set();
    for (const h of manualSearchHits) ids.add(h.elementId);
    return ids;
  }, [manualSearchHits]);
  const manualSearchResults = useMemo(() => {
    const byId = new Map();
    for (const h of manualSearchHits) {
      if (!h?.elementId) continue;
      const cur = byId.get(h.elementId) || { elementId: h.elementId, elementType: h.elementType, hits: [] };
      cur.hits.push(h);
      byId.set(h.elementId, cur);
    }
    return Array.from(byId.values());
  }, [manualSearchHits]);

  useEffect(() => {
    if (!searchOpen) return () => {};
    window.setTimeout(() => searchInputRef.current?.focus?.(), 0);
    const onPointerDown = (ev) => {
      if (isMobile) {
        const bar = mobileSearchBarRef.current;
        const btn = searchBtnRef.current;
        if (bar && bar.contains(ev.target)) return;
        if (btn && btn.contains(ev.target)) return;
        setSearchOpen(false);
        return;
      }
      const pop = searchPopoverRef.current;
      const btn = searchBtnRef.current;
      if (pop && pop.contains(ev.target)) return;
      if (btn && btn.contains(ev.target)) return;
      setSearchOpen(false);
    };
    window.addEventListener('pointerdown', onPointerDown);
    return () => window.removeEventListener('pointerdown', onPointerDown);
  }, [searchOpen, isMobile]);

  return {
    searchOpen,
    setSearchOpen,
    searchQuery,
    setSearchQuery,
    hasSearchQuery,
    manualSearchIndex,
    manualSearchHits,
    manualSearchHitIds,
    manualSearchResults,
    searchBtnRef,
    searchPopoverRef,
    searchInputRef,
    mobileSearchBarRef,
  };
}
