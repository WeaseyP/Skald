// @vitest-environment jsdom
//
// Regression guard for BUG-REACTFLOW-002-STRICTMODE.
//
// reactflow@11.11.4 detected a "new nodeTypes/edgeTypes" object (error 002)
// inside a render-phase useMemo that mutated a ref, so React 19's StrictMode
// double-invocation produced a false positive even though Skald passes one
// stable, module-level, memoized nodeTypes reference. @xyflow/react v12 moved
// that detection into a useEffect with a correct value comparison, so a stable
// reference no longer trips the warning under StrictMode.
//
// This test reproduces EditorLayout's exact pattern (a component-level
// `useMemo(() => nodeTypes, [])` feeding <ReactFlow>) wrapped in
// React.StrictMode + ReactFlowProvider, forces development mode so the
// warning code path runs, and asserts error 002 never fires. A positive
// control proves the capture actually observes 002 when it should.
import React, { useMemo } from 'react';
import { render, cleanup } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ReactFlow, ReactFlowProvider, Background, Controls } from '@xyflow/react';
import { nodeTypes } from '../../definitions/nodeTypes';

// React Flow relies on ResizeObserver, which jsdom does not implement.
class ResizeObserverStub {
    observe() { /* noop */ }
    unobserve() { /* noop */ }
    disconnect() { /* noop */ }
}

beforeEach(() => {
    vi.stubGlobal('ResizeObserver', ResizeObserverStub);
    // The 002 warning path is gated behind NODE_ENV === 'development'.
    vi.stubEnv('NODE_ENV', 'development');
});

afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
});

// Mirrors EditorLayout: a stable, memoized reference to the module-level
// nodeTypes constant, passed to <ReactFlow>. onError is the exact hook React
// Flow calls for warning 002, so capturing it observes the warning directly.
const Editor = ({ onError }: { onError: (code: string) => void }) => {
    const memoizedNodeTypes = useMemo(() => nodeTypes, []);
    return (
        <div style={{ width: 800, height: 600 }}>
            <ReactFlow
                nodes={[]}
                edges={[]}
                nodeTypes={memoizedNodeTypes}
                onError={onError}
                fitView
            >
                <Background />
                <Controls />
            </ReactFlow>
        </div>
    );
};

describe('React Flow error 002 under React.StrictMode (BUG-REACTFLOW-002-STRICTMODE)', () => {
    it('does not warn 002 for a stable memoized nodeTypes reference', () => {
        const errorCodes: string[] = [];
        render(
            <React.StrictMode>
                <ReactFlowProvider>
                    <Editor onError={(code) => errorCodes.push(code)} />
                </ReactFlowProvider>
            </React.StrictMode>
        );
        // Neither the node-type hook nor the default edge-type hook should fire.
        expect(errorCodes).not.toContain('002');
    });

    it('positive control: DOES warn 002 when the nodeTypes object identity changes', () => {
        const errorCodes: string[] = [];
        const Unstable = ({ onError }: { onError: (code: string) => void }) => {
            // Fresh wrapper component identities for every key on every render —
            // exactly the unstable-nodeTypes shape error 002 is meant to catch.
            const unstableTypes = Object.fromEntries(
                Object.entries(nodeTypes).map(([key, Comp]) => [
                    key,
                    (props: Record<string, unknown>) => React.createElement(Comp as React.ComponentType<any>, props),
                ])
            );
            return (
                <div style={{ width: 800, height: 600 }}>
                    <ReactFlow nodes={[]} edges={[]} nodeTypes={unstableTypes} onError={onError} />
                </div>
            );
        };
        const { rerender } = render(
            <ReactFlowProvider>
                <Unstable onError={(code) => errorCodes.push(code)} />
            </ReactFlowProvider>
        );
        // Force a re-render so a fresh nodeTypes object is handed to the hook.
        rerender(
            <ReactFlowProvider>
                <Unstable onError={(code) => errorCodes.push(code)} />
            </ReactFlowProvider>
        );
        expect(errorCodes).toContain('002');
    });
});
