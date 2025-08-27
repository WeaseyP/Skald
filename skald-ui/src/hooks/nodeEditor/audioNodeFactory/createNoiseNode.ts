import { Node } from 'reactflow';

export const createNoiseNode = (context: AudioContext, node: Node): AudioNode => {
    const gainNode = context.createGain();
    gainNode.gain.setValueAtTime(node.data.amplitude ?? 1, context.currentTime);

    const buffer = context.createBuffer(1, context.sampleRate * 2, context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) { data[i] = Math.random() * 2 - 1; }
    
    const noiseSource = context.createBufferSource();
    noiseSource.buffer = buffer;
    noiseSource.loop = true;

    const filter = context.createBiquadFilter();

    const setFilterType = (type: string) => {
        switch (type?.toLowerCase()) {
            case 'pink':
                filter.type = 'lowpass';
                filter.frequency.setValueAtTime(1000, context.currentTime);
                filter.Q.setValueAtTime(1, context.currentTime);
                break;
            case 'brown':
                filter.type = 'lowpass';
                filter.frequency.setValueAtTime(500, context.currentTime);
                filter.Q.setValueAtTime(1, context.currentTime);
                break;
            case 'white':
            default:
                filter.type = 'lowpass';
                filter.frequency.setValueAtTime(context.sampleRate / 2, context.currentTime);
                filter.Q.setValueAtTime(0, context.currentTime);
                break;
        }
    };

    setFilterType(node.data.type || 'white');

    noiseSource.connect(filter);
    filter.connect(gainNode);
    noiseSource.start();

    (gainNode as any).update = (data: any) => {
        if (data.amplitude !== undefined) {
            gainNode.gain.setValueAtTime(data.amplitude, context.currentTime);
        }
        if (data.type) {
            setFilterType(data.type);
        }
    };

    return gainNode;
};
