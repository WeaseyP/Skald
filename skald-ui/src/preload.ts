// weaseyp/skald/Skald-c85dd551104648b52e55e6e766bc5760cea28853/skald-ui/src/preload.ts
import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electron', {
    invokeCodegen: (graphJson: string, options?: { packageName?: string, outputPath?: string }): Promise<string> =>
        ipcRenderer.invoke('invoke-codegen', graphJson, options),

    saveGraph: (graphJson: string): Promise<{ saved: boolean; path?: string; error?: string }> =>
        ipcRenderer.invoke('save-graph', graphJson),

    loadGraph: (): Promise<{ content: string | null; error?: string }> =>
        ipcRenderer.invoke('load-graph'),

    // Roadmap G1: the offline bounce. Bytes, not text — see the save-wav
    // handler in main.ts for why this is its own channel.
    saveWav: (fileName: string, bytes: Uint8Array): Promise<{ saved: boolean; path?: string; error?: string }> =>
        ipcRenderer.invoke('save-wav', fileName, bytes),

    // Import Patch: opens in the patch kit and accepts a multi-selection.
    importPatches: (): Promise<{
        files: { name: string; content: string }[];
        skipped: { name: string; error: string }[];
    }> => ipcRenderer.invoke('import-patches'),

    // currentPath: the caller's already-selected output path, if any — passed
    // back so the dialog defaults to it instead of forgetting it every time
    // (roadmap A7 item 23 / F-C4-11).
    selectOutputPath: (currentPath?: string): Promise<string | null> =>
        ipcRenderer.invoke('select-output-path', currentPath),

    buildWasmPreview: (projectJson: string): Promise<ArrayBuffer> =>
        ipcRenderer.invoke('build-wasm-preview', projectJson),

    listExamples: (): Promise<any[]> =>
        ipcRenderer.invoke('list-examples'),

    loadExample: (examplePath: string): Promise<{ content: string | null; error?: string }> =>
        ipcRenderer.invoke('load-example', examplePath),
});