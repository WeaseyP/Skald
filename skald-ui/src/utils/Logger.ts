export class Logger {
    private static lastLogTimes: Map<string, number> = new Map();

    /**
     * Sends a log message to the backend to be written to the log file.
     * @param message The message to log.
     */
    static log(message: string) {
        const timestamp = new Date().toISOString();
        const formattedMessage = `[${timestamp}] ${message}`;

        if (window.electron && window.electron.logMessage) {
            window.electron.logMessage(formattedMessage);
        } else {
            console.log(formattedMessage);
        }
    }

    /**
     * Sends a log message only if the specified interval has passed since the last log for the given key.
     * Use this for high-frequency updates like parameter polling.
     * @param key A unique identifier for this log source (e.g., 'adsr-gain-123').
     * @param message The message to log.
     * @param intervalMs The minimum interval in milliseconds between logs.
     */
    static logThrottled(key: string, message: string, intervalMs: number = 500) {
        const now = Date.now();
        const lastTime = this.lastLogTimes.get(key) || 0;

        if (now - lastTime >= intervalMs) {
            this.log(message);
            this.lastLogTimes.set(key, now);
        }
    }
}
