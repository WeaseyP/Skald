// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Node } from '@xyflow/react';
import { NodeParameterControls } from '../../components/NodeParameterControls';
import { NodeParams } from '../../definitions/types';

// Roadmap E12 (live routing half — see the report for what's descoped).
// Written before NodeParameterControls rendered a macro pad at all; every
// assertion here failed on a missing `data-testid` until the implementation
// matched.
//
// Vitest doesn't run @testing-library/react's auto-cleanup unless
// `globals: true` is set (same pattern as RandomizeControl.test.tsx).
afterEach(() => {
    cleanup();
});

const filterNode = (id: string, label: string, data: Record<string, unknown> = {}): Node<NodeParams> =>
    ({ id, type: 'filter', position: { x: 0, y: 0 }, data: { label, cutoff: 800, resonance: 1, type: 'Lowpass', ...data } } as unknown as Node<NodeParams>);

const renderInstrument = (internalNodes: Node<NodeParams>[], instrumentId = 'inst-1') => {
    const onUpdateNode = vi.fn();
    const data = { name: 'Pad', volume: 1, voiceCount: 8, glide: 0.05, unison: 1, detune: 5, exposedParameters: [] as string[] };
    const utils = render(
        <NodeParameterControls
            node={{ id: instrumentId, type: 'instrument', position: { x: 0, y: 0 }, data }}
            onChange={vi.fn()}
            onChangeMany={vi.fn()}
            renderControlWrapper={(paramKey, label, control) => <section key={paramKey} aria-label={label}>{control}</section>}
            macroRouting={{ internalNodes, onUpdateNode }}
        />
    );
    return { ...utils, onUpdateNode };
};

/** Move the macro pad to a raw (unscaled 0..1) position via a mocked pointer down. */
const movePad = (container: HTMLElement, rawX: number, rawY: number) => {
    const pad = screen.getByTestId('macro-xy-pad').querySelector('svg')?.parentElement;
    if (!(pad instanceof HTMLDivElement)) throw new Error('Missing macro XY pad');
    vi.spyOn(pad, 'getBoundingClientRect').mockReturnValue({
        x: 0, y: 0, left: 0, top: 0, right: 250, bottom: 200, width: 250, height: 200, toJSON: () => ({}),
    });
    // XYPad: x = (clientX-left)/width, y = 1 - (clientY-top)/height.
    fireEvent.mouseDown(pad, { clientX: rawX * 250, clientY: (1 - rawY) * 200 });
};

const addTarget = (axis: 'x' | 'y', value: string) => {
    fireEvent.change(screen.getByTestId(`macro-add-${axis}`), { target: { value } });
};

describe('E12 macro pad — target assignment', () => {
    it('does not render without macroRouting (every other node type / the per-step editor)', () => {
        render(
            <NodeParameterControls
                node={{ id: 'inst-1', type: 'instrument', position: { x: 0, y: 0 }, data: { name: 'Pad', volume: 1, voiceCount: 8, glide: 0.05, unison: 1, detune: 5, exposedParameters: [] } }}
                onChange={vi.fn()}
                onChangeMany={vi.fn()}
                renderControlWrapper={(paramKey, label, control) => <section key={paramKey} aria-label={label}>{control}</section>}
            />
        );
        expect(screen.queryByTestId('macro-xy-pad')).toBeNull();
    });

    it('offers the instrument\'s internal numeric, reachable parameters as candidates', () => {
        renderInstrument([filterNode('flt-1', 'Filter')]);
        const select = screen.getByTestId('macro-add-x') as HTMLSelectElement;
        const values = Array.from(select.options).map(o => o.value);
        expect(values).toContain('flt-1::cutoff');
        expect(values).toContain('flt-1::resonance');
        // `type` ("Lowpass") is a string select, not a candidate.
        expect(values.some(v => v.endsWith('::type'))).toBe(false);
    });

    it('assigns a target to an axis and shows it with the schema default range', () => {
        renderInstrument([filterNode('flt-1', 'Filter')]);
        addTarget('x', 'flt-1::cutoff');
        // schema/nodes.json's generic `cutoff` row: 20..20000.
        expect((screen.getByTestId('macro-min-x-flt-1-cutoff') as HTMLInputElement).value).toBe('20');
        expect((screen.getByTestId('macro-max-x-flt-1-cutoff') as HTMLInputElement).value).toBe('20000');
    });

    it('moving the pad writes each assigned axis\'s targets through onUpdateNode, mapped into ITS OWN range', () => {
        const { onUpdateNode, container } = renderInstrument([filterNode('flt-1', 'Filter')]);
        addTarget('x', 'flt-1::cutoff');
        addTarget('y', 'flt-1::resonance');
        fireEvent.change(screen.getByTestId('macro-min-x-flt-1-cutoff'), { target: { value: '0' } });
        fireEvent.change(screen.getByTestId('macro-max-x-flt-1-cutoff'), { target: { value: '1000' } });
        fireEvent.change(screen.getByTestId('macro-min-y-flt-1-resonance'), { target: { value: '0' } });
        fireEvent.change(screen.getByTestId('macro-max-y-flt-1-resonance'), { target: { value: '10' } });
        onUpdateNode.mockClear();

        movePad(container, 0.8, 0.8);

        expect(onUpdateNode).toHaveBeenCalledWith('flt-1', { cutoff: 800 });   // 0 + 0.8 * 1000
        expect(onUpdateNode).toHaveBeenCalledWith('flt-1', { resonance: 8 });  // 0 + 0.8 * 10
    });

    it('writes nothing for an axis with no assigned targets', () => {
        const { onUpdateNode, container } = renderInstrument([filterNode('flt-1', 'Filter')]);
        addTarget('x', 'flt-1::cutoff'); // Y left unassigned.
        onUpdateNode.mockClear();

        movePad(container, 0.5, 0.5);

        expect(onUpdateNode).toHaveBeenCalledWith('flt-1', expect.objectContaining({ cutoff: expect.any(Number) }));
        expect(onUpdateNode).not.toHaveBeenCalledWith('flt-1', expect.objectContaining({ resonance: expect.anything() }));
    });

    it('removing a target stops further writes to it', () => {
        const { onUpdateNode, container } = renderInstrument([filterNode('flt-1', 'Filter')]);
        addTarget('x', 'flt-1::cutoff');
        fireEvent.click(screen.getByTestId('macro-remove-x-flt-1-cutoff'));
        onUpdateNode.mockClear();

        movePad(container, 0.5, 0.5);

        expect(onUpdateNode).not.toHaveBeenCalled();
        expect(screen.queryByTestId('macro-remove-x-flt-1-cutoff')).toBeNull();
    });

    it('is session-only: switching to a different instrument resets the assignment', () => {
        const nodes = [filterNode('flt-1', 'Filter')];
        const { rerender } = render(
            <NodeParameterControls
                node={{ id: 'inst-1', type: 'instrument', position: { x: 0, y: 0 }, data: { name: 'A', volume: 1, voiceCount: 8, glide: 0.05, unison: 1, detune: 5, exposedParameters: [] } }}
                onChange={vi.fn()}
                onChangeMany={vi.fn()}
                renderControlWrapper={(paramKey, label, control) => <section key={paramKey} aria-label={label}>{control}</section>}
                macroRouting={{ internalNodes: nodes, onUpdateNode: vi.fn() }}
            />
        );
        addTarget('x', 'flt-1::cutoff');
        expect(screen.queryByTestId('macro-remove-x-flt-1-cutoff')).not.toBeNull();

        rerender(
            <NodeParameterControls
                node={{ id: 'inst-2', type: 'instrument', position: { x: 0, y: 0 }, data: { name: 'B', volume: 1, voiceCount: 8, glide: 0.05, unison: 1, detune: 5, exposedParameters: [] } }}
                onChange={vi.fn()}
                onChangeMany={vi.fn()}
                renderControlWrapper={(paramKey, label, control) => <section key={paramKey} aria-label={label}>{control}</section>}
                macroRouting={{ internalNodes: nodes, onUpdateNode: vi.fn() }}
            />
        );
        expect(screen.queryByTestId('macro-remove-x-flt-1-cutoff')).toBeNull();
    });
});
