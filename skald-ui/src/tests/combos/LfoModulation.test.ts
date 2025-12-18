import { describe, it, expect, beforeEach } from 'vitest';
import { setupWebAudioMock } from '../webAudioMock';
import { createLfoNode } from '../../hooks/nodeEditor/audioNodeFactory/createLfoNode';
import { createFilterNode } from '../../hooks/nodeEditor/audioNodeFactory/createFilterNode';
import { connectNodes } from '../../hooks/nodeEditor/audioNodeUtils';

setupWebAudioMock();

describe('Combo: LFO Modulation', () => {
    let context: AudioContext;

    beforeEach(() => {
        context = new AudioContext();
    });

    it('connects LFO to Filter Cutoff', () => {
        const lfo = createLfoNode(context, { id: 'lfo', data: { frequency: 5 } } as any);
        const filter = createFilterNode(context, { id: 'filter', data: { cutoff: 1000 } } as any);

        const edge = {
            id: 'e1',
            source: 'lfo',
            target: 'filter',
            targetHandle: 'frequency'
        };

        connectNodes(lfo, filter, edge as any);

        // Verify LFO connects to Filter.frequency AudioParam
        expect(lfo.connect).toHaveBeenCalledWith((filter as any).frequency);
    });
});
