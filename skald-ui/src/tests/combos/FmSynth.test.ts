import { describe, it, expect, beforeEach } from 'vitest';
import { setupWebAudioMock } from '../webAudioMock';
import { createOscillatorNode } from '../../hooks/nodeEditor/audioNodeFactory/createOscillatorNode';
import { createFmOperatorNode } from '../../hooks/nodeEditor/audioNodeFactory/createFmOperatorNode';
import { connectNodes } from '../../hooks/nodeEditor/audioNodeUtils';

setupWebAudioMock();

describe('Voice Combo: FM Synthesis', () => {
    let context: AudioContext;

    beforeEach(() => {
        context = new AudioContext();
    });

    it('connects Modulator -> Carrier Frequency', () => {
        // Modulator: Simple Osc
        const modulator = createOscillatorNode(context, { id: 'mod', data: { frequency: 220 } } as any);
        // Carrier: FM Operator
        const carrier = createFmOperatorNode(context, { id: 'carrier', data: { frequency: 440 } } as any);

        // This is a special connection type. In the real app, handles specify where to connect.
        // connectNodes handles logic 'if target is FmOperator and handle is input_mod'

        const edge = {
            id: 'e1',
            source: 'mod',
            target: 'carrier',
            targetHandle: 'modulatorInput' // Critical for FM routing
        };

        connectNodes(modulator, carrier, edge as any);

        // Verify connection routing
        // The Modulator output should connect to the Carrier's 'modulatorInput' gain node
        const carrierInstance = (carrier as any)._skaldNode;
        expect(modulator.connect).toHaveBeenCalledWith(carrierInstance.modulatorInput);
    });
});
