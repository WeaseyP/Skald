// @vitest-environment jsdom
/*
================================================================================
| SKB-010, second half — the editors, Export-Step and the serializer must agree |
| about what "in range" means.                                                  |
|                                                                              |
| Agreement does NOT mean the serializer drops out-of-range notes. The shipped   |
| examples/songs/full/four-bar-song.skald.json has 64-step tracks and no        |
| session block at all, so it loads at the default patternSteps of 16: three of |
| its four bars are out of range the moment it opens. Its notes are authored     |
| data and the 16 is an unsaved default, so a serializer that trusted the        |
| boundary over the data would delete three bars of music on export, silently.   |
|                                                                              |
| So: the serializer stays non-destructive and the loss is REPORTED (see         |
| projectWarnings). What must agree is the read-only judgement of what plays —   |
| and Export-Step, which mints a node from a step, must refuse a step the        |
| generated sequencer can never reach rather than producing an instrument for a  |
| sound that never happens.                                                     |
================================================================================
*/
import React from 'react';
import { describe, it, expect, afterEach } from 'vitest';
import { renderHook, act, cleanup } from '@testing-library/react';
import { ReactFlowProvider, Node } from '@xyflow/react';
import { useEditorState } from '../../hooks/nodeEditor/useEditorState';
import { buildProjectData } from '../../utils/projectSerializer';
import { NodeParams, SequencerTrack } from '../../definitions/types';

const wrapper = ({ children }: { children: React.ReactNode }) => (
    <ReactFlowProvider>{children}</ReactFlowProvider>
);

afterEach(cleanup);

const instrumentNode = (id: string, name: string): Node<NodeParams> => ({
    id,
    type: 'instrument',
    position: { x: 0, y: 0 },
    data: {
        label: name,
        name,
        voiceCount: 8,
        voiceStealing: 'oldest',
        glide: 0,
        unison: 1,
        detune: 0,
        inputs: [],
        outputs: [],
        subgraph: { nodes: [], connections: [] },
    },
} as unknown as Node<NodeParams>);

const seedTrack = (result: { current: ReturnType<typeof useEditorState> }) => {
    act(() => { result.current.setNodes([instrumentNode('inst-1', 'Bass')]); });
    return result.current.tracks[0].id;
};

describe('SKB-010 — Export-Step agrees with the editors about range', () => {
    it('refuses a step past the effective range', () => {
        const { result } = renderHook(() => useEditorState(), { wrapper });
        const trackId = seedTrack(result);

        // A 32-step track under the default 16-step pattern: step 20 exists in
        // the track's own loop but the generated `switch p.current_step % 32`
        // is only ever reached with current_step < 16.
        act(() => { result.current.updateTrackSteps(trackId, 32); });
        act(() => { result.current.toggleStep(trackId, 20, 60); });
        expect(result.current.tracks[0].notes).toHaveLength(1);

        const before = result.current.history.undoLabels.length;
        let newId: string | null = 'not-called';
        act(() => { newId = result.current.handleExportStep(trackId, 20); });

        expect(newId).toBeNull();
        expect(result.current.nodes).toHaveLength(1);
        // Refusing must not burn a history entry either.
        expect(result.current.history.undoLabels).toHaveLength(before);
    });

    it('still exports an in-range step', () => {
        const { result } = renderHook(() => useEditorState(), { wrapper });
        const trackId = seedTrack(result);

        act(() => { result.current.toggleStep(trackId, 3, 60); });
        let newId: string | null = null;
        act(() => { newId = result.current.handleExportStep(trackId, 3); });

        expect(newId).toBeTruthy();
        expect(result.current.nodes).toHaveLength(2);
    });

    it('exports a step the pattern reaches even when the TRACK is shorter', () => {
        // min(4, 16) = 4, so step 2 plays (the track loops four times).
        const { result } = renderHook(() => useEditorState(), { wrapper });
        const trackId = seedTrack(result);

        act(() => { result.current.updateTrackSteps(trackId, 4); });
        act(() => { result.current.toggleStep(trackId, 2, 60); });
        let newId: string | null = null;
        act(() => { newId = result.current.handleExportStep(trackId, 2); });
        expect(newId).toBeTruthy();
    });
});

describe('SKB-010 — the serializer is deliberately NOT destructive', () => {
    it('keeps every authored event, including ones past the boundary', () => {
        const track: SequencerTrack = {
            id: 't1',
            targetNodeId: 'inst-1',
            name: 'Bass',
            color: '#007acc',
            steps: 64,
            notes: [
                { step: 0, note: 36, velocity: 1, duration: 1 },
                { step: 16, note: 38, velocity: 1, duration: 1 },
                { step: 48, note: 40, velocity: 1, duration: 1 },
            ],
            isMuted: false,
            isSolo: false,
        };
        const data = buildProjectData(
            [instrumentNode('inst-1', 'Bass')], [], [track], 120, 0.8, 16
        );
        const events = data.project.instruments[0].audio_graph.sequencer_tracks[0].events;
        expect(events.map((e: { step: number }) => e.step)).toEqual([0, 16, 48]);
    });
});
