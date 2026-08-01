/*
================================================================================
| FILE: skald-ui/src/tests/contracts/paramRangeDump.ts                         |
|                                                                              |
| Roadmap packet A8 — how the backend's parameter-range contract reaches the    |
| editor's tests.                                                              |
|                                                                              |
| HOW THE JSON GETS HERE, AND WHY THIS WAY                                     |
|                                                                              |
| The dump is BUILT AND RUN FROM SOURCE on every test run, into a temp dir,     |
| and thrown away. Nothing is committed and nothing is left behind.            |
|                                                                              |
| The rejected alternative was committing a generated `param-ranges.json`.      |
| That is cheaper (no Odin in the UI job) and wrong for this specific packet:   |
| the bug being retired IS a checked-in copy of the contract drifting from its  |
| source. A committed dump is a seventh copy, it goes stale exactly when        |
| someone edits `param_ranges.odin` without re-running a generator, and at      |
| that moment the gate starts asserting the editor against a snapshot of the    |
| backend's PAST — passing while the real mismatch ships. The repo already has  |
| this failure twice over: the tracked `skald_codegen.exe` (SKB-001) and the    |
| tracked `generated_audio.odin` the acceptance harness overwrites.             |
|                                                                              |
| The cost accepted instead: the UI test job needs an Odin toolchain. That is   |
| a five-line copy of the step the backend job already runs, it is pinned to    |
| the same release, and — critically — when it is MISSING the gate throws       |
| rather than skipping. A gate that quietly skips itself on the one machine     |
| that matters (CI) is not a gate. See the wiring note in RangeParity.test.tsx. |
|                                                                              |
| Build cost is ~0.3 s; the dump is cached per test process.                    |
================================================================================
*/
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { odinCandidates } from '../../main/odinToolchain';

/** One resolved `core.Param_Range`, as the dump prints it. */
export interface BackendRange {
    min: number;
    max: number;
    default: number;
    unit: string;
}

/** A row of the backend table, or a resolution for a queried key. */
export interface BackendEntry extends BackendRange {
    nodeType: string;
    name: string;
    /** 'override' | 'generic' | 'prefixSample' for entries; absent for queries. */
    source?: string;
    /** What `exposed_param_default` returns for an empty node of this type. */
    exposedDefault: number;
}

export interface BackendPrefixRule extends BackendRange {
    nodeType: string;
    prefix: string;
    sampledTo: number;
}

export interface BackendDump {
    schema: string;
    fallback: BackendRange;
    prefixRules: BackendPrefixRule[];
    /** Every key in the table, enumerated. */
    entries: BackendEntry[];
    /** Resolutions for the keys this process asked about. */
    queries: BackendEntry[];
}

/** A (nodeType, name) pair to resolve. Empty nodeType = generic lookup. */
export interface RangeQuery {
    nodeType: string;
    name: string;
}

const TOOL_REL = path.join('skald-backend', 'tools', 'param_range_dump');
const MARKER_REL = path.join('skald-backend', 'core', 'param_ranges.odin');

/**
 * Walk up from the working directory until the backend source is in view.
 *
 * Not `process.cwd()` directly: vitest is normally invoked from `skald-ui/`,
 * but `vitest --root` and IDE runners are not, and a wrong root here would
 * surface as "Odin not installed" rather than as a path bug.
 */
export const findRepoRoot = (start: string = process.cwd()): string => {
    let dir = path.resolve(start);
    for (let i = 0; i < 6; i += 1) {
        if (fs.existsSync(path.join(dir, MARKER_REL))) return dir;
        const parent = path.dirname(dir);
        if (parent === dir) break;
        dir = parent;
    }
    throw new Error(
        `Could not locate the Skald repo root from ${start}: no ancestor contains ${MARKER_REL}.`,
    );
};

/**
 * First Odin on this machine that answers `odin version`.
 *
 * Deliberately reuses the app's own resolver (`odinCandidates`) rather than
 * re-listing SKALD_ODIN / .tools / PATH / C:\Odin: that order is already
 * stated once, in the module the editor ships, and a second copy of it here
 * would be the same duplication mistake this packet exists to remove.
 */
const resolveOdinSync = (repoRoot: string): string => {
    const candidates = odinCandidates({
        appPath: path.join(repoRoot, 'skald-ui'),
        isPackaged: false,
        envOverride: process.env.SKALD_ODIN,
    });
    const tried: string[] = [];
    for (const candidate of candidates) {
        try {
            execFileSync(candidate, ['version'], { stdio: 'ignore', timeout: 30_000 });
            return candidate;
        } catch {
            tried.push(candidate);
        }
    }
    throw new Error(
        [
            'The range-parity gate needs an Odin compiler and found none.',
            `Tried, in order: ${tried.join(', ')}`,
            '',
            'This gate builds skald-backend/tools/param_range_dump from source so the',
            'editor is checked against the backend as it is RIGHT NOW, not against a',
            'committed snapshot. Fixes: run scripts/setup-dev.ps1 to vendor the pinned',
            'toolchain into .tools/, install Odin on PATH, or set SKALD_ODIN.',
            '',
            'Do NOT make this test skip instead. A range mismatch shipping unnoticed is',
            'the most-repeated bug in this repo (BUGS.md SKB-024/049/050/051); a gate',
            'that opts out when the toolchain is absent opts out exactly in CI.',
        ].join('\n'),
    );
};

let cached: BackendDump | null = null;
let cachedKey = '';

/**
 * Build and run the dump, returning the parsed JSON.
 *
 * `queries` are resolved by the backend's own `lookup_param_range`, so the
 * precedence rule (node-type override > prefix rule > generic name >
 * wide-open fallback) exists in exactly one place: Odin. Reimplementing it in
 * TypeScript to resolve these keys locally would create the extra copy of the
 * contract this gate is meant to eliminate.
 */
export const loadBackendRanges = (queries: RangeQuery[] = []): BackendDump => {
    const key = queries.map((q) => `${q.nodeType}=${q.name}`).sort().join('\n');
    if (cached && cachedKey === key) return cached;

    const repoRoot = findRepoRoot();
    const odin = resolveOdinSync(repoRoot);
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'skald-param-ranges-'));
    const exe = path.join(tmpDir, process.platform === 'win32' ? 'dump.exe' : 'dump');

    try {
        execFileSync(odin, ['build', path.join(repoRoot, TOOL_REL), `-out:${exe}`], {
            cwd: repoRoot,
            stdio: 'pipe',
            timeout: 180_000,
        });

        const args = queries.map((q) => `-q:${q.nodeType}=${q.name}`);
        const stdout = execFileSync(exe, args, {
            encoding: 'utf8',
            timeout: 60_000,
            maxBuffer: 32 * 1024 * 1024,
        });

        const parsed = JSON.parse(stdout) as BackendDump;
        if (parsed.schema !== 'skald.paramRanges.v1') {
            throw new Error(`Unexpected dump schema ${parsed.schema}; update this loader.`);
        }
        cached = parsed;
        cachedKey = key;
        return parsed;
    } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
    }
};

/**
 * Compare two bounds as the backend stores them.
 *
 * `Math.fround` on both sides, not an epsilon. The backend's `Param_Range` is
 * f32 and the editor's literals are f64, so 0.7 and the dump's 0.69999999 are
 * the SAME f32 and must compare equal — while 0.95 vs 0.99, or 300 vs 999,
 * must not. An arbitrary tolerance would have to be tuned, and a tuned
 * tolerance eventually hides a real mismatch.
 */
export const sameAsF32 = (a: number, b: number): boolean => Math.fround(a) === Math.fround(b);
