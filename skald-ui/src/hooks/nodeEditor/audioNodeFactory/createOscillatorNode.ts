import { Node } from 'reactflow';
import { BaseSkaldNode } from './BaseSkaldNode';

class OscillatorNode extends BaseSkaldNode {
    public output: GainNode;
    private osc: AudioWorkletNode;
    private context: AudioContext;
    private timeConstant = 0.02;
    private currentWaveform: string;

    constructor(context: AudioContext, data: any) {
        super();
        this.context = context;
        this.currentWaveform = (data.waveform || 'sawtooth').toLowerCase();

        this.output = context.createGain();
        this.osc = new AudioWorkletNode(context, 'oscillator-processor', {
            processorOptions: {
                waveform: this.currentWaveform
            }
        });

        this.osc.connect(this.output);
        this.update(data);
    }

    update(data: any, options?: { bpm?: number }): void {
        const now = this.context.currentTime;

        if (data.frequency) {
            this.osc.parameters.get('frequency')?.setTargetAtTime(data.frequency, now, this.timeConstant);
        }
        if (data.pulseWidth) {
            this.osc.parameters.get('pulseWidth')?.setTargetAtTime(data.pulseWidth, now, this.timeConstant);
        }
        if (data.phase) {
            this.osc.parameters.get('phase')?.setTargetAtTime(data.phase, now, this.timeConstant);
        }
        if (data.amplitude !== undefined) {
            this.output.gain.setTargetAtTime(data.amplitude, now, this.timeConstant);
        }
        
        if (data.waveform && data.waveform.toLowerCase() !== this.currentWaveform) {
            this.currentWaveform = data.waveform.toLowerCase();
            this.osc.port.postMessage({ waveform: this.currentWaveform });
        }
    }
    
    connectInput(sourceNode: AudioNode, targetHandle: string | null): void {
        switch (targetHandle) {
            case 'gain':
                sourceNode.connect(this.output.gain);
                break;
            case 'frequency':
                const freqParam = this.osc.parameters.get('frequency');
                if (freqParam) {
                    sourceNode.connect(freqParam);
                }
                break;
            default:
                // Default connection to the main output gain node, though this is less common for oscillators
                sourceNode.connect(this.output);
                break;
        }
    }

    disconnectInput(sourceNode: AudioNode, targetHandle: string | null): void {
        try {
            switch (targetHandle) {
                case 'gain':
                    sourceNode.disconnect(this.output.gain);
                    break;
                case 'frequency':
                    const freqParam = this.osc.parameters.get('frequency');
                    if (freqParam) {
                        sourceNode.disconnect(freqParam);
                    }
                    break;
                default:
                    sourceNode.disconnect(this.output);
                    break;
            }
        } catch (e) {
            // Disconnecting a non-connected node throws an error. We can safely ignore it.
        }
    }
}

export const createOscillatorNode = (context: AudioContext, node: Node): AudioNode => {
    const oscillatorNodeInstance = new OscillatorNode(context, node.data);
    
    const outputNode = oscillatorNodeInstance.output as any;
    outputNode._skaldNode = oscillatorNodeInstance;

    return outputNode;
};
