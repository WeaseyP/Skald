// @vitest-environment jsdom
/*
================================================================================
| Roadmap packet A5 — THE EXAMPLES-CORPUS GATE.                                |
|                                                                              |
| Nothing in CI ever checked the shipped examples; 26 of them cannot be played |
| from the editor and one hard-fails codegen in every packaged build           |
| (BUGS.md SKB-019), and until packet A4 the CLI path silently retimed 100 of  |
| them to 120 BPM with every P-lock dropped (SKB-002) while exiting 0.         |
|                                                                              |
| TWO GATES, BECAUSE TWO READERS OF .skald.json EXIST — and this packet was    |
| mis-specced twice by testing only the wrong one:                             |
|                                                                              |
| 1. THE EDITOR PATH (the primary gate, per roadmap constraint §4.3 /          |
|    F-C3-11). Each graph-shaped file goes through the REAL pipeline a user's  |
|    file takes: useFileIO.handleLoad (parseSaveFile + the parentNode->        |
|    parentId migration + the dead-exposed-parameter scrub) -> the editor's    |
|    session-settings application -> buildProjectData (the one serializer      |
|    Play and Generate share) -> skald_codegen.exe on stdin exactly as         |
|    src/main.ts spawns it -> `odin check -no-entry-point` on the emitted      |
|    package. The hook is driven with the same mock harness as                 |
|    tests/hooks/FileIO.test.tsx — no product code is duplicated or forked.    |
|                                                                              |
| 2. THE CLI PATH (the smaller secondary gate). `skald_codegen.exe -in:<file>` |
|    for every file — the fallback parser (`build_project_from_graph`) that    |
|    F-B11-1's original spec exercised EXCLUSIVELY, kept covered because it    |
|    is a real ingestion surface (and the only reader of the 25 loose-graph    |
|    files and the project-shaped demo). This resurrects AUDIT.md's            |
|    codegen + odin-check step (F-B11-10) as a permanent gate.                 |
|                                                                              |
| SESSION ASSERTIONS (both paths): for every file carrying a `session` block,  |
| the emitted `p.bpm` and the master-volume tanh coefficient must equal what   |
| the file authored. This is the assertion packet A4 made passable — before it |
| the CLI path emitted `p.bpm = 120` for all 70 session-carrying files — and   |
| it is what catches "certified output silently retimed" forever after.       |
|                                                                              |
| DELIBERATELY ABSENT: any diff/golden comparison over emitted code. Roadmap   |
| constraint §4.2/§4.3 forbids it until A11 (the corpus snapshot); this gate   |
| is exit codes, `odin check`, and the session values only.                    |
|                                                                              |
| Failures are quarantined in corpusGate.ts's explicit allowlists (file +      |
| symptom + owning packet), and a quarantined file that starts PASSING fails   |
| the gate, so the lists cannot rot.                                           |
================================================================================
*/
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Node, Edge, ReactFlowInstance } from '@xyflow/react';
import { useFileIO, FileStatus, SessionSettings } from '../../hooks/nodeEditor/useFileIO';
import { SequencerTrack } from '../../definitions/types';
import { buildProjectData } from '../../utils/projectSerializer';
import {
    CorpusFile,
    EDITOR_UNPLAYABLE,
    CLI_CODEGEN_FAILS,
    buildCodegen,
    emittedBpm,
    emittedMasterCoeff,
    findRepoRoot,
    isQuarantined,
    listCorpus,
    odinCheck,
    resolveOdin,
    runCodegenFile,
    runCodegenStdin,
    sameAsF32,
} from './corpusGate';

// Enumerated at module scope so it.each can lay out one test per file at
// collection time. listCorpus throws on an empty or unclassifiable corpus.
const repoRoot = findRepoRoot();
const corpus = listCorpus(repoRoot);
const graphFiles = corpus.filter((f) => f.shape === 'graph');
const projectFiles = corpus.filter((f) => f.shape === 'project');
const byRel = new Map(corpus.map((f) => [f.rel, f]));

// Generous per-test budget: each test spawns codegen (~0.1 s) and odin check
// (~0.1 s) locally, but CI runners are slower and cold.
const PER_FILE_TIMEOUT = 120_000;

let odin = '';
let codegenExe = '';
let tmpRoot = '';
let pkgCounter = 0;

/** A fresh package dir per emission — Odin allows one package per directory. */
const nextPkgDir = (): string => {
    const dir = path.join(tmpRoot, `pkg_${String(pkgCounter++).padStart(3, '0')}`);
    fs.mkdirSync(dir, { recursive: true });
    return dir;
};

beforeAll(() => {
    odin = resolveOdin(repoRoot);
    codegenExe = buildCodegen(repoRoot);
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'skald-corpus-'));
}, 300_000);

afterAll(() => {
    if (tmpRoot) fs.rmSync(tmpRoot, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// Driving the real load path. Mock harness shape borrowed from
// tests/hooks/FileIO.test.tsx: the hook under test is the real one, everything
// at its boundary is a spy.
// ---------------------------------------------------------------------------

interface LoadOutcome {
    error: string | null;
    nodes: Node[];
    edges: Edge[];
    tracks: SequencerTrack[];
    /** The Partial<SessionSettings> the hook applied, {} when it applied none. */
    appliedSession: Partial<SessionSettings>;
}

// The editor's initial session state (app.tsx useState initializers). handleLoad
// applies a PARTIAL on top of whatever the app holds, so the gate must merge
// the same way the app does. If these drift from app.tsx the session
// assertions fail on every session-less file, which is the drift alarm.
const EDITOR_SESSION_DEFAULTS = { bpm: 120, patternSteps: 16, masterVolume: 0.8 };

const loadThroughEditor = async (content: string): Promise<LoadOutcome> => {
    let nodes: Node[] = [];
    let edges: Edge[] = [];
    let tracks: SequencerTrack[] = [];
    let appliedSession: Partial<SessionSettings> = {};
    let error: string | null = null;

    const setNodes = vi.fn((n: Node[]) => { nodes = n; });
    const setEdges = vi.fn((e: Edge[]) => { edges = e; });
    const loadTracks = vi.fn((t: SequencerTrack[]) => { tracks = t; });
    const applySession = vi.fn((s: Partial<SessionSettings>) => { appliedSession = s; });
    const notify = vi.fn((s: FileStatus) => { if (s.kind === 'error') error = s.message; });

    (window as unknown as { electron: unknown }).electron = {
        loadGraph: vi.fn(async () => ({ content })),
    };
    const rfInstance = {
        toObject: () => ({ nodes: [], edges: [], viewport: { x: 0, y: 0, zoom: 1 } }),
        getViewport: () => ({ x: 0, y: 0, zoom: 1 }),
        setViewport: vi.fn(),
        fitView: vi.fn(),
    } as unknown as ReactFlowInstance;

    const { result, unmount } = renderHook(() =>
        useFileIO(
            rfInstance,
            setNodes as unknown as React.Dispatch<React.SetStateAction<Node[]>>,
            setEdges as unknown as React.Dispatch<React.SetStateAction<Edge[]>>,
            vi.fn() as unknown as (history: unknown[]) => void,
            vi.fn() as unknown as (future: unknown[]) => void,
            [],
            loadTracks as unknown as (tracks: SequencerTrack[]) => void,
            { ...EDITOR_SESSION_DEFAULTS, packageName: 'generated_audio' },
            applySession as unknown as (s: Partial<SessionSettings>) => void,
            notify as unknown as (s: FileStatus) => void,
        ),
    );
    await act(async () => {
        await result.current.handleLoad();
    });
    unmount();
    return { error, nodes, edges, tracks, appliedSession };
};

/**
 * For a file that authored a session block, assert the emitted tempo and
 * master-volume coefficient are the AUTHORED values — read from the file
 * itself, never from a captured intermediate, so a load-path bug that drops
 * the session cannot make the assertion agree with itself.
 *
 * Only sanely-authored values are asserted (finite bpm > 0, masterVolume > 0):
 * the zero/absent boundaries are owned elsewhere (masterVolume 0 exporting at
 * unity is SKB-004 / packet B1; every current example authors sane values, so
 * nothing is skipped in practice).
 */
const assertSessionHonoured = (file: CorpusFile, code: string): void => {
    const session = file.session;
    if (!session) return;
    if (typeof session.bpm === 'number' && Number.isFinite(session.bpm) && session.bpm > 0) {
        const bpm = emittedBpm(code, file.rel);
        expect
            .soft(sameAsF32(bpm, session.bpm), `${file.rel}: authored session.bpm ${session.bpm} but emitted p.bpm = ${bpm} — the export is silently retimed (SKB-002 class)`)
            .toBe(true);
    }
    if (
        typeof session.masterVolume === 'number' &&
        Number.isFinite(session.masterVolume) &&
        session.masterVolume > 0
    ) {
        const coeff = emittedMasterCoeff(code, file.rel);
        expect
            .soft(sameAsF32(coeff, session.masterVolume), `${file.rel}: authored session.masterVolume ${session.masterVolume} but emitted tanh coefficient ${coeff} — the export is silently re-levelled (SKB-002 class)`)
            .toBe(true);
    }
};

// ---------------------------------------------------------------------------
// Gate 1: the editor path
// ---------------------------------------------------------------------------

describe('examples corpus — editor path (parseSaveFile -> buildProjectData -> codegen -> odin check)', () => {
    it.each(graphFiles.map((f) => [f.rel] as const))(
        '%s',
        async (rel) => {
            const file = byRel.get(rel)!;
            const outcome = await loadThroughEditor(fs.readFileSync(file.abs, 'utf8'));

            // Every graph-shaped example must load in the editor without error.
            expect(outcome.error, `${rel}: the editor refused to load it`).toBeNull();

            const session = { ...EDITOR_SESSION_DEFAULTS, ...outcome.appliedSession };
            const projectData = buildProjectData(
                outcome.nodes,
                outcome.edges,
                outcome.tracks,
                session.bpm,
                session.masterVolume,
                session.patternSteps,
                // No quantizer: the app's default scale is Chromatic, whose
                // nearestInScale is the identity — identical serialization.
                undefined,
            );

            const pkgDir = nextPkgDir();
            const outPath = path.join(pkgDir, 'generated_audio.odin');
            const gen = runCodegenStdin(codegenExe, JSON.stringify(projectData, null, 2), outPath);

            const quarantined = isQuarantined(EDITOR_UNPLAYABLE, rel);
            if (quarantined) {
                // Pinned failure: the file loads but carries no Instrument node,
                // so the editor path cannot generate from it (SKB-019).
                expect(
                    projectData.project.instruments,
                    `${rel} is quarantined as instrument-less (${quarantined.owner}) but serialized ` +
                        `${projectData.project.instruments.length} instrument(s) — the premise changed; ` +
                        `remove it from EDITOR_UNPLAYABLE in corpusGate.ts`,
                ).toHaveLength(0);
                expect(
                    gen.status,
                    `${rel} is quarantined (${quarantined.symptom}; owner ${quarantined.owner}) but its ` +
                        `editor-path codegen now SUCCEEDS — the fix landed, so delete its quarantine entry ` +
                        `so the gate protects it from here on`,
                ).not.toBe(0);
                return;
            }

            expect(
                gen.status,
                `${rel}: editor-path codegen failed (exit ${gen.status}).\nstderr:\n${gen.stderr}`,
            ).toBe(0);

            const check = odinCheck(odin, pkgDir);
            expect(
                check.status,
                `${rel}: emitted Odin does not compile.\n${check.stdout}\n${check.stderr}`,
            ).toBe(0);

            assertSessionHonoured(file, fs.readFileSync(outPath, 'utf8'));
        },
        PER_FILE_TIMEOUT,
    );

    it.each(projectFiles.map((f) => [f.rel] as const))(
        '%s is project-shaped: the editor must refuse it at parse, unchanged-graph guaranteed',
        async (rel) => {
            // The one project-shaped file (the integration demo's input) is not
            // an editor save; parseSaveFile rejecting it with a clear message IS
            // the correct behaviour, pinned here. Its full codegen + compile
            // coverage lives in the CLI gate below.
            const file = byRel.get(rel)!;
            const outcome = await loadThroughEditor(fs.readFileSync(file.abs, 'utf8'));
            expect(outcome.error, `${rel}: expected parseSaveFile to reject a project-shaped file`).toContain(
                'not a Skald save file',
            );
        },
        PER_FILE_TIMEOUT,
    );
});

// ---------------------------------------------------------------------------
// Gate 2: the CLI path (the fallback parser F-B11-1 would have tested alone)
// ---------------------------------------------------------------------------

describe('examples corpus — CLI path (skald_codegen -in -> odin check)', () => {
    it.each(corpus.map((f) => [f.rel] as const))(
        '%s',
        (rel) => {
            const file = byRel.get(rel)!;
            const pkgDir = nextPkgDir();
            const outPath = path.join(pkgDir, 'generated_audio.odin');
            const gen = runCodegenFile(codegenExe, file.abs, outPath);

            const quarantined = isQuarantined(CLI_CODEGEN_FAILS, rel);
            if (quarantined) {
                expect(
                    gen.status,
                    `${rel} is quarantined (${quarantined.symptom}; owner ${quarantined.owner}) but its ` +
                        `CLI-path codegen now SUCCEEDS — the fix landed, so delete its quarantine entry`,
                ).not.toBe(0);
                // Pin the symptom too: a DIFFERENT failure in a quarantined file
                // must not hide behind the entry.
                expect(
                    gen.stderr,
                    `${rel}: quarantined for the unknown-port symptom but failed differently:\n${gen.stderr}`,
                ).toContain('input_delayTime');
                return;
            }

            expect(
                gen.status,
                `${rel}: CLI-path codegen failed (exit ${gen.status}).\nstderr:\n${gen.stderr}`,
            ).toBe(0);

            const check = odinCheck(odin, pkgDir);
            expect(
                check.status,
                `${rel}: emitted Odin (CLI path) does not compile.\n${check.stdout}\n${check.stderr}`,
            ).toBe(0);

            // A4's contract on the fallback parser: an authored session block is
            // read, not replaced with the 120-BPM/unity defaults.
            assertSessionHonoured(file, fs.readFileSync(outPath, 'utf8'));
        },
        PER_FILE_TIMEOUT,
    );
});

// ---------------------------------------------------------------------------
// Gate hygiene: the quarantine lists and the corpus itself cannot rot
// ---------------------------------------------------------------------------

describe('examples corpus — gate hygiene', () => {
    it('every quarantined file still exists in the corpus (delete stale entries)', () => {
        for (const q of [...EDITOR_UNPLAYABLE, ...CLI_CODEGEN_FAILS]) {
            expect(
                byRel.has(q.rel),
                `quarantine entry ${q.rel} (${q.owner}) matches no file on disk — ` +
                    `the file was removed, so delete its entry from corpusGate.ts`,
            ).toBe(true);
        }
    });

    it('the session assertions are exercised, not vacuous (A8\'s coverage-floor lesson)', () => {
        // If every session block vanished from the corpus, the retiming
        // assertion above would pass by never running — the exact vacuous
        // green A8's defaults test was caught doing. At least one playable,
        // session-carrying file must exist for the editor-path assertion, and
        // one session-carrying graph file for the CLI-path assertion.
        expect(
            graphFiles.some((f) => f.session !== null && f.hasInstrument),
            'no playable example carries a session block — the editor-path session assertion never ran',
        ).toBe(true);
        expect(
            graphFiles.some((f) => f.session !== null),
            'no graph example carries a session block — the CLI-path session assertion never ran',
        ).toBe(true);
    });

    it('reports the corpus shape (the numbers AUDIT.md used to hand-maintain)', () => {
        const withSession = graphFiles.filter((f) => f.session !== null).length;
        const unplayable = graphFiles.filter((f) => !f.hasInstrument).length + projectFiles.length;
        // No count is asserted against a constant — the glob is the truth. This
        // test only guarantees the classification stays total and visible.
        expect(corpus.length).toBe(graphFiles.length + projectFiles.length);
        console.info(
            `[corpus gate] ${corpus.length} files: ${graphFiles.length} graph-shaped ` +
                `(${withSession} with a session block), ${projectFiles.length} project-shaped; ` +
                `${unplayable} unplayable from the editor (SKB-019, owner B6); ` +
                `${EDITOR_UNPLAYABLE.length} editor-path quarantines, ${CLI_CODEGEN_FAILS.length} CLI-path quarantines.`,
        );
    });
});
