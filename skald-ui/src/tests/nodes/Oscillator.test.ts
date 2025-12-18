import { describe, it, expect, beforeEach } from 'vitest';
import { setupWebAudioMock } from '../webAudioMock';
import { createOscillatorNode } from '../../hooks/nodeEditor/audioNodeFactory/createOscillatorNode';

setupWebAudioMock();

describe('OscillatorNode Factory', () => {
    let context: AudioContext;

    beforeEach(() => {
        context = new AudioContext();
    });

    it('creates a basic oscillator with defaults', () => {
        const nodeData = { id: 'osc-1', data: {} };
        const audioNode = createOscillatorNode(context, nodeData as any);
        const instance = (audioNode as any)._skaldNode;

        expect(instance).toBeDefined();
        // Default waveform is sawtooth if not specified (or whatever implementation defaults to)
        // Checking implementation: "const waveform = (data.waveform || 'sawtooth').toLowerCase();"
        expect(instance.osc?.type).toBe('sawtooth');
        expect(instance.output.gain.setTargetAtTime).toHaveBeenCalledWith(0.5, expect.any(Number), expect.any(Number));
    });

    it('creates a sine oscillator with specific frequency', () => {
        const nodeData = { id: 'osc-2', data: { frequency: 440, waveform: 'sine', amplitude: 0.8 } };
        const audioNode = createOscillatorNode(context, nodeData as any);
        const instance = (audioNode as any)._skaldNode;

        expect(instance.osc?.type).toBe('sine');
        expect(instance.osc?.frequency.setTargetAtTime).toHaveBeenCalledWith(440, expect.any(Number), expect.any(Number));
        expect(instance.output.gain.setTargetAtTime).toHaveBeenCalledWith(0.8, expect.any(Number), expect.any(Number));
    });

    it('handles PWM (Square) mode correctly', () => {
        const nodeData = { id: 'osc-pwm', data: { frequency: 220, waveform: 'square', pulseWidth: 0.25 } };
        const audioNode = createOscillatorNode(context, nodeData as any);
        const instance = (audioNode as any)._skaldNode;

        expect(instance.isPwm).toBe(true);
        expect(instance.osc).toBeNull(); // Standard osc should be null
        expect(instance.pwmOsc).toBeDefined(); // PWM osc should be defined

        // Pulse width logic check: 1 - 2 * 0.25 = 0.5
        expect(instance.dcOffset?.offset.setTargetAtTime).toHaveBeenCalledWith(0.5, expect.any(Number), expect.any(Number));
    });

    it('updates parameters correctly', () => {
        const nodeData = { id: 'osc-update', data: { frequency: 440 } };
        const audioNode = createOscillatorNode(context, nodeData as any);
        const instance = (audioNode as any)._skaldNode;

        instance.update({ frequency: 880, waveform: 'triangle' });

        expect(instance.osc?.frequency.setTargetAtTime).toHaveBeenCalledWith(880, expect.any(Number), expect.any(Number));
        expect(instance.osc?.type).toBe('triangle');
    });
});
