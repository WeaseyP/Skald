/// <reference types="@electron-forge/plugin-vite/forge-vite-env" />

export interface IElectronAPI {
    invokeCodegen: (graphJson: string, options?: { packageName?: string, outputPath?: string }) => Promise<string>,
    // Save/load return explicit results so the renderer can surface
    // failures (fire-and-forget saves lied when the disk write failed).
    saveGraph: (graphJson: string) => Promise<{ saved: boolean; path?: string; error?: string }>,
    loadGraph: () => Promise<{ content: string | null; error?: string }>,
    selectOutputPath: () => Promise<string | null>,
    buildWasmPreview: (projectJson: string) => Promise<ArrayBuffer>,
}

declare global {
    interface Window {
        electron: IElectronAPI
    }
}