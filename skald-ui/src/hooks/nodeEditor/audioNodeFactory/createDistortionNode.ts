import { Node } from 'reactflow';

export const createDistortionNode = (context: AudioContext, node: Node): AudioNode => {
    const shaper = context.createWaveShaper();
    const drive = node.data.drive ?? 1;
    const curve = new Float32Array(256);
    for (let i = 0; i < 256; i++) {
        const x = i * 2 / 256 - 1;
        curve[i] = (Math.PI + drive) * x / (Math.PI + drive * Math.abs(x));
    }
    shaper.curve = curve;
    return shaper;
};
