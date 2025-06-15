/// <reference types="@electron-forge/plugin-vite/forge-vite-env" />

export interface IElectronAPI {
    invokeCodegen: (graphJson: string) => Promise<string>,
    // NEW: Add save/load to the interface
    saveGraph: (graphJson: string) => Promise<void>,
    loadGraph: () => Promise<string | null>,
}

declare global {
    interface Window {
        electron: IElectronAPI
    }
}