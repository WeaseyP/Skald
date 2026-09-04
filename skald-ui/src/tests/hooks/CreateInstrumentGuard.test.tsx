// @vitest-environment jsdom
//
// Roadmap packet B9-5 — the authoring-time half of SKB-028. The generator
// rejects an Instrument nested inside an Instrument (B9-1), but the editor
// happily DREW one: Create Instrument accepted any non-empty selection, so
// selecting an existing instrument plus a filter and clicking the button
// produced a graph that could never generate, with the refusal arriving only
// at Generate time, from a different process, naming node ids the user never
// typed. Reject it where it is drawn.
import React from 'react';
import { describe, it, expect, afterEach } from 'vitest';
import { renderHook, act, cleanup } from '@testing-library/react';
import { ReactFlowProvider, Node, OnSelectionChangeParams } from '@xyflow/react';
import { useEditorState } from '../../hooks/nodeEditor/useEditorState';
import { instrumentSelectionBlockedReason } from '../../hooks/nodeEditor/useNodeComposition';
import { InstrumentParams, NodeParams } from '../../definitions/types';

const wrapper = ({ children }: { children: React.ReactNode }) => (
    <ReactFlowProvider>{children}</ReactFlowProvider>
);

afterEach(cleanup);

const filterNode = (id: string): Node => ({
    id,
    type: 'filter',
    position: { x: 0, y: 0 },
    data: { label: 'Filter', type: 'Lowpass', cutoff: 800, resonance: 1 },
} as unknown as Node);

const instrumentNode = (id: string, name: string): Node => ({
    id,
    type: 'instrument',
    position: { x: 0, y: 0 },
    data: { name, label: name, voiceCount: 4, subgraph: { nodes: [], connections: [] } },
} as unknown as Node);

const selectionOf = (nodes: Node[]): OnSelectionChangeParams =>
    ({ nodes, edges: [] } as unknown as OnSelectionChangeParams);

describe('instrumentSelectionBlockedReason — the one predicate the button and the hook share', () => {
    it('names the offending instrument when the selection contains one', () => {
        const reason = instrumentSelectionBlockedReason([
            instrumentNode('i1', 'Kick') as Node<NodeParams>,
            filterNode('n1') as Node<NodeParams>,
        ]);
        expect(reason).toMatch(/Kick/);
        expect(reason).toMatch(/Explode/);
    });

    it('returns undefined for a selection of ordinary nodes', () => {
        expect(instrumentSelectionBlockedReason([filterNode('n1') as Node<NodeParams>])).toBeUndefined();
    });

    it('returns undefined for an empty selection — emptiness is a different guard, not this one', () => {
        expect(instrumentSelectionBlockedReason([])).toBeUndefined();
    });
});

describe('Create Instrument refuses a selection that contains an instrument', () => {
    it('does not open the name prompt', () => {
        const { result } = renderHook(() => useEditorState(), { wrapper });
        act(() => { result.current.setNodes([instrumentNode('i1', 'Kick'), filterNode('n1')]); });
        act(() => { result.current.onSelectionChange(selectionOf(result.current.nodes)); });
        expect(result.current.selectedNodesForGrouping).toHaveLength(2);

        act(() => { result.current.handleCreateInstrument(); });

        // Before B9-5 this was true: the prompt opened and the user could type
        // a name into a wrap that the generator would then refuse.
        expect(result.current.isNamePromptVisible).toBe(false);
    });

    it('leaves the graph untouched even if the name submit is reached directly', () => {
        // The prompt is a modal the user can only reach through
        // handleCreateInstrument, but the submit handler is exported on its
        // own and a second caller would bypass the first guard — so both
        // read the same predicate.
        const { result } = renderHook(() => useEditorState(), { wrapper });
        act(() => { result.current.setNodes([instrumentNode('i1', 'Kick'), filterNode('n1')]); });
        act(() => { result.current.onSelectionChange(selectionOf(result.current.nodes)); });

        act(() => { result.current.handleInstrumentNameSubmit('Outer'); });

        const ids = result.current.nodes.map(n => n.id).sort();
        expect(ids).toEqual(['i1', 'n1']);
        expect(result.current.nodes.some(n => (n.data as InstrumentParams).name === 'Outer')).toBe(false);
        expect(result.current.isNamePromptVisible).toBe(false);
    });

    it('still wraps a selection of ordinary nodes', () => {
        // Over-rejection guard: the predicate must only ever see `instrument`.
        const { result } = renderHook(() => useEditorState(), { wrapper });
        act(() => { result.current.setNodes([filterNode('n1'), filterNode('n2')]); });
        act(() => { result.current.onSelectionChange(selectionOf(result.current.nodes)); });

        act(() => { result.current.handleCreateInstrument(); });
        expect(result.current.isNamePromptVisible).toBe(true);

        act(() => { result.current.handleInstrumentNameSubmit('Pad'); });
        const instruments = result.current.nodes.filter(n => n.type === 'instrument');
        expect(instruments).toHaveLength(1);
        expect((instruments[0].data as InstrumentParams).subgraph?.nodes).toHaveLength(2);
        expect(result.current.nodes).toHaveLength(1);
    });
});
