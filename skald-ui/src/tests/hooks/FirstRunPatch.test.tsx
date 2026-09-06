// @vitest-environment jsdom
//
// Roadmap packet B6-6. A fresh install opens with the first Start Here patch
// so Play makes a sound within the first minute. Once per profile, never over
// an autosave, and only latched as "seen" after a successful load.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, renderHook, waitFor } from '@testing-library/react';
import { FIRST_RUN_KEY, shouldLoadFirstRunPatch, useFirstRunPatch } from '../../hooks/nodeEditor/useFirstRunPatch';
import { FIRST_RUN_EXAMPLE } from '../../main/startHere';

type ElectronShim = { electron?: { loadExample?: ReturnType<typeof vi.fn> } };
const win = window as unknown as ElectronShim;

beforeEach(() => {
    localStorage.clear();
});

afterEach(() => {
    cleanup();
    delete win.electron;
});

describe('shouldLoadFirstRunPatch', () => {
    it('is true only for a fresh start: no autosave, empty canvas, no marker', () => {
        expect(shouldLoadFirstRunPatch({ hasRecoverableAutosave: false, nodeCount: 0, marker: null })).toBe(true);
        expect(shouldLoadFirstRunPatch({ hasRecoverableAutosave: true, nodeCount: 0, marker: null })).toBe(false);
        expect(shouldLoadFirstRunPatch({ hasRecoverableAutosave: false, nodeCount: 3, marker: null })).toBe(false);
        expect(shouldLoadFirstRunPatch({ hasRecoverableAutosave: false, nodeCount: 0, marker: '2026-09-05' })).toBe(false);
    });
});

describe('useFirstRunPatch', () => {
    it('loads the first Start Here example through the example loader and sets the marker', async () => {
        win.electron = { loadExample: vi.fn().mockResolvedValue({ content: '{"nodes":[]}' }) };
        const load = vi.fn();
        renderHook(() => useFirstRunPatch({ enabled: true, load }));

        await waitFor(() => expect(load).toHaveBeenCalledTimes(1));
        expect(win.electron.loadExample).toHaveBeenCalledWith(FIRST_RUN_EXAMPLE.path);
        expect(load).toHaveBeenCalledWith('{"nodes":[]}', FIRST_RUN_EXAMPLE.name);
        expect(localStorage.getItem(FIRST_RUN_KEY)).not.toBeNull();
    });

    it('does nothing on a later launch (marker present)', async () => {
        localStorage.setItem(FIRST_RUN_KEY, '2026-09-05T00:00:00.000Z');
        win.electron = { loadExample: vi.fn().mockResolvedValue({ content: '{}' }) };
        const load = vi.fn();
        renderHook(() => useFirstRunPatch({ enabled: true, load }));
        await new Promise((r) => setTimeout(r, 20));
        expect(win.electron.loadExample).not.toHaveBeenCalled();
        expect(load).not.toHaveBeenCalled();
    });

    it('does nothing when disabled (an autosave is waiting, or the canvas is not empty)', async () => {
        win.electron = { loadExample: vi.fn().mockResolvedValue({ content: '{}' }) };
        const load = vi.fn();
        renderHook(() => useFirstRunPatch({ enabled: false, load }));
        await new Promise((r) => setTimeout(r, 20));
        expect(load).not.toHaveBeenCalled();
        expect(localStorage.getItem(FIRST_RUN_KEY)).toBeNull();
    });

    it('does not latch the marker when the example cannot be read, so the next launch retries', async () => {
        win.electron = { loadExample: vi.fn().mockResolvedValue({ content: null, error: 'Examples directory not found' }) };
        const load = vi.fn();
        renderHook(() => useFirstRunPatch({ enabled: true, load }));
        await waitFor(() => expect(win.electron!.loadExample).toHaveBeenCalled());
        await new Promise((r) => setTimeout(r, 20));
        expect(load).not.toHaveBeenCalled();
        expect(localStorage.getItem(FIRST_RUN_KEY)).toBeNull();
    });
});
