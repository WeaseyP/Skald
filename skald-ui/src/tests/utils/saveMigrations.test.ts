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
        expect(CURRENT_SAVE_VERSION).toBe(1);
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
        expect(out.applied).toHaveLength(1);
        expect(flow.version).toBe(1);

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
