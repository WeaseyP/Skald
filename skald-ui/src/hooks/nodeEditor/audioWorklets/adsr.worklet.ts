export const adsrProcessorString = `
// Exponential ADSR Processor
// Features:
// - Exponential curves for attack, decay, and release for a more natural sound.
// - Velocity sensitivity to control how note velocity affects the envelope's output level.
// - Depth control to scale the overall output of the envelope.
class ADSRProcessor extends AudioWorkletProcessor {
    static get parameterDescriptors() {
        return [
            { name: 'attack', defaultValue: 0.1, minValue: 0.001, maxValue: 10 },
            { name: 'decay', defaultValue: 0.1, minValue: 0.001, maxValue: 10 },
            { name: 'sustain', defaultValue: 0.5, minValue: 0, maxValue: 1 },
            { name: 'release', defaultValue: 0.5, minValue: 0.001, maxValue: 10 },
            { name: 'depth', defaultValue: 1.0, minValue: 0, maxValue: 1 },
            { name: 'velocitySensitivity', defaultValue: 0.5, minValue: 0, maxValue: 1 },
        ];
    }

    constructor() {
        super();
        this._state = 'idle';
        this._value = 0.0;
        this._lastGate = 0;
        this._velocity = 0;

        // Coefficients for exponential curves. Calculated once per parameter change.
        this._attackCoeff = 0;
        this._decayCoeff = 0;
        this._releaseCoeff = 0;
        this._sustainLevel = 0;

        this._lastAttack = -1;
        this._lastDecay = -1;
        this._lastRelease = -1;
        this._lastSustain = -1;
    }
    
    // Calculate the coefficient for the exponential curve based on time.
    // This mimics the behavior of the Web Audio API's setTargetAtTime.
    _calculateCoeff(time) {
      return time > 0 ? Math.exp(-1 / (sampleRate * time)) : 0;
    }

    process(inputs, outputs, parameters) {
        const output = outputs[0][0];
        const gateInput = inputs[0];
        // If there's no gate input, treat it as 0.
        const gate = gateInput.length > 0 ? gateInput[0] : null;

        const attackTime = parameters.attack[0];
        const decayTime = parameters.decay[0];
        const sustainLevel = parameters.sustain[0];
        const releaseTime = parameters.release[0];
        const depth = parameters.depth[0];
        const velocitySensitivity = parameters.velocitySensitivity[0];

        // Recalculate coefficients only when parameters change
        if (attackTime !== this._lastAttack) {
            this._attackCoeff = this._calculateCoeff(attackTime);
            this._lastAttack = attackTime;
        }
        if (decayTime !== this._lastDecay) {
            this._decayCoeff = this._calculateCoeff(decayTime);
            this._lastDecay = decayTime;
        }
        if (releaseTime !== this._lastRelease) {
            this._releaseCoeff = this._calculateCoeff(releaseTime);
            this._lastRelease = releaseTime;
        }
        
        this._sustainLevel = sustainLevel;

        for (let i = 0; i < output.length; i++) {
            const currentGate = gate ? gate[i] : 0;

            // --- Gate Logic ---
            if (currentGate > 0 && this._lastGate <= 0) {
                this._state = 'attack';
                // Capture velocity from the gate signal's peak.
                this._velocity = currentGate; 
            }

            if (currentGate <= 0 && this._lastGate > 0) {
                this._state = 'release';
            }

            this._lastGate = currentGate;

            // --- State Machine ---
            switch (this._state) {
                case 'idle':
                    this._value = 0.0;
                    break;

                case 'attack':
                    // Approach target of 1.0 exponentially
                    this._value = 1.0 + (this._value - 1.0) * this._attackCoeff;
                    // If attack is very short, snap to target
                    if (attackTime < 0.0015) this._value = 1.0;
                    // Transition to decay when close to the peak
                    if (this._value >= 0.999) {
                        this._value = 1.0;
                        this._state = 'decay';
                    }
                    break;

                case 'decay':
                    // Approach sustain level exponentially
                    this._value = this._sustainLevel + (this._value - this._sustainLevel) * this._decayCoeff;
                    // If decay is very short, snap to target
                    if (decayTime < 0.0015) this._value = this._sustainLevel;
                     // If sustain is 0, transition to idle after decay
                    if (this._sustainLevel < 0.001 && this._value <= this._sustainLevel) {
                         this._state = 'idle';
                    }
                    break;

                case 'sustain':
                    // Hold at sustain level
                    this._value = this._sustainLevel;
                    break;

                case 'release':
                    // Approach target of 0.0 exponentially
                    this._value = (this._value) * this._releaseCoeff;
                     // If release is very short, snap to target
                    if (releaseTime < 0.0015) this._value = 0.0;
                    // Transition to idle when the sound is quiet enough
                    if (this._value < 0.0001) {
                        this._value = 0.0;
                        this._state = 'idle';
                    }
                    break;
            }

            // --- Calculate Velocity Gain ---
            // How much velocity affects the output.
            // 0 = no effect (always full volume), 1 = full effect (output scales with velocity).
            const velocityGain = 1.0 - velocitySensitivity + this._velocity * velocitySensitivity;

            // --- Final Output ---
            // Apply depth and velocity sensitivity.
            output[i] = this._value * depth * velocityGain;
        }
        return true;
    }
}
registerProcessor('adsr-processor', ADSRProcessor);
`;
