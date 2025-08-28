import { Node } from 'reactflow';

export const createLfoNode = (context: AudioContext, node: Node): AudioNode => {
    const lfo = context.createOscillator();
    lfo.type = (node.data.waveform || 'sine').toLowerCase() as OscillatorType;
    lfo.frequency.setValueAtTime(node.data.frequency || 5.0, context.currentTime);
    lfo.start();
    const lfoGain = context.createGain();
    lfoGain.gain.setValueAtTime(node.data.amplitude || 1.0, context.currentTime);
    lfo.connect(lfoGain);

    const compositeNode = lfoGain as any;
    compositeNode.internalNodes = { lfo: lfo };

    compositeNode.update = (data: any) => {
        if (data.frequency !== undefined) {
            lfo.frequency.setValueAtTime(data.frequency, context.currentTime);
        }
        const shape = data.shape || data.waveform;
        if (shape) {
            lfo.type = shape.toLowerCase() as OscillatorType;
        }
        const amount = data.amount ?? data.amplitude;
        if (amount !== undefined) {
            lfoGain.gain.setValueAtTime(amount, context.currentTime);
        }
    };

    return compositeNode;
};
