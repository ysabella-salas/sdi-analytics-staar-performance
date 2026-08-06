import * as React from 'react';

/**
 * useReducedMotion — subscribe to the `(prefers-reduced-motion: reduce)` media
 * query and return whether the user has asked the OS to minimize motion.
 *
 * SSR-safe: there is no `window`/`matchMedia` on the server, so the hook defaults
 * to `false` (do not assume reduced) and only reads the real value after mount, in
 * an effect. This avoids hydration mismatches — the server and the first client
 * render agree on `false`, then the client upgrades to the true value if needed.
 *
 * The animated Ribbon uses this to decide whether to mount the WebGL overlay at
 * all. (The core also re-checks reduced motion itself and demotes on a mid-session
 * flip; this hook is the React-side gate so we never even create the canvas when
 * the user prefers reduced motion.)
 */
const QUERY = '(prefers-reduced-motion: reduce)';

export function useReducedMotion(): boolean {
  const [reduced, setReduced] = React.useState<boolean>(false);

  React.useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return;
    }
    const mql = window.matchMedia(QUERY);
    // Sync immediately in case the query already matches at mount time.
    setReduced(mql.matches);

    const onChange = (event: MediaQueryListEvent) => setReduced(event.matches);

    // addEventListener is the modern API; fall back to addListener for older
    // Safari/WebKit that still ships the deprecated MediaQueryList interface.
    if (typeof mql.addEventListener === 'function') {
      mql.addEventListener('change', onChange);
      return () => mql.removeEventListener('change', onChange);
    }
    mql.addListener(onChange);
    return () => mql.removeListener(onChange);
  }, []);

  return reduced;
}

export default useReducedMotion;
