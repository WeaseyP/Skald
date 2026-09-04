/*
================================================================================
| FILE: skald-ui/src/hooks/nodeEditor/useFirstRunPatch.ts                     |
|                                                                              |
| Roadmap packet B6-6 — a brand-new install opens with a patch that makes a   |
| sound, so the first thing a new user does is press Play, not stare at an    |
| empty canvas wondering which of seventeen nodes to drag first. The patch is |
| the first Start Here example (startHere.ts), loaded through the same       |
| loader the Examples modal uses.                                             |
|                                                                              |
| It runs ONCE per browser profile (a localStorage marker) and never when     |
| there is something more important to show: an autosave to recover. It       |
| marks itself done only after a successful load, so a failed read (no IPC,   |
| no web API) is retried on the next launch instead of being latched as       |
| "seen".                                                                      |
================================================================================
*/
import { useEffect } from 'react';
import { FIRST_RUN_EXAMPLE } from '../../main/startHere';
import { loadExampleContent } from '../../utils/exampleContent';

export const FIRST_RUN_KEY = 'skald:first-run-patch:v1';

/**
 * Pure decision: load the first-run patch only on a genuinely fresh start —
 * nothing to recover, an empty canvas, and no marker from a previous launch.
 * `marker` is whatever localStorage returned (null when unset or unreadable).
 */
export const shouldLoadFirstRunPatch = (args: {
    hasRecoverableAutosave: boolean;
    nodeCount: number;
    marker: string | null;
}): boolean => !args.hasRecoverableAutosave && args.nodeCount === 0 && args.marker === null;

const readMarker = (): string | null => {
    try {
        return localStorage.getItem(FIRST_RUN_KEY);
    } catch {
        // Storage blocked (privacy mode): behave as if the patch had been
        // shown — a blocked profile would otherwise get it on every launch.
        return 'storage-unavailable';
    }
};

const writeMarker = (): void => {
    try {
        localStorage.setItem(FIRST_RUN_KEY, new Date().toISOString());
    } catch {
        // Nothing to do: the read side treats unreadable storage as "seen".
    }
};

export interface FirstRunPatchOptions {
    /** Evaluated by the caller from shouldLoadFirstRunPatch's inputs at mount. */
    enabled: boolean;
    /** The same loader an Examples-modal Load uses. */
    load: (content: string, name: string) => void;
}

export const useFirstRunPatch = ({ enabled, load }: FirstRunPatchOptions): void => {
    useEffect(() => {
        if (!enabled) return;
        if (readMarker() !== null) return;
        let cancelled = false;
        void (async () => {
            let content: string | null = null;
            try {
                content = await loadExampleContent(FIRST_RUN_EXAMPLE.path);
            } catch {
                content = null;
            }
            if (cancelled || !content) return;
            writeMarker();
            load(content, FIRST_RUN_EXAMPLE.name);
        })();
        return () => {
            cancelled = true;
        };
        // Deliberately keyed on `enabled` alone: `load` is a stable
        // useCallback in app.tsx, and re-running on its identity would risk
        // loading twice on a re-render before the marker lands.
    }, [enabled]);
};
