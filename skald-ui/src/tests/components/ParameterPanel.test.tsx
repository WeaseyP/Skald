// @vitest-environment jsdom
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Node } from '@xyflow/react';
import ParameterPanel from '../../components/ParameterPanel';
import { NodeParams } from '../../definitions/types';

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
