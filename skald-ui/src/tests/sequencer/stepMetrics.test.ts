// @vitest-environment node
import { describe, it, expect } from 'vitest';
import {
    MAX_PATTERN_STEPS,
    STEP_WIDTH_DEFAULT,
    STEP_WIDTH_MIN,
    clampPatternSteps,
    stepWidthFor,
    stepsOverflow,
    MIDI_NOTE_MIN,
    MIDI_NOTE_MAX,
    NOTE_ROW_HEIGHT,
    pitchRowsDescending,
    scrollTopForPitch,
} from '../../components/Sequencer/stepMetrics';

// The pattern length cap used to be 64 in the UI while the serializer already
// clamped pattern_steps to [1, 1024]. These pin the width policy that makes a
// longer pattern usable: shrink to fit, floor, then scroll.

describe('clampPatternSteps', () => {
    it('accepts patterns well past the old 64-step cap', () => {
        expect(clampPatternSteps(256)).toBe(256);
        expect(clampPatternSteps(65)).toBe(65);
    });

    it('clamps to the serializer contract at both ends', () => {
        expect(clampPatternSteps(0)).toBe(1);
        expect(clampPatternSteps(-40)).toBe(1);
        expect(clampPatternSteps(MAX_PATTERN_STEPS + 500)).toBe(MAX_PATTERN_STEPS);
    });

    it('rounds fractional input and survives NaN', () => {
        expect(clampPatternSteps(31.6)).toBe(32);
        expect(clampPatternSteps(NaN)).toBe(1);
    });
});

describe('stepWidthFor', () => {
    it('keeps full-size cells when the pattern fits', () => {
        expect(stepWidthFor(16, 1200)).toBe(STEP_WIDTH_DEFAULT);
    });

    it('never exceeds the preferred width even with acres of room', () => {
        expect(stepWidthFor(4, 5000)).toBe(STEP_WIDTH_DEFAULT);
    });

    it('shrinks steps to fit a long pattern instead of scrolling', () => {
        const width = stepWidthFor(64, 1280);
        expect(width).toBe(20);
        expect(64 * width).toBeLessThanOrEqual(1280);
    });

    it('stops shrinking at the floor, which is where scrolling takes over', () => {
        expect(stepWidthFor(512, 1280)).toBe(STEP_WIDTH_MIN);
    });

    it('assumes the preferred width before the first measurement', () => {
        // clientWidth is 0 until layout; collapsing every cell to the floor for
        // a frame makes the grid flicker on open.
        expect(stepWidthFor(64, 0)).toBe(STEP_WIDTH_DEFAULT);
        expect(stepWidthFor(64, NaN)).toBe(STEP_WIDTH_DEFAULT);
    });

    it('honours a custom preferred/min pair (the piano roll)', () => {
        expect(stepWidthFor(16, 1200, { preferred: 30, min: 8 })).toBe(30);
        expect(stepWidthFor(400, 1200, { preferred: 30, min: 8 })).toBe(8);
    });

    it('falls back to the preferred width for a nonsense step count', () => {
        expect(stepWidthFor(0, 1200)).toBe(STEP_WIDTH_DEFAULT);
    });
});

describe('stepsOverflow', () => {
    it('is false while the pattern still fits', () => {
        expect(stepsOverflow(16, 1280)).toBe(false);
        expect(stepsOverflow(64, 1280)).toBe(false);
    });

    it('is true once cells have hit the floor', () => {
        expect(stepsOverflow(512, 1280)).toBe(true);
    });

    it('makes no claim before measurement', () => {
        expect(stepsOverflow(512, 0)).toBe(false);
    });
});

// SKB-026 — the pitch axis. The piano roll hardcoded MIDI 21..84 inline, which
// put the top two octaves of the MIDI range out of reach of a *chromatic*
// editor. The range and the row height live here now for the same reason the
// step width does: roadmap F1 unifies the piano roll with a new drum roll on
// this module, and two editors measuring the same axis differently is the
// SKB-002 class all over again.
describe('pitch axis', () => {
    it('spans the whole MIDI range', () => {
        expect(MIDI_NOTE_MIN).toBe(0);
        expect(MIDI_NOTE_MAX).toBe(127);
    });

    it('lays rows out high-to-low, one per pitch', () => {
        const rows = pitchRowsDescending();
        expect(rows).toHaveLength(128);
        expect(rows[0]).toBe(MIDI_NOTE_MAX);
        expect(rows[rows.length - 1]).toBe(MIDI_NOTE_MIN);
    });

    it('accepts a narrower window without reordering it', () => {
        expect(pitchRowsDescending(60, 63)).toEqual([63, 62, 61, 60]);
    });

    it('centres a pitch in the viewport, never scrolling above the top', () => {
        // Middle C is row (127 - 60) = 67 from the top.
        expect(scrollTopForPitch(60, 0)).toBe(67 * NOTE_ROW_HEIGHT);
        expect(scrollTopForPitch(60, 400)).toBe(67 * NOTE_ROW_HEIGHT - 200);
        // A pitch near the top of the range would want a negative offset.
        expect(scrollTopForPitch(127, 400)).toBe(0);
    });

    it('returns 0 for a pitch outside the rendered window rather than NaN', () => {
        expect(scrollTopForPitch(200, 400)).toBe(0);
    });
});
