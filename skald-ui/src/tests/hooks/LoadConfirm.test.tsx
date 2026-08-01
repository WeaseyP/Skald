// @vitest-environment jsdom
//
// SKB-005, packet B4 (b) — "Load itself is still unguarded". Before this,
// handleLoad went straight to the file picker and replaced the whole
// document with no dirty check at all: an unsaved session vanished the
// instant Load's dialog returned a file, with no way back (B3 already closed
// the one-Ctrl+Z-after-Load half of this bug; see LoadThenUndo.test.tsx).
//
// This guard must fail loudly if removed: comment out the
// `if (history.isDirty) { ... }` block in useFileIO.handleLoad and the
// "aborts cleanly" test below turns red, because loadGraph gets called and
// the previous project's nodes get replaced despite the decline.
import React from 'react';
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { renderHook, act, cleanup } from '@testing-library/react';
import { ReactFlowProvider, Node, ReactFlowInstance } from '@xyflow/react';
import { useEditorState } from '../../hooks/nodeEditor/useEditorState';
import { useFileIO } from '../../hooks/nodeEditor/useFileIO';
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

const useHarness = (confirmDiscardUnsaved: () => boolean | Promise<boolean>) => {
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
        undefined,
        confirmDiscardUnsaved,
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

const SAVED_PROJECT = JSON.stringify({
    nodes: [instrumentNode('new-inst', 'NewLead')],
    edges: [],
    sequencerTracks: [track('t-new', 'new-inst', 'NewLead', [
        { step: 0, note: 72, velocity: 1, duration: 1 },
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

describe('SKB-005 (b) — Load prompts before discarding unsaved edits', () => {
    it('does not prompt at all when the document is clean — nothing to lose, nothing to ask', async () => {
        const confirmDiscardUnsaved = vi.fn().mockReturnValue(true);
        const { result } = renderHook(() => useHarness(confirmDiscardUnsaved), { wrapper });

        expect(result.current.history.isDirty).toBe(false);
        await act(async () => { await result.current.handleLoad(); });

        expect(confirmDiscardUnsaved).not.toHaveBeenCalled();
        expect(loadGraph).toHaveBeenCalledTimes(1);
        expect(result.current.nodes.map(n => n.id)).toEqual(['new-inst']);
    });

    it('prompts when dirty, and a decline aborts cleanly — no dialog opened, no state touched, no history reset', async () => {
        const confirmDiscardUnsaved = vi.fn().mockReturnValue(false);
        const { result } = renderHook(() => useHarness(confirmDiscardUnsaved), { wrapper });

        act(() => { result.current.setNodes([instrumentNode('old-inst', 'OldBass')]); });
        act(() => { result.current.toggleStep(result.current.tracks[0].id, 0, 36); });
        expect(result.current.history.isDirty).toBe(true);
        const undoDepthBefore = result.current.history.undoDepth;

        await act(async () => { await result.current.handleLoad(); });

        expect(confirmDiscardUnsaved).toHaveBeenCalledTimes(1);
        // The file picker never opened: a decline must not even spend the
        // round trip to the main process, let alone touch state.
        expect(loadGraph).not.toHaveBeenCalled();
        expect(result.current.nodes.map(n => n.id)).toEqual(['old-inst']);
        expect(result.current.tracks[0].notes).toHaveLength(1);
        expect(result.current.history.undoDepth).toBe(undoDepthBefore);
        expect(result.current.history.isDirty).toBe(true);
    });

    it('prompts when dirty, and confirming proceeds exactly as an unguarded Load would', async () => {
        const confirmDiscardUnsaved = vi.fn().mockReturnValue(true);
        const { result } = renderHook(() => useHarness(confirmDiscardUnsaved), { wrapper });

        act(() => { result.current.setNodes([instrumentNode('old-inst', 'OldBass')]); });
        act(() => { result.current.toggleStep(result.current.tracks[0].id, 0, 36); });

        await act(async () => { await result.current.handleLoad(); });

        expect(confirmDiscardUnsaved).toHaveBeenCalledTimes(1);
        expect(loadGraph).toHaveBeenCalledTimes(1);
        expect(result.current.nodes.map(n => n.id)).toEqual(['new-inst']);
        expect(result.current.tracks[0].notes).toHaveLength(1);
        expect(result.current.history.isDirty).toBe(false);
    });

    it('an async confirm (a real promise-based dialog) is awaited before Load proceeds', async () => {
        let resolveConfirm: (v: boolean) => void = () => undefined;
        const confirmDiscardUnsaved = vi.fn(() => new Promise<boolean>((resolve) => { resolveConfirm = resolve; }));
        const { result } = renderHook(() => useHarness(confirmDiscardUnsaved), { wrapper });

        act(() => { result.current.setNodes([instrumentNode('old-inst', 'OldBass')]); });
        act(() => { result.current.toggleStep(result.current.tracks[0].id, 0, 36); });
        expect(result.current.history.isDirty).toBe(true);

        let loadPromise: Promise<void> = Promise.resolve();
        act(() => { loadPromise = result.current.handleLoad(); });
        // Still pending: the dialog hasn't answered yet, so nothing may move.
        expect(loadGraph).not.toHaveBeenCalled();
        expect(result.current.nodes.map(n => n.id)).toEqual(['old-inst']);

        await act(async () => { resolveConfirm(true); await loadPromise; });
        expect(loadGraph).toHaveBeenCalledTimes(1);
        expect(result.current.nodes.map(n => n.id)).toEqual(['new-inst']);
    });
});
