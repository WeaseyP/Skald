// @vitest-environment jsdom
/*
================================================================================
| SKB-009 (b) — validate P-lock keys on GRAPH CHANGE, not at build time.        |
|                                                                              |
| codegen_analysis.odin's collect_plock_targets aborts the whole build          |
| (os.exit(1)) on a key that resolves to nothing. Because the check only ever   |
| ran there, renaming a node was silent: the project looked fine, kept          |
| autosaving, and the next Generate failed with a message the user experienced  |
| as "the build is broken" rather than "step 4 of Bass points at a node called  |
| Osc that no longer exists".                                                   |
|                                                                              |
| These render the REAL composed editor and rename a node through the same      |
| updateNodeData the sidebar uses, so the proof is that the issue appears with  |
| no build involved at all — and disappears again when the rename is undone.    |
================================================================================
*/
import React from 'react';
import { describe, it, expect, afterEach } from 'vitest';
import { renderHook, act, cleanup } from '@testing-library/react';
import { ReactFlowProvider, Node } from '@xyflow/react';
import { useEditorState } from '../../hooks/nodeEditor/useEditorState';
import { useProjectIssues } from '../../hooks/nodeEditor/useProjectIssues';
import { NodeParams } from '../../definitions/types';

const wrapper = ({ children }: { children: React.ReactNode }) => (
    <ReactFlowProvider>{children}</ReactFlowProvider>
);

afterEach(cleanup);

const bassInstrument = (): Node<NodeParams> => ({
    id: 'inst-1',
    type: 'instrument',
    position: { x: 0, y: 0 },
    data: {
        label: 'Bass',
        name: 'Bass',
        voiceCount: 8,
        glide: 0,
        unison: 1,
        detune: 0,
        inputs: [],
        outputs: [],
        subgraph: {
            nodes: [
                { id: 'osc-1', type: 'oscillator', position: { x: 0, y: 0 }, data: { label: 'Osc', frequency: 440, amplitude: 0.5 } },
            ],
            connections: [],
        },
    },
} as unknown as Node<NodeParams>);

// The B5-4-followup repro: an Oscillator with `fixedPitch` ON — the ONLY
// configuration where NodeParameterControls even offers the frequency
// control to P-lock in the first place (see the `data.fixedPitch &&` guard
// in NodeParameterControls.tsx's 'oscillator' case).
const bassInstrumentFixedPitch = (): Node<NodeParams> => {
    const inst = bassInstrument();
    return {
        ...inst,
        data: {
            ...inst.data,
            subgraph: {
                ...(inst.data as { subgraph: { nodes: unknown[]; connections: unknown[] } }).subgraph,
                nodes: [
                    { id: 'osc-1', type: 'oscillator', position: { x: 0, y: 0 }, data: { label: 'Osc', frequency: 440, fixedPitch: true, amplitude: 0.5 } },
                ],
            },
        },
    } as unknown as Node<NodeParams>;
};

/** The editor plus the live validation the app renders its banner from. */
const useHarness = () => {
    const editor = useEditorState();
    const issues = useProjectIssues(editor.nodes, editor.tracks, editor.session.patternSteps);
    return { ...editor, issues };
};

describe('SKB-009 — a rename reports itself immediately', () => {
    it('flags the override the instant the node it names is renamed', () => {
        const { result } = renderHook(() => useHarness(), { wrapper });

        act(() => { result.current.setNodes([bassInstrument()]); });
        const trackId = result.current.tracks[0].id;
        act(() => { result.current.toggleStep(trackId, 3, 60); });
        act(() => {
            result.current.updateNote(trackId, 3, {
                patchOverrides: { 'Osc:amplitude': 0.25 },
            }, 60);
        });

        // Resolvable while the label stands.
        expect(result.current.issues.lines).toEqual([]);
        expect(result.current.issues.severity).toBe('none');

        act(() => { result.current.updateNodeData('inst-1', { label: 'Sub' }, 'osc-1'); });

        expect(result.current.issues.plocks).toHaveLength(1);
        expect(result.current.issues.plocks[0]).toMatchObject({
            kind: 'unresolvable',
            key: 'Osc:amplitude',
            step: 3,
        });
        expect(result.current.issues.severity).toBe('error');
        expect(result.current.issues.lines[0]).toContain('Osc:amplitude');
        expect(result.current.issues.lines[0]).toContain('"Sub"');
    });

    it('clears again when the rename is undone', () => {
        const { result } = renderHook(() => useHarness(), { wrapper });

        act(() => { result.current.setNodes([bassInstrument()]); });
        const trackId = result.current.tracks[0].id;
        act(() => { result.current.toggleStep(trackId, 3, 60); });
        act(() => {
            result.current.updateNote(trackId, 3, {
                patchOverrides: { 'Osc:amplitude': 0.25 },
            }, 60);
        });
        act(() => { result.current.updateNodeData('inst-1', { label: 'Sub' }, 'osc-1'); });
        expect(result.current.issues.plocks).toHaveLength(1);

        act(() => { result.current.handleUndo(); });
        expect(result.current.issues.plocks).toEqual([]);
    });
});

describe('B5-4-followup — a P-lock is flagged the instant its target parameter goes dead', () => {
    it('flags an Oscillator frequency override the instant fixedPitch is turned off', () => {
        const { result } = renderHook(() => useHarness(), { wrapper });

        // Author the P-lock while fixedPitch is ON — the only state in which
        // NodeParameterControls offers the frequency control at all.
        act(() => { result.current.setNodes([bassInstrumentFixedPitch()]); });
        const trackId = result.current.tracks[0].id;
        act(() => { result.current.toggleStep(trackId, 3, 60); });
        act(() => {
            result.current.updateNote(trackId, 3, {
                patchOverrides: { 'Osc:frequency': 220 },
            }, 60);
        });

        // Live: fixedPitch is on, so frequency is reachable.
        expect(result.current.issues.lines).toEqual([]);
        expect(result.current.issues.severity).toBe('none');

        // The graph edit the backend's own error message names as the
        // expected user path: flip fixedPitch off from the sidebar.
        act(() => { result.current.updateNodeData('inst-1', { fixedPitch: false }, 'osc-1'); });

        expect(result.current.issues.plocks).toHaveLength(1);
        expect(result.current.issues.plocks[0]).toMatchObject({
            kind: 'dead',
            key: 'Osc:frequency',
            deadParam: 'frequency',
            step: 3,
        });
        expect(result.current.issues.severity).toBe('error');
        expect(result.current.issues.lines[0]).toContain('Osc:frequency');
        expect(result.current.issues.lines[0]).toContain('fixedPitch is off');
    });

    it('clears again when fixedPitch is undone', () => {
        const { result } = renderHook(() => useHarness(), { wrapper });

        act(() => { result.current.setNodes([bassInstrumentFixedPitch()]); });
        const trackId = result.current.tracks[0].id;
        act(() => { result.current.toggleStep(trackId, 3, 60); });
        act(() => {
            result.current.updateNote(trackId, 3, {
                patchOverrides: { 'Osc:frequency': 220 },
            }, 60);
        });
        act(() => { result.current.updateNodeData('inst-1', { fixedPitch: false }, 'osc-1'); });
        expect(result.current.issues.plocks).toHaveLength(1);

        act(() => { result.current.handleUndo(); });
        expect(result.current.issues.plocks).toEqual([]);
    });
});

describe('SKB-009 — a stranded note is reported too', () => {
    it('reports a stranded note without any build either', () => {
        const { result } = renderHook(() => useHarness(), { wrapper });

        act(() => { result.current.setNodes([bassInstrument()]); });
        const trackId = result.current.tracks[0].id;
        act(() => { result.current.updateTrackSteps(trackId, 32); });
        act(() => { result.current.toggleStep(trackId, 20, 60); });

        expect(result.current.issues.stepRange).toHaveLength(1);
        expect(result.current.issues.stepRange[0]).toMatchObject({ count: 1, playableSteps: 16 });

        // Raising the global pattern length is the fix, and it takes effect
        // without touching the notes.
        act(() => { result.current.setPatternSteps(32); });
        expect(result.current.issues.stepRange).toEqual([]);
        expect(result.current.tracks[0].notes).toHaveLength(1);
    });
});
