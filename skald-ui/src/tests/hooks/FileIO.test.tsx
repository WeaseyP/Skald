// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { Node, Edge, ReactFlowInstance } from '@xyflow/react';
import { useFileIO, FileStatus, SessionSettings, FileIOHistoryHooks } from '../../hooks/nodeEditor/useFileIO';
import { SequencerTrack } from '../../definitions/types';

// ---------------------------------------------------------------------------
// Contract tests for the hardened save/load path: every outcome (write
// failure, corrupt file, foreign JSON, cancel) must be either visibly
// reported or an explicit no-op — never a silent lie. State setters are
// spies so we can assert the current graph is untouched on failure.
// ---------------------------------------------------------------------------

let saveGraph: ReturnType<typeof vi.fn>;
let loadGraph: ReturnType<typeof vi.fn>;
let importPatches: ReturnType<typeof vi.fn>;
let setNodes: ReturnType<typeof vi.fn>;
let setEdges: ReturnType<typeof vi.fn>;
let loadTracks: ReturnType<typeof vi.fn>;
let applySession: ReturnType<typeof vi.fn>;
let notify: ReturnType<typeof vi.fn>;

let pushHistory: ReturnType<typeof vi.fn>;
let resetHistory: ReturnType<typeof vi.fn>;
let markSaved: ReturnType<typeof vi.fn>;
let fileHistory: FileIOHistoryHooks;

let setViewport: ReturnType<typeof vi.fn>;
let fitView: ReturnType<typeof vi.fn>;

const rfInstance = () => ({
    toObject: () => ({ nodes: [{ id: 'n1' }], edges: [], viewport: { x: 0, y: 0, zoom: 1 } }),
    getViewport: () => ({ x: 0, y: 0, zoom: 1 }),
    setViewport,
    fitView,
} as unknown as ReactFlowInstance);

const session = { bpm: 140, patternSteps: 32, masterVolume: 0.3, packageName: 'my_game_audio' };

// The real setTimeout(0) the hook defers viewport restoration through — one
// real macrotask tick is enough for it to fire.
const flushTimers = () => new Promise((r) => setTimeout(r, 10));

const renderFileIO = () =>
    renderHook(() =>
        useFileIO(
            rfInstance(),
            setNodes as unknown as React.Dispatch<React.SetStateAction<Node[]>>,
            setEdges as unknown as React.Dispatch<React.SetStateAction<Edge[]>>,
            fileHistory,
            [],
            loadTracks as unknown as (tracks: SequencerTrack[]) => void,
            session,
            applySession as unknown as (s: Partial<SessionSettings>) => void,
            notify as unknown as (s: FileStatus) => void
        )
    );

beforeEach(() => {
    saveGraph = vi.fn();
    loadGraph = vi.fn();
    importPatches = vi.fn();
    setNodes = vi.fn();
    setEdges = vi.fn();
    loadTracks = vi.fn();
    applySession = vi.fn();
    notify = vi.fn();
    setViewport = vi.fn();
    fitView = vi.fn();
    pushHistory = vi.fn();
    resetHistory = vi.fn();
    markSaved = vi.fn();
    fileHistory = {
        pushHistory,
        resetHistory,
        markSaved,
    } as unknown as FileIOHistoryHooks;
    (window as unknown as { electron: unknown }).electron = { saveGraph, loadGraph, importPatches };
});

/** A minimal single-instrument patch file, as Import Patch would read it. */
const patchFile = (name: string, instId: string, trackId: string) => ({
    name,
    content: JSON.stringify({
        nodes: [{ id: instId, type: 'instrument', position: { x: 0, y: 0 }, data: { label: instId } }],
        edges: [],
        sequencerTracks: [{ id: trackId, targetNodeId: instId, name: instId, color: '#fff', steps: 16, notes: [], isMuted: false, isSolo: false }],
    }),
});

const lastStatus = (): FileStatus => notify.mock.calls[notify.mock.calls.length - 1][0];

describe('useFileIO — save outcome surfacing', () => {
    it('reports success with the written path', async () => {
        saveGraph.mockResolvedValue({ saved: true, path: 'C:/songs/track.json' });
        const { result } = renderFileIO();
        await act(async () => { await result.current.handleSave(); });
        expect(lastStatus()).toEqual({ kind: 'success', message: 'Saved to C:/songs/track.json' });
        // The payload carries the session block.
        const written = JSON.parse(saveGraph.mock.calls[0][0]);
        expect(written.session).toEqual(session);
    });

    it('reports a disk-write failure loudly (the old path was fire-and-forget)', async () => {
        saveGraph.mockResolvedValue({ saved: false, error: 'EACCES: permission denied' });
        const { result } = renderFileIO();
        await act(async () => { await result.current.handleSave(); });
        expect(lastStatus().kind).toBe('error');
        expect(lastStatus().message).toContain('nothing was written');
        expect(lastStatus().message).toContain('EACCES');
    });

    it('stays quiet when the user cancels the dialog', async () => {
        saveGraph.mockResolvedValue({ saved: false });
        const { result } = renderFileIO();
        await act(async () => { await result.current.handleSave(); });
        expect(notify).not.toHaveBeenCalled();
    });
});

describe('useFileIO — load validation', () => {
    it('rejects corrupt JSON without touching the current graph', async () => {
        loadGraph.mockResolvedValue({ content: '{ "nodes": [ TRUNCAT' });
        const { result } = renderFileIO();
        await act(async () => { await result.current.handleLoad(); });
        expect(lastStatus().kind).toBe('error');
        expect(lastStatus().message).toContain('unchanged');
        expect(setNodes).not.toHaveBeenCalled();
        expect(setEdges).not.toHaveBeenCalled();
    });

    it('rejects valid-JSON-but-not-a-save without touching the graph', async () => {
        loadGraph.mockResolvedValue({ content: JSON.stringify({ hello: 'world' }) });
        const { result } = renderFileIO();
        await act(async () => { await result.current.handleLoad(); });
        expect(lastStatus().message).toContain('not a Skald save file');
        expect(setNodes).not.toHaveBeenCalled();
    });

    it('surfaces a read failure from the main process', async () => {
        loadGraph.mockResolvedValue({ content: null, error: 'EBUSY: resource busy' });
        const { result } = renderFileIO();
        await act(async () => { await result.current.handleLoad(); });
        expect(lastStatus().kind).toBe('error');
        expect(lastStatus().message).toContain('EBUSY');
    });

    it('loads a valid save and restores the session block', async () => {
        loadGraph.mockResolvedValue({
            content: JSON.stringify({
                nodes: [{ id: 'a' }], edges: [], sequencerTracks: [{ id: 't1' }],
                session: { bpm: 90, patternSteps: 64, masterVolume: 0.5 },
            }),
        });
        const { result } = renderFileIO();
        await act(async () => { await result.current.handleLoad(); });
        expect(setNodes).toHaveBeenCalledWith([{ id: 'a' }]);
        expect(loadTracks).toHaveBeenCalledWith([{ id: 't1' }]);
        expect(applySession).toHaveBeenCalledWith({ bpm: 90, patternSteps: 64, masterVolume: 0.5 });
        expect(notify).not.toHaveBeenCalled(); // success is visible in the editor itself
    });

    it('treats a canceled dialog as a silent no-op', async () => {
        loadGraph.mockResolvedValue({ content: null });
        const { result } = renderFileIO();
        await act(async () => { await result.current.handleLoad(); });
        expect(notify).not.toHaveBeenCalled();
        expect(setNodes).not.toHaveBeenCalled();
    });
});

// ---------------------------------------------------------------------------
// SKB-036 / F-B06-11 — packageName never round-tripped through save/load;
// every reload reset the export package to "generated_audio". It now rides
// the session block exactly like bpm/patternSteps/masterVolume.
// ---------------------------------------------------------------------------
describe('useFileIO — packageName round-trip (SKB-036)', () => {
    it('carries packageName in the save payload', async () => {
        saveGraph.mockResolvedValue({ saved: true, path: 'C:/songs/track.json' });
        const { result } = renderFileIO();
        await act(async () => { await result.current.handleSave(); });
        const written = JSON.parse(saveGraph.mock.calls[0][0]);
        expect(written.session.packageName).toBe('my_game_audio');
    });

    it('restores packageName from a save that has one', async () => {
        loadGraph.mockResolvedValue({
            content: JSON.stringify({
                nodes: [{ id: 'a' }], edges: [],
                session: { bpm: 90, patternSteps: 64, masterVolume: 0.5, packageName: 'my_game_audio' },
            }),
        });
        const { result } = renderFileIO();
        await act(async () => { await result.current.handleLoad(); });
        expect(applySession).toHaveBeenCalledWith(
            expect.objectContaining({ packageName: 'my_game_audio' })
        );
    });

    it('leaves the current packageName alone for an older save with no packageName field — no default is invented', async () => {
        loadGraph.mockResolvedValue({
            content: JSON.stringify({
                nodes: [{ id: 'a' }], edges: [],
                session: { bpm: 90, patternSteps: 64, masterVolume: 0.5 },
            }),
        });
        const { result } = renderFileIO();
        await act(async () => { await result.current.handleLoad(); });
        const restored = applySession.mock.calls[0][0];
        expect(restored).not.toHaveProperty('packageName');
    });

    it('ignores a blank packageName instead of restoring an empty export package name', async () => {
        loadGraph.mockResolvedValue({
            content: JSON.stringify({
                nodes: [{ id: 'a' }], edges: [],
                session: { bpm: 90, patternSteps: 64, masterVolume: 0.5, packageName: '   ' },
            }),
        });
        const { result } = renderFileIO();
        await act(async () => { await result.current.handleLoad(); });
        const restored = applySession.mock.calls[0][0];
        expect(restored).not.toHaveProperty('packageName');
    });
});

// ---------------------------------------------------------------------------
// SKB-035 / F-B06-10 — flow.viewport was saved and never restored, and
// nothing re-fit the view after load, so a project saved scrolled off the
// node cluster reopened looking like a blank canvas.
// ---------------------------------------------------------------------------
describe('useFileIO — viewport restore on load (SKB-035)', () => {
    it('restores a saved viewport verbatim', async () => {
        loadGraph.mockResolvedValue({
            content: JSON.stringify({
                nodes: [{ id: 'a' }], edges: [],
                viewport: { x: -450, y: 220, zoom: 0.6 },
            }),
        });
        const { result } = renderFileIO();
        await act(async () => { await result.current.handleLoad(); });
        await flushTimers();
        expect(setViewport).toHaveBeenCalledWith({ x: -450, y: 220, zoom: 0.6 });
        expect(fitView).not.toHaveBeenCalled();
    });

    it('falls back to fitView() for an older save with no viewport at all', async () => {
        loadGraph.mockResolvedValue({
            content: JSON.stringify({ nodes: [{ id: 'a' }], edges: [] }),
        });
        const { result } = renderFileIO();
        await act(async () => { await result.current.handleLoad(); });
        await flushTimers();
        expect(fitView).toHaveBeenCalled();
        expect(setViewport).not.toHaveBeenCalled();
    });

    it('falls back to fitView() when the saved viewport is malformed rather than restoring garbage', async () => {
        loadGraph.mockResolvedValue({
            content: JSON.stringify({
                nodes: [{ id: 'a' }], edges: [],
                viewport: { x: 'nope', y: null, zoom: 1 },
            }),
        });
        const { result } = renderFileIO();
        await act(async () => { await result.current.handleLoad(); });
        await flushTimers();
        expect(fitView).toHaveBeenCalled();
        expect(setViewport).not.toHaveBeenCalled();
    });
});

describe('useFileIO — multi-patch import', () => {
    it('merges every patch in the selection in one pass', async () => {
        importPatches.mockResolvedValue({
            files: [
                patchFile('kick.skald.json', 'instrument-kick', 'track-kick'),
                patchFile('snare.skald.json', 'instrument-snare', 'track-snare'),
                patchFile('hat.skald.json', 'instrument-hat', 'track-hat'),
            ],
            skipped: [],
        });
        const { result } = renderFileIO();
        await act(async () => { await result.current.handleImportGraph(); });

        // setNodes is called with an updater; run it against an existing graph.
        const updater = setNodes.mock.calls[0][0] as (nds: Node[]) => Node[];
        const merged = updater([{ id: 'existing', position: { x: 0, y: 0 }, data: {} } as Node]);
        expect(merged).toHaveLength(4);
        expect(new Set(merged.map((n) => n.id)).size).toBe(4);

        const tracks = loadTracks.mock.calls[0][0] as SequencerTrack[];
        expect(tracks).toHaveLength(3);
        // Each track follows its own instrument, not the first one imported.
        expect(new Set(tracks.map((t) => t.targetNodeId)).size).toBe(3);
        expect(lastStatus()).toEqual({
            kind: 'success',
            message: 'Imported 3 patches (3 nodes, 3 tracks).',
        });
    });

    it('imports the good files and names the ones it skipped', async () => {
        importPatches.mockResolvedValue({
            files: [
                patchFile('kick.skald.json', 'instrument-kick', 'track-kick'),
                { name: 'notes.json', content: JSON.stringify({ hello: 'world' }) },
            ],
            skipped: [{ name: 'locked.json', error: 'EBUSY: resource busy' }],
        });
        const { result } = renderFileIO();
        await act(async () => { await result.current.handleImportGraph(); });

        expect(setNodes).toHaveBeenCalled(); // the kick still landed
        expect(lastStatus().kind).toBe('error');
        expect(lastStatus().message).toContain('Imported 1 patch');
        expect(lastStatus().message).toContain('locked.json (EBUSY: resource busy)');
        expect(lastStatus().message).toContain('notes.json');
    });

    it('leaves the graph alone when nothing in the selection is importable', async () => {
        importPatches.mockResolvedValue({
            files: [{ name: 'notes.json', content: '{ "nodes": [ TRUNCAT' }],
            skipped: [],
        });
        const { result } = renderFileIO();
        await act(async () => { await result.current.handleImportGraph(); });
        expect(setNodes).not.toHaveBeenCalled();
        expect(loadTracks).not.toHaveBeenCalled();
        expect(lastStatus().kind).toBe('error');
        expect(lastStatus().message).toContain('unchanged');
    });

    it('treats a canceled import as a silent no-op', async () => {
        importPatches.mockResolvedValue({ files: [], skipped: [] });
        const { result } = renderFileIO();
        await act(async () => { await result.current.handleImportGraph(); });
        expect(notify).not.toHaveBeenCalled();
        expect(setNodes).not.toHaveBeenCalled();
    });
});

// ---------------------------------------------------------------------------
// Packet A7 item 5 — a saved patch must stop carrying a dead public-API
// parameter. `syncRate` was exposable in one click until the sidebar wrappers
// were corrected; anything saved while that was true still lists it, and the
// backend still mints a `set_syncRate` for a note-division string. Strip it as
// the file is parsed, before any of it reaches state.
// ---------------------------------------------------------------------------

const patchWithSyncRateExposed = () => JSON.stringify({
    nodes: [
        {
            id: 'lfo-top', type: 'lfo', position: { x: 0, y: 0 },
            data: { bpmSync: true, syncRate: '1/4', amplitude: 1, exposedParameters: ['amplitude', 'syncRate'] },
        },
        {
            id: 'inst-1', type: 'instrument', position: { x: 0, y: 0 },
            data: {
                name: 'Bass',
                exposedParameters: [],
                subgraph: {
                    nodes: [
                        {
                            id: 'sh', type: 'sampleHold', position: { x: 0, y: 0 },
                            data: { bpmSync: true, syncRate: '1/8', rate: 10, exposedParameters: ['syncRate', 'rate'] },
                        },
                        {
                            id: 'dly', type: 'delay', position: { x: 0, y: 0 },
                            data: { bpmSync: true, syncRate: '1/16', exposedParameters: ['syncRate'] },
                        },
                    ],
                    connections: [],
                },
            },
        },
    ],
    edges: [],
});

describe('useFileIO — dead exposed-parameter scrub on load', () => {
    it('strips syncRate from exposedParameters, including inside instrument subgraphs', async () => {
        loadGraph.mockResolvedValue({ content: patchWithSyncRateExposed() });
        const { result } = renderFileIO();
        await act(async () => { await result.current.handleLoad(); });

        const loaded = setNodes.mock.calls[0][0] as any[];
        const lfo = loaded.find((n) => n.id === 'lfo-top');
        expect(lfo.data.exposedParameters).toEqual(['amplitude']);
        // The stored value itself is untouched — only the exposure claim goes.
        expect(lfo.data.syncRate).toBe('1/4');

        const sub = loaded.find((n) => n.id === 'inst-1').data.subgraph.nodes;
        expect(sub.find((n: any) => n.id === 'sh').data.exposedParameters).toEqual(['rate']);
        expect(sub.find((n: any) => n.id === 'dly').data.exposedParameters).toEqual([]);
        expect(sub.find((n: any) => n.id === 'dly').data.syncRate).toBe('1/16');
    });

    it('applies the same scrub on Import Patch', async () => {
        importPatches.mockResolvedValue({
            files: [{ name: 'synced.skald.json', content: patchWithSyncRateExposed() }],
            skipped: [],
        });
        const { result } = renderFileIO();
        await act(async () => { await result.current.handleImportGraph(); });

        const updater = setNodes.mock.calls[0][0] as (nds: Node[]) => Node[];
        const merged = updater([]) as any[];
        for (const n of merged) {
            expect(n.data.exposedParameters ?? []).not.toContain('syncRate');
        }
    });

    it('leaves a file with no exposedParameters arrays alone', async () => {
        loadGraph.mockResolvedValue({
            content: JSON.stringify({ nodes: [{ id: 'a', data: {} }, { id: 'b' }], edges: [] }),
        });
        const { result } = renderFileIO();
        await act(async () => { await result.current.handleLoad(); });
        expect(setNodes).toHaveBeenCalledWith([{ id: 'a', data: {} }, { id: 'b' }]);
    });
});
