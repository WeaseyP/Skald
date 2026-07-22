// weaseyp/skald/Skald-c85dd551104648b52e55e6e766bc5760cea28853/skald-ui/src/preload.ts
import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electron', {
    invokeCodegen: (graphJson: string, options?: { packageName?: string, outputPath?: string }): Promise<string> =>
        ipcRenderer.invoke('invoke-codegen', graphJson, options),

    saveGraph: (graphJson: string): Promise<{ saved: boolean; path?: string; error?: string }> =>
        ipcRenderer.invoke('save-graph', graphJson),

    loadGraph: (): Promise<{ content: string | null; error?: string }> =>
        ipcRenderer.invoke('load-graph'),

    selectOutputPath: (): Promise<string | null> =>
        ipcRenderer.invoke('select-output-path'),

    buildWasmPreview: (projectJson: string): Promise<ArrayBuffer> =>
        ipcRenderer.invoke('build-wasm-preview', projectJson),
});