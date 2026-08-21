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
    const type = node.type ?? '';
    return NODE_DEFINITIONS[type]?.codegenType ?? type;
};

/**
 * The parameter object the backend actually receives for a node — node.data
 * minus what projectSerializer strips. Keeping this in step with the serializer
 * is the whole point: a key naming `subgraph` resolves against node.data but
 * never against the JSON the backend reads.
 */
const backendParameters = (node: Node<NodeParams>): Record<string, unknown> => {
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
