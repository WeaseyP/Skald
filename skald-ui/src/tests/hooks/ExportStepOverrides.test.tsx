// @vitest-environment jsdom
//
// Roadmap B5-x1 (the SKB-002 pattern). Export-Step matched P-lock keys with
// its own inline compare — `key.split(':')` and `(label || n.type) ===
// targetLabel`, case-sensitive, against React Flow's type — while the
// generator resolves them with resolve_plock_targets: split on the FIRST
// colon, ASCII case-insensitive label match, codegen type as the fallback
// label. So codegen applied `osc:frequency` to the node labelled `Osc` and
// Export-Step baked nothing. Both paths now read plockTargets.ts.
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { act, cleanup, renderHook } from '@testing-library/react';
import { Node, ReactFlowProvider } from '@xyflow/react';
import { useEditorState } from '../../hooks/nodeEditor/useEditorState';
import { InstrumentParams, SequencerTrack } from '../../definitions/types';

const wrapper = ({ children }: { children: React.ReactNode }) => (
    <ReactFlowProvider>{children}</ReactFlowProvider>
);

afterEach(cleanup);

const oscData = { label: 'Osc', waveform: 'Sine', frequency: 440, fixedPitch: true, amplitude: 0.5 };

const instrument: Node = {
    id: 'inst-1',
    type: 'instrument',
    position: { x: 0, y: 0 },
    data: {
        name: 'Bass', label: 'Bass', voiceCount: 2,
        subgraph: { nodes: [{ id: 'osc-1', type: 'oscillator', position: { x: 0, y: 0 }, data: oscData }], connections: [] },
    },
} as unknown as Node;

const looseOsc: Node = { id: 'osc-1', type: 'oscillator', position: { x: 0, y: 0 }, data: oscData } as unknown as Node;

const trackFor = (targetNodeId: string, overrides: Record<string, number>): SequencerTrack => ({
    id: 't1', targetNodeId, name: 'T', color: '#000', steps: 16, isMuted: false, isSolo: false,
    notes: [{ step: 0, note: 60, velocity: 1, duration: 1, patchOverrides: overrides }],
});

describe('handleExportStep applies P-locks through the generator\'s resolver', () => {
    it('applies a lowercase-labelled key to the instrument\'s internal node, as codegen does', () => {
        const { result } = renderHook(() => useEditorState(), { wrapper });
        act(() => { result.current.setNodes([instrument]); });
        act(() => { result.current.loadTracks([trackFor('inst-1', { 'osc:amplitude': 0.9 })]); });

        let newId: string | null = null;
        act(() => { newId = result.current.handleExportStep('t1', 0, 60); });
        expect(newId).not.toBeNull();

        const exported = result.current.nodes.find(n => n.id === newId)!;
        const osc = (exported.data as InstrumentParams).subgraph.nodes.find(n => n.id === 'osc-1')!;
        // Before B5-x1: 0.5 — `osc` !== `Osc`, so the override was skipped.
        expect((osc.data as { amplitude: number }).amplitude).toBe(0.9);
    });

    it('applies a key to a loose node by resolving against the source label, not the suffixed export', () => {
        const { result } = renderHook(() => useEditorState(), { wrapper });
        act(() => { result.current.setNodes([looseOsc]); });
        act(() => { result.current.loadTracks([trackFor('osc-1', { 'OSC:amplitude': 0.25 })]); });

        let newId: string | null = null;
        act(() => { newId = result.current.handleExportStep('t1', 0, 60); });
        const exported = result.current.nodes.find(n => n.id === newId)!;
        expect((exported.data as { amplitude: number }).amplitude).toBe(0.25);
        // The export is still a distinct node with the step in its label.
        expect((exported.data as { label: string }).label).toMatch(/Step 0|step 0|\(Step 0\)/i);
    });

    it('does not apply a key that resolves to a different node', () => {
        const { result } = renderHook(() => useEditorState(), { wrapper });
        act(() => { result.current.setNodes([instrument]); });
        act(() => { result.current.loadTracks([trackFor('inst-1', { 'Filter:amplitude': 0.9 })]); });
        let newId: string | null = null;
        act(() => { newId = result.current.handleExportStep('t1', 0, 60); });
        const exported = result.current.nodes.find(n => n.id === newId)!;
        const osc = (exported.data as InstrumentParams).subgraph.nodes.find(n => n.id === 'osc-1')!;
        expect((osc.data as { amplitude: number }).amplitude).toBe(0.5);
    });
});
