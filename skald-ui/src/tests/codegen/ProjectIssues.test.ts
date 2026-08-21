// @vitest-environment node
/*
================================================================================
| SKB-009 / SKB-045 / SKB-010 — the issues a project carries, collected where    |
| the editor can show them instead of where the build dies.                     |
|                                                                              |
| SKB-009: an unresolvable P-lock key is `os.exit(1)` in                        |
|   codegen_analysis.odin's collect_plock_targets. Renaming a node breaks every |
|   override that named it, and nothing said so until the next Generate failed. |
| SKB-045: a non-numeric override is dropped by projectSerializer because the   |
|   generated setter is f32-only. Silently, so a waveform switch authored in    |
|   the step editor vanished between preview and export.                        |
| SKB-010: notes past min(track length, pattern length) never sound.             |
|                                                                              |
| `blocksBuild` mirrors `active_sequencer_tracks`: codegen only resolves P-locks |
| for tracks that are unmuted, non-empty and (when anything solos) soloed. A     |
| stale key on a muted track is still worth reporting, but claiming it fails     |
| Generate when it does not would be its own lie.                               |
================================================================================
*/
import { describe, it, expect } from 'vitest';
import { Node } from '@xyflow/react';
import { NodeParams, SequencerTrack } from '../../definitions/types';
import {
    collectPlockIssues,
    collectStepRangeIssues,
    formatProjectIssues,
    collectProjectIssues,
} from '../../utils/projectWarnings';

const instrument = (id: string, name: string, subNodes: unknown[]): Node<NodeParams> =>
    ({
        id,
        type: 'instrument',
        position: { x: 0, y: 0 },
        data: { label: name, name, subgraph: { nodes: subNodes, connections: [] } },
    } as unknown as Node<NodeParams>);

const sub = (id: string, type: string, data: Record<string, unknown>) =>
    ({ id, type, position: { x: 0, y: 0 }, data });

const track = (over: Partial<SequencerTrack> = {}): SequencerTrack => ({
    id: 't1',
    targetNodeId: 'inst-1',
    name: 'Bass',
    color: '#007acc',
    steps: 16,
    notes: [],
    isMuted: false,
    isSolo: false,
    ...over,
});

const nodes = [instrument('inst-1', 'Bass', [
    sub('osc-1', 'oscillator', { label: 'Osc', frequency: 440, amplitude: 0.5 }),
    sub('flt-1', 'filter', { label: 'Filter', cutoff: 800, type: 'Lowpass' }),
])];

describe('collectPlockIssues — unresolvable keys (SKB-009)', () => {
    it('reports a key whose node was renamed away, with the step that owns it', () => {
        const issues = collectPlockIssues(nodes, [track({
            notes: [{ step: 5, note: 60, velocity: 1, duration: 1, patchOverrides: { 'OldOsc:frequency': 220 } }],
        })]);
        expect(issues).toHaveLength(1);
        expect(issues[0]).toMatchObject({
            kind: 'unresolvable',
            trackId: 't1',
            step: 5,
            notePitch: 60,
            key: 'OldOsc:frequency',
            blocksBuild: true,
        });
        // The backend prints the surviving labels after "Valid targets:"; the
        // editor needs the same list to make a rename fixable.
        expect(issues[0].validTargets).toEqual(['Osc', 'Filter']);
    });

    it('says nothing about a key that still resolves', () => {
        expect(collectPlockIssues(nodes, [track({
            notes: [{ step: 5, note: 60, velocity: 1, duration: 1, patchOverrides: { 'Osc:frequency': 220 } }],
        })])).toEqual([]);
    });

    it('resolves case-insensitively, exactly as the backend does', () => {
        expect(collectPlockIssues(nodes, [track({
            notes: [{ step: 0, note: 60, velocity: 1, duration: 1, patchOverrides: { 'osc:frequency': 220 } }],
        })])).toEqual([]);
    });

    it('still reports a muted track, but does not claim the build fails', () => {
        const issues = collectPlockIssues(nodes, [track({
            isMuted: true,
            notes: [{ step: 1, note: 60, velocity: 1, duration: 1, patchOverrides: { 'Gone:frequency': 1 } }],
        })]);
        expect(issues).toHaveLength(1);
        expect(issues[0].blocksBuild).toBe(false);
    });

    it('does not claim the build fails for a track a solo elsewhere silences', () => {
        const issues = collectPlockIssues(nodes, [
            track({
                id: 'ta',
                notes: [{ step: 1, note: 60, velocity: 1, duration: 1, patchOverrides: { 'Gone:frequency': 1 } }],
            }),
            track({ id: 'tb', isSolo: true, notes: [{ step: 0, note: 60, velocity: 1, duration: 1 }] }),
        ]);
        expect(issues).toHaveLength(1);
        expect(issues[0].blocksBuild).toBe(false);
    });

    // `any_solo` in active_sequencer_tracks is `t.solo && !t.mute &&
    // len(t.events) > 0` — a solo that would not sound anyway does not silence
    // anything. Treating a muted solo as a solo made this report "Generate
    // still succeeds" about a project codegen exits(1) over.
    it('claims the build DOES fail when the only soloed track is itself muted', () => {
        const issues = collectPlockIssues(nodes, [
            track({
                id: 'ta',
                notes: [{ step: 1, note: 60, velocity: 1, duration: 1, patchOverrides: { 'Gone:frequency': 1 } }],
            }),
            track({ id: 'tb', isSolo: true, isMuted: true, notes: [{ step: 0, note: 60, velocity: 1, duration: 1 }] }),
        ]);
        expect(issues).toHaveLength(1);
        expect(issues[0].blocksBuild).toBe(true);
    });

    it('claims the build DOES fail when the solo belongs to another instrument', () => {
        // `all` in active_sequencer_tracks holds only the tracks targeting THIS
        // instrument, so a solo on a different instrument's track never
        // silences this one.
        const twoInstruments = [
            ...nodes,
            instrument('inst-2', 'Drums', [sub('n-1', 'noise', { label: 'Noise', amplitude: 1 })]),
        ];
        const issues = collectPlockIssues(twoInstruments, [
            track({
                id: 'ta',
                notes: [{ step: 1, note: 60, velocity: 1, duration: 1, patchOverrides: { 'Gone:frequency': 1 } }],
            }),
            track({ id: 'tb', targetNodeId: 'inst-2', isSolo: true, notes: [{ step: 0, note: 60, velocity: 1, duration: 1 }] }),
        ]);
        expect(issues).toHaveLength(1);
        expect(issues[0].blocksBuild).toBe(true);
    });

    it('reports nothing when the instrument node is gone (the track is an orphan)', () => {
        expect(collectPlockIssues([], [track({
            notes: [{ step: 0, note: 60, velocity: 1, duration: 1, patchOverrides: { 'Osc:frequency': 1 } }],
        })])).toEqual([]);
    });
});

describe('collectPlockIssues — non-numeric values (SKB-045)', () => {
    it('reports an override the f32-only setter cannot carry', () => {
        const issues = collectPlockIssues(nodes, [track({
            notes: [{
                step: 2, note: 60, velocity: 1, duration: 1,
                patchOverrides: { 'Filter:type': 'Highpass' } as unknown as Record<string, number>,
            }],
        })]);
        expect(issues).toHaveLength(1);
        expect(issues[0]).toMatchObject({
            kind: 'non-numeric',
            key: 'Filter:type',
            value: 'Highpass',
            step: 2,
        });
    });

    it('reports NaN, which the serializer drops just as quietly', () => {
        const issues = collectPlockIssues(nodes, [track({
            notes: [{ step: 0, note: 60, velocity: 1, duration: 1, patchOverrides: { 'Osc:frequency': NaN } }],
        })]);
        expect(issues.map(i => i.kind)).toEqual(['non-numeric']);
    });

    it('prefers the unresolvable diagnosis when a key is both', () => {
        // An unresolvable key kills the build; a dropped value merely goes
        // missing. Reporting both for one key would just be noise.
        const issues = collectPlockIssues(nodes, [track({
            notes: [{
                step: 0, note: 60, velocity: 1, duration: 1,
                patchOverrides: { 'Gone:type': 'Square' } as unknown as Record<string, number>,
            }],
        })]);
        expect(issues.map(i => i.kind)).toEqual(['unresolvable']);
    });
});

describe('collectStepRangeIssues (SKB-010)', () => {
    it('reports the count per track and the boundary that stranded them', () => {
        const issues = collectStepRangeIssues([track({
            steps: 64,
            notes: [
                { step: 0, note: 36, velocity: 1, duration: 1 },
                { step: 16, note: 36, velocity: 1, duration: 1 },
                { step: 48, note: 36, velocity: 1, duration: 1 },
            ],
        })], 16);
        expect(issues).toHaveLength(1);
        expect(issues[0]).toMatchObject({ trackId: 't1', count: 2, playableSteps: 16 });
    });

    it('reports nothing when the pattern is long enough', () => {
        expect(collectStepRangeIssues([track({
            steps: 64,
            notes: [{ step: 48, note: 36, velocity: 1, duration: 1 }],
        })], 64)).toEqual([]);
    });
});

describe('formatProjectIssues — one line per problem, naming the fix', () => {
    it('is empty for a clean project', () => {
        expect(formatProjectIssues(collectProjectIssues(nodes, [track()], 16))).toEqual([]);
    });

    it('names the track, the step and the offending key', () => {
        const lines = formatProjectIssues(collectProjectIssues(nodes, [track({
            notes: [{
                step: 7, note: 60, velocity: 1, duration: 1,
                patchOverrides: { 'Gone:frequency': 1, 'Filter:type': 'Notch' } as unknown as Record<string, number>,
            }],
        })], 16));
        expect(lines).toHaveLength(2);
        expect(lines.join('\n')).toContain('Gone:frequency');
        expect(lines.join('\n')).toContain('Filter:type');
        expect(lines.join('\n')).toContain('Bass');
        // Steps are 1-based in every user-facing string in the sequencer
        // (pushHistory's "Toggle step N" does the same).
        expect(lines.join('\n')).toContain('step 8');
    });

    it('includes the stranded-note count', () => {
        const lines = formatProjectIssues(collectProjectIssues(nodes, [track({
            steps: 64,
            notes: [{ step: 32, note: 36, velocity: 1, duration: 1 }],
        })], 16));
        expect(lines.join('\n')).toContain('will not sound');
    });
});
