/*
================================================================================
| FILE: skald-ui/src/components/Sequencer/trackViewMode.ts                     |
|                                                                              |
| Roadmap F4 — which editor a track opens in, decided ONCE.                    |
|                                                                              |
| Every surface that has to answer "is this a drum track?" reads this file:    |
| the dock (which editor "Edit" opens), the track row (what "Auto" is          |
| currently resolving to), and the kit view (which tracks it aggregates).      |
| Three call sites agreeing by coincidence is the disagreeing-second-copy bug  |
| class SKB-002 was written to close, and it would be worse here than usual —  |
| a track the dock thinks is percussive and the kit view thinks is melodic     |
| would be editable in neither.                                                |
|                                                                              |
| The detection is a HEURISTIC over the patch, never over the track's name.    |
| "Tom", "Kick" and "Hat" are labels a user can type anything into; the        |
| subgraph and the notes are what the generated code actually does. The        |
| calibration is pinned against real files in                                  |
| tests/sequencer/TrackViewMode.test.tsx — read the deviation note there       |
| before widening the pitch-count rule.                                        |
================================================================================
*/
import { Node } from '@xyflow/react';
import { NodeParams, SequencerTrack, SkaldGraphNode } from '../../definitions/types';

/** The stored preference. Absent on a track reads as 'auto' — see `storedViewMode`. */
export type TrackViewMode = 'melodic' | 'percussive' | 'auto';

/** What a resolution can actually be: 'auto' is a question, not an answer. */
export type ResolvedTrackViewMode = 'melodic' | 'percussive';

/**
 * Node types that produce sound rather than shape it. A subgraph made only of
 * filters and envelopes says nothing either way, which is why an instrument
 * with no source at all falls through to the note-based rule below.
 */
const SOURCE_TYPES = new Set(['oscillator', 'wavetable', 'noise', 'fmOperator']);

/**
 * Whether this source's pitch follows the note the sequencer played.
 *
 * Mirrored case-by-case against the generator (CLAUDE.md's "one reader, not
 * two" — this is the exception it allows, so it names its source):
 *   - Oscillator: codegen_nodes.odin::generate_oscillator_code takes
 *     `voice.current_freq` unless `fixedPitch`, in which case the authored
 *     `frequency` wins and the note is inert.
 *   - Wavetable: generate_wavetable_code, the same `fixedPitch` branch.
 *   - FM Operator: generate_fm_operator_code has NO fixedPitch branch — its
 *     carrier is always `voice.current_freq`, so it always tracks.
 *   - Noise: no frequency input at all; never tracks.
 */
const tracksPlayedPitch = (node: { type?: string; data?: unknown }): boolean => {
    if (node.type === 'fmOperator') return true;
    if (node.type === 'oscillator' || node.type === 'wavetable') {
        return !(node.data as { fixedPitch?: boolean } | undefined)?.fixedPitch;
    }
    return false;
};

/** An Instrument's subgraph nodes, or [] for anything that is not one. */
const subgraphNodesOf = (instrumentNode: Node<NodeParams> | null | undefined): SkaldGraphNode[] => {
    const subgraph = (instrumentNode?.data as { subgraph?: { nodes?: SkaldGraphNode[] } } | undefined)?.subgraph;
    return Array.isArray(subgraph?.nodes) ? subgraph.nodes : [];
};

/** The preference a track carries. Absent ⇒ 'auto', so no save migration is owed. */
export const storedViewMode = (track: Pick<SequencerTrack, 'viewMode'>): TrackViewMode =>
    track.viewMode ?? 'auto';

/**
 * How many different pitches the track's notes use. One means the track never
 * addresses pitch at all — whatever the patch could do with a note, this
 * track does not use it.
 */
const distinctPitchCount = (track: Pick<SequencerTrack, 'notes'>): number =>
    new Set(track.notes.map(n => n.note)).size;

/**
 * What 'auto' resolves to for this (track, instrument) pair. Split out from
 * `resolveTrackViewMode` so the track row can show the user what Auto is
 * currently choosing without having to strip their explicit hint first.
 */
export const detectTrackViewMode = (
    track: Pick<SequencerTrack, 'notes'>,
    instrumentNode: Node<NodeParams> | null | undefined,
): ResolvedTrackViewMode => {
    const sources = subgraphNodesOf(instrumentNode).filter(n => SOURCE_TYPES.has(n.type));

    // The patch cannot hear the note: every Oscillator/Wavetable is on fixed
    // pitch, or the only sources are Noise. The whole SNES kit's kick, snare
    // and hat land here, as do the geowars SFX.
    if (sources.length > 0 && !sources.some(tracksPlayedPitch)) return 'percussive';

    // The patch could hear the note, but the track never changes it — one
    // pitch on every step (four-bar-song's Kick, on MIDI 24, with fixedPitch
    // left off). A chromatic roll for that is 128 rows to edit one.
    //
    // ONE pitch, not two: snes-kit's crunch guitar is a real riff written on
    // exactly 45 and 52, and a one-row grid would draw its two pitches on top
    // of each other. Widening this test is how that guitar loses half its
    // notes to a drum grid.
    if (track.notes.length > 0 && distinctPitchCount(track) === 1) return 'percussive';

    // Includes the no-instrument case: a chromatic roll can show every note a
    // track holds and a one-row grid cannot, so when there is nothing to read,
    // show more rather than less.
    return 'melodic';
};

/**
 * The view a track opens in: its explicit hint when it has one, the detection
 * otherwise. This is the only function any component should call.
 */
export const resolveTrackViewMode = (
    track: Pick<SequencerTrack, 'notes' | 'viewMode'>,
    instrumentNode: Node<NodeParams> | null | undefined,
): ResolvedTrackViewMode => {
    const stored = storedViewMode(track);
    if (stored !== 'auto') return stored;
    return detectTrackViewMode(track, instrumentNode);
};

/**
 * F3: the tracks the kit workspace shows, in track order — every one that
 * resolves percussive against its own Instrument node.
 *
 * Here rather than in the kit view so the dock's "is the Kit button worth
 * showing?" test and the workspace's "which rows do I draw?" answer are the
 * same list. Two lists would let the button appear over a workspace with
 * nothing in it, or hide over one with rows to edit.
 */
export const percussiveTracks = (
    tracks: SequencerTrack[],
    nodes: Node<NodeParams>[],
): SequencerTrack[] => {
    const byId = new Map(nodes.map(n => [n.id, n]));
    return tracks.filter(t => resolveTrackViewMode(t, byId.get(t.targetNodeId) ?? null) === 'percussive');
};
