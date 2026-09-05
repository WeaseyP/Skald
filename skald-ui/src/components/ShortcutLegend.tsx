import React, { useEffect, useState } from 'react';
import { isTypingTarget } from '../utils/keyboardTarget';
import { EDGE_KIND_COLORS, EDGE_KIND_LABELS, EdgeKind } from './Edges/edgeKind';
import { useViewport } from '../hooks/useViewport';

// Self-contained keyboard-shortcut legend: a "?" button pinned bottom-right
// plus the ? key toggle. Every shortcut in the app was previously
// undiscoverable — nothing in the UI mentioned any of them.

const SHORTCUTS: Array<[string, string]> = [
    ['Ctrl/Cmd + Z', 'Undo the last edit (graph, sequencer and transport share one history)'],
    ['Ctrl/Cmd + Shift + Z / Ctrl + Y', 'Redo'],
    ['Ctrl/Cmd + C / V', 'Copy / paste selected nodes'],
    ['Delete / Backspace', 'Delete selected nodes & wires'],
    ['Shift or Ctrl + click', 'Multi-select nodes'],
    ['[ and ]', 'Cycle through nodes'],
    ['A W S E D F T G Y H U J K', 'Play the patch live (one octave, C upward) — the preview must be running'],
    ['Z / X', 'Shift the QWERTY keyboard down / up an octave'],
    [', and .', "Step through the selected node's ports (input and output sockets)"],
    ['Enter (on a port)', 'Start a wire at an output, then land it on an input'],
    ['Escape', 'Cancel the wire, then drop the port focus'],
    ['Double-click slider', 'Reset parameter to default'],
    ['Shift + drag note (grid)', 'Edit note duration'],
    ['Ctrl + drag note (grid)', 'Edit note velocity'],
    ['Alt + drag note (grid)', 'Edit note probability'],
    ['Right-click drag (grid)', 'Erase notes'],
    ['Drag note right edge (piano roll)', 'Edit note duration'],
    ['Right-click note (piano roll)', 'Select chord member to edit'],
    ['?', 'Toggle this help'],
];

/*
 * E13. Every row above needs a keyboard, and a phone does not have one — a
 * legend that opens on "Ctrl/Cmd + Z" on a touch device is telling the user
 * about capabilities they cannot reach. The gestures below are what is
 * actually available there. The key table is still printed underneath rather
 * than hidden: `(pointer: coarse)` says what the PRIMARY pointer is, and a
 * tablet with a keyboard paired reports coarse while every shortcut still
 * works.
 */
const TOUCH_GESTURES: Array<[string, string]> = [
    ['Pinch', 'Zoom the node graph in and out'],
    ['Drag the canvas', 'Pan the graph'],
    ['Drag from a port', 'Draw a wire to another node port'],
    ['Drag a node', 'Move it (a node drag never starts a selection box)'],
    ['☰ Nodes', 'Open the palette, transport, undo/redo and file actions'],
    ['⚙ Settings', 'Open the parameters of the selected node or step'],
    ['Tap a step', 'Add or remove a note; tap and hold-drag to paint a run'],
    ['Double-tap a slider', 'Reset that parameter to its default'],
];

const KeyTable: React.FC<{ rows: Array<[string, string]>; testId: string }> = ({ rows, testId }) => (
    <table data-testid={testId} style={{ borderCollapse: 'collapse', width: '100%' }}>
        <tbody>
            {rows.map(([keys, action]) => (
                <tr key={keys}>
                    <td style={{ padding: '4px 16px 4px 0', whiteSpace: 'nowrap' }}>
                        <code style={{ background: '#333', padding: '2px 6px', borderRadius: 4 }}>{keys}</code>
                    </td>
                    <td style={{ padding: '4px 0', color: '#bbb' }}>{action}</td>
                </tr>
            ))}
        </tbody>
    </table>
);

export const ShortcutLegend: React.FC = () => {
    const [open, setOpen] = useState(false);
    const { isCoarsePointer } = useViewport();

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (isTypingTarget(e.target)) return;
            if (e.key === '?') setOpen(o => !o);
            if (e.key === 'Escape') setOpen(false);
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, []);

    return (
        <>
            <button
                onClick={() => setOpen(o => !o)}
                title={isCoarsePointer ? 'Help' : 'Keyboard shortcuts (?)'}
                aria-label={isCoarsePointer ? 'Help' : 'Keyboard shortcuts'}
                style={{
                    position: 'fixed',
                    right: 16,
                    bottom: 16,
                    width: 32,
                    height: 32,
                    borderRadius: '50%',
                    border: '1px solid #555',
                    background: '#333',
                    color: '#E0E0E0',
                    cursor: 'pointer',
                    fontSize: 16,
                    zIndex: 999,
                }}
            >
                ?
            </button>
            {open && (
                <div
                    onClick={() => setOpen(false)}
                    style={{
                        position: 'fixed',
                        inset: 0,
                        background: 'rgba(0,0,0,0.6)',
                        zIndex: 1000,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                    }}
                >
                    <div
                        onClick={e => e.stopPropagation()}
                        style={{
                            background: '#252526',
                            border: '1px solid #444',
                            borderRadius: 8,
                            padding: 20,
                            color: '#E0E0E0',
                            fontFamily: 'sans-serif',
                            minWidth: 380,
                            maxHeight: '80vh',
                            overflowY: 'auto',
                        }}
                    >
                        {isCoarsePointer && (
                            <>
                                <h3 style={{ marginTop: 0 }}>Touch gestures</h3>
                                <KeyTable rows={TOUCH_GESTURES} testId="touch-gestures" />
                            </>
                        )}
                        <h3 style={{ marginTop: isCoarsePointer ? 20 : 0 }}>
                            {isCoarsePointer ? 'With a keyboard attached' : 'Keyboard shortcuts'}
                        </h3>
                        <KeyTable rows={SHORTCUTS} testId="keyboard-shortcuts" />
                        {/* E7: the wire colours read from edgeKind.ts, not a
                            copy — this is the same table classifyEdgeKind
                            resolves against, so the legend can't drift from
                            what the canvas actually draws. */}
                        <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid #444', display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                            {(Object.keys(EDGE_KIND_COLORS) as EdgeKind[]).map((kind) => (
                                <span key={kind} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.85em', color: '#bbb' }}>
                                    <span style={{
                                        display: 'inline-block', width: 12, height: 12, borderRadius: '50%',
                                        background: EDGE_KIND_COLORS[kind],
                                    }} />
                                    {EDGE_KIND_LABELS[kind]} wire
                                </span>
                            ))}
                        </div>
                    </div>
                </div>
            )}
        </>
    );
};
