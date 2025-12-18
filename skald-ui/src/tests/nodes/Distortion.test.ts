import { describe, it, expect, beforeEach } from 'vitest';
import { setupWebAudioMock } from '../webAudioMock';
import { createDistortionNode } from '../../hooks/nodeEditor/audioNodeFactory/createDistortionNode';

setupWebAudioMock();

describe('DistortionNode Factory', () => {
    let context: AudioContext;

    beforeEach(() => {
        context = new AudioContext();
    });

    it('creates distortion chain', () => {
        const nodeData = { id: 'dist-1', data: {} };
        const audioNode = createDistortionNode(context, nodeData as any);
        const instance = (audioNode as any)._skaldNode;

        expect(instance.shaper).toBeDefined();
        // Check curve generation
        expect(instance.shaper.curve).toBeInstanceOf(Float32Array);
        expect(instance.shaper.curve!.length).toBe(44100);
    });

    it('generates different curves for different shapes', () => {
        const nodeDataSoft = { id: 'dist-soft', data: { shape: 'soft' } };
        const nodeDataHard = { id: 'dist-hard', data: { shape: 'hard' } };

        const instanceSoft = (createDistortionNode(context, nodeDataSoft as any) as any)._skaldNode;
        const instanceHard = (createDistortionNode(context, nodeDataHard as any) as any)._skaldNode;

        // Curves should be different
        const softVal = instanceSoft.shaper.curve![22050]; // Midpoint
        const hardVal = instanceHard.shaper.curve![22050];

        // Exact values depend on math but shouldn't be null
        expect(instanceSoft.shaper.curve).not.toEqual(instanceHard.shaper.curve);
    });

    it('updates parameters', () => {
        const nodeData = { id: 'dist-update', data: { drive: 10 } };
        const audioNode = createDistortionNode(context, nodeData as any);
        const instance = (audioNode as any)._skaldNode;

        // Update tone filter frequency
        instance.update({ tone: 5000 });
        expect(instance.toneFilter.frequency.setValueAtTime).toHaveBeenCalledWith(5000, expect.any(Number));
    });
});
