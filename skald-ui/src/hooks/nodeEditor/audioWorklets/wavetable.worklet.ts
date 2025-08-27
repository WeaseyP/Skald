export const wavetableProcessorString = `
class WavetableProcessor extends AudioWorkletProcessor {
    static get parameterDescriptors() {
        return [
            { name: 'frequency', defaultValue: 440, minValue: 20, maxValue: 20000 },
            { name: 'position', defaultValue: 0, minValue: 0, maxValue: 3 },
        ];
    }
    constructor(options) {
        super(options);
        this.phase = 0;
        this.tables = this.createTables();
    }
    createTables() {
        const size = 2048;
        const sine = new Float32Array(size);
        const triangle = new Float32Array(size);
        const sawtooth = new Float32Array(size);
        const square = new Float32Array(size);
        for (let i = 0; i < size; i++) {
            const angle = (i / size) * 2 * Math.PI;
            sine[i] = Math.sin(angle);
            triangle[i] = (Math.abs((i / size) * 4 - 2) - 1);
            sawtooth[i] = (i / size) * 2 - 1;
            square[i] = (i < size / 2) ? 1 : -1;
        }
        return [sine, triangle, sawtooth, square];
    }
    process(inputs, outputs, parameters) {
        const output = outputs[0];
        const frequency = parameters.frequency;
        const position = parameters.position;
        for (let channel = 0; channel < output.length; ++channel) {
            const outputChannel = output[channel];
            for (let i = 0; i < outputChannel.length; ++i) {
                const freq = frequency.length > 1 ? frequency[i] : frequency[0];
                const pos = position.length > 1 ? position[i] : position[0];
                const tableIndex = Math.floor(pos);
                const nextTableIndex = (tableIndex + 1) % this.tables.length;
                const tableFraction = pos - tableIndex;
                const table1 = this.tables[tableIndex];
                const table2 = this.tables[nextTableIndex];
                const readIndex = (this.phase * table1.length);
                const readIndexInt = Math.floor(readIndex);
                const readIndexFrac = readIndex - readIndexInt;
                const v1_1 = table1[readIndexInt % table1.length];
                const v1_2 = table1[(readIndexInt + 1) % table1.length];
                const sample1 = v1_1 + (v1_2 - v1_1) * readIndexFrac;
                const v2_1 = table2[readIndexInt % table2.length];
                const v2_2 = table2[(readIndexInt + 1) % table2.length];
                const sample2 = v2_1 + (v2_2 - v2_1) * readIndexFrac;
                outputChannel[i] = sample1 + (sample2 - sample1) * tableFraction;
                this.phase += freq / sampleRate;
                if (this.phase > 1) this.phase -= 1;
            }
        }
        return true;
    }
}
registerProcessor('wavetable-processor', WavetableProcessor);
`;
