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
 * `defaultPath` for the Import Patch dialog: `examples/`.
 *
 * Used to default into `examples/snes-kit` specifically (`IMPORT_SUBDIR`, now
 * removed) — a deliberate earlier choice made because that was the kit being
 * worked out of at the time. Roadmap A7 item 23 / F-C4-11 reversed it: pointing
 * every installation's Import Patch at one author's kit is arbitrary for
 * anyone not using it, and buries whatever other single-instrument patches
 * ship under `examples/`. `SKALD_IMPORT_DIR` remains the way to point it at a
 * specific kit (or anywhere else) per machine.
 */
export const importDialogDefaultPath = (
    env: DialogPathEnv,
    probes: DialogPathProbes = realProbes,
): string | undefined => {
    if (env.importOverride && probes.isDirectory(env.importOverride)) {
        return path.resolve(env.importOverride);
    }
    return resolveExamplesDir(env, probes) ?? undefined;
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

/**
 * The one path the Generate/export "select output path" dialog opened on
 * before any output path had ever been chosen: `tester/generated_audio` is
 * the only directory `build_and_test.bat` reads from, so it is a reasonable
 * first guess — but only the FIRST time.
 */
export const testerGeneratedAudioDefault = (env: DialogPathEnv): string =>
    path.join(env.appPath, '..', 'skald-backend', 'tester', 'generated_audio', 'generated_audio.odin');

/**
 * `defaultPath` for the Generate/export "select output path" dialog
 * (roadmap A7 item 23 / F-C4-11).
 *
 * The dialog used to reopen on the tester default on EVERY click, forgetting
 * whatever the user had picked the moment the dialog closed — useful only for
 * the one workflow that builds against `tester/generated_audio`. Anyone
 * exporting to their own project directory had to re-navigate there every
 * single time. `rememberedPath` is whatever this session's caller last chose
 * (or `undefined` before a first choice); it always wins over the tester
 * default when present.
 */
export const outputPathDefaultPath = (
    rememberedPath: string | undefined,
    env: DialogPathEnv,
    probes: DialogPathProbes = realProbes,
): string => {
    if (rememberedPath) return rememberedPath;
    const testerDefault = testerGeneratedAudioDefault(env);
    return probes.isDirectory(path.dirname(testerDefault)) ? testerDefault : 'generated_audio.odin';
};
