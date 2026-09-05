// @vitest-environment jsdom
//
// E6: the canvas had no minimap and no snap-to-grid (WAVE-E-MAP: "Library-
// native: <MiniMap /> beside <Background />/<Controls />, snapToGrid/snapGrid
// props on <ReactFlow>."). Two behaviours, two tests:
//
//   1. The minimap is actually mounted (not just imported and unused).
//   2. Dropping a palette node — the real "drop" a user performs, via
//      useNodeComposition's onDrop, which calls the library's own
//      `screenToFlowPosition` — lands on the grid when snapping is on, and
//      does NOT when it's off (the negative control: without it, an
//      assertion that merely checks "is a multiple of 20" would pass by
//      coincidence for an unsnapped position too, since 20 divides some
//      client coordinates already).
//
// This mirrors EditorLayout's actual composition (ReactFlow + the production
// onDrop from useNodeComposition.ts) rather than reimplementing drop math,
// so the test exercises the same code app.tsx wires up.
import React, { useCallback, useState } from 'react';
import { render, fireEvent, cleanup } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ReactFlow, ReactFlowProvider, Background, Controls, MiniMap, Node } from '@xyflow/react';
import { useNodeComposition } from '../../hooks/nodeEditor/useNodeComposition';
import { NodeParams } from '../../definitions/types';

class ResizeObserverStub {
    observe() { /* noop: jsdom has no layout engine */ }
    unobserve() { /* noop */ }
    disconnect() { /* noop */ }
}

beforeEach(() => {
    vi.stubGlobal('ResizeObserver', ResizeObserverStub);
});

afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
});

// Mirrors the EditorLayout <ReactFlow> block closely enough to prove the
// wiring: real onDrop from useNodeComposition, real snapToGrid/snapGrid
// props, real <MiniMap />.
const Harness = ({ snap, onNodesSettled }: { snap: boolean; onNodesSettled: (nodes: Node<NodeParams>[]) => void }) => {
    const [nodes, setNodesState] = useState<Node<NodeParams>[]>([]);
    const setNodes = useCallback((updater: any) => {
        setNodesState((prev) => {
            const next = typeof updater === 'function' ? updater(prev) : updater;
            onNodesSettled(next);
            return next;
        });
    }, [onNodesSettled]);

    const { onDrop } = useNodeComposition({
        nodes,
        edges: [],
        setNodes,
        setEdges: () => { /* not exercised: this harness only drops nodes */ },
        selectedNodesForGrouping: [],
        pushHistory: () => { /* undo history isn't under test here */ },
        setIsNamePromptVisible: () => { /* not exercised: no instrument-naming flow here */ },
    });

    return (
        <div style={{ width: 800, height: 600 }}>
            <ReactFlow
                nodes={nodes}
                edges={[]}
                onDrop={onDrop}
                onDragOver={(e) => e.preventDefault()}
                snapToGrid={snap}
                snapGrid={[20, 20]}
                defaultViewport={{ x: 0, y: 0, zoom: 1 }}
                fitView={false}
            >
                <Background />
                <Controls />
                <MiniMap />
            </ReactFlow>
        </div>
    );
};

// A drop event carrying the palette's drag payload
// (application/reactflow -> node type), exactly what Sidebar's drag source
// sets and useNodeComposition's onDrop reads. Built by hand rather than
// `fireEvent.drop(el, { clientX, clientY, ... })`: jsdom has no DragEvent
// constructor at all, so testing-library's createEvent() silently falls back
// to a plain Event for 'drop' — which drops unknown init fields, so clientX/
// clientY never reached the handler and screenToFlowPosition saw NaN
// regardless of snapGrid. testing-library works around the same gap for
// `dataTransfer` by defining it on the event after construction (see
// node_modules/@testing-library/dom/dist/events.js); clientX/clientY get no
// such special case, so this defines all three itself.
const fireNodeDrop = (container: HTMLElement, clientX: number, clientY: number) => {
    const wrapper = container.querySelector('[data-testid="rf__wrapper"]') as HTMLElement;
    const event = new Event('drop', { bubbles: true, cancelable: true });
    Object.defineProperty(event, 'clientX', { value: clientX });
    Object.defineProperty(event, 'clientY', { value: clientY });
    Object.defineProperty(event, 'dataTransfer', { value: { getData: () => 'oscillator' } });
    fireEvent(wrapper, event);
};

describe('E6: minimap + snap-to-grid', () => {
    it('renders a MiniMap beside Background/Controls', () => {
        const { container } = render(
            <ReactFlowProvider>
                <Harness snap={false} onNodesSettled={() => { /* not asserted in this test */ }} />
            </ReactFlowProvider>
        );
        expect(container.querySelector('[data-testid="rf__minimap"]')).not.toBeNull();
    });

    it('snaps a dropped node to the grid when snapping is on', () => {
        let settled: Node<NodeParams>[] = [];
        const { container } = render(
            <ReactFlowProvider>
                <Harness snap={true} onNodesSettled={(n) => { settled = n; }} />
            </ReactFlowProvider>
        );
        // Neither coordinate is a multiple of the 20px grid.
        fireNodeDrop(container, 133, 87);
        expect(settled).toHaveLength(1);
        expect(settled[0].position.x % 20).toBe(0);
        expect(settled[0].position.y % 20).toBe(0);
        expect(settled[0].position).toEqual({ x: 140, y: 80 });
    });

    it('negative control: the same off-grid drop is NOT snapped when snapping is off', () => {
        let settled: Node<NodeParams>[] = [];
        const { container } = render(
            <ReactFlowProvider>
                <Harness snap={false} onNodesSettled={(n) => { settled = n; }} />
            </ReactFlowProvider>
        );
        fireNodeDrop(container, 133, 87);
        expect(settled).toHaveLength(1);
        expect(settled[0].position).toEqual({ x: 133, y: 87 });
    });
});
