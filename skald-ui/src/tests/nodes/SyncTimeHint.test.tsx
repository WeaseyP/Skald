// @vitest-environment jsdom
//
// Roadmap packet C7 (F-A03-6): a synced node card shows the time its
// division resolves to at the project tempo, next to the division itself.
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { ReactFlowProvider } from '@xyflow/react';
import { GraphActionsProvider } from '../../contexts/GraphActionsContext';
import { nodeTypes } from '../../definitions/nodeTypes';

afterEach(cleanup);

const renderCard = (type: 'lfo' | 'delay' | 'sampleHold', data: Record<string, unknown>, bpm?: number) => {
    const Card = nodeTypes[type] as unknown as React.FC<Record<string, unknown>>;
    const props = { id: 'n1', type, data, selected: false, isConnectable: true, positionAbsoluteX: 0, positionAbsoluteY: 0, dragging: false, zIndex: 0, draggable: true, selectable: true, deletable: true };
    return render(
        <ReactFlowProvider>
            <GraphActionsProvider value={{ updateNodeData: vi.fn(), bpm }}>
                <Card {...props} />
            </GraphActionsProvider>
        </ReactFlowProvider>,
    );
};

describe('synced node cards show the resolved time (C7)', () => {
    it('LFO: the sync-rate select carries "1/8 at 90 BPM = 0.333 s"', () => {
        renderCard('lfo', { label: 'Wob', bpmSync: true, syncRate: '1/8', frequency: 5 }, 90);
        expect(screen.getByTestId('param-hint-syncRate').textContent).toBe('1/8 at 90 BPM = 0.333 s');
    });

    it('Delay and Sample & Hold get the same reading', () => {
        renderCard('delay', { label: 'D', bpmSync: true, syncRate: '1/4', delayTime: 0.5 }, 120);
        expect(screen.getByTestId('param-hint-syncRate').textContent).toBe('1/4 at 120 BPM = 0.500 s');
        cleanup();
        renderCard('sampleHold', { label: 'S', bpmSync: true, syncRate: '1/16', rate: 10 }, 120);
        expect(screen.getByTestId('param-hint-syncRate').textContent).toBe('1/16 at 120 BPM = 0.125 s');
    });

    it('uses the default division when none is stored, and BPM_DEFAULT outside the app', () => {
        renderCard('lfo', { label: 'Wob', bpmSync: true });
        expect(screen.getByTestId('param-hint-syncRate').textContent).toBe('1/4 at 120 BPM = 0.500 s');
    });

    it('shows nothing for an unsynced node (the select is not rendered at all)', () => {
        renderCard('lfo', { label: 'Wob', bpmSync: false, frequency: 5 }, 120);
        expect(screen.queryByTestId('param-hint-syncRate')).toBeNull();
    });
});
