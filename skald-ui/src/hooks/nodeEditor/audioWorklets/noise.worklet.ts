export const noiseProcessorString = `
class NoiseProcessor extends AudioWorkletProcessor {
    constructor(options) {
        super();
        this._type = (options?.processorOptions?.type || 'white').toLowerCase();
        this._sampleCounter = 0;

        // State for pink noise generation (Voss-McCartney algorithm)
        this._pink_b0 = 0;
        this._pink_b1 = 0;
        this._pink_b2 = 0;
        this._pink_b3 = 0;
        this._pink_b4 = 0;
        this._pink_b5 = 0;
        this._pink_b6 = 0;
        
        // State for brown noise generation (leaky integrator)
        this._brown_lastOut = 0;

        this.port.onmessage = (event) => {
            if (event.data.type) {
                this._type = event.data.type.toLowerCase();
            }
        };
    }

    process(inputs, outputs, parameters) {
        const output = outputs[0][0];

        for (let i = 0; i < output.length; i++) {
            let value = 0;
            const white = Math.random() * 2 - 1;

            switch (this._type) {
                case 'white':
                    value = white;
                    break;
                
                case 'pink':
                    // A common approximation of pink noise
                    this._pink_b0 = 0.99886 * this._pink_b0 + white * 0.0555179;
                    this._pink_b1 = 0.99332 * this._pink_b1 + white * 0.0750759;
                    this._pink_b2 = 0.96900 * this._pink_b2 + white * 0.1538520;
                    this._pink_b3 = 0.86650 * this._pink_b3 + white * 0.3104856;
                    this._pink_b4 = 0.55000 * this._pink_b4 + white * 0.5329522;
                    this._pink_b5 = -0.7616 * this._pink_b5 - white * 0.0168980;
                    const pink = this._pink_b0 + this._pink_b1 + this._pink_b2 + this._pink_b3 + this._pink_b4 + this._pink_b5 + this._pink_b6 + white * 0.5362;
                    this._pink_b6 = white * 0.115926;
                    // Scale to roughly -1 to 1 range
                    value = pink / 5.0; 
                    break;

                case 'brown':
                    // Leaky integrator for brown noise
                    this._brown_lastOut = (this._brown_lastOut + (0.02 * white)) / 1.02;
                    value = this._brown_lastOut * 3.5; // Scale to roughly -1 to 1
                    break;
                
                default:
                    value = white;
                    break;
            }
            output[i] = value;

            this._sampleCounter++;
            if (this._sampleCounter >= 2000) {
                console.log('[Skald Debug][Noise] Type: ' + this._type + ', Last Value: ' + value.toFixed(4));
                this._sampleCounter = 0;
            }
        }
        return true;
    }
}
registerProcessor('noise-processor', NoiseProcessor);
`;
