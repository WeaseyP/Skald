// @vitest-environment jsdom
/*
================================================================================
| Roadmap packet C5 — finish the nodes. The three parameters the audit found   |
| missing (F-A01-7/8, F-A02-7, F-A07-7) appear on the cards, in the defaults   |
| a new node is born with, and as modulation ports where the Oscillator has    |
| the equivalent. Defaults reproduce the pre-C5 sound exactly.                 |
================================================================================
*/
import React from 'react';
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { ReactFlowProvider } from '@xyflow/react';
import { WavetableNode } from '../../components/Nodes/WavetableNode';
import { FmOperatorNode } from '../../components/Nodes/FMOperatorNode';
import { ReverbNode } from '../../components/Nodes/ReverbNode';
import { NODE_DEFINITIONS } from '../../definitions/node-definitions';

afterEach(cleanup);

const renderCard = (Card: React.ComponentType<any>, type: string, data: Record<string, unknown>) => { // eslint-disable-line @typescript-eslint/no-explicit-any
    const props = {
        id: 'n1', data, type, selected: false, isConnectable: true,
        positionAbsoluteX: 0, positionAbsoluteY: 0, zIndex: 0, dragging: false,
        deletable: true, selectable: true, draggable: true,
    };
    render(<ReactFlowProvider><Card {...props} /></ReactFlowProvider>);
};

describe('Wavetable — pulse width and phase (F-A01-7, F-A01-8)', () => {
    it('shows Pulse Width and Phase controls and a PW modulation port', () => {
        renderCard(WavetableNode, 'wavetable', { position: 3, amplitude: 1, pulseWidth: 0.5, phase: 0 });
        expect(screen.getByText('Pulse Width')).toBeTruthy();
        expect(screen.getByText('Phase')).toBeTruthy();
        expect(screen.getByText('PW')).toBeTruthy();
    });
    it('is born with the 50 % duty and 0° phase the engine always used', () => {
        const d = NODE_DEFINITIONS.wavetable.defaultParameters as { pulseWidth?: number; phase?: number };
        expect(d.pulseWidth).toBe(0.5);
        expect(d.phase).toBe(0);
    });
});

describe('FM Operator — output level (F-A02-7)', () => {
    it('shows an Amp control and an Amp modulation port like every other source', () => {
        renderCard(FmOperatorNode, 'fmOperator', { frequency: 1, modIndex: 100, amplitude: 1 });
        expect(screen.getByText('Amp')).toBeTruthy();
        expect(screen.getByText('Amp in')).toBeTruthy();
    });
    it('is born at unity, the full-scale sin() it always emitted', () => {
        expect((NODE_DEFINITIONS.fmOperator.defaultParameters as { amplitude?: number }).amplitude).toBe(1);
    });
});

describe('Reverb — damping (F-A07-7)', () => {
    it('shows a Damping control', () => {
        renderCard(ReverbNode, 'reverb', { decay: 3, preDelay: 0.02, mix: 0.5, damping: 0 });
        expect(screen.getByText('Damping')).toBeTruthy();
    });
    it('is born undamped, which is the comb every existing patch has', () => {
        expect((NODE_DEFINITIONS.reverb.defaultParameters as { damping?: number }).damping).toBe(0);
    });
});
