export const adsrProcessorString = `
class ADSRProcessor extends AudioWorkletProcessor {
    static get parameterDescriptors() {
        return [
            { name: 'attack', defaultValue: 0.1, minValue: 0.001, maxValue: 10 },
            { name: 'decay', defaultValue: 0.1, minValue: 0.001, maxValue: 10 },
            { name: 'sustain', defaultValue: 0.5, minValue: 0, maxValue: 1 },
            { name: 'release', defaultValue: 0.5, minValue: 0.001, maxValue: 10 },
        ];
    }

    constructor() {
        super();
        this.state = 'idle';
        this.value = 0.0;
        this.lastGate = 0;
        this.releaseInitialValue = 0.0;
    }

    process(inputs, outputs, parameters) {
        const output = outputs[0][0];
        const gateInput = inputs[0];
        const gate = gateInput.length > 0 ? gateInput[0] : null;

        const attackDuration = Math.max(1, parameters.attack[0] * sampleRate);
        const decayDuration = Math.max(1, parameters.decay[0] * sampleRate);
        const sustainLevel = parameters.sustain[0];
        const releaseDuration = Math.max(1, parameters.release[0] * sampleRate);
        
        for (let i = 0; i < output.length; i++) {
            const currentGate = gate ? gate[i] : 0;

            if (currentGate > 0 && this.lastGate <= 0) {
                this.state = 'attack';
                this.attackCounter = 0;
            }

            if (currentGate <= 0 && this.lastGate > 0) {
                this.state = 'release';
                this.releaseCounter = 0;
                this.releaseInitialValue = this.value;
            }

            this.lastGate = currentGate;

            switch (this.state) {
                case 'idle':
                    this.value = 0.0;
                    break;
                case 'attack':
                    this.value = (this.attackCounter / attackDuration);
                    if (this.attackCounter >= attackDuration) {
                        this.value = 1.0;
                        this.state = 'decay';
                        this.decayCounter = 0;
                    }
                    this.attackCounter++;
                    break;
                case 'decay':
                    this.value = sustainLevel + (1.0 - sustainLevel) * (1 - (this.decayCounter / decayDuration));
                    if (this.decayCounter >= decayDuration) {
                        this.value = sustainLevel;
                        this.state = 'sustain';
                    }
                    this.decayCounter++;
                    break;
                case 'sustain':
                    this.value = sustainLevel;
                    break;
                case 'release':
                    this.value = this.releaseInitialValue * (1 - (this.releaseCounter / releaseDuration));
                     if (this.releaseCounter >= releaseDuration) {
                        this.value = 0.0;
                        this.state = 'idle';
                    }
                    this.releaseCounter++;
                    break;
            }
            output[i] = Math.max(0, this.value);
        }
        return true;
    }
}
registerProcessor('adsr-processor', ADSRProcessor);
`;
