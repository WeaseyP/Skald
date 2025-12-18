import { describe, it, expect, beforeEach } from 'vitest';
import { setupWebAudioMock } from '../webAudioMock';
import { createNoiseNode } from '../../hooks/nodeEditor/audioNodeFactory/createNoiseNode';
import { createAdsrNode } from '../../hooks/nodeEditor/audioNodeFactory/createAdsrNode';
import { connectNodes } from '../../hooks/nodeEditor/audioNodeUtils';

setupWebAudioMock();

describe('Voice Combo: Drum Voice (Snare)', () => {
    let context: AudioContext;
    let adsrMap: Map<string, any>;

    beforeEach(() => {
        context = new AudioContext();
        adsrMap = new Map();
    });

    it('connects Noise -> ADSR for percussion', () => {
        // Snare setup: Pink Noise -> Fast ADSR
        const noise = createNoiseNode(context, { id: 'noise', data: { type: 'pink' } } as any);
        const adsr = createAdsrNode(context, { id: 'env', data: { attack: 0, decay: 0.2, sustain: 0 } } as any, adsrMap);
        const output = context.createGain();

        // Connect
        connectNodes(noise, adsr, { id: 'e1', source: 'noise', target: 'env' } as any);
        connectNodes(adsr, output, { id: 'e2', source: 'env', target: 'out' } as any);

        // Verify
        const noiseInstance = (noise as any)._skaldNode;
        // Check connection Noise (Output Gain) -> ADSR
        expect(noise.connect).toHaveBeenCalledWith(adsr);
        expect(adsr.connect).toHaveBeenCalledWith(output);
    });
});
