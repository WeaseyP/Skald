// @vitest-environment jsdom
import React from 'react';
import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Node } from '@xyflow/react';
import { NodeParameterControls } from '../../components/NodeParameterControls';
import { buildProjectData } from '../../utils/projectSerializer';

// ---------------------------------------------------------------------------
// Packet A7 item 6 — mixer channel levels, editor to codegen input.
//
// The backend already resolves an exposed `level<n>` through the nested
// `levels` array (exposed_param_default -> mixer_channel_level) so exposing a
// fader preserves the mix instead of resetting it. That fix shipped with a
// golden. It was unreachable: every `level<n>` wrapper in the sidebar
// hardcoded isExposable=false, so no user could ever produce the input the
// fixed code path reads.
//
// This walks the whole path: the sidebar offers the toggle -> the toggle
// writes `level<n>` into exposedParameters -> the serializer carries both the
// exposure and the authored level into the codegen JSON.
// ---------------------------------------------------------------------------

const MIXER_LEVELS = [
    { id: 1, level: 0.75, pan: 0 },
    { id: 2, level: 0.4, pan: 0 },
];

/** Reproduces ParameterPanel's exposure toggle without importing the panel. */
const toggleExposure = (exposed: string[], paramKey: string): string[] =>
    exposed.includes(paramKey) ? exposed.filter((p) => p !== paramKey) : [...exposed, paramKey];

const mixerInstrument = (exposedParameters: string[]): Node => ({
    id: 'inst-1',
    type: 'instrument',
    position: { x: 0, y: 0 },
    data: {
        name: 'Kit',
        voiceCount: 1,
        subgraph: {
            nodes: [
                { id: 'osc', type: 'oscillator', position: { x: 0, y: 0 }, data: { label: 'Osc', waveform: 'Sine', frequency: 440, amplitude: 0.5 } },
                { id: 'mix', type: 'mixer', position: { x: 0, y: 0 }, data: { label: 'Mix', inputCount: 2, levels: MIXER_LEVELS, exposedParameters } },
                { id: 'out', type: 'InstrumentOutput', position: { x: 0, y: 0 }, data: { label: 'Out', name: 'output' } },
            ],
            connections: [
                { from_node: 'osc', from_port: 'output', to_node: 'mix', to_port: 'input_1' },
                { from_node: 'mix', from_port: 'output', to_node: 'out', to_port: 'input' },
            ],
        },
    },
} as unknown as Node);

const serializedMixer = (exposedParameters: string[]) => {
    const project = buildProjectData([mixerInstrument(exposedParameters)], [], [], 120, 1.0, 16);
    const nodes = project.project.instruments[0].audio_graph?.nodes ?? [];
    return nodes.find((n: any) => n.id === 'mix') as any;
};

describe('A7-6 mixer level exposure round-trip', () => {
    it('the sidebar offers a toggle whose result reaches the codegen input intact', () => {
        // 1. The editor surface offers the affordance at all.
        const exposability: Record<string, boolean> = {};
        render(
            <NodeParameterControls
                node={{ id: 'mix', type: 'mixer', position: { x: 0, y: 0 }, data: { inputCount: 2, levels: MIXER_LEVELS } }}
                onChange={vi.fn()}
                renderControlWrapper={(paramKey, _label, control, isExposable = true) => {
                    exposability[paramKey] = isExposable;
                    return <div key={paramKey}>{control}</div>;
                }}
            />
        );
        expect(exposability.level1).toBe(true);
        expect(exposability.level2).toBe(true);

        // 2. Toggling produces the exposure list the backend expects.
        const exposed = toggleExposure([], 'level2');
        expect(exposed).toEqual(['level2']);

        // 3. The serializer carries the exposure AND the authored level, which
        //    is what lets the backend initialize the generated field to 0.4
        //    instead of silently muting the channel.
        const mixer = serializedMixer(exposed);
        expect(mixer.parameters.exposedParameters).toEqual(['level2']);
        expect(mixer.parameters.levels).toEqual(MIXER_LEVELS);
        expect(mixer.type).toBe('Mixer');
    });

    it('un-exposing round-trips back to an empty public API for the mixer', () => {
        const exposed = toggleExposure(['level2'], 'level2');
        expect(exposed).toEqual([]);
        expect(serializedMixer(exposed).parameters.exposedParameters).toEqual([]);
    });
});
