// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PianoRoll } from '../../components/Sequencer/PianoRoll';
import { ScaleProvider } from '../../contexts/ScaleContext';
import { SequencerTrack } from '../../definitions/types';
import { PIANO_STEP_WIDTH_DEFAULT, scrollTopForPitch } from '../../components/Sequencer/stepMetrics';
import { NARROW_QUERY, __resetMediaQueryCache } from '../../hooks/useViewport';

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

// ---------------------------------------------------------------------------
// B5-x5 — the notice names WHICH length is the limit.
// ---------------------------------------------------------------------------
describe('PianoRoll — out-of-range notice wording (B5-x5)', () => {
    afterEach(() => { cleanup(); });

    it('names the track length as the limit when it, not the pattern, is the shorter one', () => {
        const shortTrack: SequencerTrack = { ...track, steps: 4, notes: [{ step: 6, note: 24, velocity: 1, duration: 1 }] };
        render(
            <ScaleProvider>
                <PianoRoll track={shortTrack} onUpdateNote={vi.fn()} onToggleStep={vi.fn()} currentStep={0} steps={4} patternSteps={16} onClose={vi.fn()} />
            </ScaleProvider>
        );
        const text = screen.getByTestId('out-of-range-notice').textContent ?? '';
        // Before B5-x5 this read "at most 16 steps ... raise the pattern or
        // track length" — the pattern was not the limit, the track was.
        expect(text).toMatch(/this track's own length \(4 steps\) is the limit, not the pattern \(16\)/);
        expect(text).toMatch(/Raise the track length/);
    });
});

// ---------------------------------------------------------------------------
// E2 — note duration dragging. Notes render `pointerEvents: 'none'` so a
// click passes through to the row underneath (paint/remove); the resize
// handle is a narrow strip at the note's right edge that opts back into
// pointer events, so dragging IT (not the note body) changes duration.
// ---------------------------------------------------------------------------
describe('PianoRoll — note duration drag (E2)', () => {
    afterEach(() => { cleanup(); });

    const dragTrack: SequencerTrack = {
        id: 'drag-track',
        targetNodeId: 'drag-instrument',
        name: 'Drag',
        color: '#007acc',
        steps: 16,
        notes: [{ step: 2, note: 60, velocity: 1, duration: 2 }],
        isMuted: false,
        isSolo: false,
    };

    const renderDrag = (onUpdateNote = vi.fn()) => {
        render(
            <ScaleProvider>
                <PianoRoll
                    track={dragTrack}
                    onUpdateNote={onUpdateNote}
                    onToggleStep={vi.fn()}
                    currentStep={0}
                    steps={16}
                    onClose={vi.fn()}
                />
            </ScaleProvider>
        );
        return onUpdateNote;
    };

    it('drags the right-edge handle N steps and commits the new duration exactly once', () => {
        const onUpdateNote = renderDrag();
        const handle = screen.getByTestId('piano-roll-resize-2-60');

        fireEvent.mouseDown(handle, { button: 0, clientX: 0 });
        // jsdom reports 0 container width, so stepWidth falls back to
        // PIANO_STEP_WIDTH_DEFAULT (30). 90px = 3 steps.
        fireEvent.mouseMove(window, { clientX: 90 });
        fireEvent.mouseUp(window);

        expect(onUpdateNote).toHaveBeenCalledTimes(1);
        expect(onUpdateNote).toHaveBeenCalledWith('drag-track', 2, { duration: 5 }, 60);
    });

    it('clamps a drag below the minimum to one step', () => {
        const onUpdateNote = renderDrag();
        const handle = screen.getByTestId('piano-roll-resize-2-60');

        fireEvent.mouseDown(handle, { button: 0, clientX: 0 });
        fireEvent.mouseMove(window, { clientX: -900 });
        fireEvent.mouseUp(window);

        expect(onUpdateNote).toHaveBeenCalledTimes(1);
        expect(onUpdateNote).toHaveBeenCalledWith('drag-track', 2, { duration: 1 }, 60);
    });

    it('Escape cancels the drag without committing anything', () => {
        const onUpdateNote = renderDrag();
        const handle = screen.getByTestId('piano-roll-resize-2-60');

        fireEvent.mouseDown(handle, { button: 0, clientX: 0 });
        fireEvent.mouseMove(window, { clientX: 90 });
        fireEvent.keyDown(window, { key: 'Escape' });
        fireEvent.mouseUp(window);

        expect(onUpdateNote).not.toHaveBeenCalled();
    });

    it('leaves a plain click on the note body doing what it does today (paint/remove)', () => {
        const onToggleStep = vi.fn();
        render(
            <ScaleProvider>
                <PianoRoll
                    track={dragTrack}
                    onUpdateNote={vi.fn()}
                    onToggleStep={onToggleStep}
                    currentStep={0}
                    steps={16}
                    onClose={vi.fn()}
                />
            </ScaleProvider>
        );
        const row = screen.getByTestId('piano-roll-note-60');
        // KEY_WIDTH (50) + step 2 at the 30px fallback width.
        fireEvent.mouseDown(row, { button: 0, clientX: 50 + 2 * 30 + 1 });
        expect(onToggleStep).toHaveBeenCalledWith('drag-track', 2, 60);
    });
});

// ---------------------------------------------------------------------------
// E3 — per-note P-lock editing. A chord's members occupy different pitch
// ROWS in the roll (unlike the step grid, where they stack in one cell), so
// right-clicking a row at a given step names an unambiguous (step, pitch)
// exactly like StepGrid's left-click-selects-the-block gesture does via
// onStepContext -> onStepSelect (SequencerDock.tsx). Right-click, not left,
// because left is already spoken for here (paint an empty cell / remove a
// filled one).
// ---------------------------------------------------------------------------
describe('PianoRoll — per-note selection for Step Properties (E3)', () => {
    afterEach(() => { cleanup(); });

    const chordTrack: SequencerTrack = {
        id: 'chord-track',
        targetNodeId: 'chord-instrument',
        name: 'Chord',
        color: '#007acc',
        steps: 16,
        notes: [
            { step: 4, note: 60, velocity: 1, duration: 1 },
            { step: 4, note: 64, velocity: 1, duration: 1 },
        ],
        isMuted: false,
        isSolo: false,
    };

    const renderChord = (onSelectNote = vi.fn()) => {
        render(
            <ScaleProvider>
                <PianoRoll
                    track={chordTrack}
                    onUpdateNote={vi.fn()}
                    onToggleStep={vi.fn()}
                    onSelectNote={onSelectNote}
                    currentStep={0}
                    steps={16}
                    onClose={vi.fn()}
                />
            </ScaleProvider>
        );
        return onSelectNote;
    };

    it('right-clicking chord member A selects (trackId, step, pitchA)', () => {
        const onSelectNote = renderChord();
        const rowC = screen.getByTestId('piano-roll-note-60');
        fireEvent.contextMenu(rowC, { clientX: 50 + 4 * 30 + 1 });
        expect(onSelectNote).toHaveBeenCalledWith('chord-track', 4, 60);
    });

    it('right-clicking chord member B selects (trackId, step, pitchB)', () => {
        const onSelectNote = renderChord();
        const rowE = screen.getByTestId('piano-roll-note-64');
        fireEvent.contextMenu(rowE, { clientX: 50 + 4 * 30 + 1 });
        expect(onSelectNote).toHaveBeenCalledWith('chord-track', 4, 64);
    });

    it('does nothing on an empty cell', () => {
        const onSelectNote = renderChord();
        const rowD = screen.getByTestId('piano-roll-note-62');
        fireEvent.contextMenu(rowD, { clientX: 50 + 4 * 30 + 1 });
        expect(onSelectNote).not.toHaveBeenCalled();
    });

    it('the selection highlight follows the click from one member to the other', () => {
        renderChord();
        const rowC = screen.getByTestId('piano-roll-note-60');
        const rowE = screen.getByTestId('piano-roll-note-64');

        fireEvent.contextMenu(rowC, { clientX: 50 + 4 * 30 + 1 });
        const blockC = rowC.querySelector('[data-testid="piano-roll-placed-note-4-60"]')!;
        const blockE1 = rowE.querySelector('[data-testid="piano-roll-placed-note-4-64"]')!;
        expect(blockC.getAttribute('style')).toContain('outline: 2px solid');
        expect(blockE1.getAttribute('style')).not.toContain('outline: 2px solid');

        fireEvent.contextMenu(rowE, { clientX: 50 + 4 * 30 + 1 });
        const blockCAfter = rowC.querySelector('[data-testid="piano-roll-placed-note-4-60"]')!;
        const blockEAfter = rowE.querySelector('[data-testid="piano-roll-placed-note-4-64"]')!;
        expect(blockEAfter.getAttribute('style')).toContain('outline: 2px solid');
        expect(blockCAfter.getAttribute('style')).not.toContain('outline: 2px solid');
    });
});

// ---------------------------------------------------------------------------
// Roadmap F1 — the playhead scroll-follow was StepGrid-only (E13): on a
// narrow viewport the roll's horizontal scroll never moved to keep the
// playhead in view, unlike the step grid. usePlayheadScroll.ts is now the one
// implementation both read; this proves the roll actually opted in, not just
// that the hook exists in isolation.
// ---------------------------------------------------------------------------
describe('PianoRoll — playhead scroll-follow on narrow viewports (F1)', () => {
    afterEach(() => {
        cleanup();
        __resetMediaQueryCache();
        delete (window as unknown as { matchMedia?: unknown }).matchMedia;
    });

    const installMatchMedia = (matching: Record<string, boolean>) => {
        (window as unknown as { matchMedia: (q: string) => MediaQueryList }).matchMedia = (query: string) => ({
            matches: matching[query] ?? false,
            media: query,
            onchange: null,
            addEventListener: () => undefined,
            removeEventListener: () => undefined,
            addListener: () => undefined,
            removeListener: () => undefined,
            dispatchEvent: () => true,
        } as unknown as MediaQueryList);
        __resetMediaQueryCache();
    };

    const wideTrack: SequencerTrack = { ...track, steps: 64, notes: [] };

    it('scrolls to keep the playhead in view once the pattern overflows a narrow dock', () => {
        installMatchMedia({ [NARROW_QUERY]: true });
        const { rerender } = render(
            <ScaleProvider>
                <PianoRoll track={wideTrack} onUpdateNote={vi.fn()} onToggleStep={vi.fn()} currentStep={0} steps={64} onClose={vi.fn()} />
            </ScaleProvider>
        );
        const scroller = screen.getByTestId('piano-roll-scroll-container');
        // jsdom has no layout: give the scroller a viewport of its own, same
        // as ResponsiveSequencer.test.tsx does for StepGrid.
        Object.defineProperty(scroller, 'clientWidth', { value: 400, configurable: true });

        rerender(
            <ScaleProvider>
                <PianoRoll track={wideTrack} onUpdateNote={vi.fn()} onToggleStep={vi.fn()} currentStep={32} steps={64} onClose={vi.fn()} />
            </ScaleProvider>
        );

        // jsdom reports 0 container width pre-measurement, so stepWidth falls
        // back to PIANO_STEP_WIDTH_DEFAULT (30), exactly as the other tests
        // in this file already assume.
        expect(scroller.scrollLeft).toBe(32 * PIANO_STEP_WIDTH_DEFAULT - 200);
    });

    it('never moves a scroll position the user set by hand on the desktop', () => {
        installMatchMedia({ [NARROW_QUERY]: false });
        const { rerender } = render(
            <ScaleProvider>
                <PianoRoll track={wideTrack} onUpdateNote={vi.fn()} onToggleStep={vi.fn()} currentStep={0} steps={64} onClose={vi.fn()} />
            </ScaleProvider>
        );
        const scroller = screen.getByTestId('piano-roll-scroll-container');
        Object.defineProperty(scroller, 'clientWidth', { value: 400, configurable: true });
        scroller.scrollLeft = 120;

        rerender(
            <ScaleProvider>
                <PianoRoll track={wideTrack} onUpdateNote={vi.fn()} onToggleStep={vi.fn()} currentStep={32} steps={64} onClose={vi.fn()} />
            </ScaleProvider>
        );

        expect(scroller.scrollLeft).toBe(120);
    });
});
