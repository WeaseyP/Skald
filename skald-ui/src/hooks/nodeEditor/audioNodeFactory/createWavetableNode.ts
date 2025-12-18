import { Node } from 'reactflow';
import { BaseSkaldNode } from './BaseSkaldNode';

class WavetableNode extends BaseSkaldNode {
    public output: GainNode;
    private worklet: AudioWorkletNode;
    private context: AudioContext;

    constructor(context: AudioContext, data: any) {
        super();
        this.context = context;

        this.output = context.createGain();
        this.worklet = new AudioWorkletNode(context, 'wavetable-processor');

        this.worklet.connect(this.output);

        this.update(data);
    }

    update(data: any): void {
        if (data.frequency !== undefined) {
            this.worklet.parameters.get('frequency')?.setValueAtTime(data.frequency, this.context.currentTime);
        }
        if (data.position !== undefined) {
            this.worklet.parameters.get('position')?.setValueAtTime(data.position, this.context.currentTime);
        }
        if (data.amplitude !== undefined) {
            this.output.gain.setValueAtTime(data.amplitude, this.context.currentTime);
        }
        if (data.table) {
            // The 'table' data is expected to be an array of numbers (Float32Array)
            this.worklet.port.postMessage({ type: 'update-table', table: data.table });
        }
    }
}

export const createWavetableNode = (context: AudioContext, node: Node): AudioNode => {
    const instance = new WavetableNode(context, node.data);

    // This node is a source, so we return the output gain.
    const outputNode = instance.output as any;
    outputNode._skaldNode = instance;

    // Expose Worklet Params for connection
    outputNode.frequency = (instance as any).worklet.parameters.get('frequency');
    outputNode.position = (instance as any).worklet.parameters.get('position');

    return outputNode;
};
