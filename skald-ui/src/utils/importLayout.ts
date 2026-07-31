/*
================================================================================
| FILE: skald-ui/src/utils/importLayout.ts                                     |
|                                                                              |
| Places one or more imported patches onto the current canvas: fresh ids, a    |
| grid position near the viewport centre, and sequencer tracks re-pointed at   |
| the nodes they arrived with.                                                 |
|                                                                              |
| Import Patch takes a multi-selection, which breaks two assumptions the       |
| single-file version could get away with. Ids were `${Date.now()}-${index}`,  |
| so two files imported in the same millisecond collided on every node id;     |
| and every patch was centred on the viewport, so a nine-patch selection       |
| landed as nine instrument cards stacked on the same pixel. Both are fixed    |
| here, in a pure function, so they can be tested without a canvas.           |
================================================================================
*/
import { Node, Edge } from '@xyflow/react';
import { SequencerTrack } from '../definitions/types';

/** One parsed save file waiting to be placed. */
export interface ImportedGraph {
    /** File name, used only for reporting. */
    name: string;
    nodes: Node[];
    edges: Edge[];
    tracks: SequencerTrack[];
}

export interface PlacedImport {
    nodes: Node[];
    edges: Edge[];
    tracks: SequencerTrack[];
}

/**
 * Minimum grid cell. An Instrument-wrapped patch is a single node, so its
 * bounding box is 0x0 — without a floor, the whole batch collapses to a point.
 * Roughly one instrument card plus breathing room.
 */
export const MIN_CELL_WIDTH = 300;
export const MIN_CELL_HEIGHT = 200;
export const CELL_GUTTER = 90;

interface Bounds { minX: number; minY: number; width: number; height: number }

const boundsOf = (nodes: Node[]): Bounds => {
    if (nodes.length === 0) return { minX: 0, minY: 0, width: 0, height: 0 };
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const n of nodes) {
        minX = Math.min(minX, n.position.x);
        maxX = Math.max(maxX, n.position.x);
        minY = Math.min(minY, n.position.y);
        maxY = Math.max(maxY, n.position.y);
    }
    return { minX, minY, width: maxX - minX, height: maxY - minY };
};

/**
 * Lay a batch of imported graphs out in a grid centred on `center` (graph
 * coordinates), remapping every id against `batchId`.
 *
 * Cells are sized by the widest/tallest patch in the batch, so patches keep
 * their internal layout and never overlap each other. Imported nodes and edges
 * come back selected, so the user can immediately drag the batch somewhere else.
 */
export const layOutImportBatch = (
    graphs: ImportedGraph[],
    center: { x: number; y: number },
    batchId: string | number,
): PlacedImport => {
    const placed: PlacedImport = { nodes: [], edges: [], tracks: [] };
    if (graphs.length === 0) return placed;

    const bounds = graphs.map((g) => boundsOf(g.nodes));
    const cellW = Math.max(MIN_CELL_WIDTH, ...bounds.map((b) => b.width)) + CELL_GUTTER;
    const cellH = Math.max(MIN_CELL_HEIGHT, ...bounds.map((b) => b.height)) + CELL_GUTTER;

    const cols = Math.ceil(Math.sqrt(graphs.length));
    const rows = Math.ceil(graphs.length / cols);
    // Centre the whole grid on the viewport centre rather than its first cell.
    const originX = center.x - ((cols - 1) * cellW) / 2;
    const originY = center.y - ((rows - 1) * cellH) / 2;

    graphs.forEach((graph, fileIdx) => {
        const b = bounds[fileIdx];
        const cellCenterX = originX + (fileIdx % cols) * cellW;
        const cellCenterY = originY + Math.floor(fileIdx / cols) * cellH;
        const patchCenterX = b.minX + b.width / 2;
        const patchCenterY = b.minY + b.height / 2;

        const idMap = new Map<string, string>();
        const fileNodes = graph.nodes.map((node, nodeIdx) => {
            const newId = `imp-${batchId}-${fileIdx}-${nodeIdx}`;
            idMap.set(node.id, newId);
            return {
                ...node,
                id: newId,
                position: {
                    x: cellCenterX + (node.position.x - patchCenterX),
                    y: cellCenterY + (node.position.y - patchCenterY),
                },
                selected: true,
            };
        });

        // Group/child nesting is expressed as parentId; a child whose parent
        // was remapped has to follow it, or React Flow drops it at the origin.
        // Scoped to this file's nodes: an id from patch B must never rewrite a
        // parent reference in patch A.
        for (const node of fileNodes) {
            const parentId = (node as Node & { parentId?: string }).parentId;
            if (parentId && idMap.has(parentId)) {
                (node as Node & { parentId?: string }).parentId = idMap.get(parentId);
            }
        }
        placed.nodes.push(...fileNodes);

        // Only edges with BOTH endpoints in this patch survive — keeping an
        // original id left edges pointing at nodes this graph doesn't have.
        graph.edges
            .filter((edge) => idMap.has(edge.source) && idMap.has(edge.target))
            .forEach((edge, edgeIdx) => {
                placed.edges.push({
                    ...edge,
                    id: `eimp-${batchId}-${fileIdx}-${edgeIdx}`,
                    source: idMap.get(edge.source)!,
                    target: idMap.get(edge.target)!,
                    selected: true,
                });
            });

        graph.tracks.forEach((track, trackIdx) => {
            placed.tracks.push({
                ...track,
                id: `trkimp-${batchId}-${fileIdx}-${trackIdx}`,
                targetNodeId: idMap.get(track.targetNodeId) ?? track.targetNodeId,
            });
        });
    });

    return placed;
};
