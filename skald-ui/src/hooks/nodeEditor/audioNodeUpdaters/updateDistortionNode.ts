import type { AdsrDataMap } from '../types';

export const updateDistortionNode = (liveNode: AudioNode, data: any, _context: AudioContext, _bpm: number, _adsrData: AdsrDataMap, _nodeId: string) => {
    if (liveNode instanceof WaveShaperNode) {
        if (data.drive !== undefined) {
            const curve = new Float32Array(256);
            const drive = data.drive;
            for (let i = 0; i < 256; i++) {
                const x = i * 2 / 256 - 1;
                curve[i] = (Math.PI + drive) * x / (Math.PI + drive * Math.abs(x));
            }
            liveNode.curve = curve;
        }
    }
};
