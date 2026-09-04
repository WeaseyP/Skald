/*
================================================================================
| FILE: skald-ui/src/utils/exampleContent.ts                                   |
|                                                                              |
| The one way the renderer reads an example file's text: the Electron IPC     |
| when it exists (desktop), the web API otherwise. Extracted from            |
| ExamplesModal so the first-run patch (B6-6) reads examples through exactly  |
| the same two branches instead of a third copy that could drift.            |
================================================================================
*/

export const loadExampleContent = async (relPath: string): Promise<string | null> => {
    const electron = (window as unknown as { electron?: { loadExample?: (p: string) => Promise<{ content: string | null }> } }).electron;
    if (electron?.loadExample) {
        const res = await electron.loadExample(relPath);
        return res.content;
    }
    const res = await fetch(`/api/examples/${encodeURIComponent(relPath)}`);
    return res.ok ? await res.text() : null;
};
