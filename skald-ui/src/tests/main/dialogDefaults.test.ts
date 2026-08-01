// @vitest-environment node
import { describe, it, expect } from 'vitest';
import path from 'node:path';
import {
    DialogPathEnv,
    DialogPathProbes,
    resolveExamplesDir,
    openDialogDefaultPath,
    importDialogDefaultPath,
    saveDialogDefaultPath,
    outputPathDefaultPath,
    testerGeneratedAudioDefault,
} from '../../main/dialogDefaults';

// Path resolution only — no Electron, no real directories. The probes are
// injected so a test can describe any install layout (dev checkout, packaged
// build, read-only Program Files) without creating one.

const probes = (dirs: string[], writable: string[] = dirs): DialogPathProbes => ({
    isDirectory: (p) => dirs.some((d) => path.resolve(d) === path.resolve(p)),
    isWritable: (p) => writable.some((d) => path.resolve(d) === path.resolve(p)),
});

const DEV: DialogPathEnv = {
    appPath: 'C:/repo/Skald/skald-ui',
    resourcesPath: 'C:/repo/Skald/skald-ui/node_modules/electron/dist/resources',
    isPackaged: false,
    documentsPath: 'C:/Users/dev/Documents',
};

const PACKAGED: DialogPathEnv = {
    appPath: 'C:/Program Files/Skald/resources/app.asar',
    resourcesPath: 'C:/Program Files/Skald/resources',
    isPackaged: true,
    documentsPath: 'C:/Users/dev/Documents',
};

const DEV_EXAMPLES = 'C:/repo/Skald/examples';
const PACKAGED_EXAMPLES = 'C:/Program Files/Skald/resources/examples';

describe('resolveExamplesDir', () => {
    it('finds the sibling examples folder in a dev checkout', () => {
        expect(resolveExamplesDir(DEV, probes([DEV_EXAMPLES]))).toBe(path.resolve(DEV_EXAMPLES));
    });

    it('finds the extraResource copy in a packaged build', () => {
        expect(resolveExamplesDir(PACKAGED, probes([PACKAGED_EXAMPLES])))
            .toBe(path.resolve(PACKAGED_EXAMPLES));
    });

    it('prefers resources/examples over the asar sibling when packaged', () => {
        // Both exist; the packaged copy is the real one. The asar sibling path
        // resolves to something inside Program Files\Skald\resources and must
        // not win, or the dialog opens on an internal app directory.
        const asarSibling = 'C:/Program Files/Skald/resources/app.asar/../examples';
        expect(resolveExamplesDir(PACKAGED, probes([PACKAGED_EXAMPLES, asarSibling])))
            .toBe(path.resolve(PACKAGED_EXAMPLES));
    });

    it('honours SKALD_EXAMPLES_DIR above every built-in location', () => {
        const custom = 'D:/patches';
        const env = { ...DEV, envOverride: custom };
        expect(resolveExamplesDir(env, probes([custom, DEV_EXAMPLES]))).toBe(path.resolve(custom));
    });

    it('ignores SKALD_EXAMPLES_DIR when it points at nothing', () => {
        const env = { ...DEV, envOverride: 'D:/deleted-last-week' };
        expect(resolveExamplesDir(env, probes([DEV_EXAMPLES]))).toBe(path.resolve(DEV_EXAMPLES));
    });

    it('returns null when no candidate exists', () => {
        expect(resolveExamplesDir(DEV, probes([]))).toBeNull();
    });
});

describe('openDialogDefaultPath — Load and Import', () => {
    it('opens on the examples folder', () => {
        expect(openDialogDefaultPath(DEV, probes([DEV_EXAMPLES]))).toBe(path.resolve(DEV_EXAMPLES));
    });

    it('leaves defaultPath undefined when there is no examples folder', () => {
        // Undefined means "no opinion" — Electron falls back to its own
        // last-used folder, which beats pointing the dialog at a missing path.
        expect(openDialogDefaultPath(DEV, probes([]))).toBeUndefined();
    });
});

describe('importDialogDefaultPath — Import Patch', () => {
    // Roadmap A7 item 23 / F-C4-11: Import Patch used to default into
    // `examples/snes-kit` specifically (the removed IMPORT_SUBDIR constant).
    // Pointing every installation's Import at one author's kit is arbitrary
    // for anyone not using it, so it now opens on `examples/` itself, same as
    // Load — `SKALD_IMPORT_DIR` is still the way to point it at a kit.
    const DEV_KIT = path.join(DEV_EXAMPLES, 'snes-kit');

    it('opens on examples/ itself, not any subfolder', () => {
        expect(importDialogDefaultPath(DEV, probes([DEV_EXAMPLES, DEV_KIT])))
            .toBe(path.resolve(DEV_EXAMPLES));
    });

    it('opens on examples/ in a packaged build too', () => {
        expect(importDialogDefaultPath(PACKAGED, probes([PACKAGED_EXAMPLES])))
            .toBe(path.resolve(PACKAGED_EXAMPLES));
    });

    it('leaves defaultPath undefined when there is no examples folder', () => {
        expect(importDialogDefaultPath(DEV, probes([]))).toBeUndefined();
    });

    it('honours SKALD_IMPORT_DIR above examples/, e.g. to point at a specific kit', () => {
        const custom = DEV_KIT;
        const env = { ...DEV, importOverride: custom };
        expect(importDialogDefaultPath(env, probes([custom, DEV_EXAMPLES])))
            .toBe(path.resolve(custom));
    });

    it('ignores SKALD_IMPORT_DIR when it points at nothing, falling back to examples/', () => {
        const env = { ...DEV, importOverride: 'D:/deleted-last-week' };
        expect(importDialogDefaultPath(env, probes([DEV_EXAMPLES, DEV_KIT])))
            .toBe(path.resolve(DEV_EXAMPLES));
    });
});

describe('saveDialogDefaultPath', () => {
    it('pre-fills the filename inside the examples folder', () => {
        expect(saveDialogDefaultPath('song.json', DEV, probes([DEV_EXAMPLES])))
            .toBe(path.join(path.resolve(DEV_EXAMPLES), 'song.json'));
    });

    it('falls back to Documents when the examples folder is read-only', () => {
        // A packaged install keeps examples under Program Files; defaulting a
        // save there fails on permissions instead of writing anything.
        const p = probes([PACKAGED_EXAMPLES], []);
        expect(saveDialogDefaultPath('song.json', PACKAGED, p))
            .toBe(path.join('C:/Users/dev/Documents', 'song.json'));
    });

    it('falls back to Documents when there is no examples folder at all', () => {
        expect(saveDialogDefaultPath('song.json', DEV, probes([])))
            .toBe(path.join('C:/Users/dev/Documents', 'song.json'));
    });

    it('degrades to a bare filename when even Documents is unknown', () => {
        const env = { ...DEV, documentsPath: undefined };
        expect(saveDialogDefaultPath('song.json', env, probes([]))).toBe('song.json');
    });
});

// Roadmap A7 item 23 / F-C4-11: the Generate/export "select output path"
// dialog used to reset to the tester default on EVERY click, forgetting
// whatever the user had chosen the moment the dialog closed.
describe('outputPathDefaultPath — Generate/export output path', () => {
    const TESTER_DIR = path.join(DEV_EXAMPLES, '..', 'skald-backend', 'tester', 'generated_audio');

    it('remembers a previously-chosen path above everything else', () => {
        const remembered = 'D:/my-game/audio/generated_audio.odin';
        expect(outputPathDefaultPath(remembered, DEV, probes([TESTER_DIR])))
            .toBe(remembered);
    });

    it('falls back to the tester default the FIRST time, when the tester dir exists', () => {
        expect(outputPathDefaultPath(undefined, DEV, probes([TESTER_DIR])))
            .toBe(testerGeneratedAudioDefault(DEV));
    });

    it('falls back to a bare filename when there is no remembered path and no tester dir', () => {
        expect(outputPathDefaultPath(undefined, DEV, probes([]))).toBe('generated_audio.odin');
    });

    it('treats an empty remembered path the same as none at all', () => {
        expect(outputPathDefaultPath('', DEV, probes([]))).toBe('generated_audio.odin');
    });
});
