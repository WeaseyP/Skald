/*
================================================================================
| FILE: skald-ui/src/utils/assetIdentity.ts                                    |
|                                                                              |
| Roadmap packet C3 — stable asset identity (F-C3-10, F-B05-4, F-A09-7/8).     |
|                                                                              |
| A game addressed a Skald asset by a symbol prefix that was the Instrument's  |
| DISPLAY NAME sanitized, so renaming "Sfx" to "Player SFX" while iterating    |
| broke the game's build; two same-named instruments got a silent `_2` the     |
| editor never showed; and whether an asset was a one-shot SFX or a self-      |
| playing music layer was re-inferred from the track view at every Generate.   |
| C3 gives the Instrument node two explicit fields — `exportId` and            |
| `assetType` — that the generator reads first.                                |
|                                                                              |
| This module is the editor's MIRROR of how the generator reads them, kept     |
| case by case against the Odin (the SKB-002 "one reader" rule: where a mirror |
| is unavoidable, name the source and pin each case). It exists for three      |
| jobs the generator cannot do for the editor:                                 |
|   1. the 1->2 save migration must backfill `exportId` with the EXACT symbol  |
|      the file already emitted (legacy `_2` dedupe in generator order), so    |
|      upgrading a save never breaks a game build;                             |
|   2. two assets pinned to one prefix are a hard error in codegen             |
|      (find_export_prefix_conflict); the editor reports it in the same frame; |
|   3. a pasted / step-exported Instrument needs a fresh Export ID.            |
|                                                                              |
| Mirrored Odin, skald-backend/core:                                           |
|   sanitize_identifier(s)                param_utils.odin  (default: no       |
|                                          leading digit -> "n" prefix)        |
|   has_usable_identifier_chars(s)        param_utils.odin                     |
|   clean_instrument_name(inst)           codegen_analysis.odin                |
|   instrument_export_prefix(inst)        codegen_analysis.odin                |
|   resolve_unique_names(project)         codegen_project.odin                 |
|   find_export_prefix_conflict(project)  codegen_analysis.odin                |
|   active_sequencer_tracks / detect_asset_type  codegen_analysis.odin         |
| The cross-path corpus gate (tests/corpus/ExamplesCorpus.test.ts) runs every  |
| shipped example through the editor path (which migrates) and the CLI path    |
| (which does not) and requires identical text — that is what holds this      |
| mirror to the source.                                                        |
================================================================================
*/
import { Node } from '@xyflow/react';
import { NodeParams, SequencerTrack } from '../definitions/types';
import { getInstrumentNodes, orderedInstrumentNodes, sanitizeIdentifier } from './projectSerializer';

export type AssetTypeSetting = 'sfx' | 'music';

/** The two spellings the generator's parse_asset_type_setting knows. Anything else reads as Auto. */
export const isAssetTypeSetting = (v: unknown): v is AssetTypeSetting => v === 'sfx' || v === 'music';

/**
 * sanitize_identifier(s) with its DEFAULT allow_leading_digit = false — the
 * form clean_instrument_name and instrument_export_prefix use for names and
 * Export IDs. `sanitizeIdentifier` mirrors the allow_leading_digit = true form
 * used for ids; the only difference is the `n` prefixed to a leading digit
 * (an Odin identifier cannot start with one). The empty string is already "n"
 * from the byte walk, exactly as in the Odin.
 */
export const sanitizeName = (s: string): string => {
    const out = sanitizeIdentifier(s);
    return /^[0-9]/.test(out) ? `n${out}` : out;
};

/** has_usable_identifier_chars: a run of underscores carries no information (F-B04-5). */
export const hasUsableIdentifierChars = (s: string): boolean => /[^_]/.test(s);

/** clean_instrument_name: the prefix a pre-C3 file derives from the display name. */
export const deriveExportId = (name: string | undefined, id: string): string => {
    if (!name || name.length === 0) return `Instrument_${sanitizeIdentifier(id)}`;
    const sanitized = sanitizeName(name);
    if (!hasUsableIdentifierChars(sanitized)) return `Instrument_${sanitizeIdentifier(id)}`;
    return sanitized;
};

export interface ExportPrefix {
    prefix: string;
    /** True when the prefix comes from a set Export ID — the author's pin. */
    explicit: boolean;
}

const dataOf = (node: Node<NodeParams>): Record<string, unknown> => (node.data ?? {}) as Record<string, unknown>;
const nameOf = (node: Node<NodeParams>): string => {
    const name = dataOf(node).name;
    return typeof name === 'string' && name.length > 0 ? name : 'Unnamed Instrument';
};

/** instrument_export_prefix: the Export ID when set and usable, else the derived name. */
export const exportPrefixOf = (node: Node<NodeParams>): ExportPrefix => {
    const exportId = dataOf(node).exportId;
    if (typeof exportId === 'string' && exportId.length > 0) {
        const sanitized = sanitizeName(exportId);
        if (hasUsableIdentifierChars(sanitized)) return { prefix: sanitized, explicit: true };
    }
    const name = dataOf(node).name;
    return { prefix: deriveExportId(typeof name === 'string' ? name : undefined, node.id), explicit: false };
};

/**
 * resolve_unique_names on a file with NO Export IDs: the symbol each
 * instrument already emitted. Same-name instruments are suffixed `_2`, `_3`
 * in the generator's asset order (sorted by sanitized id — orderedInstrumentNodes),
 * because that is the order resolve_unique_names walks. The migration writes
 * these back as explicit Export IDs so no game build breaks on upgrade.
 */
export const legacyExportIds = (instrumentNodes: Node<NodeParams>[]): Map<string, string> => {
    const out = new Map<string, string>();
    const counts = new Map<string, number>();
    for (const node of orderedInstrumentNodes(instrumentNodes)) {
        const name = dataOf(node).name;
        const base = deriveExportId(typeof name === 'string' ? name : undefined, node.id);
        const count = counts.get(base) ?? 0;
        out.set(node.id, count === 0 ? base : `${base}_${count + 1}`);
        counts.set(base, count + 1);
    }
    return out;
};

type TrackLike = Pick<SequencerTrack, 'targetNodeId' | 'isMuted' | 'isSolo'> & { notes?: unknown[] };

/**
 * detect_asset_type over active_sequencer_tracks, for one instrument: music
 * when at least one track pointing at it is unmuted, has notes, and — when
 * any track on the SAME instrument solos audibly (solo && !mute && notes) —
 * is itself soloed. Used once, by the 1->2 migration, to backfill the type
 * a pre-C3 file would have been generated with.
 */
export const inferAssetType = (instrumentId: string, tracks: readonly TrackLike[]): AssetTypeSetting => {
    const all = tracks.filter(t => t.targetNodeId === instrumentId);
    const hasNotes = (t: TrackLike): boolean => Array.isArray(t.notes) && t.notes.length > 0;
    const anySolo = all.some(t => t.isSolo && !t.isMuted && hasNotes(t));
    const active = all.filter(t => !(t.isMuted || !hasNotes(t)) && !(anySolo && !t.isSolo));
    return active.length > 0 ? 'music' : 'sfx';
};

/** `base` if free, else the first free `base_2`, `base_3`, … */
export const nextExportId = (base: string, taken: ReadonlySet<string>): string => {
    if (!taken.has(base)) return base;
    let n = 2;
    while (taken.has(`${base}_${n}`)) n++;
    return `${base}_${n}`;
};

/** Every prefix the instruments on the canvas resolve to right now, pinned or derived. */
export const takenExportPrefixes = (nodes: Node<NodeParams>[]): Set<string> =>
    new Set(getInstrumentNodes(nodes).map(n => exportPrefixOf(n).prefix));

/**
 * The Export ID a clone (paste, Export Step to Instrument) gets INSTEAD of its
 * source's pin: derived from the clone's new display name, made unique among
 * the prefixes already on the canvas. Two assets on one prefix are a hard
 * error in the generator (F-A09-7's silent `_2` is gone), so the copy can
 * never be allowed to carry the original's Export ID.
 */
export const freshExportIdForClone = (newName: string, newId: string, canvasNodes: Node<NodeParams>[]): string =>
    nextExportId(deriveExportId(newName, newId), takenExportPrefixes(canvasNodes));

export interface ExportIdIssue {
    prefix: string;
    aName: string;
    bName: string;
    aId: string;
    bId: string;
}

/**
 * find_export_prefix_conflict, reported for EVERY colliding pair rather than
 * the first: two instruments resolving to one prefix where at least one
 * pinned it. Two DERIVED duplicates are not reported — the generator still
 * suffixes those `_2` as it always has. Pairs are visited in generator order
 * so the message names the instruments in the order the file emits them.
 */
export const duplicateExportIds = (nodes: Node<NodeParams>[]): ExportIdIssue[] => {
    const instruments = orderedInstrumentNodes(nodes);
    const issues: ExportIdIssue[] = [];
    for (let i = 0; i < instruments.length; i++) {
        const a = exportPrefixOf(instruments[i]);
        for (let j = i + 1; j < instruments.length; j++) {
            const b = exportPrefixOf(instruments[j]);
            if (a.prefix !== b.prefix || !(a.explicit || b.explicit)) continue;
            issues.push({
                prefix: a.prefix,
                aName: nameOf(instruments[i]),
                bName: nameOf(instruments[j]),
                aId: instruments[i].id,
                bId: instruments[j].id,
            });
        }
    }
    return issues;
};
