// @vitest-environment jsdom
//
// Covers three items from the A7 cheap-win batch (0.2-ROADMAP.md §6):
//   1. Create Group must actually work whenever the "Create Group" button is
//      enabled (item 1 / F-C5-9's "one-line fix" canary).
//   14. A duplicated Instrument must not keep the original's name (F-A09-7).
//   15. Group paste must remap parentId through the paste id-map, and drop
//       parentId/extent when the parent wasn't part of the copied selection
//       (F-B07-5).
import React from 'react';
import { describe, it, expect, afterEach } from 'vitest';
import { renderHook, act, cleanup } from '@testing-library/react';
import { ReactFlowProvider, Node, OnSelectionChangeParams } from '@xyflow/react';
import { useEditorState } from '../../hooks/nodeEditor/useEditorState';

// useNodeComposition (pulled in by useEditorState) calls useReactFlow, so the
// hook must render inside a ReactFlowProvider.
const wrapper = ({ children }: { children: React.ReactNode }) => (
    <ReactFlowProvider>{children}</ReactFlowProvider>
);

afterEach(cleanup);

const filterNode = (id: string, overrides: Partial<Node> = {}): Node => ({
    id,
    type: 'filter',
    position: { x: 0, y: 0 },
    data: { label: 'Filter', type: 'Lowpass', cutoff: 800, resonance: 1 },
    ...overrides,
} as unknown as Node);

const groupNode = (id: string, overrides: Partial<Node> = {}): Node => ({
    id,
    type: 'group',
    position: { x: 0, y: 0 },
    data: { label: 'Group' },
    style: { width: 200, height: 200 },
    ...overrides,
} as unknown as Node);

const instrumentNode = (id: string, name: string, overrides: Partial<Node> = {}): Node => ({
    id,
    type: 'instrument',
    position: { x: 0, y: 0 },
    data: {
        name,
        label: name,
        voiceCount: 4,
        subgraph: { nodes: [], connections: [] },
    },
    ...overrides,
} as unknown as Node);

// Minimal OnSelectionChangeParams — only `.nodes` is read by onSelectionChange.
const selectionOf = (nodes: Node[]): OnSelectionChangeParams => ({ nodes, edges: [] } as unknown as OnSelectionChangeParams);

describe('item 1 — Create Group must work whenever the button is enabled', () => {
    it('creates a group for a SINGLE selected node instead of silently doing nothing', () => {
        const { result } = renderHook(() => useEditorState(), { wrapper });

        act(() => { result.current.setNodes([filterNode('n1')]); });
        act(() => { result.current.onSelectionChange(selectionOf(result.current.nodes)); });

        expect(result.current.selectedNodesForGrouping).toHaveLength(1);

        act(() => { result.current.handleCreateGroup(); });

        // Before the fix, handleCreateGroup's `length <= 1` guard silently
        // returned here: no group node, and the child kept no parentId.
        const newGroup = result.current.nodes.find(n => n.type === 'group');
        expect(newGroup).toBeDefined();

        const child = result.current.nodes.find(n => n.id === 'n1')!;
        expect(child.parentId).toBe(newGroup!.id);
        expect(child.extent).toBe('parent');
    });

    it('still refuses to create a group for an EMPTY selection', () => {
        const { result } = renderHook(() => useEditorState(), { wrapper });
        act(() => { result.current.setNodes([filterNode('n1')]); });
        act(() => { result.current.onSelectionChange(selectionOf([])); });

        act(() => { result.current.handleCreateGroup(); });
        expect(result.current.nodes.some(n => n.type === 'group')).toBe(false);
    });
});

describe('item 14 — duplicating an Instrument suffixes its name (F-A09-7)', () => {
    it('gives a pasted copy of an Instrument a distinct name/label instead of an identical one', () => {
        const { result } = renderHook(() => useEditorState(), { wrapper });

        act(() => { result.current.setNodes([instrumentNode('inst-1', 'Bass', { selected: true })]); });
        act(() => { result.current.handleCopy(); });
        act(() => { result.current.handlePaste(); });

        const instruments = result.current.nodes.filter(n => n.type === 'instrument');
        expect(instruments).toHaveLength(2);

        const names = instruments.map(n => (n.data as { name: string }).name).sort();
        // Before the fix both entries read 'Bass', 'Bass' — two assets
        // claiming the same identity in generated code.
        expect(names).toEqual(['Bass', 'Bass 2']);

        const copy = instruments.find(n => n.id !== 'inst-1')!;
        expect((copy.data as { label: string }).label).toBe('Bass 2');
    });

    it('keeps incrementing the suffix so a second paste does not collide with the first', () => {
        const { result } = renderHook(() => useEditorState(), { wrapper });

        act(() => { result.current.setNodes([instrumentNode('inst-1', 'Bass', { selected: true })]); });
        act(() => { result.current.handleCopy(); });
        act(() => { result.current.handlePaste(); }); // -> Bass, Bass 2
        act(() => { result.current.handlePaste(); }); // clipboard still holds the ORIGINAL 'Bass' node

        const names = result.current.nodes
            .filter(n => n.type === 'instrument')
            .map(n => (n.data as { name: string }).name)
            .sort();
        expect(names).toEqual(['Bass', 'Bass 2', 'Bass 3']);
    });
});

describe('item 15 — Group paste remaps parentId through the paste id-map (F-B07-5)', () => {
    it('case A: child copied together with its parent Group gets reparented onto the NEW pasted group, not the original', () => {
        const { result } = renderHook(() => useEditorState(), { wrapper });

        act(() => {
            result.current.setNodes([
                groupNode('g1', { selected: true }),
                filterNode('c1', { parentId: 'g1', extent: 'parent', selected: true }),
            ]);
        });

        act(() => { result.current.handleCopy(); });
        act(() => { result.current.handlePaste(); });

        const pastedGroup = result.current.nodes.find(n => n.type === 'group' && n.id !== 'g1');
        const pastedChild = result.current.nodes.find(n => n.type === 'filter' && n.id !== 'c1')!;

        expect(pastedGroup).toBeDefined();
        // Before the fix, parentId/extent passed through the clone spread
        // unchanged, so the pasted child pointed at the ORIGINAL group id
        // ('g1') instead of the new pasted one.
        expect(pastedChild.parentId).toBe(pastedGroup!.id);
        expect(pastedChild.parentId).not.toBe('g1');
        expect(pastedChild.extent).toBe('parent');
    });

    it('case B: child copied ALONE (parent not in the copied selection) drops parentId/extent instead of pointing at a node outside the paste', () => {
        const { result } = renderHook(() => useEditorState(), { wrapper });

        act(() => {
            result.current.setNodes([
                groupNode('g1'), // NOT selected — stays out of the clipboard
                filterNode('c1', { parentId: 'g1', extent: 'parent', selected: true }),
            ]);
        });

        act(() => { result.current.handleCopy(); });
        act(() => { result.current.handlePaste(); });

        const pastedChild = result.current.nodes.find(n => n.type === 'filter' && n.id !== 'c1')!;

        // Before the fix, this pasted node kept parentId: 'g1'/extent: 'parent'
        // — silently confined inside a group box it was never part of.
        expect(pastedChild.parentId).toBeUndefined();
        expect(pastedChild.extent).toBeUndefined();
    });
});

describe('C3 — a pasted Instrument does not keep its source\'s Export ID', () => {
    it('gives the copy a fresh Export ID so the two can never export as one asset (the generator refuses that)', () => {
        const { result } = renderHook(() => useEditorState(), { wrapper });
        const pinned = instrumentNode('inst-1', 'Bass', { selected: true });
        (pinned.data as Record<string, unknown>).exportId = 'Bass';

        act(() => { result.current.setNodes([pinned]); });
        act(() => { result.current.handleCopy(); });
        act(() => { result.current.handlePaste(); });

        const instruments = result.current.nodes.filter(n => n.type === 'instrument');
        expect(instruments).toHaveLength(2);
        const original = instruments.find(n => n.id === 'inst-1')!;
        const copy = instruments.find(n => n.id !== 'inst-1')!;
        expect((original.data as { exportId?: string }).exportId).toBe('Bass');
        // Derived from the copy's new display name ("Bass 2"), not the pin.
        expect((copy.data as { exportId?: string }).exportId).toBe('Bass_2');
    });

    it('leaves the copy unpinned when the source was unpinned — its new name already derives a distinct prefix', () => {
        const { result } = renderHook(() => useEditorState(), { wrapper });
        act(() => { result.current.setNodes([instrumentNode('inst-1', 'Bass', { selected: true })]); });
        act(() => { result.current.handleCopy(); });
        act(() => { result.current.handlePaste(); });
        const copy = result.current.nodes.find(n => n.type === 'instrument' && n.id !== 'inst-1')!;
        expect('exportId' in (copy.data as object)).toBe(false);
    });
});
