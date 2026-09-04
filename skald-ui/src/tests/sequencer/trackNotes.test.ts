// Roadmap B5-x3 — (step, pitch) uniqueness is normalised at load, not only
// enforced for new edits.
import { describe, expect, it } from 'vitest';
import { dedupeTrackNotes } from '../../utils/trackNotes';
import { SequencerTrack } from '../../definitions/types';

const track = (notes: SequencerTrack['notes'], id = 't1'): SequencerTrack => ({
    id, targetNodeId: 'inst-1', name: 'Bass', color: '#007acc', steps: 16, isMuted: false, isSolo: false, notes,
});

describe('dedupeTrackNotes', () => {
    it('keeps the first note at a (step, pitch) and drops later duplicates, counting them', () => {
        const { tracks, dropped } = dedupeTrackNotes([track([
            { step: 0, note: 60, velocity: 1, duration: 1 },
            { step: 0, note: 60, velocity: 0.5, duration: 2 },
            { step: 0, note: 64, velocity: 1, duration: 1 },
            { step: 1, note: 60, velocity: 1, duration: 1 },
        ])]);
        expect(dropped).toBe(1);
        expect(tracks[0].notes).toEqual([
            { step: 0, note: 60, velocity: 1, duration: 1 },
            { step: 0, note: 64, velocity: 1, duration: 1 },
            { step: 1, note: 60, velocity: 1, duration: 1 },
        ]);
    });

    it('returns a track that already holds the invariant as the same object', () => {
        const t = track([{ step: 0, note: 60, velocity: 1, duration: 1 }, { step: 0, note: 62, velocity: 1, duration: 1 }]);
        const { tracks, dropped } = dedupeTrackNotes([t]);
        expect(dropped).toBe(0);
        expect(tracks[0]).toBe(t);
    });

    it('counts across tracks and leaves other tracks untouched', () => {
        const clean = track([{ step: 2, note: 60, velocity: 1, duration: 1 }], 'clean');
        const dirty = track([
            { step: 5, note: 72, velocity: 1, duration: 1 },
            { step: 5, note: 72, velocity: 1, duration: 1 },
            { step: 5, note: 72, velocity: 1, duration: 1 },
        ], 'dirty');
        const { tracks, dropped } = dedupeTrackNotes([clean, dirty]);
        expect(dropped).toBe(2);
        expect(tracks[0]).toBe(clean);
        expect(tracks[1].notes).toHaveLength(1);
    });
});

describe('dedupeTrackNotes — malformed input', () => {
    it('passes a track with no notes array through untouched instead of throwing', () => {
        // FileIO.test.tsx loads a save whose track has no `notes`; the
        // normaliser threw "track.notes is not iterable" on it.
        const bare = { id: 't', targetNodeId: 'i', name: 'T', color: '#000', steps: 16, isMuted: false, isSolo: false } as unknown as SequencerTrack;
        const { tracks, dropped } = dedupeTrackNotes([bare]);
        expect(dropped).toBe(0);
        expect(tracks[0]).toBe(bare);
    });
});
