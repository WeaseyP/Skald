/// <reference types="@electron-forge/plugin-vite/forge-vite-env" />

// Add this interface for our preload script
export interface IElectronAPI {
    invokeCodegen: (graphJson: string) => Promise<string>,
}

declare global {
    interface Window {
        electron: IElectronAPI
    }
}