import React, { useEffect, useState } from 'react';

// Self-contained keyboard-shortcut legend: a "?" button pinned bottom-right
// plus the ? key toggle. Every shortcut in the app was previously
// undiscoverable — nothing in the UI mentioned any of them.

const SHORTCUTS: Array<[string, string]> = [
    ['Ctrl/Cmd + Z', 'Undo (graph + sequencer)'],
    ['Ctrl/Cmd + Shift + Z / Ctrl + Y', 'Redo'],
    ['Ctrl/Cmd + C / V', 'Copy / paste selected nodes'],
    ['Delete / Backspace', 'Delete selected nodes & wires'],
    ['Shift or Ctrl + click', 'Multi-select nodes'],
    ['[ and ]', 'Cycle through nodes'],
    ['Double-click slider', 'Reset parameter to default'],
    ['Shift + drag note (grid)', 'Edit note duration'],
    ['Ctrl + drag note (grid)', 'Edit note velocity'],
    ['Alt + drag note (grid)', 'Edit note probability'],
    ['Right-click drag (grid)', 'Erase notes'],
    ['?', 'Toggle this help'],
];

export const ShortcutLegend: React.FC = () => {
    const [open, setOpen] = useState(false);

    useEffect(() => {
        const onKey = (e: KeyboardEvent) => {
            if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement).tagName)) return;
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
                    </div>
                </div>
            )}
        </>
    );
};
