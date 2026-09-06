// @vitest-environment node
/*
================================================================================
| Roadmap packet C3 — stable asset identity (F-C3-10, F-B05-4, F-A09-7/8).     |
|                                                                              |
| utils/assetIdentity.ts mirrors, case by case, the generator's reading of an  |
| Instrument's identity so the editor can (a) backfill pre-C3 saves with the   |
| EXACT symbols they always emitted, (b) refuse two assets pinned to one Export |
| ID in the same frame it happens instead of at the next Generate, and (c) hand |
| a pasted Instrument an Export ID that is not its source's.                    |
|                                                                              |
| Mirrored Odin (skald-backend/core):                                           |
|   sanitize_identifier(s)              param_utils.odin  (leading digit -> n)  |
|   has_usable_identifier_chars(s)      param_utils.odin                        |
|   clean_instrument_name(inst)         codegen_analysis.odin                   |
|   instrument_export_prefix(inst)      codegen_analysis.odin                   |
|   resolve_unique_names(project)       codegen_project.odin  (legacy `_2`)     |
|   find_export_prefix_conflict(project) codegen_analysis.odin                 |
|   active_sequencer_tracks + detect_asset_type  codegen_analysis.odin          |
| The cross-path corpus gate (ExamplesCorpus.test.ts) is what proves the mirror |
| against the real generator; these tests pin each rule in isolation.          |
================================================================================
*/
import { describe, it, expect } from 'vitest';
import { Node } from '@xyflow/react';
import { NodeParams, SequencerTrack } from '../../definitions/types';
import {
    sanitizeName,
    deriveExportId,
    exportPrefixOf,
    legacyExportIds,
    inferAssetType,
    nextExportId,
    duplicateExportIds,
} from '../../utils/assetIdentity';

const inst = (id: string, data: Record<string, unknown>): Node<NodeParams> =>
    ({ id, type: 'instrument', position: { x: 0, y: 0 }, data: { subgraph: { nodes: [], connections: [] }, ...data } } as unknown as Node<NodeParams>);

const track = (targetNodeId: string, overrides: Partial<SequencerTrack> = {}): SequencerTrack => ({
    id: `t-${targetNodeId}-${Math.random()}`,
    targetNodeId,
    name: targetNodeId,
    color: '#fff',
    steps: 16,
    notes: [{ step: 0, note: 60, velocity: 1, duration: 0.25 }],
    isMuted: false,
    isSolo: false,
    ...overrides,
});

describe('sanitizeName — sanitize_identifier(s) with allow_leading_digit = false', () => {
    it('maps every byte outside [A-Za-z0-9_] to an underscore', () => {
        expect(sanitizeName('Bass Synth (v2)')).toBe('Bass_Synth__v2_');
    });
    it('prefixes a leading digit with n (an identifier cannot start with one)', () => {
        expect(sanitizeName('808 Kick')).toBe('n808_Kick');
    });
    it('returns n for the empty string', () => {
        expect(sanitizeName('')).toBe('n');
    });
    it('walks UTF-8 bytes, not characters: a three-byte character is three underscores', () => {
        expect(sanitizeName('キ')).toBe('___');
    });
});

describe('deriveExportId — clean_instrument_name', () => {
    it('is the sanitized display name', () => {
        expect(deriveExportId('Bass Synth', 'x1')).toBe('Bass_Synth');
    });
    it('falls back to Instrument_<sanitized id> for an empty name', () => {
        expect(deriveExportId('', 'abc-1')).toBe('Instrument_abc_1');
        expect(deriveExportId(undefined, 'abc-1')).toBe('Instrument_abc_1');
    });
    it('falls back for a name with no usable characters (F-B04-5)', () => {
        expect(deriveExportId('キック', 'k1')).toBe('Instrument_k1');
    });
});

describe('exportPrefixOf — instrument_export_prefix', () => {
    it('prefers a set Export ID, sanitized, and marks it explicit', () => {
        expect(exportPrefixOf(inst('a', { name: 'Bass Synth', exportId: 'Player SFX' })))
            .toEqual({ prefix: 'Player_SFX', explicit: true });
    });
    it('derives from the name when no Export ID is set, not explicit', () => {
        expect(exportPrefixOf(inst('a', { name: 'Bass Synth' })))
            .toEqual({ prefix: 'Bass_Synth', explicit: false });
    });
    it('treats an Export ID of only punctuation as absent', () => {
        expect(exportPrefixOf(inst('a', { name: 'Bass', exportId: '---' })))
            .toEqual({ prefix: 'Bass', explicit: false });
    });
});

describe('legacyExportIds — resolve_unique_names on a pre-C3 file', () => {
    it('suffixes same-name instruments _2, _3 in SANITIZED-ID order, the order the generator uses', () => {
        // Canvas order is z, a, m; the generator sorts by sanitized id, so `a`
        // is the bare "Bass", `m` is "Bass_2" and `z` is "Bass_3".
        const ids = legacyExportIds([inst('z', { name: 'Bass' }), inst('a', { name: 'Bass' }), inst('m', { name: 'Bass' })]);
        expect(ids.get('a')).toBe('Bass');
        expect(ids.get('m')).toBe('Bass_2');
        expect(ids.get('z')).toBe('Bass_3');
    });
    it('leaves distinct names bare', () => {
        const ids = legacyExportIds([inst('a', { name: 'Bass' }), inst('b', { name: 'Lead' })]);
        expect([...ids.values()].sort()).toEqual(['Bass', 'Lead']);
    });
});

describe('inferAssetType — detect_asset_type over active_sequencer_tracks', () => {
    it('is music when an unmuted track with notes points at the instrument', () => {
        expect(inferAssetType('a', [track('a')])).toBe('music');
    });
    it('is sfx with no track, an empty track, or only muted tracks', () => {
        expect(inferAssetType('a', [])).toBe('sfx');
        expect(inferAssetType('a', [track('a', { notes: [] })])).toBe('sfx');
        expect(inferAssetType('a', [track('a', { isMuted: true })])).toBe('sfx');
        expect(inferAssetType('a', [track('b')])).toBe('sfx');
    });
    it('honours solo: when another track on the SAME instrument solos audibly, a non-solo track is inactive', () => {
        // Track 1 solos with notes; track 2 has notes but is not soloed -> only
        // track 1 is active, which is still music. Mute the solo track's notes
        // away and the un-soloed one is what remains.
        expect(inferAssetType('a', [track('a', { isSolo: true }), track('a')])).toBe('music');
        // A soloed track that is muted or empty does not count as "soloing"
        // (mirrors `t.solo && !t.mute && len(t.events) > 0`).
        expect(inferAssetType('a', [track('a', { isSolo: true, notes: [] }), track('a')])).toBe('music');
        // Solo with notes on one track, the other un-soloed: the un-soloed one
        // is skipped, but the soloed one is active -> music.
        expect(inferAssetType('a', [track('a', { isSolo: true }), track('a', { isMuted: true })])).toBe('music');
    });
});

describe('nextExportId', () => {
    it('returns the base when it is free, else the first free _2, _3…', () => {
        expect(nextExportId('Bass', new Set())).toBe('Bass');
        expect(nextExportId('Bass', new Set(['Bass']))).toBe('Bass_2');
        expect(nextExportId('Bass', new Set(['Bass', 'Bass_2']))).toBe('Bass_3');
    });
});

describe('duplicateExportIds — find_export_prefix_conflict', () => {
    it('reports two instruments pinned to one prefix', () => {
        const issues = duplicateExportIds([
            inst('a', { name: 'Bass', exportId: 'Keys' }),
            inst('b', { name: 'Lead', exportId: 'Keys' }),
        ]);
        expect(issues).toEqual([{ prefix: 'Keys', aName: 'Bass', bName: 'Lead', aId: 'a', bId: 'b' }]);
    });
    it('reports a pinned prefix that another instrument merely derives to', () => {
        const issues = duplicateExportIds([
            inst('a', { name: 'Keys' }),
            inst('b', { name: 'Piano', exportId: 'Keys' }),
        ]);
        expect(issues).toHaveLength(1);
    });
    it('does NOT report two derived duplicates — that is the legacy _2 case the generator still accepts', () => {
        expect(duplicateExportIds([inst('a', { name: 'Bass' }), inst('b', { name: 'Bass' })])).toEqual([]);
    });
});
