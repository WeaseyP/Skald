// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
    assertCodegenTargetSafe,
    assertTargetPackageMatches,
    assertNoForeignSiblingPackage,
} from '../../main/codegenGuards';

// These guards run in the Electron MAIN process and touch the real filesystem,
// so they are tested against real temp directories (node env, no jsdom) rather
// than a mocked fs — the failure mode they prevent is a real file being
// clobbered, and only real fs proves they see it.

let dir: string;

const write = (name: string, contents: string): string => {
    const p = path.join(dir, name);
    fs.writeFileSync(p, contents);
    return p;
};

beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'skald-guard-'));
});

afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
});

describe('assertCodegenTargetSafe — overwrite guard', () => {
    it('allows overwriting a file that already declares the SAME package', () => {
        const out = write('generated_audio.odin', 'package generated_audio\n\nmain :: proc() {}\n');
        expect(() => assertCodegenTargetSafe(out, 'generated_audio')).not.toThrow();
    });

    it('refuses to overwrite a file declaring a DIFFERENT package, naming both packages', () => {
        const out = write('test_harness.odin', 'package main\n\nmain :: proc() {}\n');
        expect(() => assertCodegenTargetSafe(out, 'generated_audio')).toThrow(
            /Refusing to overwrite .*: it declares 'package main', but this generation would write 'package generated_audio'/
        );
    });

    it('defaults the target package to generated_audio when none is passed', () => {
        const out = write('test_harness.odin', 'package main\n');
        // No packageName arg -> compared against the 'generated_audio' default.
        expect(() => assertTargetPackageMatches(out)).toThrow(/'package generated_audio'/);
    });

    it('allows overwriting when the existing file has no package declaration at all', () => {
        const out = write('scratch.odin', '// just a comment, no package line\n');
        expect(() => assertTargetPackageMatches(out, 'generated_audio')).not.toThrow();
    });

    it('does not throw for a target path that does not exist yet', () => {
        const out = path.join(dir, 'brand_new.odin');
        expect(() => assertTargetPackageMatches(out, 'generated_audio')).not.toThrow();
    });
});

describe('assertCodegenTargetSafe — sibling-package guard', () => {
    it('refuses to write into a directory holding a sibling .odin of a different package', () => {
        // A foreign-package sibling already owns this directory.
        write('test_harness.odin', 'package main\n');
        const out = path.join(dir, 'generated_audio.odin'); // does not exist yet
        expect(() => assertCodegenTargetSafe(out, 'generated_audio')).toThrow(
            /Refusing to write into .*: it contains test_harness\.odin \('package main'\)/
        );
    });

    it('allows writing when all sibling .odin files share the target package', () => {
        write('helpers.odin', 'package generated_audio\n');
        write('extra.odin', 'package generated_audio\n');
        const out = path.join(dir, 'generated_audio.odin');
        expect(() => assertNoForeignSiblingPackage(out, 'generated_audio')).not.toThrow();
    });

    it('ignores non-.odin siblings entirely', () => {
        write('notes.txt', 'package main pretend');
        write('data.json', '{"package":"main"}');
        const out = path.join(dir, 'generated_audio.odin');
        expect(() => assertNoForeignSiblingPackage(out, 'generated_audio')).not.toThrow();
    });

    it('does not count the target file itself as a foreign sibling', () => {
        // The output file already exists with the SAME package; the sibling
        // sweep must skip it (the overwrite guard owns that check).
        const out = write('generated_audio.odin', 'package generated_audio\n');
        expect(() => assertNoForeignSiblingPackage(out, 'generated_audio')).not.toThrow();
    });

    it('tolerates a non-existent output directory (readdir fails, no throw)', () => {
        const out = path.join(dir, 'does', 'not', 'exist', 'generated_audio.odin');
        expect(() => assertNoForeignSiblingPackage(out, 'generated_audio')).not.toThrow();
        expect(() => assertCodegenTargetSafe(out, 'generated_audio')).not.toThrow();
    });
});
