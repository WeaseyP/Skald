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
| `.json` files — including `archive/PulsarBeam.json`, the one file known to   |
| fail codegen. A gate that passes while missing the one thing it exists to    |
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
// Quarantine — the explicit allowlist of known-broken examples.
//
// Rules (roadmap A5): every entry names the file, the symptom, and the packet
// that owns the real fix. The gate FAILS when a quarantined file starts
// passing (the entry must then be deleted — the list cannot rot) and FAILS
// when a quarantined file no longer exists (same reason).
// ---------------------------------------------------------------------------

export interface QuarantineEntry {
    rel: string;
    symptom: string;
    owner: string;
}

/**
 * Files that cannot be played or generated from the editor because they carry
 * no Instrument node: `buildProjectData` emits instruments only from
 * Instrument nodes, so these serialize to a zero-instrument project the
 * backend rejects ("Input JSON must be valid Project or Graph", exit 1).
 * This is BUGS.md SKB-019 (26 unplayable = these 25 + the project-shaped
 * integration-demo file, which the editor rejects at parse). The editor gate
 * pins the failure; the CLI gate still fully covers these files, because the
 * CLI's legacy fallback wraps a loose graph as a single "Asset" SFX.
 *
 * Owner: packet B6 (auto-wrap loose graphs on load/Play). When B6 lands, every
 * one of these starts generating through the editor path, this gate goes red
 * on "quarantined file passes", and the list gets deleted with the packet.
 */
export const EDITOR_UNPLAYABLE: QuarantineEntry[] = [
    'examples/archive/AlarmPulse.json',
    'examples/archive/PulsarBeam.json',
    'examples/archive/Sax2.json',
    'examples/instruments/bass/lfo-filter-wobble-bass.skald.json',
    'examples/instruments/bass/sine-sub-bass.skald.json',
    'examples/instruments/drums/acoustic-electric/Cowbell.json',
    'examples/instruments/drums/acoustic-electric/CyberCymbal.json',
    'examples/instruments/drums/acoustic-electric/HiHat.json',
    'examples/instruments/drums/acoustic-electric/KickDrum.json',
    'examples/instruments/drums/acoustic-electric/SnareDrum.json',
    'examples/instruments/keys/fm-bell-tone.skald.json',
    'examples/instruments/keys/piano-and-keys/MellowElectricPiano.json',
    'examples/instruments/keys/piano-and-keys/PianoChord.json',
    'examples/instruments/leads/saw-lead.skald.json',
    'examples/instruments/pads/ambient-reverb-pad.skald.json',
    'examples/instruments/pads/complex-drone-machine.skald.json',
    'examples/instruments/pads/pwm-pad.skald.json',
    'examples/sound-effects/cosmic/AlienChatter.json',
    'examples/sound-effects/cosmic/BlackHoleDrone.json',
    'examples/sound-effects/cosmic/WarpDrive.json',
    'examples/sound-effects/impacts/percussive-high-pass-hit.skald.json',
    'examples/sound-effects/synth/LaserPew.json',
    'examples/sound-effects/synth/PowerUp.json',
    'examples/sound-effects/synth/band-pass-filter-sweep.skald.json',
    'examples/sound-effects/synth/classic-delay-puck.skald.json',
].map((rel) => ({
    rel,
    symptom:
        'no Instrument node: Play refuses it and Generate serializes a zero-instrument ' +
        'project the backend rejects (SKB-019)',
    owner: 'B6 (auto-wrap loose graphs on load/Play)',
}));

/**
 * Files whose CLI-path codegen is expected to FAIL (non-zero exit).
 *
 * PulsarBeam wires an LFO ("Doppler Shift") into `input_delayTime` on a Delay
 * node. That is not a legacy port spelling `normalize_port` should map — the
 * Delay node has never had a modulation input in any version in this repo's
 * history (`graph_validate.odin` lists only "input" for Delay), so the bug is
 * in the FILE: a placeholder for an unimplemented feature, per its own adding
 * commit ("some need work"). The fix is not an unambiguous data correction —
 * dropping the wire would silence the patch's whole reason for existing — so
 * it is quarantined, not edited.
 *
 * Owner: packet B6, which deletes PulsarBeam.json and excludes archive/ from
 * packaging. If this file ever starts PASSING codegen (someone adds Delay-time
 * modulation, or "fixes" the file), the gate fails and this entry must go.
 */
export const CLI_CODEGEN_FAILS: QuarantineEntry[] = [
    {
        rel: 'examples/archive/PulsarBeam.json',
        symptom: 'exit 1: connection into Delay uses unknown input port "input_delayTime"',
        owner: 'B6 (delete PulsarBeam.json; archive/ excluded from packaging)',
    },
];

export const isQuarantined = (list: QuarantineEntry[], rel: string): QuarantineEntry | undefined =>
    list.find((q) => q.rel === rel);

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
 * The master-volume coefficient inside the soft-limit tanh
 * (`mixed_left = math.tanh(mixed_left * <coeff>)`, codegen.odin).
 */
export const emittedMasterCoeff = (code: string, context: string): number => {
    const m = /^\tmixed_left = math\.tanh\(mixed_left \* ([0-9]+\.[0-9]+)\)$/m.exec(code);
    if (!m) {
        throw new Error(
            `${context}: emitted code contains no master "math.tanh(mixed_left * <coeff>)" line. ` +
                `Either codegen's emission format changed (update this parser) or the master ` +
                `soft-limit was not generated — both must fail here, not skip.`,
        );
    }
    return Number(m[1]);
};
