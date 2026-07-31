// @vitest-environment node
import { describe, it, expect } from 'vitest';
import {
    MAX_PATTERN_STEPS,
    STEP_WIDTH_DEFAULT,
    STEP_WIDTH_MIN,
    clampPatternSteps,
    stepWidthFor,
    stepsOverflow,
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
