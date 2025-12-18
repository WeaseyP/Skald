import { describe, it, expect, beforeEach } from 'vitest';
import { setupWebAudioMock } from '../webAudioMock';
import { createDelayNode } from '../../hooks/nodeEditor/audioNodeFactory/createDelayNode';

setupWebAudioMock();

describe('DelayNode Factory', () => {
    let context: AudioContext;

    beforeEach(() => {
        context = new AudioContext();
    });

    it('creates a delay node and associated gain structure', () => {
        const nodeData = { id: 'delay-1', data: {} };
        const audioNode = createDelayNode(context, nodeData as any);
        const instance = (audioNode as any)._skaldNode;

        expect(instance).toBeDefined();
        // Delay logic structure: Input -> [Dry, Delay -> Feedback -> Delay -> Wet] -> Output
        expect(instance.input instanceof GainNode).toBe(true);
        expect(instance.output instanceof GainNode).toBe(true);
        expect(instance.delay instanceof DelayNode).toBe(true);
    });

    it('sets initial delay parameters', () => {
        const nodeData = { id: 'delay-2', data: { delayTime: 0.5, feedback: 0.7, mix: 0.4 } };
        const audioNode = createDelayNode(context, nodeData as any);
        const instance = (audioNode as any)._skaldNode;

        expect(instance.delay.delayTime.setValueAtTime).toHaveBeenCalledWith(0.5, expect.any(Number));
        expect(instance.feedback.gain.setValueAtTime).toHaveBeenCalledWith(0.7, expect.any(Number));
        expect(instance.wet.gain.setValueAtTime).toHaveBeenCalledWith(0.4, expect.any(Number));
        // Dry is 1 - mix = 0.6
        expect(instance.dry.gain.setValueAtTime).toHaveBeenCalledWith(0.6, expect.any(Number));
    });

    it('updates delay parameters', () => {
        const nodeData = { id: 'delay-update', data: { delayTime: 0.2 } };
        const audioNode = createDelayNode(context, nodeData as any);
        const instance = (audioNode as any)._skaldNode;

        instance.update({ delayTime: 0.8, mix: 0.9 });

        expect(instance.delay.delayTime.setValueAtTime).toHaveBeenCalledWith(0.8, expect.any(Number));
        expect(instance.wet.gain.setValueAtTime).toHaveBeenCalledWith(0.9, expect.any(Number));
        // Dry updated to 0.1
        // Dry updated to 0.1 (1.0 - 0.9)
        expect(instance.dry.gain.setValueAtTime).toHaveBeenCalledWith(expect.closeTo(0.1, 5), expect.any(Number));
    });
});
