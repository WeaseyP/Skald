import { describe, it, expect, beforeEach } from 'vitest';
import { setupWebAudioMock } from '../webAudioMock';
import { createReverbNode } from '../../hooks/nodeEditor/audioNodeFactory/createReverbNode';

setupWebAudioMock();

describe('ReverbNode Factory', () => {
    let context: AudioContext;

    beforeEach(() => {
        context = new AudioContext();
    });

    it('creates convolver reverb', () => {
        const nodeData = { id: 'reverb-1', data: { seconds: 2 } };
        const audioNode = createReverbNode(context, nodeData as any);
        const instance = (audioNode as any)._skaldNode;

        expect(instance.convolver).toBeDefined();
        expect(instance.convolver.buffer).toBeDefined();
        // Buffer length = sampleRate * decayTime = 44100 * 2
        // Note: Mock implementation of createBuffer returns length
        expect(instance.convolver.buffer!.length).toBe(88200);
    });

    it('updates mix and pre-delay', () => {
        const nodeData = { id: 'reverb-2', data: { mix: 0.5 } };
        const audioNode = createReverbNode(context, nodeData as any);
        const instance = (audioNode as any)._skaldNode;

        instance.update({ mix: 0.8, preDelay: 0.1 });

        expect(instance.wet.gain.setValueAtTime).toHaveBeenCalledWith(0.8, expect.any(Number));
        expect(instance.preDelay.delayTime.setValueAtTime).toHaveBeenCalledWith(0.1, expect.any(Number));
    });
});
