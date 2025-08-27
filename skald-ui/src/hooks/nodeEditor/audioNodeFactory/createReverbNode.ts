import { Node } from 'reactflow';

export const createReverbNode = (context: AudioContext, node: Node): AudioNode => {
    const inputNode = context.createGain();
    const outputNode = context.createGain();
    const convolver = context.createConvolver();
    const wetGain = context.createGain();
    const dryGain = context.createGain();

    const mix = node.data.mix ?? 0.5;
    wetGain.gain.setValueAtTime(mix, context.currentTime);
    dryGain.gain.setValueAtTime(1.0 - mix, context.currentTime);

    const sampleRate = context.sampleRate;
    const length = sampleRate * 2;
    const impulse = context.createBuffer(2, length, sampleRate);
    const impulseL = impulse.getChannelData(0);
    const impulseR = impulse.getChannelData(1);

    for (let i = 0; i < length; i++) {
        const n = (Math.random() * 2 - 1);
        impulseL[i] = n * Math.pow(1 - i / length, 2);
        impulseR[i] = n * Math.pow(1 - i / length, 2);
    }
    convolver.buffer = impulse;

    inputNode.connect(dryGain);
    dryGain.connect(outputNode);
    inputNode.connect(convolver);
    convolver.connect(wetGain);
    wetGain.connect(outputNode);

    const compositeNode = inputNode as any;
    compositeNode.output = outputNode;
    compositeNode.internalNodes = { convolver: convolver, wet: wetGain, dry: dryGain };
    return compositeNode;
};
