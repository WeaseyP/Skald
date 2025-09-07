export const oscillatorProcessorString = `
class OscillatorProcessor extends AudioWorkletProcessor {
    static get parameterDescriptors() {
        return [
            { name: 'frequency', defaultValue: 440, minValue: 20, maxValue: 20000 },
            { name: 'pulseWidth', defaultValue: 0.5, minValue: 0.01, maxValue: 0.99 },
            { name: 'phase', defaultValue: 0, minValue: 0, maxValue: 360 }, // in degrees
        ];
    }

    constructor(options) {
        super();
        this._phase = 0;
        this._waveform = (options?.processorOptions?.waveform || 'sawtooth').toLowerCase(); 
        this._sampleCounter = 0;
        
        this.port.onmessage = (event) => {
            if (event.data.waveform) {
                this._waveform = event.data.waveform.toLowerCase();
            }
        };
    }

    process(inputs, outputs, parameters) {
        const output = outputs[0][0];
        const frequency = parameters.frequency;
        const pulseWidth = parameters.pulseWidth;
        const phaseDegrees = parameters.phase;
        
        const phaseOffset = phaseDegrees[0] / 360.0;

        for (let i = 0; i < output.length; i++) {
            const freq = frequency.length > 1 ? frequency[i] : frequency[0];
            const pw = pulseWidth.length > 1 ? pulseWidth[i] : pulseWidth[0];
            
            const totalPhase = (this._phase + phaseOffset) % 1.0;

            let value = 0;
            switch (this._waveform) {
                case 'sine':
                    value = Math.sin(totalPhase * 2 * Math.PI);
                    break;
                case 'sawtooth':
                    value = 2 * totalPhase - 1;
                    break;
                case 'triangle':
                    value = 1 - 4 * Math.abs(totalPhase - 0.5);
                    break;
                case 'square':
                    value = totalPhase < pw ? 1 : -1;
                    break;
                default:
                    value = 2 * totalPhase - 1;
                    break;
            }
            
            output[i] = value;

            this._phase += freq / sampleRate;
            if (this._phase >= 1.0) {
                this._phase -= 1.0;
            }

            this._sampleCounter++;
            if (this._sampleCounter >= 2000) {
                console.log('[Skald Debug][Oscillator] Waveform: ' + this._waveform + ', Freq: ' + freq.toFixed(2) + ', Phase: ' + this._phase.toFixed(4));
                this._sampleCounter = 0;
            }
        }

        return true;
    }
}
registerProcessor('oscillator-processor', OscillatorProcessor);
`;
