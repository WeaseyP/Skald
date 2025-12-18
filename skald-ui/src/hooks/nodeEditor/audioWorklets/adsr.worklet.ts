export const adsrProcessorString = `
class ADSRProcessor extends AudioWorkletProcessor {
    static get parameterDescriptors() {
        return [
            { name: 'attack', defaultValue: 0.1, minValue: 0.001, maxValue: 10 },
            { name: 'decay', defaultValue: 0.1, minValue: 0.001, maxValue: 10 },
            { name: 'sustain', defaultValue: 0.5, minValue: 0, maxValue: 1 },
            { name: 'release', defaultValue: 0.5, minValue: 0.001, maxValue: 10 },
            { name: 'depth', defaultValue: 1.0, minValue: 0, maxValue: 1 },
            { name: 'loop', defaultValue: 0, minValue: 0, maxValue: 1 },
            { name: 'gate', defaultValue: 0, minValue: 0, maxValue: 1 },
        ];
    }

    constructor() {
        super();
        this.state = 'idle';
        this.value = 0.0;
        this.lastGate = 0;
        this.releaseInitialValue = 0.0;
        this.attackCounter = 0;
        this.decayCounter = 0;
        this.releaseCounter = 0;
        this.debugCounter = 0;
    }

    process(inputs, outputs, parameters) {
        const output = outputs[0][0];
        const gateInput = inputs[0];
        const gateChannel = gateInput.length > 0 ? gateInput[0] : null;
        const gateParam = parameters.gate;

        const attackDuration = Math.max(1, parameters.attack[0] * sampleRate);
        const decayDuration = Math.max(1, parameters.decay[0] * sampleRate);
        const sustainLevel = parameters.sustain[0];
        const releaseDuration = Math.max(1, parameters.release[0] * sampleRate);
        const depth = parameters.depth[0];
        const isLooping = parameters.loop[0] > 0.5;
        
        // Log parameter changes occasionally or on significant events if needed,
        // but for now let's focus on state transitions.

        for (let i = 0; i < output.length; i++) {
            const inputSample = gateChannel ? gateChannel[i] : 0;
            const paramSample = gateParam.length > 1 ? gateParam[i] : gateParam[0];
            const currentGate = Math.max(inputSample, paramSample);

            if (isNaN(currentGate)) { console.error('Gate NaN'); }

            this.debugCounter++;
            if (this.debugCounter % 44100 === 0) {
                 console.log(\`[ADSR Debug] State: \${this.state}, Gate: \${currentGate}, Val: \${this.value}, Sustain: \${sustainLevel}, Out: \${this.value * depth}\`);
            }

            if (currentGate > 0 && this.lastGate <= 0) {
                console.log(\`[ADSR] Gate ON. Val: \${currentGate}. State: \${this.state} -> attack\`);
                this.state = 'attack';
                this.attackCounter = 0;
            }

            if (currentGate <= 0 && this.lastGate > 0) {
                console.log(\`[ADSR] Gate OFF. Val: \${currentGate}. State: \${this.state} -> release\`);
                this.state = 'release';
                this.releaseCounter = 0;
                this.releaseInitialValue = this.value;
            }

            this.lastGate = currentGate;

            const prevState = this.state;

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
                        if (isLooping && currentGate > 0) {
                            console.log(\`[ADSR] Loop triggered. State: \${this.state} -> attack\`);
                            this.state = 'attack';
                            this.attackCounter = 0;
                        } else {
                            this.value = sustainLevel;
                            this.state = 'sustain';
                        }
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

            if (this.state !== prevState) {
                console.log(\`[ADSR] State changed: \${prevState} -> \${this.state}\`);
            }

            output[i] = Math.max(0, this.value * depth);
        }
        return true;
    }
}
registerProcessor('adsr-processor', ADSRProcessor);
`;
