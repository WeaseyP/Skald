import { describe, it, expect, beforeEach } from 'vitest';
import { setupWebAudioMock } from '../webAudioMock';
import { createFilterNode } from '../../hooks/nodeEditor/audioNodeFactory/createFilterNode';

setupWebAudioMock();

describe('FilterNode Factory', () => {
    let context: AudioContext;

    beforeEach(() => {
        context = new AudioContext();
    });

    it('creates a lowpass filter by default', () => {
        const nodeData = { id: 'filter-1', data: {} };
        const audioNode = createFilterNode(context, nodeData as any);
        const instance = (audioNode as any)._skaldNode;

        expect(instance.node.type).toBe('lowpass');
        // Default cutoff 800
        expect(instance.node.frequency.setValueAtTime).toHaveBeenCalledWith(800, expect.any(Number));
    });

    it('creates a highpass filter with resonance', () => {
        const nodeData = { id: 'filter-2', data: { type: 'highpass', cutoff: 2000, resonance: 5 } };
        const audioNode = createFilterNode(context, nodeData as any);
        const instance = (audioNode as any)._skaldNode;

        expect(instance.node.type).toBe('highpass');
        expect(instance.node.frequency.setValueAtTime).toHaveBeenCalledWith(2000, expect.any(Number));
        expect(instance.node.Q.setValueAtTime).toHaveBeenCalledWith(5, expect.any(Number));
    });

    it('updates filter parameters dynamically', () => {
        const nodeData = { id: 'filter-update', data: { cutoff: 1000 } };
        const audioNode = createFilterNode(context, nodeData as any);
        const instance = (audioNode as any)._skaldNode;

        instance.update({ cutoff: 500, type: 'bandpass' });

        expect(instance.node.frequency.setValueAtTime).toHaveBeenCalledWith(500, expect.any(Number));
        expect(instance.node.type).toBe('bandpass');
    });
});
