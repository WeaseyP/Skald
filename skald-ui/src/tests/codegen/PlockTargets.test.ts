// @vitest-environment node
/*
================================================================================
| SKB-009 — the UI's P-lock resolution predicate, and its agreement with the    |
| backend's.                                                                    |
|                                                                              |
| A P-lock key is a "<NodeLabel>:<param>" string authored in the step editor    |
| and resolved at codegen time by skald-backend/core/codegen_analysis.odin's    |
| `resolve_plock_targets`. A key that resolves to nothing is a HARD ERROR       |
| there: `os.exit(1)`, so one stale override in one step of one track stops the |
| entire build, and the user sees only "generate failed".                        |
|                                                                              |
| Surfacing that in the editor means the UI has to answer the same question the |
| backend answers. Two readers that disagree is its own bug class here          |
| (SKB-002), so these cases are lifted straight off the Odin:                    |
|                                                                              |
|   plock_node_label(node) = get_string_param(node, "label", node.type)         |
|       - the label only when it is genuinely a JSON string                     |
|       - otherwise node.type, which backend-side is the CODEGEN type name      |
|         ("LFO", "SampleHold") and not React Flow's ("lfo", "sampleHold")      |
|   resolve_plock_targets splits on the FIRST ':' only, requires a non-empty    |
|       param part, matches the label with strings.equal_fold — case-insensitive |
|       over ASCII A-Z ONLY, since that proc's body ends in                      |
|       `// TODO(bill): Unicode folding` / `return false` — and accepts a param  |
|       that is either a key of node.parameters or a member of                   |
|       node.parameters.exposedParameters.                                      |
================================================================================
*/
import { describe, it, expect } from 'vitest';
import { Node } from '@xyflow/react';
import { NodeParams } from '../../definitions/types';
import {
    firstDeadTarget,
    isExportablePlockValue,
    macroTargetCandidates,
    paramDeadReason,
    paramIsReachable,
    plockNodeLabel,
    resolvePlockTargets,
    plockTargetLabels,
} from '../../utils/plockTargets';

const node = (id: string, type: string, data: Record<string, unknown>): Node<NodeParams> =>
    ({ id, type, position: { x: 0, y: 0 }, data } as unknown as Node<NodeParams>);

const osc = node('osc-1', 'oscillator', { label: 'Osc', frequency: 440, amplitude: 0.5 });
const lfoUnlabelled = node('lfo-1', 'lfo', { frequency: 5, amplitude: 1 });
const filt = node('flt-1', 'filter', { label: 'Filter', cutoff: 800, exposedParameters: ['cutoff'] });

describe('plockNodeLabel mirrors get_string_param(node, "label", node.type)', () => {
    it('prefers a stored string label', () => {
        expect(plockNodeLabel(osc)).toBe('Osc');
    });

    it('falls back to the CODEGEN type name, which is what the backend sees', () => {
        // node.type backend-side is `Node.type` off the serialized JSON, which
        // projectSerializer writes as NODE_DEFINITIONS[...].codegenType.
        expect(plockNodeLabel(lfoUnlabelled)).toBe('LFO');
        expect(plockNodeLabel(node('sh-1', 'sampleHold', {}))).toBe('SampleHold');
        expect(plockNodeLabel(node('o-1', 'output', {}))).toBe('GraphOutput');
    });

    it('does not treat a non-string label as a label', () => {
        // get_string_param only returns json.String; anything else falls through.
        expect(plockNodeLabel(node('x', 'filter', { label: 42 }))).toBe('Filter');
        expect(plockNodeLabel(node('x', 'filter', { label: null }))).toBe('Filter');
    });

    it('honours an empty string label, as the backend does', () => {
        expect(plockNodeLabel(node('x', 'filter', { label: '' }))).toBe('');
    });
});

describe('resolvePlockTargets mirrors resolve_plock_targets', () => {
    const nodes = [osc, lfoUnlabelled, filt];

    it('resolves a label:param key to that node', () => {
        expect(resolvePlockTargets(nodes, 'Osc:frequency')).toEqual([
            { nodeId: 'osc-1', param: 'frequency' },
        ]);
    });

    it('matches the label case-insensitively (strings.equal_fold)', () => {
        // This is what makes an unlabelled node work at all: the editor authors
        // "lfo:frequency" from React Flow's type while the backend resolves
        // against the codegen name "LFO".
        expect(resolvePlockTargets(nodes, 'lfo:frequency')).toEqual([
            { nodeId: 'lfo-1', param: 'frequency' },
        ]);
        expect(resolvePlockTargets(nodes, 'OSC:frequency')).toEqual([
            { nodeId: 'osc-1', param: 'frequency' },
        ]);
    });

    // `strings.equal_fold` folds ASCII A-Z and then gives up — its body ends
    // `// TODO(bill): Unicode folding` / `return false`. Verified against the
    // installed toolchain: equal_fold("Bäss","BÄSS") and equal_fold("Кик",
    // "кик") are both FALSE. `toLowerCase()` folds all of Unicode, so using it
    // here made the editor say "resolves" about keys codegen exits(1) over —
    // reachable by renaming a non-ASCII-labelled node to a different case,
    // which is what the backend's unicode_label_* goldens exist for.
    it('folds ASCII case ONLY, as strings.equal_fold does', () => {
        const umlaut = node('u-1', 'filter', { label: 'Bäss', cutoff: 800 });
        // Same bytes: fine.
        expect(resolvePlockTargets([umlaut], 'Bäss:cutoff')).toHaveLength(1);
        // ASCII-only case difference: still fine.
        expect(resolvePlockTargets([umlaut], 'bäss:cutoff')).toHaveLength(1);
        // A non-ASCII case difference is NOT folded backend-side.
        expect(resolvePlockTargets([umlaut], 'BÄSS:cutoff')).toEqual([]);
        expect(resolvePlockTargets([umlaut], 'BäSS:cutoff')).toHaveLength(1);

        const cyrillic = node('c-1', 'filter', { label: 'Кик', cutoff: 800 });
        expect(resolvePlockTargets([cyrillic], 'Кик:cutoff')).toHaveLength(1);
        expect(resolvePlockTargets([cyrillic], 'кик:cutoff')).toEqual([]);
    });

    it('resolves a bare param (no colon) against EVERY node that has it', () => {
        expect(resolvePlockTargets(nodes, 'frequency').map(t => t.nodeId))
            .toEqual(['osc-1', 'lfo-1']);
    });

    it('accepts a param that is only in exposedParameters', () => {
        const exposedOnly = node('g-1', 'gain', { label: 'VCA', exposedParameters: ['gain'] });
        expect(resolvePlockTargets([exposedOnly], 'VCA:gain')).toEqual([
            { nodeId: 'g-1', param: 'gain' },
        ]);
    });

    it('splits on the FIRST colon only', () => {
        const weird = node('w-1', 'filter', { label: 'A', 'b:c': 1 });
        expect(resolvePlockTargets([weird], 'A:b:c')).toEqual([{ nodeId: 'w-1', param: 'b:c' }]);
    });

    it('resolves nothing for an empty param part', () => {
        expect(resolvePlockTargets(nodes, 'Osc:')).toEqual([]);
        expect(resolvePlockTargets(nodes, '')).toEqual([]);
    });

    it('resolves nothing when the label no longer matches any node', () => {
        // The SKB-009 case: the node was renamed or deleted after the override
        // was authored. Backend-side this is os.exit(1) for the whole build.
        expect(resolvePlockTargets(nodes, 'OldName:frequency')).toEqual([]);
    });

    it('resolves nothing when the named node lacks the param', () => {
        expect(resolvePlockTargets(nodes, 'Osc:cutoff')).toEqual([]);
    });

    it('ignores the params the serializer strips before the backend sees them', () => {
        // projectSerializer deletes `analyser` and `subgraph` from parameters,
        // so a key naming them resolves in neither reader.
        const inst = node('i-1', 'instrument', { label: 'Inst', analyser: {}, subgraph: { nodes: [] } });
        expect(resolvePlockTargets([inst], 'Inst:analyser')).toEqual([]);
        expect(resolvePlockTargets([inst], 'Inst:subgraph')).toEqual([]);
    });

    it('sees no params at all on an output node, whose parameters are emptied', () => {
        const out = node('o-1', 'output', { label: 'Out', lastTrigger: 1 });
        expect(resolvePlockTargets([out], 'Out:lastTrigger')).toEqual([]);
    });
});

describe('plockTargetLabels — what the error message offers instead', () => {
    it('lists the labels the backend would print as "Valid targets"', () => {
        expect(plockTargetLabels([osc, lfoUnlabelled, filt])).toEqual(['Osc', 'LFO', 'Filter']);
    });
});

describe('paramIsReachable mirrors param_is_reachable (B5-4-followup)', () => {
    // codegen_analysis.odin, transcribed case-by-case:
    //   LFO/SampleHold/Delay: syncRate -> false always; the type's own
    //     time-base param (frequency/rate/delayTime) -> false while bpmSync.
    //   Oscillator/Wavetable: frequency -> false unless fixedPitch.
    //   Anything else: true.
    it('says syncRate is never reachable on LFO, SampleHold or Delay', () => {
        expect(paramIsReachable(node('l', 'lfo', {}), 'syncRate')).toBe(false);
        expect(paramIsReachable(node('l', 'lfo', { bpmSync: true }), 'syncRate')).toBe(false);
        expect(paramIsReachable(node('s', 'sampleHold', {}), 'syncRate')).toBe(false);
        expect(paramIsReachable(node('d', 'delay', {}), 'syncRate')).toBe(false);
    });

    it('says LFO frequency is reachable only while bpmSync is off', () => {
        expect(paramIsReachable(node('l', 'lfo', {}), 'frequency')).toBe(true);
        expect(paramIsReachable(node('l', 'lfo', { bpmSync: false }), 'frequency')).toBe(true);
        expect(paramIsReachable(node('l', 'lfo', { bpmSync: true }), 'frequency')).toBe(false);
    });

    it('says SampleHold rate and Delay delayTime follow the same bpmSync rule', () => {
        expect(paramIsReachable(node('s', 'sampleHold', { bpmSync: true }), 'rate')).toBe(false);
        expect(paramIsReachable(node('s', 'sampleHold', { bpmSync: false }), 'rate')).toBe(true);
        expect(paramIsReachable(node('d', 'delay', { bpmSync: true }), 'delayTime')).toBe(false);
        expect(paramIsReachable(node('d', 'delay', { bpmSync: false }), 'delayTime')).toBe(true);
    });

    // get_bool_param only honours a genuine JSON boolean — a stray string
    // must fall back to the default (false), not be treated as truthy.
    it('treats a non-boolean bpmSync as false, exactly as get_bool_param does', () => {
        expect(paramIsReachable(node('l', 'lfo', { bpmSync: 'true' as unknown as boolean }), 'frequency')).toBe(true);
    });

    it('does not let bpmSync affect a DIFFERENT parameter on the same node', () => {
        expect(paramIsReachable(node('l', 'lfo', { bpmSync: true }), 'amplitude')).toBe(true);
    });

    it('says Oscillator/Wavetable frequency is reachable only while fixedPitch is on', () => {
        expect(paramIsReachable(node('o', 'oscillator', {}), 'frequency')).toBe(false);
        expect(paramIsReachable(node('o', 'oscillator', { fixedPitch: false }), 'frequency')).toBe(false);
        expect(paramIsReachable(node('o', 'oscillator', { fixedPitch: true }), 'frequency')).toBe(true);
        expect(paramIsReachable(node('w', 'wavetable', {}), 'frequency')).toBe(false);
        expect(paramIsReachable(node('w', 'wavetable', { fixedPitch: true }), 'frequency')).toBe(true);
    });

    it('leaves every other node type and parameter reachable', () => {
        expect(paramIsReachable(node('f', 'filter', {}), 'cutoff')).toBe(true);
        expect(paramIsReachable(node('o', 'oscillator', { fixedPitch: false }), 'amplitude')).toBe(true);
    });

    // G4 (roadmap 9.20) — mirrors codegen_analysis.odin::param_is_reachable's
    // Wavetable case, added alongside skald-backend/tests/unit/
    // wavetable_custom_test.odin::test_param_is_reachable_position_and_pulsewidth_dead_under_custom_table.
    it('says Wavetable position and pulseWidth are dead once a decodable custom table is selected', () => {
        const withTable = { useCustomTable: true, customTable: 'AAAA' };
        expect(paramIsReachable(node('w', 'wavetable', withTable), 'position')).toBe(false);
        expect(paramIsReachable(node('w', 'wavetable', withTable), 'pulseWidth')).toBe(false);
        expect(paramIsReachable(node('w', 'wavetable', withTable), 'amplitude')).toBe(true);
    });

    it('leaves Wavetable position/pulseWidth reachable when useCustomTable is off, or on with no table stored', () => {
        expect(paramIsReachable(node('w', 'wavetable', {}), 'position')).toBe(true);
        expect(paramIsReachable(node('w', 'wavetable', {}), 'pulseWidth')).toBe(true);
        expect(paramIsReachable(node('w', 'wavetable', { useCustomTable: true }), 'position')).toBe(true);
        expect(paramIsReachable(node('w', 'wavetable', { useCustomTable: true, customTable: '' }), 'pulseWidth')).toBe(true);
        expect(paramIsReachable(node('w', 'wavetable', { customTable: 'AAAA' }), 'position')).toBe(true);
    });
});

describe('paramDeadReason mirrors param_dead_reason, wording lifted verbatim', () => {
    it('gives syncRate its own reason regardless of node type', () => {
        const reason = paramDeadReason(node('l', 'lfo', {}), 'syncRate');
        expect(reason).toContain('get_string_param');
        expect(reason).toContain('no bpmSync/fixedPitch toggle');
    });

    it('names bpmSync for LFO, SampleHold and Delay', () => {
        expect(paramDeadReason(node('l', 'lfo', {}), 'frequency')).toContain('bpmSync is on');
        expect(paramDeadReason(node('s', 'sampleHold', {}), 'rate')).toContain('bpmSync is on');
        expect(paramDeadReason(node('d', 'delay', {}), 'delayTime')).toContain('bpmSync is on');
    });

    it('names fixedPitch for Oscillator and Wavetable', () => {
        expect(paramDeadReason(node('o', 'oscillator', {}), 'frequency')).toContain('fixedPitch is off');
        expect(paramDeadReason(node('w', 'wavetable', {}), 'frequency')).toContain('fixedPitch is off');
    });

    it('names the imported table for Wavetable position/pulseWidth once useCustomTable selects one', () => {
        const withTable = { useCustomTable: true, customTable: 'AAAA' };
        expect(paramDeadReason(node('w', 'wavetable', withTable), 'position')).toContain('imported table is selected');
        expect(paramDeadReason(node('w', 'wavetable', withTable), 'pulseWidth')).toContain('imported table is selected');
    });
});

describe('firstDeadTarget — what collect_plock_targets finds before exiting', () => {
    it('returns null when every resolved target is live', () => {
        const live = node('o', 'oscillator', { label: 'Osc', fixedPitch: true, frequency: 440 });
        expect(firstDeadTarget([live], resolvePlockTargets([live], 'Osc:frequency'))).toBeNull();
    });

    it('finds the dead target once the node config changes underneath it', () => {
        // The B5-4-followup repro: P-lock frequency while fixedPitch is on
        // (the control is offered then), then flip fixedPitch off.
        const now = node('o', 'oscillator', { label: 'Osc', fixedPitch: false, frequency: 440 });
        const resolved = resolvePlockTargets([now], 'Osc:frequency');
        expect(resolved).toEqual([{ nodeId: 'o', param: 'frequency' }]);
        const dead = firstDeadTarget([now], resolved);
        expect(dead).not.toBeNull();
        expect(dead?.param).toBe('frequency');
        expect(dead?.node.id).toBe('o');
    });

    // A bare (label-less) key can resolve to several nodes; the backend walks
    // them in nodes_sorted_by_id (lexicographic id) order and exits on the
    // FIRST dead one, so the mirror must pick the same one.
    it('picks the first dead target in node-id order for a bare key', () => {
        const b = node('b-node', 'oscillator', { fixedPitch: true, frequency: 1 });
        const a = node('a-node', 'oscillator', { fixedPitch: false, frequency: 2 });
        const resolved = resolvePlockTargets([b, a], 'frequency');
        expect(resolved.map(t => t.nodeId).sort()).toEqual(['a-node', 'b-node']);
        const dead = firstDeadTarget([b, a], resolved);
        expect(dead?.node.id).toBe('a-node');
    });
});

describe('isExportablePlockValue — the f32-only setter contract (SKB-045)', () => {
    it('accepts finite numbers only', () => {
        expect(isExportablePlockValue(0)).toBe(true);
        expect(isExportablePlockValue(-12.5)).toBe(true);
    });

    it('rejects everything the generated set_param cannot carry', () => {
        expect(isExportablePlockValue(true)).toBe(false);
        expect(isExportablePlockValue('Square')).toBe(false);
        expect(isExportablePlockValue('1/8')).toBe(false);
        expect(isExportablePlockValue(NaN)).toBe(false);
        expect(isExportablePlockValue(Infinity)).toBe(false);
        expect(isExportablePlockValue(null)).toBe(false);
        expect(isExportablePlockValue(undefined)).toBe(false);
    });
});

describe('paramIsReachable — MidiInput (SKB-059 / packet B2)', () => {
    it('reports every MidiInput parameter dead, matching the Odin case', () => {
        // The editor's default MIDI Input shipped exposedParameters
        // ['device', 'useMpe']; neither string appears anywhere in the
        // generator, and with no MidiInput case the predicate said "live".
        const midi = node('m', 'midiInput', { device: 'All', useMpe: false });
        expect(paramIsReachable(midi, 'device')).toBe(false);
        expect(paramIsReachable(midi, 'useMpe')).toBe(false);
        expect(paramDeadReason(midi, 'device')).toMatch(/MIDI Input has no runtime parameters/);
    });
});

describe('macroTargetCandidates — the (node, param) picker E12\'s macro pad offers', () => {
    // Roadmap E12: the XY pad's axes are assignable to (node, param) targets
    // "chosen from the same target list the P-lock UI offers" — this is that
    // list, built the same way the per-step editor decides one field at a
    // time (numeric, and not something the node's CURRENT configuration has
    // gone dead on), just enumerated up front instead of only at render.
    it('lists every numeric, currently-reachable parameter, labelled by node', () => {
        const filt = node('flt-1', 'filter', { label: 'Filter', cutoff: 800, resonance: 2, type: 'Lowpass' });
        const out = macroTargetCandidates([filt]);
        expect(out).toEqual(expect.arrayContaining([
            { nodeId: 'flt-1', label: 'Filter', param: 'cutoff' },
            { nodeId: 'flt-1', label: 'Filter', param: 'resonance' },
        ]));
        // `type` ("Lowpass") is a string select, not a numeric target.
        expect(out.find(c => c.param === 'type')).toBeUndefined();
    });

    it('excludes a parameter paramIsReachable says is dead right now', () => {
        const lfo = node('lfo-1', 'lfo', { bpmSync: true, frequency: 5, amplitude: 1 });
        const out = macroTargetCandidates([lfo]);
        expect(out.find(c => c.param === 'frequency')).toBeUndefined(); // dead: bpmSync on
        expect(out.find(c => c.param === 'amplitude')).toBeDefined();  // unaffected
    });

    it('excludes syncRate — never reachable, even though it is present on the node', () => {
        const lfo = node('lfo-1', 'lfo', { syncRate: '1/4', amplitude: 1 });
        // syncRate is a string anyway (excluded as non-numeric too), but this
        // pins BOTH reasons rather than relying on only the numeric filter.
        expect(macroTargetCandidates([lfo]).find(c => c.param === 'syncRate')).toBeUndefined();
    });

    it('ignores the params the serializer strips before the backend ever sees them', () => {
        const inst = node('i-1', 'instrument', { label: 'Inst', analyser: {}, subgraph: { nodes: [] }, volume: 1 });
        const out = macroTargetCandidates([inst]);
        expect(out.find(c => c.param === 'analyser')).toBeUndefined();
        expect(out.find(c => c.param === 'subgraph')).toBeUndefined();
        expect(out.find(c => c.param === 'volume')).toBeDefined();
    });

    it('sees no candidates on an output node, whose parameters are emptied', () => {
        const out = node('o-1', 'output', { label: 'Out', lastTrigger: 1 });
        expect(macroTargetCandidates([out])).toEqual([]);
    });
});

describe('paramIsReachable — Oscillator pulseWidth (packet B2)', () => {
    it('is live only for an exact-match "Square" waveform, defaulting to Sine', () => {
        expect(paramIsReachable(node('o', 'oscillator', { waveform: 'Square' }), 'pulseWidth')).toBe(true);
        expect(paramIsReachable(node('o', 'oscillator', { waveform: 'Sine' }), 'pulseWidth')).toBe(false);
        expect(paramIsReachable(node('o', 'oscillator', {}), 'pulseWidth')).toBe(false);
        // The generator's switch is case-sensitive; so is the mirror.
        expect(paramIsReachable(node('o', 'oscillator', { waveform: 'square' }), 'pulseWidth')).toBe(false);
        expect(paramDeadReason(node('o', 'oscillator', { waveform: 'Sine' }), 'pulseWidth')).toMatch(/waveform is not Square/);
    });

    it('does not govern a Wavetable', () => {
        expect(paramIsReachable(node('w', 'wavetable', {}), 'pulseWidth')).toBe(true);
    });
});
