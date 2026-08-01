/*
================================================================================
| FILE: skald-ui/src/main/codegenStamp.ts                                      |
|                                                                              |
| The editor half of the codegen provenance handshake (roadmap packet A2 /      |
| BUGS.md SKB-001). Extracted from main.ts so it can be tested without         |
| Electron, without a compiler, and without a real filesystem.                 |
|                                                                              |
| WHAT WENT WRONG. `skald-ui/skald_codegen.exe` used to be tracked in git, and  |
| it is the binary the app spawns for both preview and Generate. It fell nine   |
| backend commits behind its own sources, and nothing said so: it predated the  |
| `"<nodeId>::<param>"` set_param alias the preview addresses every knob by, so |
| in a fresh clone dragging an exposed parameter did nothing at all, while CI   |
| went green against a compiler built from source that no user ever ran.        |
|                                                                              |
| WHAT THIS DOES. `skald_codegen.exe -version` prints a content-derived stamp:  |
| an FNV-1a digest of the exact bytes of every backend source file it was       |
| compiled from (`#load`-embedded at build time — see skald-backend/main.odin). |
| This module recomputes that digest from the files on disk and compares. On    |
| mismatch the spawn is REFUSED, and the refusal text is the error the renderer |
| turns into the on-canvas banner, so the fix (`npm run build:codegen`) is in   |
| the message rather than in a console nobody has open.                         |
|                                                                              |
| WHY A DIGEST AND NOT A VERSION NUMBER. A hand-bumped constant would have read |
| "0.1.0" through all nine stale commits and certified them as current: the     |
| defect is drift nobody noticed, so the identity has to be something no one    |
| can forget to update. A git hash was rejected too — it identifies a commit,   |
| not a build, and builds here routinely come from a dirty tree (SKB-000).      |
|                                                                              |
| HONEST LIMITS, stated because a check that overstates itself is worse than    |
| none:                                                                         |
|   * A packaged install ships no backend sources, so there is nothing to       |
|     compare against. There the handshake degrades to "the binary must answer  |
|     -version with a stamp this app understands" — which still catches a       |
|     pre-A2 binary, a truncated copy, and a wrong-arch exe, but cannot prove   |
|     freshness. `verified: false` says so instead of pretending.               |
|   * The embedded file list in main.odin is hand-written, so a NEW backend     |
|     source is outside the digest until it is listed. That is reported here as |
|     a warning (refusing would leave a contributor with an app that cannot be  |
|     un-stuck by rebuilding) and is a hard failure in CI, which is where a     |
|     hole in the gate belongs.                                                 |
================================================================================
*/
import path from 'node:path';
import fs from 'node:fs';
import { spawn } from 'node:child_process';

/**
 * Output-format version of the `-version` stamp, matching `STAMP_FORMAT` in
 * skald-backend/main.odin.
 *
 * A mismatch is treated as a stale binary rather than a parse problem: in dev
 * the exe and this file come from the same checkout, so if the formats disagree
 * one of them is old — which is precisely the condition being detected.
 */
export const STAMP_FORMAT = 1;

/** Algorithm label the backend prints in front of every digest. */
export const DIGEST_LABEL = 'fnv1a64';

/** How long the `-version` probe is allowed to take. */
export const STAMP_PROBE_TIMEOUT_MS = 10_000;

const FNV1A64_OFFSET = 0xcbf29ce484222325n;
const FNV1A64_PRIME = 0x100000001b3n;
const U64_MASK = 0xffffffffffffffffn;

/**
 * FNV-1a, 64-bit, streamable via `seed` — the same three lines as
 * `fnv1a64` in skald-backend/main.odin, and that duplication is the point:
 * two independent implementations of a trivial algorithm are how one side can
 * check the other. BigInt keeps the 64-bit wrap exact; the inputs are a few
 * hundred KB of Odin source, which is nothing next to spawning a compiler.
 */
export const fnv1a64 = (data: Uint8Array, seed: bigint = FNV1A64_OFFSET): bigint => {
    let h = seed;
    for (const b of data) {
        h = (h ^ BigInt(b)) & U64_MASK;
        h = (h * FNV1A64_PRIME) & U64_MASK;
    }
    return h;
};

/** `fnv1a64:<16 lowercase hex>` — the exact spelling the backend prints. */
export const digestString = (value: bigint): string =>
    `${DIGEST_LABEL}:${value.toString(16).padStart(16, '0')}`;

/** One backend source file, as the digest sees it. */
export interface SourceBytes {
    /** Path relative to skald-backend/, forward slashes (as the stamp prints it). */
    path: string;
    bytes: Uint8Array;
}

/**
 * Combined digest over every source in order: path, NUL, contents, NUL.
 * Mirrors `source_digest` in skald-backend/main.odin. Paths and separators are
 * in the stream so a rename, or bytes moving between two files, changes it.
 */
export const combinedDigest = (sources: SourceBytes[]): string => {
    const nul = new Uint8Array([0]);
    let h = FNV1A64_OFFSET;
    for (const src of sources) {
        h = fnv1a64(new TextEncoder().encode(src.path), h);
        h = fnv1a64(nul, h);
        h = fnv1a64(src.bytes, h);
        h = fnv1a64(nul, h);
    }
    return digestString(h);
};

/** A parsed `-version` stamp. */
export interface CodegenStamp {
    format: number;
    /** Odin release the binary was compiled with; informational only. */
    odinVersion: string | null;
    /** Combined digest, `fnv1a64:...`. */
    digest: string;
    /** Per-file digests, in the order the binary embedded them. */
    files: { path: string; digest: string }[];
}

/**
 * Parse `skald_codegen -version` output. Returns null for anything that is not
 * a stamp — which is the interesting case, because a binary predating this
 * contract ignores the flag, tries to read stdin, and fails with a JSON parse
 * error instead.
 */
export const parseStamp = (stdout: string): CodegenStamp | null => {
    if (!/^\s*skald_codegen\s*$/m.test(stdout)) return null;
    const value = (key: string): string | null => {
        const m = new RegExp(`^${key}:[ \\t]*(.+)$`, 'm').exec(stdout);
        return m ? m[1].trim() : null;
    };
    const digest = value('source-digest');
    const format = value('stamp-format');
    if (!digest || !format) return null;
    const files: { path: string; digest: string }[] = [];
    const fileLine = /^source-file:[ \t]*(\S+)[ \t]+(.+)$/gm;
    for (let m = fileLine.exec(stdout); m; m = fileLine.exec(stdout)) {
        files.push({ digest: m[1], path: m[2].trim() });
    }
    return {
        format: Number.parseInt(format, 10),
        odinVersion: value('odin-version'),
        digest,
        files,
    };
};

/** Injectable side effects, so tests describe a machine instead of being one. */
export interface CodegenStampProbes {
    /** `<exe> -version` stdout, or null if it could not run or exited non-zero. */
    runVersion: (exePath: string) => Promise<string | null>;
    /** Raw bytes of a file, or null if unreadable. Must NOT transcode. */
    readBytes: (absPath: string) => Uint8Array | null;
    /** `mtimeMs:size` for the exe, or null if absent — the cache key. */
    fileIdentity: (absPath: string) => string | null;
    /**
     * Backend source files present in `backendDir`, as paths relative to it
     * with forward slashes. Used only to report files the stamp does not cover.
     */
    listBackendSources: (backendDir: string) => string[];
}

export const realStampProbes: CodegenStampProbes = {
    runVersion: (exePath) =>
        new Promise<string | null>((resolve) => {
            let settled = false;
            const done = (out: string | null) => {
                if (settled) return;
                settled = true;
                resolve(out);
            };
            try {
                const child = spawn(exePath, ['-version'], { windowsHide: true });
                let stdout = '';
                const timer = setTimeout(() => {
                    child.kill();
                    done(null);
                }, STAMP_PROBE_TIMEOUT_MS);
                child.stdout?.on('data', (d) => { stdout += String(d); });
                child.stderr?.resume();
                child.on('error', () => { clearTimeout(timer); done(null); });
                child.on('close', (code) => {
                    clearTimeout(timer);
                    done(code === 0 ? stdout : null);
                });
                // Closing stdin matters: a pre-A2 binary ignores -version and
                // blocks reading stdin forever otherwise.
                child.stdin?.end();
            } catch {
                done(null);
            }
        }),
    readBytes: (absPath) => {
        try {
            return new Uint8Array(fs.readFileSync(absPath));
        } catch {
            return null;
        }
    },
    fileIdentity: (absPath) => {
        try {
            const st = fs.statSync(absPath);
            return `${st.mtimeMs}:${st.size}`;
        } catch {
            return null;
        }
    },
    listBackendSources: (backendDir) => {
        const out: string[] = [];
        try {
            if (fs.statSync(path.join(backendDir, 'main.odin')).isFile()) out.push('main.odin');
        } catch {
            return out;
        }
        try {
            for (const entry of fs.readdirSync(path.join(backendDir, 'core'))) {
                if (entry.endsWith('.odin')) out.push(`core/${entry}`);
            }
        } catch {
            // No core/ directory: an incomplete checkout. The digest comparison
            // reports that far better than this listing can.
        }
        return out;
    },
};

/** Where the exe and (in dev) its sources live. */
export interface CodegenStampEnv {
    /** Absolute path of the codegen executable the app spawns. */
    exePath: string;
    /**
     * Absolute path of skald-backend/, or null when it is not on this machine
     * (a packaged install). Null degrades the check to "answers -version",
     * reported as `verified: false`.
     */
    backendDir: string | null;
}

export type StampFailure =
    /** No parseable stamp: missing exe, or a binary predating this contract. */
    | 'no-stamp'
    /** Stamp format this app does not understand — the checkout is mixed. */
    | 'bad-format'
    /** A file the binary embedded is not readable in the tree. */
    | 'missing-source'
    /** The binary was built from different bytes than the tree holds. */
    | 'stale-binary';

export interface CodegenProvenanceOk {
    ok: true;
    stamp: CodegenStamp;
    /** True only when the digest was actually compared against real sources. */
    verified: boolean;
    /** Backend sources the stamp does not cover (see the header note). */
    uncovered: string[];
    /** Non-blocking note worth logging, if any. */
    note?: string;
}

export interface CodegenProvenanceFailed {
    ok: false;
    reason: StampFailure;
    /** The user-facing text. Multi-line; the banner renders pre-wrap. */
    message: string;
    /** Files whose digests disagreed, for tests and logs. */
    drifted: string[];
}

export type CodegenProvenance = CodegenProvenanceOk | CodegenProvenanceFailed;

const REBUILD_HINT = [
    'Rebuild it and restart Skald:',
    '',
    '    cd skald-ui',
    '    npm run build:codegen        (or: npm run start:rebuild)',
    '',
    '`npm start` and `npm run make` now build it for you — this binary is no',
    'longer committed to git, precisely so it cannot go stale unnoticed.',
];

const failure = (reason: StampFailure, headline: string[], drifted: string[] = []): CodegenProvenanceFailed => ({
    ok: false,
    reason,
    message: [...headline, '', ...REBUILD_HINT].join('\n'),
    drifted,
});

/**
 * Compare the binary's stamp against the sources in the tree.
 *
 * Refuses on mismatch rather than warning: a stale compiler produces code that
 * looks right and behaves wrong (silent no-op knobs, a re-introduced
 * voice-steal click), which is the failure shape that cost the most trust.
 */
export const checkCodegenProvenance = async (
    env: CodegenStampEnv,
    probes: CodegenStampProbes = realStampProbes,
): Promise<CodegenProvenance> => {
    const stdout = await probes.runVersion(env.exePath);
    const stamp = stdout === null ? null : parseStamp(stdout);
    if (!stamp) {
        return failure('no-stamp', [
            'The Skald code generator could not identify itself, so it will not be used.',
            '',
            `    ${env.exePath}`,
            '',
            stdout === null
                ? 'It did not run, or exited with an error, when asked for its version.'
                : 'It answered, but not with a provenance stamp — it predates the version',
            stdout === null
                ? 'That usually means the file is missing, or is not a Skald codegen build.'
                : 'handshake, so it is at least as old as roadmap packet A2.',
        ]);
    }

    if (stamp.format !== STAMP_FORMAT) {
        return failure('bad-format', [
            'The Skald code generator reports a provenance stamp this build does not',
            `understand (format ${stamp.format}; expected ${STAMP_FORMAT}), so it will not be used.`,
            '',
            'The editor and the generator come from the same checkout, so one of the',
            'two is out of date.',
        ]);
    }

    if (!env.backendDir) {
        // Packaged: no sources to compare against. Say what was and was not
        // established rather than implying a freshness guarantee.
        return {
            ok: true,
            stamp,
            verified: false,
            uncovered: [],
            note:
                'Codegen provenance: stamp present and readable, but the backend sources are ' +
                'not part of this install, so freshness could not be verified.',
        };
    }

    const sources: SourceBytes[] = [];
    const drifted: string[] = [];
    const missing: string[] = [];
    for (const file of stamp.files) {
        const bytes = probes.readBytes(path.join(env.backendDir, ...file.path.split('/')));
        if (!bytes) {
            missing.push(file.path);
            continue;
        }
        sources.push({ path: file.path, bytes });
        if (digestString(fnv1a64(bytes)) !== file.digest) drifted.push(file.path);
    }

    if (missing.length > 0) {
        return failure(
            'missing-source',
            [
                'The Skald code generator was built from backend sources this checkout does',
                'not have, so it will not be used. Missing under skald-backend/:',
                '',
                ...missing.map((f) => `    ${f}`),
            ],
            drifted,
        );
    }

    const actual = combinedDigest(sources);
    if (actual !== stamp.digest || drifted.length > 0) {
        return failure(
            'stale-binary',
            [
                'The Skald code generator is out of date: it was built from different backend',
                'sources than this checkout contains, so generating or previewing with it',
                'would produce code that does not match the current compiler.',
                '',
                drifted.length > 0
                    ? 'Changed since it was built:'
                    : 'The file list itself changed since it was built.',
                ...drifted.map((f) => `    skald-backend/${f}`),
                '',
                `    binary: ${stamp.digest}`,
                `    tree:   ${actual}`,
            ],
            drifted,
        );
    }

    // Covered-set check. Not a refusal: the fix lives in the backend's own
    // #load list, so refusing here would leave a rebuild unable to clear it.
    const covered = new Set(stamp.files.map((f) => f.path));
    const uncovered = probes.listBackendSources(env.backendDir).filter((f) => !covered.has(f));
    return {
        ok: true,
        stamp,
        verified: true,
        uncovered,
        note:
            uncovered.length > 0
                ? 'Codegen provenance verified, but these backend sources are OUTSIDE the ' +
                  `stamp and so cannot be checked for drift: ${uncovered.join(', ')}. ` +
                  'Add them to CODEGEN_SOURCES in skald-backend/main.odin (CI fails on this).'
                : undefined,
    };
};

/** Memoising guard around {@link checkCodegenProvenance}. */
export interface CodegenGuard {
    /** Current verdict. The `-version` spawn is reused while the exe is unchanged. */
    check: () => Promise<CodegenProvenance>;
    /** Throws the refusal message when the binary must not be spawned. */
    assertUsable: () => Promise<void>;
    /** Forget the cached stamp (tests, and any future "re-check now" affordance). */
    reset: () => void;
}

/**
 * The stamp is cached against the exe's mtime+size, so a rebuild is picked up
 * without a restart and an unchanged binary is not re-probed on every preview.
 * The SOURCE digests are recomputed on every call: editing a backend file
 * without rebuilding is the exact drift this exists to catch, and reading a few
 * hundred KB is free next to the compiler spawn that follows.
 */
export const createCodegenGuard = (
    readEnv: () => CodegenStampEnv,
    probes: CodegenStampProbes = realStampProbes,
): CodegenGuard => {
    let cachedIdentity: string | null = null;
    let cachedStdout: string | null = null;
    let inFlight: Promise<CodegenProvenance> | null = null;

    const cachingProbes: CodegenStampProbes = {
        ...probes,
        runVersion: async (exePath) => {
            const identity = probes.fileIdentity(exePath);
            if (identity !== null && identity === cachedIdentity) return cachedStdout;
            const stdout = await probes.runVersion(exePath);
            cachedIdentity = identity;
            cachedStdout = stdout;
            return stdout;
        },
    };

    const check = (): Promise<CodegenProvenance> => {
        if (inFlight) return inFlight;
        inFlight = checkCodegenProvenance(readEnv(), cachingProbes).finally(() => {
            inFlight = null;
        });
        return inFlight;
    };

    return {
        check,
        assertUsable: async () => {
            const verdict = await check();
            if (!verdict.ok) throw new Error(verdict.message);
        },
        reset: () => {
            cachedIdentity = null;
            cachedStdout = null;
            inFlight = null;
        },
    };
};
