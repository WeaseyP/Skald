import React, { useEffect, useState } from 'react';
import { isTypingTarget } from '../utils/keyboardTarget';
import { EDGE_KIND_COLORS, EDGE_KIND_LABELS, EdgeKind } from './Edges/edgeKind';

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

export const ShortcutLegend: React.FC = () => {
    const [open, setOpen] = useState(false);

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
                title="Keyboard shortcuts (?)"
                aria-label="Keyboard shortcuts"
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
                        <h3 style={{ marginTop: 0 }}>Keyboard shortcuts</h3>
                        <table style={{ borderCollapse: 'collapse', width: '100%' }}>
                            <tbody>
                                {SHORTCUTS.map(([keys, action]) => (
                                    <tr key={keys}>
                                        <td style={{ padding: '4px 16px 4px 0', whiteSpace: 'nowrap' }}>
                                            <code style={{ background: '#333', padding: '2px 6px', borderRadius: 4 }}>{keys}</code>
                                        </td>
                                        <td style={{ padding: '4px 0', color: '#bbb' }}>{action}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
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
