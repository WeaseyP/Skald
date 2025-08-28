import { Node } from 'reactflow';

export const createPannerNode = (context: AudioContext, node: Node): AudioNode => {
    const panner = context.createStereoPanner();
    panner.pan.setValueAtTime(node.data.pan ?? 0, context.currentTime);
    return panner;
};
