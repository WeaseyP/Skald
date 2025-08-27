import { Node } from 'reactflow';

export const createFmOperatorNode = (context: AudioContext, node: Node): AudioNode => {
    const carrier = context.createOscillator();
    carrier.frequency.setValueAtTime(node.data.frequency ?? 440, context.currentTime);
    const modulator = context.createOscillator();
    modulator.frequency.setValueAtTime(node.data.modulatorFrequency ?? 440, context.currentTime);
    const modulationIndex = context.createGain();
    modulationIndex.gain.setValueAtTime(node.data.modulationIndex ?? 100, context.currentTime);

    modulator.connect(modulationIndex);
    modulationIndex.connect(carrier.frequency);

    const outputGain = context.createGain();
    carrier.connect(outputGain);
    
    carrier.start();
    modulator.start();

    const compositeNode = outputGain as any;
    compositeNode.internalNodes = { carrier, modulator, modulationIndex };
    return compositeNode;
};
