// @vitest-environment jsdom
/*
================================================================================
| Roadmap packet C4 — the VCA card exposes its Gain-port mode (F-A04-4).       |
|                                                                              |
| Multiply is what a new VCA does: `audio * knob * incoming`, so a bare        |
| envelope into the Gain port shapes a note from silence to full. Add is the   |
| pre-C4 form every existing file keeps (`audio * (knob + incoming)`); the     |
| 2->3 migration stamps it so the card can show which one a node is in.        |
================================================================================
*/
import React from 'react';
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { ReactFlowProvider } from '@xyflow/react';
import { VisualGainNode } from '../../components/Nodes/GainNode';
import { NODE_DEFINITIONS } from '../../definitions/node-definitions';

afterEach(cleanup);

const renderCard = (data: Record<string, unknown>) => {
    const props = {
        id: 'g1', data, type: 'gain', selected: false, isConnectable: true,
        positionAbsoluteX: 0, positionAbsoluteY: 0, zIndex: 0, dragging: false,
        deletable: true, selectable: true, draggable: true,
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    render(<ReactFlowProvider><VisualGainNode {...(props as any)} /></ReactFlowProvider>);
};

describe('GainNode — Gain-port mode', () => {
    it('offers multiply and add, and shows the node\'s current mode', () => {
        renderCard({ gain: 1, gainMode: 'add' });
        const select = screen.getByDisplayValue('add') as HTMLSelectElement;
        expect([...select.options].map(o => o.value)).toEqual(['multiply', 'add']);
    });

    it('explains each mode in the hint under the select', () => {
        renderCard({ gain: 1, gainMode: 'multiply' });
        expect(screen.getByTestId('param-hint-gainMode').textContent).toMatch(/knob × input/);
        cleanup();
        renderCard({ gain: 1, gainMode: 'add' });
        expect(screen.getByTestId('param-hint-gainMode').textContent).toMatch(/knob \+ input/);
    });

    it('a VCA dragged in fresh is multiplicative — the modular idiom works without zeroing the knob', () => {
        expect((NODE_DEFINITIONS.gain.defaultParameters as { gainMode?: string }).gainMode).toBe('multiply');
    });
});
