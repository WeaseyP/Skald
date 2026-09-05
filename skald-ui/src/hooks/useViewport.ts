/*
================================================================================
| FILE: skald-ui/src/hooks/useViewport.ts                                      |
|                                                                              |
| The one place that decides "this is a narrow screen" and "this is a finger,  |
| not a mouse" (roadmap E13).                                                  |
|                                                                              |
| Skald began as an Electron window and every style in the renderer is an      |
| inline `React.CSSProperties` object. Inline styles cannot express a media    |
| query, so before this hook there was no `@media`, no `touch-action` and no   |
| pointer-type branch anywhere in skald-ui/src — the layout was simply the     |
| desktop one, at any size. The web build (docs/PRIVATE_WEB_APP_SETUP.md)      |
| serves the same renderer to a phone.                                         |
|                                                                              |
| The rule that keeps this from becoming SKB-002 again — two readers of the    |
| same fact, free to disagree — is: THE HOOK DECIDES, CSS REACTS. Components   |
| branch on these booleans; `src/styles/responsive.css` never restates a       |
| breakpoint, it selects on the `data-viewport` / `data-pointer` attributes    |
| the components stamp from these booleans. The only exception is documented   |
| in that file, and it is not a breakpoint.                                    |
================================================================================
*/
import { useCallback, useSyncExternalStore } from 'react';

/**
 * Below this width the editor lays out for one column: the sidebar becomes a
 * drawer and the parameter panel becomes a sheet. 720px sits above every
 * phone in portrait (a Pixel 9 Pro is 448 CSS px wide) and below a tablet in
 * landscape, which has room for the desktop layout.
 */
export const NARROW_MAX_WIDTH = 720;

export const NARROW_QUERY = `(max-width: ${NARROW_MAX_WIDTH}px)`;

/**
 * `(pointer: coarse)` is the primary-input question, not the touchscreen
 * question: a laptop with a touchscreen still reports `fine`, and enlarging
 * its hit areas would be a desktop regression. It is deliberately independent
 * of width — a 10" tablet is coarse and wide at once.
 */
export const COARSE_POINTER_QUERY = '(pointer: coarse)';

// One MediaQueryList per query. `useSyncExternalStore` calls getSnapshot on
// every render, and a fresh matchMedia() call per render would both cost more
// than it should and hand a different object to subscribe than to read.
const lists = new Map<string, MediaQueryList | null>();

const listFor = (query: string): MediaQueryList | null => {
    if (lists.has(query)) return lists.get(query) ?? null;
    // jsdom (this suite) and any server render have no matchMedia at all.
    // "Absent" must mean "desktop", not "throw on import".
    const list = typeof window !== 'undefined' && typeof window.matchMedia === 'function'
        ? window.matchMedia(query)
        : null;
    lists.set(query, list);
    return list;
};

/** Test seam: the cache outlives a test's fake `window.matchMedia` otherwise. */
export const __resetMediaQueryCache = (): void => { lists.clear(); };

/**
 * `true` while `query` matches, re-rendering when that changes — a rotation
 * or a resized browser window has to move the layout, or the hook is a
 * hardcoded boolean with extra steps.
 */
export const useMediaQuery = (query: string): boolean => {
    const subscribe = useCallback((onChange: () => void) => {
        const list = listFor(query);
        if (!list) return () => undefined;
        // Safari only gained addEventListener on MediaQueryList in 14; the
        // deprecated addListener is still the only path on older iOS, which
        // is exactly the device class this hook exists for.
        if (typeof list.addEventListener === 'function') {
            list.addEventListener('change', onChange);
            return () => list.removeEventListener('change', onChange);
        }
        list.addListener(onChange);
        return () => list.removeListener(onChange);
    }, [query]);

    const getSnapshot = useCallback(() => listFor(query)?.matches ?? false, [query]);

    return useSyncExternalStore(subscribe, getSnapshot, () => false);
};

export interface Viewport {
    /** The window is too narrow for the sidebar / canvas / panel three-column layout. */
    isNarrow: boolean;
    /** The primary pointing device is a finger or stylus, so hit areas must grow. */
    isCoarsePointer: boolean;
}

export const useViewport = (): Viewport => ({
    isNarrow: useMediaQuery(NARROW_QUERY),
    isCoarsePointer: useMediaQuery(COARSE_POINTER_QUERY),
});
