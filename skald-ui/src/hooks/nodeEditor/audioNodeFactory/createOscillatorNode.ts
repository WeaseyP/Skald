import { Node } from 'reactflow';
import { BaseSkaldNode } from './BaseSkaldNode';
import { OscillatorParams } from '../../../definitions/types';

class SkaldOscillatorNode extends BaseSkaldNode {
    public output: GainNode;
    private context: AudioContext;

    private osc: OscillatorNode | null = null;
    private phaseDelay: DelayNode;
    private smoothingTimeConstant = 0.015; // Time in seconds for smoothing

    // PWM-specific nodes
    private pwmOsc: OscillatorNode | null = null;
    private dcOffset: ConstantSourceNode | null = null;
    private shaper: WaveShaperNode | null = null;
    private isPwm: boolean = false;

    // Polyphony/Pitch tracking
    private frequencySource: AudioNode | null = null;
    private baseFrequency: number = 440;

    constructor(context: AudioContext, data: OscillatorParams, frequencySource?: AudioNode) {
        super();
        this.context = context;
        this.output = context.createGain();
        this.phaseDelay = context.createDelay(1.0); // Max delay 1s
        this.frequencySource = frequencySource || null;
        this.baseFrequency = data.frequency || 440;

        this.output.gain.cancelScheduledValues(this.context.currentTime);
        this.output.gain.setTargetAtTime(data.amplitude ?? 0.5, this.context.currentTime, this.smoothingTimeConstant);

        this.setupWaveform(data);
        
        // Initial Phase Update
        const freq = this.baseFrequency;
        const phase = data.phase || 0;
        this.updatePhase(phase, freq);
    }

    private setupWaveform(data: OscillatorParams) {
        this.cleanup(); // Disconnect previous nodes if any

        const waveform = (data.waveform || 'sawtooth').toLowerCase();

        // If we have a frequencySource (polyphonic voice), the oscillator base freq is 0 (so it tracks input).
        // Otherwise it is the parameter value.
        const initialFreq = this.frequencySource ? 0 : this.baseFrequency;

        if (waveform === 'square') {
            this.isPwm = true;
            
            this.pwmOsc = this.context.createOscillator();
            this.pwmOsc.type = 'sawtooth';
            this.pwmOsc.frequency.cancelScheduledValues(this.context.currentTime);
            this.pwmOsc.frequency.setValueAtTime(initialFreq, this.context.currentTime);

            if (this.frequencySource) {
                this.frequencySource.connect(this.pwmOsc.frequency);
            }

            this.dcOffset = this.context.createConstantSource();
            this.updatePulseWidth(data.pulseWidth ?? 0.5);
            
            this.shaper = this.context.createWaveShaper();
            this.shaper.curve = new Float32Array([-1, 1]); // Steep curve for comparator effect

            const summer = this.context.createGain();
            summer.gain.value = 1000; // Amplify for a sharp transition

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
            this.osc.frequency.setValueAtTime(initialFreq, this.context.currentTime);

            if (this.frequencySource) {
                this.frequencySource.connect(this.osc.frequency);
            }

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
    }

    public update(data: OscillatorParams): void {
        const currentWaveform = this.isPwm ? 'square' : this.osc?.type;
        if (data.waveform && data.waveform.toLowerCase() !== currentWaveform) {
            this.setupWaveform(data);
        }

        this.baseFrequency = data.frequency ?? 440;
        const targetOsc = this.isPwm ? this.pwmOsc : this.osc;
        
        // If we don't have a frequency source, we control pitch manually.
        // If we DO have a source, we might treat data.frequency as an offset (detune),
        // but for now, standard parity implies we ignore the knob for pitch tracking
        // OR we treat it as a fine tune.
        // Let's stick to: If Voice, Freq = Source. If Standalone, Freq = Knob.
        if (!this.frequencySource && targetOsc && data.frequency !== undefined) {
             targetOsc.frequency.cancelScheduledValues(this.context.currentTime);
             targetOsc.frequency.setTargetAtTime(this.baseFrequency, this.context.currentTime, this.smoothingTimeConstant);
        }
        // If we wanted 'Detune', we could add it to the 0 base.

        if (data.amplitude !== undefined) {
            this.output.gain.cancelScheduledValues(this.context.currentTime);
            this.output.gain.setTargetAtTime(data.amplitude, this.context.currentTime, this.smoothingTimeConstant);
        }

        if (data.pulseWidth !== undefined && this.isPwm) {
            this.updatePulseWidth(data.pulseWidth);
        }

        if (data.phase !== undefined) {
            this.updatePhase(data.phase, this.baseFrequency);
        }
    }

    public disconnect() {
        this.cleanup();
        this.output.disconnect();
    }
}

export const createOscillatorNode = (context: AudioContext, node: Node, adsrMap: any, frequencySource?: AudioNode): AudioNode => {
    // Note: adsrMap is passed by the factory caller but unused here.
    const oscillatorNodeInstance = new SkaldOscillatorNode(context, node.data as OscillatorParams, frequencySource);
    
    const outputNode = oscillatorNodeInstance.output as any;
    outputNode._skaldNode = oscillatorNodeInstance;

    return outputNode;
};
