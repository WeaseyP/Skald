// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Node } from '@xyflow/react';
import ParameterPanel from '../../components/ParameterPanel';
import { NodeParams } from '../../definitions/types';

// Vitest doesn't run @testing-library/react's auto-cleanup unless
// `globals: true` is set (same pattern as CustomSlider.test.tsx). Needed as
// of the E12 tests below: they are the first in this file to use `screen`
// queries that can collide across `it()`s (a `data-testid` two tests share).
afterEach(() => {
    cleanup();
});

// ---------------------------------------------------------------------------
// Packet B11 — parameter panel correctness.
// ---------------------------------------------------------------------------

describe('SKB-022 toggleParameterExposure does not clobber a concurrent edit', () => {
    it('preserves an amplitude edit already in the store when expose is toggled', () => {
        // `onUpdateNode` mimics `updateNodeData`'s functional merge into the
        // LATEST node state — the thing the old full-object spread bypassed by
        // writing back a snapshot captured when the toggle's closure was made.
        const initialData: NodeParams = {
            label: 'Osc', waveform: 'Sine', frequency: 440, amplitude: 0.5, exposedParameters: [],
        } as unknown as NodeParams;
        let storeData: Record<string, unknown> = { ...initialData };

        const node = {
            id: 'osc-1', type: 'oscillator', position: { x: 0, y: 0 }, data: initialData,
        } as unknown as Node<NodeParams>;

        const onUpdateNode = vi.fn((_nodeId: string, delta: object) => {
            storeData = { ...storeData, ...delta };
        });

        render(
            <ParameterPanel
                selectedNode={node}
                onUpdateNode={onUpdateNode}
                allNodes={[node]}
                allEdges={[]}
                bpm={120}
            />
        );

        // 1. A concurrent edit to a DIFFERENT field on the same node lands in
        //    the store — e.g. a slider drag whose onChange already fired.
        const amplitudeLabel = screen.getByText('Amplitude');
        const amplitudeGroup = amplitudeLabel.parentElement!.parentElement!;
        const amplitudeInput = amplitudeGroup.querySelector('input[type="number"]') as HTMLInputElement;
        fireEvent.focus(amplitudeInput);
        fireEvent.change(amplitudeInput, { target: { value: '0.9' } });
        fireEvent.blur(amplitudeInput);
        expect(storeData.amplitude).toBe(0.9);

        // 2. Toggling expose on the SAME node from the panel's still-stale
        //    `selectedNode`/`allNodes` props (the panel has not been handed a
        //    re-rendered node reflecting step 1 — the exact window the bug
        //    lived in) must not revert step 1's edit.
        fireEvent.click(screen.getByTitle('Expose "Amplitude" to public API'));

        expect(storeData.exposedParameters).toEqual(['amplitude']);
        expect(storeData.amplitude).toBe(0.9);
    });
});

describe('B11 mixer sidebar goes through NodeParameterControls (bypass deleted)', () => {
    it('restores Inputs (inputCount) editing in the sidebar', () => {
        // The old inline mixer bypass in ParameterPanel rendered only the
        // per-channel level sliders and never the `inputCount` control at
        // all — that control existed only on the node card, not the sidebar.
        const node = {
            id: 'mix-1',
            type: 'mixer',
            position: { x: 0, y: 0 },
            data: { label: 'Mix', inputCount: 2, levels: [{ id: 1, level: 0.75, pan: 0 }, { id: 2, level: 0.4, pan: 0 }] },
        } as unknown as Node<NodeParams>;

        render(
            <ParameterPanel
                selectedNode={node}
                onUpdateNode={vi.fn()}
                allNodes={[node]}
                allEdges={[]}
                bpm={120}
            />
        );

        expect(screen.getByText('Inputs')).toBeTruthy();
        const inputsLabel = screen.getByText('Inputs');
        const inputsGroup = inputsLabel.parentElement!.parentElement!;
        const inputsField = inputsGroup.querySelector('input[type="number"]') as HTMLInputElement;
        expect(inputsField.value).toBe('2');

        // Per-channel levels still round-trip through the shared component.
        expect(screen.getByTitle('Expose "Level 1" to public API')).toBeTruthy();
        expect(screen.getByTitle('Expose "Level 2" to public API')).toBeTruthy();
    });
});

describe('E12 macro pad — ParameterPanel supplies macroRouting only for the Instrument\'s own panel', () => {
    it('writes an internal node\'s parameter through onUpdateNode(instrumentId, delta, internalNodeId)', () => {
        // NodeParameterControls' `onChange`/`onChangeMany` are bound to the
        // INSTRUMENT (this render has no subNodeId — see handleControlChange),
        // so a macro pad targeting the Filter inside the subgraph cannot use
        // them; it needs the panel's OWN `onUpdateNode` with the internal
        // node's id as the THIRD argument, same as any other subgraph write
        // (renderNodeParameters(subNode, subNode.id)).
        const filterSub = { id: 'flt-1', type: 'filter', position: { x: 0, y: 0 }, data: { label: 'Filter', cutoff: 800, resonance: 1, type: 'Lowpass' } };
        const instrument = {
            id: 'inst-1',
            type: 'instrument',
            position: { x: 0, y: 0 },
            data: {
                label: 'Pad', name: 'Pad', volume: 1, voiceCount: 8, glide: 0.05, unison: 1, detune: 5,
                exposedParameters: [],
                subgraph: { nodes: [filterSub], connections: [] },
            },
        } as unknown as Node<NodeParams>;

        const onUpdateNode = vi.fn();
        render(
            <ParameterPanel
                selectedNode={instrument}
                onUpdateNode={onUpdateNode}
                allNodes={[instrument]}
                allEdges={[]}
                bpm={120}
            />
        );

        fireEvent.change(screen.getByTestId('macro-add-x'), { target: { value: 'flt-1::cutoff' } });
        onUpdateNode.mockClear();

        const pad = screen.getByTestId('macro-xy-pad').querySelector('svg')?.parentElement as HTMLDivElement;
        vi.spyOn(pad, 'getBoundingClientRect').mockReturnValue({
            x: 0, y: 0, left: 0, top: 0, right: 250, bottom: 200, width: 250, height: 200, toJSON: () => ({}),
        });
        fireEvent.mouseDown(pad, { clientX: 200, clientY: 100 }); // x = 0.8, y = 0.5

        expect(onUpdateNode).toHaveBeenCalledWith('inst-1', { cutoff: expect.any(Number) }, 'flt-1');
    });

    it('does not offer a macro pad on a Group (no subgraph, no P-lock support)', () => {
        const group = {
            id: 'grp-1', type: 'group', position: { x: 0, y: 0 },
            data: { label: 'Group', exposedParameters: [] },
        } as unknown as Node<NodeParams>;

        render(
            <ParameterPanel
                selectedNode={group}
                onUpdateNode={vi.fn()}
                allNodes={[group]}
                allEdges={[]}
                bpm={120}
            />
        );

        expect(screen.queryByTestId('macro-xy-pad')).toBeNull();
    });
});
