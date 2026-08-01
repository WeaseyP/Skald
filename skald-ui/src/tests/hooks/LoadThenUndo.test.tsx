// @vitest-environment jsdom
//
// SKB-005, undo half — "one Ctrl+Z immediately after Load destroys the newly
// opened project's sequencer data".
//
// The verified one-keypress path: handleLoad cleared only the GRAPH stack while
// `loadTracks` PUSHED the outgoing project's tracks onto the sequencer stack, so
// the single Ctrl+Z that popped both swapped the just-opened project's tracks
// for the previous project's — and useInstrumentRegistry then pruned those as
// orphans (their nodes are not on the canvas) and re-added empty ones. Every
// note in the file you just opened, gone, unrecoverable.
//
// B3 owns this half: one history, cleared on Load, and a `loadTracks` that
// pushes nothing. The dirty check / confirmation dialog / window title /
// autosave that stop Load from throwing away UNSAVED work are packet B4.
import React from 'react';
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { renderHook, act, cleanup } from '@testing-library/react';
import { ReactFlowProvider, Node, ReactFlowInstance } from '@xyflow/react';
import { useEditorState } from '../../hooks/nodeEditor/useEditorState';
import { useFileIO } from '../../hooks/nodeEditor/useFileIO';
import { useSequencerState } from '../../hooks/sequencer/useSequencerState';
import { NodeParams, SequencerTrack } from '../../definitions/types';

const wrapper = ({ children }: { children: React.ReactNode }) => (
    <ReactFlowProvider>{children}</ReactFlowProvider>
);

const RF_INSTANCE = {
    toObject: () => ({ nodes: [], edges: [], viewport: { x: 0, y: 0, zoom: 1 } }),
    getViewport: () => ({ x: 0, y: 0, zoom: 1 }),
    setViewport: () => undefined,
    fitView: () => undefined,
} as unknown as ReactFlowInstance;

const useHarness = () => {
    const editor = useEditorState();
    const fileIO = useFileIO(
        RF_INSTANCE,
        editor.setNodes as unknown as React.Dispatch<React.SetStateAction<Node[]>>,
        editor.setEdges,
        editor.history,
        editor.tracks,
        editor.loadTracks,
        editor.session,
        editor.applySessionSettings,
    );
    return { ...editor, ...fileIO };
};

const instrumentNode = (id: string, name: string): Node<NodeParams> => ({
    id,
    type: 'instrument',
    position: { x: 0, y: 0 },
    data: {
        name,
        label: name,
        voiceCount: 4,
        subgraph: {
            nodes: [{ id: 'out', type: 'InstrumentOutput', position: { x: 0, y: 0 }, data: { label: 'Out', name: 'output' } }],
            connections: [],
        },
    },
} as unknown as Node<NodeParams>);

const track = (id: string, targetNodeId: string, name: string, notes: SequencerTrack['notes']): SequencerTrack => ({
    id, targetNodeId, name, color: '#fff', steps: 16, notes, isMuted: false, isSolo: false,
});

/** The project on disk: one Instrument and a track with four notes in it. */
const SAVED_PROJECT = JSON.stringify({
    nodes: [instrumentNode('new-inst', 'NewLead')],
    edges: [],
    sequencerTracks: [track('t-new', 'new-inst', 'NewLead', [
        { step: 0, note: 72, velocity: 1, duration: 1 },
        { step: 4, note: 74, velocity: 1, duration: 1 },
        { step: 8, note: 76, velocity: 1, duration: 1 },
        { step: 12, note: 79, velocity: 1, duration: 1 },
    ])],
    session: { bpm: 90, patternSteps: 32, masterVolume: 0.5, packageName: 'new_pkg' },
});

let loadGraph: ReturnType<typeof vi.fn>;

beforeEach(() => {
    loadGraph = vi.fn().mockResolvedValue({ content: SAVED_PROJECT });
    (window as unknown as { electron: unknown }).electron = {
        saveGraph: vi.fn(), loadGraph, importPatches: vi.fn(),
    };
});

afterEach(cleanup);

describe('SKB-005 — one Ctrl+Z immediately after Load', () => {
    it('cannot touch the newly opened project (the history is empty after Load)', async () => {
        const { result } = renderHook(() => useHarness(), { wrapper });

        // A previous project, WITH history: an Instrument and a note of its own.
        act(() => { result.current.setNodes([instrumentNode('old-inst', 'OldBass')]); });
        const oldTrackId = result.current.tracks[0].id;
        act(() => { result.current.toggleStep(oldTrackId, 0, 36); });
        act(() => { result.current.setBpm(174); });
        expect(result.current.history.undoDepth).toBe(2);

        await act(async () => { await result.current.handleLoad(); });

        // The file is open, with all four of its notes.
        expect(result.current.nodes.map(n => n.id)).toEqual(['new-inst']);
        expect(result.current.tracks).toHaveLength(1);
        expect(result.current.tracks[0].notes).toHaveLength(4);
        expect(result.current.session).toMatchObject({ bpm: 90, patternSteps: 32, masterVolume: 0.5 });

        // Nothing to undo BACK to: the pre-load graph and the loaded tracks are
        // not a state anyone authored.
        expect(result.current.history.undoDepth).toBe(0);
        expect(result.current.history.canUndo).toBe(false);
        expect(result.current.history.redoDepth).toBe(0);

        // Ctrl+Z. Twice, plus a redo for good measure.
        await act(async () => { result.current.handleUndo(); });
        await act(async () => { result.current.handleUndo(); });
        await act(async () => { result.current.handleRedo(); });

        // Everything the file brought with it is still here.
        expect(result.current.nodes.map(n => n.id)).toEqual(['new-inst']);
        expect(result.current.tracks).toHaveLength(1);
        expect(result.current.tracks[0].notes.map(n => n.note)).toEqual([72, 74, 76, 79]);
        expect(result.current.session.bpm).toBe(90);
    });

    // The data-loss assertion stated on its own, with no reference to stack
    // depths: after Load + Ctrl+Z, is the file you opened still the file you
    // have? Before the fix the answer was no — the graph, the tracks and every
    // note in them were replaced by the previous project's.
    it('still holds the opened file — its nodes, its tracks, its notes — after Ctrl+Z', async () => {
        const { result } = renderHook(() => useHarness(), { wrapper });

        act(() => { result.current.setNodes([instrumentNode('old-inst', 'OldBass')]); });
        act(() => { result.current.toggleStep(result.current.tracks[0].id, 0, 36); });

        await act(async () => { await result.current.handleLoad(); });
        await act(async () => { result.current.handleUndo(); });

        expect(result.current.nodes.map(n => n.id)).toEqual(['new-inst']);
        expect(result.current.tracks.map(t => t.targetNodeId)).toEqual(['new-inst']);
        expect(result.current.tracks[0].notes.map(n => n.note)).toEqual([72, 74, 76, 79]);
    });

    it('leaves no trace of the previous project in the history after Load', async () => {
        const { result } = renderHook(() => useHarness(), { wrapper });
        act(() => { result.current.setNodes([instrumentNode('old-inst', 'OldBass')]); });
        act(() => { result.current.toggleStep(result.current.tracks[0].id, 0, 36); });

        await act(async () => { await result.current.handleLoad(); });
        expect(result.current.history.undoLabels).toEqual([]);
        expect(result.current.history.redoLabels).toEqual([]);

        // A first edit AFTER the load is undoable, and it undoes back to the
        // LOADED document — not to the previous project.
        act(() => { result.current.setBpm(128); });
        act(() => { result.current.handleUndo(); });
        expect(result.current.session.bpm).toBe(90);
        expect(result.current.nodes.map(n => n.id)).toEqual(['new-inst']);
        expect(result.current.tracks[0].notes).toHaveLength(4);
    });

    it('Load also clears the save point, so the freshly opened file is not reported dirty', async () => {
        const { result } = renderHook(() => useHarness(), { wrapper });
        act(() => { result.current.setNodes([instrumentNode('old-inst', 'OldBass')]); });
        act(() => { result.current.toggleStep(result.current.tracks[0].id, 0, 36); });
        expect(result.current.history.isDirty).toBe(true);

        await act(async () => { await result.current.handleLoad(); });
        expect(result.current.history.isDirty).toBe(false);
    });
});

describe('SKB-005 — loadTracks itself', () => {
    it('replaces tracks WITHOUT pushing the outgoing ones onto the history', () => {
        const pushHistory = vi.fn();
        const { result } = renderHook(() => useSequencerState({ pushHistory }));

        act(() => { result.current.loadTracks([track('t1', 'n1', 'A', [])]); });
        act(() => { result.current.loadTracks([track('t2', 'n2', 'B', [])]); });

        expect(result.current.tracks.map(t => t.id)).toEqual(['t2']);
        // This push is the SKB-005 mechanism: it made the previous project's
        // tracks the thing one Ctrl+Z restored.
        expect(pushHistory).not.toHaveBeenCalled();
    });

    it('does not push for track add/remove/rename either — those follow the graph edit that caused them', () => {
        const pushHistory = vi.fn();
        const { result } = renderHook(() => useSequencerState({ pushHistory }));

        act(() => { result.current.syncInstrumentTracks([{ id: 'inst-1', name: 'Bass' }]); });
        act(() => { result.current.syncInstrumentTracks([{ id: 'inst-1', name: 'Bass Renamed' }]); });
        act(() => { result.current.syncInstrumentTracks([]); });

        expect(result.current.tracks).toEqual([]);
        expect(pushHistory).not.toHaveBeenCalled();
    });
});
