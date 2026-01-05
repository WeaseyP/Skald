import { vi, describe, it, expect, beforeEach } from 'vitest';
import { Voice } from '../../hooks/nodeEditor/voice';
import { setupWebAudioMock } from '../webAudioMock';
import { Node, Edge } from 'reactflow';

// Mock Node Creation Map
vi.mock('../../hooks/nodeEditor/audioNodeFactory', () => ({
    nodeCreationMap: {
        'oscillator': (ctx: AudioContext, node: Node) => {
            const osc = ctx.createOscillator();
            (osc as any).start = vi.fn(); // Mock start explicitly if needed or rely on mockup
            return osc;
        },
        'default': (ctx: AudioContext) => ctx.createGain(),
    }
}));

describe('Voice P-Lock (Parameter Overrides)', () => {
    let context: AudioContext;

    beforeEach(() => {
        setupWebAudioMock();
        context = new AudioContext();
    });

    it('should apply P-Lock override using node label', () => {
        const subgraph = {
            nodes: [
                { id: '1', type: 'oscillator', data: { label: 'MyOsc' }, position: { x: 0, y: 0 } },
                { id: '2', type: 'InstrumentOutput', data: {}, position: { x: 0, y: 0 } }
            ] as Node[],
            connections: [] as Edge[]
        };

        const voice = new Voice(context, subgraph);
        const internalNodes = (voice as any).internalNodes as Map<string, AudioNode>;
        const oscNode = internalNodes.get('1') as OscillatorNode;

        expect(oscNode).toBeDefined();

        const startTime = context.currentTime;
        voice.trigger(startTime, 60, 1.0, { 'MyOsc:frequency': 880 });

        // Check if setValueAtTime was called on frequency
        expect(oscNode.frequency.setValueAtTime).toHaveBeenCalledWith(880, startTime);
    });

    it('should apply P-Lock override using node type fallback', () => {
        const subgraph = {
            nodes: [
                { id: '1', type: 'oscillator', data: {}, position: { x: 0, y: 0 } }, // No label
                { id: '2', type: 'InstrumentOutput', data: {}, position: { x: 0, y: 0 } }
            ] as Node[],
            connections: [] as Edge[]
        };

        const voice = new Voice(context, subgraph);
        const internalNodes = (voice as any).internalNodes as Map<string, AudioNode>;
        const oscNode = internalNodes.get('1') as OscillatorNode;

        const startTime = context.currentTime;
        // Key constructed as "oscillator:frequency" (type:param)
        voice.trigger(startTime, 60, 1.0, { 'oscillator:frequency': 220 });

        expect(oscNode.frequency.setValueAtTime).toHaveBeenCalledWith(220, startTime);
    });
});
