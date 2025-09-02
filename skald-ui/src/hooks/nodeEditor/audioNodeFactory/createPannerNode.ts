import { Node } from 'reactflow';
import { BaseSkaldNode } from './BaseSkaldNode';

class PannerNode extends BaseSkaldNode {
    public node: StereoPannerNode;
    private context: AudioContext;
    private timeConstant = 0.02;

    constructor(context: AudioContext, data: any) {
        super();
        this.context = context;
        this.node = context.createStereoPanner();
        this.update(data);
    }

    update(data: any): void {
        if (data.pan !== undefined) {
            const now = this.context.currentTime;
            this.node.pan.setTargetAtTime(data.pan, now, this.timeConstant);
        }
    }
}

export const createPannerNode = (context: AudioContext, node: Node): AudioNode => {
    const instance = new PannerNode(context, node.data);
    
    const pannerNode = instance.node as any;
    pannerNode._skaldNode = instance;

    return pannerNode;
};
