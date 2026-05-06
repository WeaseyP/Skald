// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useCodeGeneration } from '../../hooks/useCodeGeneration';
import { Node, Edge } from 'reactflow';
import { SequencerTrack } from '../../definitions/types';

// Mock window.electron
const invokeCodegenMock = vi.fn();
(window as any).electron = {
    invokeCodegen: invokeCodegenMock
};

describe('useCodeGeneration', () => {

    beforeEach(() => {
        invokeCodegenMock.mockClear();
        invokeCodegenMock.mockResolvedValue('// Generated Code');
    });

    it('should generate correct JSON structure for multi-instrument project', async () => {
        const { result } = renderHook(() => useCodeGeneration());

        // Setup Nodes
        const nodes: Node[] = [
            {
                id: 'midi-1',
                type: 'midiInput',
                position: { x: 0, y: 0 },
                data: { device: 'Keystep', useMpe: false }
            },
            {
                id: 'inst-1',
                type: 'instrument',
                position: { x: 200, y: 0 },
                data: {
                    name: 'Bass Synth',
                    voiceCount: 4,
                    subgraph: {
                        nodes: [
                            { id: 'osc-1', type: 'oscillator', position: { x: 0, y: 0 }, data: { frequency: 440, waveform: 'Sawtooth' } },
                            { id: 'gain-1', type: 'gain', position: { x: 100, y: 0 }, data: { gain: 0.8 } }, // Test Gain Mapping
                            { id: 'out-1', type: 'InstrumentOutput', position: { x: 200, y: 0 }, data: {} }
                        ],
                        connections: [
                            { from_node: 'osc-1', from_port: 'output', to_node: 'gain-1', to_port: 'input' },
                            { from_node: 'gain-1', from_port: 'output', to_node: 'out-1', to_port: 'input' }
                        ]
                    }
                }
            }
        ];

        // Setup Edges (Midi -> Instrument)
        const edges: Edge[] = [
            { id: 'e1', source: 'midi-1', target: 'inst-1' }
        ];

        // Setup Tracks
        const tracks: SequencerTrack[] = [
            {
                id: 'track-1',
                targetNodeId: 'inst-1',
                name: 'Bass Synth',
                color: '#fff',
                steps: 16,
                isMuted: true, // Verification point
                isSolo: false,
                notes: []
            }
        ];

        const bpm = 128;
        const masterVol = 0.85;

        // Execute
        await result.current.handleGenerate(nodes, edges, tracks, bpm, masterVol);

        // Assert
        expect(invokeCodegenMock).toHaveBeenCalledTimes(1);
        const jsonArg = JSON.parse(invokeCodegenMock.mock.calls[0][0]);

        console.log('Generatd JSON:', JSON.stringify(jsonArg, null, 2));

        // 1. Global Params
        expect(jsonArg.project.bpm).toBe(128);
        expect(jsonArg.project.master_volume).toBe(0.85);

        // 2. Instrument Count
        expect(jsonArg.project.instruments).toHaveLength(1);
        const inst = jsonArg.project.instruments[0];

        // 3. Instrument Meta
        expect(inst.name).toBe('Bass Synth');
        expect(inst.voice_count).toBe(4);
        expect(inst.mute).toBe(true);

        // 4. MIDI Config
        expect(inst.midi_config.device).toBe('Keystep');

        // 5. Subgraph content
        expect(inst.audio_graph.nodes).toHaveLength(3);
        const gainNode = inst.audio_graph.nodes.find((n: any) => n.type === 'Gain');
        expect(gainNode).toBeDefined();
        expect(gainNode.parameters.gain).toBe(0.8);
    });

    it('should store the resolved IPC value (real .odin code) in generatedCode state — BUG-CODE-PREVIEW-WRONG regression', async () => {
        // The previous bug: main.ts resolved invokeCodegen with stdout, which
        // is just "Package generated audio" — a status line, not the code.
        // Phase 4 fix makes main.ts read the output file and resolve with its
        // contents. This test pins the renderer side: whatever invokeCodegen
        // resolves with (real .odin code now) must end up in generatedCode.
        const realisticCode = [
            'package generated_audio',
            '',
            'import "core:math"',
            '',
            'Asset_Processor :: struct {',
            '\tsample_rate: f32,',
            '}',
            ''
        ].join('\n');
        invokeCodegenMock.mockResolvedValue(realisticCode);

        const { result } = renderHook(() => useCodeGeneration());

        const nodes: Node[] = [
            {
                id: 'inst-1',
                type: 'instrument',
                position: { x: 0, y: 0 },
                data: {
                    name: 'Asset',
                    voiceCount: 1,
                    subgraph: {
                        nodes: [
                            { id: 'out-1', type: 'InstrumentOutput', position: { x: 0, y: 0 }, data: {} }
                        ],
                        connections: []
                    }
                }
            }
        ];

        await act(async () => {
            await result.current.handleGenerate(nodes, [], [], 120, 1.0);
        });

        expect(result.current.generatedCode).toBe(realisticCode);
        expect(result.current.generatedCode).not.toBe('Package generated audio');
        expect(result.current.generatedCode).toContain('package generated_audio');
    });
});
