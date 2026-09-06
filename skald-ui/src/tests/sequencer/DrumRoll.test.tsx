// @vitest-environment jsdom
/*
================================================================================
| Roadmap F2 — the Drum Roll.                                                  |
|                                                                              |
| The gestures are the Piano Roll's, minus the pitch axis, so the risks are    |
| the ones a missing axis creates: a hit painted at the wrong pitch, a note    |
| the single row cannot draw and therefore hides, and a velocity drag that     |
| commits on every mousemove instead of once on release. One test each.        |
================================================================================
*/
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { SequencerTrack } from '../../definitions/types';
import { DrumRoll } from '../../components/Sequencer/DrumRoll';
import { canonicalDrumPitch, GM_DRUM_PITCHES } from '../../components/Sequencer/drumKit';
import { SequencerDock } from '../../components/Sequencer/SequencerDock';
import { ScaleProvider } from '../../contexts/ScaleContext';

const drumTrack: SequencerTrack = {
    id: 'kick-track',
    targetNodeId: 'inst-kick',
    name: 'SNES Kick',
    color: '#d95',
    steps: 16,
    notes: [
        { step: 0, note: 36, velocity: 1, duration: 1 },
        { step: 8, note: 36, velocity: 0.5, duration: 1 },
    ],
    isMuted: false,
    isSolo: false,
    viewMode: 'percussive',
};

describe('canonicalDrumPitch', () => {
    it('prefers an explicit defaultNote over everything else', () => {
        expect(canonicalDrumPitch({ ...drumTrack, defaultNote: 41 })).toBe(41);
    });

    it('reads the pitch the track already uses, not the name', () => {
        // The track is called "SNES Kick" but is written on 38. What is on the
        // grid wins: painting a new hit at 36 would put it in a lane the row
        // cannot show as separate from the rest.
        const misnamed = { ...drumTrack, notes: [{ step: 0, note: 38, velocity: 1, duration: 1 }] };
        expect(canonicalDrumPitch(misnamed)).toBe(38);
    });

    it('takes the most frequent pitch when a track holds several', () => {
        const mixed = {
            ...drumTrack,
            notes: [
                { step: 0, note: 42, velocity: 1, duration: 1 },
                { step: 2, note: 42, velocity: 1, duration: 1 },
                { step: 4, note: 46, velocity: 1, duration: 1 },
            ],
        };
        expect(canonicalDrumPitch(mixed)).toBe(42);
    });

    it('breaks a tie on the lower pitch rather than on insertion order', () => {
        const tied = {
            ...drumTrack,
            notes: [
                { step: 0, note: 46, velocity: 1, duration: 1 },
                { step: 4, note: 42, velocity: 1, duration: 1 },
            ],
        };
        expect(canonicalDrumPitch(tied)).toBe(42);
    });

    it('guesses from the GM drum map by name when the track is empty', () => {
        const empty = (name: string) => canonicalDrumPitch({ ...drumTrack, name, notes: [] });
        expect(empty('SNES Kick')).toBe(GM_DRUM_PITCHES.kick);
        expect(empty('Snare 2')).toBe(GM_DRUM_PITCHES.snare);
        expect(empty('Closed Hat')).toBe(GM_DRUM_PITCHES.hat);
        expect(empty('Floor Tom')).toBe(GM_DRUM_PITCHES.tom);
        expect(empty('Handclap')).toBe(GM_DRUM_PITCHES.clap);
    });

    it('falls back to middle C when the name says nothing', () => {
        expect(canonicalDrumPitch({ ...drumTrack, name: 'Layer 3', notes: [] })).toBe(60);
    });
});

describe('DrumRoll', () => {
    afterEach(cleanup);

    // The spies are returned separately from the props so their Mock types
    // survive: spreading them through a Partial<Props> widens them back to
    // plain function types and `.mock` stops existing.
    const renderRoll = (overrides: Partial<React.ComponentProps<typeof DrumRoll>> = {}) => {
        const spies = {
            onToggleStep: vi.fn(),
            onClearStep: vi.fn(),
            onUpdateNote: vi.fn(),
            onSelectNote: vi.fn(),
            onSetDefaultNote: vi.fn(),
            onClose: vi.fn(),
        };
        render(
            <DrumRoll
                track={drumTrack}
                currentStep={0}
                steps={16}
                patternSteps={16}
                bpm={120}
                {...spies}
                {...overrides}
            />,
        );
        return spies;
    };

    it('draws one row of step cells, not a chromatic keyboard', () => {
        renderRoll();
        expect(screen.getAllByTestId(/^drum-roll-cell-\d+$/)).toHaveLength(16);
        // The chromatic editor's row testid must not appear anywhere here.
        expect(document.querySelectorAll('[data-testid^="piano-roll-note-"]')).toHaveLength(0);
    });

    it('paints a hit at the track\'s canonical pitch, not at middle C', () => {
        const { onToggleStep } = renderRoll();
        fireEvent.mouseDown(screen.getByTestId('drum-roll-cell-4'), { button: 0 });
        expect(onToggleStep).toHaveBeenCalledWith('kick-track', 4, 36);
    });

    it('continues a paint gesture across the cells the pointer sweeps', () => {
        const { onToggleStep } = renderRoll();
        fireEvent.mouseDown(screen.getByTestId('drum-roll-cell-4'), { button: 0 });
        fireEvent.mouseEnter(screen.getByTestId('drum-roll-cell-5'));
        fireEvent.mouseEnter(screen.getByTestId('drum-roll-cell-6'));
        expect(onToggleStep.mock.calls.map(c => c[1])).toEqual([4, 5, 6]);
    });

    it('clears the step when the gesture starts on a cell that already has a hit', () => {
        // A row has no pitch axis, so "erase" here can only mean the step —
        // the SKB-025 reasoning the Step Grid's right-click already follows.
        const { onClearStep, onToggleStep } = renderRoll();
        fireEvent.mouseDown(screen.getByTestId('drum-roll-cell-0'), { button: 0 });
        expect(onClearStep).toHaveBeenCalledWith('kick-track', 0);
        expect(onToggleStep).not.toHaveBeenCalled();
    });

    it('commits a velocity drag exactly once, on release', () => {
        const { onUpdateNote } = renderRoll();
        const handle = screen.getByTestId('drum-roll-velocity-0-36');
        fireEvent.mouseDown(handle, { clientX: 100, clientY: 100 });
        fireEvent.mouseMove(window, { clientX: 100, clientY: 130 });
        fireEvent.mouseMove(window, { clientX: 100, clientY: 150 });
        expect(onUpdateNote).not.toHaveBeenCalled();

        fireEvent.mouseUp(window);
        expect(onUpdateNote).toHaveBeenCalledTimes(1);
        const [trackId, step, changes, pitch] = onUpdateNote.mock.calls[0];
        expect([trackId, step, pitch]).toEqual(['kick-track', 0, 36]);
        // Dragging DOWN from a velocity of 1.0 lowers it, and it stays in 0..1.
        expect(changes.velocity).toBeLessThan(1);
        expect(changes.velocity).toBeGreaterThanOrEqual(0);
    });

    it('right-clicking a hit selects that (step, pitch) for Step Properties', () => {
        const { onSelectNote } = renderRoll();
        fireEvent.contextMenu(screen.getByTestId('drum-roll-hit-8-36'));
        expect(onSelectNote).toHaveBeenCalledWith('kick-track', 8, 36);
    });

    it('draws the playhead at the current step', () => {
        renderRoll({ currentStep: 5 });
        const playhead = screen.getByTestId('drum-roll-playhead').firstElementChild as HTMLElement;
        // The shared Playhead component positions by `left`; 5 columns in.
        expect(playhead.style.left).not.toBe('0px');
    });

    it('never hides a note that sits off the canonical pitch', () => {
        // A track flipped to Percussive can hold pitches the one row was not
        // built around. Drawing only the canonical lane would make those notes
        // invisible but still audible and still exported — the SKB-026 /
        // B5-x2 failure shape.
        renderRoll({
            track: {
                ...drumTrack,
                notes: [
                    { step: 2, note: 36, velocity: 1, duration: 1 },
                    { step: 2, note: 60, velocity: 1, duration: 1 },
                ],
            },
        });
        expect(screen.getByTestId('drum-roll-hit-2-36')).toBeTruthy();
        expect(screen.getByTestId('drum-roll-hit-2-60')).toBeTruthy();
        expect(screen.getByTestId('drum-roll-offpitch-notice').textContent).toContain('60');
    });

    it('lets the row edit its canonical pitch', () => {
        const { onSetDefaultNote } = renderRoll();
        const input = screen.getByTestId('drum-roll-default-note') as HTMLInputElement;
        fireEvent.change(input, { target: { value: '38' } });
        fireEvent.blur(input);
        expect(onSetDefaultNote).toHaveBeenCalledWith('kick-track', 38);
    });

    it('refuses to add a hit past the playable range but still erases one stranded there', () => {
        // B5-x2, the drum-roll half: a note past min(track, pattern) can never
        // sound, so nothing may be created there — but a note already stranded
        // there has to be reachable or it can only be deleted by raising the
        // pattern, deleting, and lowering it again.
        const { onToggleStep, onClearStep } = renderRoll({
            patternSteps: 8,
            track: { ...drumTrack, notes: [{ step: 12, note: 36, velocity: 1, duration: 1 }] },
        });
        fireEvent.mouseDown(screen.getByTestId('drum-roll-cell-10'), { button: 0 });
        expect(onToggleStep).not.toHaveBeenCalled();

        fireEvent.mouseDown(screen.getByTestId('drum-roll-cell-12'), { button: 0 });
        expect(onClearStep).toHaveBeenCalledWith('kick-track', 12);
    });
});

// ---------------------------------------------------------------------------
// F2/F4 — the dock's dispatch. The resolver decides; this asserts the dock
// actually reads it, in both directions. A track that resolves percussive but
// still opens the chromatic roll is the whole feature not landing.
// ---------------------------------------------------------------------------
describe('SequencerDock — which editor Edit opens', () => {
    afterEach(cleanup);

    const kickInstrument = {
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
    };
    const bassInstrument = {
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
    };

    const bassTrack: SequencerTrack = {
        id: 'bass-track', targetNodeId: 'inst-bass', name: 'Bass', color: '#07c',
        steps: 16, notes: [{ step: 0, note: 40, velocity: 1, duration: 1 }, { step: 4, note: 47, velocity: 1, duration: 1 }],
        isMuted: false, isSolo: false,
    };

    const renderDock = (tracks: SequencerTrack[], nodes: unknown[]) => render(
        <ScaleProvider>
            <SequencerDock
                state={{ isPlaying: false, currentStep: 0, tracks }}
                nodes={nodes as never}
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
                onMuteToggle={vi.fn()}
                onSoloToggle={vi.fn()}
                onFocusTrack={vi.fn()}
                onToggleStep={vi.fn()}
                onClearStep={vi.fn()}
                onUpdateNote={vi.fn()}
                onUpdateSteps={vi.fn()}
                onStepSelect={vi.fn()}
                onSetTrackViewMode={vi.fn()}
                onSetTrackDefaultNote={vi.fn()}
                analyserNode={null}
                meterAnalysers={null}
            />
        </ScaleProvider>,
    );

    it('opens the Drum Roll for a track that resolves percussive', () => {
        renderDock([drumTrack], [kickInstrument]);
        fireEvent.click(screen.getByTestId('track-edit-kick-track'));
        expect(screen.getByTestId('drum-roll')).toBeTruthy();
        expect(document.querySelector('[data-testid="piano-roll-scroll-container"]')).toBeNull();
    });

    it('still opens the Piano Roll for a melodic track', () => {
        renderDock([bassTrack], [bassInstrument]);
        fireEvent.click(screen.getByTestId('track-edit-bass-track'));
        expect(screen.getByTestId('piano-roll-scroll-container')).toBeTruthy();
        expect(document.querySelector('[data-testid="drum-roll"]')).toBeNull();
    });

    it('respects an explicit Melodic override on a drum patch', () => {
        renderDock([{ ...drumTrack, viewMode: 'melodic' }], [kickInstrument]);
        fireEvent.click(screen.getByTestId('track-edit-kick-track'));
        expect(screen.getByTestId('piano-roll-scroll-container')).toBeTruthy();
    });
});
