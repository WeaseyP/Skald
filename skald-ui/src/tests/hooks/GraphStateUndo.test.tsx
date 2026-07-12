// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, afterEach } from 'vitest';
import { renderHook, act, cleanup } from '@testing-library/react';
import { ReactFlowProvider, Node, NodeChange } from 'reactflow';
import { useGraphState } from '../../hooks/nodeEditor/useGraphState';

// useNodeComposition (pulled in by useGraphState) calls useReactFlow, so the
// hook must render inside a ReactFlowProvider.
const wrapper = ({ children }: { children: React.ReactNode }) => (
    <ReactFlowProvider>{children}</ReactFlowProvider>
);

const filterNode = (id: string, cutoff: number): Node => ({
    id,
    type: 'filter',
    position: { x: 0, y: 0 },
    data: { label: 'Filter', type: 'Lowpass', cutoff, resonance: 1 },
} as unknown as Node);

const instrumentNode = (): Node => ({
    id: 'inst-1',
    type: 'instrument',
    position: { x: 0, y: 0 },
    data: {
        name: 'TestBass',
        voiceCount: 4,
        subgraph: {
            nodes: [
                { id: 'flt', type: 'filter', position: { x: 0, y: 0 }, data: { label: 'Filter', type: 'Lowpass', cutoff: 800, resonance: 1 } },
                { id: 'out', type: 'InstrumentOutput', position: { x: 0, y: 0 }, data: { label: 'Out', name: 'output' } },
            ],
            connections: [],
        },
    },
} as unknown as Node);

afterEach(cleanup);

describe('useGraphState — undo / redo of structural edits', () => {
    it('undo restores the graph before an added node; redo re-applies it', () => {
        const { result } = renderHook(() => useGraphState(), { wrapper });

        // An 'add' node change is undoable and snapshots the empty graph first.
        act(() => {
            result.current.onNodesChange([{ type: 'add', item: filterNode('n1', 800) } as NodeChange]);
        });
        expect(result.current.nodes.map(n => n.id)).toEqual(['n1']);

        act(() => { result.current.handleUndo(); });
        expect(result.current.nodes).toEqual([]);

        act(() => { result.current.handleRedo(); });
        expect(result.current.nodes.map(n => n.id)).toEqual(['n1']);
    });

    it('undo with an empty history is a no-op (does not throw or corrupt state)', () => {
        const { result } = renderHook(() => useGraphState(), { wrapper });
        act(() => {
            result.current.onNodesChange([{ type: 'add', item: filterNode('n1', 800) } as NodeChange]);
        });
        act(() => { result.current.handleUndo(); }); // consumes the one entry
        act(() => { result.current.handleUndo(); }); // nothing left
        expect(result.current.nodes).toEqual([]);
    });
});

describe('useGraphState — slider-drag coalescing', () => {
    it('collapses a burst of updateNodeData calls into ONE undo entry', () => {
        const { result } = renderHook(() => useGraphState(), { wrapper });

        act(() => { result.current.setNodes([filterNode('flt', 800)]); });

        // A single drag emits many updateNodeData ticks in quick succession.
        // saveStateForUndo(true) coalesces them within a 500ms window, so the
        // whole drag is one undo step — not one per tick.
        act(() => {
            result.current.updateNodeData('flt', { cutoff: 1200 } as never);
            result.current.updateNodeData('flt', { cutoff: 2400 } as never);
            result.current.updateNodeData('flt', { cutoff: 4000 } as never);
        });
        expect((result.current.nodes[0].data as { cutoff: number }).cutoff).toBe(4000);

        // ONE undo jumps straight back to the pre-drag value, proving the
        // intermediate ticks did not each push their own history entry.
        act(() => { result.current.handleUndo(); });
        expect((result.current.nodes[0].data as { cutoff: number }).cutoff).toBe(800);
    });
});

describe('useGraphState — updateNodeData subgraph routing', () => {
    it('writes into a subgraph sub-node when subNodeId differs from the instrument id', () => {
        const { result } = renderHook(() => useGraphState(), { wrapper });
        act(() => { result.current.setNodes([instrumentNode()]); });

        act(() => {
            result.current.updateNodeData('inst-1', { cutoff: 4000 } as never, 'flt');
        });

        const inst = result.current.nodes.find(n => n.id === 'inst-1')!;
        const sub = (inst.data as { subgraph: { nodes: Node[] } }).subgraph.nodes.find(n => n.id === 'flt')!;
        expect((sub.data as { cutoff: number }).cutoff).toBe(4000);
        // Merge, not replace: the untouched sibling param survives.
        expect((sub.data as { resonance: number }).resonance).toBe(1);
    });

    it('writes the instruments OWN params when subNodeId === nodeId (not hunted inside the subgraph)', () => {
        const { result } = renderHook(() => useGraphState(), { wrapper });
        act(() => { result.current.setNodes([instrumentNode()]); });

        // Callers pass `subNodeId || node.id`, so an instrument editing its own
        // voiceCount arrives as subNodeId === nodeId. That must land on the
        // instrument node itself, leaving the subgraph untouched.
        act(() => {
            result.current.updateNodeData('inst-1', { voiceCount: 12 } as never, 'inst-1');
        });

        const inst = result.current.nodes.find(n => n.id === 'inst-1')!;
        expect((inst.data as { voiceCount: number }).voiceCount).toBe(12);
        // Subgraph filter is unchanged — the edit did not leak into a sub-node.
        const sub = (inst.data as { subgraph: { nodes: Node[] } }).subgraph.nodes.find(n => n.id === 'flt')!;
        expect((sub.data as { cutoff: number }).cutoff).toBe(800);
    });
});
