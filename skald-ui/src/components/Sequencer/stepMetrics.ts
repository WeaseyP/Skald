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

/**
 * Where the grid must scroll horizontally to keep `step` on screen, or `null`
 * when it is already visible and the scroll position must not be touched.
 *
 * Roadmap E13. Once a pattern is wider than its container the grid scrolls,
 * and the playhead used to walk off the right edge and keep going: on a phone,
 * where four bars of a sixteen-bar pattern is a generous viewport, that is a
 * blank grid for three quarters of every loop. Returning `null` rather than
 * the current scrollLeft is the important half — an unconditional assignment
 * would fight the user's own drag on every step, and it is what lets the
 * desktop caller stay opted out without a second copy of the arithmetic.
 *
 * `viewportWidth` of 0 means "not measured yet" (the same convention
 * `stepWidthFor` uses for `availableWidth`), and scrolling on a guess would
 * jump the grid on the first frame.
 */
export const scrollLeftForStep = (
    step: number,
    stepWidth: number,
    scrollLeft: number,
    viewportWidth: number,
): number | null => {
    if (!Number.isFinite(viewportWidth) || viewportWidth <= 0) return null;
    if (!Number.isFinite(step) || !Number.isFinite(stepWidth) || stepWidth <= 0) return null;
    const left = step * stepWidth;
    const right = left + stepWidth;
    if (left >= scrollLeft && right <= scrollLeft + viewportWidth) return null;
    return Math.max(0, left - viewportWidth / 2);
};

/** True when the pattern is wider than its container and needs scrolling. */
export const stepsOverflow = (steps: number, availableWidth: number, options?: StepWidthOptions): boolean =>
    steps * stepWidthFor(steps, availableWidth, options) > availableWidth && availableWidth > 0;

/*
--------------------------------------------------------------------------------
The effective step range.

SKB-010: a track plays `min(track.steps, patternSteps)` steps — its own loop
length, bounded by the global pattern length. codegen_project.odin makes that
concrete: it emits `switch p.current_step % <track_steps>` and advances
`p.current_step` only as far as `pattern_steps`, so a `case 20:` inside a
`% 16` switch is code the modulo can never produce, and steps 16..31 of a
32-step track never run under a 16-step pattern.

Neither editor respected the minimum, so those cells were fully editable and
silently inaudible — and lowering a count could leave a note with no column to
render in at all, invisible in the editor but still in the save file and still
in the export.

The policy is KEEP the data and SHOW it, never drop it. The shipped
examples/songs/full/four-bar-song.skald.json has 64-step tracks and no session
block, so it loads at the default patternSteps of 16: three of its four bars
are out of range on arrival. The music is the authored data and the 16 is an
unsaved default, so anything that trusted the boundary over the notes would
silently delete three bars on export. Out-of-range steps are greyed, counted
and reported instead.
--------------------------------------------------------------------------------
*/

/** Track loop length when the track stores none. Mirrors the backend's `if track_steps <= 0 do track_steps = 16`. */
export const DEFAULT_TRACK_STEPS = 16;

/**
 * How many of a track's steps can actually play: its own loop length, capped
 * by the global pattern length. The single definition of "in range" — the step
 * grid, the piano roll, Export-Step and the Generate warnings all read it, so
 * they cannot drift apart (SKB-002).
 */
export const effectiveTrackSteps = (trackSteps: number | undefined, patternSteps: number): number => {
    const track = Number.isFinite(trackSteps) && (trackSteps as number) > 0
        ? Math.floor(trackSteps as number)
        : DEFAULT_TRACK_STEPS;
    const pattern = Number.isFinite(patternSteps) && patternSteps > 0
        ? Math.floor(patternSteps)
        : DEFAULT_TRACK_STEPS;
    return Math.max(1, Math.min(track, pattern));
};

/** Minimal shape both editors and the serializer share. */
export interface StepRangeTrack {
    steps?: number;
    notes: { step: number }[];
}

/**
 * The notes a track holds beyond its effective range: authored, saved,
 * exported, and never heard. Returned rather than counted so callers can point
 * at the offending steps.
 */
export const outOfRangeNotes = <T extends { step: number }>(
    track: { steps?: number; notes: T[] },
    patternSteps: number,
): T[] => {
    const limit = effectiveTrackSteps(track.steps, patternSteps);
    return track.notes.filter(n => n.step >= limit);
};

/** Total across every track — what the editors put in front of the user. */
export const outOfRangeNoteCount = (
    tracks: { steps?: number; notes: { step: number }[] }[],
    patternSteps: number,
): number => tracks.reduce((sum, t) => sum + outOfRangeNotes(t, patternSteps).length, 0);

/**
 * Highest step index any note occupies, +1 — the number of columns needed to
 * keep every authored note visible. 0 when the track is empty.
 */
export const noteExtent = (tracks: { notes: { step: number }[] }[]): number => {
    let extent = 0;
    for (const track of tracks) {
        for (const note of track.notes) {
            if (Number.isFinite(note.step) && note.step + 1 > extent) extent = note.step + 1;
        }
    }
    return extent;
};

/*
--------------------------------------------------------------------------------
The pitch axis.

SKB-026: the piano roll hardcoded MIDI 21..84 as local constants, so the top
two octaves of the MIDI range had no row in a *chromatic* editor. A note above
84 still lived in the track, still played in the preview and still shipped in
the export — it just had nowhere to be seen, edited or deleted. The scroll
container was already `overflow: auto`, so the hardcoded window was the only
thing between it and the full range roadmap E4 asks for.

Range and row height live beside the step width because roadmap F1 unifies the
piano roll with a new drum roll on this module; two editors measuring the same
axis with their own private constants is the SKB-002 disagreeing-readers class.
--------------------------------------------------------------------------------
*/

/** The whole MIDI note range. A chromatic editor must reach all of it. */
export const MIDI_NOTE_MIN = 0;
export const MIDI_NOTE_MAX = 127;

/** Height of one pitch lane, in pixels. */
export const NOTE_ROW_HEIGHT = 20;

/**
 * Pitch rows in the order they are drawn: highest at the top, as on a score.
 * Defaults to the full MIDI range; a narrower window is honoured as given (a
 * drum roll only ever wants its kit's pitches).
 */
export const pitchRowsDescending = (
    min: number = MIDI_NOTE_MIN,
    max: number = MIDI_NOTE_MAX,
): number[] => {
    const rows: number[] = [];
    for (let pitch = max; pitch >= min; pitch--) rows.push(pitch);
    return rows;
};

/**
 * Initial scrollTop that puts `pitch` in the middle of a `viewportHeight`-tall
 * viewport. Clamped at 0: centring a pitch near the top of the range wants a
 * negative offset, which scrolls nowhere and (assigned to scrollTop) silently
 * reads back as 0 anyway. A pitch outside the window scrolls to the top rather
 * than to NaN.
 */
export const scrollTopForPitch = (
    pitch: number,
    viewportHeight: number,
    min: number = MIDI_NOTE_MIN,
    max: number = MIDI_NOTE_MAX,
    rowHeight: number = NOTE_ROW_HEIGHT,
): number => {
    if (!Number.isFinite(pitch) || pitch < min || pitch > max) return 0;
    return Math.max(0, (max - pitch) * rowHeight - viewportHeight / 2);
};

/** Clamp a user-entered pattern length into the supported range. */
export const clampPatternSteps = (steps: number): number => {
    if (!Number.isFinite(steps)) return 1;
    return Math.max(1, Math.min(MAX_PATTERN_STEPS, Math.round(steps)));
};
