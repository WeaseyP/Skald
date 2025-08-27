import { Node, Edge, Connection } from 'reactflow';
import { Instrument } from './instrument';
import type { AdsrDataMap } from './types';

const noteDivisionMap: { [key: string]: number } = {
    '1': 4,    // Whole Note
    '2': 2,    // Half Note
    '4': 1,    // Quarter Note
    '8': 0.5,  // 8th Note
    '16': 0.25, // 16th Note
    '32': 0.125,// 32nd Note
};

export const convertBpmToSeconds = (bpm: number, division: string): number => {
    if (bpm === 0) return 0;
    const quarterNoteTime = 60 / bpm;
    
    let timeMultiplier = 1;
    let noteValue = division;

    if (noteValue.endsWith('t')) { // Triplet
        timeMultiplier = 2 / 3;
        noteValue = noteValue.slice(0, -1);
    } else if (noteValue.endsWith('d')) { // Dotted
        timeMultiplier = 1.5;
        noteValue = noteValue.slice(0, -1);
    }
    
    const baseNoteKey = noteValue.startsWith('1/') ? noteValue.substring(2) : noteValue;
    const beatMultiplier = noteDivisionMap[baseNoteKey];

    if (beatMultiplier === undefined) {
        console.warn(`Unknown note division: ${division}, falling back to 1/4.`);
        return quarterNoteTime;
    }

    return quarterNoteTime * beatMultiplier * timeMultiplier;
};

export const createAudioNode = (context: AudioContext, node: Node, adsrDataMap: AdsrDataMap): AudioNode | null => {
    let audioNode: AudioNode | null = null;
    switch (node.type) {
        case 'adsr': {
            const gainNode = context.createGain();
            gainNode.gain.setValueAtTime(0, context.currentTime);
            adsrDataMap.set(node.id, { gainNode, data: node.data });
            audioNode = gainNode;
            break;
        }
        case 'oscillator': {
            const osc = context.createOscillator();
            osc.type = (node.data.waveform || 'sawtooth').toLowerCase() as OscillatorType;
            osc.frequency.setValueAtTime(node.data.frequency || 440, context.currentTime);
            osc.start();
            audioNode = osc;
            break;
        }
        case 'noise': {
            const buffer = context.createBuffer(1, context.sampleRate * 2, context.sampleRate);
            const data = buffer.getChannelData(0);
            for (let i = 0; i < data.length; i++) { data[i] = Math.random() * 2 - 1; }
            const noiseSource = context.createBufferSource();
            noiseSource.buffer = buffer;
            noiseSource.loop = true;
            noiseSource.start();
            audioNode = noiseSource;
            break;
        }
        case 'sample-hold': {
            const shNode = new AudioWorkletNode(context, 'sample-hold-processor');
            shNode.parameters.get('rate')?.setValueAtTime(node.data.rate ?? 10.0, context.currentTime);
            audioNode = shNode;
            break;
        }
        case 'wavetable': {
            const wtNode = new AudioWorkletNode(context, 'wavetable-processor');
            wtNode.parameters.get('frequency')?.setValueAtTime(node.data.frequency || 440, context.currentTime);
            wtNode.parameters.get('position')?.setValueAtTime(node.data.position || 0, context.currentTime);
            audioNode = wtNode;
            break;
        }
        case 'filter': {
            const filter = context.createBiquadFilter();
            filter.type = (node.data.type || 'lowpass').toLowerCase() as BiquadFilterType;
            filter.frequency.setValueAtTime(node.data.cutoff || 800, context.currentTime);
            filter.Q.setValueAtTime(node.data.resonance || 1.0, context.currentTime);
            audioNode = filter;
            break;
        }
        case 'lfo': {
            const lfo = context.createOscillator();
            lfo.type = (node.data.waveform || 'sine').toLowerCase() as OscillatorType;
            lfo.frequency.setValueAtTime(node.data.frequency || 5.0, context.currentTime);
            lfo.start();
            const lfoGain = context.createGain();
            lfoGain.gain.setValueAtTime(node.data.amplitude || 1.0, context.currentTime);
            lfo.connect(lfoGain);

            const compositeNode = lfoGain as any;
            compositeNode.internalNodes = { lfo: lfo };
            audioNode = compositeNode;
            break;
        }
        case 'delay': {
            const inputNode = context.createGain();
            const outputNode = context.createGain();
            const delayNode = context.createDelay(5.0);
            const feedbackNode = context.createGain();
            const wetGain = context.createGain();
            const dryGain = context.createGain();

            const { delayTime = 0.5, feedback = 0.5, mix = 0.5 } = node.data;

            delayNode.delayTime.setValueAtTime(delayTime, context.currentTime);
            feedbackNode.gain.setValueAtTime(feedback, context.currentTime);
            wetGain.gain.setValueAtTime(mix, context.currentTime);
            dryGain.gain.setValueAtTime(1.0 - mix, context.currentTime);

            inputNode.connect(dryGain);
            dryGain.connect(outputNode);
            inputNode.connect(delayNode);
            delayNode.connect(feedbackNode);
            feedbackNode.connect(delayNode);
            delayNode.connect(wetGain);
            wetGain.connect(outputNode);

            const compositeNode = inputNode as any;
            compositeNode.output = outputNode;
            compositeNode.internalNodes = { delay: delayNode, feedback: feedbackNode, wet: wetGain, dry: dryGain };
            audioNode = compositeNode;
            break;
        }
        case 'fmOperator': {
            const carrier = context.createOscillator();
            carrier.frequency.setValueAtTime(node.data.frequency ?? 440, context.currentTime);
            const modulator = context.createOscillator();
            modulator.frequency.setValueAtTime(node.data.modulatorFrequency ?? 440, context.currentTime);
            const modulationIndex = context.createGain();
            modulationIndex.gain.setValueAtTime(node.data.modulationIndex ?? 100, context.currentTime);

            modulator.connect(modulationIndex);
            modulationIndex.connect(carrier.frequency);

            const outputGain = context.createGain();
            carrier.connect(outputGain);
            
            carrier.start();
            modulator.start();

            const compositeNode = outputGain as any;
            compositeNode.internalNodes = { carrier, modulator, modulationIndex };
            audioNode = compositeNode;
            break;
        }
        case 'distortion': {
            const shaper = context.createWaveShaper();
            const drive = node.data.drive ?? 1;
            const curve = new Float32Array(256);
            for (let i = 0; i < 256; i++) {
                const x = i * 2 / 256 - 1;
                curve[i] = (Math.PI + drive) * x / (Math.PI + drive * Math.abs(x));
            }
            shaper.curve = curve;
            audioNode = shaper;
            break;
        }
        case 'panner': {
            const panner = context.createStereoPanner();
            panner.pan.setValueAtTime(node.data.pan ?? 0, context.currentTime);
            audioNode = panner;
            break;
        }
        case 'reverb': {
            const inputNode = context.createGain();
            const outputNode = context.createGain();
            const convolver = context.createConvolver();
            const wetGain = context.createGain();
            const dryGain = context.createGain();

            const mix = node.data.mix ?? 0.5;
            wetGain.gain.setValueAtTime(mix, context.currentTime);
            dryGain.gain.setValueAtTime(1.0 - mix, context.currentTime);

            const sampleRate = context.sampleRate;
            const length = sampleRate * 2;
            const impulse = context.createBuffer(2, length, sampleRate);
            const impulseL = impulse.getChannelData(0);
            const impulseR = impulse.getChannelData(1);

            for (let i = 0; i < length; i++) {
                const n = (Math.random() * 2 - 1);
                impulseL[i] = n * Math.pow(1 - i / length, 2);
                impulseR[i] = n * Math.pow(1 - i / length, 2);
            }
            convolver.buffer = impulse;

            inputNode.connect(dryGain);
            dryGain.connect(outputNode);
            inputNode.connect(convolver);
            convolver.connect(wetGain);
            wetGain.connect(outputNode);

            const compositeNode = inputNode as any;
            compositeNode.output = outputNode;
            compositeNode.internalNodes = { convolver: convolver, wet: wetGain, dry: dryGain };
            audioNode = compositeNode;
            break;
        }
        case 'mixer': {
            const outputNode = context.createGain();
            outputNode.gain.setValueAtTime(node.data.gain ?? 1.0, context.currentTime);
            const compositeNode = outputNode as any;
            compositeNode.inputGains = new Map<string, GainNode>();
            audioNode = compositeNode;
            break;
        }
        case 'output': {
            const outputGain = context.createGain();
            outputGain.connect(context.destination);
            audioNode = outputGain;
            break;
        }
        case 'InstrumentInput': {
             const inputGain = context.createGain();
             audioNode = inputGain;
             break;
        }
         case 'InstrumentOutput': {
             const outputGain = context.createGain();
             audioNode = outputGain;
             break;
        }
        default:
            audioNode = context.createGain();
            break;
    }
    return audioNode;
}


export const connectNodes = (sourceNode: AudioNode, targetNode: any, edge: Edge | Connection) => {
    try {
        if (targetNode.hasOwnProperty('inputGains') && edge.targetHandle && edge.targetHandle.startsWith('input_')) {
            const context = targetNode.context as AudioContext;
            let inputGain = targetNode.inputGains.get(edge.targetHandle);
            if (!inputGain) {
                inputGain = context.createGain();
                inputGain.connect(targetNode);
                targetNode.inputGains.set(edge.targetHandle, inputGain);
            }
            sourceNode.connect(inputGain);
        } else if (targetNode instanceof AudioWorkletNode && edge.targetHandle?.startsWith('input_')) {
            const paramName = edge.targetHandle.substring(6);
            const param = targetNode.parameters.get(paramName);
            if (param) sourceNode.connect(param);
        } else if (targetNode[edge.targetHandle as keyof AudioNode] instanceof AudioParam) {
            sourceNode.connect(targetNode[edge.targetHandle as keyof AudioNode]);
        } else {
            sourceNode.connect(targetNode);
        }
    } catch (e) {
        console.error(`Failed to connect ${edge.source} to ${edge.target}`, e);
    }
};

export const disconnectNodes = (sourceNode: AudioNode, targetNode: any, edge: Edge | Connection) => {
    try {
        if (targetNode.hasOwnProperty('inputGains') && edge.targetHandle && edge.targetHandle.startsWith('input_')) {
            const inputGain = targetNode.inputGains.get(edge.targetHandle);
            if (inputGain) sourceNode.disconnect(inputGain);
        } else if (targetNode instanceof AudioWorkletNode && edge.targetHandle?.startsWith('input_')) {
            const paramName = edge.targetHandle.substring(6);
            const param = targetNode.parameters.get(paramName);
            if (param) sourceNode.disconnect(param);
        } else if (targetNode[edge.targetHandle as keyof AudioNode] instanceof AudioParam) {
            sourceNode.disconnect(targetNode[edge.targetHandle as keyof AudioNode]);
        } else {
            sourceNode.disconnect(targetNode);
        }
    } catch (e) {
        // Errors are expected here if a node was deleted, so we can ignore them.
    }
};