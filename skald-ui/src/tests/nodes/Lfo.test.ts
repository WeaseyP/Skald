import { describe, it, expect, beforeEach } from 'vitest';
import { setupWebAudioMock } from '../webAudioMock';
import { createLfoNode } from '../../hooks/nodeEditor/audioNodeFactory/createLfoNode';

setupWebAudioMock();

describe('LfoNode Factory', () => {
    let context: AudioContext;

    beforeEach(() => {
        context = new AudioContext();
    });

    it('creates LFO oscillator', () => {
        const nodeData = { id: 'lfo-1', data: { frequency: 5, waveform: 'triangle' } };
        const audioNode = createLfoNode(context, nodeData as any);
        const instance = (audioNode as any)._skaldNode;

        expect(instance.lfo).toBeDefined();
        expect(instance.lfo.type).toBe('triangle');
        expect(instance.lfo.frequency.setValueAtTime).toHaveBeenCalledWith(5, expect.any(Number));
    });

    it('updates LFO parameters', () => {
        const nodeData = { id: 'lfo-update', data: { amplitude: 10 } };
        const audioNode = createLfoNode(context, nodeData as any);
        const instance = (audioNode as any)._skaldNode;

        instance.update({ frequency: 2, amplitude: 50 });

        expect(instance.lfo.frequency.setValueAtTime).toHaveBeenCalledWith(2, expect.any(Number));
        expect(instance.output.gain.setValueAtTime).toHaveBeenCalledWith(50, expect.any(Number));
    });
});
