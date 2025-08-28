import { Node } from 'reactflow';
import { BaseSkaldNode } from './BaseSkaldNode';

class MixerNode extends BaseSkaldNode {
    public output: GainNode;
    private inputGains: Map<string, GainNode>;
    private context: AudioContext;

    constructor(context: AudioContext, data: any) {
        super();
        this.context = context;
        this.output = context.createGain();
        this.output.gain.setValueAtTime(data.gain ?? 1.0, context.currentTime);
        this.inputGains = new Map<string, GainNode>();
        this.update(data);
    }

    public getOrCreateInputGain(handleId: string): GainNode {
        let gainNode = this.inputGains.get(handleId);
        if (gainNode) {
            return gainNode;
        }

        gainNode = this.context.createGain();
        gainNode.connect(this.output);
        this.inputGains.set(handleId, gainNode);
        return gainNode;
    }

    public getInputGain(handleId: string): GainNode | undefined {
        return this.inputGains.get(handleId);
    }

    public removeInputGain(handleId: string): void {
        const gainNode = this.inputGains.get(handleId);
        if (gainNode) {
            gainNode.disconnect();
            this.inputGains.delete(handleId);
        }
    }

    update(data: any): void {
        // Update main output gain
        if (data.gain !== undefined) {
            this.output.gain.setValueAtTime(data.gain, this.context.currentTime);
        }

        // Update individual input gains
        for (const [key, value] of Object.entries(data)) {
            if (key.startsWith('input_') && key.endsWith('_gain')) {
                const handleId = key.replace('_gain', '');
                const gainNode = this.getOrCreateInputGain(handleId);
                gainNode.gain.setValueAtTime(value as number, this.context.currentTime);
            }
        }
    }
}

export const createMixerNode = (context: AudioContext, node: Node): AudioNode => {
    const instance = new MixerNode(context, node.data);
    
    // The mixer does not have a single 'input' node. 
    // We return the output node, and attach the instance to it.
    // Connection logic will be handled specially in useAudioEngine.
    const outputNode = instance.output as any;
    outputNode._skaldNode = instance;

    return outputNode;
};
