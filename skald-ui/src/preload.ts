// src/preload.ts

import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electron', {
    invokeCodegen: (graphJson: string): Promise<string> => 
        ipcRenderer.invoke('invoke-codegen', graphJson),
});