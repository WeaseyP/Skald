export const sampleHoldProcessorString = `
class SampleHoldProcessor extends AudioWorkletProcessor {
    static get parameterDescriptors() {
        return [
            { name: 'rate', defaultValue: 10.0, minValue: 0.1, maxValue: 100 },
            { name: 'amplitude', defaultValue: 1.0, minValue: 0, maxValue: 1.0 },
        ];
    }

    constructor() {
        super();
        this._lastTrigger = 0;
        this._heldValue = 0;
        this._sampleCounter = 0;
        
        // Internal clock state
        this._phase = 0;
    }

    process(inputs, outputs, parameters) {
        const output = outputs[0][0];
        const signalInput = inputs[0].length > 0 ? inputs[0][0] : null;
        const triggerInput = inputs[1] && inputs[1].length > 0 ? inputs[1][0] : null;

        const rateParam = parameters.rate;
        const amplitudeParam = parameters.amplitude;
        
        for (let i = 0; i < output.length; i++) {
            const rate = rateParam.length > 1 ? rateParam[i] : rateParam[0];
            const amplitude = amplitudeParam.length > 1 ? amplitudeParam[i] : amplitudeParam[0];
            const freq = rate / sampleRate;

            let trigger = 0;

            // --- Determine Trigger ---
            if (triggerInput) {
                // Use external trigger if available
                trigger = triggerInput[i];
            } else {
                // Use internal clock if no external trigger
                this._phase += freq;
                if (this._phase >= 1.0) {
                    this._phase -= 1.0;
                    trigger = 1.0; // Generate a one-sample trigger pulse
                }
            }

            // --- Sample on Rising Edge ---
            if (trigger > 0 && this._lastTrigger <= 0) {
                if (signalInput) {
                    // Sample the input signal if connected
                    this._heldValue = signalInput[i];
                } else {
                    // Sample internal white noise if no signal is connected
                    this._heldValue = Math.random() * 2 - 1;
                }
            }
            this._lastTrigger = trigger;

            output[i] = this._heldValue * amplitude;

            this._sampleCounter++;
            if (this._sampleCounter >= 2000) {
                console.log('[Skald Debug][SampleHold] Held: ' + this._heldValue.toFixed(4) + ', Trigger: ' + (trigger > 0 ? 'High' : 'Low'));
                this._sampleCounter = 0;
            }
        }

        return true;
    }
}
registerProcessor('sample-hold-processor', SampleHoldProcessor);
`;
