/*
================================================================================
| FILE: skald-ui/src/tests/corpus/corpusGate.ts                                |
|                                                                              |
| Roadmap packet A5 — infrastructure for the examples-corpus CI gate.          |
|                                                                              |
| WHAT IS ENUMERATED, AND WHY IT IS A GLOB                                     |
|                                                                              |
| Every `*.json` under `examples/`, recursively. NOT `*.skald.json`: the        |
| originally proposed glob (finding F-B11-1) silently skipped the 19 bare      |
| `.json` files then on disk — among them `archive/PulsarBeam.json`, at the    |
| time the only file known to fail codegen. (B6-2 deleted that file; 17 bare   |
| `.json` files remain and every one of them passes.) A gate that passes       |
| while missing the one thing it exists to                                     |
| catch is worse than no gate (roadmap A5, correction D2-4). No count is       |
| hardcoded anywhere: the corpus is whatever is on disk, and the only floor    |
| asserted is "not empty" (the A8 lesson — a silently-empty enumeration must   |
| fail, not pass vacuously).                                                   |
|                                                                              |
| NOTHING IS COMMITTED FOR THE GATE TO READ                                    |
|                                                                              |
| Same pattern as packet A8 (RangeParity): the codegen binary is built from    |
| source per run via the SAME script `npm start` uses (ensure-codegen.mjs),    |
| output goes to a temp dir, and when the Odin toolchain is missing the gate   |
| THROWS rather than skipping — a gate that opts out when the toolchain is     |
| absent opts out precisely in CI.                                            |
================================================================================
*/
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { odinCandidates } from '../../main/odinToolchain';
// findRepoRoot and the f32 comparison rule are A8's; reusing them keeps the
// "how tests locate the repo / compare against f32 literals" decisions stated
// exactly once.
import { findRepoRoot, sameAsF32 } from '../contracts/paramRangeDump';

export { findRepoRoot, sameAsF32 };

// ---------------------------------------------------------------------------
// Corpus enumeration and classification
// ---------------------------------------------------------------------------

/** The session block the editor writes on every Save (useFileIO handleSave). */
export interface AuthoredSession {
    bpm?: number;
    masterVolume?: number;
    patternSteps?: number;
    packageName?: string;
}

export interface CorpusFile {
    /** Repo-relative path, forward slashes — stable across OSes and in test names. */
    rel: string;
    abs: string;
    /** 'graph' = a React Flow save (top-level nodes[]); 'project' = backend Project JSON. */
    shape: 'graph' | 'project';
    /** The authored top-level session block, or null when the file has none. */
    session: AuthoredSession | null;
    /** True when the graph carries at least one Instrument node (editor can Play it). */
    hasInstrument: boolean;
}

/**
 * Enumerate and classify every example. Throws on unreadable JSON or a file
 * that is neither graph- nor project-shaped: an unclassifiable example is a
 * corpus defect the gate must surface, not skip.
 */
export const listCorpus = (repoRoot: string): CorpusFile[] => {
    const examplesDir = path.join(repoRoot, 'examples');
    const found: string[] = [];
    const walk = (dir: string): void => {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            const p = path.join(dir, entry.name);
            if (entry.isDirectory()) walk(p);
            else if (entry.name.endsWith('.json')) found.push(p);
        }
    };
    walk(examplesDir);
    found.sort();

    const corpus = found.map((abs): CorpusFile => {
        const rel = path.relative(repoRoot, abs).split(path.sep).join('/');
        let raw: unknown;
        try {
            raw = JSON.parse(fs.readFileSync(abs, 'utf8'));
        } catch (e) {
            throw new Error(`${rel} is not readable JSON: ${e instanceof Error ? e.message : e}`);
        }
        const obj = raw as Record<string, unknown>;
        if (Array.isArray(obj.nodes)) {
            return {
                rel,
                abs,
                shape: 'graph',
                session:
                    obj.session && typeof obj.session === 'object'
                        ? (obj.session as AuthoredSession)
                        : null,
                hasInstrument: (obj.nodes as Array<{ type?: string }>).some(
                    (n) => n && n.type === 'instrument',
                ),
            };
        }
        if (obj.project && typeof obj.project === 'object') {
            return { rel, abs, shape: 'project', session: null, hasInstrument: false };
        }
        throw new Error(
            `${rel} is neither a graph-shaped save (top-level nodes[]) nor a project JSON ` +
                `(top-level project{}) — an example no reader can ingest must not sit in examples/ unnoticed.`,
        );
    });

    if (corpus.length === 0) {
        throw new Error(
            `The corpus glob found ZERO .json files under ${examplesDir} — an empty enumeration ` +
                `passing every per-file test is the exact vacuous-green failure this gate exists to prevent.`,
        );
    }
    return corpus;
};

// ---------------------------------------------------------------------------
// Quarantine mechanism — REMOVED by packet B6-1.
//
// This used to hold two allowlists (`EDITOR_UNPLAYABLE`, `CLI_CODEGEN_FAILS`)
// plus `QuarantineEntry`/`isQuarantined` (roadmap A5). `CLI_CODEGEN_FAILS` had
// already gone empty in packet B6-2 (its one entry, `PulsarBeam.json`, was
// deleted outright rather than quarantined forever). `EDITOR_UNPLAYABLE` held
// exactly the 24 no-Instrument-node examples this packet makes playable
// (SKB-019): buildProjectData now auto-wraps a loose graph as one "Asset" SFX
// instrument instead of serializing zero instruments, so every one of those
// files now passes the editor gate outright and the entry pinning its FAILURE
// has nothing left to pin.
//
// With both lists empty, `isQuarantined` could only ever return `undefined` —
// a function with no reachable true branch is the same "second thing that can
// drift from reality" this repo deletes on sight rather than leaves as
// speculative scaffolding (see B6-2's own choice to delete PulsarBeam.json
// rather than quarantine an unfixable file forever). If a future example ever
// needs a pinned, known-broken allowlist again, reintroduce this shape from
// git history (see roadmap A5 / this comment in prior revisions) rather than
// resurrecting an empty one now — a quarantine list with zero entries and no
// caller is not "ready for later," it is untested until something is actually
// in it.
//
// Consequence: ROADMAP item B6-2-x1 ("generalise the hardcoded
// input_delayTime assertion before a second CLI_CODEGEN_FAILS entry is ever
// added") is now moot — there is no CLI_CODEGEN_FAILS left to add a second
// entry to.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Toolchain: the codegen binary the app spawns, and an Odin for `odin check`
// ---------------------------------------------------------------------------

/**
 * First Odin on this machine that answers `odin version`, resolved through the
 * app's own candidate list (`odinCandidates`) — the resolution order is stated
 * once, in the module the editor ships, exactly as RangeParity does it.
 */
export const resolveOdin = (repoRoot: string): string => {
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
            'The examples-corpus gate needs an Odin compiler and found none.',
            `Tried, in order: ${tried.join(', ')}`,
            '',
            'This gate builds skald_codegen.exe from source and runs `odin check` on',
            'every emitted package. Fixes: run scripts/setup-dev.ps1 to vendor the',
            'pinned toolchain into .tools/, install Odin on PATH, or set SKALD_ODIN.',
            '',
            'Do NOT make this gate skip instead: 101 examples shipped for months with',
            'nothing checking them and one of them hard-fails codegen in every packaged',
            'build (BUGS.md SKB-019). A gate that opts out without the toolchain opts',
            'out exactly in CI.',
        ].join('\n'),
    );
};

let cachedCodegenExe: string | null = null;

/**
 * Build skald_codegen.exe by the same path `npm start` takes
 * (scripts/ensure-codegen.mjs, roadmap A2), so the binary under test is the
 * binary the app spawns — never a stale copy. ~0.5 s; cached per process.
 */
export const buildCodegen = (repoRoot: string): string => {
    if (cachedCodegenExe) return cachedCodegenExe;
    const uiRoot = path.join(repoRoot, 'skald-ui');
    const result = spawnSync(
        process.execPath,
        [path.join(uiRoot, 'scripts', 'ensure-codegen.mjs'), '--required'],
        { cwd: uiRoot, encoding: 'utf8', timeout: 300_000 },
    );
    if (result.status !== 0) {
        throw new Error(
            `ensure-codegen.mjs --required failed (exit ${result.status}).\n` +
                `stdout:\n${result.stdout}\nstderr:\n${result.stderr}`,
        );
    }
    const exe = path.join(uiRoot, 'skald_codegen.exe');
    if (!fs.existsSync(exe)) {
        throw new Error(`ensure-codegen.mjs reported success but ${exe} does not exist.`);
    }
    cachedCodegenExe = exe;
    return exe;
};

export interface RunResult {
    status: number | null;
    stdout: string;
    stderr: string;
}

/**
 * The editor's invocation, exactly: project JSON on stdin, `-package:` and
 * `-out:` args (src/main.ts 'invoke-codegen' spawns with this shape).
 */
export const runCodegenStdin = (exe: string, projectJson: string, outPath: string): RunResult => {
    const r = spawnSync(exe, ['-package:generated_audio', `-out:${outPath}`], {
        input: projectJson,
        encoding: 'utf8',
        timeout: 120_000,
        maxBuffer: 64 * 1024 * 1024,
    });
    return { status: r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
};

/** The CLI invocation: `-in:<file>`, the path AUDIT.md certified the corpus through. */
export const runCodegenFile = (exe: string, inPath: string, outPath: string): RunResult => {
    const r = spawnSync(exe, [`-in:${inPath}`, '-package:generated_audio', `-out:${outPath}`], {
        encoding: 'utf8',
        timeout: 120_000,
        maxBuffer: 64 * 1024 * 1024,
    });
    return { status: r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
};

/** `odin check <pkgDir> -no-entry-point` — the emitted code must COMPILE, not just exist. */
export const odinCheck = (odin: string, pkgDir: string): RunResult => {
    const r = spawnSync(odin, ['check', pkgDir, '-no-entry-point'], {
        encoding: 'utf8',
        timeout: 300_000,
        maxBuffer: 64 * 1024 * 1024,
    });
    return { status: r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
};

// ---------------------------------------------------------------------------
// Session assertions — reading the emitted Odin.
//
// Both parsers THROW when their pattern is absent instead of returning
// "nothing to assert": if codegen's emission format changes, the session
// assertion must fail loudly, not evaporate (the vacuous-pass failure mode A8
// documented and guarded against).
// ---------------------------------------------------------------------------

/**
 * Every `p.bpm = <literal>` in the emitted code — one per generated asset's
 * `_init` (codegen.odin emits `p.bpm = %.9f`). All assets share the project
 * tempo, so all occurrences must agree; returns the single value.
 */
export const emittedBpm = (code: string, context: string): number => {
    const values = [...code.matchAll(/^\tp\.bpm = ([0-9]+\.[0-9]+)$/gm)].map((m) => Number(m[1]));
    if (values.length === 0) {
        throw new Error(
            `${context}: emitted code contains no "p.bpm = <literal>" line. Either codegen's ` +
                `emission format changed (update this parser) or no processor was generated — ` +
                `both mean the session assertion would silently stop asserting.`,
        );
    }
    const first = values[0];
    if (!values.every((v) => v === first)) {
        throw new Error(`${context}: emitted p.bpm values disagree across assets: ${values.join(', ')}`);
    }
    return first;
};

/**
 * The authored master volume as it reaches the emitted export.
 *
 * Since packet B1 the master volume is a runtime field rather than a literal
 * baked into the tanh: project_init emits `p.master_volume = <coeff>` and
 * project_process applies it with `mixed_left *= p.master_volume` into
 * `return skald_soft_limit(mixed_left, mixed_right)` (codegen.odin,
 * generate_project_code). Reading the init literal ALONE would not prove the
 * authored value reaches the export — a field nothing multiplies into the mix
 * is exactly the silent re-levelling this assertion exists to catch — so this
 * parser also requires the two application lines, and throws when any of the
 * three is missing. (The pre-B1 shape was
 * `mixed_left = math.tanh(mixed_left * <coeff>)`; the coefficient asserted
 * against the file's authored session.masterVolume is the same quantity in
 * both shapes, and SKB-004's authored-0 boundary is now representable: 0.0
 * here means a deliberately silent export, not "absent".)
 */
export const emittedMasterCoeff = (code: string, context: string): number => {
    const init = /^\tp\.master_volume = ([0-9]+\.[0-9]+)$/m.exec(code);
    if (!init) {
        throw new Error(
            `${context}: emitted code contains no "p.master_volume = <literal>" project_init line. ` +
                `Either codegen's emission format changed (update this parser) or the master ` +
                `volume was not generated — both must fail here, not skip.`,
        );
    }
    const applied =
        /^\tmixed_left \*= p\.master_volume$/m.test(code) &&
        /^\tmixed_right \*= p\.master_volume$/m.test(code) &&
        /^\treturn skald_soft_limit\(mixed_left, mixed_right\)$/m.test(code);
    if (!applied) {
        throw new Error(
            `${context}: project_init sets p.master_volume but project_process does not apply it ` +
                `through skald_soft_limit — the authored master volume no longer provably reaches ` +
                `the export. If codegen's composition changed shape, update this parser so the ` +
                `assertion keeps proving the full path, not just the init literal.`,
        );
    }
    return Number(init[1]);
};
