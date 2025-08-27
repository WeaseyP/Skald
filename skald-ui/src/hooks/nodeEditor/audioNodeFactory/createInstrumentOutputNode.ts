export const createInstrumentOutputNode = (context: AudioContext): AudioNode => {
     const outputGain = context.createGain();
     return outputGain;
};
