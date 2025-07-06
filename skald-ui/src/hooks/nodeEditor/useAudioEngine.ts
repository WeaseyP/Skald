/*
================================================================================
| FILE: skald-ui/src/hooks/nodeEditor/useAudioEngine.ts                        |
|                                                                              |
| This hook manages all the Web Audio API logic, including creating the audio  |
| context, building the audio graph from nodes/edges, and starting/stopping it.|
================================================================================
*/
import { useState, useRef, useCallback } from 'react';
import { Node, Edge } from 'reactflow';

const sampleHoldProcessorString = `
class SampleHoldProcessor extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [{ name: 'rate', defaultValue: 10.0, minValue: 0 }];
  }

  constructor() {
    super();
    this.updateInterval = 1 / 10.0 * sampleRate;
    this.value = Math.random() * 2 - 1;
    this.counter = 0;
  }

  process(inputs, outputs, parameters) {
    const output = outputs[0];
    const rate = parameters.rate[0];
    this.updateInterval = 1 / rate * sampleRate;

    for (let channel = 0; channel < output.length; ++channel) {
      const outputChannel = output[channel];
      for (let i = 0; i < outputChannel.length; ++i) {
        if (this.counter >= this.updateInterval) {
            this.value = Math.random() * 2 - 1;
            this.counter = 0;
        }
        outputChannel[i] = this.value;
        this.counter++;
      }
    }
    return true;
  }
}

registerProcessor('sample-hold-processor', SampleHoldProcessor);
`;

export const useAudioEngine = (nodes: Node[], edges: Edge[]) => {
    const [isPlaying, setIsPlaying] = useState(false);
    const audioContext = useRef<AudioContext | null>(null);
    const audioNodes = useRef<Map<string, AudioNode>>(new Map());
    const complexAudioNodes = useRef<Map<string, {input: AudioNode, output: AudioNode}>>(new Map());
    const mixerInputNodes = useRef<Map<string, AudioNode[]>>(new Map());

    const handlePlay = useCallback(async () => {
        if (isPlaying) return;

        const context = new AudioContext();
        audioContext.current = context;
        const allAudioNodes = new Map<string, AudioNode>();
        audioNodes.current = allAudioNodes;
        complexAudioNodes.current.clear();
        mixerInputNodes.current.clear();

        try {
            const workletBlob = new Blob([sampleHoldProcessorString], { type: 'application/javascript' });
            const workletURL = URL.createObjectURL(workletBlob);
            await context.audioWorklet.addModule(workletURL);
        } catch (e) {
            console.error('Error loading AudioWorklet:', e);
            audioContext.current = null;
            return;
        }

        const sampleRate = context.sampleRate;
        const bufferSize = sampleRate * 2;

        const createNodesRecursive = (graphNodes: Node[], parentIdPrefix: string = '') => {
            graphNodes.forEach(node => {
                const globalId = parentIdPrefix + node.id;
                let audioNode: AudioNode | null = null;
                switch (node.type) {
                    case 'fmOperator':
                        const carrier = context.createOscillator();
                        carrier.frequency.setValueAtTime(node.data.frequency || 440, context.currentTime);
                        carrier.start();
                        const modulationGain = context.createGain();
                        modulationGain.gain.setValueAtTime(node.data.modIndex || 100, context.currentTime);
                        modulationGain.connect(carrier.frequency);
                        const fmInput = context.createGain();
                        fmInput.connect(modulationGain);
                        complexAudioNodes.current.set(globalId, { input: fmInput, output: carrier });
                        audioNode = carrier;
                        break;
                    case 'wavetable':
                        const wtOsc = context.createOscillator();
                        const periodicWave = context.createPeriodicWave(new Float32Array([0, 1]), new Float32Array([0, 0]));
                        wtOsc.setPeriodicWave(periodicWave);
                        wtOsc.frequency.setValueAtTime(440, context.currentTime);
                        wtOsc.start();
                        audioNode = wtOsc;
                        break;
                    case 'sampleHold':
                        const shWorkletNode = new AudioWorkletNode(context, 'sample-hold-processor');
                        shWorkletNode.parameters.get('rate')?.setValueAtTime(node.data.rate || 10.0, context.currentTime);
                        const shGain = context.createGain();
                        shGain.gain.setValueAtTime(node.data.amplitude || 1.0, context.currentTime);
                        shWorkletNode.connect(shGain);
                        audioNode = shGain;
                        break;
                    case 'lfo':
                        const lfo = context.createOscillator();
                        lfo.type = (node.data.waveform || 'sine').toLowerCase() as OscillatorType;
                        lfo.frequency.setValueAtTime(node.data.frequency || 5.0, context.currentTime);
                        lfo.start();
                        const lfoGain = context.createGain();
                        lfoGain.gain.setValueAtTime(node.data.amplitude || 1.0, context.currentTime);
                        lfo.connect(lfoGain);
                        audioNode = lfoGain;
                        break;
                    case 'oscillator':
                        const osc = context.createOscillator();
                        osc.type = (node.data.waveform || 'sawtooth').toLowerCase() as OscillatorType;
                        osc.frequency.setValueAtTime(node.data.frequency || 440, context.currentTime);
                        osc.start();
                        audioNode = osc;
                        break;
                    case 'filter':
                        const filter = context.createBiquadFilter();
                        filter.type = (node.data.type || 'lowpass').toLowerCase() as BiquadFilterType;
                        filter.frequency.setValueAtTime(node.data.cutoff || 800, context.currentTime);
                        filter.Q.setValueAtTime(node.data.resonance || 1.0, context.currentTime);
                        audioNode = filter;
                        break;
                    case 'noise':
                        const buffer = context.createBuffer(1, bufferSize, sampleRate);
                        const data = buffer.getChannelData(0);
                        for (let i = 0; i < bufferSize; i++) {
                            data[i] = Math.random() * 2 - 1;
                        }
                        const noiseSource = context.createBufferSource();
                        noiseSource.buffer = buffer;
                        noiseSource.loop = true;
                        noiseSource.start();
                        audioNode = noiseSource;
                        break;
                    case 'adsr':
                        const gainNode = context.createGain();
                        const { attack = 0.1, decay = 0.2, sustain = 0.5, release = 1.0 } = node.data;
                        const now = context.currentTime;
                        gainNode.gain.setValueAtTime(0, now);
                        gainNode.gain.linearRampToValueAtTime(1, now + attack);
                        gainNode.gain.linearRampToValueAtTime(sustain, now + attack + decay);
                        gainNode.gain.setValueAtTime(sustain, now + attack + decay + 1.0);
                        gainNode.gain.linearRampToValueAtTime(0, now + attack + decay + 1.0 + release);
                        audioNode = gainNode;
                        break;
                    case 'delay':
                        const delay = context.createDelay(5.0);
                        delay.delayTime.setValueAtTime(node.data.delayTime || 0.5, context.currentTime);
                        const feedback = context.createGain();
                        feedback.gain.setValueAtTime(node.data.feedback || 0.5, context.currentTime);
                        const mix = context.createGain();
                        mix.gain.setValueAtTime(node.data.mix || 0.5, context.currentTime);
                        const dry = context.createGain();
                        dry.gain.setValueAtTime(1.0 - (node.data.mix || 0.5), context.currentTime);
                        const output = context.createGain();
                        delay.connect(feedback);
                        feedback.connect(delay);
                        delay.connect(mix);
                        mix.connect(output);
                        dry.connect(output);
                        const delayInput = context.createGain();
                        delayInput.connect(dry);
                        delayInput.connect(delay);
                        complexAudioNodes.current.set(globalId, { input: delayInput, output: output });
                        audioNode = delayInput;
                        break;
                    case 'reverb':
                        const convolver = context.createConvolver();
                        const reverbWet = context.createGain();
                        reverbWet.gain.setValueAtTime(node.data.mix || 0.5, context.currentTime);
                        const reverbOutput = context.createGain();
                        const reverbInput = context.createGain();
                        const decayTime = node.data.decay || 3.0;
                        const impulseLength = context.sampleRate * decayTime;
                        const impulse = context.createBuffer(2, impulseLength, context.sampleRate);
                        const impulseL = impulse.getChannelData(0);
                        const impulseR = impulse.getChannelData(1);
                        for (let i = 0; i < impulseLength; i++) {
                            impulseL[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / impulseLength, 2);
                            impulseR[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / impulseLength, 2);
                        }
                        convolver.buffer = impulse;
                        reverbInput.connect(reverbOutput);
                        reverbInput.connect(convolver);
                        convolver.connect(reverbWet);
                        reverbWet.connect(reverbOutput);
                        complexAudioNodes.current.set(globalId, { input: reverbInput, output: reverbOutput });
                        audioNode = reverbInput;
                        break;
                    case 'distortion':
                         const drive = context.createGain();
                        drive.gain.setValueAtTime(node.data.drive || 20, context.currentTime);
                        const waveshaper = context.createWaveShaper();
                        const k = node.data.drive || 20;
                        const n_samples = 44100;
                        const curve = new Float32Array(n_samples);
                        const deg = Math.PI / 180;
                        for (let i = 0; i < n_samples; ++i) {
                            const x = i * 2 / n_samples - 1;
                            curve[i] = (3 + k) * x * 20 * deg / (Math.PI + k * Math.abs(x));
                        }
                        waveshaper.curve = curve;
                        waveshaper.oversample = '4x';
                        const distOutput = context.createGain();
                        drive.connect(waveshaper);
                        waveshaper.connect(distOutput);
                        audioNode = drive; // Input is the drive node
                        complexAudioNodes.current.set(globalId, { input: drive, output: distOutput });
                        break;
                    case 'mixer':
                        const mixerOutput = context.createGain();
                        const inputs = [];
                        for (let i = 1; i <= (node.data.inputCount || 4); i++) {
                            const inputGain = context.createGain();
                            inputGain.gain.setValueAtTime(node.data[`level${i}`] || 0.75, context.currentTime);
                            inputGain.connect(mixerOutput);
                            inputs.push(inputGain);
                        }
                        mixerInputNodes.current.set(globalId, inputs);
                        audioNode = mixerOutput;
                        break;
                    case 'panner':
                        const panner = context.createStereoPanner();
                        panner.pan.setValueAtTime(node.data.pan || 0, context.currentTime);
                        audioNode = panner;
                        break;
                    case 'output':
                        audioNode = context.destination;
                        break;
                    case 'InstrumentInput':
                    case 'InstrumentOutput':
                        audioNode = context.createGain();
                        break;
                    case 'group':
                    case 'instrument':
                        if (node.data.subgraph && node.data.subgraph.nodes) {
                            createNodesRecursive(node.data.subgraph.nodes, `${globalId}-`);
                        }
                        break;
                }
                if (audioNode) {
                    allAudioNodes.set(globalId, audioNode);
                }
            });
        };

        const connectNodesRecursive = (graphEdges: Edge[], parentIdPrefix: string = '') => {
            graphEdges.forEach(edge => {
                const sourceId = parentIdPrefix + edge.source;
                const targetId = parentIdPrefix + edge.target;
                const sourceAudioNode = complexAudioNodes.current.get(sourceId)?.output ?? allAudioNodes.get(sourceId);
                let targetAudioNodeOrParam: AudioNode | AudioParam | undefined = complexAudioNodes.current.get(targetId)?.input ?? allAudioNodes.get(targetId);
                
                if (mixerInputNodes.current.has(targetId) && edge.targetHandle) {
                    const inputIndex = parseInt(edge.targetHandle.replace('input_', ''), 10) - 1;
                    const mixerInputs = mixerInputNodes.current.get(targetId);
                    if (mixerInputs && mixerInputs[inputIndex]) {
                        targetAudioNodeOrParam = mixerInputs[inputIndex];
                    }
                } else if (targetAudioNodeOrParam && edge.targetHandle && edge.targetHandle !== 'input') {
                    if (targetAudioNodeOrParam[edge.targetHandle] instanceof AudioParam) {
                        targetAudioNodeOrParam = targetAudioNodeOrParam[edge.targetHandle];
                    }
                }

                if (sourceAudioNode && targetAudioNodeOrParam) {
                    try {
                        sourceAudioNode.connect(targetAudioNodeOrParam as any);
                    } catch(e) {
                        console.error(`Failed to connect ${sourceId} to ${targetId}`, e);
                    }
                }
            });
        };
        
        createNodesRecursive(nodes);
        connectNodesRecursive(edges);
        nodes.forEach(node => {
            if ((node.type === 'instrument' || node.type === 'group') && node.data.subgraph) {
                connectNodesRecursive(node.data.subgraph.connections, `${node.id}-`);
            }
        });

        setIsPlaying(true);
    }, [nodes, edges, isPlaying]);

    const handleStop = useCallback(() => {
        if (!isPlaying || !audioContext.current) return;
        
        audioContext.current.close().then(() => {
            setIsPlaying(false);
            audioContext.current = null;
            audioNodes.current.clear();
            complexAudioNodes.current.clear();
            mixerInputNodes.current.clear();
        });
    }, [isPlaying]);

    return { isPlaying, handlePlay, handleStop };
};
