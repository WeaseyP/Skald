import { Instrument } from './instrument';

export type AdsrDataMap = Map<string, { worklet: AudioWorkletNode }>;
export type AudioNodeMap = Map<string, AudioNode | Instrument>;