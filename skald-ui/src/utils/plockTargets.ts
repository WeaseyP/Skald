/*
================================================================================
| FILE: skald-ui/src/utils/plockTargets.ts                                     |
|                                                                              |
| The UI's answer to "does this P-lock key still point at anything?" — and it   |
| must be the SAME answer the backend gives.                                    |
|                                                                              |
| A P-lock is a per-step parameter override, keyed by the "<NodeLabel>:<param>" |
| string the step editor authors. skald-backend/core/codegen_analysis.odin      |
| resolves those keys (`resolve_plock_targets`, `plock_node_label`) to a        |
| collision-free generated field name. A key that resolves to NOTHING is a hard |
| error there — `os.exit(1)` — so one stale override in one step of one track   |
| aborts the whole build, and all the user sees is that Generate failed         |
| (SKB-009).                                                                    |
|                                                                              |
| Showing that in the editor requires the editor to reproduce the backend's     |
| judgement exactly. This file is that mirror, and every rule in it is lifted   |
| off the Odin rather than reasoned out afresh — two readers of the same key     |
| that disagree is the SKB-002 defect class, and it would be worse here than    |
| useless: an editor that said "fine" where codegen says "fatal" would send the |
| user hunting a build failure with no offender to find.                        |
|                                                                              |
| Kept next to projectSerializer.ts because it reads the node exactly as the    |
| serializer WRITES it: the backend only ever sees `parameters`, which is        |
| node.data minus the UI-only keys the serializer strips.                       |
================================================================================
*/
import { Node } from '@xyflow/react';
import { NODE_DEFINITIONS } from '../definitions/node-definitions';
import { NodeParams } from '../definitions/types';

/** A resolved (node, param) pair — the UI shape of Odin's `Plock_Target`. */
export interface PlockTarget {
    nodeId: string;
    param: string;
}

/**
 * The label a P-lock key must name to reach this node.
 *
 * Mirror of `plock_node_label`: `get_string_param(node, "label", node.type)`.
 * Two details matter and are easy to get wrong:
 *
 *  - `get_string_param` returns the stored value ONLY when it is a JSON string,
 *    so a numeric or null `label` falls through to the type — and an empty
 *    string label is honoured as an empty label, matching no key.
 *  - `node.type` backend-side is the type off the serialized JSON, which is
 *    `NODE_DEFINITIONS[...].codegenType` ("LFO", "SampleHold", "GraphOutput"),
 *    NOT React Flow's type ("lfo", "sampleHold", "output"). For most types
 *    those differ only in case, which the case-insensitive match below
 *    forgives; for `output`/`InstrumentOutput`/`InstrumentInput` they differ
 *    outright, so using React Flow's type here would resolve keys the backend
 *    rejects.
 */
export const plockNodeLabel = (node: Node<NodeParams>): string => {
    const label = (node.data as Record<string, unknown> | undefined)?.label;
    if (typeof label === 'string') return label;
    return nodeCodegenType(node);
};

/**
 * The type name the backend actually sees for this node — `Node.type` off the
 * serialized JSON, which `projectSerializer.formatNodesForCodegen` writes as
 * `NODE_DEFINITIONS[node.type].codegenType`, NOT React Flow's own type
 * ("lfo" vs "LFO"). `param_is_reachable` switches on this same string, so it
 * has to be computed the same way `plockNodeLabel`'s type fallback does
 * rather than re-deriving it — a second derivation that drifted case would be
 * exactly the SKB-002 pattern.
 */
const nodeCodegenType = (node: Node<NodeParams>): string => {
    const type = node.type ?? '';
    return NODE_DEFINITIONS[type]?.codegenType ?? type;
};

/**
 * The parameter object the backend actually receives for a node — node.data
 * minus what projectSerializer strips. Keeping this in step with the serializer
 * is the whole point: a key naming `subgraph` resolves against node.data but
 * never against the JSON the backend reads.
 *
 * Exported for `macroTargetCandidates` (E12): the macro pad's target picker
 * needs the same "what does the backend actually see" filter a P-lock key
 * resolves against, not a second guess at which fields are UI-only.
 */
export const backendParameters = (node: Node<NodeParams>): Record<string, unknown> => {
    if (node.type === 'output' || node.type === 'GraphOutput') return {};
    const params = { ...(node.data as Record<string, unknown> | undefined ?? {}) };
    delete params.analyser;
    delete params.subgraph;
    return params;
};

/** Mirror of the `has_param` branch: a real key, or a member of exposedParameters. */
const nodeHasParam = (node: Node<NodeParams>, param: string): boolean => {
    const params = backendParameters(node);
    if (Object.prototype.hasOwnProperty.call(params, param)) return true;
    const exposed = params.exposedParameters;
    return Array.isArray(exposed) && exposed.some(name => name === param);
};

/**
 * Mirror of `get_bool_param(node, name, false)`: the stored value counts ONLY
 * when it is a genuine JSON boolean — a string `"true"` or a missing key both
 * fall back to `false`, exactly as the Odin does (`val.(json.Boolean)` is a
 * type-asserted switch, not a truthy coercion).
 */
const boolParam = (node: Node<NodeParams>, name: string): boolean => {
    const v = backendParameters(node)[name];
    return typeof v === 'boolean' ? v : false;
};

/**
 * Mirror of `param_is_reachable` (codegen_analysis.odin). A P-lock resolving
 * to a parameter this returns `false` for is `collect_plock_targets`'s
 * SECOND `os.exit(1)` path — the key names a real node, but the node's
 * current configuration means the generated struct never has a field for it,
 * so the override would compile clean and then silently do nothing.
 *
 * Every branch below is transcribed case-by-case off the Odin, not reasoned
 * out independently (SKB-002):
 *
 *   case "LFO":        syncRate → false; frequency → live only when !bpmSync
 *   case "SampleHold":  syncRate → false; rate      → live only when !bpmSync
 *   case "Delay":       syncRate → false; delayTime → live only when !bpmSync
 *   case "Oscillator",
 *        "Wavetable":   frequency → live only when fixedPitch is on
 *   default:            true
 *
 * `bpm_sync_seconds_expr`'s `synced` flag (what "bpmSync" means here) is
 * exactly `get_bool_param(node, "bpmSync", false)` — it does not also require
 * `syncRate` to hold a recognised division; an unrecognised string still
 * counts as synced and falls back to a quarter note. So the mirror below
 * checks the boolean alone, same as the Odin.
 */
export const paramIsReachable = (node: Node<NodeParams>, param: string): boolean => {
    switch (nodeCodegenType(node)) {
        case 'LFO':
            if (param === 'syncRate') return false;
            if (param !== 'frequency') return true;
            return !boolParam(node, 'bpmSync');
        case 'SampleHold':
            if (param === 'syncRate') return false;
            if (param !== 'rate') return true;
            return !boolParam(node, 'bpmSync');
        case 'Delay':
            if (param === 'syncRate') return false;
            if (param !== 'delayTime') return true;
            return !boolParam(node, 'bpmSync');
        case 'Oscillator':
        case 'Wavetable':
            // Mirror of the Odin: p.pulseWidth is read only inside
            // generate_oscillator_code's exact-match "Square" branch, and the
            // generator's waveform default is "Sine". Case-sensitive on
            // purpose — the generator's switch is.
            if (nodeCodegenType(node) === 'Oscillator' && param === 'pulseWidth') {
                const waveform = backendParameters(node)['waveform'];
                return (typeof waveform === 'string' ? waveform : 'Sine') === 'Square';
            }
            // G4: an imported single-cycle table bypasses the four-shape morph
            // (generate_wavetable_code's use_custom_table branch calls
            // skald_wavetable_sample_custom, which reads only phase) —
            // position no longer selects anything, and there is no duty
            // cycle to narrow. Mirrors codegen_analysis.odin::param_is_reachable
            // case by case: useCustomTable on AND a customTable string present
            // (not merely non-decodable — this mirror does not attempt to
            // validate the blob, matching the Odin's own best-effort gate).
            if (nodeCodegenType(node) === 'Wavetable' && (param === 'position' || param === 'pulseWidth')) {
                const customTable = backendParameters(node)['customTable'];
                if (boolParam(node, 'useCustomTable') && typeof customTable === 'string' && customTable !== '') {
                    return false;
                }
            }
            if (param !== 'frequency') return true;
            return boolParam(node, 'fixedPitch');
        case 'MidiInput':
            // SKB-059 / packet B2: generate_midi_input_code reads nothing
            // from the processor struct, so no MidiInput parameter is ever
            // live. Mirrors the Odin case added in the same packet.
            return false;
        default:
            return true;
    }
};

/**
 * Mirror of `param_dead_reason`, wording lifted verbatim so the editor and
 * the generator's `os.exit(1)` message tell the same story rather than two
 * that can drift apart. `syncRate` is checked first and independently of
 * node type, exactly as the Odin does — it is the one case with no
 * configuration-based fix at all.
 */
export const paramDeadReason = (node: Node<NodeParams>, param: string): string => {
    if (param === 'syncRate') {
        return 'syncRate is only ever read at codegen time via get_string_param, straight off the authored parameter — never through an exposed struct field — so no bpmSync/fixedPitch toggle or any other configuration ever makes it live';
    }
    switch (nodeCodegenType(node)) {
        case 'LFO':
        case 'SampleHold':
        case 'Delay':
            return 'bpmSync is on, so its time base comes from syncRate instead';
        case 'Oscillator':
        case 'Wavetable':
            if (nodeCodegenType(node) === 'Wavetable' && (param === 'position' || param === 'pulseWidth')) {
                const customTable = backendParameters(node)['customTable'];
                if (boolParam(node, 'useCustomTable') && typeof customTable === 'string' && customTable !== '') {
                    return 'an imported table is selected, so the four-shape morph (and its duty cycle) is never read';
                }
            }
            if (param === 'pulseWidth') {
                return 'waveform is not Square, so pulseWidth is never read — only a pulse wave has a width';
            }
            return 'fixedPitch is off, so the played note drives pitch instead';
        case 'MidiInput':
            return 'MIDI Input has no runtime parameters — device and useMpe are editor-side routing settings the generated DSP never reads';
        default:
            return 'the current node configuration never reads it';
    }
};

/**
 * The first resolved target whose parameter is dead, in the same order
 * `collect_plock_targets` would find it: that proc's `for t in resolved` walks
 * `all_nodes` as returned by `nodes_sorted_by_id` — sorted by node id — so
 * when a bare (no-label) key resolves to several nodes, the FIRST dead one in
 * id order is what the backend reports and exits on. Returns `null` when
 * every resolved target is live, meaning the key survives codegen.
 *
 * Only the ordering matters for which node/param ends up in the message; it
 * does not change WHETHER the key is dead (that is true the moment any
 * resolved target is dead), so callers that only need the boolean can skip
 * this and call `paramIsReachable` directly.
 */
export const firstDeadTarget = (
    nodes: Node<NodeParams>[],
    targets: PlockTarget[],
): { node: Node<NodeParams>; param: string } | null => {
    const byId = new Map(nodes.map(n => [n.id, n] as const));
    const sorted = [...targets].sort((a, b) => (a.nodeId < b.nodeId ? -1 : a.nodeId > b.nodeId ? 1 : 0));
    for (const t of sorted) {
        const node = byId.get(t.nodeId);
        if (node && !paramIsReachable(node, t.param)) return { node, param: t.param };
    }
    return null;
};

/**
 * Case-fold a label the way `strings.equal_fold` does — which is ASCII-ONLY.
 *
 * Odin's implementation folds `A`..`Z` against `a`..`z` and then gives up:
 * `// TODO(bill): Unicode folding`, `return false`. So `equal_fold("Bäss",
 * "BÄSS")` is FALSE backend-side, and so is `equal_fold("Кик", "кик")`.
 *
 * `String.prototype.toLowerCase` folds the whole Unicode range, so using it
 * here made the editor MORE permissive than the generator on exactly the
 * labels the backend keeps `unicode_label_*` goldens for: rename a node with a
 * non-ASCII label to a different case and the editor would call every override
 * naming it fine while codegen exits(1) over it. An under-warning mirror is
 * worse than no mirror — it sends the user hunting a build failure with no
 * offender to find.
 */
const equalFoldAscii = (a: string, b: string): boolean => {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
        const x = a.charCodeAt(i);
        const y = b.charCodeAt(i);
        if (x === y) continue;
        // Both must be ASCII letters differing only by the 0x20 case bit.
        const lo = Math.min(x, y);
        const hi = Math.max(x, y);
        if (hi < 0x80 && hi === lo + 0x20 && lo >= 0x41 && lo <= 0x5a) continue;
        return false;
    }
    return true;
};

/**
 * Every node a P-lock key addresses. Empty means the key is unresolvable — the
 * state that makes codegen exit(1).
 *
 * Mirror of `resolve_plock_targets`: split on the FIRST ':' only, an empty
 * param part resolves nothing, a key with no label part matches every node
 * carrying the param, and the label match is case-insensitive over ASCII only
 * (`strings.equal_fold` — see equalFoldAscii for why "only" matters).
 */
export const resolvePlockTargets = (nodes: Node<NodeParams>[], key: string): PlockTarget[] => {
    const idx = key.indexOf(':');
    const labelPart = idx >= 0 ? key.slice(0, idx) : '';
    const paramPart = idx >= 0 ? key.slice(idx + 1) : key;
    if (paramPart.length === 0) return [];

    const targets: PlockTarget[] = [];
    for (const node of nodes) {
        if (labelPart.length > 0 && !equalFoldAscii(plockNodeLabel(node), labelPart)) continue;
        if (!nodeHasParam(node, paramPart)) continue;
        targets.push({ nodeId: node.id, param: paramPart });
    }
    return targets;
};

/** True when a key still points at something the generator can write. */
export const isPlockKeyResolvable = (nodes: Node<NodeParams>[], key: string): boolean =>
    resolvePlockTargets(nodes, key).length > 0;

/**
 * The labels the backend prints after "Valid targets:" when it rejects a key.
 * Offered in the editor for the same reason: a rename is far easier to undo
 * once you can see what the names became.
 */
export const plockTargetLabels = (nodes: Node<NodeParams>[]): string[] =>
    nodes.map(plockNodeLabel);

/** A single (node, param) target — the unit a P-lock key or a macro axis addresses. */
export interface MacroTargetCandidate {
    nodeId: string;
    label: string;
    param: string;
}

/**
 * Roadmap E12 — every (node, param) pair a macro axis (or, equivalently, a
 * P-lock) could legally address on these nodes RIGHT NOW: present, numeric,
 * and not something `paramIsReachable` currently says is dead. This is the
 * same rule the per-step editor already applies one control at a time
 * (`StepPropertiesEditor.tsx`'s `canPlock`/wrapper): enumerated here instead,
 * so a picker can be built without rendering every node's controls first.
 *
 * "Currently" matters: like a P-lock, an assignment that was live when made
 * can go dead later (bpmSync flips on, fixedPitch flips off) with no warning
 * anywhere else — the live macro write silently stops reaching the DSP the
 * same way an exposed control does (packet B2), which is a pre-existing
 * class of surprise this file exists to make visible, not a new one this
 * function introduces.
 */
export const macroTargetCandidates = (nodes: Node<NodeParams>[]): MacroTargetCandidate[] => {
    const out: MacroTargetCandidate[] = [];
    for (const node of nodes) {
        const label = plockNodeLabel(node);
        const params = backendParameters(node);
        for (const param of Object.keys(params).sort()) {
            const value = params[param];
            if (typeof value !== 'number' || !Number.isFinite(value)) continue;
            if (!paramIsReachable(node, param)) continue;
            out.push({ nodeId: node.id, label, param });
        }
    }
    return out;
};

/**
 * Whether a P-lock value survives export.
 *
 * SKB-045: the generated per-step setter is `<ns>_set_param(p, name, f32)`, so
 * only a finite number can be carried. projectSerializer has always filtered
 * everything else out — silently, which meant a waveform or BPM-Sync override
 * authored in the step editor vanished between the preview and the export with
 * no trace anywhere. Both the serializer's filter and the editor's warning read
 * this one predicate, so what the editor flags is exactly what gets dropped.
 */
export const isExportablePlockValue = (value: unknown): value is number =>
    typeof value === 'number' && Number.isFinite(value);
