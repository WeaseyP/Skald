// @vitest-environment jsdom
/*
================================================================================
| SKB-025 — pitch-aware chord addressing.                                      |
|                                                                              |
| A step can hold a chord: several NoteEvents sharing `step`, differing in      |
| `note`. Four call sites addressed a step by index alone and therefore all     |
| acted on `notes.find(n => n.step === step)` — the first member in array       |
| order, which is insertion order (updateNote's sort is by step only, and       |
| Array.prototype.sort is stable):                                             |
|                                                                              |
|   1. StepGrid drew ONE block per step, showing the first member's duration,   |
|      velocity and probability. The rest of the chord was invisible.          |
|   2. StepPropertiesEditor edited the first member's pitch, velocity,          |
|      probability and P-locks, whatever the user thought they had selected.   |
|   3. Right-click-erase deleted the first member only, so erasing a triad      |
|      took three clicks and the block never appeared to go away.              |
|   4. handleExportStep baked the first member's P-locks into the clone and     |
|      silently discarded the others'.                                         |
|                                                                              |
| Addressing is `(step, pitch)`, not a new note id. That is already this        |
| codebase's convention — `notePitch` is in the signature of updateNote,        |
| onUpdateNote and onToggleStep, added when Snap-to-Scale was destroying        |
| chords — and it needs no change to the stored shape, so no save-file          |
| migration (roadmap §4 constraint 4 gates schema-touching writes behind C1's   |
| version field). A pitch is also the natural key for the piano roll, where a   |
| row IS a pitch, and for F1's drum roll, where a lane is.                     |
|                                                                              |
| `(step, pitch)` is only a valid key if it is unique, and it was not: setting  |
| a note's pitch onto a sibling's produced two notes at the same (step, pitch). |
| Enforcing that invariant is part of the fix, not an aside.                    |
================================================================================
*/
import React from 'react';
import { act, cleanup, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ReactFlowProvider, Node } from '@xyflow/react';
import { StepGrid } from '../../components/Sequencer/StepGrid';
import { StepPropertiesEditor } from '../../components/Sequencer/StepPropertiesEditor';
import { useEditorState } from '../../hooks/nodeEditor/useEditorState';
import { NodeParams, SequencerTrack } from '../../definitions/types';

afterEach(cleanup);

const chordTrack: SequencerTrack = {
    id: 't1',
    targetNodeId: 'inst-1',
    name: 'Keys',
    color: '#007acc',
    steps: 16,
    notes: [
        { step: 4, note: 60, velocity: 1.0, duration: 1, patchOverrides: { 'Osc:amplitude': 0.9 } },
        { step: 4, note: 64, velocity: 0.5, duration: 4, patchOverrides: { 'Osc:amplitude': 0.1 } },
        { step: 4, note: 67, velocity: 0.2, duration: 2 },
    ],
    isMuted: false,
    isSolo: false,
};

// ---------------------------------------------------------------------------
// (1) StepGrid draws the whole chord.
// ---------------------------------------------------------------------------
describe('SKB-025 (1) — StepGrid shows every chord member', () => {
    const renderGrid = (props: Partial<React.ComponentProps<typeof StepGrid>> = {}) => render(
        <StepGrid
            tracks={[chordTrack]}
            currentStep={0}
            steps={16}
            onToggleStep={vi.fn()}
            bpm={120}
            {...props}
        />
    );

    it('draws one block per pitch, not one per step', () => {
        renderGrid();
        for (const pitch of [60, 64, 67]) {
            expect(
                screen.getByTestId(`step-note-t1-4-${pitch}`),
                `pitch ${pitch} is not drawn`,
            ).toBeTruthy();
        }
    });

    it('says how many notes the step holds', () => {
        renderGrid();
        expect(screen.getByTestId('step-t1-4').getAttribute('title')).toContain('3 notes');
    });

    it('leaves a single note reading as a single note', () => {
        render(
            <StepGrid
                tracks={[{ ...chordTrack, notes: [{ step: 4, note: 60, velocity: 1, duration: 1 }] }]}
                currentStep={0}
                steps={16}
                onToggleStep={vi.fn()}
                bpm={120}
            />
        );
        expect(screen.getByTestId('step-note-t1-4-60')).toBeTruthy();
        expect(screen.getByTitle(/Step 4: Dur 1/)).toBeTruthy();
    });
});

// ---------------------------------------------------------------------------
// (3) Right-click erase.
// ---------------------------------------------------------------------------
describe('SKB-025 (3) — right-click erase acts on the whole step, explicitly', () => {
    it('clears every member in one gesture instead of the first one silently', () => {
        const onClearStep = vi.fn();
        const onToggleStep = vi.fn();
        render(
            <StepGrid
                tracks={[chordTrack]}
                currentStep={0}
                steps={16}
                onToggleStep={onToggleStep}
                onClearStep={onClearStep}
                bpm={120}
            />
        );
        fireEvent.mouseDown(screen.getByTestId('step-t1-4'), { button: 2 });
        expect(onClearStep).toHaveBeenCalledWith('t1', 4);
        // Never the ambiguous single-member delete.
        expect(onToggleStep).not.toHaveBeenCalled();
    });

    it('does nothing on an empty step', () => {
        const onClearStep = vi.fn();
        render(
            <StepGrid
                tracks={[chordTrack]}
                currentStep={0}
                steps={16}
                onToggleStep={vi.fn()}
                onClearStep={onClearStep}
                bpm={120}
            />
        );
        fireEvent.mouseDown(screen.getByTestId('step-t1-7'), { button: 2 });
        expect(onClearStep).not.toHaveBeenCalled();
    });
});

// ---------------------------------------------------------------------------
// (1b) Selection carries a pitch.
// ---------------------------------------------------------------------------
describe('SKB-025 — selecting a step names which note is selected', () => {
    it('selects the pitch whose block was clicked', () => {
        const onStepContext = vi.fn();
        render(
            <StepGrid
                tracks={[chordTrack]}
                currentStep={0}
                steps={16}
                onToggleStep={vi.fn()}
                onStepContext={onStepContext}
                bpm={120}
            />
        );
        fireEvent.mouseDown(screen.getByTestId('step-note-t1-4-64'), { button: 0 });
        expect(onStepContext).toHaveBeenCalledWith('t1', 4, 64, expect.any(Number), expect.any(Number));
    });

    it('falls back to the lowest pitch when the cell itself is clicked', () => {
        // Deterministic, and musically the root — not "whichever was inserted
        // first", which is what array order meant.
        const onStepContext = vi.fn();
        render(
            <StepGrid
                tracks={[{ ...chordTrack, notes: [
                    { step: 4, note: 67, velocity: 1, duration: 1 },
                    { step: 4, note: 60, velocity: 1, duration: 1 },
                ] }]}
                currentStep={0}
                steps={16}
                onToggleStep={vi.fn()}
                onStepContext={onStepContext}
                bpm={120}
            />
        );
        fireEvent.mouseDown(screen.getByTestId('step-t1-4'), { button: 0 });
        expect(onStepContext).toHaveBeenCalledWith('t1', 4, 60, expect.any(Number), expect.any(Number));
    });

    it('names the pitch it is about to create on an empty step', () => {
        const onStepContext = vi.fn();
        const onToggleStep = vi.fn();
        render(
            <StepGrid
                tracks={[chordTrack]}
                currentStep={0}
                steps={16}
                onToggleStep={onToggleStep}
                onStepContext={onStepContext}
                bpm={120}
            />
        );
        fireEvent.mouseDown(screen.getByTestId('step-t1-9'), { button: 0 });
        expect(onToggleStep).toHaveBeenCalledWith('t1', 9, 60);
        expect(onStepContext).toHaveBeenCalledWith('t1', 9, 60, expect.any(Number), expect.any(Number));
    });
});

// ---------------------------------------------------------------------------
// (1c) Modifier-drag edits the grabbed member.
// ---------------------------------------------------------------------------
describe('SKB-025 — a modifier-drag edits the note that was grabbed', () => {
    it('commits against the grabbed pitch, not the first at the step', () => {
        const onUpdateNote = vi.fn();
        render(
            <StepGrid
                tracks={[chordTrack]}
                currentStep={0}
                steps={16}
                onToggleStep={vi.fn()}
                onUpdateNote={onUpdateNote}
                bpm={120}
            />
        );
        const block = screen.getByTestId('step-note-t1-4-67');
        fireEvent.mouseDown(block, { button: 0, ctrlKey: true, clientX: 10, clientY: 100 });
        fireEvent.mouseMove(window, { clientX: 10, clientY: 60 });
        fireEvent.mouseUp(window);

        expect(onUpdateNote).toHaveBeenCalledTimes(1);
        const [trackId, step, changes, pitch] = onUpdateNote.mock.calls[0];
        expect([trackId, step, pitch]).toEqual(['t1', 4, 67]);
        expect(changes.velocity).toBeGreaterThan(0.2);
    });
});

// ---------------------------------------------------------------------------
// (2) Step properties.
// ---------------------------------------------------------------------------
describe('SKB-025 (2) — StepPropertiesEditor edits the note it was given', () => {
    const instrumentNode = {
        id: 'inst-1',
        type: 'instrument',
        position: { x: 0, y: 0 },
        data: {
            label: 'Keys', name: 'Keys',
            subgraph: {
                nodes: [{ id: 'osc-1', type: 'oscillator', position: { x: 0, y: 0 }, data: { label: 'Osc', amplitude: 0.5 } }],
                connections: [],
            },
        },
    } as unknown as Node<NodeParams>;

    const renderPanel = (notePitch: number | undefined, onUpdateNote = vi.fn(), onSelectNote = vi.fn()) => {
        render(
            <StepPropertiesEditor
                trackId="t1"
                step={4}
                notePitch={notePitch}
                track={chordTrack}
                onUpdateNote={onUpdateNote}
                onSelectNote={onSelectNote}
                instrumentNode={instrumentNode}
            />
        );
        return { onUpdateNote, onSelectNote };
    };

    it('shows the requested member, not the first in the array', () => {
        renderPanel(67);
        // Velocity 0.2 belongs to the G, not the C the array happens to hold first.
        expect(screen.getByText(/Vel \(20%\)/)).toBeTruthy();
    });

    it('addresses edits to the requested member', () => {
        const { onUpdateNote } = renderPanel(64);
        fireEvent.change(screen.getByTestId('step-probability'), { target: { value: '0.5' } });
        expect(onUpdateNote).toHaveBeenCalledWith('t1', 4, { probability: 0.5 }, 64);
    });

    it('addresses P-lock edits to the requested member', () => {
        const { onUpdateNote } = renderPanel(64);
        fireEvent.click(screen.getByTestId('plock-lock-Osc:amplitude'));
        // The E already overrides amplitude at 0.1, so the lock REMOVES it —
        // and must remove it from the E, not from the C.
        expect(onUpdateNote).toHaveBeenCalledWith('t1', 4, { patchOverrides: {} }, 64);
    });

    // Retuning MOVES the address. The panel renders from
    // `selectedStep.notePitch`, so without a companion select the write lands,
    // the note is now at the new pitch, and the next render finds nothing at
    // the old one: the whole editor is replaced by "No note at pitch 60 on
    // Step 4" after a single keystroke in the MIDI box.
    it('follows the note when its pitch is edited, instead of losing the selection', () => {
        const { onUpdateNote, onSelectNote } = renderPanel(60);
        const midiBox = screen.getAllByRole('spinbutton')[0];
        fireEvent.change(midiBox, { target: { value: '61' } });
        fireEvent.blur(midiBox);
        expect(onUpdateNote).toHaveBeenCalledWith('t1', 4, { note: 61 }, 60);
        expect(onSelectNote).toHaveBeenCalledWith('t1', 4, 61);
    });

    it('does not re-select when the pitch box commits an unchanged value', () => {
        const { onSelectNote } = renderPanel(60);
        const midiBox = screen.getAllByRole('spinbutton')[0];
        fireEvent.change(midiBox, { target: { value: '60' } });
        fireEvent.blur(midiBox);
        expect(onSelectNote).not.toHaveBeenCalled();
    });

    it('lists the chord so another member can be picked', () => {
        const { onSelectNote } = renderPanel(60);
        expect(screen.getByTestId('chord-members').textContent).toContain('3 notes');
        fireEvent.click(screen.getByTestId('select-note-67'));
        expect(onSelectNote).toHaveBeenCalledWith('t1', 4, 67);
    });

    it('says nothing about a chord when the step holds one note', () => {
        render(
            <StepPropertiesEditor
                trackId="t1"
                step={4}
                notePitch={60}
                track={{ ...chordTrack, notes: [{ step: 4, note: 60, velocity: 1, duration: 1 }] }}
                onUpdateNote={vi.fn()}
                instrumentNode={instrumentNode}
            />
        );
        expect(screen.queryByTestId('chord-members')).toBeNull();
    });

    it('reports a pitch that is no longer at the step rather than editing a neighbour', () => {
        renderPanel(72);
        expect(screen.getByText(/No note/)).toBeTruthy();
    });
});

// ---------------------------------------------------------------------------
// (4) Export-Step.
// ---------------------------------------------------------------------------
const wrapper = ({ children }: { children: React.ReactNode }) => (
    <ReactFlowProvider>{children}</ReactFlowProvider>
);

const instrument = (): Node<NodeParams> => ({
    id: 'inst-1',
    type: 'instrument',
    position: { x: 0, y: 0 },
    data: {
        label: 'Keys', name: 'Keys', voiceCount: 8, glide: 0, unison: 1, detune: 0,
        inputs: [], outputs: [],
        subgraph: {
            nodes: [{ id: 'osc-1', type: 'oscillator', position: { x: 0, y: 0 }, data: { label: 'Osc', amplitude: 0.5 } }],
            connections: [],
        },
    },
} as unknown as Node<NodeParams>);

describe('SKB-025 (4) — handleExportStep bakes the member it was asked for', () => {
    const seed = () => {
        const { result } = renderHook(() => useEditorState(), { wrapper });
        act(() => { result.current.setNodes([instrument()]); });
        const trackId = result.current.tracks[0].id;
        act(() => { result.current.toggleStep(trackId, 4, 60); });
        act(() => { result.current.toggleStep(trackId, 4, 64); });
        act(() => { result.current.updateNote(trackId, 4, { patchOverrides: { 'Osc:amplitude': 0.9 } }, 60); });
        act(() => { result.current.updateNote(trackId, 4, { patchOverrides: { 'Osc:amplitude': 0.1 } }, 64); });
        return { result, trackId };
    };

    const clonedAmplitude = (result: { current: ReturnType<typeof useEditorState> }, id: string) => {
        const clone = result.current.nodes.find(n => n.id === id)!;
        const sub = (clone.data as { subgraph: { nodes: { data: { amplitude: number } }[] } }).subgraph.nodes[0];
        return sub.data.amplitude;
    };

    it('uses the named chord member', () => {
        const { result, trackId } = seed();
        let id: string | null = null;
        act(() => { id = result.current.handleExportStep(trackId, 4, 64); });
        expect(id).toBeTruthy();
        expect(clonedAmplitude(result, id!)).toBe(0.1);
    });

    it('uses the OTHER member when that is the one named', () => {
        const { result, trackId } = seed();
        let id: string | null = null;
        act(() => { id = result.current.handleExportStep(trackId, 4, 60); });
        expect(clonedAmplitude(result, id!)).toBe(0.9);
    });

    it('refuses a pitch that is not at the step', () => {
        const { result, trackId } = seed();
        let id: string | null = 'x';
        act(() => { id = result.current.handleExportStep(trackId, 4, 72); });
        expect(id).toBeNull();
    });
});

// ---------------------------------------------------------------------------
// The invariant that makes (step, pitch) a key at all.
// ---------------------------------------------------------------------------
describe('SKB-025 — (step, pitch) is unique', () => {
    it('retunes a note onto a sibling without leaving two notes at one pitch', () => {
        const { result } = renderHook(() => useEditorState(), { wrapper });
        act(() => { result.current.setNodes([instrument()]); });
        const trackId = result.current.tracks[0].id;
        act(() => { result.current.toggleStep(trackId, 4, 60); });
        act(() => { result.current.toggleStep(trackId, 4, 64); });
        expect(result.current.tracks[0].notes).toHaveLength(2);

        // Retune the C up to the E, where a note already sits. Addressing by
        // (step, pitch) is only meaningful if this cannot produce two notes at
        // (4, 64) — which is exactly what it used to produce.
        act(() => { result.current.updateNote(trackId, 4, { note: 64 }, 60); });

        const notes = result.current.tracks[0].notes;
        expect(notes).toHaveLength(1);
        expect(notes[0].note).toBe(64);
    });
});
