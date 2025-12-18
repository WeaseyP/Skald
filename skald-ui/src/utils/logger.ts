/**
 * Simple logger utility to standardize log messages and prevent spam.
 */

type LogLevel = 'info' | 'warn' | 'error' | 'debug';

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
    const timestamp = new Date().toISOString().split('T')[1].slice(0, -1);
    const prefix = `[${timestamp}] [${category}]`;
    
    if (data) {
        console[level](`${prefix} ${message}`, data);
    } else {
        console[level](`${prefix} ${message}`);
    }
}
