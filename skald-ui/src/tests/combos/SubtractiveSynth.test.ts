import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setupWebAudioMock } from '../webAudioMock';
import { createOscillatorNode } from '../../hooks/nodeEditor/audioNodeFactory/createOscillatorNode';
import { createFilterNode } from '../../hooks/nodeEditor/audioNodeFactory/createFilterNode';
import { createAdsrNode } from '../../hooks/nodeEditor/audioNodeFactory/createAdsrNode';
import { connectNodes } from '../../hooks/nodeEditor/audioNodeUtils';

setupWebAudioMock();

describe('Voice Combo: Subtractive Synth', () => {
    let context: AudioContext;
    let adsrMap: Map<string, any>;

    beforeEach(() => {
        context = new AudioContext();
        adsrMap = new Map();
    });

    it('connects Osc -> Filter -> ADSR -> Output', () => {
        // 1. Create Nodes
        const osc = createOscillatorNode(context, { id: '1', data: { frequency: 440 } } as any);
        const filter = createFilterNode(context, { id: '2', data: { type: 'lowpass' } } as any);
        const adsr = createAdsrNode(context, { id: '3', data: {} } as any, adsrMap);
        const output = context.createGain(); // Mock Output

        // 2. Connect them using utils
        // Osc -> Filter
        const edge1 = { id: 'e1', source: '1', target: '2' };
        connectNodes(osc, filter, edge1 as any);

        // Filter -> ADSR
        const edge2 = { id: 'e2', source: '2', target: '3' };
        connectNodes(filter, adsr, edge2 as any);

        // ADSR -> Output
        const edge3 = { id: 'e3', source: '3', target: 'out' };
        connectNodes(adsr, output, edge3 as any);

        // 3. Verify Mock Connections
        // Oscillator should connect to Filter Input (which is the node itself for now)
        expect(osc.connect).toHaveBeenCalledWith(filter);

        // Filter should connect to ADSR (VCA)
        expect(filter.connect).toHaveBeenCalledWith(adsr);

        // ADSR should connect to Output
        expect(adsr.connect).toHaveBeenCalledWith(output);
    });
});
