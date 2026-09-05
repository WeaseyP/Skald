// @vitest-environment jsdom
//
// Roadmap E13, the hit areas.
//
// WCAG 2.2's target-size minimum is 24px and the comfortable floor for a
// fingertip is nearer 32. Skald was drawn for a mouse throughout: the step
// grid shrinks its columns to 10px before it will scroll, the piano roll's
// pitch lanes are 20px tall, and a range input's UA thumb is about 12px
// across. None of that is wrong with a mouse, and all of it is unusable with
// a finger.
//
// The floors live in stepMetrics.ts beside every other piece of grid
// geometry, so the grid and the roll cannot end up measuring the same axis
// with their own private constants — that is the SKB-002 lesson those modules
// already carry, extended to one more dimension.
import React from 'react';
import { render, cleanup, screen, fireEvent } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CustomSlider } from '../../components/controls/CustomSlider';
import { StepGrid } from '../../components/Sequencer/StepGrid';
import { PianoRoll } from '../../components/Sequencer/PianoRoll';
import { ShortcutLegend } from '../../components/ShortcutLegend';
import { ScaleProvider } from '../../contexts/ScaleContext';
import { SequencerTrack } from '../../definitions/types';
import {
    NOTE_ROW_HEIGHT,
    NOTE_ROW_HEIGHT_COARSE,
    STEP_WIDTH_MIN,
    STEP_WIDTH_MIN_COARSE,
    noteRowHeightFor,
    stepWidthMinFor,
    pianoStepWidthMinFor,
    PIANO_STEP_WIDTH_MIN,
    PIANO_STEP_WIDTH_MIN_COARSE,
} from '../../components/Sequencer/stepMetrics';
import { NARROW_QUERY, COARSE_POINTER_QUERY, __resetMediaQueryCache } from '../../hooks/useViewport';

const installPointer = (coarse: boolean) => {
    (window as unknown as { matchMedia: (q: string) => MediaQueryList }).matchMedia = (query: string) => ({
        matches: query === COARSE_POINTER_QUERY ? coarse : (query === NARROW_QUERY ? coarse : false),
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

// jsdom reports every element as 0x0. The grid sizes its cells from the
// container's measured width, so without this the shrink-to-fit path — the
// one the floor belongs to — never runs at all.
const stubMeasuredWidth = (px: number) => {
    Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
        configurable: true,
        get() { return px; },
    });
};

const track: SequencerTrack = {
    id: 'track-1', name: 'Lead', targetNodeId: 'n1', color: '#007acc',
    isMuted: false, isSolo: false, steps: 64, notes: [],
};

afterEach(() => {
    cleanup();
    __resetMediaQueryCache();
    delete (window as unknown as { matchMedia?: unknown }).matchMedia;
    // @ts-expect-error restoring jsdom's own zero-size getter
    delete HTMLElement.prototype.clientWidth;
    vi.restoreAllMocks();
});

describe('the coarse-pointer floors', () => {
    it('are the mouse ones under a mouse', () => {
        expect(stepWidthMinFor(false)).toBe(STEP_WIDTH_MIN);
        expect(pianoStepWidthMinFor(false)).toBe(PIANO_STEP_WIDTH_MIN);
        expect(noteRowHeightFor(false)).toBe(NOTE_ROW_HEIGHT);
    });

    it('clear 24px under a finger, and 32px on the axis a note is grabbed by', () => {
        expect(stepWidthMinFor(true)).toBe(STEP_WIDTH_MIN_COARSE);
        expect(STEP_WIDTH_MIN_COARSE).toBeGreaterThanOrEqual(24);
        expect(pianoStepWidthMinFor(true)).toBe(PIANO_STEP_WIDTH_MIN_COARSE);
        expect(noteRowHeightFor(true)).toBe(NOTE_ROW_HEIGHT_COARSE);
        expect(NOTE_ROW_HEIGHT_COARSE).toBeGreaterThanOrEqual(32);
    });
});

describe('the step grid', () => {
    it('stops shrinking its columns at the coarse floor and scrolls instead', () => {
        installPointer(true);
        stubMeasuredWidth(480);
        render(<StepGrid tracks={[track]} currentStep={0} steps={64} onToggleStep={vi.fn()} bpm={120} />);
        // 480 / 64 = 7px of fit, so the floor is what decides.
        expect(screen.getByTestId('step-track-1-0').style.width).toBe(`${STEP_WIDTH_MIN_COARSE}px`);
    });

    it('keeps the dense mouse grid under a mouse', () => {
        installPointer(false);
        stubMeasuredWidth(480);
        render(<StepGrid tracks={[track]} currentStep={0} steps={64} onToggleStep={vi.fn()} bpm={120} />);
        expect(screen.getByTestId('step-track-1-0').style.width).toBe(`${STEP_WIDTH_MIN}px`);
    });
});

describe('the piano roll', () => {
    const roll = () => (
        <ScaleProvider>
            <PianoRoll
                track={track}
                onUpdateNote={vi.fn()}
                onToggleStep={vi.fn()}
                currentStep={0}
                steps={16}
                patternSteps={16}
                onClose={vi.fn()}
            />
        </ScaleProvider>
    );

    it('gives a pitch lane a fingertip of height under a coarse pointer', () => {
        installPointer(true);
        render(roll());
        expect(screen.getByTestId('piano-roll-note-60').style.height).toBe(`${NOTE_ROW_HEIGHT_COARSE}px`);
    });

    it('leaves the 20px lane alone under a mouse', () => {
        installPointer(false);
        render(roll());
        expect(screen.getByTestId('piano-roll-note-60').style.height).toBe(`${NOTE_ROW_HEIGHT}px`);
    });
});

describe('CustomSlider', () => {
    const slider = () => <CustomSlider min={0} max={1} value={0.5} onChange={vi.fn()} />;

    it('marks its range input for the enlarged thumb under a coarse pointer', () => {
        installPointer(true);
        const { container } = render(slider());
        const range = container.querySelector('input[type="range"]') as HTMLInputElement;
        expect(range.className).toContain('skald-slider');
        expect(range.getAttribute('data-pointer')).toBe('coarse');
    });

    it('leaves the native mouse thumb alone under a mouse', () => {
        installPointer(false);
        const { container } = render(slider());
        const range = container.querySelector('input[type="range"]') as HTMLInputElement;
        expect(range.getAttribute('data-pointer')).toBe('fine');
    });
});

describe('the help panel', () => {
    beforeEach(() => { /* opened through its own button in each test */ });

    it('leads with gestures, not keys, when there is no keyboard', () => {
        installPointer(true);
        render(<ShortcutLegend />);
        fireEvent.click(screen.getByLabelText('Help'));
        expect(screen.getByTestId('touch-gestures')).toBeTruthy();
        // The key table is still there for a tablet with a keyboard attached,
        // but it is no longer the first thing a phone user is shown.
        expect(screen.getByTestId('keyboard-shortcuts')).toBeTruthy();
    });

    it('is the keyboard legend it has always been under a mouse', () => {
        installPointer(false);
        render(<ShortcutLegend />);
        fireEvent.click(screen.getByLabelText('Keyboard shortcuts'));
        expect(screen.queryByTestId('touch-gestures')).toBeNull();
        expect(screen.getByTestId('keyboard-shortcuts')).toBeTruthy();
    });
});
