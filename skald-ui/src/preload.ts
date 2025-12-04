// weaseyp/skald/Skald-c85dd551104648b52e55e6e766bc5760cea28853/skald-ui/src/preload.ts
import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electron', {
    invokeCodegen: (graphJson: string): Promise<string> => 
        ipcRenderer.invoke('invoke-codegen', graphJson),
    
    saveGraph: (graphJson: string): Promise<void> =>
        ipcRenderer.invoke('save-graph', graphJson),
        
    loadGraph: (): Promise<string | null> =>
        ipcRenderer.invoke('load-graph'),

    logMessage: (message: string): Promise<void> =>
        ipcRenderer.invoke('log-message', message),
});