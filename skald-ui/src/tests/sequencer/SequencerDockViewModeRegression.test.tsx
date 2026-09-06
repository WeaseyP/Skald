// @vitest-environment jsdom
/*
================================================================================
| Roadmap F4 regression — "the piano roll doesn't appear to work anymore at    |
| all."                                                                        |
|                                                                              |
| Root cause: SequencerDock resolved `resolveTrackViewMode` on every render    |
| instead of once when the editor opened. `detectTrackViewMode`'s one-pitch    |
| rule used to fire the instant a track had ANY notes at all (one distinct     |
| pitch), so painting the very FIRST note into a fresh melodic track's Piano   |
| Roll flipped the dock's re-resolved mode to percussive and swapped the open  |
| Piano Roll for the one-row Drum Roll out from under the user. Every         |
| melodic pattern was unbuildable past its first note.                        |
|                                                                              |
| These tests mount SequencerDock over the REAL useSequencerState hook (not a  |
| hand-rolled `state` prop, unlike the "which editor Edit opens" describe in   |
| DrumRoll.test.tsx) so a note actually painted through the real mutation      |
| path is what re-renders the dock — the same path the bug report went        |
| through.                                                                    |
================================================================================
*/
import React from 'react';
import { Node } from '@xyflow/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ScaleProvider } from '../../contexts/ScaleContext';
import { NodeParams } from '../../definitions/types';
import { SequencerDock } from '../../components/Sequencer/SequencerDock';
import { useSequencerState } from '../../hooks/sequencer/useSequencerState';

// A pitch-tracking oscillator (fixedPitch: false) — the same shape
// DrumRoll.test.tsx's `bassInstrument` uses — so a fresh track on it starts
// melodic (no notes yet) and stays eligible for the one-pitch fallback once
// notes are painted.
const melodicInstrument: Node<NodeParams> = {
    id: 'inst-bass',
    type: 'instrument',
    position: { x: 0, y: 0 },
    data: {
        label: 'Bass',
        subgraph: {
            nodes: [{ id: 'o', type: 'oscillator', position: { x: 0, y: 0 }, data: { fixedPitch: false } }],
            connections: [],
        },
    },
} as unknown as Node<NodeParams>;

// A fixed-pitch oscillator: no source can hear the note, so this track
// resolves percussive even with zero notes (trackViewMode.ts's first rule).
const percussiveInstrument: Node<NodeParams> = {
    id: 'inst-kick',
    type: 'instrument',
    position: { x: 0, y: 0 },
    data: {
        label: 'Kick',
        subgraph: {
            nodes: [{ id: 'o', type: 'oscillator', position: { x: 0, y: 0 }, data: { fixedPitch: true } }],
            connections: [],
        },
    },
} as unknown as Node<NodeParams>;

/** Mounts the real useSequencerState hook behind SequencerDock, the way
 * app.tsx does, so a paint/toggle click runs through the actual mutation and
 * re-render path the bug report went through. */
const Harness: React.FC<{
    nodes: Node<NodeParams>[];
    pushHistory: (label: string, options?: unknown) => void;
    onStepSelect?: (trackId: string, step: number, notePitch: number) => void;
}> = ({ nodes, pushHistory, onStepSelect = vi.fn() }) => {
    const seq = useSequencerState({ pushHistory: pushHistory as never });

    React.useEffect(() => {
        seq.syncInstrumentTracks(
            nodes.filter(n => n.type === 'instrument').map(n => ({
                id: n.id,
                name: (n.data as { label?: string })?.label ?? 'Instrument',
            })),
        );
        // Reconciliation only needs to run once per instrument list.
    }, [nodes]);

    return (
        <ScaleProvider>
            <SequencerDock
                state={{ isPlaying: false, currentStep: 0, tracks: seq.tracks }}
                nodes={nodes}
                isBuilding={false}
                bpm={120}
                setBpm={vi.fn()}
                patternSteps={16}
                setPatternSteps={vi.fn()}
                masterVolume={0.8}
                setMasterVolume={vi.fn()}
                onPlay={vi.fn()}
                onStop={vi.fn()}
                onToggleLoop={vi.fn()}
                isLooping={false}
                onMuteToggle={seq.toggleMute}
                onSoloToggle={seq.toggleSolo}
                onFocusTrack={vi.fn()}
                onToggleStep={seq.toggleStep}
                onClearStep={seq.clearStep}
                onUpdateNote={seq.updateNote}
                onUpdateSteps={seq.updateTrackSteps}
                onStepSelect={onStepSelect}
                onSetTrackViewMode={seq.setTrackViewMode}
                onSetTrackDefaultNote={seq.setTrackDefaultNote}
                analyserNode={null}
                meterAnalysers={null}
            />
        </ScaleProvider>
    );
};

const KEY_WIDTH = 50;
const STEP_WIDTH = 30; // PIANO_STEP_WIDTH_DEFAULT; jsdom reports 0 container width.
const clientXForStep = (step: number) => KEY_WIDTH + step * STEP_WIDTH + 1;

describe('SequencerDock — resolves the open editor once (F4 regression)', () => {
    afterEach(cleanup);

    it('keeps the Piano Roll open across painting notes that would flip a re-resolved guess', () => {
        render(<Harness nodes={[melodicInstrument]} pushHistory={vi.fn()} />);

        fireEvent.click(screen.getByText('Edit'));
        expect(screen.getByTestId('piano-roll-scroll-container')).toBeTruthy();
        expect(screen.queryByTestId('drum-roll')).toBeNull();

        // Paint four notes at the SAME pitch — one distinct pitch, four notes,
        // which is exactly the new detectTrackViewMode fallback's threshold
        // (trackViewMode.ts). Under the bug (re-resolve every render, or the
        // old notes.length > 0 threshold) this is where the Piano Roll used
        // to vanish out from under the user.
        const row = screen.getByTestId('piano-roll-note-60');
        for (let step = 0; step < 4; step++) {
            fireEvent.mouseDown(row, { button: 0, clientX: clientXForStep(step) });
            expect(
                screen.getByTestId('piano-roll-scroll-container'),
                `Piano Roll should still be mounted after painting note ${step + 1}`,
            ).toBeTruthy();
            expect(screen.queryByTestId('drum-roll')).toBeNull();
        }
    });

    it('opens the Drum Roll for a track that resolves percussive and keeps it open as notes are painted', () => {
        render(<Harness nodes={[percussiveInstrument]} pushHistory={vi.fn()} />);

        fireEvent.click(screen.getByText('Edit'));
        expect(screen.getByTestId('drum-roll')).toBeTruthy();

        fireEvent.mouseDown(screen.getByTestId('drum-roll-cell-0'), { button: 0 });
        expect(screen.getByTestId('drum-roll')).toBeTruthy();
        expect(screen.queryByTestId('piano-roll-scroll-container')).toBeNull();
    });
});

describe('SequencerDock — explicit Piano Roll / Drum Roll toggle in the open editor (F4 item 3)', () => {
    afterEach(cleanup);

    it('switches the mounted editor and writes viewMode through history exactly once', () => {
        const pushHistory = vi.fn();
        render(<Harness nodes={[percussiveInstrument]} pushHistory={pushHistory} />);

        fireEvent.click(screen.getByText('Edit'));
        expect(screen.getByTestId('drum-roll')).toBeTruthy();

        pushHistory.mockClear();
        fireEvent.click(screen.getByTestId('view-mode-toggle-piano'));

        expect(screen.getByTestId('piano-roll-scroll-container')).toBeTruthy();
        expect(screen.queryByTestId('drum-roll')).toBeNull();
        expect(pushHistory).toHaveBeenCalledTimes(1);

        // And back, from inside the Piano Roll this time.
        pushHistory.mockClear();
        fireEvent.click(screen.getByTestId('view-mode-toggle-drum'));
        expect(screen.getByTestId('drum-roll')).toBeTruthy();
        expect(screen.queryByTestId('piano-roll-scroll-container')).toBeNull();
        expect(pushHistory).toHaveBeenCalledTimes(1);
    });

    it('leaves the TrackList selector in sync after a header-toggle switch', () => {
        const pushHistory = vi.fn();
        render(<Harness nodes={[percussiveInstrument]} pushHistory={pushHistory} />);

        fireEvent.click(screen.getByText('Edit'));
        fireEvent.click(screen.getByTestId('view-mode-toggle-piano'));

        const select = screen.getByTestId(/^track-view-mode-/) as HTMLSelectElement;
        expect(select.value).toBe('melodic');
    });
});

describe('SequencerDock — Piano Roll basics end to end (F1 hook extraction sanity)', () => {
    afterEach(cleanup);

    it('opens the editor, paints a note, selects it by right-click, and drags its duration', () => {
        const onStepSelect = vi.fn();
        render(<Harness nodes={[melodicInstrument]} pushHistory={vi.fn()} onStepSelect={onStepSelect} />);

        fireEvent.click(screen.getByText('Edit'));
        const row = screen.getByTestId('piano-roll-note-60');

        // Paint one note at step 2.
        fireEvent.mouseDown(row, { button: 0, clientX: clientXForStep(2) });
        expect(screen.getByTestId('piano-roll-placed-note-2-60')).toBeTruthy();

        // Right-click selects it for Step Properties.
        fireEvent.contextMenu(row, { clientX: clientXForStep(2) });
        expect(onStepSelect).toHaveBeenCalledWith(expect.any(String), 2, 60);

        // Drag the resize handle 3 steps right (90px at the 30px fallback
        // width) and release — the same gesture PianoRoll.test.tsx exercises
        // directly, run here through the dock to prove the wiring between
        // them survives.
        const handle = screen.getByTestId('piano-roll-resize-2-60');
        fireEvent.mouseDown(handle, { button: 0, clientX: 0 });
        fireEvent.mouseMove(window, { clientX: 90 });
        fireEvent.mouseUp(window);

        const placed = screen.getByTestId('piano-roll-placed-note-2-60');
        // duration 1 -> 4 steps: width = 4 * 30 - 2 = 118px.
        expect(placed.getAttribute('style')).toContain('width: 118px');
    });
});
