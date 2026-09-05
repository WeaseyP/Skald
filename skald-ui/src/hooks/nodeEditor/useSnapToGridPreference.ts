/*
================================================================================
| FILE: skald-ui/src/hooks/nodeEditor/useSnapToGridPreference.ts               |
|                                                                              |
| E6 (roadmap 0.2 §9.6 item 1): whether the canvas snaps dragged/dropped nodes |
| to the grid. A view preference, not a document field — it does not travel   |
| with the save file and must never go through pushHistory (undoing a drag     |
| should not also flip a display setting the user didn't touch). Persisted in  |
| localStorage only so it survives a reload, following the same defensive      |
| read/write pattern as useFirstRunPatch/useAutosave (localStorage can throw   |
| in restrictive contexts — a sandboxed iframe, a locked-down profile — and a  |
| view toggle is not worth crashing the editor over).                          |
================================================================================
*/
import { useCallback, useState } from 'react';

const SNAP_TO_GRID_KEY = 'skald.canvas.snapToGrid';

const readStoredPreference = (): boolean => {
    try {
        return typeof localStorage !== 'undefined' && localStorage.getItem(SNAP_TO_GRID_KEY) === '1';
    } catch {
        return false;
    }
};

export const useSnapToGridPreference = (): [boolean, (next: boolean) => void] => {
    const [snapToGrid, setSnapToGridState] = useState<boolean>(readStoredPreference);

    const setSnapToGrid = useCallback((next: boolean) => {
        setSnapToGridState(next);
        try {
            if (typeof localStorage !== 'undefined') {
                localStorage.setItem(SNAP_TO_GRID_KEY, next ? '1' : '0');
            }
        } catch {
            // Restrictive context: the toggle still works for this session,
            // it just won't survive a reload.
        }
    }, []);

    return [snapToGrid, setSnapToGrid];
};
