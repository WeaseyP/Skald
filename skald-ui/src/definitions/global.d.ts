export {};

declare global {
  interface Window {
    electron: {
      invokeCodegen: (graphJson: string) => Promise<string>;
      saveGraph: (graphJson: string) => Promise<void>;
      loadGraph: () => Promise<string | null>;
      logMessage: (message: string) => Promise<void>;
    };
  }
}
