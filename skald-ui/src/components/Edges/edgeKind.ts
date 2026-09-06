/*
================================================================================
| FILE: skald-ui/src/components/Edges/edgeKind.ts                             |
|                                                                              |
| E7 (roadmap 0.2 §9.6 item 2): infers a wire's semantic kind — audio,          |
| modulation or trigger — for the "rapid visual debugging" cable colours the   |
| roadmap describes, from the two node types and two handle ids an edge        |
| already carries. Pure and side-effect-free so app.tsx's edge-styling         |
| selector (the memoised consumer) can call it once per edge per graph change  |
| without touching any of the 17 components/Nodes/*.tsx files or the save      |
| file.                                                                        |
|                                                                              |
| The port vocabulary this reads is not invented here: the manual already      |
| documents it as the app's existing convention (01-getting-started.md, "a     |
| port named plain `input` carries audio, one named `input_<something>`       |
| carries modulation"), and the backend enforces the same split mechanically — |
| every `input_<param>` port is read through get_f32_param's modulation-sum    |
| path (param_utils.odin), while a bare `input`/`output` carries the audio     |
| chain (find_inputs_for_port(graph, node.id, "input")). This module mirrors   |
| that existing split for the canvas, case-by-case against each node's port    |
| list in components/Nodes/*.tsx and InstrumentNode.tsx, per CLAUDE.md's "one  |
| reader, not two" rule for a second implementation of an existing contract.    |
================================================================================
*/

import type { CSSProperties } from 'react';
import type { Edge, Node } from '@xyflow/react';

export type EdgeKind = 'audio' | 'modulation' | 'trigger';

export interface EdgeEndpoint {
    nodeType: string | undefined;
    handleId: string | null | undefined;
}

// The roadmap's own palette, harmonised with NodeStyles.ts's existing
// accents rather than invented fresh: audio green is NodeTheme.handleOut /
// the ADSR accent, modulation orange is the Oscillator accent ("primary
// source" — the roadmap's own word for what an orange wire carries), trigger
// blue is the Filter accent (already the only blue in the palette).
export const EDGE_KIND_COLORS: Record<EdgeKind, string> = {
    audio: '#68D391',
    modulation: '#F6AD55',
    trigger: '#63B3ED',
};

export const EDGE_KIND_LABELS: Record<EdgeKind, string> = {
    audio: 'Audio',
    modulation: 'Modulation',
    trigger: 'Trigger / gate',
};

// A gate or trigger pulse is rare and worth flagging wherever it lands —
// including into a plain audio input, which is a known real anti-pattern
// (ADSRNode.tsx's own comment: sax3.json wired a MIDI gate into the ADSR's
// audio "input" and multiplied the release tail by zero at note-off). So
// this check runs BEFORE the target-port table and wins regardless of what
// the handle is plugged into.
const isGateHandle = (handleId: string | null | undefined): boolean =>
    handleId === 'gate' || handleId === 'trigger';

// Every concrete, non-generic port declared across components/Nodes/*.tsx's
// makeParamNode specs and the two raw-Handle files (GraphOutputNode,
// MixerNode's bare "output"), keyed "<nodeType>:<handleId>". Deliberately
// absent: 'instrument' and 'group', whose port names are arbitrary exposed-
// parameter strings assigned at Explode/Create-Instrument time, not this
// fixed vocabulary — those fall through to classifyBySource below. Mixer's
// numbered channels (input_1..input_32) are handled by pattern, not
// enumeration, immediately after this table.
const TARGET_PORT_KIND: Record<string, EdgeKind> = {
    'filter:input': 'audio',
    'filter:input_cutoff': 'modulation',
    'filter:input_res': 'modulation',
    'adsr:input': 'audio',
    'delay:input': 'audio',
    'reverb:input': 'audio',
    'distortion:input': 'audio',
    'panner:input': 'audio',
    'panner:input_pan': 'modulation',
    'gain:input': 'audio',
    'gain:input_gain': 'modulation',
    // Mapper's ports are always modulation (MapperNode.tsx's own comment:
    // "Rescales a modulation signal") — bare "input"/"output" here does NOT
    // mean audio the way it does on the effects chain above, which is
    // exactly why this needs a per-(nodeType, handleId) table rather than a
    // naming rule alone.
    'mapper:input': 'modulation',
    'oscillator:input_freq': 'modulation',
    'oscillator:input_amp': 'modulation',
    'oscillator:input_pulseWidth': 'modulation',
    'wavetable:input_freq': 'modulation',
    'wavetable:input_pos': 'modulation',
    'wavetable:input_amp': 'modulation',
    'wavetable:input_pulseWidth': 'modulation',
    'noise:input_amp': 'modulation',
    // codegen_nodes.odin's generate_fm_operator_code sums input_carrier
    // alongside input_freq into the SAME phase-modulation term, and
    // input_mod into the phase directly — both are modulation, not the
    // node's own audio output, despite "carrier" sounding like a signal.
    'fmOperator:input_mod': 'modulation',
    'fmOperator:input_carrier': 'modulation',
    'fmOperator:input_amp': 'modulation',
    'output:input': 'audio',
};

const MIXER_CHANNEL_INPUT = /^input_\d+$/;

// Node types whose default (unlabelled) OUTPUT the source-fallback path
// treats as audio — every node type this app registers except the three
// modulation-only sources and MIDI Input's per-handle special case below.
const AUDIO_SOURCE_TYPES = new Set([
    'oscillator', 'wavetable', 'fmOperator', 'noise', 'filter', 'adsr',
    'delay', 'reverb', 'distortion', 'mixer', 'panner', 'gain', 'output',
    'instrument', 'group', 'InstrumentInput', 'InstrumentOutput',
]);

// Only reached for a GENERIC target (the target-port table above has no
// entry — an Instrument/Group boundary crossing, or the target's own type is
// unrecognised). Infers from what the SOURCE typically emits.
const classifyBySource = (source: EdgeEndpoint): EdgeKind | undefined => {
    const { nodeType, handleId } = source;
    if (nodeType === 'lfo' || nodeType === 'sampleHold' || nodeType === 'mapper') return 'modulation';
    // gate is already resolved to 'trigger' before this runs; pitch/velocity
    // are continuous per-note control signals, not audio.
    if (nodeType === 'midiInput') return 'modulation';
    if (nodeType !== undefined && AUDIO_SOURCE_TYPES.has(nodeType)) return 'audio';
    return undefined; // a genuinely unrecognised node type: no forced colour
};

export const classifyEdgeKind = (source: EdgeEndpoint, target: EdgeEndpoint): EdgeKind | undefined => {
    if (isGateHandle(source.handleId) || isGateHandle(target.handleId)) return 'trigger';

    const targetKey = `${target.nodeType ?? ''}:${target.handleId ?? ''}`;
    const targetKind = TARGET_PORT_KIND[targetKey];
    if (targetKind) return targetKind;

    if (target.nodeType === 'mixer' && MIXER_CHANNEL_INPUT.test(target.handleId ?? '')) return 'audio';

    return classifyBySource(source);
};

// The one place app.tsx's edge-styling selector calls into this module, so
// the derivation itself stays out of app.tsx and is unit-testable without a
// DOM (CLAUDE.md's "one reader, not two": app.tsx must not carry its own
// copy of this map/lookup). Returns a NEW array — the caller (a useMemo over
// [edges, nodes]) must not feed this back into setEdges, or the document's
// edges would gain a `style` field the save file was never meant to carry.
//
// The colour rides in as the CSS custom property React Flow's own default
// edge already reads for its unselected stroke (`--xy-edge-stroke`), not a
// literal `stroke`: BaseEdge spreads `style` directly onto the SVG path
// element, so a literal `stroke` there would out-specificity the
// `.selected .react-flow__edge-path { stroke: ... }` rule and permanently
// hide the selection highlight. The `.selected` rule sets `stroke` outright
// and never reads this variable, so it still wins when the edge is selected.
export const styleEdgesBySemanticKind = (nodes: Node[], edges: Edge[]): Edge[] => {
    const nodeTypeById = new Map<string, string | undefined>();
    for (const n of nodes) nodeTypeById.set(n.id, n.type);

    return edges.map((edge) => {
        const kind = classifyEdgeKind(
            { nodeType: nodeTypeById.get(edge.source), handleId: edge.sourceHandle },
            { nodeType: nodeTypeById.get(edge.target), handleId: edge.targetHandle },
        );
        if (!kind) return edge;
        return {
            ...edge,
            style: { ...edge.style, '--xy-edge-stroke': EDGE_KIND_COLORS[kind] } as CSSProperties,
        };
    });
};
