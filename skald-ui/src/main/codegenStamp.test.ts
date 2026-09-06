// @vitest-environment node
/*
================================================================================
| Codegen provenance handshake — roadmap packet A2 / BUGS.md SKB-001.          |
|                                                                              |
| Colocated with the module rather than under src/tests/ purely to stay out of  |
| another packet's way while both are in flight; it is an ordinary vitest file  |
| and needs no configuration.                                                  |
|                                                                              |
| Nothing here spawns a compiler or touches a real file: the probes are         |
| injected, so a test can describe a fresh clone, a developer who edited        |
| core/codegen.odin and forgot to rebuild, a packaged install with no sources,  |
| or the actual defect — a binary from before this contract existed.            |
|                                                                              |
| THE CROSS-LANGUAGE PINS BELOW ARE THE LOAD-BEARING PART. The digest is only   |
| useful if the TypeScript here and the Odin in skald-backend/main.odin compute |
| the same number, so the expected values are taken from RUNNING the Odin       |
| implementation, not from this one. If a change makes them disagree, the app    |
| would refuse every freshly built binary — a loud failure, but the wrong one.   |
================================================================================
*/
import { describe, it, expect, vi } from 'vitest';
import {
    CodegenStampEnv,
    CodegenStampProbes,
    STAMP_FORMAT,
    checkCodegenProvenance,
    combinedDigest,
    contentDigest,
    createCodegenGuard,
    digestString,
    fnv1a64,
    parseStamp,
} from './codegenStamp';

const bytes = (s: string) => new TextEncoder().encode(s);

/** A stamp exactly as skald-backend/main.odin prints it. */
const stampText = (
    files: { path: string; digest: string }[],
    digest: string,
    format: number = STAMP_FORMAT,
) =>
    [
        'skald_codegen',
        `stamp-format: ${format}`,
        'odin-version: dev-2025-02',
        `source-digest: ${digest}`,
        ...files.map((f) => `source-file: ${f.digest} ${f.path}`),
        '',
    ].join('\n');

/**
 * A two-file backend tree, with a stamp that matches it. `drift` rewrites one
 * file's contents WITHOUT rewriting the stamp — i.e. an edited source and an
 * un-rebuilt binary, the everyday way SKB-001 comes back.
 */
const tree = (opts: { drift?: boolean; extraCoreFile?: string } = {}) => {
    const sources = [
        { path: 'main.odin', bytes: bytes('package skald_codegen\n') },
        { path: 'core/codegen.odin', bytes: bytes('package core // v1\n') },
    ];
    const stampFiles = sources.map((s) => ({ path: s.path, digest: digestString(fnv1a64(s.bytes)) }));
    const stampDigest = combinedDigest(sources);
    if (opts.drift) sources[1] = { path: 'core/codegen.odin', bytes: bytes('package core // v2 EDITED\n') };
    const listed = sources.map((s) => s.path);
    if (opts.extraCoreFile) listed.push(opts.extraCoreFile);
    const probes: CodegenStampProbes = {
        runVersion: vi.fn(async () => stampText(stampFiles, stampDigest)),
        readBytes: (abs) => sources.find((s) => abs.replace(/\\/g, '/').endsWith(s.path))?.bytes ?? null,
        fileIdentity: () => '1000:2048',
        listBackendSources: () => listed,
    };
    return { probes, sources, stampFiles, stampDigest };
};

const env: CodegenStampEnv = { exePath: 'C:\\repo\\skald-ui\\skald_codegen.exe', backendDir: 'C:\\repo\\skald-backend' };

describe('fnv1a64 — the same number on both sides of the handshake', () => {
    // Canonical FNV-1a/64 test vectors, reproduced by the Odin implementation
    // in skald-backend/main.odin (verified by running it).
    it.each([
        ['', 'fnv1a64:cbf29ce484222325'],
        ['a', 'fnv1a64:af63dc4c8601ec8c'],
        ['foobar', 'fnv1a64:85944171f73967e8'],
    ])('digest of %o', (input, expected) => {
        expect(digestString(fnv1a64(bytes(input)))).toBe(expected);
    });

    it('combines path + NUL + contents + NUL exactly as source_digest does in Odin', () => {
        // Value produced by the Odin side over the same two synthetic files.
        expect(
            combinedDigest([
                { path: 'a.odin', bytes: bytes('x') },
                { path: 'core/b.odin', bytes: bytes('yz\n') },
            ]),
        ).toBe('fnv1a64:ccb2dce879d42263');
    });

    it('contentDigest ignores CR bytes, mirroring core.content_digest in provenance.odin', () => {
        // combinedDigest hashes CODEGEN_SOURCES content through contentDigest,
        // not plain fnv1a64: #load embeds whatever is on disk, so a CRLF
        // Windows working tree and an LF `git archive` export or CI runner
        // produced two different `generator:` stamps for byte-identical
        // source, and every checked-in generated_audio.odin copy read STALE
        // under regen_generated.bat check in any LF checkout for that reason
        // alone. Pinned against the Odin side (core.content_digest), run by
        // provenance_test.odin's mirroring test.
        const lf = bytes('package core\nfoo :: 1\n');
        const crlf = bytes('package core\r\nfoo :: 1\r\n');
        expect(contentDigest(crlf)).toBe(contentDigest(lf));
        expect(contentDigest(lf)).toBe(fnv1a64(lf));

        // Seeded (chained) form, as combinedDigest uses it across sources.
        const seed = fnv1a64(bytes('core/scale.odin'));
        expect(contentDigest(crlf, seed)).toBe(contentDigest(lf, seed));
    });

    it('is order- and path-sensitive, so a rename or a moved proc changes it', () => {
        const a = { path: 'a.odin', bytes: bytes('x') };
        const b = { path: 'b.odin', bytes: bytes('yz') };
        expect(combinedDigest([a, b])).not.toBe(combinedDigest([b, a]));
        expect(combinedDigest([a, b])).not.toBe(combinedDigest([{ ...a, path: 'renamed.odin' }, b]));
        // The NUL separators exist so that moving bytes across the boundary
        // between two files cannot go unnoticed.
        expect(combinedDigest([{ path: 'a.odin', bytes: bytes('xy') }, { path: 'b.odin', bytes: bytes('z') }]))
            .not.toBe(combinedDigest([{ path: 'a.odin', bytes: bytes('x') }, { path: 'b.odin', bytes: bytes('yz') }]));
    });
});

describe('parseStamp', () => {
    it('reads the format, odin version, combined digest and per-file digests', () => {
        const stamp = parseStamp(
            stampText([{ path: 'main.odin', digest: 'fnv1a64:0000000000000001' }], 'fnv1a64:00000000000000ff'),
        );
        expect(stamp).toEqual({
            format: STAMP_FORMAT,
            odinVersion: 'dev-2025-02',
            digest: 'fnv1a64:00000000000000ff',
            files: [{ path: 'main.odin', digest: 'fnv1a64:0000000000000001' }],
        });
    });

    it('returns null for what the pre-A2 binary actually prints when handed -version', () => {
        // Verbatim from the binary this packet untracked: it ignores the flag,
        // reads stdin, finds nothing, and exits 1.
        expect(parseStamp('Error: Input JSON must be valid Project or Graph.\nProject Error: Invalid_Data\n')).toBeNull();
        expect(parseStamp('Codegen OK: 1 instrument(s) -> generated_audio.odin\n')).toBeNull();
    });

    it('returns null when the header is there but the digest is not', () => {
        expect(parseStamp('skald_codegen\nstamp-format: 1\n')).toBeNull();
    });
});

describe('checkCodegenProvenance', () => {
    it('accepts a binary built from the sources in the tree', async () => {
        const { probes, stampDigest } = tree();
        const verdict = await checkCodegenProvenance(env, probes);
        expect(verdict.ok).toBe(true);
        if (!verdict.ok) return;
        expect(verdict.verified).toBe(true);
        expect(verdict.uncovered).toEqual([]);
        expect(verdict.stamp.digest).toBe(stampDigest);
    });

    it('REFUSES a binary whose sources have moved on, and names the file that moved', async () => {
        const { probes } = tree({ drift: true });
        const verdict = await checkCodegenProvenance(env, probes);
        expect(verdict.ok).toBe(false);
        if (verdict.ok) return;
        expect(verdict.reason).toBe('stale-binary');
        expect(verdict.drifted).toEqual(['core/codegen.odin']);
        expect(verdict.message).toContain('skald-backend/core/codegen.odin');
        // The refusal has to carry its own cure: this string is what the
        // renderer prints in the on-canvas banner.
        expect(verdict.message).toContain('npm run build:codegen');
    });

    it('REFUSES a binary that predates the stamp — the SKB-001 shape', async () => {
        const { probes } = tree();
        probes.runVersion = vi.fn(async () => null); // non-zero exit, as the old binary gives
        const verdict = await checkCodegenProvenance(env, probes);
        expect(verdict.ok).toBe(false);
        if (verdict.ok) return;
        expect(verdict.reason).toBe('no-stamp');
        expect(verdict.message).toContain(env.exePath);
        expect(verdict.message).toContain('npm run build:codegen');
    });

    it('REFUSES output that is not a stamp at all', async () => {
        const { probes } = tree();
        probes.runVersion = vi.fn(async () => 'Codegen OK: 1 instrument(s)\n');
        const verdict = await checkCodegenProvenance(env, probes);
        expect(verdict.ok).toBe(false);
        if (verdict.ok) return;
        expect(verdict.reason).toBe('no-stamp');
    });

    it('REFUSES a stamp format this build does not understand', async () => {
        const { probes, stampFiles, stampDigest } = tree();
        probes.runVersion = vi.fn(async () => stampText(stampFiles, stampDigest, STAMP_FORMAT + 1));
        const verdict = await checkCodegenProvenance(env, probes);
        expect(verdict.ok).toBe(false);
        if (verdict.ok) return;
        expect(verdict.reason).toBe('bad-format');
    });

    it('REFUSES when a source the binary embedded is missing from the tree', async () => {
        const { probes } = tree();
        probes.readBytes = (abs) => (abs.includes('main.odin') ? bytes('package skald_codegen\n') : null);
        const verdict = await checkCodegenProvenance(env, probes);
        expect(verdict.ok).toBe(false);
        if (verdict.ok) return;
        expect(verdict.reason).toBe('missing-source');
        expect(verdict.message).toContain('core/codegen.odin');
    });

    it('degrades honestly in a packaged install: stamp checked, freshness NOT claimed', async () => {
        const { probes } = tree();
        const verdict = await checkCodegenProvenance({ ...env, backendDir: null }, probes);
        expect(verdict.ok).toBe(true);
        if (!verdict.ok) return;
        expect(verdict.verified).toBe(false);
        expect(verdict.note).toMatch(/freshness could not be verified/);
    });

    it('warns — but does not refuse — when a backend source is outside the stamp', async () => {
        // The one hole in the design: main.odin's #load list is hand-written.
        // Refusing here would leave a contributor stuck (a rebuild cannot clear
        // it), so the app warns and CI fails instead.
        const { probes } = tree({ extraCoreFile: 'core/new_module.odin' });
        const verdict = await checkCodegenProvenance(env, probes);
        expect(verdict.ok).toBe(true);
        if (!verdict.ok) return;
        expect(verdict.uncovered).toEqual(['core/new_module.odin']);
        expect(verdict.note).toContain('core/new_module.odin');
        expect(verdict.note).toContain('CODEGEN_SOURCES');
    });
});

describe('createCodegenGuard', () => {
    it('probes -version once while the binary is unchanged, and again after a rebuild', async () => {
        const { probes } = tree();
        let identity = '1000:2048';
        probes.fileIdentity = () => identity;
        const guard = createCodegenGuard(() => env, probes);

        await guard.check();
        await guard.check();
        expect(probes.runVersion).toHaveBeenCalledTimes(1);

        identity = '2000:2050'; // build_codegen.bat wrote a new exe
        await guard.check();
        expect(probes.runVersion).toHaveBeenCalledTimes(2);
    });

    it('re-reads the SOURCES every time, so editing a file without rebuilding is caught', async () => {
        // The everyday regression path: same exe (so the stamp is cached), but
        // a backend file edited under it. The guard must notice on the next
        // Play, not on the next restart.
        const clean = tree();
        const live = new Map(clean.sources.map((s) => [s.path, s.bytes]));
        const probes: CodegenStampProbes = {
            ...clean.probes,
            readBytes: (abs) => {
                const hit = [...live.keys()].find((p) => abs.replace(/\\/g, '/').endsWith(p));
                return hit ? live.get(hit)! : null;
            },
        };
        const guard = createCodegenGuard(() => env, probes);
        expect((await guard.check()).ok).toBe(true);

        live.set('core/codegen.odin', bytes('package core // v2 EDITED\n'));
        const verdict = await guard.check();
        expect(verdict.ok).toBe(false);
        // ...and it did so WITHOUT re-spawning the compiler probe.
        expect(probes.runVersion).toHaveBeenCalledTimes(1);
    });

    it('assertUsable throws the refusal text, and stays quiet when the binary is good', async () => {
        const bad = createCodegenGuard(() => env, tree({ drift: true }).probes);
        await expect(bad.assertUsable()).rejects.toThrow(/out of date/i);
        const good = createCodegenGuard(() => env, tree().probes);
        await expect(good.assertUsable()).resolves.toBeUndefined();
    });

    it('reset forgets the cached stamp', async () => {
        const { probes } = tree();
        const guard = createCodegenGuard(() => env, probes);
        await guard.check();
        guard.reset();
        await guard.check();
        expect(probes.runVersion).toHaveBeenCalledTimes(2);
    });
});
