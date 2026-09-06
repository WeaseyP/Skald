// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { atomicWriteFileSync, realAtomicWriteProbes, AtomicWriteProbes } from '../../main/atomicSave';

// SKB-034: Save used to `fs.writeFileSync` straight over the target, so a
// write that failed partway through (full disk, locked file, permission
// error) could destroy the previous good save. These tests exercise the
// FAILURE path against a REAL directory — that is the entire bug, and a
// happy-path-only test would not have caught it.

let dir: string;
const targetPath = () => path.join(dir, 'song.skald.json');

beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'skald-atomic-save-'));
});

afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
});

const listDir = () => fs.readdirSync(dir).sort();

describe('atomicWriteFileSync — happy path, real filesystem', () => {
    it('writes a brand-new file and leaves no temp file behind', () => {
        atomicWriteFileSync(targetPath(), '{"nodes":[]}');
        expect(fs.readFileSync(targetPath(), 'utf8')).toBe('{"nodes":[]}');
        expect(listDir()).toEqual(['song.skald.json']);
    });

    it('completely replaces an existing file and leaves no temp file behind', () => {
        fs.writeFileSync(targetPath(), '{"nodes":["OLD"]}');
        atomicWriteFileSync(targetPath(), '{"nodes":["NEW"]}');
        expect(fs.readFileSync(targetPath(), 'utf8')).toBe('{"nodes":["NEW"]}');
        expect(listDir()).toEqual(['song.skald.json']);
    });
});

describe('atomicWriteFileSync — failure path (the bug)', () => {
    it('a failed write to the temp file leaves a pre-existing target completely intact', () => {
        const goodSave = '{"nodes":["the one good save the user has"]}';
        fs.writeFileSync(targetPath(), goodSave);

        const probes: AtomicWriteProbes = {
            ...realAtomicWriteProbes,
            // Simulate a full disk / permission error partway through the write.
            writeFileSync: () => {
                throw new Error('ENOSPC: no space left on device');
            },
        };

        expect(() => atomicWriteFileSync(targetPath(), '{"nodes":["would-be new save"]}', probes))
            .toThrow('ENOSPC');

        // The original file must be byte-for-byte what it was before the
        // attempted save — this is the entire point of the fix.
        expect(fs.readFileSync(targetPath(), 'utf8')).toBe(goodSave);
        // And no debris left beside it.
        expect(listDir()).toEqual(['song.skald.json']);
    });

    it('a write that flushes SOME real bytes to disk before erroring never touches the pre-existing target', () => {
        // A full disk error typically doesn't fire before a single byte is
        // written — the OS accepts a partial write, then the NEXT write
        // fails. A stub that throws before writing anything (the test above)
        // can't tell an atomic implementation from a naive
        // `fs.writeFileSync(targetPath, ...)`, because neither touches the
        // real target when the mock never writes anywhere. This probe
        // performs a REAL partial write to whatever path it is given, which
        // is the one thing that actually distinguishes "wrote to a temp file"
        // from "wrote straight at the target": if the code under test ever
        // regresses to writing directly at targetPath, THIS test corrupts the
        // good save and catches it.
        const goodSave = '{"nodes":["the one good save the user has"]}';
        fs.writeFileSync(targetPath(), goodSave);

        const probes: AtomicWriteProbes = {
            ...realAtomicWriteProbes,
            writeFileSync: (p, data) => {
                realAtomicWriteProbes.writeFileSync(p, data.slice(0, 3)); // real partial write, wherever p points
                throw new Error('ENOSPC: no space left on device');
            },
        };

        expect(() => atomicWriteFileSync(targetPath(), '{"nodes":["would-be new save"]}', probes))
            .toThrow('ENOSPC');

        expect(fs.readFileSync(targetPath(), 'utf8')).toBe(goodSave);
        expect(listDir()).toEqual(['song.skald.json']); // temp file cleaned up, nothing else beside the target
    });

    it('a failed rename leaves a pre-existing target completely intact and removes the temp file', () => {
        const goodSave = '{"nodes":["the one good save the user has"]}';
        fs.writeFileSync(targetPath(), goodSave);

        // Let the temp write actually happen (real fs), but fail the rename —
        // e.g. the target is locked by another process (AV scan, a second
        // Skald window, OneDrive) at the exact moment of the swap.
        const probes: AtomicWriteProbes = {
            ...realAtomicWriteProbes,
            renameSync: () => {
                throw new Error('EBUSY: resource busy or locked');
            },
        };

        expect(() => atomicWriteFileSync(targetPath(), '{"nodes":["would-be new save"]}', probes))
            .toThrow('EBUSY');

        expect(fs.readFileSync(targetPath(), 'utf8')).toBe(goodSave);
        // The real write did create a temp file; the guaranteed cleanup must
        // have removed it rather than leaving it to be discovered later.
        expect(listDir()).toEqual(['song.skald.json']);
    });

    it('a failed write when there was no PRE-EXISTING file leaves the directory empty (no partial/garbage file)', () => {
        const probes: AtomicWriteProbes = {
            ...realAtomicWriteProbes,
            writeFileSync: () => {
                throw new Error('EACCES: permission denied');
            },
        };

        expect(() => atomicWriteFileSync(targetPath(), '{"nodes":[]}', probes)).toThrow('EACCES');
        expect(fs.existsSync(targetPath())).toBe(false);
        expect(listDir()).toEqual([]);
    });

    it('cleans up the temp file even when the write throws something that already created it partially', () => {
        // realAtomicWriteProbes.writeFileSync really writes to disk; wrap it so
        // the temp file lands for real and THEN we report failure, mimicking a
        // process that wrote some bytes before erroring out.
        const probes: AtomicWriteProbes = {
            ...realAtomicWriteProbes,
            writeFileSync: (p, data) => {
                realAtomicWriteProbes.writeFileSync(p, data.slice(0, 1)); // partial write really happens
                throw new Error('EIO: i/o error');
            },
        };

        expect(() => atomicWriteFileSync(targetPath(), '{"nodes":[]}', probes)).toThrow('EIO');
        expect(fs.existsSync(targetPath())).toBe(false);
        expect(listDir()).toEqual([]); // the partially-written temp file was removed
    });
});

describe('atomicWriteFileSync — probe wiring', () => {
    it('calls writeFileSync then renameSync, in that order, with the same temp path', () => {
        const calls: string[] = [];
        const probes: AtomicWriteProbes = {
            writeFileSync: vi.fn((p) => { calls.push(`write:${p}`); }),
            renameSync: vi.fn((o, n) => { calls.push(`rename:${o}->${n}`); }),
            removeQuietly: vi.fn(),
        };
        atomicWriteFileSync(targetPath(), 'x', probes);
        expect(calls).toHaveLength(2);
        expect(calls[0]).toMatch(/^write:/);
        const writtenPath = calls[0].slice('write:'.length);
        expect(calls[1]).toBe(`rename:${writtenPath}->${targetPath()}`);
        expect(probes.removeQuietly).not.toHaveBeenCalled();
    });
});

// Roadmap G1 (§9.12) — the offline bounce writes a WAV, and a WAV is bytes.
//
// Save's atomic-write discipline (SKB-034) is not a JSON-only concern: a
// half-written 24-bit stereo bounce over the top of yesterday's good one is
// the same data loss with a different extension. What is new is the payload
// type — `fs.writeFileSync(p, data, { encoding: 'utf8' })` on a STRING built
// from binary would replace every byte outside the ASCII range with U+FFFD,
// silently turning a bounce into static, so the bytes must travel as a
// Uint8Array the whole way down.
describe('atomicWriteFileSync — binary payloads (the WAV bounce)', () => {
    it('round-trips every byte value 0..255, which a utf8 string round-trip would mangle', () => {
        const bytes = new Uint8Array(256);
        for (let i = 0; i < 256; i++) bytes[i] = i;
        const wavPath = path.join(dir, 'bounce.wav');

        atomicWriteFileSync(wavPath, bytes);

        const read = fs.readFileSync(wavPath);
        expect(read.length).toBe(256);
        expect(Array.from(read)).toEqual(Array.from(bytes));
        expect(listDir()).toEqual(['bounce.wav']);
    });

    it('a failed binary write leaves the previous bounce intact and removes the temp file', () => {
        const wavPath = path.join(dir, 'bounce.wav');
        const previous = new Uint8Array([0xff, 0x00, 0x80, 0x7f]);
        fs.writeFileSync(wavPath, previous);
        const probes: AtomicWriteProbes = {
            ...realAtomicWriteProbes,
            renameSync: () => { throw new Error('EPERM: file is open in a DAW'); },
        };

        expect(() => atomicWriteFileSync(wavPath, new Uint8Array([1, 2, 3]), probes)).toThrow(/EPERM/);
        expect(Array.from(fs.readFileSync(wavPath))).toEqual(Array.from(previous));
        expect(listDir()).toEqual(['bounce.wav']);
    });
});
