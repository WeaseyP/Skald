import { Node } from 'reactflow';

export const createOscillatorNode = (context: AudioContext, node: Node): AudioNode => {
    const gainNode = context.createGain();
    gainNode.gain.setValueAtTime(node.data.amplitude ?? 1, context.currentTime);

    const osc = context.createOscillator();
    osc.type = (node.data.waveform || 'sawtooth').toLowerCase() as OscillatorType;
    osc.frequency.setValueAtTime(node.data.frequency || 440, context.currentTime);
    
    osc.connect(gainNode);
    osc.start();

    (gainNode as any).update = (data: any) => {
        if (data.frequency) {
            osc.frequency.setValueAtTime(data.frequency, context.currentTime);
        }
        if (data.waveform) {
            osc.type = data.waveform.toLowerCase() as OscillatorType;
        }
        if (data.amplitude !== undefined) {
            gainNode.gain.setValueAtTime(data.amplitude, context.currentTime);
        }
    };

    return gainNode;
};
