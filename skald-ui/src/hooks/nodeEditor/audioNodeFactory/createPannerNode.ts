import { Node } from 'reactflow';

export const createPannerNode = (context: AudioContext, node: Node): AudioNode => {
    const panner = context.createStereoPanner();
    panner.pan.setValueAtTime(Math.min(Math.max(node.data.pan ?? 0, -1), 1), context.currentTime);

    // Live updates: without a _skaldNode wrapper the pan value was frozen
    // at node-creation time — dragging the pan slider did nothing until a
    // full engine rebuild, while codegen honored it.
    (panner as any)._skaldNode = {
        skaldType: 'PannerNode',
        update(data: any): void {
            if (data.pan !== undefined) {
                panner.pan.setValueAtTime(Math.min(Math.max(data.pan, -1), 1), context.currentTime);
            }
        },
    };

    return panner;
};
