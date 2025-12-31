import { Node } from 'reactflow';
import { NODE_DEFINITIONS } from '../../../definitions/node-definitions';

const generateId = () => Math.random().toString(36).substr(2, 9);

// This factory creates a node that outputs control signals for Pitch, Gate, and Velocity.
// In the browser, we use ConstantSourceNodes to represent these signals.
// The AudioEngine (Voice) will update these 'offset' values when a note is triggered.

interface MidiInputNodes {
    pitch: ConstantSourceNode;
    gate: ConstantSourceNode;
    velocity: ConstantSourceNode;
}

export const createMidiInputNode = (context: AudioContext): AudioNode => {
    const pitchNode = context.createConstantSource();
    const gateNode = context.createConstantSource();
    const velocityNode = context.createConstantSource();

    pitchNode.offset.value = 0; // 0 Hz by default (or user preference)
    gateNode.offset.value = 0;  // Gate closed
    velocityNode.offset.value = 0; // No velocity

    pitchNode.start();
    gateNode.start();
    velocityNode.start();

    // We return an object, but our AudioNodeMap expects a single AudioNode.
    // We can't return a standard AudioNode because we have 3 distinct outputs.
    // The solution is to adhere to the pattern where this function returns the 'primary' output,
    // OR we conform to a custom type.
    // Given the architecture in `voice.ts`, it expects `AudioNode`.
    // We will attach the other nodes to the main one as properties to access later.

    (pitchNode as any).gate = gateNode;
    (pitchNode as any).velocity = velocityNode;

    // Pitch is the primary 'node' for ID purposes in the map.
    return pitchNode as unknown as AudioNode;
};
