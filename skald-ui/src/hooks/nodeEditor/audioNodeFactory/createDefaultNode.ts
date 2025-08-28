export const createDefaultNode = (context: AudioContext): AudioNode => {
    return context.createGain();
};
