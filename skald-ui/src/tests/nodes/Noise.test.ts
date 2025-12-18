import { describe, it, expect, beforeEach } from 'vitest';
import { setupWebAudioMock } from '../webAudioMock';
import { createNoiseNode } from '../../hooks/nodeEditor/audioNodeFactory/createNoiseNode';

setupWebAudioMock();

describe('NoiseNode Factory', () => {
    let context: AudioContext;

    beforeEach(() => {
        context = new AudioContext();
    });

    it('creates white noise by default', () => {
        const nodeData = { id: 'noise-1', data: {} };
        const audioNode = createNoiseNode(context, nodeData as any);
        const instance = (audioNode as any)._skaldNode;

        expect(instance.noiseSource).toBeDefined();
        expect(instance.noiseSource.buffer).toBeDefined();
        // White noise uses lowpass at Nyquist (effectively open) with 0 Q
        expect(instance.filter.type).toBe('lowpass');
        expect(instance.filter.Q.setValueAtTime).toHaveBeenCalledWith(0, expect.any(Number));
    });

    it('creates pink noise configuration', () => {
        const nodeData = { id: 'noise-pink', data: { type: 'pink' } };
        const audioNode = createNoiseNode(context, nodeData as any);
        const instance = (audioNode as any)._skaldNode;

        expect(instance.filter.frequency.setValueAtTime).toHaveBeenCalledWith(1000, expect.any(Number));
        expect(instance.filter.Q.setValueAtTime).toHaveBeenCalledWith(1, expect.any(Number));
    });

    it('creates brown noise configuration', () => {
        const nodeData = { id: 'noise-brown', data: { type: 'brown' } };
        const audioNode = createNoiseNode(context, nodeData as any);
        const instance = (audioNode as any)._skaldNode;

        expect(instance.filter.frequency.setValueAtTime).toHaveBeenCalledWith(500, expect.any(Number));
    });

    it('updates noise type and amplitude', () => {
        const nodeData = { id: 'noise-update', data: { type: 'white', amplitude: 0.5 } };
        const audioNode = createNoiseNode(context, nodeData as any);
        const instance = (audioNode as any)._skaldNode;

        instance.update({ type: 'pink', amplitude: 1.0 });

        expect(instance.filter.frequency.setValueAtTime).toHaveBeenCalledWith(1000, expect.any(Number)); // Pink freq
        expect(instance.output.gain.setValueAtTime).toHaveBeenCalledWith(1.0, expect.any(Number));
    });
});
