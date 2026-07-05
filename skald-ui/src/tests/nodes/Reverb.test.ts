import { describe, it, expect, beforeEach } from 'vitest';
import { setupWebAudioMock } from '../webAudioMock';
import { createReverbNode } from '../../hooks/nodeEditor/audioNodeFactory/createReverbNode';

setupWebAudioMock();

describe('ReverbNode Factory', () => {
    let context: AudioContext;

    beforeEach(() => {
        context = new AudioContext();
    });

    it('creates convolver reverb honoring the real decay param', () => {
        // The old version of this test passed a non-existent `seconds` key
        // and asserted the DEFAULT buffer length by coincidence. Use the
        // actual schema param.
        const nodeData = { id: 'reverb-1', data: { decay: 2 } };
        const audioNode = createReverbNode(context, nodeData as any);
        const instance = (audioNode as any)._skaldNode;

        expect(instance.convolver).toBeDefined();
        expect(instance.convolver.buffer).toBeDefined();
        // Buffer length = sampleRate * decayTime = 44100 * 2
        expect(instance.convolver.buffer!.length).toBe(88200);
    });

    it('defaults decay to the schema value (3.0)', () => {
        const nodeData = { id: 'reverb-3', data: {} };
        const audioNode = createReverbNode(context, nodeData as any);
        const instance = (audioNode as any)._skaldNode;

        expect(instance.convolver.buffer!.length).toBe(44100 * 3);
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
