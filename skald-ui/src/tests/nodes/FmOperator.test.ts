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

    it('treats frequency as a note ratio and reads the schema modIndex key', () => {
        // Golden-path semantics: `frequency` is a ratio of the played note
        // (default note base 440 until a note arrives), clamped to [0.01,32].
        // `modIndex` is the serialized key — the legacy `modulationIndex`
        // read made the Modulation Index knob a silent no-op.
        const nodeData = { id: 'fm-2', data: { frequency: 2, modIndex: 100 } };
        const audioNode = createFmOperatorNode(context, nodeData as any);
        const instance = (audioNode as any)._skaldNode;

        // Initial values: carrier = noteFreq(440) * ratio(2)
        expect(instance.carrier.frequency.setValueAtTime).toHaveBeenCalledWith(880, expect.any(Number));
        expect(instance.modulatorInput.gain.setValueAtTime).toHaveBeenCalledWith(100, expect.any(Number));

        // Update ratio + modIndex
        instance.update({ frequency: 4, modIndex: 1000 });
        expect(instance.carrier.frequency.setValueAtTime).toHaveBeenCalledWith(1760, expect.any(Number));
        expect(instance.modulatorInput.gain.setValueAtTime).toHaveBeenCalledWith(1000, expect.any(Number));

        // Legacy key still accepted
        instance.update({ modulationIndex: 50 });
        expect(instance.modulatorInput.gain.setValueAtTime).toHaveBeenCalledWith(50, expect.any(Number));
    });

    it('tracks the played note like the generated code (carrier = note * ratio)', () => {
        const nodeData = { id: 'fm-3', data: { frequency: 3.5 } };
        const audioNode = createFmOperatorNode(context, nodeData as any);
        const instance = (audioNode as any)._skaldNode;

        instance.setNoteFrequency(220);
        expect(instance.carrier.frequency.setValueAtTime).toHaveBeenCalledWith(770, expect.any(Number));
    });

    it('clamps legacy absolute-Hz saves (frequency 440 as ratio) to 32', () => {
        const nodeData = { id: 'fm-4', data: { frequency: 440 } };
        const audioNode = createFmOperatorNode(context, nodeData as any);
        const instance = (audioNode as any)._skaldNode;

        expect(instance.ratio).toBe(32);
    });
});
