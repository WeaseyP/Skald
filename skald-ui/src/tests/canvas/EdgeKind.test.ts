// E7: semantic cable colours (roadmap 0.2 §9.6 item 2 — "tinting audio
// signal pathways green, continuous modulation wires orange, and trigger
// pulses blue for rapid visual debugging").
//
// classifyEdgeKind infers a wire's kind from the TARGET port it lands on
// first (every concrete port in components/Nodes/*.tsx's makeParamNode specs
// is enumerable and fixed — see the manual's own rule, 01-getting-started.md:
// "a port named plain `input` carries audio, one named `input_<something>`
// carries modulation"), and only falls back to the SOURCE node's type when
// the target is a generic pass-through port (Instrument/Group boundary
// crossings, whose port names are arbitrary exposed-parameter strings, not
// the fixed vocabulary above). Gate/trigger handles are checked first and
// win regardless of what they're plugged into, because a MIDI gate wired
// into an audio input is exactly the anti-pattern worth flagging (see
// ADSRNode.tsx's own comment: sax3.json did this and multiplied the release
// tail by zero at note-off).
import { describe, expect, it } from 'vitest';
import { Edge, Node } from '@xyflow/react';
import { classifyEdgeKind, EDGE_KIND_COLORS, styleEdgesBySemanticKind } from '../../components/Edges/edgeKind';

describe('classifyEdgeKind', () => {
    it('Oscillator -> Filter "input" is audio', () => {
        expect(classifyEdgeKind(
            { nodeType: 'oscillator', handleId: 'output' },
            { nodeType: 'filter', handleId: 'input' },
        )).toBe('audio');
    });

    it('LFO -> Filter "input_cutoff" is modulation', () => {
        expect(classifyEdgeKind(
            { nodeType: 'lfo', handleId: 'output' },
            { nodeType: 'filter', handleId: 'input_cutoff' },
        )).toBe('modulation');
    });

    it('a MIDI gate wired into an ADSR is trigger, even though ADSR\'s "input" is otherwise audio', () => {
        expect(classifyEdgeKind(
            { nodeType: 'midiInput', handleId: 'gate' },
            { nodeType: 'adsr', handleId: 'input' },
        )).toBe('trigger');
    });

    it('unknown node types fall back to the current default (no forced colour)', () => {
        expect(classifyEdgeKind(
            { nodeType: 'someFutureNode', handleId: 'thing' },
            { nodeType: 'anotherFutureNode', handleId: 'whatsit' },
        )).toBeUndefined();
    });

    // Beyond the brief's four required cases: the rest of the target-port
    // table, and the two genuinely generic-target cases (source-type
    // fallback).
    it('every input_<param> modulation port on every source-driven node classifies as modulation', () => {
        const cases: Array<[string, string]> = [
            ['filter', 'input_res'],
            ['panner', 'input_pan'],
            ['gain', 'input_gain'],
            ['oscillator', 'input_freq'],
            ['oscillator', 'input_amp'],
            ['oscillator', 'input_pulseWidth'],
            ['wavetable', 'input_freq'],
            ['wavetable', 'input_pos'],
            ['noise', 'input_amp'],
            ['fmOperator', 'input_mod'],
            ['fmOperator', 'input_carrier'],
        ];
        for (const [nodeType, handleId] of cases) {
            expect(classifyEdgeKind({ nodeType: 'lfo', handleId: 'output' }, { nodeType, handleId }))
                .toBe('modulation');
        }
    });

    it('Mixer channel inputs are audio, not modulation, despite the input_<n> shape', () => {
        expect(classifyEdgeKind(
            { nodeType: 'oscillator', handleId: 'output' },
            { nodeType: 'mixer', handleId: 'input_7' },
        )).toBe('audio');
    });

    it('Mapper is always modulation (its whole purpose is CV shaping), even fed from an audio source', () => {
        expect(classifyEdgeKind(
            { nodeType: 'oscillator', handleId: 'output' },
            { nodeType: 'mapper', handleId: 'input' },
        )).toBe('modulation');
    });

    it('a generic Instrument-boundary target falls back to the source node type: LFO in is modulation', () => {
        expect(classifyEdgeKind(
            { nodeType: 'lfo', handleId: 'output' },
            { nodeType: 'instrument', handleId: 'cutoff' },
        )).toBe('modulation');
    });

    it('a generic Instrument-boundary target falls back to the source node type: Oscillator in is audio', () => {
        expect(classifyEdgeKind(
            { nodeType: 'oscillator', handleId: 'output' },
            { nodeType: 'instrument', handleId: 'level' },
        )).toBe('audio');
    });

    it('a generic Group-boundary target falls back to the source node type', () => {
        expect(classifyEdgeKind(
            { nodeType: 'sampleHold', handleId: 'output' },
            { nodeType: 'group', handleId: 'group-input-abc123-input_cutoff' },
        )).toBe('modulation');
    });

    it('MIDI pitch/velocity outputs read as modulation, not audio, when the target is generic', () => {
        expect(classifyEdgeKind(
            { nodeType: 'midiInput', handleId: 'pitch' },
            { nodeType: 'instrument', handleId: 'someExposedParam' },
        )).toBe('modulation');
        expect(classifyEdgeKind(
            { nodeType: 'midiInput', handleId: 'velocity' },
            { nodeType: 'instrument', handleId: 'someExposedParam' },
        )).toBe('modulation');
    });
});

// This is the exact function app.tsx's edge-styling useMemo calls
// (styleEdgesBySemanticKind(nodes, edges)) — testing it here means app.tsx
// carries no copy of this logic to drift from (CLAUDE.md's "one reader, not
// two"), and these assertions cover both requirements the brief calls out by
// name: nothing new reaches the save file, and a selected edge keeps its
// highlight.
describe('styleEdgesBySemanticKind', () => {
    const osc: Node = { id: 'osc-1', type: 'oscillator', position: { x: 0, y: 0 }, data: {} };
    const filt: Node = { id: 'filt-1', type: 'filter', position: { x: 100, y: 0 }, data: {} };

    it('colors a known edge via the CSS custom property, not a literal stroke', () => {
        const edge: Edge = { id: 'e1', source: 'osc-1', target: 'filt-1', sourceHandle: 'output', targetHandle: 'input' };
        const [styled] = styleEdgesBySemanticKind([osc, filt], [edge]);
        expect((styled.style as Record<string, unknown> | undefined)?.['--xy-edge-stroke']).toBe(EDGE_KIND_COLORS.audio);
        expect((styled.style as Record<string, unknown> | undefined)?.stroke).toBeUndefined();
    });

    it('leaves an edge with no resolvable kind completely unstyled (the current default)', () => {
        const mystery: Node = { id: 'm-1', type: 'someFutureNode', position: { x: 0, y: 0 }, data: {} };
        const edge: Edge = { id: 'e2', source: 'm-1', target: 'filt-1', sourceHandle: 'thing', targetHandle: 'whatsit' };
        const [styled] = styleEdgesBySemanticKind([mystery, filt], [edge]);
        expect(styled).toBe(edge); // same reference: no style object was invented
    });

    it('does not add a `style` key to the objects it is handed — only to the copies it returns', () => {
        const edge: Edge = { id: 'e1', source: 'osc-1', target: 'filt-1', sourceHandle: 'output', targetHandle: 'input' };
        styleEdgesBySemanticKind([osc, filt], [edge]);
        expect(edge.style).toBeUndefined();
    });

    it('preserves `selected` on the returned edge, so React Flow\'s own .selected rule still applies', () => {
        const edge: Edge = { id: 'e1', source: 'osc-1', target: 'filt-1', sourceHandle: 'output', targetHandle: 'input', selected: true };
        const [styled] = styleEdgesBySemanticKind([osc, filt], [edge]);
        expect(styled.selected).toBe(true);
    });
});
