// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { Node, Edge, ReactFlowInstance } from '@xyflow/react';
import { useFileIO, FileStatus, SessionSettings } from '../../hooks/nodeEditor/useFileIO';
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

const rfInstance = {
    toObject: () => ({ nodes: [{ id: 'n1' }], edges: [], viewport: { x: 0, y: 0, zoom: 1 } }),
    getViewport: () => ({ x: 0, y: 0, zoom: 1 }),
} as unknown as ReactFlowInstance;

const session = { bpm: 140, patternSteps: 32, masterVolume: 0.3 };

const renderFileIO = () =>
    renderHook(() =>
        useFileIO(
            rfInstance,
            setNodes as unknown as React.Dispatch<React.SetStateAction<Node[]>>,
            setEdges as unknown as React.Dispatch<React.SetStateAction<Edge[]>>,
            vi.fn() as unknown as (history: unknown[]) => void,
            vi.fn() as unknown as (future: unknown[]) => void,
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
