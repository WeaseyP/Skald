/// <reference types="@electron-forge/plugin-vite/forge-vite-env" />

// ExampleItem lives in a real module (src/definitions/examples.ts) so the
// renderer and its tests can import it through paths ESLint and tsc both
// resolve; this file only consumes it for the preload API surface below.
import type { ExampleItem } from './src/definitions/examples';

export interface IElectronAPI {
    invokeCodegen: (graphJson: string, options?: { packageName?: string, outputPath?: string }) => Promise<string>,
    // Save/load return explicit results so the renderer can surface
    // failures (fire-and-forget saves lied when the disk write failed).
    saveGraph: (graphJson: string) => Promise<{ saved: boolean; path?: string; error?: string }>,
    loadGraph: () => Promise<{ content: string | null; error?: string }>,
    // Import Patch: multi-selection, opened in the patch kit. Unreadable files
    // come back in `skipped` rather than failing the whole batch.
    importPatches: () => Promise<{
        files: { name: string; content: string }[];
        skipped: { name: string; error: string }[];
    }>,
    // currentPath: pass back the already-selected output path so the dialog
    // remembers it instead of resetting to the tester default every time.
    selectOutputPath: (currentPath?: string) => Promise<string | null>,
    buildWasmPreview: (projectJson: string) => Promise<ArrayBuffer>,
    listExamples?: () => Promise<ExampleItem[]>,
    loadExample?: (path: string) => Promise<{ content: string | null; error?: string }>,
}

declare global {
    interface Window {
        electron: IElectronAPI
    }
}