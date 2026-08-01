// @vitest-environment jsdom
//
// SKB-008 / packet B3 — "Undo is unreliable in seven distinct ways".
//
// One describe per numbered defect in the bug entry, each asserting the
// behaviour the defect denied. The harness is the REAL composed editor
// (useEditorState + useFileIO), not a stub, so an entry is only proved to exist
// by the document actually coming back.
import React from 'react';
import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest';
import { renderHook, act, cleanup } from '@testing-library/react';
import { ReactFlowProvider, Node, NodeChange, ReactFlowInstance } from '@xyflow/react';
import { useEditorState } from '../../hooks/nodeEditor/useEditorState';
import { useFileIO } from '../../hooks/nodeEditor/useFileIO';
import { HISTORY_LIMIT } from '../../hooks/nodeEditor/editorSnapshot';
import { NodeParams, SequencerTrack } from '../../definitions/types';

// useNodeComposition (pulled in by useEditorState) calls useReactFlow, so the
// hook must render inside a ReactFlowProvider.
const wrapper = ({ children }: { children: React.ReactNode }) => (
    <ReactFlowProvider>{children}</ReactFlowProvider>
);

// Stable across renders — useFileIO memoises on it.
const RF_INSTANCE = {
    toObject: () => ({ nodes: [], edges: [], viewport: { x: 0, y: 0, zoom: 1 } }),
    getViewport: () => ({ x: 0, y: 0, zoom: 1 }),
    setViewport: () => undefined,
    fitView: () => undefined,
} as unknown as ReactFlowInstance;

/** The whole editor: one document, one history, plus the file actions. */
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

const renderEditor = () => renderHook(() => useHarness(), { wrapper });

const filterNode = (id: string, x = 0, cutoff = 800): Node<NodeParams> => ({
    id,
    type: 'filter',
    position: { x, y: 0 },
    data: { label: 'Filter', type: 'Lowpass', cutoff, resonance: 1 },
} as unknown as Node<NodeParams>);

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

const positionChange = (id: string, x: number, dragging: boolean): NodeChange => ({
    id,
    type: 'position',
    position: { x, y: 0 },
    dragging,
} as NodeChange);

const nodeById = (result: { current: ReturnType<typeof useHarness> }, id: string) =>
    result.current.nodes.find(n => n.id === id)!;

beforeEach(() => {
    (window as unknown as { electron: unknown }).electron = {
        saveGraph: vi.fn(),
        loadGraph: vi.fn(),
        importPatches: vi.fn(),
    };
});

afterEach(() => {
    cleanup();
    vi.useRealTimers();
});

// ---------------------------------------------------------------------------
// (1) Two independent stacks popped by one Ctrl+Z — graph capped at 50,
//     sequencer uncapped, "divergence guaranteed".
// ---------------------------------------------------------------------------
describe('SKB-008 (1) — one ordered history, not two stacks popped together', () => {
    it('one undo rewinds exactly ONE edit, whichever slice of the document it touched', () => {
        const { result } = renderEditor();

        // An Instrument on the canvas gives the sequencer a track to edit.
        act(() => { result.current.setNodes([instrumentNode('inst-1', 'Bass')]); });
        expect(result.current.tracks).toHaveLength(1);
        const trackId = result.current.tracks[0].id;

        // Edit A: sequencer. Edit B: graph.
        act(() => { result.current.toggleStep(trackId, 0, 60); });
        act(() => { result.current.updateNodeData('inst-1', { voiceCount: 12 } as never, 'inst-1'); });

        // Both edits are in the SAME stack, in order, and each is named.
        expect(result.current.history.undoLabels).toEqual(['Toggle step 1', 'Change voiceCount']);

        act(() => { result.current.handleUndo(); });
        // The graph edit is undone...
        expect((nodeById(result, 'inst-1').data as { voiceCount: number }).voiceCount).toBe(4);
        // ...and the sequencer edit is NOT. With two stacks, one keystroke
        // popped both, so this note vanished at the same time as the param.
        expect(result.current.tracks[0].notes).toHaveLength(1);

        act(() => { result.current.handleUndo(); });
        expect(result.current.tracks[0].notes).toHaveLength(0);
        expect(result.current.history.canUndo).toBe(false);
    });

    it('every slice stays at the same point in time after 120 interleaved edits (the divergence case)', () => {
        const { result } = renderEditor();
        act(() => { result.current.setNodes([instrumentNode('inst-1', 'Bass'), filterNode('flt')]); });
        const trackId = result.current.tracks[0].id;

        // 60 graph edits and 60 sequencer edits, strictly alternating.
        for (let i = 0; i < 60; i++) {
            act(() => { result.current.updateNodeData('flt', { cutoff: 1000 + i } as never); });
            act(() => { result.current.toggleStep(trackId, i % 16, 60 + i); });
        }

        // ONE stack, ONE cap. The graph stack used to cap at 50 while the
        // sequencer stack grew without limit — that difference is what made a
        // shared keystroke pull entry N from one and N+k from the other.
        expect(result.current.history.undoDepth).toBe(HISTORY_LIMIT);

        const notesBefore = result.current.tracks[0].notes.length;
        act(() => { result.current.handleUndo(); });
        // The most recent edit was the sequencer one, so ONLY it is undone:
        // the filter still holds the last value it was given.
        expect((nodeById(result, 'flt').data as { cutoff: number }).cutoff).toBe(1059);
        expect(result.current.tracks[0].notes).toHaveLength(notesBefore - 1);

        act(() => { result.current.handleUndo(); });
        expect((nodeById(result, 'flt').data as { cutoff: number }).cutoff).toBe(1058);
        expect(result.current.tracks[0].notes).toHaveLength(notesBefore - 1);
    });

    it('redo replays the same one edit and reports honest depths', () => {
        const { result } = renderEditor();
        act(() => { result.current.setNodes([filterNode('flt')]); });
        act(() => { result.current.updateNodeData('flt', { cutoff: 4000 } as never); });

        act(() => { result.current.handleUndo(); });
        expect(result.current.history.undoDepth).toBe(0);
        expect(result.current.history.redoDepth).toBe(1);
        expect(result.current.history.redoLabel).toBe('Change cutoff');

        act(() => { result.current.handleRedo(); });
        expect((nodeById(result, 'flt').data as { cutoff: number }).cutoff).toBe(4000);
        expect(result.current.history.undoDepth).toBe(1);
        expect(result.current.history.redoDepth).toBe(0);
    });
});

// ---------------------------------------------------------------------------
// (2) Drag snapshots taken on the LAST tick, so undo moves a node a few pixels.
// ---------------------------------------------------------------------------
describe('SKB-008 (2) — a drag snapshots on the FIRST dragging tick', () => {
    it('undo returns the node to where the drag started, not to the last tick', () => {
        const { result } = renderEditor();
        act(() => { result.current.setNodes([filterNode('n1', 0)]); });

        // A drag: several `dragging: true` ticks, then one `dragging: false`.
        act(() => { result.current.onNodesChange([positionChange('n1', 10, true)]); });
        act(() => { result.current.onNodesChange([positionChange('n1', 195, true)]); });
        act(() => { result.current.onNodesChange([positionChange('n1', 200, false)]); });

        expect(nodeById(result, 'n1').position.x).toBe(200);
        // The whole drag is ONE entry, named for the gesture.
        expect(result.current.history.undoLabels).toEqual(['Move node']);

        act(() => { result.current.handleUndo(); });
        // Before the fix the snapshot was taken on the drag-STOP change, when
        // state already held x=195 — so undo moved the node 5px and left it
        // essentially where the user dropped it.
        expect(nodeById(result, 'n1').position.x).toBe(0);
    });

    it('a second drag of the same node is a second entry, not a continuation of the first', () => {
        const { result } = renderEditor();
        act(() => { result.current.setNodes([filterNode('n1', 0)]); });

        act(() => { result.current.onNodesChange([positionChange('n1', 100, true)]); });
        act(() => { result.current.onNodesChange([positionChange('n1', 100, false)]); });
        act(() => { result.current.onNodesChange([positionChange('n1', 300, true)]); });
        act(() => { result.current.onNodesChange([positionChange('n1', 300, false)]); });

        expect(result.current.history.undoDepth).toBe(2);
        act(() => { result.current.handleUndo(); });
        expect(nodeById(result, 'n1').position.x).toBe(100);
        act(() => { result.current.handleUndo(); });
        expect(nodeById(result, 'n1').position.x).toBe(0);
    });
});

// ---------------------------------------------------------------------------
// (3) Palette drop untracked (useNodeComposition onDrop).
// ---------------------------------------------------------------------------
describe('SKB-008 (3) — dropping a node from the palette is undoable', () => {
    const dropEvent = (type: string) => ({
        preventDefault: () => undefined,
        clientX: 120,
        clientY: 80,
        dataTransfer: { getData: () => type },
    } as unknown as React.DragEvent);

    it('records one labelled entry for the drop, and undo removes the dropped node', () => {
        const { result } = renderEditor();
        act(() => { result.current.setNodes([filterNode('existing')]); });

        act(() => { result.current.onDrop(dropEvent('oscillator')); });
        expect(result.current.nodes).toHaveLength(2);
        // Before the fix onDrop went straight to setNodes: no entry at all, so
        // Ctrl+Z after a drop undid whatever edit came BEFORE the drop.
        expect(result.current.history.undoLabels).toEqual(['Add Oscillator']);

        act(() => { result.current.handleUndo(); });
        expect(result.current.nodes.map(n => n.id)).toEqual(['existing']);
    });

    it('does not record an entry for a drop of an unknown type (nothing changed)', () => {
        const { result } = renderEditor();
        act(() => { result.current.onDrop(dropEvent('not-a-node-type')); });
        expect(result.current.nodes).toHaveLength(0);
        expect(result.current.history.undoDepth).toBe(0);
    });
});

// ---------------------------------------------------------------------------
// (4) Import Patch untracked (useFileIO handleImportGraph).
// ---------------------------------------------------------------------------
describe('SKB-008 (4) — Import Patch is undoable', () => {
    const patchFile = () => ({
        name: 'kick.skald.json',
        content: JSON.stringify({
            nodes: [instrumentNode('instrument-kick', 'Kick')],
            edges: [],
            sequencerTracks: [{
                id: 'track-kick', targetNodeId: 'instrument-kick', name: 'Kick',
                color: '#fff', steps: 16, notes: [{ step: 0, note: 36, velocity: 1, duration: 1 }],
                isMuted: false, isSolo: false,
            }],
        }),
    });

    it('one undo takes the imported nodes AND tracks back out of the document', async () => {
        const { result } = renderEditor();
        act(() => { result.current.setNodes([filterNode('mine')]); });

        (window.electron.importPatches as unknown as ReturnType<typeof vi.fn>) =
            vi.fn().mockResolvedValue({ files: [patchFile()], skipped: [] });

        await act(async () => { await result.current.handleImportGraph(); });
        expect(result.current.nodes).toHaveLength(2);
        expect(result.current.tracks).toHaveLength(1);
        expect(result.current.history.undoLabels).toEqual(['Import patch']);

        await act(async () => { result.current.handleUndo(); });
        // Before the fix there was no entry, so this undo reverted the edit
        // before the import and left the imported kit on the canvas.
        expect(result.current.nodes.map(n => n.id)).toEqual(['mine']);
        expect(result.current.tracks).toHaveLength(0);
    });
});

// ---------------------------------------------------------------------------
// (5) "Export Step to Instrument" untracked (was app.tsx:342).
// ---------------------------------------------------------------------------
describe('SKB-008 (5) — Export Step to Instrument is undoable', () => {
    it('one undo removes the exported clone and leaves the step it came from alone', () => {
        const { result } = renderEditor();
        act(() => { result.current.setNodes([instrumentNode('inst-1', 'Bass')]); });
        const trackId = result.current.tracks[0].id;
        act(() => { result.current.toggleStep(trackId, 3, 60); });

        let newId: string | null = null;
        act(() => { newId = result.current.handleExportStep(trackId, 3); });
        expect(newId).toBeTruthy();
        expect(result.current.nodes).toHaveLength(2);
        expect(result.current.history.undoLabels).toEqual(['Toggle step 4', 'Export step to instrument']);

        act(() => { result.current.handleUndo(); });
        expect(result.current.nodes.map(n => n.id)).toEqual(['inst-1']);
        // Before the fix the export pushed nothing, so this undo removed the
        // NOTE and left the clone behind.
        expect(result.current.tracks[0].notes).toHaveLength(1);
    });
});

// ---------------------------------------------------------------------------
// (6) BPM / pattern steps / master volume in NEITHER stack.
// ---------------------------------------------------------------------------
describe('SKB-008 (6) — transport settings are in the history', () => {
    it('undoes BPM, pattern length and master volume, each as its own labelled entry', () => {
        const { result } = renderEditor();

        act(() => { result.current.setBpm(140); });
        act(() => { result.current.setPatternSteps(32); });
        act(() => { result.current.setMasterVolume(0.25); });

        expect(result.current.session).toMatchObject({ bpm: 140, patternSteps: 32, masterVolume: 0.25 });
        expect(result.current.history.undoLabels).toEqual([
            'Change BPM', 'Change pattern length', 'Change master volume',
        ]);

        act(() => { result.current.handleUndo(); });
        expect(result.current.session.masterVolume).toBe(0.8);
        act(() => { result.current.handleUndo(); });
        expect(result.current.session.patternSteps).toBe(16);
        act(() => { result.current.handleUndo(); });
        expect(result.current.session.bpm).toBe(120);
    });

    it('interleaves with graph edits in the one stack instead of being unrecoverable', () => {
        const { result } = renderEditor();
        act(() => { result.current.setNodes([filterNode('flt')]); });

        act(() => { result.current.setBpm(90); });
        act(() => { result.current.updateNodeData('flt', { cutoff: 2000 } as never); });

        act(() => { result.current.handleUndo(); }); // the graph edit
        expect((nodeById(result, 'flt').data as { cutoff: number }).cutoff).toBe(800);
        expect(result.current.session.bpm).toBe(90);

        act(() => { result.current.handleUndo(); }); // the tempo change
        expect(result.current.session.bpm).toBe(120);
    });

    it('a slider/typing burst on ONE field is one entry (gesture), two fields are two', () => {
        const { result } = renderEditor();
        act(() => { result.current.setBpm(121); });
        act(() => { result.current.setBpm(122); });
        act(() => { result.current.setBpm(123); });
        expect(result.current.history.undoDepth).toBe(1);
        act(() => { result.current.setMasterVolume(0.5); });
        expect(result.current.history.undoDepth).toBe(2);

        act(() => { result.current.handleUndo(); });
        expect(result.current.session.masterVolume).toBe(0.8);
        act(() => { result.current.handleUndo(); });
        expect(result.current.session.bpm).toBe(120);
    });
});

// ---------------------------------------------------------------------------
// (7) 500 ms WALL-CLOCK coalescing: merged unrelated edits inside the window
//     and split any drag that outlasted it.
// ---------------------------------------------------------------------------
describe('SKB-008 (7) — coalescing is gesture-scoped, not wall-clock', () => {
    it('does NOT merge two different parameters edited 50 ms apart', () => {
        vi.useFakeTimers({ toFake: ['Date'] });
        const t0 = Date.now();
        const { result } = renderEditor();
        act(() => { result.current.setNodes([filterNode('flt')]); });

        vi.setSystemTime(t0 + 10);
        act(() => { result.current.updateNodeData('flt', { cutoff: 1200 } as never); });
        vi.setSystemTime(t0 + 60);
        act(() => { result.current.updateNodeData('flt', { resonance: 8 } as never); });

        // Before the fix the second edit fell inside the 500 ms window and was
        // silently dropped from the history: two entries' worth of work, one
        // entry, and the resonance change was individually unrecoverable.
        expect(result.current.history.undoLabels).toEqual(['Change cutoff', 'Change resonance']);

        act(() => { result.current.handleUndo(); });
        const data = nodeById(result, 'flt').data as { cutoff: number; resonance: number };
        expect(data.resonance).toBe(1);
        expect(data.cutoff).toBe(1200);
    });

    it('does NOT merge edits to two different nodes inside the window', () => {
        vi.useFakeTimers({ toFake: ['Date'] });
        const t0 = Date.now();
        const { result } = renderEditor();
        act(() => { result.current.setNodes([filterNode('a'), filterNode('b')]); });

        vi.setSystemTime(t0 + 10);
        act(() => { result.current.updateNodeData('a', { cutoff: 1111 } as never); });
        vi.setSystemTime(t0 + 20);
        act(() => { result.current.updateNodeData('b', { cutoff: 2222 } as never); });

        expect(result.current.history.undoDepth).toBe(2);
        act(() => { result.current.handleUndo(); });
        expect((nodeById(result, 'b').data as { cutoff: number }).cutoff).toBe(800);
        expect((nodeById(result, 'a').data as { cutoff: number }).cutoff).toBe(1111);
    });

    it('does NOT split a slow drag: 20 ticks over 2 s on one field stay one entry', () => {
        vi.useFakeTimers({ toFake: ['Date'] });
        const t0 = Date.now();
        const { result } = renderEditor();
        act(() => { result.current.setNodes([filterNode('flt')]); });

        for (let i = 1; i <= 20; i++) {
            vi.setSystemTime(t0 + i * 100); // 100 ms between ticks, 2 s in total
            act(() => { result.current.updateNodeData('flt', { cutoff: 800 + i * 10 } as never); });
        }

        expect((nodeById(result, 'flt').data as { cutoff: number }).cutoff).toBe(1000);
        // The 500 ms wall-clock window cut this drag into four or five entries,
        // so one Ctrl+Z rewound half a second of it and the rest needed more.
        expect(result.current.history.undoDepth).toBe(1);

        act(() => { result.current.handleUndo(); });
        expect((nodeById(result, 'flt').data as { cutoff: number }).cutoff).toBe(800);
    });

    it('starts a new entry when the same field is touched again after the gesture goes idle', () => {
        vi.useFakeTimers({ toFake: ['Date'] });
        const t0 = Date.now();
        const { result } = renderEditor();
        act(() => { result.current.setNodes([filterNode('flt')]); });

        vi.setSystemTime(t0);
        act(() => { result.current.updateNodeData('flt', { cutoff: 1200 } as never); });
        vi.setSystemTime(t0 + 5000); // let go, think, drag again
        act(() => { result.current.updateNodeData('flt', { cutoff: 4000 } as never); });

        expect(result.current.history.undoDepth).toBe(2);
        act(() => { result.current.handleUndo(); });
        expect((nodeById(result, 'flt').data as { cutoff: number }).cutoff).toBe(1200);
    });
});

// ---------------------------------------------------------------------------
// The tail of the SKB-008 entry: "Deleting an Instrument also hard-deletes its
// whole track with no confirm" (F-B01-3). B3 owns the undo half — the confirm
// is B4's. The cascade used to push its OWN entry on the sequencer stack, so
// one Ctrl+Z restored a track whose node was still gone and the registry
// deleted it again on the next tick: the notes were unrecoverable.
// ---------------------------------------------------------------------------
describe('SKB-008 (tail) — deleting an Instrument is one undoable step', () => {
    it('one undo brings back the node AND its whole track of notes', async () => {
        const { result } = renderEditor();
        act(() => { result.current.setNodes([instrumentNode('inst-1', 'Bass')]); });
        const trackId = result.current.tracks[0].id;
        act(() => { result.current.toggleStep(trackId, 5, 48); });
        expect(result.current.tracks[0].notes).toHaveLength(1);

        await act(async () => {
            result.current.onNodesChange([{ id: 'inst-1', type: 'remove' } as NodeChange]);
        });
        expect(result.current.nodes).toHaveLength(0);
        expect(result.current.tracks).toHaveLength(0); // cascade

        // Exactly two entries exist: the note, and the delete. The cascade
        // added none of its own.
        expect(result.current.history.undoLabels).toEqual(['Toggle step 6', 'Delete selection']);

        await act(async () => { result.current.handleUndo(); });
        expect(result.current.nodes.map(n => n.id)).toEqual(['inst-1']);
        expect(result.current.tracks).toHaveLength(1);
        expect(result.current.tracks[0].notes).toEqual([
            { step: 5, note: 48, velocity: 1.0, duration: 1 },
        ]);
    });

    it('deleting a node and its wires is ONE entry, not one per change callback', async () => {
        const { result } = renderEditor();
        act(() => {
            result.current.setNodes([filterNode('a'), filterNode('b', 300)]);
            result.current.setEdges([{ id: 'e1', source: 'a', target: 'b' }]);
        });

        await act(async () => {
            result.current.onNodesChange([{ id: 'b', type: 'remove' } as NodeChange]);
            result.current.onEdgesChange([{ id: 'e1', type: 'remove' }]);
        });
        expect(result.current.nodes).toHaveLength(1);
        expect(result.current.edges).toHaveLength(0);
        expect(result.current.history.undoDepth).toBe(1);

        await act(async () => { result.current.handleUndo(); });
        expect(result.current.nodes.map(n => n.id).sort()).toEqual(['a', 'b']);
        expect(result.current.edges.map(e => e.id)).toEqual(['e1']);
    });
});

// ---------------------------------------------------------------------------
// The seam packet B4 builds on. B3 records the save point and exposes the
// flag; it deliberately implements none of B4's behaviour.
// ---------------------------------------------------------------------------
describe('B3→B4 seam — dirty state hangs off the history', () => {
    it('is clean at startup, dirty after an edit, clean again when undone back to the save point', async () => {
        const { result } = renderEditor();
        expect(result.current.history.isDirty).toBe(false);

        act(() => { result.current.setNodes([filterNode('flt')]); });
        act(() => { result.current.updateNodeData('flt', { cutoff: 1200 } as never); });
        expect(result.current.history.isDirty).toBe(true);
        expect(result.current.history.editsSinceSave).toBe(1);

        act(() => { result.current.history.markSaved(); });
        expect(result.current.history.isDirty).toBe(false);
        expect(result.current.history.editsSinceSave).toBe(0);

        act(() => { result.current.updateNodeData('flt', { resonance: 4 } as never); });
        expect(result.current.history.isDirty).toBe(true);

        act(() => { result.current.handleUndo(); });
        expect(result.current.history.isDirty).toBe(false);
    });

    it('exposes the whole document for an autosave writer', () => {
        const { result } = renderEditor();
        act(() => { result.current.setNodes([filterNode('flt')]); });
        act(() => { result.current.setBpm(96); });

        const snapshot = result.current.history.captureSnapshot()!;
        expect(snapshot.nodes.map(n => n.id)).toEqual(['flt']);
        expect(snapshot.session.bpm).toBe(96);
        expect(snapshot.tracks).toEqual([] as SequencerTrack[]);
        expect(snapshot.edges).toEqual([]);
    });
});
