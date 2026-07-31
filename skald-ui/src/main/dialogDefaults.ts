/*
================================================================================
| FILE: skald-ui/src/main/dialogDefaults.ts                                    |
|                                                                              |
| Works out which folder the Load / Save / Import dialogs should open on.      |
| Extracted from main.ts so the path resolution can be tested without          |
| Electron in the loop.                                                        |
|                                                                              |
| Every one of those dialogs used to open wherever the OS last left the file   |
| picker, so a fresh install landed in Documents (or worse, the last folder    |
| an unrelated app touched) and the shipped example patches — the ones every   |
| manual chapter's "Try it" section tells you to open — were several clicks    |
| away. They now open on the examples folder every time.                       |
================================================================================
*/
import path from 'node:path';
import fs from 'node:fs';

export const EXAMPLES_DIR_NAME = 'examples';

/**
 * Subfolder of `examples/` that the Import Patch dialog opens on.
 *
 * Import Patch is the "drop another instrument into the song I already have"
 * action, so it wants the single-instrument patch library rather than the top
 * of `examples/` — which is where Load starts, and which is four clicks from
 * anything importable. Point this at whichever kit you are working out of;
 * `SKALD_IMPORT_DIR` overrides it per machine.
 */
export const IMPORT_SUBDIR = 'snes-kit';

/** Everything about the host that path resolution depends on. */
export interface DialogPathEnv {
    /** `app.getAppPath()` — the skald-ui project dir in dev, inside app.asar when packaged. */
    appPath: string;
    /** `process.resourcesPath` — where extraResource files land in a packaged build. */
    resourcesPath?: string;
    /** `app.isPackaged`. */
    isPackaged: boolean;
    /** `app.getPath('documents')` — last-resort fallback for saves. */
    documentsPath?: string;
    /** `SKALD_EXAMPLES_DIR` — escape hatch for anyone keeping patches elsewhere. */
    envOverride?: string;
    /** `SKALD_IMPORT_DIR` — where Import Patch should open, absolute path. */
    importOverride?: string;
}

/** Injectable filesystem probes, so tests need no real directories. */
export interface DialogPathProbes {
    isDirectory: (p: string) => boolean;
    isWritable: (p: string) => boolean;
}

export const realProbes: DialogPathProbes = {
    isDirectory: (p) => {
        try {
            return fs.statSync(p).isDirectory();
        } catch {
            return false;
        }
    },
    isWritable: (p) => {
        try {
            fs.accessSync(p, fs.constants.W_OK);
            return true;
        } catch {
            return false;
        }
    },
};

/**
 * Every place the examples folder could plausibly live, best first.
 *
 * Dev runs from the repo, where `appPath` is `Skald/skald-ui` and the examples
 * sit one level up. Packaged builds get them copied to `resources/examples`
 * by the `extraResource` entry in forge.config.ts.
 */
export const examplesDirCandidates = (env: DialogPathEnv): string[] => {
    const out: string[] = [];
    if (env.envOverride) out.push(env.envOverride);
    if (env.isPackaged && env.resourcesPath) out.push(path.join(env.resourcesPath, EXAMPLES_DIR_NAME));
    out.push(path.join(env.appPath, '..', EXAMPLES_DIR_NAME));
    out.push(path.join(env.appPath, EXAMPLES_DIR_NAME));
    if (!env.isPackaged && env.resourcesPath) out.push(path.join(env.resourcesPath, EXAMPLES_DIR_NAME));
    return out;
};

/** The examples folder, or null if this install genuinely has none. */
export const resolveExamplesDir = (
    env: DialogPathEnv,
    probes: DialogPathProbes = realProbes,
): string | null => {
    for (const candidate of examplesDirCandidates(env)) {
        if (probes.isDirectory(candidate)) return path.resolve(candidate);
    }
    return null;
};

/**
 * `defaultPath` for an OPEN dialog (Load, Import).
 *
 * `undefined` deliberately means "no opinion" — Electron then falls back to
 * its own last-used-folder behaviour, which beats forcing a path that isn't
 * there.
 */
export const openDialogDefaultPath = (
    env: DialogPathEnv,
    probes: DialogPathProbes = realProbes,
): string | undefined => resolveExamplesDir(env, probes) ?? undefined;

/**
 * `defaultPath` for the Import Patch dialog: `examples/<IMPORT_SUBDIR>`.
 *
 * Falls back a step at a time rather than pointing the picker at a path that
 * isn't there — a renamed or deleted kit folder degrades to `examples/`, and
 * no examples folder at all degrades to `undefined` ("no opinion").
 */
export const importDialogDefaultPath = (
    env: DialogPathEnv,
    probes: DialogPathProbes = realProbes,
): string | undefined => {
    if (env.importOverride && probes.isDirectory(env.importOverride)) {
        return path.resolve(env.importOverride);
    }
    const examples = resolveExamplesDir(env, probes);
    if (!examples) return undefined;
    const kit = path.join(examples, IMPORT_SUBDIR);
    return probes.isDirectory(kit) ? path.resolve(kit) : examples;
};

/**
 * `defaultPath` for a SAVE dialog: the examples folder with `fileName`
 * pre-filled.
 *
 * A packaged install keeps its examples under Program Files, where a save
 * would fail on permissions, so an unwritable examples folder steps aside for
 * Documents. Dev runs out of the repo and stays in `examples/`.
 */
export const saveDialogDefaultPath = (
    fileName: string,
    env: DialogPathEnv,
    probes: DialogPathProbes = realProbes,
): string => {
    const dir = resolveExamplesDir(env, probes);
    if (dir && probes.isWritable(dir)) return path.join(dir, fileName);
    if (env.documentsPath) return path.join(env.documentsPath, fileName);
    return fileName;
};
