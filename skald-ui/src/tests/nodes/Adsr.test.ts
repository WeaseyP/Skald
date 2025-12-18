import { describe, it, expect, beforeEach } from 'vitest';
import { setupWebAudioMock } from '../webAudioMock';
import { createAdsrNode } from '../../hooks/nodeEditor/audioNodeFactory/createAdsrNode';
import { AdsrDataMap } from '../../hooks/nodeEditor/types';

setupWebAudioMock();

describe('AdsrNode Factory', () => {
    let context: AudioContext;
    let adsrMap: AdsrDataMap;

    beforeEach(() => {
        context = new AudioContext();
        adsrMap = new Map();
    });

    it('creates VCA and Worklet structure correctly', () => {
        const nodeData = { id: 'adsr-1', data: { attack: 0.1, decay: 0.2, sustain: 0.5, release: 1.0 } };
        const vcaNode = createAdsrNode(context, nodeData as any, adsrMap);

        // Should return the VCA (GainNode)
        expect(vcaNode).toBeDefined();
        expect((vcaNode as GainNode).gain.value).toBe(0); // Initializes silent

        // Should store worklet in map
        const storedData = adsrMap.get('adsr-1');
        expect(storedData).toBeDefined();
        expect(storedData?.worklet).toBeDefined();
    });

    it('passes parameters to the worklet', () => {
        const nodeData = { id: 'adsr-2', data: { attack: 0.05, sustain: 0.8 } };
        createAdsrNode(context, nodeData as any, adsrMap);

        const worklet = adsrMap.get('adsr-2')!.worklet;

        // Verify parameter setting using mocked setValueAtTime
        expect(worklet.parameters.get('attack')?.setValueAtTime).toHaveBeenCalledWith(0.05, expect.any(Number));
        expect(worklet.parameters.get('sustain')?.setValueAtTime).toHaveBeenCalledWith(0.8, expect.any(Number));
        // Defaults
        expect(worklet.parameters.get('decay')?.setValueAtTime).toHaveBeenCalledWith(0.1, expect.any(Number));
    });

    it('connects worklet to VCA', () => {
        const nodeData = { id: 'adsr-3', data: {} };
        const vcaNode = createAdsrNode(context, nodeData as any, adsrMap);
        const worklet = adsrMap.get('adsr-3')!.worklet;

        expect(worklet.connect).toHaveBeenCalledWith((vcaNode as GainNode).gain);
    });
});
