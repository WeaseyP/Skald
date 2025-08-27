import { Node } from 'reactflow';

export const createDelayNode = (context: AudioContext, node: Node): AudioNode => {
    const inputNode = context.createGain();
    const outputNode = context.createGain();
    const delayNode = context.createDelay(5.0);
    const feedbackNode = context.createGain();
    const wetGain = context.createGain();
    const dryGain = context.createGain();

    const { delayTime = 0.5, feedback = 0.5, mix = 0.5 } = node.data;

    delayNode.delayTime.setValueAtTime(delayTime, context.currentTime);
    feedbackNode.gain.setValueAtTime(feedback, context.currentTime);
    wetGain.gain.setValueAtTime(mix, context.currentTime);
    dryGain.gain.setValueAtTime(1.0 - mix, context.currentTime);

    inputNode.connect(dryGain);
    dryGain.connect(outputNode);
    inputNode.connect(delayNode);
    delayNode.connect(feedbackNode);
    feedbackNode.connect(delayNode);
    delayNode.connect(wetGain);
    wetGain.connect(outputNode);

    const compositeNode = inputNode as any;
    compositeNode.output = outputNode;
    compositeNode.internalNodes = { delay: delayNode, feedback: feedbackNode, wet: wetGain, dry: dryGain };
    return compositeNode;
};
