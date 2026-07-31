/*
================================================================================
| FILE: skald-ui/src/components/Sequencer/stepMetrics.ts                       |
|                                                                              |
| How wide one sequencer step is drawn, and how long a pattern is allowed to   |
| be.                                                                          |
|                                                                              |
| The step grid used to draw fixed 40px cells and the toolbar capped patterns  |
| at 64 steps — four bars of sixteenths, which is shorter than most pieces of  |
| music. Both the preview engine and the code generator have always handled    |
| longer patterns (projectSerializer clamps pattern_steps to [1, 1024], and    |
| the generated sequencer switches on the real track length), so the cap was   |
| purely a UI limit.                                                           |
|                                                                              |
| Raising it needs a width policy, or a 256-step pattern is ten screens of     |
| horizontal scrolling. Steps now shrink to fit the space available, down to a |
| floor where they stop shrinking and the grid scrolls instead.                |
================================================================================
*/

/**
 * Longest pattern the editor will accept, matching the `pattern_steps` clamp in
 * `projectSerializer.ts` — the number that actually reaches codegen. 1024
 * sixteenths is 64 bars.
 */
export const MAX_PATTERN_STEPS = 1024;

/** Full-size cell in the step grid, and the narrowest it may shrink to. */
export const STEP_WIDTH_DEFAULT = 40;
export const STEP_WIDTH_MIN = 10;

/** The piano roll draws narrower cells than the step grid. */
export const PIANO_STEP_WIDTH_DEFAULT = 30;
export const PIANO_STEP_WIDTH_MIN = 8;

export interface StepWidthOptions {
    preferred?: number;
    min?: number;
}

/**
 * Width in pixels for one step.
 *
 * Short patterns keep the full-size cell. Longer ones shrink to fit the
 * available width so the whole pattern is visible at once, and once cells hit
 * the floor they stop shrinking — past that the container scrolls.
 *
 * `availableWidth` of 0 (or unknown, before the first measurement) means "no
 * measurement yet": return the preferred width rather than collapsing every
 * cell to the floor for one frame.
 */
export const stepWidthFor = (
    steps: number,
    availableWidth: number,
    { preferred = STEP_WIDTH_DEFAULT, min = STEP_WIDTH_MIN }: StepWidthOptions = {},
): number => {
    if (!Number.isFinite(steps) || steps <= 0) return preferred;
    if (!Number.isFinite(availableWidth) || availableWidth <= 0) return preferred;
    const fit = Math.floor(availableWidth / steps);
    return Math.max(min, Math.min(preferred, fit));
};

/** True when the pattern is wider than its container and needs scrolling. */
export const stepsOverflow = (steps: number, availableWidth: number, options?: StepWidthOptions): boolean =>
    steps * stepWidthFor(steps, availableWidth, options) > availableWidth && availableWidth > 0;

/** Clamp a user-entered pattern length into the supported range. */
export const clampPatternSteps = (steps: number): number => {
    if (!Number.isFinite(steps)) return 1;
    return Math.max(1, Math.min(MAX_PATTERN_STEPS, Math.round(steps)));
};
