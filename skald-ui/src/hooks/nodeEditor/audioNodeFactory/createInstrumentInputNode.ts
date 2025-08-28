export const createInstrumentInputNode = (context: AudioContext): AudioNode => {
     const inputGain = context.createGain();
     return inputGain;
};
