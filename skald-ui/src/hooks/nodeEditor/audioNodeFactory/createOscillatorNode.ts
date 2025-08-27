import { Node } from 'reactflow';

export const createOscillatorNode = (context: AudioContext, node: Node): AudioNode => {
    const osc = context.createOscillator();
    osc.type = (node.data.waveform || 'sawtooth').toLowerCase() as OscillatorType;
    osc.frequency.setValueAtTime(node.data.frequency || 440, context.currentTime);
    osc.start();
    return osc;
};
