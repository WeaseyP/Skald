// @vitest-environment jsdom
//
// SKB-005, packet B4 (c) — "no window-title marker". The title bar (Electron
// mirrors document.title onto the native window by default — see
// useWindowTitle.ts) must say when there are unsaved edits and stop saying it
// the moment they are reconciled, so this test drives the hook directly off
// `isDirty` rather than the whole editor.
import { describe, it, expect, afterEach } from 'vitest';
import { renderHook, cleanup } from '@testing-library/react';
import { useWindowTitle, BASE_TITLE } from '../../hooks/nodeEditor/useWindowTitle';

afterEach(cleanup);

describe('useWindowTitle — SKB-005 packet B4 (c)', () => {
    it('is the plain base title when the document is clean', () => {
        renderHook(() => useWindowTitle(false));
        expect(document.title).toBe(BASE_TITLE);
    });

    it('prefixes with * the moment the document is dirty', () => {
        renderHook(() => useWindowTitle(true));
        expect(document.title).toBe(`* ${BASE_TITLE}`);
    });

    it('drops the marker again as soon as isDirty goes back to false (Save / Load / Undo-to-clean)', () => {
        const { rerender } = renderHook(({ dirty }) => useWindowTitle(dirty), {
            initialProps: { dirty: true },
        });
        expect(document.title).toBe(`* ${BASE_TITLE}`);

        rerender({ dirty: false });
        expect(document.title).toBe(BASE_TITLE);
    });

    it('re-marks dirty after a clean point if further edits follow', () => {
        const { rerender } = renderHook(({ dirty }) => useWindowTitle(dirty), {
            initialProps: { dirty: false },
        });
        rerender({ dirty: true });
        expect(document.title).toBe(`* ${BASE_TITLE}`);
        rerender({ dirty: false });
        expect(document.title).toBe(BASE_TITLE);
        rerender({ dirty: true });
        expect(document.title).toBe(`* ${BASE_TITLE}`);
    });
});
