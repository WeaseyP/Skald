// @vitest-environment node
//
// Roadmap packet C1 — the save-file schema version and migration registry.
// Each migration is a pure function pinned by a fixture pair; the registry
// itself is pinned as contiguous from 0 to CURRENT_SAVE_VERSION; and four
// real shipped examples round-trip through it idempotently.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
    CURRENT_SAVE_VERSION,
    MIGRATIONS,
    migrateSaveFile,
    saveVersionOf,
    walkNodes,
    SaveFlow,
} from '../../utils/saveMigrations';

const clone = <T>(x: T): T => JSON.parse(JSON.stringify(x));

describe('the registry', () => {
    it('is contiguous from 0 to CURRENT_SAVE_VERSION with one step per version', () => {
        expect(CURRENT_SAVE_VERSION).toBe(4);
        const froms = MIGRATIONS.map((m) => m.from);
        expect(froms).toEqual([...Array(CURRENT_SAVE_VERSION).keys()]);
        MIGRATIONS.forEach((m) => expect(m.to).toBe(m.from + 1));
    });

    it('reads an absent or malformed version as 0', () => {
        expect(saveVersionOf({})).toBe(0);
        expect(saveVersionOf({ version: '1' })).toBe(0);
        expect(saveVersionOf({ version: -3 })).toBe(0);
        expect(saveVersionOf({ version: 1 })).toBe(1);
    });
});

describe('migration 0 -> 1 (the two former ad hoc shims, now recursing)', () => {
    const before: SaveFlow = {
        nodes: [
            { id: 'g', type: 'group', position: { x: 0, y: 0 }, data: { label: 'G' } },
            { id: 'top', type: 'filter', parentNode: 'g', position: { x: 0, y: 0 }, data: { label: 'F', exposedParameters: ['cutoff', 'syncRate'] } },
            {
                id: 'inst', type: 'instrument', position: { x: 0, y: 0 },
                data: {
                    name: 'I', label: 'I',
                    subgraph: {
                        nodes: [
                            { id: 'inner', type: 'lfo', parentNode: 'inner-group', position: { x: 0, y: 0 }, data: { label: 'L', exposedParameters: ['syncRate', 'amplitude'] } },
                        ],
                        connections: [],
                    },
                },
            },
        ],
        edges: [],
    };

    it('renames parentNode -> parentId and drops dead syncRate exposures, INSIDE subgraphs too (F-B06-7)', () => {
        const flow = clone(before);
        const out = migrateSaveFile(flow);
        expect(out.ok).toBe(true);
        if (!out.ok) return;
        expect(out.fromVersion).toBe(0);
        // A version-0 file walks EVERY registered step, so this grows with the registry.
        expect(out.applied).toHaveLength(CURRENT_SAVE_VERSION);
        expect(flow.version).toBe(CURRENT_SAVE_VERSION);

        const top = flow.nodes[1] as Record<string, unknown>;
        expect(top.parentId).toBe('g');
        expect(top).not.toHaveProperty('parentNode');
        expect((top.data as { exposedParameters: string[] }).exposedParameters).toEqual(['cutoff']);

        // The old shim stopped at the top level; this is the case it missed.
        const inner = (flow.nodes[2] as { data: { subgraph: { nodes: Record<string, unknown>[] } } }).data.subgraph.nodes[0];
        expect(inner.parentId).toBe('inner-group');
        expect(inner).not.toHaveProperty('parentNode');
        expect((inner.data as { exposedParameters: string[] }).exposedParameters).toEqual(['amplitude']);
    });

    it('is idempotent: migrating the result again changes nothing', () => {
        const once = clone(before);
        migrateSaveFile(once);
        const twice = clone(once);
        const out = migrateSaveFile(twice);
        expect(out.ok && out.applied).toEqual([]);
        expect(twice).toEqual(once);
    });

    it('does not touch a node that already has parentId', () => {
        const flow: SaveFlow = { nodes: [{ id: 'n', parentId: 'keep', parentNode: 'stale', data: {} }] };
        migrateSaveFile(flow);
        const n = flow.nodes[0] as Record<string, unknown>;
        expect(n.parentId).toBe('keep');
        expect(n.parentNode).toBe('stale');
    });
});

describe('version guard', () => {
    it('refuses a file from a newer Skald, naming both versions', () => {
        const out = migrateSaveFile({ version: 7, nodes: [] });
        expect(out.ok).toBe(false);
        if (out.ok) return;
        expect(out.error).toMatch(/newer Skald/);
        expect(out.error).toMatch(/version 7/);
        expect(out.error).toMatch(new RegExp(`up to ${CURRENT_SAVE_VERSION}`));
    });

    it('accepts the current version and stamps it', () => {
        const flow: SaveFlow = { version: CURRENT_SAVE_VERSION, nodes: [] };
        const out = migrateSaveFile(flow);
        expect(out.ok && out.applied).toEqual([]);
        expect(flow.version).toBe(CURRENT_SAVE_VERSION);
    });
});

describe('walkNodes', () => {
    it('visits top-level nodes and every subgraph node, and tolerates junk', () => {
        const seen: string[] = [];
        walkNodes(
            [
                { id: 'a', data: { subgraph: { nodes: [{ id: 'a1', data: { subgraph: { nodes: [{ id: 'a1x' }] } } }] } } },
                null,
                'junk',
                { id: 'b' },
            ],
            (n) => seen.push(String(n.id)),
        );
        expect(seen).toEqual(['a', 'a1', 'a1x', 'b']);
    });
});

describe('round trip over shipped examples', () => {
    const examplesDir = path.resolve(__dirname, '..', '..', '..', '..', 'examples');
    const files = [
        'songs/full/four-bar-song.skald.json',
        'instruments/keys/glassy-fm-pluck.skald.json',
        'sound-effects/synth/LaserPew.json',
        'snes-kit/songs/groove-bed.skald.json',
    ];

    it.each(files)('%s migrates to the current version and is a fixed point afterwards', (rel) => {
        const parsed = JSON.parse(fs.readFileSync(path.join(examplesDir, rel), 'utf8')) as SaveFlow;
        const first = migrateSaveFile(parsed);
        expect(first.ok).toBe(true);
        expect(parsed.version).toBe(CURRENT_SAVE_VERSION);
        const again = clone(parsed);
        const second = migrateSaveFile(again);
        expect(second.ok && second.applied).toEqual([]);
        expect(again).toEqual(parsed);
    });
});

describe('migration 1 -> 2 (Instrument identity made explicit — packet C3)', () => {
    // Canvas order z, a; the generator orders assets by sanitized id, so the
    // pre-C3 symbols this file ALREADY emitted were Bass (a) and Bass_2 (z).
    const before = (): SaveFlow => ({
        version: 1,
        nodes: [
            { id: 'z', type: 'instrument', position: { x: 0, y: 0 }, data: { name: 'Bass', label: 'Bass', subgraph: { nodes: [], connections: [] } } },
            { id: 'a', type: 'instrument', position: { x: 0, y: 0 }, data: { name: 'Bass', label: 'Bass', subgraph: { nodes: [], connections: [] } } },
            { id: 'f', type: 'filter', position: { x: 0, y: 0 }, data: { label: 'F', cutoff: 800 } },
        ],
        edges: [],
        sequencerTracks: [
            { id: 't1', targetNodeId: 'z', name: 'Bass', color: '#fff', steps: 16, notes: [{ step: 0, note: 36, velocity: 1, duration: 0.25 }], isMuted: false, isSolo: false },
            { id: 't2', targetNodeId: 'a', name: 'Bass', color: '#fff', steps: 16, notes: [], isMuted: false, isSolo: false },
        ],
    });
    const dataOf = (flow: SaveFlow, id: string) => (flow.nodes as { id: string; data: Record<string, unknown> }[]).find((n) => n.id === id)!.data;

    it('backfills the Export ID with the symbol the generator already emitted for this file, so no game build breaks on upgrade', () => {
        const flow = before();
        const out = migrateSaveFile(flow);
        expect(out.ok).toBe(true);
        expect(dataOf(flow, 'a').exportId).toBe('Bass');
        expect(dataOf(flow, 'z').exportId).toBe('Bass_2');
    });

    it('backfills the asset type from the tracks the file had, once (F-A09-8)', () => {
        const flow = before();
        migrateSaveFile(flow);
        expect(dataOf(flow, 'z').assetType).toBe('music'); // its track has a note
        expect(dataOf(flow, 'a').assetType).toBe('sfx');   // its track is empty
    });

    it('does not overwrite an Export ID or asset type the file already carries', () => {
        const flow = before();
        dataOf(flow, 'a').exportId = 'Pinned';
        dataOf(flow, 'a').assetType = 'music';
        migrateSaveFile(flow);
        expect(dataOf(flow, 'a').exportId).toBe('Pinned');
        expect(dataOf(flow, 'a').assetType).toBe('music');
    });

    it('leaves non-instrument nodes alone and is idempotent', () => {
        const flow = before();
        migrateSaveFile(flow);
        expect(dataOf(flow, 'f')).toEqual({ label: 'F', cutoff: 800 });
        const once = clone(flow);
        migrateSaveFile(flow);
        expect(flow).toEqual(once);
    });
});

describe('migration 2 -> 3 (VCA Gain-port mode made explicit — packet C4)', () => {
    // Every pre-C4 VCA computed `audio * (knob + incoming)`. New nodes are
    // multiplicative; the migration stamps the legacy form on nodes that
    // predate the field so the file SAYS what it does and the card can show it.
    const before = (): SaveFlow => ({
        version: 2,
        nodes: [
            { id: 'top', type: 'gain', position: { x: 0, y: 0 }, data: { label: 'VCA', gain: 0 } },
            { id: 'f', type: 'filter', position: { x: 0, y: 0 }, data: { label: 'F', cutoff: 800 } },
            {
                id: 'inst', type: 'instrument', position: { x: 0, y: 0 },
                data: {
                    name: 'I', label: 'I', exportId: 'I', assetType: 'sfx',
                    subgraph: {
                        nodes: [
                            { id: 'inner', type: 'gain', position: { x: 0, y: 0 }, data: { label: 'Amp', gain: 0 } },
                            { id: 'already', type: 'gain', position: { x: 0, y: 0 }, data: { label: 'New', gain: 1, gainMode: 'multiply' } },
                        ],
                        connections: [],
                    },
                },
            },
        ],
        edges: [],
    });
    const find = (flow: SaveFlow, id: string): Record<string, unknown> => {
        let found: Record<string, unknown> | undefined;
        walkNodes(flow.nodes, (n) => { if (n.id === id) found = n.data as Record<string, unknown>; });
        return found!;
    };

    it('stamps gainMode "add" on every Gain node that predates the field, inside instruments too', () => {
        const flow = before();
        expect(migrateSaveFile(flow).ok).toBe(true);
        expect(find(flow, 'top').gainMode).toBe('add');
        expect(find(flow, 'inner').gainMode).toBe('add');
    });

    it('leaves a node that already chose alone, and touches nothing else', () => {
        const flow = before();
        migrateSaveFile(flow);
        expect(find(flow, 'already').gainMode).toBe('multiply');
        expect(find(flow, 'f')).toEqual({ label: 'F', cutoff: 800 });
        const once = clone(flow);
        migrateSaveFile(flow);
        expect(flow).toEqual(once);
    });
});

describe('migration 3 -> 4 (the nine unified defaults — packet C2)', () => {
    // Before C2 an exposed-but-unstored parameter generated at the range
    // table's default, which for nine (node, param) pairs differed from the
    // default the editor stored on a fresh node. The table now says what the
    // editor says; this migration stores the OLD generated value on exactly
    // the nodes that relied on it, so no existing file changes sound.
    const before = (): SaveFlow => ({
        version: 3,
        nodes: [
            { id: 'wt', type: 'wavetable', position: { x: 0, y: 0 }, data: { label: 'W', position: 0, exposedParameters: ['amplitude', 'position'] } },
            { id: 'env', type: 'adsr', position: { x: 0, y: 0 }, data: { label: 'E', attack: 0.1, decay: 0.3, exposedParameters: ['decay', 'release'] } },
            { id: 'g', type: 'gain', position: { x: 0, y: 0 }, data: { label: 'G', gainMode: 'add' } },
            {
                id: 'inst', type: 'instrument', position: { x: 0, y: 0 },
                data: {
                    name: 'I', label: 'I', exportId: 'I', assetType: 'sfx',
                    subgraph: { nodes: [
                        { id: 'rv', type: 'reverb', position: { x: 0, y: 0 }, data: { label: 'R', mix: 0.5, exposedParameters: ['decay'] } },
                    ], connections: [] },
                },
            },
        ],
        edges: [],
    });
    const find = (flow: SaveFlow, id: string): Record<string, unknown> => {
        let found: Record<string, unknown> | undefined;
        walkNodes(flow.nodes, (n) => { if (n.id === id) found = n.data as Record<string, unknown>; });
        return found!;
    };

    it('stores the value an exposed-but-unstored parameter used to generate at, inside instruments too', () => {
        const flow = before();
        expect(migrateSaveFile(flow).ok).toBe(true);
        expect(find(flow, 'wt').amplitude).toBe(0.5);   // SKB-024's 6 dB: kept as it sounded
        expect(find(flow, 'env').release).toBe(0.2);
        expect(find(flow, 'rv').decay).toBe(0.1);
    });

    it('leaves a stored value, an unexposed parameter, and a node with no exposure alone', () => {
        const flow = before();
        migrateSaveFile(flow);
        expect(find(flow, 'env').decay).toBe(0.3);              // stored: untouched
        expect(find(flow, 'env').sustain).toBeUndefined();      // not exposed: the generator's own fallback applies, as before
        expect(find(flow, 'wt').position).toBe(0);
        expect(find(flow, 'g').gain).toBeUndefined();           // gain not exposed
        const once = clone(flow);
        migrateSaveFile(flow);
        expect(flow).toEqual(once);
    });
});
