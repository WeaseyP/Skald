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

// `fixedPitch: true` is deliberate: without it, `frequency` is DEAD by
// param_is_reachable's default (get_bool_param(..., "fixedPitch", false)),
// which would make every "still resolves, no problem" fixture below actually
// describe a build failure (see the "dead parameters" block further down,
// which exercises exactly that — with fixedPitch left off on purpose).
const nodes = [instrument('inst-1', 'Bass', [
    sub('osc-1', 'oscillator', { label: 'Osc', frequency: 440, fixedPitch: true, amplitude: 0.5 }),
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

describe('collectPlockIssues — dead parameters (B5-4-followup, SKB-009 second exit path)', () => {
    // Repro straight off the roadmap: P-lock Oscillator frequency while
    // fixedPitch is on (the only time the control is offered), then flip
    // fixedPitch off. The key still resolves — the node is right there — but
    // param_is_reachable now says no, which is collect_plock_targets' SECOND
    // os.exit(1), never checked by collectPlockIssues before this packet.
    const oscNodes = (fixedPitch: boolean) => [instrument('inst-1', 'Bass', [
        sub('osc-1', 'oscillator', { label: 'Osc', frequency: 440, fixedPitch, amplitude: 0.5 }),
    ])];

    it('reports nothing while fixedPitch keeps frequency live', () => {
        const issues = collectPlockIssues(oscNodes(true), [track({
            notes: [{ step: 2, note: 60, velocity: 1, duration: 1, patchOverrides: { 'Osc:frequency': 220 } }],
        })]);
        expect(issues).toEqual([]);
    });

    it('reports the override dead once fixedPitch turns off', () => {
        const issues = collectPlockIssues(oscNodes(false), [track({
            notes: [{ step: 2, note: 60, velocity: 1, duration: 1, patchOverrides: { 'Osc:frequency': 220 } }],
        })]);
        expect(issues).toHaveLength(1);
        expect(issues[0]).toMatchObject({
            kind: 'dead',
            key: 'Osc:frequency',
            deadParam: 'frequency',
            blocksBuild: true,
        });
        expect(issues[0].deadReason).toContain('fixedPitch is off');
    });

    it('does not claim the build fails for a dead override on a muted track', () => {
        const issues = collectPlockIssues(oscNodes(false), [track({
            isMuted: true,
            notes: [{ step: 2, note: 60, velocity: 1, duration: 1, patchOverrides: { 'Osc:frequency': 220 } }],
        })]);
        expect(issues).toHaveLength(1);
        expect(issues[0].kind).toBe('dead');
        expect(issues[0].blocksBuild).toBe(false);
    });

    it('reports syncRate on a Delay as dead no matter what', () => {
        const delayNodes = [instrument('inst-1', 'Bass', [
            // `syncRate` must be a stored key (or exposed) to RESOLVE at all —
            // resolve_plock_targets only matches params the node actually
            // carries. A Delay authors it once BpmSyncControl is used.
            sub('dly-1', 'delay', { label: 'Dly', delayTime: 0.3, feedback: 0.2, mix: 0.5, syncRate: '1/4' }),
        ])];
        const issues = collectPlockIssues(delayNodes, [track({
            notes: [{ step: 0, note: 60, velocity: 1, duration: 1, patchOverrides: { 'Dly:syncRate': 1 } }],
        })]);
        expect(issues).toHaveLength(1);
        expect(issues[0]).toMatchObject({ kind: 'dead', deadParam: 'syncRate' });
        expect(issues[0].deadReason).toContain('no bpmSync/fixedPitch toggle');
    });

    it('prefers non-numeric over dead when a key is both', () => {
        // A non-numeric value never survives projectSerializer's filter, so
        // collect_plock_targets never even sees this key — claiming it also
        // fails the dead-parameter check would be reporting something that
        // cannot happen.
        const issues = collectPlockIssues(oscNodes(false), [track({
            notes: [{
                step: 0, note: 60, velocity: 1, duration: 1,
                patchOverrides: { 'Osc:frequency': 'high' } as unknown as Record<string, number>,
            }],
        })]);
        expect(issues.map(i => i.kind)).toEqual(['non-numeric']);
    });
});

describe('collectPlockIssues — loose graph, no Instrument node (SKB-019, packet B6-1)', () => {
    // Plain top-level DSP nodes — no `instrument(...)` wrapper — the exact
    // shape 24 shipped examples are. `fixedPitch: true` for the same reason
    // as the top-of-file fixture: without it `frequency` is dead by default,
    // which would make the "valid P-lock" case below actually describe a
    // build failure.
    const looseNodes = [
        sub('osc-1', 'oscillator', { label: 'Osc', frequency: 440, fixedPitch: true, amplitude: 0.5 }),
        sub('flt-1', 'filter', { label: 'Filter', cutoff: 800, type: 'Lowpass' }),
    ];

    it('resolves a VALID P-lock against the WHOLE top-level graph, not just whatever single node the track happens to target', () => {
        // targetNodeId names one of the loose graph's own top-level nodes —
        // there is no Instrument node for a track to legitimately target, but
        // buildProjectData ignores targetNodeId here regardless: the
        // loose-graph branch maps `sequencerTracks` UNCONDITIONALLY, so this
        // track's notes end up in the SAME Asset's audio_graph as every other
        // node, and its P-locks must resolve against the whole thing — not
        // just whatever node its (now-vestigial) targetNodeId names.
        //
        // Before this fix: subgraphNodesFor looked the id up as if it were an
        // INSTRUMENT node, found the oscillator itself (id match), read its
        // (nonexistent) `.data.subgraph.nodes`, and got `[]` — so a P-lock
        // naming the FILTER (a different, perfectly real node in the same
        // graph) came back 'unresolvable': "Code generation will fail" for a
        // project whose editor-path codegen actually exits 0.
        const issues = collectPlockIssues(looseNodes, [track({
            targetNodeId: 'osc-1',
            notes: [{ step: 3, note: 60, velocity: 1, duration: 1, patchOverrides: { 'Filter:cutoff': 1200 } }],
        })]);
        expect(issues).toEqual([]);
    });

    it('still reports a GENUINELY unresolvable key on a loose graph (the mirror is not a blanket pass)', () => {
        const issues = collectPlockIssues(looseNodes, [track({
            targetNodeId: 'osc-1',
            notes: [{ step: 3, note: 60, velocity: 1, duration: 1, patchOverrides: { 'Gone:frequency': 1 } }],
        })]);
        expect(issues).toHaveLength(1);
        expect(issues[0]).toMatchObject({ kind: 'unresolvable', key: 'Gone:frequency' });
    });

    it('scopes solo across ALL tracks on a loose graph, not grouped by their (unrelated) targetNodeId', () => {
        // buildProjectData funnels EVERY track into the SAME synthetic Asset
        // regardless of targetNodeId, so activeTrackIds must treat them as
        // ONE group too. 'ta' and 'tb' target different (arbitrary, pre-wrap)
        // node ids that LOOK like two different instruments if grouped
        // naively — but backend-side there is only the one Asset, so tb's
        // solo silences ta exactly as it would if they shared one real
        // Instrument's tracks.
        const issues = collectPlockIssues(looseNodes, [
            track({
                id: 'ta', targetNodeId: 'osc-1',
                notes: [{ step: 1, note: 60, velocity: 1, duration: 1, patchOverrides: { 'Gone:frequency': 1 } }],
            }),
            track({ id: 'tb', targetNodeId: 'flt-1', isSolo: true, notes: [{ step: 0, note: 60, velocity: 1, duration: 1 }] }),
        ]);
        expect(issues).toHaveLength(1);
        // Before this fix: grouped by raw targetNodeId ('osc-1' vs 'flt-1'
        // read as two separate instruments), so tb's solo never reached ta
        // and this asserted true — "Generate will fail" over a track that
        // codegen never even evaluates, because tb's solo silences it first.
        expect(issues[0].blocksBuild).toBe(false);
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

    it('names the toggle responsible for a dead parameter, and offers the second fix', () => {
        const oscNodes = [instrument('inst-1', 'Bass', [
            sub('osc-1', 'oscillator', { label: 'Osc', frequency: 440, fixedPitch: false }),
        ])];
        const lines = formatProjectIssues(collectProjectIssues(oscNodes, [track({
            notes: [{ step: 4, note: 60, velocity: 1, duration: 1, patchOverrides: { 'Osc:frequency': 220 } }],
        })], 16));
        expect(lines).toHaveLength(1);
        // Reuses param_dead_reason's wording rather than inventing new text.
        expect(lines[0]).toContain('fixedPitch is off');
        // Unlike an unresolvable key, a dead one is fixable two ways.
        expect(lines[0]).toContain('Toggle BPM Sync / fixedPitch');
        expect(lines[0]).toContain('Osc:frequency');
    });

    it('says syncRate has only one fix: delete the override', () => {
        const delayNodes = [instrument('inst-1', 'Bass', [
            sub('dly-1', 'delay', { label: 'Dly', delayTime: 0.3, syncRate: '1/4' }),
        ])];
        const lines = formatProjectIssues(collectProjectIssues(delayNodes, [track({
            notes: [{ step: 0, note: 60, velocity: 1, duration: 1, patchOverrides: { 'Dly:syncRate': 1 } }],
        })], 16));
        expect(lines[0]).toContain('No node configuration makes `syncRate` live');
        expect(lines[0]).not.toContain('Toggle BPM Sync');
    });

    it('includes the stranded-note count', () => {
        const lines = formatProjectIssues(collectProjectIssues(nodes, [track({
            steps: 64,
            notes: [{ step: 32, note: 36, velocity: 1, duration: 1 }],
        })], 16));
        expect(lines.join('\n')).toContain('will not sound');
    });
});

describe('B6-1-x5 — a track targeting a non-Instrument node in a graph that has an instrument', () => {
    it('reports nothing: buildProjectData drops that track, so codegen never sees its P-locks', () => {
        const looseFilter = sub('flt-x', 'filter', { label: 'LooseFilter', cutoff: 800, type: 'Lowpass' }) as unknown as Node<NodeParams>;
        const graph = [...nodes, looseFilter];
        // Before B6-1-x5 subgraphNodesFor found the filter, read its absent
        // .data.subgraph.nodes as [], and every override here came back
        // `unresolvable` with blocksBuild: true — "Code generation will fail"
        // for a project whose codegen exits 0.
        const issues = collectPlockIssues(graph, [track({
            targetNodeId: 'flt-x',
            notes: [{ step: 0, note: 60, velocity: 1, duration: 1, patchOverrides: { 'Osc:frequency': 220 } }],
        })]);
        expect(issues).toEqual([]);
    });

    it('still resolves a track that targets the real instrument in the same graph', () => {
        const looseFilter = sub('flt-x', 'filter', { label: 'LooseFilter', cutoff: 800, type: 'Lowpass' }) as unknown as Node<NodeParams>;
        const issues = collectPlockIssues([...nodes, looseFilter], [track({
            notes: [{ step: 0, note: 60, velocity: 1, duration: 1, patchOverrides: { 'Gone:frequency': 220 } }],
        })]);
        expect(issues).toHaveLength(1);
        expect(issues[0].blocksBuild).toBe(true);
    });
});
