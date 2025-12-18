import { describe, it, expect, beforeEach } from 'vitest';
import { setupWebAudioMock } from '../webAudioMock';
import { createSampleHoldNode } from '../../hooks/nodeEditor/audioNodeFactory/createSampleHoldNode';

setupWebAudioMock();

describe('SampleHoldNode Factory', () => {
    let context: AudioContext;

    beforeEach(() => {
        context = new AudioContext();
    });

    it('creates sample and hold worklet', () => {
        const nodeData = { id: 'sh-1', data: { rate: 10 } };
        const audioNode = createSampleHoldNode(context, nodeData as any);
        const instance = (audioNode as any)._skaldNode;

        // Implementation uses 'sample-hold-processor'
        expect(instance.worklet.parameters.get('rate')?.setValueAtTime).toHaveBeenCalledWith(10, expect.any(Number));
    });

    it('updates rate', () => {
        const nodeData = { id: 'sh-update', data: { rate: 5 } };
        const audioNode = createSampleHoldNode(context, nodeData as any);
        const instance = (audioNode as any)._skaldNode;

        instance.update({ rate: 20 });
        expect(instance.worklet.parameters.get('rate')?.setValueAtTime).toHaveBeenCalledWith(20, expect.any(Number));
    });
});
