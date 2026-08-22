// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { removeArchiveFromPackagedExamples } from '../../main/forgePostPackage';

// forge.config.ts's `extraResource: ['./skald_codegen.exe', '../examples']`
// copies ../examples verbatim into every packaged build — extraResource has
// no glob/ignore support, so archive/ (kept in the repo for the corpus gate,
// see corpusGate.ts) has to be removed from the OUTPUT after packaging
// instead. This exercises the real hook function against a synthetic
// packaged-output tree, not just the forge.config.ts object shape: a shape
// assertion would not prove the folder is actually gone afterwards.

describe('removeArchiveFromPackagedExamples', () => {
    let root: string;

    beforeEach(() => {
        root = fs.mkdtempSync(path.join(os.tmpdir(), 'skald-forge-postpackage-'));
    });

    afterEach(() => {
        fs.rmSync(root, { recursive: true, force: true });
    });

    const makePackagedOutput = (outputPath: string): void => {
        const examplesDir = path.join(outputPath, 'resources', 'examples');
        fs.mkdirSync(path.join(examplesDir, 'archive'), { recursive: true });
        fs.writeFileSync(path.join(examplesDir, 'archive', 'AlarmPulse.json'), '{}');
        fs.writeFileSync(path.join(examplesDir, 'archive', 'Sax2.json'), '{}');
        fs.mkdirSync(path.join(examplesDir, 'songs'), { recursive: true });
        fs.writeFileSync(path.join(examplesDir, 'songs', 'four-bar-song.json'), '{}');
        fs.writeFileSync(path.join(outputPath, 'resources', 'skald_codegen.exe'), '');
    };

    it('removes resources/examples/archive but leaves the rest of resources/examples intact', () => {
        const outputPath = path.join(root, 'Skald-win32-x64');
        makePackagedOutput(outputPath);

        removeArchiveFromPackagedExamples([outputPath]);

        expect(fs.existsSync(path.join(outputPath, 'resources', 'examples', 'archive'))).toBe(false);
        expect(
            fs.existsSync(
                path.join(outputPath, 'resources', 'examples', 'songs', 'four-bar-song.json'),
            ),
        ).toBe(true);
        expect(fs.existsSync(path.join(outputPath, 'resources', 'skald_codegen.exe'))).toBe(true);
    });

    it('handles every entry in outputPaths, not just the first', () => {
        const win = path.join(root, 'Skald-win32-x64');
        const win32 = path.join(root, 'Skald-win32-ia32');
        makePackagedOutput(win);
        makePackagedOutput(win32);

        removeArchiveFromPackagedExamples([win, win32]);

        expect(fs.existsSync(path.join(win, 'resources', 'examples', 'archive'))).toBe(false);
        expect(fs.existsSync(path.join(win32, 'resources', 'examples', 'archive'))).toBe(false);
    });

    it('does not throw when a packaged output has no examples/archive at all', () => {
        const outputPath = path.join(root, 'Skald-win32-x64');
        fs.mkdirSync(path.join(outputPath, 'resources'), { recursive: true });

        expect(() => removeArchiveFromPackagedExamples([outputPath])).not.toThrow();
    });
});
