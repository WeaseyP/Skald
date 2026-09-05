/*
================================================================================
| FILE: skald-ui/src/utils/saveMigrations.ts                                   |
|                                                                              |
| Roadmap packet C1 — the save file's schema version and its migration        |
| registry (SKB-054, F-B06-1/7/12, F-C3-6).                                    |
|                                                                              |
| Every save the editor writes carries `version: CURRENT_SAVE_VERSION`. Every |
| file it reads is brought forward through MIGRATIONS, in order, from the      |
| version it declares (absent ⇒ 0, the pre-C1 shape) to the current one,       |
| BEFORE any state is touched. A file from a newer Skald is refused with a     |
| clear message rather than half-understood.                                   |
|                                                                              |
| Why a registry and not more ad hoc shims: parseSaveFile had two of them —   |
| React Flow's `parentNode` -> `parentId` rehydration and the dead-exposure    |
| scrub — and the first did NOT recurse into Instrument subgraphs (F-B06-7),   |
| while every schema change queued behind this packet targets subgraph nodes. |
| Migrations here run through ONE node walk that recurses, and each one is a  |
| pure function of the file with a fixture pair pinning it.                   |
|                                                                              |
| The backend mirrors CURRENT_SAVE_VERSION (json.odin SAVE_FORMAT_VERSION)    |
| and refuses a newer version the same way; bump both together.               |
================================================================================
*/

import { isInstrumentNodeType } from './projectSerializer';
import { inferAssetType, isAssetTypeSetting, legacyExportIds } from './assetIdentity';
import { Node } from '@xyflow/react';
import { NodeParams } from '../definitions/types';

// 1 (C1): versioned; parentNode -> parentId; dead syncRate exposures removed.
// 2 (C3): Instrument nodes carry `exportId` and `assetType`.
export const CURRENT_SAVE_VERSION = 2;

/** The untyped save-file object as parsed from JSON. */
export type SaveFlow = Record<string, unknown> & { nodes: unknown[] };

export interface Migration {
    from: number;
    to: number;
    /** One line, past tense, for the load-time report. */
    describe: string;
    /** Mutates `flow` in place; must be idempotent and must recurse into subgraphs. */
    apply: (flow: SaveFlow) => void;
}

type AnyNode = { data?: Record<string, unknown> & { subgraph?: { nodes?: unknown[] } }; [k: string]: unknown };

/**
 * Visit every node in the file: the top-level graph AND, recursively, every
 * Instrument's `data.subgraph.nodes`. Every migration walks the tree through
 * this, so no shim can forget the subgraph again.
 */
export const walkNodes = (nodes: unknown[] | undefined, visit: (node: AnyNode) => void): void => {
    if (!Array.isArray(nodes)) return;
    for (const n of nodes) {
        if (!n || typeof n !== 'object') continue;
        const node = n as AnyNode;
        visit(node);
        walkNodes(node.data?.subgraph?.nodes, visit);
    }
};

// Parameters that must never appear in a node's `exposedParameters`, because
// exposing them mints public API the DSP provably never reads. `syncRate`
// stores a note-division STRING ("1/8"); it was exposable in one click until
// the sidebar wrappers were corrected, and anything saved while that was true
// carries the dead entry (B2's generator-side reachability table drops it too,
// with a warning on every build — this removes the cause of the warning).
const NEVER_EXPOSABLE = ['syncRate'];

export const MIGRATIONS: readonly Migration[] = [
    {
        from: 0,
        to: 1,
        describe: 'pre-versioned save: parentNode -> parentId (including inside instruments), dead syncRate exposures removed',
        apply: (flow) => {
            walkNodes(flow.nodes, (node) => {
                // React Flow v11 stored a group child's parent as `parentNode`;
                // v12 reads `parentId`. The old shim did this for top-level
                // nodes only (F-B06-7).
                if (node.parentId === undefined && typeof node.parentNode === 'string') {
                    node.parentId = node.parentNode;
                    delete node.parentNode;
                }
                const exposed = node.data?.exposedParameters;
                if (node.data && Array.isArray(exposed)) {
                    node.data.exposedParameters = exposed.filter(
                        (p: unknown) => typeof p !== 'string' || !NEVER_EXPOSABLE.includes(p),
                    );
                }
            });
        },
    },
    {
        from: 1,
        to: 2,
        describe: 'instruments given an explicit Export ID (the symbol prefix they already emitted) and an explicit asset type (from their tracks)',
        // C3 (F-B05-4, F-A09-8). The Export ID is backfilled with the symbol
        // this file ALREADY produced — resolve_unique_names' legacy rule,
        // display name sanitized and same-name duplicates suffixed _2 in
        // generator order — so a game built against the old file compiles
        // against the upgraded one unchanged. The asset type is backfilled from
        // the tracks exactly as detect_asset_type would have inferred it at the
        // moment of upgrade; from then on it is a setting, and deleting the last
        // note from a track can no longer silently turn a music layer into an
        // SFX. Top-level instruments only: an Instrument inside an Instrument is
        // a hard error in the generator (B9-1), not a thing to migrate.
        apply: (flow) => {
            const nodes = Array.isArray(flow.nodes) ? (flow.nodes as Node<NodeParams>[]) : [];
            const instruments = nodes.filter(n => n && typeof n === 'object' && isInstrumentNodeType(n.type));
            const legacy = legacyExportIds(instruments);
            const tracks = Array.isArray(flow.sequencerTracks)
                ? (flow.sequencerTracks as { targetNodeId: string; isMuted: boolean; isSolo: boolean; notes?: unknown[] }[])
                : [];
            for (const n of instruments) {
                const node = n as AnyNode;
                if (!node.data) node.data = {};
                if (typeof node.data.exportId !== 'string' || node.data.exportId.length === 0) {
                    node.data.exportId = legacy.get(n.id);
                }
                if (!isAssetTypeSetting(node.data.assetType)) {
                    node.data.assetType = inferAssetType(n.id, tracks);
                }
            }
        },
    },
];

export type MigrationOutcome =
    | { ok: true; flow: SaveFlow; fromVersion: number; applied: string[] }
    | { ok: false; error: string };

/** The version a parsed file declares; absent or malformed reads as 0 (the pre-C1 shape). */
export const saveVersionOf = (flow: Record<string, unknown>): number => {
    const v = flow.version;
    return typeof v === 'number' && Number.isInteger(v) && v >= 0 ? v : 0;
};

/**
 * Bring a parsed save forward to CURRENT_SAVE_VERSION. Pure over its input
 * apart from mutating `flow` itself (callers pass a freshly parsed object).
 * Registry integrity is asserted, not assumed: a gap or a duplicate step in
 * MIGRATIONS is a programming error that must fail every load, loudly.
 */
export const migrateSaveFile = (flow: SaveFlow): MigrationOutcome => {
    const fromVersion = saveVersionOf(flow);
    if (fromVersion > CURRENT_SAVE_VERSION) {
        return {
            ok: false,
            error: `this file was saved by a newer Skald (save version ${fromVersion}; this build reads up to ${CURRENT_SAVE_VERSION}). Update Skald to open it.`,
        };
    }
    const applied: string[] = [];
    let version = fromVersion;
    while (version < CURRENT_SAVE_VERSION) {
        const step = MIGRATIONS.find((m) => m.from === version);
        if (!step) {
            return { ok: false, error: `no migration registered from save version ${version} — this is a Skald bug, not a problem with the file` };
        }
        step.apply(flow);
        applied.push(step.describe);
        version = step.to;
    }
    flow.version = CURRENT_SAVE_VERSION;
    return { ok: true, flow, fromVersion, applied };
};
