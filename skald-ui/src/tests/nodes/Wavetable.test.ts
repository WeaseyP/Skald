import { describe, it, expect, beforeEach } from 'vitest';
import { setupWebAudioMock } from '../webAudioMock';
import { createWavetableNode } from '../../hooks/nodeEditor/audioNodeFactory/createWavetableNode';

setupWebAudioMock();

describe('WavetableNode Factory', () => {
    let context: AudioContext;

    beforeEach(() => {
        context = new AudioContext();
    });

    it('creates wavetable worklet', () => {
        const nodeData = { id: 'wt-1', data: {} };
        const audioNode = createWavetableNode(context, nodeData as any);
        const instance = (audioNode as any)._skaldNode;

        // Implementation uses 'wavetable-processor' worklet
        expect(instance).toBeDefined();
        // Mock doesn't expose worklet name directly, but we can verify params
        expect(instance.worklet.parameters.has('position')).toBe(true);
    });

    it('updates position and amplitude', () => {
        const nodeData = { id: 'wt-2', data: { position: 0.1 } };
        const audioNode = createWavetableNode(context, nodeData as any);
        const instance = (audioNode as any)._skaldNode;

        instance.update({ position: 0.9, amplitude: 0.5 });

        expect(instance.worklet.parameters.get('position')?.setValueAtTime).toHaveBeenCalledWith(0.9, expect.any(Number));
        expect(instance.output.gain.setValueAtTime).toHaveBeenCalledWith(0.5, expect.any(Number));
    });

    it('posts table data to worklet', () => {
        const nodeData = { id: 'wt-3', data: {} };
        const audioNode = createWavetableNode(context, nodeData as any);
        const instance = (audioNode as any)._skaldNode;

        const table = new Float32Array([0, 1, 0, -1]);
        instance.update({ table });

        expect(instance.worklet.port.postMessage).toHaveBeenCalledWith({ type: 'update-table', table });
    });
});
