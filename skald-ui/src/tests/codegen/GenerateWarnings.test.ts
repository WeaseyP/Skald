// @vitest-environment jsdom
/*
================================================================================
| SKB-045 / SKB-009 / SKB-010 — Generate says what it is about to lose.         |
|                                                                              |
| Serialization is where a non-numeric P-lock is dropped and where an           |
| out-of-range note is written into code the sequencer can never reach, so this |
| is where the user has to be told. It used to be told to nobody: the           |
| projectSerializer filter is a bare `.filter()`, and there was not even a       |
| console.warn beside it.                                                       |
|                                                                              |
| Reported through the same status banner Save/Load uses, so it stays on screen |
| until the next file action — not a console line.                              |
================================================================================
*/
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { Node, Edge } from '@xyflow/react';
import { useCodeGeneration } from '../../hooks/useCodeGeneration';
import { NodeParams, SequencerTrack } from '../../definitions/types';

const invokeCodegenMock = vi.fn();
(window as unknown as { electron: unknown }).electron = { invokeCodegen: invokeCodegenMock };

const instrument: Node<NodeParams> = {
    id: 'inst-1',
    type: 'instrument',
    position: { x: 0, y: 0 },
    data: {
        name: 'Bass',
        label: 'Bass',
        voiceCount: 4,
        subgraph: {
            nodes: [
                { id: 'osc-1', type: 'oscillator', position: { x: 0, y: 0 }, data: { label: 'Osc', frequency: 440, amplitude: 0.5, waveform: 'Saw' } },
            ],
            connections: [],
        },
    },
} as unknown as Node<NodeParams>;

const track = (notes: SequencerTrack['notes'], steps = 16): SequencerTrack => ({
    id: 't1',
    targetNodeId: 'inst-1',
    name: 'Bass',
    color: '#007acc',
    steps,
    notes,
    isMuted: false,
    isSolo: false,
});

const generate = async (tracks: SequencerTrack[], patternSteps = 16) => {
    const notify = vi.fn();
    const { result } = renderHook(() => useCodeGeneration(notify));
    await act(async () => {
        await result.current.handleGenerate(
            [instrument], [] as Edge[], tracks, 120, 0.8, 'pkg', '', patternSteps
        );
    });
    return { notify, result };
};

describe('Generate warns instead of dropping silently', () => {
    beforeEach(() => {
        invokeCodegenMock.mockClear();
        invokeCodegenMock.mockResolvedValue('// Generated Code');
    });

    it('reports a non-numeric override the export throws away (SKB-045)', async () => {
        const { notify } = await generate([track([{
            step: 2, note: 60, velocity: 1, duration: 1,
            patchOverrides: { 'Osc:waveform': 'Square' } as unknown as Record<string, number>,
        }])]);

        expect(notify).toHaveBeenCalledTimes(1);
        const [status] = notify.mock.calls[0];
        expect(status.kind).toBe('error');
        expect(status.message).toContain('Osc:waveform');
        expect(status.message).toContain('Square');
    });

    it('reports an unresolvable override, which will abort codegen (SKB-009)', async () => {
        const { notify } = await generate([track([{
            step: 0, note: 60, velocity: 1, duration: 1,
            patchOverrides: { 'OldOsc:amplitude': 0.2 },
        }])]);
        expect(notify.mock.calls[0][0].message).toContain('OldOsc:amplitude');
    });

    it('reports notes past the playable range (SKB-010)', async () => {
        const { notify } = await generate([track([
            { step: 0, note: 60, velocity: 1, duration: 1 },
            { step: 40, note: 60, velocity: 1, duration: 1 },
        ], 64)]);
        expect(notify.mock.calls[0][0].message).toContain('will not sound');
    });

    it('still generates — the warning is not a veto', async () => {
        const { result } = await generate([track([{
            step: 0, note: 60, velocity: 1, duration: 1,
            patchOverrides: { 'Osc:waveform': 'Square' } as unknown as Record<string, number>,
        }])]);
        expect(invokeCodegenMock).toHaveBeenCalledTimes(1);
        expect(result.current.generatedCode).toBe('// Generated Code');
    });

    it('says nothing about a clean project', async () => {
        const { notify } = await generate([track([{
            step: 0, note: 60, velocity: 1, duration: 1,
            patchOverrides: { 'Osc:amplitude': 0.2 },
        }])]);
        expect(notify).not.toHaveBeenCalled();
    });
});
