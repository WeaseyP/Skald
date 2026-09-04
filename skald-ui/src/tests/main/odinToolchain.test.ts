// @vitest-environment node
import { describe, it, expect, vi } from 'vitest';
import path from 'node:path';
import {
    CONVENTIONAL_ODIN,
    NEGATIVE_CACHE_TTL_MS,
    OdinPathEnv,
    OdinToolchainProbes,
    PATH_ODIN,
    createOdinResolver,
    expectedVendoredRoot,
    findVendoredOdin,
    odinCandidates,
    odinMissingMessage,
    resolveOdin,
} from '../../main/odinToolchain';

// Toolchain resolution only — no Electron, no real compiler, no real
// directories. Both the filesystem walk and the `odin version` spawn are
// injected, so a test can describe any machine (fresh checkout, post-setup
// checkout, packaged install, machine with no Odin at all) without being one.

/**
 * Probes over a virtual filesystem described as a flat list of file paths.
 * Directories are inferred from the files, which is how the real tree behaves
 * and keeps the fixtures to one line each.
 */
const fsProbes = (files: string[], runnable: string[] = files): OdinToolchainProbes => {
    const norm = (p: string) => path.resolve(p).toLowerCase();
    const fileSet = new Set(files.map(norm));
    return {
        isFile: (p) => fileSet.has(norm(p)),
        listDirectories: (p) => {
            const prefix = norm(p) + path.sep;
            const names = new Set<string>();
            for (const f of files) {
                const full = norm(f);
                if (!full.startsWith(prefix)) continue;
                const rest = full.slice(prefix.length).split(path.sep);
                if (rest.length > 1) names.add(rest[0]);
            }
            return [...names];
        },
        canRun: (cmd) => Promise.resolve(runnable.some((r) => norm(r) === norm(cmd))),
    };
};

const DEV: OdinPathEnv = {
    appPath: 'C:/repo/Skald/skald-ui',
    resourcesPath: 'C:/repo/Skald/skald-ui/node_modules/electron/dist/resources',
    isPackaged: false,
};

const PACKAGED: OdinPathEnv = {
    appPath: 'C:/Program Files/Skald/resources/app.asar',
    resourcesPath: 'C:/Program Files/Skald/resources',
    isPackaged: true,
};

// The real vendored layout: two levels under .tools, version-named both times.
const VENDORED = 'C:/repo/Skald/.tools/odin-dev-2025-02/odin-windows-amd64-dev-2025-02/odin.exe';
const VENDORED_OLD = 'C:/repo/Skald/.tools/odin-dev-2024-11/odin-windows-amd64-dev-2024-11/odin.exe';
const PACKAGED_VENDORED =
    'C:/Program Files/Skald/resources/.tools/odin-dev-2025-02/odin-windows-amd64-dev-2025-02/odin.exe';

const R = (p: string) => path.resolve(p);

describe('findVendoredOdin', () => {
    it('finds the toolchain setup-dev.ps1 unpacked at the repo root', () => {
        expect(findVendoredOdin(DEV, fsProbes([VENDORED]))).toBe(R(VENDORED));
    });

    it('does not hardcode the version directory name', () => {
        // The version dir comes from setup-dev.ps1's $OdinVersion and from
        // whatever the release zip unpacks as; bumping it must not need a code
        // change here.
        const future = 'C:/repo/Skald/.tools/odin-dev-2099-12/odin-windows-amd64-dev-2099-12/odin.exe';
        expect(findVendoredOdin(DEV, fsProbes([future]))).toBe(R(future));
    });

    it('picks the newest version directory when a checkout has several', () => {
        expect(findVendoredOdin(DEV, fsProbes([VENDORED_OLD, VENDORED]))).toBe(R(VENDORED));
    });

    it('finds a toolchain sitting directly in .tools', () => {
        const flat = 'C:/repo/Skald/.tools/odin.exe';
        expect(findVendoredOdin(DEV, fsProbes([flat]))).toBe(R(flat));
    });

    it('looks under resourcesPath in a packaged build', () => {
        expect(findVendoredOdin(PACKAGED, fsProbes([PACKAGED_VENDORED]))).toBe(R(PACKAGED_VENDORED));
    });

    it('returns null on a checkout that has never run setup-dev.ps1', () => {
        expect(findVendoredOdin(DEV, fsProbes([]))).toBeNull();
    });

    it('does not descend past the bounded search depth', () => {
        const tooDeep = 'C:/repo/Skald/.tools/a/b/c/d/e/odin.exe';
        expect(findVendoredOdin(DEV, fsProbes([tooDeep]))).toBeNull();
    });
});

describe('odinCandidates — probe order', () => {
    it('is SKALD_ODIN, vendored, PATH, conventional', () => {
        const env = { ...DEV, envOverride: 'D:/my-odin/odin.exe' };
        expect(odinCandidates(env, fsProbes([VENDORED]))).toEqual([
            'D:/my-odin/odin.exe',
            R(VENDORED),
            PATH_ODIN,
            CONVENTIONAL_ODIN,
        ]);
    });

    it('omits the vendored entry when there is no vendored toolchain', () => {
        expect(odinCandidates(DEV, fsProbes([]))).toEqual([PATH_ODIN, CONVENTIONAL_ODIN]);
    });
});

describe('resolveOdin', () => {
    it('prefers the vendored toolchain over an Odin on PATH', async () => {
        // This is the ordering that matters most in practice: the dev machine
        // has BOTH (odin on PATH at C:\Odin plus the pinned .tools copy), and
        // the pinned one is the version CI builds with.
        const probes = fsProbes([VENDORED], [VENDORED, PATH_ODIN, CONVENTIONAL_ODIN]);
        expect(await resolveOdin(DEV, probes)).toBe(R(VENDORED));
    });

    it('honours SKALD_ODIN above the vendored toolchain', async () => {
        const custom = 'D:/my-odin/odin.exe';
        const env = { ...DEV, envOverride: custom };
        const probes = fsProbes([VENDORED, custom], [VENDORED, custom]);
        expect(await resolveOdin(env, probes)).toBe(custom);
    });

    it('falls past a SKALD_ODIN that points at nothing runnable', async () => {
        // A stale SKALD_ODIN (toolchain moved, drive unmounted) must not
        // strand a machine that has a perfectly good compiler elsewhere.
        const env = { ...DEV, envOverride: 'D:/deleted-last-week/odin.exe' };
        const probes = fsProbes([VENDORED], [VENDORED]);
        expect(await resolveOdin(env, probes)).toBe(R(VENDORED));
    });

    it('falls back to PATH on a checkout with no vendored toolchain', async () => {
        expect(await resolveOdin(DEV, fsProbes([], [PATH_ODIN]))).toBe(PATH_ODIN);
    });

    it('falls back to the conventional install location last', async () => {
        expect(await resolveOdin(DEV, fsProbes([], [CONVENTIONAL_ODIN]))).toBe(CONVENTIONAL_ODIN);
    });

    it('resolves the bundled toolchain in a packaged build', async () => {
        const probes = fsProbes([PACKAGED_VENDORED], [PACKAGED_VENDORED]);
        expect(await resolveOdin(PACKAGED, probes)).toBe(R(PACKAGED_VENDORED));
    });

    it('returns null when nothing runs', async () => {
        expect(await resolveOdin(DEV, fsProbes([VENDORED], []))).toBeNull();
    });
});

describe('odinMissingMessage', () => {
    it('names the vendored path, SKALD_ODIN, and the setup script in dev', () => {
        const msg = odinMissingMessage(DEV);
        expect(msg).toContain('SKALD_ODIN');
        expect(msg).toContain(expectedVendoredRoot(DEV));
        expect(msg).toContain('setup-dev.ps1');
        expect(msg).toContain(CONVENTIONAL_ODIN);
    });

    it('tells a packaged user no toolchain is bundled and what still works', () => {
        const msg = odinMissingMessage(PACKAGED);
        expect(msg).toContain('does not bundle');
        expect(msg).toContain('SKALD_ODIN');
        expect(msg).toContain('odin-lang.org');
        // "Preview is broken" must not read as "the app is broken".
        expect(msg).toMatch(/Download Code/);
    });

    it('says so when SKALD_ODIN is set but did not run', () => {
        const env = { ...DEV, envOverride: 'D:/typo/odin.exe' };
        expect(odinMissingMessage(env)).toContain('D:/typo/odin.exe');
    });
});

describe('createOdinResolver — caching and spawn behaviour', () => {
    const countingProbes = (runnable: string[]) => {
        const base = fsProbes([VENDORED], runnable);
        const canRun = vi.fn(base.canRun);
        return { probes: { ...base, canRun }, canRun };
    };

    it('probes once for a hit and reuses it forever', async () => {
        const { probes, canRun } = countingProbes([VENDORED]);
        const r = createOdinResolver(() => DEV, probes);
        expect(await r.resolve()).toBe(R(VENDORED));
        expect(await r.resolve()).toBe(R(VENDORED));
        expect(await r.resolve()).toBe(R(VENDORED));
        expect(canRun).toHaveBeenCalledTimes(1);
    });

    it('does not re-spawn on every attempt after a miss', async () => {
        // The bug: a machine without Odin re-ran a SYNCHRONOUS `odin version`
        // for every candidate on every preview attempt, blocking the main
        // process each time.
        const { probes, canRun } = countingProbes([]);
        const r = createOdinResolver(() => DEV, probes, () => 1_000);
        expect(await r.resolve()).toBeNull();
        const afterFirstSweep = canRun.mock.calls.length;
        expect(await r.resolve()).toBeNull();
        expect(await r.resolve()).toBeNull();
        expect(canRun.mock.calls.length).toBe(afterFirstSweep);
    });

    it('re-probes once the negative TTL expires, so a mid-session install is picked up', async () => {
        let now = 1_000;
        const runnable: string[] = [];
        const base = fsProbes([VENDORED], runnable);
        // `canRun` reads `runnable` live, so the test can "install Odin" between calls.
        const probes: OdinToolchainProbes = { ...base, canRun: base.canRun };
        const r = createOdinResolver(() => DEV, probes, () => now);

        expect(await r.resolve()).toBeNull();
        now += NEGATIVE_CACHE_TTL_MS - 1;
        expect(await r.resolve()).toBeNull();

        runnable.push(VENDORED);
        now += 2; // TTL now expired
        expect(await r.resolve()).toBe(R(VENDORED));
    });

    it('coalesces concurrent lookups into one probe sweep', async () => {
        const { probes, canRun } = countingProbes([VENDORED]);
        const r = createOdinResolver(() => DEV, probes);
        const [a, b, c] = await Promise.all([r.resolve(), r.resolve(), r.resolve()]);
        expect([a, b, c]).toEqual([R(VENDORED), R(VENDORED), R(VENDORED)]);
        expect(canRun).toHaveBeenCalledTimes(1);
    });

    it('reset() forgets a cached hit', async () => {
        const { probes, canRun } = countingProbes([VENDORED]);
        const r = createOdinResolver(() => DEV, probes);
        await r.resolve();
        r.reset();
        await r.resolve();
        expect(canRun).toHaveBeenCalledTimes(2);
    });
});
