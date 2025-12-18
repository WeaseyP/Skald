import { describe, it, expect, beforeEach } from 'vitest';
import { setupWebAudioMock } from '../webAudioMock';
import { createFmOperatorNode } from '../../hooks/nodeEditor/audioNodeFactory/createFmOperatorNode';

setupWebAudioMock();

describe('FmOperatorNode Factory', () => {
    let context: AudioContext;

    beforeEach(() => {
        context = new AudioContext();
    });

    it('creates carrier and modulator input', () => {
        const nodeData = { id: 'fm-1', data: { frequency: 440 } };
        const audioNode = createFmOperatorNode(context, nodeData as any);
        const instance = (audioNode as any)._skaldNode;

        expect(instance.carrier).toBeDefined();
        // Modulator input connects to carrier frequency
        expect(instance.modulatorInput.connect).toHaveBeenCalledWith(instance.carrier.frequency);
        // Carrier connects to output
        expect(instance.carrier.connect).toHaveBeenCalledWith(instance.output);
    });

    it('updates frequency and mod index', () => {
        const nodeData = { id: 'fm-2', data: { frequency: 220, modulationIndex: 100 } };
        const audioNode = createFmOperatorNode(context, nodeData as any);
        const instance = (audioNode as any)._skaldNode;

        // Initial values check
        expect(instance.carrier.frequency.setValueAtTime).toHaveBeenCalledWith(220, expect.any(Number));
        expect(instance.modulatorInput.gain.setValueAtTime).toHaveBeenCalledWith(100, expect.any(Number));

        // Update
        instance.update({ frequency: 880, modulationIndex: 1000 });
        expect(instance.carrier.frequency.setValueAtTime).toHaveBeenCalledWith(880, expect.any(Number));
        expect(instance.modulatorInput.gain.setValueAtTime).toHaveBeenCalledWith(1000, expect.any(Number));
    });
});
