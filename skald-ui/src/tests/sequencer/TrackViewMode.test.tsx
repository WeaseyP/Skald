// @vitest-environment jsdom
/*
================================================================================
| Roadmap F4 — the auto-detection calibration, pinned against REAL example      |
| files rather than hand-written fixtures.                                     |
|                                                                              |
| A heuristic that is only ever tested against fixtures written by the same     |
| person who wrote the heuristic proves nothing: the fixtures encode the        |
| author's belief about what a drum patch looks like, not what the shipped      |
| kits actually are. Every expectation below names a file in `examples/`, so a  |
| future change to `resolveTrackViewMode` has to answer for the SNES kit, the   |
| SNES bass and the two-pitch crunch guitar by name.                           |
|                                                                              |
| The one deliberate deviation from the roadmap prose ("one or two distinct     |
| pitches"): the pitch-count fallback fires at ONE distinct pitch, not two.     |
| `snes-kit/instruments/crunch-guitar.skald.json` is a pitch-tracking guitar    |
| riff written entirely on 45 and 52 — two distinct pitches — and folding it    |
| into a one-row Drum Roll would hide half its notes behind the other half.     |
| A track that never changes pitch at all is not being played melodically;     |
| a track alternating two pitches may well be.                                 |
================================================================================
*/
import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, renderHook, act } from '@testing-library/react';
import { Node } from '@xyflow/react';
import { NodeParams, SequencerTrack } from '../../definitions/types';
import { resolveTrackViewMode } from '../../components/Sequencer/trackViewMode';
import { TrackList } from '../../components/Sequencer/TrackList';
import { useSequencerState } from '../../hooks/sequencer/useSequencerState';
import { findRepoRoot } from '../contracts/paramRangeDump';

const repoRoot = findRepoRoot();

interface RawSave {
    nodes?: { id: string; type?: string; data?: Record<string, unknown> }[];
    sequencerTracks?: SequencerTrack[];
}

const readExample = (rel: string): RawSave => {
    const abs = path.join(repoRoot, 'examples', rel);
    return JSON.parse(fs.readFileSync(abs, 'utf8')) as RawSave;
};

/**
 * The (track, instrument node) pair as the dock hands them to the resolver:
 * the track whose `targetNodeId` names the instrument with `label`.
 */
const pairFor = (rel: string, label: string): { track: SequencerTrack; node: Node<NodeParams> } => {
    const save = readExample(rel);
    const node = (save.nodes ?? []).find(n => n.type === 'instrument' && n.data?.label === label);
    if (!node) throw new Error(`${rel} has no instrument labelled "${label}" — the fixture moved`);
    const track = (save.sequencerTracks ?? []).find(t => t.targetNodeId === node.id);
    if (!track) throw new Error(`${rel} has no sequencer track targeting "${label}" — the fixture moved`);
    return { track, node: node as unknown as Node<NodeParams> };
};

const modeOf = (rel: string, label: string) => {
    const { track, node } = pairFor(rel, label);
    return resolveTrackViewMode(track, node);
};

describe('resolveTrackViewMode — calibrated against the shipped examples', () => {
    it('calls the SNES kick, snare and hat percussive (no source tracks the played note)', () => {
        // Kick: one Oscillator with fixedPitch. Snare: Noise + a fixedPitch
        // Oscillator. Hat: Noise only. None of the three can hear the note.
        expect(modeOf('snes-kit/songs/groove-bed.skald.json', 'SNES Kick')).toBe('percussive');
        expect(modeOf('snes-kit/songs/groove-bed.skald.json', 'SNES Snare')).toBe('percussive');
        expect(modeOf('snes-kit/songs/groove-bed.skald.json', 'SNES Hat')).toBe('percussive');
    });

    it('calls the SNES tom melodic — its oscillator tracks the note and it plays four pitches', () => {
        // 43/45/48/50 are real pitches on a pitch-tracking oscillator. Being
        // named "Tom" is not evidence; the patch is. The author who wants the
        // one-row grid anyway sets Percussive explicitly.
        expect(modeOf('snes-kit/songs/groove-bed.skald.json', 'SNES Tom')).toBe('melodic');
    });

    it('calls the SNES slap bass melodic', () => {
        expect(modeOf('snes-kit/songs/groove-bed.skald.json', 'SNES Slap Bass')).toBe('melodic');
    });

    it('calls a one-pitch kick percussive even though its oscillator tracks the note', () => {
        // four-bar-song's Kick left fixedPitch off and plays MIDI 24 on every
        // step. Nothing about that track is melodic, and the pitch-tracking
        // source alone would have sent it to the chromatic roll.
        expect(modeOf('songs/full/four-bar-song.skald.json', 'Kick')).toBe('percussive');
    });

    it('keeps the two-pitch crunch guitar melodic (the reason the fallback is one pitch, not two)', () => {
        expect(modeOf('snes-kit/instruments/crunch-guitar.skald.json', 'SNES Crunch Guitar')).toBe('melodic');
    });

    it('an explicit hint always wins over detection, in both directions', () => {
        const kick = pairFor('snes-kit/songs/groove-bed.skald.json', 'SNES Kick');
        const bass = pairFor('snes-kit/songs/groove-bed.skald.json', 'SNES Slap Bass');
        expect(resolveTrackViewMode({ ...kick.track, viewMode: 'melodic' }, kick.node)).toBe('melodic');
        expect(resolveTrackViewMode({ ...bass.track, viewMode: 'percussive' }, bass.node)).toBe('percussive');
    });

    it("treats an absent viewMode exactly as 'auto' — no save migration needed", () => {
        const { track, node } = pairFor('snes-kit/songs/groove-bed.skald.json', 'SNES Kick');
        const { viewMode: _dropped, ...withoutField } = { ...track, viewMode: 'auto' as const };
        expect(resolveTrackViewMode(withoutField as SequencerTrack, node))
            .toBe(resolveTrackViewMode({ ...track, viewMode: 'auto' }, node));
    });

    it('falls back to melodic when the instrument node is missing entirely', () => {
        // A chromatic roll can show every note a track holds; a one-row drum
        // grid cannot. When there is nothing to read, show more, not less.
        const orphan: SequencerTrack = {
            id: 't', targetNodeId: 'gone', name: 'Orphan', color: '#fff',
            steps: 16, notes: [{ step: 0, note: 60, velocity: 1, duration: 1 }, { step: 4, note: 67, velocity: 1, duration: 1 }],
            isMuted: false, isSolo: false,
        };
        expect(resolveTrackViewMode(orphan, null)).toBe('melodic');
    });

    it('leaves an empty track on a melodic instrument melodic (no notes is not one pitch)', () => {
        const { node } = pairFor('snes-kit/songs/groove-bed.skald.json', 'SNES Slap Bass');
        const empty: SequencerTrack = {
            id: 't', targetNodeId: node.id, name: 'Bass', color: '#fff',
            steps: 16, notes: [], isMuted: false, isSolo: false,
        };
        expect(resolveTrackViewMode(empty, node)).toBe('melodic');
    });
});

describe('TrackList — the per-track view-mode selector', () => {
    afterEach(cleanup);

    const track: SequencerTrack = {
        id: 'track-1', targetNodeId: 'node-1', name: 'Kick', color: '#f00',
        steps: 16, notes: [], isMuted: false, isSolo: false,
    };

    it('shows Auto for a track with no stored preference and writes the chosen mode', () => {
        const onSetViewMode = vi.fn();
        render(
            <TrackList
                tracks={[track]}
                onMuteToggle={vi.fn()}
                onSoloToggle={vi.fn()}
                onFocusTrack={vi.fn()}
                onSetViewMode={onSetViewMode}
            />,
        );

        const select = screen.getByTestId('track-view-mode-track-1') as HTMLSelectElement;
        expect(select.value).toBe('auto');

        fireEvent.change(select, { target: { value: 'percussive' } });
        expect(onSetViewMode).toHaveBeenCalledWith('track-1', 'percussive');
    });

    it('reflects a stored preference rather than re-detecting it', () => {
        render(
            <TrackList
                tracks={[{ ...track, viewMode: 'melodic' }]}
                onMuteToggle={vi.fn()}
                onSoloToggle={vi.fn()}
                onFocusTrack={vi.fn()}
                onSetViewMode={vi.fn()}
            />,
        );
        expect((screen.getByTestId('track-view-mode-track-1') as HTMLSelectElement).value).toBe('melodic');
    });
});

describe('useSequencerState.setTrackViewMode', () => {
    it('pushes one labelled history entry and stores the mode', () => {
        const pushHistory = vi.fn();
        const { result } = renderHook(() => useSequencerState({ pushHistory }));
        act(() => { result.current.syncInstrumentTracks([{ id: 'node-1', name: 'Kick' }]); });
        const trackId = result.current.tracks[0].id;

        // The reconciliation above is silent by design (see the hook's
        // header), so any call recorded here is this gesture's own.
        pushHistory.mockClear();

        act(() => { result.current.setTrackViewMode(trackId, 'percussive'); });

        expect(pushHistory).toHaveBeenCalledTimes(1);
        expect(result.current.tracks[0].viewMode).toBe('percussive');
    });

    it('does not push when the mode is already what was asked for', () => {
        const pushHistory = vi.fn();
        const { result } = renderHook(() => useSequencerState({ pushHistory }));
        act(() => { result.current.syncInstrumentTracks([{ id: 'node-1', name: 'Kick' }]); });
        const trackId = result.current.tracks[0].id;
        act(() => { result.current.setTrackViewMode(trackId, 'percussive'); });
        pushHistory.mockClear();

        act(() => { result.current.setTrackViewMode(trackId, 'percussive'); });
        expect(pushHistory).not.toHaveBeenCalled();
    });

    it("treats 'auto' on a track that never stored one as a no-op", () => {
        const pushHistory = vi.fn();
        const { result } = renderHook(() => useSequencerState({ pushHistory }));
        act(() => { result.current.syncInstrumentTracks([{ id: 'node-1', name: 'Kick' }]); });
        const trackId = result.current.tracks[0].id;
        pushHistory.mockClear();

        act(() => { result.current.setTrackViewMode(trackId, 'auto'); });
        expect(pushHistory).not.toHaveBeenCalled();
    });
});
