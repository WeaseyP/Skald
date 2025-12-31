import { Node } from 'reactflow';
import { BaseSkaldNode } from './BaseSkaldNode';

class GainNodeWrapper extends BaseSkaldNode {
    public node: GainNode;
    private context: AudioContext;

    constructor(context: AudioContext, data: any) {
        super();
        this.context = context;
        this.node = context.createGain();
        // Default gain is usually 1.0 for VCA usage, user modulates it down/up
        // If it's a VCA controlled by ADSR, we might want it to start at 0?
        // But standard Gain node defaults to 1. If ADSR connects to .gain, it modulates.
        // If it's audio path VCA, usually standard Gain is fine.
        const gainVal = data.gain !== undefined ? data.gain : 1.0;
        this.node.gain.setValueAtTime(gainVal, context.currentTime);
    }

    update(data: any): void {
        if (data.gain !== undefined) {
            this.node.gain.setValueAtTime(data.gain, this.context.currentTime);
        }
    }
}

export const createGainNode = (context: AudioContext, node: Node): AudioNode => {
    const gainNodeInstance = new GainNodeWrapper(context, node.data);
    const audioNode = gainNodeInstance.node as any;
    audioNode._skaldNode = gainNodeInstance;
    return audioNode;
};
