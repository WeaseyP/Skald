// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { Node, Edge, ReactFlowInstance } from 'reactflow';
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
let setNodes: ReturnType<typeof vi.fn>;
let setEdges: ReturnType<typeof vi.fn>;
let loadTracks: ReturnType<typeof vi.fn>;
let applySession: ReturnType<typeof vi.fn>;
let notify: ReturnType<typeof vi.fn>;

const rfInstance = {
    toObject: () => ({ nodes: [{ id: 'n1' }], edges: [], viewport: { x: 0, y: 0, zoom: 1 } }),
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
    setNodes = vi.fn();
    setEdges = vi.fn();
    loadTracks = vi.fn();
    applySession = vi.fn();
    notify = vi.fn();
    (window as unknown as { electron: unknown }).electron = { saveGraph, loadGraph };
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
