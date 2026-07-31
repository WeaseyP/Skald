// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { Node, Edge } from '@xyflow/react';
import { SequencerTrack } from '../../definitions/types';
import {
    ImportedGraph,
    MIN_CELL_WIDTH,
    layOutImportBatch,
} from '../../utils/importLayout';

// Multi-patch import: the two things that must hold for any batch are unique
// ids and non-overlapping placement. Both used to break — ids were keyed on
// Date.now() alone, and every patch was centred on the same point.

const node = (id: string, x = 0, y = 0, extra: Partial<Node> = {}): Node => ({
    id,
    type: 'instrument',
    position: { x, y },
    data: { label: id },
    ...extra,
} as Node);

const track = (id: string, targetNodeId: string): SequencerTrack => ({
    id,
    targetNodeId,
    name: id,
    color: '#fff',
    steps: 16,
    notes: [],
    isMuted: false,
    isSolo: false,
});

const patch = (name: string, nodes: Node[], edges: Edge[] = [], tracks: SequencerTrack[] = []): ImportedGraph =>
    ({ name, nodes, edges, tracks });

const CENTER = { x: 1000, y: 500 };

describe('layOutImportBatch', () => {
    it('returns nothing for an empty batch', () => {
        expect(layOutImportBatch([], CENTER, 1)).toEqual({ nodes: [], edges: [], tracks: [] });
    });

    it('centres a single patch on the target point', () => {
        const placed = layOutImportBatch([patch('a.json', [node('inst', 40, 90)])], CENTER, 1);
        expect(placed.nodes).toHaveLength(1);
        expect(placed.nodes[0].position).toEqual(CENTER);
    });

    it('keeps a patch internal layout intact while moving it', () => {
        const placed = layOutImportBatch(
            [patch('a.json', [node('osc', 0, 0), node('out', 300, 120)])],
            CENTER,
            1,
        );
        const [osc, out] = placed.nodes;
        expect(out.position.x - osc.position.x).toBe(300);
        expect(out.position.y - osc.position.y).toBe(120);
    });

    it('gives every node in a multi-patch batch a unique id', () => {
        // Same source ids in every file, same batch id: the collision case.
        const graphs = ['kick.json', 'snare.json', 'hat.json', 'tom.json'].map((n) =>
            patch(n, [node('instrument-1'), node('instrument-2')]),
        );
        const placed = layOutImportBatch(graphs, CENTER, 777);
        const ids = placed.nodes.map((n) => n.id);
        expect(ids).toHaveLength(8);
        expect(new Set(ids).size).toBe(8);
    });

    it('does not stack single-node patches on the same pixel', () => {
        const graphs = ['a', 'b', 'c', 'd'].map((n) => patch(n, [node(`inst-${n}`)]));
        const placed = layOutImportBatch(graphs, CENTER, 1);
        const points = placed.nodes.map((n) => `${n.position.x},${n.position.y}`);
        expect(new Set(points).size).toBe(4);
        // Grid spacing comes off the cell floor, not the (zero) bounding box.
        const xs = [...new Set(placed.nodes.map((n) => n.position.x))].sort((a, b) => a - b);
        expect(xs[1] - xs[0]).toBeGreaterThanOrEqual(MIN_CELL_WIDTH);
    });

    it('sizes cells off the widest patch so wide patches cannot overlap', () => {
        const wide = patch('wide.json', [node('l', 0, 0), node('r', 1200, 0)]);
        const small = patch('small.json', [node('s', 0, 0)]);
        const placed = layOutImportBatch([wide, small], CENTER, 1);
        const wideRight = placed.nodes[1].position.x; // right edge of the wide patch
        const smallX = placed.nodes[2].position.x;
        expect(smallX).toBeGreaterThan(wideRight);
    });

    it('rewrites edge endpoints and drops edges pointing outside the patch', () => {
        const edges: Edge[] = [
            { id: 'e1', source: 'a', target: 'b' },
            { id: 'e2', source: 'a', target: 'gone' },
        ];
        const placed = layOutImportBatch([patch('p.json', [node('a'), node('b')], edges)], CENTER, 1);
        expect(placed.edges).toHaveLength(1);
        expect(placed.edges[0].source).toBe(placed.nodes[0].id);
        expect(placed.edges[0].target).toBe(placed.nodes[1].id);
    });

    it('re-points sequencer tracks at the remapped instrument', () => {
        const placed = layOutImportBatch(
            [patch('p.json', [node('instrument-kick')], [], [track('track-kick', 'instrument-kick')])],
            CENTER,
            1,
        );
        expect(placed.tracks[0].targetNodeId).toBe(placed.nodes[0].id);
        expect(placed.tracks[0].id).not.toBe('track-kick');
    });

    it('keeps track ids unique when two patches ship the same track id', () => {
        const graphs = ['a.json', 'b.json'].map((n) =>
            patch(n, [node('inst')], [], [track('track-1', 'inst')]),
        );
        const placed = layOutImportBatch(graphs, CENTER, 1);
        expect(new Set(placed.tracks.map((t) => t.id)).size).toBe(2);
    });

    it('leaves a track pointing at a node the patch never had alone', () => {
        // Nothing to remap it to; blanking it would silently orphan the track.
        const placed = layOutImportBatch(
            [patch('p.json', [node('inst')], [], [track('t', 'some-other-graph')])],
            CENTER,
            1,
        );
        expect(placed.tracks[0].targetNodeId).toBe('some-other-graph');
    });

    it('follows parentId within the same patch only', () => {
        const child = node('child', 10, 10, { parentId: 'group-1' } as Partial<Node>);
        const graphs = [
            patch('a.json', [node('group-1'), child]),
            patch('b.json', [node('group-1')]),
        ];
        const placed = layOutImportBatch(graphs, CENTER, 1);
        const [groupA, childA] = placed.nodes;
        expect((childA as Node & { parentId?: string }).parentId).toBe(groupA.id);
    });

    it('marks imported nodes and edges selected', () => {
        const placed = layOutImportBatch(
            [patch('p.json', [node('a'), node('b')], [{ id: 'e1', source: 'a', target: 'b' }])],
            CENTER,
            1,
        );
        expect(placed.nodes.every((n) => n.selected)).toBe(true);
        expect(placed.edges.every((e) => e.selected)).toBe(true);
    });
});
