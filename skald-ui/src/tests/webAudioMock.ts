import { vi } from 'vitest';

export class AudioParamMock {
    value: number = 0;
    setValueAtTime = vi.fn();
    linearRampToValueAtTime = vi.fn();
    exponentialRampToValueAtTime = vi.fn();
    setTargetAtTime = vi.fn();
    cancelScheduledValues = vi.fn();
}

export class AudioNodeMock {
    context: BaseAudioContext;
    numberOfInputs: number = 1;
    numberOfOutputs: number = 1;
    channelCount: number = 2;
    channelCountMode: ChannelCountMode = 'max';
    channelInterpretation: ChannelInterpretation = 'speakers';

    constructor(context: BaseAudioContext) {
        this.context = context;
    }

    connect = vi.fn();
    disconnect = vi.fn();
    addEventListener = vi.fn();
    removeEventListener = vi.fn();
    dispatchEvent = vi.fn();
}

export class AudioScheduledSourceNodeMock extends AudioNodeMock {
    start = vi.fn();
    stop = vi.fn();
    onended = null;
}

export class OscillatorNodeMock extends AudioScheduledSourceNodeMock {
    frequency = new AudioParamMock();
    detune = new AudioParamMock();
    type: OscillatorType = 'sine';

    constructor(context: BaseAudioContext) {
        super(context);
        this.frequency.value = 440;
    }
}

export class GainNodeMock extends AudioNodeMock {
    gain = new AudioParamMock();

    constructor(context: BaseAudioContext) {
        super(context);
        this.gain.value = 1;
    }
}

export class DelayNodeMock extends AudioNodeMock {
    delayTime = new AudioParamMock();

    constructor(context: BaseAudioContext) {
        super(context);
        this.delayTime.value = 0;
    }
}

export class ConstantSourceNodeMock extends AudioScheduledSourceNodeMock {
    offset = new AudioParamMock();

    constructor(context: BaseAudioContext) {
        super(context);
        this.offset.value = 1;
    }
}

export class BiquadFilterNodeMock extends AudioNodeMock {
    frequency = new AudioParamMock();
    detune = new AudioParamMock();
    Q = new AudioParamMock();
    gain = new AudioParamMock();
    type: BiquadFilterType = 'lowpass';

    constructor(context: BaseAudioContext) {
        super(context);
        this.frequency.value = 350;
    }
}

export class WaveShaperNodeMock extends AudioNodeMock {
    curve: Float32Array | null = null;
    oversample: OverSampleType = 'none';
}

export class ConvolverNodeMock extends AudioNodeMock {
    buffer: AudioBuffer | null = null;
    normalize: boolean = true;
}

export class AudioWorkletNodeMock extends AudioNodeMock {
    parameters = new Map<string, AudioParamMock>();
    port = {
        postMessage: vi.fn(),
        onmessage: null,
    };

    constructor(context: BaseAudioContext, name: string) {
        super(context);
        // Pre-populate common params
        this.parameters.set('attack', new AudioParamMock());
        this.parameters.set('decay', new AudioParamMock());
        this.parameters.set('sustain', new AudioParamMock());
        this.parameters.set('release', new AudioParamMock());
        this.parameters.set('gate', new AudioParamMock());
        this.parameters.set('frequency', new AudioParamMock());
        this.parameters.set('position', new AudioParamMock());
        this.parameters.set('rate', new AudioParamMock());
        this.parameters.set('depth', new AudioParamMock());
        this.parameters.set('loop', new AudioParamMock());
    }
}

export class AudioContextMock {
    currentTime: number = 0;
    sampleRate: number = 44100;
    state: AudioContextState = 'suspended';

    createGain = vi.fn(() => new GainNodeMock(this as any));
    createOscillator = vi.fn(() => new OscillatorNodeMock(this as any));
    createDelay = vi.fn(() => new DelayNodeMock(this as any));
    createConstantSource = vi.fn(() => new ConstantSourceNodeMock(this as any));
    createBiquadFilter = vi.fn(() => new BiquadFilterNodeMock(this as any));
    createWaveShaper = vi.fn(() => new WaveShaperNodeMock(this as any));
    createConvolver = vi.fn(() => new ConvolverNodeMock(this as any));
    createBufferSource = vi.fn(() => {
        const node = new AudioScheduledSourceNodeMock(this as any);
        (node as any).buffer = null;
        (node as any).loop = false;
        return node;
    });
    createBuffer = vi.fn((numberOfChannels, length, sampleRate) => {
        return {
            sampleRate,
            length,
            duration: length / sampleRate,
            numberOfChannels,
            getChannelData: vi.fn(() => new Float32Array(length)),
        };
    });

    resume = vi.fn().mockResolvedValue(undefined);
    suspend = vi.fn().mockResolvedValue(undefined);
    close = vi.fn().mockResolvedValue(undefined);
}

// Global cleanup for tests
export const setupWebAudioMock = () => {
    global.AudioContext = AudioContextMock as any;
    global.AudioWorkletNode = AudioWorkletNodeMock as any;
    global.OscillatorNode = OscillatorNodeMock as any;
    global.GainNode = GainNodeMock as any;
    global.DelayNode = DelayNodeMock as any;
    global.BiquadFilterNode = BiquadFilterNodeMock as any;
    global.AudioParam = AudioParamMock as any;
    global.AudioNode = AudioNodeMock as any;
    // ... add others if needed
};
