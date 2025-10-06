import { Node } from 'reactflow';
import { BaseSkaldNode } from './BaseSkaldNode';
import { OscillatorParams } from '../../../definitions/types';

class SkaldOscillatorNode extends BaseSkaldNode {
    public output: GainNode;
    private context: AudioContext;

    private osc: OscillatorNode | null = null;
    private phaseDelay: DelayNode;

    // PWM-specific nodes
    private pwmOsc: OscillatorNode | null = null;
    private dcOffset: ConstantSourceNode | null = null;
    private shaper: WaveShaperNode | null = null;
    private isPwm: boolean = false;

    constructor(context: AudioContext, data: OscillatorParams) {
        super();
        this.context = context;
        this.output = context.createGain();
        this.phaseDelay = context.createDelay(1.0); // Max delay 1s

        this.output.gain.setValueAtTime(data.amplitude ?? 0.5, context.currentTime);

        this.setupWaveform(data);
        
        const freq = data.frequency || 440;
        const phase = data.phase || 0;
        this.updatePhase(phase, freq);
    }

    private setupWaveform(data: OscillatorParams) {
        this.cleanup(); // Disconnect previous nodes if any

        const waveform = (data.waveform || 'sawtooth').toLowerCase();
        const frequency = data.frequency || 440;

        if (waveform === 'square') {
            this.isPwm = true;
            
            this.pwmOsc = this.context.createOscillator();
            this.pwmOsc.type = 'sawtooth';
            this.pwmOsc.frequency.setValueAtTime(frequency, this.context.currentTime);

            this.dcOffset = this.context.createConstantSource();
            this.updatePulseWidth(data.pulseWidth ?? 0.5);
            
            this.shaper = this.context.createWaveShaper();
            // A steep curve to simulate a comparator
            this.shaper.curve = new Float32Array([-1, 1]);

            // Amplify the summed signal before shaping to get a sharp transition
            const summer = this.context.createGain();
            summer.gain.value = 1000; 

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
            this.osc.frequency.setValueAtTime(frequency, this.context.currentTime);
            this.osc.connect(this.phaseDelay);
            this.osc.start();
        }

        this.phaseDelay.connect(this.output);
    }

    private updatePulseWidth(pulseWidth: number) {
        if (this.dcOffset) {
            // Map pulseWidth (0.01-0.99) to a DC offset from 1 to -1
            // This shifts the sawtooth wave up or down before it hits the comparator (shaper)
            this.dcOffset.offset.setValueAtTime(1 - 2 * pulseWidth, this.context.currentTime);
        }
    }

    private updatePhase(phase: number, frequency: number) {
        // Phase is 0-360 degrees. Convert to a delay in seconds.
        if (frequency > 0) {
            const phaseOffset = (phase / 360.0) / frequency;
            this.phaseDelay.delayTime.setValueAtTime(phaseOffset, this.context.currentTime);
        }
    }
    
    private cleanup() {
        // Disconnect and stop any existing nodes to allow for waveform switching
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

        const targetOsc = this.isPwm ? this.pwmOsc : this.osc;
        const frequency = data.frequency ?? targetOsc?.frequency.value ?? 440;
        
        if (data.frequency && targetOsc) {
            targetOsc.frequency.setValueAtTime(data.frequency, this.context.currentTime);
        }

        if (data.amplitude !== undefined) {
            this.output.gain.setValueAtTime(data.amplitude, this.context.currentTime);
        }

        if (data.pulseWidth !== undefined && this.isPwm) {
            this.updatePulseWidth(data.pulseWidth);
        }

        if (data.phase !== undefined) {
            this.updatePhase(data.phase, frequency);
        }
    }

    public disconnect() {
        this.cleanup();
        this.output.disconnect();
    }
}

export const createOscillatorNode = (context: AudioContext, node: Node): AudioNode => {
    const oscillatorNodeInstance = new SkaldOscillatorNode(context, node.data as OscillatorParams);
    
    // Return the final output node of the oscillator graph
    const outputNode = oscillatorNodeInstance.output as any;
    // Attach the class instance to the node for access to the update method
    outputNode._skaldNode = oscillatorNodeInstance;

    return outputNode;
};