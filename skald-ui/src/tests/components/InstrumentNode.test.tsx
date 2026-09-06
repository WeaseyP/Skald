// @vitest-environment jsdom
/*
================================================================================
| Roadmap packet C3 — the Instrument card shows and edits the two identity     |
| fields the generator now reads: the Export ID (the symbol prefix the game    |
| compiles against, F-B05-4) and the asset type (F-A09-8). Before C3 neither   |
| existed: the prefix was the display name and the type was inferred from the  |
| track view at Generate time, with nothing on the canvas showing either.      |
================================================================================
*/
import React from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { ReactFlowProvider } from '@xyflow/react';
import InstrumentNode from '../../components/InstrumentNode';
import { GraphActionsProvider } from '../../contexts/GraphActionsContext';

afterEach(cleanup);

const renderCard = (data: Record<string, unknown>) => {
    const updateNodeData = vi.fn();
    const props = {
        id: 'inst-1',
        data: { name: 'Bass Synth', label: 'Bass Synth', subgraph: { nodes: [], connections: [] }, ...data },
        type: 'instrument',
        selected: false,
        isConnectable: true,
        positionAbsoluteX: 0,
        positionAbsoluteY: 0,
        zIndex: 0,
        dragging: false,
        deletable: true,
        selectable: true,
        draggable: true,
    };
    render(
        <ReactFlowProvider>
            <GraphActionsProvider value={{ updateNodeData }}>
                {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                <InstrumentNode {...(props as any)} />
            </GraphActionsProvider>
        </ReactFlowProvider>,
    );
    return { updateNodeData };
};

describe('InstrumentNode — Export ID', () => {
    it('shows the derived prefix as the placeholder when no Export ID is set, so the author sees what the game will link against', () => {
        renderCard({});
        const input = screen.getByTestId('instrument-export-id') as HTMLInputElement;
        expect(input.value).toBe('');
        expect(input.placeholder).toBe('Bass_Synth');
        expect(screen.getByTestId('instrument-export-prefix').textContent).toContain('Bass_Synth_trigger');
    });

    it('shows a set Export ID and the procs it produces', () => {
        renderCard({ exportId: 'Bass' });
        expect((screen.getByTestId('instrument-export-id') as HTMLInputElement).value).toBe('Bass');
        expect(screen.getByTestId('instrument-export-prefix').textContent).toContain('Bass_trigger');
    });

    it('commits the typed value sanitized the way the generator will read it', () => {
        const { updateNodeData } = renderCard({});
        const input = screen.getByTestId('instrument-export-id');
        fireEvent.change(input, { target: { value: 'Player SFX' } });
        fireEvent.blur(input);
        expect(updateNodeData).toHaveBeenCalledWith('inst-1', { exportId: 'Player_SFX' });
    });

    it('clears the pin when the field is emptied, falling back to the display name', () => {
        const { updateNodeData } = renderCard({ exportId: 'Bass' });
        const input = screen.getByTestId('instrument-export-id');
        fireEvent.change(input, { target: { value: '   ' } });
        fireEvent.keyDown(input, { key: 'Enter' });
        expect(updateNodeData).toHaveBeenCalledWith('inst-1', { exportId: undefined });
    });
});

describe('InstrumentNode — asset type', () => {
    it('shows Auto when the file never said, and the explicit value otherwise', () => {
        renderCard({});
        expect((screen.getByTestId('instrument-asset-type') as HTMLSelectElement).value).toBe('');
        cleanup();
        renderCard({ assetType: 'music' });
        expect((screen.getByTestId('instrument-asset-type') as HTMLSelectElement).value).toBe('music');
    });

    it('writes the chosen type, and undefined for Auto', () => {
        const { updateNodeData } = renderCard({});
        const select = screen.getByTestId('instrument-asset-type');
        fireEvent.change(select, { target: { value: 'sfx' } });
        expect(updateNodeData).toHaveBeenCalledWith('inst-1', { assetType: 'sfx' });
        fireEvent.change(select, { target: { value: '' } });
        expect(updateNodeData).toHaveBeenCalledWith('inst-1', { assetType: undefined });
    });
});
