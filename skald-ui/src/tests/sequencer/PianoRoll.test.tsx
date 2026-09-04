// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PianoRoll } from '../../components/Sequencer/PianoRoll';
import { ScaleProvider } from '../../contexts/ScaleContext';
import { SequencerTrack } from '../../definitions/types';
import { scrollTopForPitch } from '../../components/Sequencer/stepMetrics';

const track: SequencerTrack = {
    id: 'bass-track',
    targetNodeId: 'bass-instrument',
    name: 'Bass',
    color: '#007acc',
    steps: 16,
    notes: [{ step: 3, note: 24, velocity: 1, duration: 2 }],
    isMuted: false,
    isSolo: false
};

const renderPianoRoll = (onToggleStep = vi.fn()) => {
    render(
        <ScaleProvider>
            <PianoRoll
                track={track}
                onUpdateNote={vi.fn()}
                onToggleStep={onToggleStep}
                currentStep={0}
                steps={16}
                onClose={vi.fn()}
            />
        </ScaleProvider>
    );

    return onToggleStep;
};

describe('PianoRoll bass register', () => {
    afterEach(() => {
        cleanup();
    });

    it('renders the bass register and existing bass notes', () => {
        renderPianoRoll();

        expect(screen.getByText('A0')).toBeTruthy();
        expect(screen.getByText('C6')).toBeTruthy();

        const c1Row = screen.getByTestId('piano-roll-note-24');
        const paintedNote = c1Row.querySelector(
            'div[style*="left: 91px"][style*="width: 58px"]'
        );
        expect(paintedNote).toBeTruthy();
    });

    // SKB-026: the canvas was hardcoded to MIDI 21..84, so a chromatic editor
    // could not reach the top two octaves of the MIDI range at all — a note at
    // 96 or 108 existed in the track, played in the preview and shipped in the
    // export, but had no row to render in and no way to be edited or deleted.
    // The container was ALREADY `overflow: auto`, so the range was the only
    // thing standing between this and the full 0..127 canvas roadmap E4 wants.
    it('SKB-026: reaches every MIDI pitch, not just 21..84', () => {
        renderPianoRoll();

        for (const [pitch, name] of [
            [0, 'C-1'], [21, 'A0'], [84, 'C6'], [96, 'C7'], [108, 'C8'], [127, 'G9'],
        ] as const) {
            expect(
                screen.getByTestId(`piano-roll-note-${pitch}`),
                `MIDI ${pitch} (${name}) has no row`,
            ).toBeTruthy();
            expect(screen.getByText(name), `${name} has no key label`).toBeTruthy();
        }
        expect(screen.getAllByTestId(/^piano-roll-note-\d+$/)).toHaveLength(128);
    });

    it('SKB-026: renders a note above the old ceiling instead of dropping it', () => {
        render(
            <ScaleProvider>
                <PianoRoll
                    track={{ ...track, notes: [{ step: 2, note: 100, velocity: 1, duration: 1 }] }}
                    onUpdateNote={vi.fn()}
                    onToggleStep={vi.fn()}
                    currentStep={0}
                    steps={16}
                    onClose={vi.fn()}
                />
            </ScaleProvider>
        );
        const row = screen.getByTestId('piano-roll-note-100');
        expect(row.querySelector('div[style*="left: 61px"]')).toBeTruthy();
    });

    it('paints the clicked low pitch at the correct step', () => {
        const onToggleStep = renderPianoRoll();
        const a0Row = screen.getByTestId('piano-roll-note-21');

        fireEvent.mouseDown(a0Row, {
            button: 0,
            clientX: 50 + (5 * 30) + 1
        });

        expect(onToggleStep).toHaveBeenCalledWith('bass-track', 5, 21);
    });

    it('keeps the initial viewport centred on middle C', () => {
        renderPianoRoll();

        // Rows descend from MIDI_NOTE_MAX, so middle C sits at index
        // (127 - 60) = 67; jsdom reports clientHeight 0, so no half-viewport
        // correction is subtracted here.
        expect(screen.getByTestId('piano-roll-scroll-container').scrollTop)
            .toBe(scrollTopForPitch(60, 0));
    });
});

// ---------------------------------------------------------------------------
// B5-x2 / B5-x5 — stranded notes in the piano roll.
// ---------------------------------------------------------------------------
describe('PianoRoll — out-of-range notes (B5-x2, B5-x5)', () => {
    afterEach(() => { cleanup(); });

    // The track's own loop (4) is shorter than the pattern (16): the note at
    // step 6 never sounds, and the limit is the TRACK length.
    const shortTrack: SequencerTrack = { ...track, steps: 4, notes: [{ step: 6, note: 24, velocity: 1, duration: 1 }] };

    const renderShort = (onToggleStep = vi.fn()) => {
        render(
            <ScaleProvider>
                <PianoRoll track={shortTrack} onUpdateNote={vi.fn()} onToggleStep={onToggleStep} currentStep={0} steps={4} patternSteps={16} onClose={vi.fn()} />
            </ScaleProvider>
        );
        return onToggleStep;
    };

    // Geometry in jsdom: the container has no measured width, so the step
    // width is whatever stepWidthFor falls back to. Rather than assume it,
    // read the stranded block's own `left` (step * stepWidth + 4) and click
    // one pixel inside it. KEY_WIDTH (50) is the piano-key gutter.
    const clientXInsideStrandedNote = (): number => {
        const row = screen.getByTestId('piano-roll-note-24');
        // The note block is the rounded one; the 1px grid lines also carry
        // left/width and would otherwise be matched first.
        const block = Array.from(row.querySelectorAll('div')).find(d => /border-radius/.test(d.getAttribute('style') ?? '') && /left: \d+px/.test(d.getAttribute('style') ?? ''));
        const left = Number(/left: (\d+)px/.exec(block!.getAttribute('style')!)![1]);
        return 50 + left + 1;
    };

    it('a click on a stranded note removes it, a click on an empty greyed cell adds nothing', () => {
        const onToggleStep = renderShort();
        const x = clientXInsideStrandedNote();
        // Before B5-x2 handleGridMouseDown returned for every step >= playable.
        fireEvent.mouseDown(screen.getByTestId('piano-roll-note-24'), { button: 0, clientX: x, clientY: 0 });
        expect(onToggleStep).toHaveBeenCalledWith(shortTrack.id, 6, 24);

        onToggleStep.mockClear();
        fireEvent.mouseDown(screen.getByTestId('piano-roll-note-26'), { button: 0, clientX: x, clientY: 0 });
        expect(onToggleStep).not.toHaveBeenCalled();
    });
});
