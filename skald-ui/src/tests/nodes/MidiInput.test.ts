import { describe, it, expect } from 'vitest';
import { createMidiInputNode } from '../../hooks/nodeEditor/audioNodeFactory/createMidiInputNode';

describe('createMidiInputNode', () => {
    it('should create a MIDI Input node with correct default values', () => {
        const position = { x: 100, y: 200 };
        const node = createMidiInputNode(position);

        expect(node.type).toBe('midiInput');
        expect(node.position).toEqual(position);
        expect(node.data).toEqual(expect.objectContaining({
            label: 'MIDI Input',
            device: 'All',
            useMpe: false,
        }));
        expect(node.id).toBeDefined();
    });
});
