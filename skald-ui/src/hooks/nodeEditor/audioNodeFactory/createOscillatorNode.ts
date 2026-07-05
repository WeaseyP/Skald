import { Node } from 'reactflow';
import { BaseSkaldNode } from './BaseSkaldNode';
import { OscillatorParams } from '../../../definitions/types';

class SkaldOscillatorNode extends BaseSkaldNode {
    public readonly skaldType = 'SkaldOscillatorNode';
    public output: GainNode;
    private context: AudioContext;

    private osc: OscillatorNode | null = null;
    private phaseDelay: DelayNode;
    private smoothingTimeConstant = 0.015; // Time in seconds for smoothing

    // PWM-specific nodes
    private pwmOsc: OscillatorNode | null = null;
    private dcOffset: ConstantSourceNode | null = null;
    private shaper: WaveShaperNode | null = null;
    private isPwm = false;

    // Parameter inputs
    public input_freq: GainNode;

    constructor(context: AudioContext, data: OscillatorParams) {
        super();
        this.context = context;
        this.output = context.createGain();
        this.phaseDelay = context.createDelay(1.0); // Max delay 1s

        // Frequency modulation is exponential V/Oct — the golden-path
        // (codegen) semantic: an input of 1.0 = +1 octave. Web Audio's
        // detune param is in cents, so scale by 1200 and drive detune
        // instead of adding linear Hz into osc.frequency (which made the
        // same patch sound wildly different in the exported code).
        this.input_freq = context.createGain();
        this.input_freq.gain.value = 1200.0; // octaves -> cents


        this.output.gain.cancelScheduledValues(this.context.currentTime);
        this.output.gain.setTargetAtTime(data.amplitude ?? 0.5, this.context.currentTime, this.smoothingTimeConstant);

        this.setupWaveform(data);

        const freq = data.frequency || 440;
        const phase = data.phase || 0;
        this.updatePhase(phase, freq);
    }

    private setupWaveform(data: OscillatorParams) {
        this.cleanup(); // Disconnect previous nodes if any

        // Sine is the schema default (node-definitions) — the old
        // 'sawtooth' fallback diverged from codegen for missing params.
        const waveform = (data.waveform || 'sine').toLowerCase();
        const frequency = data.frequency || 440;

        if (waveform === 'square') {
            this.isPwm = true;

            this.pwmOsc = this.context.createOscillator();
            this.pwmOsc.type = 'sawtooth';
            this.pwmOsc.frequency.cancelScheduledValues(this.context.currentTime);
            this.pwmOsc.frequency.setTargetAtTime(frequency, this.context.currentTime, this.smoothingTimeConstant);

            this.dcOffset = this.context.createConstantSource();
            this.updatePulseWidth(data.pulseWidth ?? 0.5);

            this.shaper = this.context.createWaveShaper();
            this.shaper.curve = new Float32Array([-1, 1]); // Steep curve for comparator effect

            const summer = this.context.createGain();
            summer.gain.value = 1000; // Amplify for a sharp transition

            // Pitch modulation reaches PWM squares too — this path used to
            // drop input_freq entirely.
            this.input_freq.connect(this.pwmOsc.detune);

            this.pwmOsc.connect(summer);
            this.dcOffset.connect(summer);
            summer.connect(this.shaper);
            this.shaper.connect(this.phaseDelay);

            this.pwmOsc.start();
            this.dcOffset.start();
        } else {
            this.isPwm = false;
            this.osc = this.context.createOscillator();
            this.osc.type = waveform as OscillatorType;
            this.osc.frequency.cancelScheduledValues(this.context.currentTime);
            this.osc.frequency.setTargetAtTime(frequency, this.context.currentTime, this.smoothingTimeConstant);

            // Connect modulation input (V/Oct via detune, see constructor)
            this.input_freq.connect(this.osc.detune);

            this.osc.connect(this.phaseDelay);
            this.osc.start();
        }

        this.phaseDelay.connect(this.output);
    }

    private updatePulseWidth(pulseWidth: number) {
        if (this.dcOffset) {
            this.dcOffset.offset.cancelScheduledValues(this.context.currentTime);
            this.dcOffset.offset.setTargetAtTime(1 - 2 * pulseWidth, this.context.currentTime, this.smoothingTimeConstant);
        }
    }

    private updatePhase(phase: number, frequency: number) {
        if (frequency > 0) {
            const phaseOffset = (phase / 360.0) / frequency;
            this.phaseDelay.delayTime.cancelScheduledValues(this.context.currentTime);
            this.phaseDelay.delayTime.setTargetAtTime(phaseOffset, this.context.currentTime, this.smoothingTimeConstant);
        }
    }

    private cleanup() {
        if (this.osc) {
            this.osc.stop();
            this.osc.disconnect();
            this.osc = null;
        }
        if (this.pwmOsc) {
            this.pwmOsc.stop();
            this.pwmOsc.disconnect();
            this.pwmOsc = null;
        }
        if (this.dcOffset) {
            this.dcOffset.stop();
            this.dcOffset.disconnect();
            this.dcOffset = null;
        }
        if (this.shaper) {
            this.shaper.disconnect();
            this.shaper = null;
        }
        this.phaseDelay.disconnect();
        // Don't disconnect input_freq here, it might be reused or handled by caller? 
        // Actually best to disconnect it from targets but keep the node inputs intact if possible.
        this.input_freq.disconnect();

    }

    public update(data: OscillatorParams): void {
        const currentWaveform = this.isPwm ? 'square' : this.osc?.type;
        if (data.waveform && data.waveform.toLowerCase() !== currentWaveform) {
            this.setupWaveform(data);
        }

        const targetOsc = this.isPwm ? this.pwmOsc : this.osc;
        const frequency = data.frequency ?? targetOsc?.frequency.value ?? 440;

        if (data.frequency && targetOsc) {
            targetOsc.frequency.cancelScheduledValues(this.context.currentTime);
            targetOsc.frequency.setTargetAtTime(data.frequency, this.context.currentTime, this.smoothingTimeConstant);
        }

        if (data.amplitude !== undefined) {
            this.output.gain.cancelScheduledValues(this.context.currentTime);
            this.output.gain.setTargetAtTime(data.amplitude, this.context.currentTime, this.smoothingTimeConstant);
        }

        if (data.pulseWidth !== undefined && this.isPwm) {
            this.updatePulseWidth(data.pulseWidth);
        }

        if (data.phase !== undefined) {
            this.updatePhase(data.phase, frequency);
        }
    }

    public get frequency(): AudioParam | undefined {
        return this.isPwm ? this.pwmOsc?.frequency : this.osc?.frequency;
    }

    public get detune(): AudioParam | undefined {
        return this.isPwm ? this.pwmOsc?.detune : this.osc?.detune;
    }

    public disconnect() {
        this.cleanup();
        this.output.disconnect();
    }
}

export const createOscillatorNode = (context: AudioContext, node: Node): AudioNode => {
    const oscillatorNodeInstance = new SkaldOscillatorNode(context, node.data as OscillatorParams);

    const outputNode = oscillatorNodeInstance.output as any;
    outputNode._skaldNode = oscillatorNodeInstance;

    return outputNode;
};