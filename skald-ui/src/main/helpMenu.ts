/*
================================================================================
| FILE: skald-ui/src/main/helpMenu.ts                                          |
|                                                                              |
| The Electron Help menu (roadmap packet B6-5): Manual, Examples folder,      |
| About. Kept as a pure template builder plus a pure About formatter so the   |
| labels, the wiring and the About text can be tested without Electron; the  |
| three actions are injected by main.ts.                                     |
|                                                                              |
| Why an About box carries the CODEGEN STAMP: the binary the app spawns is    |
| what a game team's export comes from, and "which generator made this" is   |
| the first question in every stale-binary report (SKB-001 / packet A2). The |
| same digest is printed into every generated header (B12), so About and the |
| .odin can be matched by eye.                                                |
================================================================================
*/
import type { MenuItemConstructorOptions } from 'electron';

export interface HelpMenuActions {
    openManual: () => void | Promise<void>;
    openExamplesFolder: () => void | Promise<void>;
    showAbout: () => void | Promise<void>;
}

export const MANUAL_FALLBACK_URL = 'https://github.com/WeaseyP/Skald/tree/main/docs/manual-source';

/** The first manual candidate that exists on disk, or null (then the fallback URL is used). */
export const resolveManualPath = (candidates: readonly string[], exists: (p: string) => boolean): string | null => {
    for (const c of candidates) {
        if (exists(c)) return c;
    }
    return null;
};

export const buildHelpMenu = (actions: HelpMenuActions): MenuItemConstructorOptions => ({
    label: 'Help',
    role: 'help',
    submenu: [
        { label: 'User Manual', accelerator: 'F1', click: () => { void actions.openManual(); } },
        { label: 'Open Examples Folder', click: () => { void actions.openExamplesFolder(); } },
        { type: 'separator' },
        { label: 'About Skald', click: () => { void actions.showAbout(); } },
    ],
});

export type AboutCodegen =
    | { ok: true; digest: string; verified: boolean }
    | { ok: false; message: string };

export interface AboutInfo {
    appVersion: string;
    electronVersion: string;
    chromeVersion: string;
    nodeVersion: string;
    codegen: AboutCodegen;
}

export const aboutText = (info: AboutInfo): string => {
    const codegen = info.codegen.ok
        ? `Code generator: ${info.codegen.digest}` +
          (info.codegen.verified
              ? ' (verified against the skald-backend sources in this checkout)'
              : ' (stamp read; no backend sources here to verify it against)')
        : `Code generator: ${info.codegen.message}`;
    return [
        `Skald ${info.appVersion}`,
        `Electron ${info.electronVersion} · Chromium ${info.chromeVersion} · Node ${info.nodeVersion}`,
        '',
        codegen,
        'Every generated .odin header carries the same generator digest (B12), so a',
        'checked-in export can be matched to the generator that produced it.',
    ].join('\n');
};
