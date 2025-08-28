export const createOutputNode = (context: AudioContext): AudioNode => {
    const outputGain = context.createGain();
    outputGain.connect(context.destination);
    return outputGain;
};
