// @vitest-environment jsdom
/*
================================================================================
| SKB-058 — `bpmSync: true` with no `syncRate`.                                |
|                                                                              |
| A node in that state is not hypothetical: the shipped example                 |
| examples/instruments/bass/lfo-filter-wobble-bass.skald.json carries an LFO    |
| with `bpmSync: true`, `frequency: 8` and NO `syncRate` key at all.            |
|                                                                              |
| Three readers each invented their own answer for the absent key:              |
|   * the node card  — ParamNode's select fell back to `options[0]`, "1/1"      |
|   * the sidebar    — NodeParameterControls hardcoded a per-type fallback,     |
|                      "1/4" for LFO but "1/8" for Delay and SampleHold        |
|   * the backend    — codegen_analysis.odin's                                  |
|                      `get_string_param(node, "syncRate", "1/4")`, always 1/4 |
|                                                                              |
| So the same example read as a whole note on the canvas, an eighth in the      |
| panel (for a Delay) and a quarter in the generated code. That is the SKB-002  |
| disagreeing-readers class, not merely a silent default.                       |
================================================================================
*/
import React from 'react';
import { ReactFlowProvider } from '@xyflow/react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SYNC_RATE, SYNC_RATE_OPTIONS } from '../../definitions/bpm';
import { NodeParameterControls } from '../../components/NodeParameterControls';
import { GraphActionsProvider } from '../../contexts/GraphActionsContext';
import { LFONode } from '../../components/Nodes/LFONode';
import { DelayNode } from '../../components/Nodes/DelayNode';
import { SampleHoldNode } from '../../components/Nodes/SampleHoldNode';

afterEach(cleanup);

const wrapper = (paramKey: string, label: string, control: React.ReactNode) => (
    <label key={paramKey}>{label}{control}</label>
);

/** Render a spec-driven node card in isolation (Handle needs the provider). */
const renderCard = (
    Card: React.ComponentType<any>,
    data: Record<string, unknown>,
) => render(
    <ReactFlowProvider>
        <Card id="n1" type="x" data={data} selected={false} isConnectable zIndex={0}
            positionAbsoluteX={0} positionAbsoluteY={0} dragging={false} />
    </ReactFlowProvider>
);

const syncSelect = () => {
    const selects = Array.from(document.querySelectorAll('select')) as HTMLSelectElement[];
    const found = selects.find(s =>
        Array.from(s.options).map(o => o.value).join(',') === SYNC_RATE_OPTIONS.join(','));
    if (!found) throw new Error('no sync-rate select rendered');
    return found;
};

describe('DEFAULT_SYNC_RATE mirrors the backend', () => {
    it("is '1/4' — codegen_analysis.odin's get_string_param(node, \"syncRate\", \"1/4\")", () => {
        expect(DEFAULT_SYNC_RATE).toBe('1/4');
    });

    it('is one of the offerable divisions, so the fallback is always selectable', () => {
        expect(SYNC_RATE_OPTIONS).toContain(DEFAULT_SYNC_RATE);
    });
});

describe('SKB-058: an absent syncRate reads as the backend default everywhere', () => {
    for (const [name, Card] of [
        ['LFO', LFONode],
        ['Delay', DelayNode],
        ['SampleHold', SampleHoldNode],
    ] as const) {
        it(`${name} card shows ${'1/4'}, not the first option in the list`, () => {
            renderCard(Card as any, { label: name, bpmSync: true });
            expect(syncSelect().value).toBe(DEFAULT_SYNC_RATE);
        });
    }

    for (const type of ['lfo', 'delay', 'sampleHold'] as const) {
        it(`sidebar ${type} control shows the same default the backend uses`, () => {
            render(
                <NodeParameterControls
                    node={{ id: `${type}-1`, type, position: { x: 0, y: 0 }, data: { bpmSync: true } }}
                    onChange={vi.fn()}
                    renderControlWrapper={wrapper}
                    bpm={120}
                />
            );
            expect(syncSelect().value).toBe(DEFAULT_SYNC_RATE);
            // The annotation must quote the SAME rate — it used to read
            // "1/8 at 120 BPM = 0.250 s" for a Delay the backend clocked at 0.5.
            expect(screen.getByTestId('sync-time-hint').textContent)
                .toBe(`${DEFAULT_SYNC_RATE} at 120 BPM = 0.500 s`);
        });
    }
});

describe('SKB-058: the absence is visible rather than silently defaulted', () => {
    it('sidebar marks an implicit rate so the user knows nothing was authored', () => {
        render(
            <NodeParameterControls
                node={{ id: 'lfo-1', type: 'lfo', position: { x: 0, y: 0 }, data: { bpmSync: true } }}
                onChange={vi.fn()}
                renderControlWrapper={wrapper}
                bpm={120}
            />
        );
        expect(screen.getByTestId('sync-rate-implicit')).toBeTruthy();
    });

    it('says nothing when the node actually stores a rate', () => {
        render(
            <NodeParameterControls
                node={{ id: 'lfo-1', type: 'lfo', position: { x: 0, y: 0 }, data: { bpmSync: true, syncRate: '1/16' } }}
                onChange={vi.fn()}
                renderControlWrapper={wrapper}
                bpm={120}
            />
        );
        expect(screen.queryByTestId('sync-rate-implicit')).toBeNull();
    });
});

describe('SKB-058: turning BPM Sync on writes the rate it will follow', () => {
    it('node card toggle writes syncRate alongside bpmSync', () => {
        const updateNodeData = vi.fn();
        // The card writes through GraphActionsContext when the app provides it;
        // the isolated fallback writes to the React Flow store, which a test
        // cannot read back. Assert on the app-owned updater instead.
        render(
            <ReactFlowProvider>
                <GraphActionsProvider value={{ updateNodeData }}>
                    <LFONode {...({
                        id: 'lfo-1', type: 'lfo', data: { label: 'LFO', bpmSync: false },
                    } as any)} />
                </GraphActionsProvider>
            </ReactFlowProvider>
        );
        fireEvent.click(document.querySelector('input[type="checkbox"]')!);
        expect(updateNodeData).toHaveBeenCalledWith('lfo-1', {
            bpmSync: true,
            syncRate: DEFAULT_SYNC_RATE,
        });
    });

    it('node card toggle leaves an authored rate alone', () => {
        const updateNodeData = vi.fn();
        render(
            <ReactFlowProvider>
                <GraphActionsProvider value={{ updateNodeData }}>
                    <LFONode {...({
                        id: 'lfo-1', type: 'lfo', data: { label: 'LFO', bpmSync: false, syncRate: '1/32' },
                    } as any)} />
                </GraphActionsProvider>
            </ReactFlowProvider>
        );
        fireEvent.click(document.querySelector('input[type="checkbox"]')!);
        expect(updateNodeData).toHaveBeenCalledWith('lfo-1', { bpmSync: true });
    });

    it('sidebar toggle writes both fields in one delta when the panel owns the data', () => {
        const onChangeMany = vi.fn();
        render(
            <NodeParameterControls
                node={{ id: 'lfo-1', type: 'lfo', position: { x: 0, y: 0 }, data: { bpmSync: false } }}
                onChange={vi.fn()}
                onChangeMany={onChangeMany}
                renderControlWrapper={wrapper}
                bpm={120}
            />
        );
        fireEvent.click(document.querySelector('input[type="checkbox"]')!);
        expect(onChangeMany).toHaveBeenCalledWith({ bpmSync: true, syncRate: DEFAULT_SYNC_RATE });
    });

    it('a step editor (no onChangeMany) still writes only the toggled key', () => {
        // StepPropertiesEditor turns every onChange into a P-lock. A syncRate
        // P-lock is a hard codegen error (param_dead_reason: nothing ever makes
        // syncRate live), so the companion write must NOT happen there.
        const onChange = vi.fn();
        render(
            <NodeParameterControls
                node={{ id: 'lfo-1', type: 'lfo', position: { x: 0, y: 0 }, data: { bpmSync: false } }}
                onChange={onChange}
                renderControlWrapper={wrapper}
            />
        );
        fireEvent.click(document.querySelector('input[type="checkbox"]')!);
        expect(onChange).toHaveBeenCalledTimes(1);
        expect(onChange).toHaveBeenCalledWith('bpmSync', true);
    });
});
