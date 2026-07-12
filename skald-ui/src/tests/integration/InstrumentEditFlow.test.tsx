// @vitest-environment jsdom
import React from 'react';
import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';
import { renderHook, act, cleanup } from '@testing-library/react';
import { ReactFlowProvider, Node, Edge } from 'reactflow';
import { useGraphState } from '../../hooks/nodeEditor/useGraphState';
import { useAudioEngine } from '../../hooks/nodeEditor/useAudioEngine';
import { setupWebAudioMock, AudioContextMock, AudioParamMock, AudioNodeMock, GainNodeMock } from '../webAudioMock';
import { SequencerTrack } from '../../definitions/types';

// ------------------------------------------------------------------
// Shared fixture: an instrument with osc -> filter -> adsr -> out
// ------------------------------------------------------------------
const makeInstrumentNode = (): Node => ({
    id: 'inst-1',
    type: 'instrument',
    position: { x: 0, y: 0 },
    data: {
        name: 'TestBass',
        label: 'TestBass',
        voiceCount: 2,
        subgraph: {
            nodes: [
                { id: '1', type: 'oscillator', position: { x: 0, y: 0 }, data: { label: 'Osc', waveform: 'Sawtooth', frequency: 440, amplitude: 0.5 } },
                { id: '2', type: 'filter', position: { x: 0, y: 0 }, data: { label: 'Filter', type: 'Lowpass', cutoff: 800, resonance: 1 } },
                { id: '3', type: 'adsr', position: { x: 0, y: 0 }, data: { label: 'Amp', attack: 0.01, decay: 0.1, sustain: 0.6, release: 0.2 } },
                { id: '4', type: 'InstrumentOutput', position: { x: 0, y: 0 }, data: { label: 'Out', name: 'output' } },
            ],
            connections: [
                { from_node: '1', from_port: 'output', to_node: '2', to_port: 'input' },
                { from_node: '2', from_port: 'output', to_node: '3', to_port: 'input' },
                { from_node: '3', from_port: 'output', to_node: '4', to_port: 'input' },
            ],
        },
    },
});

describe('Instrument edit flow (state layer)', () => {
    afterEach(cleanup);

    const wrapper = ({ children }: { children: React.ReactNode }) => (
        <ReactFlowProvider>{children}</ReactFlowProvider>
    );

    it('updateNodeData(instrumentId, delta, subNodeId) writes into data.subgraph', () => {
        const { result } = renderHook(() => useGraphState(), { wrapper });

        act(() => {
            result.current.setNodes([makeInstrumentNode()]);
        });

        act(() => {
            result.current.updateNodeData('inst-1', { cutoff: 4000 } as any, '2');
        });

        const inst = result.current.nodes.find(n => n.id === 'inst-1')!;
        const filterSub = inst.data.subgraph.nodes.find((n: Node) => n.id === '2');
        expect(filterSub.data.cutoff).toBe(4000);
        // untouched params survive the merge
        expect(filterSub.data.resonance).toBe(1);
    });
});

describe('On-canvas node editors write through app state', () => {
    afterEach(cleanup);

    it('ADSRNode routes edits through GraphActionsContext, not the React Flow store', async () => {
        const { render, fireEvent, screen } = await import('@testing-library/react');
        const { ADSRNode } = await import('../../components/Nodes/ADSRNode');
        const { GraphActionsProvider } = await import('../../contexts/GraphActionsContext');

        const updateNodeData = vi.fn();

        render(
            <ReactFlowProvider>
                <GraphActionsProvider value={{ updateNodeData }}>
                    <ADSRNode
                        {...({ id: 'adsr-1', data: { attack: 0.1, decay: 0.2, sustain: 0.5, release: 0.3 }, type: 'adsr', selected: false, isConnectable: true, zIndex: 0, xPos: 0, yPos: 0, dragging: false } as any)}
                    />
                </GraphActionsProvider>
            </ReactFlowProvider>
        );

        const inputs = screen.getAllByRole('spinbutton');
        // attack, decay, sustain, release — third input is sustain
        fireEvent.change(inputs[2], { target: { value: '0.9' } });

        expect(updateNodeData).toHaveBeenCalledWith('adsr-1', { sustain: 0.9 });
    });

    it('FilterNode routes edits through GraphActionsContext, not the React Flow store', async () => {
        const { render, fireEvent, screen } = await import('@testing-library/react');
        const { FilterNode } = await import('../../components/Nodes/FilterNode');
        const { GraphActionsProvider } = await import('../../contexts/GraphActionsContext');

        const updateNodeData = vi.fn();

        render(
            <ReactFlowProvider>
                <GraphActionsProvider value={{ updateNodeData }}>
                    <FilterNode
                        {...({ id: 'filter-1', data: { cutoff: 800, resonance: 1 }, type: 'filter', selected: false, isConnectable: true, zIndex: 0, xPos: 0, yPos: 0, dragging: false } as any)}
                    />
                </GraphActionsProvider>
            </ReactFlowProvider>
        );

        const inputs = screen.getAllByRole('spinbutton');
        fireEvent.change(inputs[0], { target: { value: '4000' } });

        expect(updateNodeData).toHaveBeenCalledWith('filter-1', { cutoff: 4000 });
    });
});

describe('Instrument edit flow (audio engine layer)', () => {
    let createdContexts: AudioContextMock[];

    beforeEach(() => {
        setupWebAudioMock();
        createdContexts = [];

        // Track every AudioContext the engine creates
        const Original = AudioContextMock;
        (global as any).AudioContext = class extends Original {
            constructor() {
                super();
                createdContexts.push(this);
                // handlePlay awaits audioWorklet.addModule
                (this as any).audioWorklet = { addModule: vi.fn().mockResolvedValue(undefined) };
            }
            createAnalyser = vi.fn(() => {
                const a = new AudioNodeMock(this as any);
                (a as any).fftSize = 0;
                return a;
            });
        };

        (global as any).URL.createObjectURL = vi.fn(() => 'blob:mock');
    });

    afterEach(cleanup);

    it('a subgraph edit during playback reaches the live voices and sticks', async () => {
        const initialNodes = [makeInstrumentNode()];
        const tracks: SequencerTrack[] = [];

        const { result, rerender } = renderHook(
            ({ nodes }: { nodes: Node[] }) =>
                useAudioEngine(nodes, [] as Edge[], false, 120, tracks, vi.fn(), 16, (n: number) => n),
            { initialProps: { nodes: initialNodes } }
        );

        await act(async () => {
            await result.current.handlePlay();
        });

        expect(createdContexts.length).toBe(1);
        const ctx = createdContexts[0];

        // The instrument's voices each built one biquad filter
        const biquads = (ctx.createBiquadFilter as any).mock.results.map((r: any) => r.value);
        expect(biquads.length).toBeGreaterThan(0);

        // --- User edits the filter cutoff (immutable write, like updateNodeData) ---
        const inst = initialNodes[0];
        const editedNodes = [{
            ...inst,
            data: {
                ...inst.data,
                subgraph: {
                    ...inst.data.subgraph,
                    nodes: inst.data.subgraph.nodes.map((sn: Node) =>
                        sn.id === '2' ? { ...sn, data: { ...sn.data, cutoff: 4000 } } : sn
                    ),
                },
            },
        }];

        await act(async () => {
            rerender({ nodes: editedNodes });
        });

        // Every live voice filter must have received the new cutoff
        for (const biquad of biquads) {
            const freq = biquad.frequency as AudioParamMock;
            expect(freq.setValueAtTime).toHaveBeenCalledWith(4000, ctx.currentTime);
        }
    });
});
