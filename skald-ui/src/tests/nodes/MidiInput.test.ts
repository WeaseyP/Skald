import { describe, it, expect } from 'vitest';
import { NODE_DEFINITIONS } from '../../definitions/node-definitions';

describe('MidiInput Node Definition', () => {
    it('should have correct default values in definition', () => {
        const def = NODE_DEFINITIONS['midiInput'];

        expect(def).toBeDefined();
        expect(def.type).toBe('midiInput');
        expect(def.label).toBe('MIDI Input');
        expect(def.defaultParameters).toEqual(expect.objectContaining({
            device: 'All',
            useMpe: false,
        }));
    });
});
