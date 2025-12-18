import { describe, it, expect, beforeEach } from 'vitest';
import { setupWebAudioMock } from '../webAudioMock';
import { createLfoNode } from '../../hooks/nodeEditor/audioNodeFactory/createLfoNode';
import { createWavetableNode } from '../../hooks/nodeEditor/audioNodeFactory/createWavetableNode';
import { connectNodes } from '../../hooks/nodeEditor/audioNodeUtils';

setupWebAudioMock();

describe('Combo: Wavetable Sweep', () => {
    let context: AudioContext;

    beforeEach(() => {
        context = new AudioContext();
    });

    it('connects LFO to Wavetable Position', () => {
        const lfo = createLfoNode(context, { id: 'lfo', data: { frequency: 0.1 } } as any);
        const wavetable = createWavetableNode(context, { id: 'wt', data: {} } as any);

        // Wavetable factory now exposes .position param on the output node
        connectNodes(lfo, wavetable, {
            id: 'e1',
            source: 'lfo',
            target: 'wt',
            targetHandle: 'position'
        } as any);

        expect(lfo.connect).toHaveBeenCalledWith((wavetable as any).position);
    });
});
