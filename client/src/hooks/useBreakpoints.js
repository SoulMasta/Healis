import { useMediaQuery } from './useMediaQuery';

export const BREAKPOINTS = {
  sm: 640,
  md: 768,
  lg: 1024,
};

/**
 * Opinionated breakpoint helpers for routing/layout decisions.
 * Keep UI styling in CSS; use this only when logic must change.
 */
export function useBreakpoints() {
  const isMobile = useMediaQuery(`(max-width: ${BREAKPOINTS.sm}px)`);
  const isTablet = useMediaQuery(
    `(min-width: ${BREAKPOINTS.sm + 1}px) and (max-width: ${BREAKPOINTS.md}px)`
  );
  const isDesktop = useMediaQuery(`(min-width: ${BREAKPOINTS.md + 1}px)`);

  return { isMobile, isTablet, isDesktop };
}


