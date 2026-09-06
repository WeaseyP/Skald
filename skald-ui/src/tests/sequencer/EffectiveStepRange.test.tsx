// @vitest-environment jsdom
/*
================================================================================
| SKB-010 — the effective step range.                                          |
|                                                                              |
| A track plays `min(track.steps, patternSteps)` steps: its own loop length,    |
| bounded by the global pattern length. The generated sequencer makes this      |
| concrete — codegen_project.odin emits                                        |
|                                                                              |
|     switch p.current_step % <track_steps> { case <event.step>: ... }         |
|                                                                              |
| and advances `p.current_step` only up to `pattern_steps`. So a note at step  |
| 20 of a 16-step track compiles to a `case 20:` the modulo can never produce, |
| and steps 16..31 of a 32-step track never run when the pattern is 16 long.   |
| Neither editor respected the minimum: those cells were fully editable and     |
| silently inaudible.                                                          |
|                                                                              |
| The policy is KEEP the data and SHOW it. Dropping notes past the boundary     |
| would delete three quarters of the shipped                                   |
| examples/songs/full/four-bar-song.skald.json, whose tracks are 64 steps long  |
| and which carries no session block at all — so it loads at the default        |
| patternSteps of 16. The data is right there and the setting is what is wrong; |
| a serializer that trusted the setting over the data would silently destroy    |
| three bars of music on export.                                               |
================================================================================
*/
import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { StepGrid } from '../../components/Sequencer/StepGrid';
import { PianoRoll } from '../../components/Sequencer/PianoRoll';
import { ScaleProvider } from '../../contexts/ScaleContext';
import { SequencerTrack } from '../../definitions/types';
import {
    effectiveTrackSteps,
    outOfRangeNotes,
} from '../../components/Sequencer/stepMetrics';

afterEach(cleanup);

const baseTrack: SequencerTrack = {
    id: 't1',
    targetNodeId: 'inst-1',
    name: 'Track',
    color: '#007acc',
    steps: 16,
    notes: [],
    isMuted: false,
    isSolo: false,
};

describe('effectiveTrackSteps — one definition of "in range"', () => {
    it('is the smaller of the track loop and the global pattern', () => {
        expect(effectiveTrackSteps(32, 16)).toBe(16);
        expect(effectiveTrackSteps(16, 64)).toBe(16);
        expect(effectiveTrackSteps(16, 16)).toBe(16);
    });

    it('treats an absent track length as the 16-step default', () => {
        expect(effectiveTrackSteps(undefined, 64)).toBe(16);
        expect(effectiveTrackSteps(0, 64)).toBe(16);
    });

    it('treats an unset pattern length as no cap, exactly as the backend does', () => {
        // codegen_project.odin: `if global_steps <= 0` falls back to the
        // longest track rather than clamping anything, so a 0/NaN pattern
        // length must not shrink a track to a single step here either.
        expect(effectiveTrackSteps(16, 0)).toBe(16);
        expect(effectiveTrackSteps(32, 0)).toBe(16);
        expect(effectiveTrackSteps(NaN, NaN)).toBe(16);
    });
});

describe('outOfRangeNotes — the count that makes the loss non-silent', () => {
    it('lists exactly the notes past the effective boundary', () => {
        const track = {
            ...baseTrack,
            steps: 32,
            notes: [
                { step: 0, note: 60, velocity: 1, duration: 1 },
                { step: 15, note: 60, velocity: 1, duration: 1 },
                { step: 16, note: 62, velocity: 1, duration: 1 },
                { step: 20, note: 64, velocity: 1, duration: 1 },
            ],
        };
        expect(outOfRangeNotes(track, 16).map(n => n.step)).toEqual([16, 20]);
        // Raise the pattern and nothing is out of range any more — which is
        // why the data must survive the lowering.
        expect(outOfRangeNotes(track, 32)).toEqual([]);
    });
});

describe('SKB-010 StepGrid respects min(track.steps, patternSteps)', () => {
    it('distinguishes a looping column from one that never sounds', () => {
        // A 16-step track under a 64-step pattern: columns 16+ are not editable
        // but they DO sound — `p.current_step % 16` wraps to them. Saying
        // otherwise is the kind of message this packet exists to remove.
        render(
            <StepGrid
                tracks={[{ ...baseTrack, steps: 16 }]}
                currentStep={0}
                steps={64}
                onToggleStep={vi.fn()}
                bpm={120}
            />
        );
        const wrapped = screen.getByTestId('step-t1-20').getAttribute('title')!;
        expect(wrapped).toContain('replays step 4');
        expect(wrapped).not.toContain('never sounds');

        cleanup();

        render(
            <StepGrid
                tracks={[{ ...baseTrack, steps: 32 }]}
                currentStep={0}
                steps={16}
                onToggleStep={vi.fn()}
                bpm={120}
            />
        );
        expect(screen.getByTestId('step-t1-20').getAttribute('title')).toContain('never sounds');
    });

    it('refuses to edit a step past the global pattern length', () => {
        const onToggleStep = vi.fn();
        render(
            <StepGrid
                tracks={[{ ...baseTrack, steps: 32 }]}
                currentStep={0}
                steps={16}
                onToggleStep={onToggleStep}
                bpm={120}
            />
        );
        // Step 20 is inside the track's own 32-step loop but past the 16-step
        // pattern, so the generated code never reaches it.
        const cell = screen.getByTestId('step-t1-20');
        expect(cell.getAttribute('aria-disabled')).toBe('true');
        fireEvent.mouseDown(cell, { button: 0 });
        expect(onToggleStep).not.toHaveBeenCalled();
    });

    it('still edits the last in-range step', () => {
        const onToggleStep = vi.fn();
        render(
            <StepGrid
                tracks={[{ ...baseTrack, steps: 32 }]}
                currentStep={0}
                steps={16}
                onToggleStep={onToggleStep}
                bpm={120}
            />
        );
        const cell = screen.getByTestId('step-t1-15');
        expect(cell.getAttribute('aria-disabled')).toBe('false');
        fireEvent.mouseDown(cell, { button: 0 });
        // SKB-025: the created pitch is explicit now (middle C).
        expect(onToggleStep).toHaveBeenCalledWith('t1', 15, 60);
    });

    it('keeps an orphaned note visible after BOTH lengths are lowered', () => {
        // Lower the track to 16 and the pattern to 16 with a note still at 20:
        // maxSteps used to be max(patternSteps, ...trackSteps) = 16, so the
        // note had no column at all — invisible in the editor, still in the
        // save file, still in the export, and back again the moment the count
        // was raised.
        render(
            <StepGrid
                tracks={[{ ...baseTrack, steps: 16, notes: [{ step: 20, note: 60, velocity: 1, duration: 1 }] }]}
                currentStep={0}
                steps={16}
                onToggleStep={vi.fn()}
                bpm={120}
            />
        );
        const orphan = screen.getByTestId('step-t1-20');
        expect(orphan).toBeTruthy();
        // ...and says the truth about it. `p.current_step` runs 0..15 here, so
        // column 20 is not a moment at all — it does NOT replay step 4. The
        // wrap message is keyed on the column against the pattern length, not
        // on the track length against it; keyed the other way (trackLoop <=
        // steps) this said "replays step 4", which is the opposite of what the
        // generated code does.
        expect(orphan.getAttribute('title')).toContain('never sounds');
        expect(orphan.getAttribute('title')).not.toContain('replays');
    });

    it('says how many notes are not playing', () => {
        render(
            <StepGrid
                tracks={[{
                    ...baseTrack,
                    steps: 64,
                    notes: [
                        { step: 4, note: 60, velocity: 1, duration: 1 },
                        { step: 16, note: 60, velocity: 1, duration: 1 },
                        { step: 32, note: 60, velocity: 1, duration: 1 },
                        { step: 48, note: 60, velocity: 1, duration: 1 },
                    ],
                }]}
                currentStep={0}
                steps={16}
                onToggleStep={vi.fn()}
                bpm={120}
            />
        );
        const notice = screen.getByTestId('out-of-range-notice');
        expect(notice.textContent).toContain('3');
    });

    it('says nothing when everything is in range', () => {
        render(
            <StepGrid
                tracks={[{ ...baseTrack, notes: [{ step: 4, note: 60, velocity: 1, duration: 1 }] }]}
                currentStep={0}
                steps={16}
                onToggleStep={vi.fn()}
                bpm={120}
            />
        );
        expect(screen.queryByTestId('out-of-range-notice')).toBeNull();
    });
});

describe('SKB-010 PianoRoll respects min(track.steps, patternSteps)', () => {
    const renderRoll = (track: SequencerTrack, patternSteps: number, onToggleStep = vi.fn()) => {
        render(
            <ScaleProvider>
                <PianoRoll
                    track={track}
                    onUpdateNote={vi.fn()}
                    onToggleStep={onToggleStep}
                    currentStep={0}
                    steps={track.steps}
                    patternSteps={patternSteps}
                    onClose={vi.fn()}
                />
            </ScaleProvider>
        );
        return onToggleStep;
    };

    it('refuses to paint past the global pattern length', () => {
        const onToggleStep = renderRoll({ ...baseTrack, steps: 32 }, 16);
        const row = screen.getByTestId('piano-roll-note-60');
        // KEY_WIDTH 50 + step 20 at 30px columns.
        fireEvent.mouseDown(row, { button: 0, clientX: 50 + 20 * 30 + 1 });
        expect(onToggleStep).not.toHaveBeenCalled();
    });

    it('still paints the last in-range step', () => {
        const onToggleStep = renderRoll({ ...baseTrack, steps: 32 }, 16);
        const row = screen.getByTestId('piano-roll-note-60');
        fireEvent.mouseDown(row, { button: 0, clientX: 50 + 15 * 30 + 1 });
        expect(onToggleStep).toHaveBeenCalledWith('t1', 15, 60);
    });

    it('greys the unreachable columns instead of hiding them', () => {
        renderRoll({ ...baseTrack, steps: 32 }, 16);
        expect(screen.getByTestId('piano-roll-out-of-range')).toBeTruthy();
    });

    it('greys nothing when the whole track fits the pattern', () => {
        renderRoll({ ...baseTrack, steps: 16 }, 64);
        expect(screen.queryByTestId('piano-roll-out-of-range')).toBeNull();
    });

    it('surfaces the same count as the step grid', () => {
        renderRoll(
            { ...baseTrack, steps: 32, notes: [{ step: 20, note: 60, velocity: 1, duration: 1 }] },
            16
        );
        expect(screen.getByTestId('out-of-range-notice').textContent).toContain('1');
    });
});
