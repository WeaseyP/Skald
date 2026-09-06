/*
================================================================================
| FILE: skald-ui/src/utils/trackNotes.ts                                       |
|                                                                              |
| Roadmap B5-x3. (step, pitch) uniqueness is load-bearing — B5-2 addresses     |
| every edit by that pair and a retuned note absorbs a sibling it lands on —  |
| but it was enforced only for NEW edits. A file carrying two notes at one    |
| (step, pitch) rendered as a React duplicate-key warning with one block      |
| hidden, and every edit to the pair then hit whichever copy `find` saw       |
| first. One normalisation pass at load makes the invariant true for every    |
| track the editor holds, however the file was produced.                     |
================================================================================
*/
import { NoteEvent, SequencerTrack } from '../definitions/types';

export interface DedupeResult {
    tracks: SequencerTrack[];
    /** Notes dropped across all tracks; 0 means the input already held the invariant. */
    dropped: number;
}

/**
 * Keep the FIRST note at each (step, pitch) in file order and drop the rest.
 * First, not last, because file order is authoring order in every writer we
 * have — an editor save appends, so a later duplicate is the stray. Tracks
 * without duplicates are returned as the same object, so callers can tell
 * "normalised" from "untouched" by identity if they need to.
 */
export const dedupeTrackNotes = (tracks: SequencerTrack[]): DedupeResult => {
    let dropped = 0;
    const out = tracks.map((track) => {
        // A track with no notes array (a hand-written or truncated save) is
        // passed through untouched: the loader's own validation owns that
        // shape, and a normaliser must not be the thing that throws on it.
        if (!Array.isArray(track.notes)) return track;
        const seen = new Set<string>();
        const kept: NoteEvent[] = [];
        for (const n of track.notes) {
            const key = `${n.step}:${n.note}`;
            if (seen.has(key)) {
                dropped++;
                continue;
            }
            seen.add(key);
            kept.push(n);
        }
        return kept.length === track.notes.length ? track : { ...track, notes: kept };
    });
    return { tracks: out, dropped };
};
