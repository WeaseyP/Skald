/*
================================================================================
| FILE: skald-ui/src/hooks/nodeEditor/useWindowTitle.ts                        |
|                                                                              |
| Packet B4 (c) — the window/tab title reflects unsaved state. Electron's      |
| BrowserWindow (see main.ts: createWindow sets no `title` option) mirrors     |
| the page's <title> by default, so setting document.title here is enough to  |
| move the native title bar too — no IPC round trip, no main-process change.   |
================================================================================
*/
import { useEffect } from 'react';

export const BASE_TITLE = 'Skald';

/**
 * A leading "*" is the conventional cross-platform marker for "there are
 * edits since the last save" (the same convention VS Code, Sublime, etc.
 * use) — no new UI affordance to learn, just the title the user already
 * glances at. Driven straight off `history.isDirty` (B3's seam), so it
 * clears on Save, on a fresh Load, and on an Undo back to the save point —
 * exactly the moments `isDirty` itself goes false.
 */
export const useWindowTitle = (isDirty: boolean): void => {
    useEffect(() => {
        document.title = isDirty ? `* ${BASE_TITLE}` : BASE_TITLE;
    }, [isDirty]);
};
