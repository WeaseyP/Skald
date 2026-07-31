/*
================================================================================
| FILE: skald-ui/src/main/odinToolchain.ts                                     |
|                                                                              |
| Works out which Odin compiler the live preview should build with.            |
| Extracted from main.ts so the resolution order can be tested without         |
| Electron, a real toolchain, or a real filesystem in the loop.                |
|                                                                              |
| Preview compiles Odin at run time, so "no compiler" means the product's      |
| central promise — hear it before you ship it — silently does nothing. The    |
| old resolver probed SKALD_ODIN, `odin` on PATH, and C:\Odin\odin.exe, and    |
| never looked at the toolchain THIS REPO VENDORS under .tools/ (downloaded    |
| by scripts/setup-dev.ps1). A developer who ran the documented setup and      |
| then opened the new shell the script tells them to open had no working       |
| preview, because setup-dev.ps1 only set SKALD_ODIN process-scoped and the    |
| resolver could not find the compiler sitting inside their own checkout.      |
| (SKB-057 / roadmap §3.12.)                                                   |
|                                                                              |
| Two other things live here for the same reason — they are all one decision:  |
|   * Negative results are cached with a short TTL and the probe is async.     |
|     A failed lookup used to re-spawn a synchronous `odin version` on every   |
|     single attempt, blocking the main process each time (F-B08-8 /           |
|     roadmap §6.24).                                                          |
|   * odinMissingMessage() is the one actionable failure text, shared by the   |
|     first-launch check and the preview IPC rejection, so both name the       |
|     vendored path and the SKALD_ODIN escape hatch instead of a bare          |
|     "compiler not found".                                                    |
================================================================================
*/
import path from 'node:path';
import fs from 'node:fs';
import { spawn } from 'node:child_process';

/** Repo-relative directory scripts/setup-dev.ps1 downloads the toolchain into. */
export const VENDORED_TOOLS_DIR = '.tools';

/**
 * Executable names to look for inside the vendored tree.
 *
 * Both spellings are probed rather than branching on `process.platform`: the
 * probe is a cheap `isFile` and this keeps the resolver a pure function of its
 * injected probes, which is the whole point of the split.
 */
export const ODIN_EXE_NAMES = ['odin.exe', 'odin'];

/**
 * How deep under `.tools/` to look for the executable.
 *
 * The real layout is
 * `.tools/odin-dev-2025-02/odin-windows-amd64-dev-2025-02/odin.exe` — two
 * levels — but the version directory names come from setup-dev.ps1's
 * `$OdinVersion` and from whatever the release zip happens to unpack as, so
 * nothing here hardcodes `odin-dev-2025-02`. Three levels covers the current
 * layout plus one of slack, and bounds the walk so a stray deep directory
 * cannot turn startup into a full-disk crawl.
 */
export const VENDORED_SEARCH_DEPTH = 3;

/** `odin` resolved through PATH. */
export const PATH_ODIN = 'odin';

/** The conventional Windows install location, probed last. */
export const CONVENTIONAL_ODIN = 'C:\\Odin\\odin.exe';

/**
 * How long a "no Odin anywhere" answer is trusted before re-probing.
 *
 * Short on purpose: a developer who installs Odin (or runs setup-dev.ps1)
 * while the editor is open should get a working preview within one coffee sip,
 * not after a restart. 30s costs at most one wasted probe every 30s along a
 * path that is already broken, and eliminates the per-attempt spawn storm.
 */
export const NEGATIVE_CACHE_TTL_MS = 30_000;

/** Everything about the host that toolchain resolution depends on. */
export interface OdinPathEnv {
    /** `app.getAppPath()` — the skald-ui project dir in dev, inside app.asar when packaged. */
    appPath: string;
    /** `process.resourcesPath` — where extraResource files land in a packaged build. */
    resourcesPath?: string;
    /** `app.isPackaged`. */
    isPackaged: boolean;
    /** `SKALD_ODIN` — explicit override, wins over everything. */
    envOverride?: string;
}

/** Injectable probes, so tests need no real toolchain and no real directories. */
export interface OdinToolchainProbes {
    /** Immediate subdirectory NAMES of `p`; `[]` when `p` is not a directory. */
    listDirectories: (p: string) => string[];
    isFile: (p: string) => boolean;
    /**
     * Does `<command> version` exit 0?
     *
     * Async by contract: this is a process spawn, and the synchronous version
     * of it blocked the main process — i.e. froze the whole editor window —
     * once per preview attempt on any machine without Odin.
     */
    canRun: (command: string) => Promise<boolean>;
}

/** How long a single `odin version` probe is allowed to take. */
export const PROBE_TIMEOUT_MS = 10_000;

export const realProbes: OdinToolchainProbes = {
    listDirectories: (p) => {
        try {
            return fs
                .readdirSync(p, { withFileTypes: true })
                .filter((e) => e.isDirectory())
                .map((e) => e.name);
        } catch {
            return [];
        }
    },
    isFile: (p) => {
        try {
            return fs.statSync(p).isFile();
        } catch {
            return false;
        }
    },
    canRun: (command) =>
        new Promise<boolean>((resolve) => {
            let settled = false;
            const done = (ok: boolean) => {
                if (settled) return;
                settled = true;
                resolve(ok);
            };
            try {
                const child = spawn(command, ['version'], { windowsHide: true });
                const timer = setTimeout(() => {
                    child.kill();
                    done(false);
                }, PROBE_TIMEOUT_MS);
                // stdout/stderr are drained and discarded: an unread pipe can
                // fill and wedge the child, which is exactly the hang this
                // timeout exists to avoid.
                child.stdout?.resume();
                child.stderr?.resume();
                child.on('error', () => {
                    clearTimeout(timer);
                    done(false);
                });
                child.on('close', (code) => {
                    clearTimeout(timer);
                    done(code === 0);
                });
            } catch {
                done(false);
            }
        }),
};

/**
 * Every place a vendored `.tools/` tree could plausibly live, best first.
 *
 * Dev runs from the repo, where `appPath` is `Skald/skald-ui` and `.tools`
 * sits one level up (setup-dev.ps1 puts it at the repo root). `appPath/.tools`
 * covers anyone who unpacked a toolchain inside skald-ui itself. Packaged
 * builds look under `process.resourcesPath` first, so that bundling the
 * toolchain later — should that decision be revisited — needs no code change
 * here; see the note in forge.config.ts for why it is not bundled today.
 */
export const vendoredToolsRoots = (env: OdinPathEnv): string[] => {
    const out: string[] = [];
    if (env.isPackaged && env.resourcesPath) out.push(path.join(env.resourcesPath, VENDORED_TOOLS_DIR));
    out.push(path.join(env.appPath, '..', VENDORED_TOOLS_DIR));
    out.push(path.join(env.appPath, VENDORED_TOOLS_DIR));
    if (!env.isPackaged && env.resourcesPath) out.push(path.join(env.resourcesPath, VENDORED_TOOLS_DIR));
    return out;
};

/**
 * The vendored root a human should be told about: the repo-root `.tools/`
 * in dev, the resources copy when packaged. Used by the failure message, so
 * it must return a path even when nothing is there.
 */
export const expectedVendoredRoot = (env: OdinPathEnv): string =>
    path.resolve(vendoredToolsRoots(env)[0]);

/**
 * Depth-bounded search for an odin executable under `root`.
 *
 * Subdirectories are walked in DESCENDING name order, which makes the result
 * deterministic and — because the version directories are named
 * `odin-<version>` with dated `dev-YYYY-MM` versions — picks the newest
 * vendored toolchain when a checkout has accumulated several.
 */
export const findOdinUnder = (
    root: string,
    probes: OdinToolchainProbes = realProbes,
    depth: number = VENDORED_SEARCH_DEPTH,
): string | null => {
    for (const name of ODIN_EXE_NAMES) {
        const candidate = path.join(root, name);
        if (probes.isFile(candidate)) return path.resolve(candidate);
    }
    if (depth <= 0) return null;
    const children = [...probes.listDirectories(root)].sort().reverse();
    for (const child of children) {
        const hit = findOdinUnder(path.join(root, child), probes, depth - 1);
        if (hit) return hit;
    }
    return null;
};

/** The vendored toolchain, or null if this checkout has never run setup-dev.ps1. */
export const findVendoredOdin = (
    env: OdinPathEnv,
    probes: OdinToolchainProbes = realProbes,
): string | null => {
    for (const root of vendoredToolsRoots(env)) {
        const hit = findOdinUnder(root, probes);
        if (hit) return hit;
    }
    return null;
};

/**
 * Candidate compilers in the order they should be tried.
 *
 * `SKALD_ODIN` first (an explicit choice always wins), then the toolchain the
 * repo vendors, then PATH, then the conventional install location. The
 * vendored copy deliberately outranks PATH: it is the version setup-dev.ps1
 * pinned and the one CI builds with, so a developer with some other Odin on
 * PATH still previews against the pinned compiler rather than silently
 * building with a different one.
 */
export const odinCandidates = (
    env: OdinPathEnv,
    probes: OdinToolchainProbes = realProbes,
): string[] => {
    const out: string[] = [];
    if (env.envOverride) out.push(env.envOverride);
    const vendored = findVendoredOdin(env, probes);
    if (vendored) out.push(vendored);
    out.push(PATH_ODIN);
    out.push(CONVENTIONAL_ODIN);
    return out;
};

/** First candidate that actually runs, or null if this machine has no Odin. */
export const resolveOdin = async (
    env: OdinPathEnv,
    probes: OdinToolchainProbes = realProbes,
): Promise<string | null> => {
    for (const candidate of odinCandidates(env, probes)) {
        if (await probes.canRun(candidate)) return candidate;
    }
    return null;
};

/**
 * The single actionable "no compiler" message.
 *
 * Named paths, in probe order, plus the two ways out. The old text said
 * "install Odin or set SKALD_ODIN" and never mentioned that the repo ships a
 * toolchain and a script that downloads it — so the fix nearest to hand was
 * the one thing the error did not name.
 */
export const odinMissingMessage = (env: OdinPathEnv): string => {
    const lines = [
        'Odin compiler not found, so audio preview is unavailable.',
        'Play compiles your patch to WebAssembly, so nothing sounds until one of these resolves:',
        '',
        `  1. SKALD_ODIN                ${env.envOverride ? `set, but "${env.envOverride}" did not run` : 'not set'}`,
        `  2. vendored toolchain        ${path.join(expectedVendoredRoot(env), '**', 'odin.exe')}`,
        `  3. odin on PATH              ${PATH_ODIN}`,
        `  4. conventional install      ${CONVENTIONAL_ODIN}`,
        '',
    ];
    if (env.isPackaged) {
        lines.push(
            'This installer does not bundle an Odin toolchain. Install Odin from',
            'https://odin-lang.org and either add it to PATH or set the SKALD_ODIN',
            'environment variable to the full path of odin.exe, then restart Skald.',
            '',
            'Everything except preview — editing, Generate Code, save and load — works',
            'without a compiler.',
        );
    } else {
        lines.push(
            'Run scripts/setup-dev.ps1 from the repo root: it downloads the pinned Odin',
            'toolchain into .tools/ and persists SKALD_ODIN for your user account. Or',
            'install Odin from https://odin-lang.org, add it to PATH, and restart Skald.',
        );
    }
    return lines.join('\n');
};

/** A resolver that remembers what it found (and, briefly, what it did not). */
export interface OdinResolver {
    /** The compiler to build with, or null. Never spawns more than one probe sweep at a time. */
    resolve: () => Promise<string | null>;
    /** Forget everything — for tests, and for any future "re-check now" affordance. */
    reset: () => void;
}

/**
 * Memoising resolver.
 *
 * A hit is cached for the life of the process: the compiler does not move.
 * A miss is cached for NEGATIVE_CACHE_TTL_MS only, because a miss is a state
 * the user is actively trying to fix. Concurrent calls share one sweep, so a
 * first-launch check overlapping the first Play does not double the spawns.
 */
export const createOdinResolver = (
    readEnv: () => OdinPathEnv,
    probes: OdinToolchainProbes = realProbes,
    now: () => number = Date.now,
): OdinResolver => {
    let found: string | null = null;
    let missedAt: number | null = null;
    let inFlight: Promise<string | null> | null = null;

    const resolve = (): Promise<string | null> => {
        if (found !== null) return Promise.resolve(found);
        if (missedAt !== null && now() - missedAt < NEGATIVE_CACHE_TTL_MS) {
            return Promise.resolve(null);
        }
        if (inFlight) return inFlight;
        inFlight = resolveOdin(readEnv(), probes)
            .then((result) => {
                if (result) {
                    found = result;
                    missedAt = null;
                } else {
                    missedAt = now();
                }
                return result;
            })
            .finally(() => {
                inFlight = null;
            });
        return inFlight;
    };

    return {
        resolve,
        reset: () => {
            found = null;
            missedAt = null;
            inFlight = null;
        },
    };
};
