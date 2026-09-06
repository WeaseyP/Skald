/*
================================================================================
| FILE: skald-ui/src/components/Sequencer/drumKit.ts                           |
|                                                                              |
| Roadmap F2 — what a kit-piece row means when there is no pitch axis.         |
|                                                                              |
| A percussive row still has to write a MIDI note number: the generated        |
| sequencer emits `<Asset>_note_on(p, note, velocity, duration)` for every     |
| event whatever the event means (codegen_project.odin::generate_sequencer_    |
| logic), and (step, pitch) is the address Step Properties, Export Step and    |
| the de-duplicator all use. The Step Grid's answer was a hardcoded middle C   |
| for every track in the project, which is how a kick track ends up holding    |
| notes at 36 (painted in the roll) and 60 (painted in the grid) that look     |
| identical on a row and are two different lanes everywhere else.              |
|                                                                              |
| So one function decides a track's canonical pitch, and the whole drum        |
| surface paints with it.                                                      |
================================================================================
*/
import { SequencerTrack } from '../../definitions/types';

/**
 * The General MIDI percussion notes for the five pieces a name can plausibly
 * be recognised as. Deliberately small: this is a last-resort guess for an
 * EMPTY track, not a kit mapping. Everything the guess gets wrong is one
 * number away from right in the row's own field, and a track with any notes
 * in it never reaches here at all.
 */
export const GM_DRUM_PITCHES = {
    kick: 36,
    snare: 38,
    clap: 39,
    hat: 42,
    tom: 45,
} as const;

/** Middle C — the pitch every painted note used before tracks had a canonical one. */
export const FALLBACK_DRUM_PITCH = 60;

/**
 * Matched against the lowercased track name, in order. 'clap' precedes 'hat'
 * and 'kick' only for readability; no name in the shipped examples matches two
 * of these, and if one ever does, the first row wins deterministically rather
 * than by object-key order.
 */
const NAME_HINTS: readonly (readonly [string, number])[] = [
    ['kick', GM_DRUM_PITCHES.kick],
    ['bass drum', GM_DRUM_PITCHES.kick],
    ['snare', GM_DRUM_PITCHES.snare],
    ['clap', GM_DRUM_PITCHES.clap],
    ['hat', GM_DRUM_PITCHES.hat],
    ['tom', GM_DRUM_PITCHES.tom],
];

/**
 * The pitch a new hit on this track is painted at, in priority order:
 *
 *  1. `track.defaultNote` — the author said so in the row's own field.
 *  2. The pitch the track's notes already use most. What is already on the
 *     grid beats what the name suggests: a track called "Kick" whose notes are
 *     all at 38 is a track whose new hits belong at 38, or the row would start
 *     drawing two lanes that it cannot tell apart.
 *  3. A General MIDI guess from the name, for a track with no notes yet.
 *  4. Middle C.
 *
 * Ties in (2) go to the LOWER pitch — insertion order would make the answer
 * depend on which cell the author happened to click first, and therefore make
 * the same file paint differently after a load-and-save round trip.
 */
export const canonicalDrumPitch = (track: Pick<SequencerTrack, 'name' | 'notes' | 'defaultNote'>): number => {
    if (typeof track.defaultNote === 'number') return track.defaultNote;

    const counts = new Map<number, number>();
    for (const note of track.notes) counts.set(note.note, (counts.get(note.note) ?? 0) + 1);
    if (counts.size > 0) {
        let best = Number.POSITIVE_INFINITY;
        let bestCount = -1;
        for (const [pitch, count] of counts) {
            if (count > bestCount || (count === bestCount && pitch < best)) {
                best = pitch;
                bestCount = count;
            }
        }
        return best;
    }

    const name = track.name.toLowerCase();
    for (const [hint, pitch] of NAME_HINTS) {
        if (name.includes(hint)) return pitch;
    }
    return FALLBACK_DRUM_PITCH;
};
