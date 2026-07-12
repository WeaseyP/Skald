import { describe, it, expect, beforeEach } from 'vitest';
import { Instrument } from '../../hooks/nodeEditor/instrument';
import { setupWebAudioMock, AudioParamMock } from '../webAudioMock';
import { Node } from 'reactflow';

// NOTE: intentionally NOT mocking audioNodeFactory — we want the real
// factories so the real _skaldNode.update() paths are exercised.

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

// Simulates useGraphState.updateNodeData's immutable write of a subnode edit
const editSubnode = (node: Node, subNodeId: string, delta: Record<string, unknown>): Node => ({
    ...node,
    data: {
        ...node.data,
        subgraph: {
            ...node.data.subgraph,
            nodes: node.data.subgraph.nodes.map((sn: Node) =>
                sn.id === subNodeId ? { ...sn, data: { ...sn.data, ...delta } } : sn
            ),
        },
    },
});

describe('Instrument live-edit propagation (repro)', () => {
    let context: AudioContext;

    beforeEach(() => {
        setupWebAudioMock();
        context = new AudioContext();
    });

    const getVoiceInternal = (instrument: Instrument, voiceIdx: number, nodeId: string) => {
        const voices = (instrument as any).voices;
        return voices[voiceIdx] ? ((voices[voiceIdx] as any).internalNodes as Map<string, any>).get(nodeId) : undefined;
    };

    it('propagates a filter cutoff edit to every voice', () => {
        const node = makeInstrumentNode();
        const instrument = new Instrument(context, node);

        const edited = editSubnode(node, '2', { cutoff: 4000 });
        instrument.updateNodeData(edited.data, 120);

        for (let v = 0; v < 2; v++) {
            const biquad = getVoiceInternal(instrument, v, '2');
            expect(biquad, `voice ${v} filter`).toBeDefined();
            const freq = biquad.frequency as AudioParamMock;
            expect(freq.setValueAtTime).toHaveBeenCalledWith(4000, context.currentTime);
        }
    });

    it('does NOT revert the edit when a note is triggered afterwards', () => {
        const node = makeInstrumentNode();
        const instrument = new Instrument(context, node);

        const edited = editSubnode(node, '2', { cutoff: 4000 });
        instrument.updateNodeData(edited.data, 120);

        const biquad = getVoiceInternal(instrument, 0, '2');
        const freq = biquad.frequency as AudioParamMock;
        freq.setValueAtTime.mockClear();

        // sequencer fires a note
        instrument.trigger(0.5, 48, 1.0);
        instrument.trigger(1.0, 52, 1.0);

        // trigger() must not have written any stale cutoff back
        expect(freq.setValueAtTime).not.toHaveBeenCalled();
    });

    it('propagates ADSR sustain edits to the worklet params', () => {
        const node = makeInstrumentNode();
        const instrument = new Instrument(context, node);

        const edited = editSubnode(node, '3', { sustain: 0.1 });
        instrument.updateNodeData(edited.data, 120);

        const vca = getVoiceInternal(instrument, 0, '3');
        expect(vca).toBeDefined();
        const worklet = (vca as any)._skaldNode.output;
        const sustainParam = worklet.parameters.get('sustain') as AudioParamMock;
        expect(sustainParam.setValueAtTime).toHaveBeenCalledWith(0.1, context.currentTime);
    });

    it('propagates oscillator amplitude edits', () => {
        const node = makeInstrumentNode();
        const instrument = new Instrument(context, node);

        const edited = editSubnode(node, '1', { amplitude: 0.9 });
        instrument.updateNodeData(edited.data, 120);

        const oscOut = getVoiceInternal(instrument, 0, '1'); // factory returns output GainNode
        const gain = oscOut.gain as AudioParamMock;
        expect(gain.setTargetAtTime).toHaveBeenCalledWith(0.9, context.currentTime, expect.any(Number));
    });

    it('waveform change rebuilds the oscillator', () => {
        const node = makeInstrumentNode();
        const instrument = new Instrument(context, node);

        const edited = editSubnode(node, '1', { waveform: 'Square' });
        instrument.updateNodeData(edited.data, 120);

        const oscOut = getVoiceInternal(instrument, 0, '1');
        const skald = (oscOut as any)._skaldNode;
        expect(skald.isPwm ?? (skald as any).isPwm).toBe(true);
    });
});
