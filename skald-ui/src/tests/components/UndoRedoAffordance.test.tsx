// @vitest-environment jsdom
//
// SKB-008 / B3, last item: "visible Undo/Redo buttons showing real stack depth".
// Undo was reachable only by Ctrl+Z and nothing on screen said whether there was
// anything to undo, or what undoing would take back (F-B07-11).
//
// Two halves are asserted: the Sidebar renders the affordance honestly for a
// given history state, and the depth/label it renders is the depth/label of the
// real single history driven by real edits.
import React from 'react';
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup, act, renderHook } from '@testing-library/react';
import { ReactFlowProvider, Node } from '@xyflow/react';
import Sidebar from '../../components/Sidebar';
import { useEditorState } from '../../hooks/nodeEditor/useEditorState';
import { NodeParams } from '../../definitions/types';

afterEach(cleanup);

const noop = () => undefined;

type HistoryProps = {
    canUndo: boolean;
    canRedo: boolean;
    undoDepth: number;
    redoDepth: number;
    undoLabel: string | null;
    redoLabel: string | null;
    onUndo?: () => void;
    onRedo?: () => void;
};

const renderSidebar = (history: HistoryProps) => render(
    <Sidebar
        onGenerate={noop}
        onPlay={noop}
        onStop={noop}
        isPlaying={false}
        onSave={noop}
        onLoad={noop}
        onImport={noop}
        onCreateInstrument={noop}
        onCreateGroup={noop}
        canCreateInstrument={false}
        bpm={120}
        onBpmChange={noop}
        isLooping={false}
        onLoopToggle={noop}
        onExplodeInstrument={noop}
        canExplodeInstrument={false}
        packageName="generated_audio"
        onPackageNameChange={noop}
        outputPath=""
        onSelectOutputPath={noop}
        onUndo={history.onUndo ?? noop}
        onRedo={history.onRedo ?? noop}
        canUndo={history.canUndo}
        canRedo={history.canRedo}
        undoDepth={history.undoDepth}
        redoDepth={history.redoDepth}
        undoLabel={history.undoLabel}
        redoLabel={history.redoLabel}
    />
);

const undoButton = () => screen.getByTestId('undo-button') as HTMLButtonElement;
const redoButton = () => screen.getByTestId('redo-button') as HTMLButtonElement;

describe('Undo/Redo affordance', () => {
    it('exists on screen', () => {
        renderSidebar({ canUndo: false, canRedo: false, undoDepth: 0, redoDepth: 0, undoLabel: null, redoLabel: null });
        expect(undoButton()).toBeTruthy();
        expect(redoButton()).toBeTruthy();
    });

    it('is disabled and shows no depth when there is nothing to undo or redo', () => {
        renderSidebar({ canUndo: false, canRedo: false, undoDepth: 0, redoDepth: 0, undoLabel: null, redoLabel: null });
        expect(undoButton().disabled).toBe(true);
        expect(redoButton().disabled).toBe(true);
        expect(screen.getByTestId('undo-depth').textContent).toBe('');
        expect(screen.getByTestId('redo-depth').textContent).toBe('');
        expect(undoButton().title).toBe('Nothing to undo');
    });

    it('shows the REAL depth and names the edit it would take back', () => {
        renderSidebar({ canUndo: true, canRedo: true, undoDepth: 7, redoDepth: 2, undoLabel: 'Move node', redoLabel: 'Change cutoff' });
        expect(undoButton().disabled).toBe(false);
        expect(screen.getByTestId('undo-depth').textContent).toBe(' 7');
        expect(screen.getByTestId('redo-depth').textContent).toBe(' 2');
        expect(undoButton().title).toContain('Undo Move node');
        expect(undoButton().title).toContain('7 steps available');
        expect(redoButton().title).toContain('Redo Change cutoff');
        expect(redoButton().title).toContain('2 steps available');
    });

    it('clicking it runs the handler', () => {
        let undos = 0;
        renderSidebar({
            canUndo: true, canRedo: false, undoDepth: 1, redoDepth: 0,
            undoLabel: 'Paste', redoLabel: null, onUndo: () => { undos += 1; },
        });
        undoButton().click();
        expect(undos).toBe(1);
    });
});

describe('the depth it renders is the real history depth', () => {
    const filterNode = (id: string): Node<NodeParams> => ({
        id, type: 'filter', position: { x: 0, y: 0 },
        data: { label: 'Filter', type: 'Lowpass', cutoff: 800, resonance: 1 },
    } as unknown as Node<NodeParams>);

    it('counts up with edits and down with undos, and names the last gesture', () => {
        const { result } = renderHook(() => useEditorState(), {
            wrapper: ({ children }: { children: React.ReactNode }) => <ReactFlowProvider>{children}</ReactFlowProvider>,
        });

        act(() => { result.current.setNodes([filterNode('flt')]); });
        expect(result.current.history.undoDepth).toBe(0);
        expect(result.current.history.canUndo).toBe(false);

        act(() => { result.current.updateNodeData('flt', { cutoff: 1200 } as never); });
        act(() => { result.current.setBpm(90); });
        expect(result.current.history.undoDepth).toBe(2);
        expect(result.current.history.undoLabel).toBe('Change BPM');

        act(() => { result.current.handleUndo(); });
        expect(result.current.history.undoDepth).toBe(1);
        expect(result.current.history.undoLabel).toBe('Change cutoff');
        expect(result.current.history.redoDepth).toBe(1);
        expect(result.current.history.redoLabel).toBe('Change BPM');
    });
});
