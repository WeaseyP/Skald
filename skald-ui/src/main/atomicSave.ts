/*
================================================================================
| FILE: skald-ui/src/main/atomicSave.ts                                        |
|                                                                              |
| Atomic file write for Save (roadmap A7 item 18 / BUGS.md SKB-034).            |
| Extracted from main.ts so the failure path — the entire point of this file — |
| can be exercised without Electron or a real disk fault in the loop.          |
|                                                                              |
| WHAT WAS WRONG. `save-graph` called `fs.writeFileSync(filePath, ...)`         |
| straight at the target. `writeFileSync` opens the destination for writing    |
| (truncating it) BEFORE any bytes land, so a write that fails partway through |
| — full disk, a locked file, a permission error mid-write — could leave the   |
| previous good save destroyed and the new one incomplete: total data loss     |
| from a single interrupted write.                                            |
|                                                                              |
| THE FIX. Write the new content to a temp file beside the target, then        |
| rename the temp file over the target. A rename is a single filesystem       |
| operation that either fully succeeds (new bytes now at the target path) or   |
| fully fails (target untouched) — there is no partially-renamed state. This   |
| holds on Windows too: Node's `fs.renameSync` calls `MoveFileExW` with        |
| `MOVEFILE_REPLACE_EXISTING`, so renaming over an existing file is supported   |
| and atomic, not a Windows-only special case that needed a delete-first step. |
|                                                                              |
| Either failure mode (the write to the temp file, or the rename) leaves the   |
| ORIGINAL target completely unmodified, and the temp file is removed so nothing |
| lingers beside it. A successful save leaves no temp file behind either.      |
================================================================================
*/
import fs from 'node:fs';
import path from 'node:path';

/** Injectable fs calls, so a write or rename failure can be simulated without lying to the OS. */
export interface AtomicWriteProbes {
    writeFileSync: (path: string, data: string) => void;
    renameSync: (oldPath: string, newPath: string) => void;
    /** Best-effort cleanup; must never throw (mirrors `{ force: true }`). */
    removeQuietly: (path: string) => void;
}

export const realAtomicWriteProbes: AtomicWriteProbes = {
    writeFileSync: (p, data) => fs.writeFileSync(p, data, { encoding: 'utf8' }),
    renameSync: (oldPath, newPath) => fs.renameSync(oldPath, newPath),
    removeQuietly: (p) => {
        try {
            fs.rmSync(p, { force: true });
        } catch {
            // Best-effort: a leftover temp file is a cosmetic problem, not a
            // data-loss one, and this runs from inside an existing catch block.
        }
    },
};

/** A temp path beside `targetPath`, unlikely to collide with a concurrent save or a leftover. */
export const tempPathFor = (targetPath: string): string =>
    path.join(
        path.dirname(targetPath),
        `.${path.basename(targetPath)}.tmp-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`
    );

/**
 * Write `contents` to `targetPath` without ever letting a failed write destroy
 * whatever was there before (SKB-034).
 *
 * Writes to a fresh temp file beside the target, then renames the temp file
 * over the target. On ANY failure — the write or the rename — the temp file
 * is removed and the function re-throws; the target is guaranteed untouched,
 * because nothing was ever written to it directly. On success the target
 * holds exactly `contents` and the temp file no longer exists.
 */
export const atomicWriteFileSync = (
    targetPath: string,
    contents: string,
    probes: AtomicWriteProbes = realAtomicWriteProbes,
): void => {
    const tmpPath = tempPathFor(targetPath);
    try {
        probes.writeFileSync(tmpPath, contents);
    } catch (err) {
        probes.removeQuietly(tmpPath);
        throw err;
    }
    try {
        probes.renameSync(tmpPath, targetPath);
    } catch (err) {
        probes.removeQuietly(tmpPath);
        throw err;
    }
};
