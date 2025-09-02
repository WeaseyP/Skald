import { Node } from 'reactflow';
import { BaseSkaldNode } from './BaseSkaldNode';

class LfoNode extends BaseSkaldNode {
    public output: GainNode;
    private lfo: OscillatorNode;
    private waveShaper: WaveShaperNode;
    private context: AudioContext;
    private timeConstant = 0.02;
    private unipolarCurve: Float32Array;
    private bipolarCurve: Float32Array;

    constructor(context: AudioContext, data: any) {
        super();
        this.context = context;

        this.lfo = context.createOscillator();
        this.waveShaper = context.createWaveShaper();
        this.output = context.createGain();

        // Create curves for the WaveShaper
        const curveSize = 256;
        this.unipolarCurve = new Float32Array(curveSize);
        this.bipolarCurve = new Float32Array(curveSize);
        for (let i = 0; i < curveSize; i++) {
            const x = (i / (curveSize - 1)) * 2 - 1; // Map i to -1 to 1 range
            this.bipolarCurve[i] = x;
            this.unipolarCurve[i] = (x + 1) / 2; // Map -1..1 to 0..1
        }

        this.lfo.connect(this.waveShaper);
        this.waveShaper.connect(this.output);
        this.lfo.start();
        
        this.update(data, {}); // Initial update
    }

    update(data: any, options?: { bpm?: number }): void {
        const now = this.context.currentTime;

        // --- Frequency Calculation ---
        let lfoFrequency = data.frequency || 5.0;
        if (data.bpmSync && options?.bpm) {
            const rateString = data.syncRate || '1/4';
            try {
                const rateValue = eval(rateString);
                if (typeof rateValue === 'number' && rateValue > 0) {
                     const beatFrequency = options.bpm / 60.0;
                     lfoFrequency = beatFrequency / (4 * rateValue);
                }
            } catch (e) {
                console.error("Could not parse syncRate:", rateString);
            }
        }

        this.lfo.frequency.setTargetAtTime(lfoFrequency, now, this.timeConstant);

        if (data.waveform) {
            this.lfo.type = data.waveform.toLowerCase() as OscillatorType;
        }
        if (data.amplitude !== undefined) {
            this.output.gain.setTargetAtTime(data.amplitude, now, this.timeConstant);
        }
        
        // --- Unipolar/Bipolar Switching ---
        this.waveShaper.curve = data.unipolar ? this.unipolarCurve : this.bipolarCurve;
    }
}

export const createLfoNode = (context: AudioContext, node: Node): AudioNode => {
    const lfoNodeInstance = new LfoNode(context, node.data);
    
    const outputNode = lfoNodeInstance.output as any;
    outputNode._skaldNode = lfoNodeInstance;

    return outputNode;
};
