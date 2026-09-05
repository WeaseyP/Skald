// @vitest-environment jsdom
/*
================================================================================
| Roadmap E12, the remaining half — gestural P-lock recording.                |
|                                                                              |
| The live half (44d2f51) let a macro pad's XY position drive several (node,   |
| param) targets while previewing. This half adds a Record toggle: while the   |
| sequencer plays, moving the pad bakes its position into P-locks on the       |
| steps of the CURRENT INSTRUMENT'S track as the playhead passes them — see    |
| MacroPadSection's doc comments in NodeParameterControls.tsx for the whole    |
| design (why the step being LEFT is what gets written, why "touched" resets   |
| per step, why one pass is one undo entry).                                  |
|                                                                              |
| No backend change: a P-lock already reaches the export as a                  |
| `<Asset>_set_param` call emitted by generate_sequencer_logic                 |
| (skald-backend/core/codegen_project.odin) with no notion of where the value  |
| came from — verified by reading that function (see its call site around     |
| line 86-114: it walks `event.patch_overrides` for ANY populated map, whether |
| a human typed it in StepPropertiesEditor or this feature wrote it).          |
================================================================================
*/
import React from 'react';
import { act, cleanup, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Node, ReactFlowProvider } from '@xyflow/react';
import { NodeParameterControls } from '../../components/NodeParameterControls';
import { NodeParams, SequencerTrack } from '../../definitions/types';
import { useEditorState } from '../../hooks/nodeEditor/useEditorState';

afterEach(() => {
    cleanup();
});

const filterNode = (id: string, label: string): Node<NodeParams> =>
    ({ id, type: 'filter', position: { x: 0, y: 0 }, data: { label, cutoff: 800, resonance: 1, type: 'Lowpass' } } as unknown as Node<NodeParams>);

const instrumentNode: Node<NodeParams> = {
    id: 'inst-1',
    type: 'instrument',
    position: { x: 0, y: 0 },
    data: { name: 'Pad', volume: 1, voiceCount: 8, glide: 0.05, unison: 1, detune: 5, exposedParameters: [] },
} as unknown as Node<NodeParams>;

const wrapperFn = (paramKey: string, label: string, control: React.ReactNode) => (
    <section key={paramKey} aria-label={label}>{control}</section>
);

// A track holding a note at steps 0, 1, 2 (what the playhead visits in the
// tests below) and step 5 (visited, but never touched — proves "later steps
// do not" without relying on "never visited" alone).
const trackWithNotes = (): SequencerTrack => ({
    id: 'trk-1',
    targetNodeId: 'inst-1',
    name: 'Pad',
    color: '#007acc',
    steps: 16,
    isMuted: false,
    isSolo: false,
    notes: [
        { step: 0, note: 60, velocity: 1, duration: 1 },
        { step: 1, note: 60, velocity: 1, duration: 1 },
        { step: 2, note: 60, velocity: 1, duration: 1 },
        { step: 5, note: 60, velocity: 1, duration: 1 },
    ],
});

/** Move the macro pad to a raw (unscaled 0..1) position via a mocked pointer down. */
const movePad = (container: HTMLElement, rawX: number, rawY: number) => {
    const pad = screen.getByTestId('macro-xy-pad').querySelector('svg')?.parentElement;
    if (!(pad instanceof HTMLDivElement)) throw new Error('Missing macro XY pad');
    vi.spyOn(pad, 'getBoundingClientRect').mockReturnValue({
        x: 0, y: 0, left: 0, top: 0, right: 250, bottom: 200, width: 250, height: 200, toJSON: () => ({}),
    });
    fireEvent.mouseDown(pad, { clientX: rawX * 250, clientY: (1 - rawY) * 200 });
};

const addTarget = (axis: 'x' | 'y', value: string) => {
    fireEvent.change(screen.getByTestId(`macro-add-${axis}`), { target: { value } });
};

describe('E12 recording — the Record toggle only appears when a track is threaded in', () => {
    it('renders no Record UI without macroRouting.recording (the live-only path, 44d2f51)', () => {
        const onUpdateNode = vi.fn();
        render(
            <NodeParameterControls
                node={instrumentNode}
                onChange={vi.fn()}
                onChangeMany={vi.fn()}
                renderControlWrapper={wrapperFn}
                macroRouting={{ internalNodes: [filterNode('flt-1', 'Filter')], onUpdateNode }}
            />
        );
        expect(screen.queryByTestId('macro-record-toggle')).toBeNull();
    });
});

describe('E12 recording — capturing the pad into per-step P-locks', () => {
    const makeTree = (currentStep: number, isPlaying: boolean, onUpdateNode: (...a: unknown[]) => void, onUpdateNote: (...a: unknown[]) => void, track: SequencerTrack) => (
        <NodeParameterControls
            node={instrumentNode}
            onChange={vi.fn()}
            onChangeMany={vi.fn()}
            renderControlWrapper={wrapperFn}
            macroRouting={{
                internalNodes: [filterNode('flt-1', 'Filter')],
                onUpdateNode,
                recording: { instrumentId: 'inst-1', track, currentStep, isPlaying, onUpdateNote },
            }}
        />
    );

    it('writes the pad position mapped into the target range for each step the playhead passes while touched, and nothing for a visited-but-untouched step', () => {
        const onUpdateNode = vi.fn();
        const onUpdateNote = vi.fn();
        const track = trackWithNotes();
        const { container, rerender } = render(makeTree(0, true, onUpdateNode, onUpdateNote, track));

        addTarget('x', 'flt-1::cutoff');
        fireEvent.change(screen.getByTestId('macro-min-x-flt-1-cutoff'), { target: { value: '0' } });
        fireEvent.change(screen.getByTestId('macro-max-x-flt-1-cutoff'), { target: { value: '1000' } });

        fireEvent.click(screen.getByTestId('macro-record-toggle')); // Record ON, playhead at step 0
        movePad(container, 0.2, 0.5); // touch while step 0 is current -> 0 + 0.2*1000 = 200

        rerender(makeTree(1, true, onUpdateNode, onUpdateNote, track)); // playhead -> 1: flushes step 0
        movePad(container, 0.6, 0.5); // touch while step 1 is current -> 600

        rerender(makeTree(2, true, onUpdateNode, onUpdateNote, track)); // playhead -> 2: flushes step 1
        movePad(container, 0.9, 0.5); // touch while step 2 is current -> 900

        rerender(makeTree(5, true, onUpdateNode, onUpdateNote, track)); // playhead -> 5: flushes step 2 (no further touch)

        fireEvent.click(screen.getByTestId('macro-record-toggle')); // Record OFF: flushes step 5 — untouched, writes nothing

        expect(onUpdateNote).toHaveBeenCalledTimes(3);
        expect(onUpdateNote).toHaveBeenNthCalledWith(
            1, 'trk-1', 0, { patchOverrides: { 'Filter:cutoff': 200 } }, 60, expect.objectContaining({ gesture: expect.any(String) })
        );
        expect(onUpdateNote).toHaveBeenNthCalledWith(
            2, 'trk-1', 1, { patchOverrides: { 'Filter:cutoff': 600 } }, 60, expect.objectContaining({ gesture: expect.any(String) })
        );
        expect(onUpdateNote).toHaveBeenNthCalledWith(
            3, 'trk-1', 2, { patchOverrides: { 'Filter:cutoff': 900 } }, 60, expect.objectContaining({ gesture: expect.any(String) })
        );
        // Never step 5, though the playhead reached it and it holds a note —
        // the pad was never touched again after step 2.
        expect(onUpdateNote).not.toHaveBeenCalledWith('trk-1', 5, expect.anything(), expect.anything(), expect.anything());

        // Every write in the pass shares the exact same gesture object, so
        // useEditorHistory's coalescing folds them into one undo entry (see
        // the useSequencerState/useEditorState test below for the proof that
        // it actually does).
        const gestures = onUpdateNote.mock.calls.map(c => c[4]);
        expect(gestures[0]).toBe(gestures[1]);
        expect(gestures[1]).toBe(gestures[2]);
    });

    it('does nothing for a step with no note on the track, even when touched', () => {
        const onUpdateNode = vi.fn();
        const onUpdateNote = vi.fn();
        // Step 3 holds no note.
        const track: SequencerTrack = { ...trackWithNotes(), notes: trackWithNotes().notes.filter(n => n.step !== 1) };
        const { container, rerender } = render(makeTree(1, true, onUpdateNode, onUpdateNote, track));
        addTarget('x', 'flt-1::cutoff');

        fireEvent.click(screen.getByTestId('macro-record-toggle'));
        movePad(container, 0.5, 0.5);
        rerender(makeTree(2, true, onUpdateNode, onUpdateNote, track)); // flushes step 1 — no note there

        expect(onUpdateNote).not.toHaveBeenCalled();
    });

    it('Record off without ever touching the pad writes nothing', () => {
        const onUpdateNode = vi.fn();
        const onUpdateNote = vi.fn();
        const track = trackWithNotes();
        const { rerender } = render(makeTree(0, true, onUpdateNode, onUpdateNote, track));
        addTarget('x', 'flt-1::cutoff');

        fireEvent.click(screen.getByTestId('macro-record-toggle')); // ON
        rerender(makeTree(1, true, onUpdateNode, onUpdateNote, track)); // playhead moves, pad never touched
        fireEvent.click(screen.getByTestId('macro-record-toggle')); // OFF

        expect(onUpdateNote).not.toHaveBeenCalled();
    });

    it('stopping the transport ends recording: flushes the open step once, then ignores further ticks', () => {
        const onUpdateNode = vi.fn();
        const onUpdateNote = vi.fn();
        const track = trackWithNotes();
        const { container, rerender } = render(makeTree(0, true, onUpdateNode, onUpdateNote, track));
        addTarget('x', 'flt-1::cutoff');
        fireEvent.change(screen.getByTestId('macro-min-x-flt-1-cutoff'), { target: { value: '0' } });
        fireEvent.change(screen.getByTestId('macro-max-x-flt-1-cutoff'), { target: { value: '1000' } });

        fireEvent.click(screen.getByTestId('macro-record-toggle')); // ON at step 0
        movePad(container, 0.3, 0.5); // touch -> 300

        rerender(makeTree(0, false, onUpdateNode, onUpdateNote, track)); // transport stops

        expect(onUpdateNote).toHaveBeenCalledTimes(1);
        expect(onUpdateNote).toHaveBeenCalledWith(
            'trk-1', 0, { patchOverrides: { 'Filter:cutoff': 300 } }, 60, expect.objectContaining({ gesture: expect.any(String) })
        );
        // The toggle reads "Record" again — recording ended on its own.
        expect(screen.getByTestId('macro-record-toggle').textContent).not.toMatch(/Recording/i);

        onUpdateNote.mockClear();
        rerender(makeTree(1, true, onUpdateNode, onUpdateNote, track)); // playback resumes
        movePad(container, 0.9, 0.5);
        rerender(makeTree(2, true, onUpdateNode, onUpdateNote, track));

        expect(onUpdateNote).not.toHaveBeenCalled();
    });
});

// ---------------------------------------------------------------------------
// One recording pass is one undo entry — proved against the REAL history
// (useEditorHistory via useEditorState), not a mock, because the coalescing
// this feature depends on lives entirely inside useEditorHistory's gesture
// mechanism (GESTURE_IDLE_MS). See useSequencerState.ts's updateNote doc
// comment for why a shared `historyOverride` is what makes this work.
// ---------------------------------------------------------------------------
const wrapper = ({ children }: { children: React.ReactNode }) => (
    <ReactFlowProvider>{children}</ReactFlowProvider>
);

const instrumentWithOsc = (): Node<NodeParams> => ({
    id: 'inst-1',
    type: 'instrument',
    position: { x: 0, y: 0 },
    data: {
        label: 'Pad', name: 'Pad', voiceCount: 8, glide: 0, unison: 1, detune: 0,
        inputs: [], outputs: [],
        subgraph: {
            nodes: [{ id: 'osc-1', type: 'oscillator', position: { x: 0, y: 0 }, data: { label: 'Osc', amplitude: 0.5 } }],
            connections: [],
        },
    },
} as unknown as Node<NodeParams>);

describe('E12 recording — a whole pass is one undo step', () => {
    it('coalesces three step writes sharing a gesture into one history entry, and undo reverts all three at once', () => {
        const { result } = renderHook(() => useEditorState(), { wrapper });
        act(() => { result.current.setNodes([instrumentWithOsc()]); });
        const trackId = result.current.tracks[0].id;
        act(() => { result.current.toggleStep(trackId, 0, 60); });
        act(() => { result.current.toggleStep(trackId, 1, 60); });
        act(() => { result.current.toggleStep(trackId, 2, 60); });

        const depthBeforePass = result.current.history.undoDepth;
        const gesture = { label: 'Record macro pad', gesture: 'macroRecord:inst-1:1' };

        act(() => { result.current.updateNote(trackId, 0, { patchOverrides: { 'Osc:amplitude': 0.2 } }, 60, gesture); });
        act(() => { result.current.updateNote(trackId, 1, { patchOverrides: { 'Osc:amplitude': 0.6 } }, 60, gesture); });
        act(() => { result.current.updateNote(trackId, 2, { patchOverrides: { 'Osc:amplitude': 0.9 } }, 60, gesture); });

        // Three writes, ONE entry — not three.
        expect(result.current.history.undoDepth).toBe(depthBeforePass + 1);

        // Sanity: all three actually landed before undo.
        const notesBefore = result.current.tracks.find(t => t.id === trackId)!.notes;
        expect(notesBefore.find(n => n.step === 0)?.patchOverrides).toEqual({ 'Osc:amplitude': 0.2 });
        expect(notesBefore.find(n => n.step === 1)?.patchOverrides).toEqual({ 'Osc:amplitude': 0.6 });
        expect(notesBefore.find(n => n.step === 2)?.patchOverrides).toEqual({ 'Osc:amplitude': 0.9 });

        act(() => { result.current.handleUndo(); });

        const notesAfter = result.current.tracks.find(t => t.id === trackId)!.notes;
        expect(notesAfter.find(n => n.step === 0)?.patchOverrides).toBeUndefined();
        expect(notesAfter.find(n => n.step === 1)?.patchOverrides).toBeUndefined();
        expect(notesAfter.find(n => n.step === 2)?.patchOverrides).toBeUndefined();
    });

    it('a different gesture (a second recording pass) opens its own entry rather than coalescing with the first', () => {
        const { result } = renderHook(() => useEditorState(), { wrapper });
        act(() => { result.current.setNodes([instrumentWithOsc()]); });
        const trackId = result.current.tracks[0].id;
        act(() => { result.current.toggleStep(trackId, 0, 60); });

        const depthBefore = result.current.history.undoDepth;
        act(() => { result.current.updateNote(trackId, 0, { patchOverrides: { 'Osc:amplitude': 0.2 } }, 60, { label: 'Record macro pad', gesture: 'macroRecord:inst-1:1' }); });
        act(() => { result.current.updateNote(trackId, 0, { patchOverrides: { 'Osc:amplitude': 0.4 } }, 60, { label: 'Record macro pad', gesture: 'macroRecord:inst-1:2' }); });

        expect(result.current.history.undoDepth).toBe(depthBefore + 2);
    });

    it('without a historyOverride, updateNote keeps its ordinary per-(step,field) gesture (unchanged for every existing caller)', () => {
        const { result } = renderHook(() => useEditorState(), { wrapper });
        act(() => { result.current.setNodes([instrumentWithOsc()]); });
        const trackId = result.current.tracks[0].id;
        act(() => { result.current.toggleStep(trackId, 0, 60); });
        act(() => { result.current.toggleStep(trackId, 1, 60); });

        const depthBefore = result.current.history.undoDepth;
        act(() => { result.current.updateNote(trackId, 0, { velocity: 0.5 }, 60); });
        act(() => { result.current.updateNote(trackId, 1, { velocity: 0.7 }, 60); });

        // Two different steps, no shared gesture: two entries, as before this feature.
        expect(result.current.history.undoDepth).toBe(depthBefore + 2);
    });
});
