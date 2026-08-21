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
    isExportablePlockValue,
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
