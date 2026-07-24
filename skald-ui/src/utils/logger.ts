/**
 * Simple logger utility to standardize log messages and prevent spam.
 *
 * Level gating: 'debug' is for lifecycle chatter that is only useful while
 * actively diagnosing the preview engine (e.g. "master gain node is null",
 * "master gain node connected") — normal, expected transitions that would
 * otherwise look like faults in the console. It is suppressed by default
 * and only surfaces when explicitly turned on via
 * `localStorage.setItem('skald:debug', '1')`, so field diagnosis doesn't
 * need a rebuild. 'info'/'warn'/'error' always print — those back the
 * visible previewError/previewStale UI and must stay actionable.
 */

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_ORDER: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3 };

function minLevel(): LogLevel {
    try {
        if (typeof localStorage !== 'undefined' && localStorage.getItem('skald:debug') === '1') {
            return 'debug';
        }
    } catch {
        // localStorage can throw in restrictive contexts (e.g. sandboxed
        // iframes) — fall back to the default below.
    }
    return 'info';
}

export const logger = {
    info: (category: string, message: string, data?: any) => {
        log('info', category, message, data);
    },
    warn: (category: string, message: string, data?: any) => {
        log('warn', category, message, data);
    },
    error: (category: string, message: string, data?: any) => {
        log('error', category, message, data);
    },
    debug: (category: string, message: string, data?: any) => {
        log('debug', category, message, data);
    }
};

function log(level: LogLevel, category: string, message: string, data?: any) {
    if (LEVEL_ORDER[level] < LEVEL_ORDER[minLevel()]) return;

    const timestamp = new Date().toISOString().split('T')[1].slice(0, -1);
    const prefix = `[${timestamp}] [${category}]`;
    // console has no `debug` guarantee of a distinct method in every target;
    // it does in both browsers and Node, but route through `log` for the
    // 'debug' level to keep output consistent no matter the console impl.
    const consoleMethod = level === 'debug' ? 'log' : level;

    if (data) {
        console[consoleMethod](`${prefix} ${message}`, data);
    } else {
        console[consoleMethod](`${prefix} ${message}`);
    }
}
