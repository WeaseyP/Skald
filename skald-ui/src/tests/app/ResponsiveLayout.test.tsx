// @vitest-environment jsdom
//
// Roadmap E13. The editor's three columns (200px palette | canvas | 350px
// parameter panel) leave roughly nothing for the canvas on a 448px-wide
// phone, and the web build (docs/PRIVATE_WEB_APP_SETUP.md) serves that exact
// renderer to one. On a narrow viewport the palette becomes a drawer and the
// parameter panel a sheet, both closed on arrival so the canvas gets the
// screen.
//
// The two halves this pins:
//   1. WIDE IS UNCHANGED. Desktop is the shipped product; a responsive pass
//      that relayouts a 1920px window is a regression, not a feature. The
//      wide assertions are the negative control.
//   2. The drawer and the sheet live INSIDE the workspace row, which is a
//      sibling of the sequencer dock — so neither can cover the transport,
//      whatever their z-index. Nothing else in jsdom can state that: there is
//      no layout engine here to ask "does this rectangle overlap Play?", so
//      the containment is asserted structurally instead.
import React from 'react';
import { render, cleanup, screen, fireEvent } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../../app';
import { NARROW_QUERY, COARSE_POINTER_QUERY, __resetMediaQueryCache } from '../../hooks/useViewport';

class ResizeObserverStub {
    observe() { /* noop: jsdom has no layout engine */ }
    unobserve() { /* noop */ }
    disconnect() { /* noop */ }
}

const installMatchMedia = (matching: Record<string, boolean>) => {
    (window as unknown as { matchMedia: (q: string) => MediaQueryList }).matchMedia = (query: string) => ({
        matches: matching[query] ?? false,
        media: query,
        onchange: null,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
        addListener: () => undefined,
        removeListener: () => undefined,
        dispatchEvent: () => true,
    } as unknown as MediaQueryList);
    __resetMediaQueryCache();
};

beforeEach(() => {
    vi.stubGlobal('ResizeObserver', ResizeObserverStub);
});

afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    __resetMediaQueryCache();
    delete (window as unknown as { matchMedia?: unknown }).matchMedia;
});

describe('narrow viewport', () => {
    beforeEach(() => {
        installMatchMedia({ [NARROW_QUERY]: true, [COARSE_POINTER_QUERY]: true });
    });

    it('stamps the viewport and pointer class on the app root for the stylesheet', () => {
        render(<App />);
        const root = screen.getByTestId('app-root');
        expect(root.getAttribute('data-viewport')).toBe('narrow');
        expect(root.getAttribute('data-pointer')).toBe('coarse');
    });

    it('turns the palette into a drawer that starts closed', () => {
        render(<App />);
        const panel = screen.getByTestId('sidebar-panel');
        expect(panel.getAttribute('data-layout')).toBe('drawer');
        expect(panel.getAttribute('data-open')).toBe('false');
    });

    it('opens and closes the drawer from its own button', () => {
        render(<App />);
        const toggle = screen.getByTestId('sidebar-drawer-toggle');
        fireEvent.click(toggle);
        expect(screen.getByTestId('sidebar-panel').getAttribute('data-open')).toBe('true');
        fireEvent.click(toggle);
        expect(screen.getByTestId('sidebar-panel').getAttribute('data-open')).toBe('false');
    });

    it('turns the parameter panel into a sheet that starts closed', () => {
        render(<App />);
        const panel = screen.getByTestId('parameter-panel');
        expect(panel.getAttribute('data-layout')).toBe('sheet');
        expect(panel.getAttribute('data-open')).toBe('false');
        fireEvent.click(screen.getByTestId('parameter-sheet-toggle'));
        expect(screen.getByTestId('parameter-panel').getAttribute('data-open')).toBe('true');
    });

    it('keeps the drawer and the sheet out of the transport row', () => {
        render(<App />);
        const workspace = screen.getByTestId('workspace-row');
        const transport = screen.getByTestId('transport-toolbar');
        expect(workspace.contains(screen.getByTestId('sidebar-panel'))).toBe(true);
        expect(workspace.contains(screen.getByTestId('parameter-panel'))).toBe(true);
        // The dock is a sibling of the workspace, not a child of it: an
        // absolutely positioned drawer inside the workspace cannot reach it.
        expect(workspace.contains(transport)).toBe(false);
    });
});

describe('wide viewport (the desktop layout must not move)', () => {
    beforeEach(() => {
        installMatchMedia({ [NARROW_QUERY]: false, [COARSE_POINTER_QUERY]: false });
    });

    it('lays the palette and parameter panel out as static columns', () => {
        render(<App />);
        expect(screen.getByTestId('sidebar-panel').getAttribute('data-layout')).toBe('static');
        expect(screen.getByTestId('parameter-panel').getAttribute('data-layout')).toBe('static');
        expect(screen.getByTestId('app-root').getAttribute('data-viewport')).toBe('wide');
        expect(screen.getByTestId('app-root').getAttribute('data-pointer')).toBe('fine');
    });

    it('offers no drawer or sheet controls at all', () => {
        render(<App />);
        expect(screen.queryByTestId('sidebar-drawer-toggle')).toBeNull();
        expect(screen.queryByTestId('parameter-sheet-toggle')).toBeNull();
    });

    it('keeps the sidebar at its 200px column width and the panel at 350px', () => {
        render(<App />);
        expect(screen.getByTestId('sidebar-panel').style.width).toBe('200px');
        expect(screen.getByTestId('parameter-panel').style.width).toBe('350px');
        // Nothing is pulled out of flow on the desktop.
        expect(screen.getByTestId('sidebar-panel').style.position).toBe('');
        expect(screen.getByTestId('parameter-panel').style.position).toBe('');
    });
});

describe('no matchMedia at all (jsdom, SSR, an old embedder)', () => {
    it('renders the desktop layout rather than throwing', () => {
        expect((window as unknown as { matchMedia?: unknown }).matchMedia).toBeUndefined();
        render(<App />);
        expect(screen.getByTestId('app-root').getAttribute('data-viewport')).toBe('wide');
        expect(screen.getByTestId('sidebar-panel').getAttribute('data-layout')).toBe('static');
    });
});
