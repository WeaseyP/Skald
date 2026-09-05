// @vitest-environment jsdom
//
// Roadmap E10 (§9.22 item 1) — patching without a mouse.
//
// `[` and `]` already walked the nodes, which was as far as a keyboard user
// could get: selecting a node told you nothing about its ports, and drawing a
// wire had no keyboard path at all. Everything below that mouse boundary was
// unreachable.
//
// The ports are read out of the DOM React Flow already renders rather than
// from a second list of them: `<Handle>` stamps `data-nodeid`, `data-handleid`
// and a source/target class on every port (@xyflow/react's Handle), and only
// the seventeen node components know which ports they have. A parallel port
// manifest in node-definitions.ts would be a second reader of a fact the JSX
// already owns, and would go stale the first time a node gained a modulation
// input — so this renders a REAL <ReactFlow> and drives the real handles.
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, renderHook, act, cleanup } from '@testing-library/react';
import { ReactFlow, ReactFlowProvider, Node } from '@xyflow/react';
import { nodeTypes } from '../../definitions/nodeTypes';
import { useEditorState } from '../../hooks/nodeEditor/useEditorState';
import {
    useGraphKeyboardTraversal,
    portsOfNode,
    PORT_FOCUS_ATTR,
    PORT_PENDING_ATTR,
    PORT_PREV_KEY,
    PORT_NEXT_KEY,
} from '../../hooks/useGraphKeyboardTraversal';

// React Flow measures its container; jsdom has neither observer.
class StubResizeObserver {
    observe() { /* no layout in jsdom */ }
    unobserve() { /* no layout in jsdom */ }
    disconnect() { /* no layout in jsdom */ }
}
(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = StubResizeObserver;

const CANVAS_NODES: Node[] = [
    { id: 'osc1', type: 'oscillator', position: { x: 0, y: 0 }, data: { waveform: 'Sine', amplitude: 1 } },
    { id: 'flt1', type: 'filter', position: { x: 200, y: 0 }, data: { type: 'Lowpass', cutoff: 800, resonance: 1 } },
] as unknown as Node[];

const Canvas = () => (
    <ReactFlowProvider>
        <ReactFlow nodes={CANVAS_NODES} edges={[]} nodeTypes={nodeTypes as never} />
    </ReactFlowProvider>
);

const key = (k: string, init: KeyboardEventInit = {}) => {
    act(() => {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...init }));
    });
};

const focusedElement = () => document.querySelector(`[${PORT_FOCUS_ATTR}]`);
const pendingElement = () => document.querySelector(`[${PORT_PENDING_ATTR}]`);
const idOf = (el: Element | null) =>
    el && `${el.getAttribute('data-nodeid')}:${el.getAttribute('data-handleid')}`;

const mount = (selectedNodeId: string | null, onConnect = vi.fn()) => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
        <>
            {children}
            <Canvas />
        </>
    );
    const view = renderHook(
        (props: { selectedNodeId: string | null; onConnect: typeof onConnect }) =>
            useGraphKeyboardTraversal(props),
        { initialProps: { selectedNodeId, onConnect }, wrapper },
    );
    return { onConnect, ...view };
};

afterEach(() => {
    cleanup();
    document.body.innerHTML = '';
});

describe('portsOfNode — the ports come from React Flow, not a second list', () => {
    it('finds every handle of one node, in the order the card draws them', () => {
        render(<Canvas />);
        expect(portsOfNode('osc1').map(p => `${p.type}:${p.handleId}`)).toEqual([
            'target:input_freq',
            'target:input_amp',
            'target:input_pulseWidth',
            'source:output',
        ]);
        // A node id that is not on the canvas has no ports rather than throwing.
        expect(portsOfNode('nope')).toEqual([]);
    });
});

describe('useGraphKeyboardTraversal — E10 port focus', () => {
    it('walks the selected node\'s ports forward and back, wrapping at both ends', () => {
        const { result } = mount('osc1');

        key(PORT_NEXT_KEY);
        expect(result.current.focusedPort?.handleId).toBe('input_freq');
        expect(idOf(focusedElement())).toBe('osc1:input_freq');

        key(PORT_NEXT_KEY);
        key(PORT_NEXT_KEY);
        key(PORT_NEXT_KEY);
        expect(result.current.focusedPort?.handleId).toBe('output');

        key(PORT_NEXT_KEY);
        expect(result.current.focusedPort?.handleId).toBe('input_freq');

        key(PORT_PREV_KEY);
        expect(result.current.focusedPort?.handleId).toBe('output');
    });

    it('marks exactly one port at a time, so the ring cannot be left behind', () => {
        const { result } = mount('osc1');
        key(PORT_NEXT_KEY);
        key(PORT_NEXT_KEY);
        expect(document.querySelectorAll(`[${PORT_FOCUS_ATTR}]`).length).toBe(1);
        expect(idOf(focusedElement())).toBe('osc1:input_amp');
        expect(result.current.focusedPort?.nodeId).toBe('osc1');
    });

    it('drops the port focus when the selection moves to another node', () => {
        const { result, rerender, onConnect } = mount('osc1');
        key(PORT_NEXT_KEY);
        expect(result.current.focusedPort).not.toBeNull();

        rerender({ selectedNodeId: 'flt1', onConnect });
        expect(result.current.focusedPort).toBeNull();
        expect(focusedElement()).toBeNull();

        key(PORT_NEXT_KEY);
        expect(result.current.focusedPort?.nodeId).toBe('flt1');
    });

    it('does nothing at all with no node selected', () => {
        const { result } = mount(null);
        key(PORT_NEXT_KEY);
        expect(result.current.focusedPort).toBeNull();
    });
});

describe('useGraphKeyboardTraversal — E10 keyboard connect', () => {
    const wireOscToFilter = (harness: ReturnType<typeof mount>) => {
        // osc1's fourth port is its output.
        key(PORT_PREV_KEY);
        expect(harness.result.current.focusedPort?.handleId).toBe('output');
        key('Enter');

        harness.rerender({ selectedNodeId: 'flt1', onConnect: harness.onConnect });
        key(PORT_NEXT_KEY);
        key(PORT_NEXT_KEY);
        expect(harness.result.current.focusedPort?.handleId).toBe('input_cutoff');
        key('Enter');
    };

    it('Enter on an output then Enter on an input builds the connection a drag would', () => {
        const harness = mount('osc1');
        wireOscToFilter(harness);

        expect(harness.onConnect).toHaveBeenCalledTimes(1);
        expect(harness.onConnect).toHaveBeenCalledWith({
            source: 'osc1',
            sourceHandle: 'output',
            target: 'flt1',
            targetHandle: 'input_cutoff',
        });
        expect(harness.result.current.pendingSource).toBeNull();
        expect(pendingElement()).toBeNull();
    });

    it('marks the pending output while the wire is in flight', () => {
        const { result, onConnect } = mount('osc1');
        key(PORT_PREV_KEY);
        key('Enter');
        expect(result.current.pendingSource?.handleId).toBe('output');
        expect(idOf(pendingElement())).toBe('osc1:output');
        expect(onConnect).not.toHaveBeenCalled();
    });

    it('Escape cancels the pending wire and leaves the graph alone', () => {
        const harness = mount('osc1');
        key(PORT_PREV_KEY);
        key('Enter');
        key('Escape');
        expect(harness.result.current.pendingSource).toBeNull();
        expect(pendingElement()).toBeNull();

        harness.rerender({ selectedNodeId: 'flt1', onConnect: harness.onConnect });
        key(PORT_NEXT_KEY);
        key('Enter');
        expect(harness.onConnect).not.toHaveBeenCalled();
    });

    it('refuses to start a wire at an input, and to finish one at an output', () => {
        const harness = mount('osc1');

        key(PORT_NEXT_KEY); // input_freq, a target
        key('Enter');
        expect(harness.result.current.pendingSource).toBeNull();

        key(PORT_PREV_KEY); // back to output
        key('Enter');
        expect(harness.result.current.pendingSource?.handleId).toBe('output');

        harness.rerender({ selectedNodeId: 'flt1', onConnect: harness.onConnect });
        key(PORT_PREV_KEY); // flt1's output — a source cannot receive
        key('Enter');
        expect(harness.onConnect).not.toHaveBeenCalled();
        expect(harness.result.current.pendingSource?.handleId).toBe('output');
    });
});

describe('useGraphKeyboardTraversal — the wire it draws is an ordinary edge', () => {
    // The point of routing through the editor's own onConnect rather than
    // pushing an edge directly: history. A keyboard-drawn wire has to be the
    // same single undo step a dragged one is, or B3's bug is back for anyone
    // who does not use a mouse.
    const wrapper = ({ children }: { children: React.ReactNode }) => (
        <ReactFlowProvider>
            {children}
            <ReactFlow nodes={CANVAS_NODES} edges={[]} nodeTypes={nodeTypes as never} />
        </ReactFlowProvider>
    );

    it('creates one edge and undoes it in one step', () => {
        const { result, rerender } = renderHook(
            ({ selectedNodeId }: { selectedNodeId: string }) => {
                const editor = useEditorState();
                const traversal = useGraphKeyboardTraversal({
                    selectedNodeId,
                    onConnect: editor.onConnect,
                });
                return { editor, traversal };
            },
            { initialProps: { selectedNodeId: 'osc1' }, wrapper },
        );

        expect(result.current.editor.edges).toHaveLength(0);

        key(PORT_PREV_KEY);
        key('Enter');
        rerender({ selectedNodeId: 'flt1' });
        key(PORT_NEXT_KEY);
        key('Enter');

        expect(result.current.editor.edges).toHaveLength(1);
        expect(result.current.editor.edges[0]).toMatchObject({
            source: 'osc1',
            sourceHandle: 'output',
            target: 'flt1',
            targetHandle: 'input',
        });
        expect(result.current.editor.history.undoLabel).toBe('Connect wire');

        act(() => { result.current.editor.handleUndo(); });
        expect(result.current.editor.edges).toHaveLength(0);
    });
});
