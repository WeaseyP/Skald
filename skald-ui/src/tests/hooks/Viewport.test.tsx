// @vitest-environment jsdom
//
// Roadmap E13. Skald had no responsive mechanism at all: not one `@media`
// query, `touch-action` rule or pointer-type branch existed in the renderer,
// because every style is an inline `React.CSSProperties` object and inline
// styles cannot express either. This hook is the one place that decides
// "narrow" and "coarse pointer"; every component asks it, and the stylesheet
// keys off the `data-viewport` / `data-pointer` attributes it produces rather
// than restating the same breakpoints in CSS (SKB-002's disagreeing-readers
// class, applied to layout).
//
// jsdom does not implement `window.matchMedia`, and neither does a server
// render. A hook that assumed it exists would throw on import in half this
// suite, so "no matchMedia" has to mean "desktop", not "crash".
import { describe, it, expect, afterEach, vi } from 'vitest';
import { act, renderHook, cleanup } from '@testing-library/react';
import {
    useViewport,
    useMediaQuery,
    NARROW_QUERY,
    COARSE_POINTER_QUERY,
    NARROW_MAX_WIDTH,
    __resetMediaQueryCache,
} from '../../hooks/useViewport';

type Listener = (e: MediaQueryListEvent) => void;

/**
 * A matchMedia stand-in that can actually change its answer, which is the
 * whole point: a hook that only reads `matches` once is indistinguishable
 * from a hardcoded boolean until the user rotates the phone.
 */
const installMatchMedia = (initial: Record<string, boolean>) => {
    const state = { ...initial };
    const listeners = new Map<string, Set<Listener>>();
    const lists = new Map<string, MediaQueryList>();

    const listFor = (query: string): MediaQueryList => {
        const existing = lists.get(query);
        if (existing) return existing;
        const set = new Set<Listener>();
        listeners.set(query, set);
        const list = {
            get matches() { return state[query] ?? false; },
            media: query,
            onchange: null,
            addEventListener: (_: string, fn: Listener) => { set.add(fn); },
            removeEventListener: (_: string, fn: Listener) => { set.delete(fn); },
            addListener: (fn: Listener) => { set.add(fn); },
            removeListener: (fn: Listener) => { set.delete(fn); },
            dispatchEvent: () => true,
        } as unknown as MediaQueryList;
        lists.set(query, list);
        return list;
    };

    (window as unknown as { matchMedia: (q: string) => MediaQueryList }).matchMedia = listFor;

    return {
        set(query: string, matches: boolean) {
            state[query] = matches;
            for (const fn of listeners.get(query) ?? []) {
                fn({ matches } as MediaQueryListEvent);
            }
        },
        listenerCount(query: string) {
            return listeners.get(query)?.size ?? 0;
        },
    };
};

afterEach(() => {
    cleanup();
    __resetMediaQueryCache();
    delete (window as unknown as { matchMedia?: unknown }).matchMedia;
    vi.restoreAllMocks();
});

describe('useViewport', () => {
    it('reads desktop when the environment has no matchMedia (jsdom, SSR)', () => {
        expect((window as unknown as { matchMedia?: unknown }).matchMedia).toBeUndefined();
        const { result } = renderHook(() => useViewport());
        expect(result.current.isNarrow).toBe(false);
        expect(result.current.isCoarsePointer).toBe(false);
    });

    it('reports the media state it is given at mount', () => {
        installMatchMedia({ [NARROW_QUERY]: true, [COARSE_POINTER_QUERY]: true });
        const { result } = renderHook(() => useViewport());
        expect(result.current.isNarrow).toBe(true);
        expect(result.current.isCoarsePointer).toBe(true);
    });

    it('re-renders when the query changes under it (rotation, window resize)', () => {
        const media = installMatchMedia({ [NARROW_QUERY]: false, [COARSE_POINTER_QUERY]: false });
        const { result } = renderHook(() => useViewport());
        expect(result.current.isNarrow).toBe(false);

        act(() => media.set(NARROW_QUERY, true));
        expect(result.current.isNarrow).toBe(true);
        expect(result.current.isCoarsePointer).toBe(false);

        act(() => media.set(COARSE_POINTER_QUERY, true));
        expect(result.current.isCoarsePointer).toBe(true);
    });

    it('unsubscribes on unmount so a torn-down editor cannot be re-rendered', () => {
        const media = installMatchMedia({ [NARROW_QUERY]: false });
        const { unmount } = renderHook(() => useMediaQuery(NARROW_QUERY));
        expect(media.listenerCount(NARROW_QUERY)).toBe(1);
        unmount();
        expect(media.listenerCount(NARROW_QUERY)).toBe(0);
    });

    it('falls back to addListener on a MediaQueryList without addEventListener (older Safari)', () => {
        const listeners = new Set<Listener>();
        let matches = false;
        const legacy = {
            get matches() { return matches; },
            media: NARROW_QUERY,
            addListener: (fn: Listener) => { listeners.add(fn); },
            removeListener: (fn: Listener) => { listeners.delete(fn); },
        } as unknown as MediaQueryList;
        (window as unknown as { matchMedia: (q: string) => MediaQueryList }).matchMedia = () => legacy;

        const { result } = renderHook(() => useMediaQuery(NARROW_QUERY));
        expect(result.current).toBe(false);
        act(() => {
            matches = true;
            for (const fn of listeners) fn({ matches: true } as MediaQueryListEvent);
        });
        expect(result.current).toBe(true);
    });

    it('states the breakpoint once, in the query it hands to matchMedia', () => {
        // The number lives here and nowhere else — a stylesheet that repeated
        // it would be free to disagree with the hook the layout branches on.
        expect(NARROW_QUERY).toBe(`(max-width: ${NARROW_MAX_WIDTH}px)`);
        expect(NARROW_MAX_WIDTH).toBe(720);
        expect(COARSE_POINTER_QUERY).toBe('(pointer: coarse)');
    });
});
