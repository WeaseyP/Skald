import React, { useMemo, useState, useRef, useEffect } from 'react';
import { SequencerTrack, NoteEvent } from '../../definitions/types';
import { useScale } from '../../contexts/ScaleContext';

interface PianoRollProps {
    track: SequencerTrack;
    onUpdateNote: (trackId: string, step: number, changes: Partial<NoteEvent>) => void;
    onToggleStep: (trackId: string, step: number, note?: number) => void;
    currentStep: number;
    steps?: number;
    onClose: () => void;
}

const NOTE_HEIGHT = 20;
const STEP_WIDTH = 30;
const KEY_WIDTH = 50;
const HEADER_HEIGHT = 30;

// Visible range (MIDI notes)
const MIN_NOTE = 36; // C2
const MAX_NOTE = 84; // C6

const pianoRollStyles: React.CSSProperties = {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#1E1E1E',
    zIndex: 200,
    display: 'flex',
    flexDirection: 'column',
    color: '#eee',
    fontFamily: 'sans-serif'
};

const toolbarStyles: React.CSSProperties = {
    height: '40px',
    backgroundColor: '#252526',
    borderBottom: '1px solid #333',
    display: 'flex',
    alignItems: 'center',
    padding: '0 10px',
    justifyContent: 'space-between'
};

const gridContainerStyles: React.CSSProperties = {
    flexGrow: 1,
    overflow: 'auto',
    position: 'relative',
    display: 'flex'
};

const keysColumnStyles: React.CSSProperties = {
    width: KEY_WIDTH,
    position: 'sticky',
    left: 0,
    zIndex: 10,
    backgroundColor: '#252526',
    borderRight: '1px solid #333'
};

const stepHeaderStyles: React.CSSProperties = {
    height: HEADER_HEIGHT,
    position: 'sticky',
    top: 0,
    zIndex: 5,
    backgroundColor: '#252526',
    borderBottom: '1px solid #333',
    display: 'flex',
    paddingLeft: 0 // Aligned with grid
};

export const PianoRoll: React.FC<PianoRollProps> = ({
    track,
    onUpdateNote,
    onToggleStep,
    currentStep,
    steps = 16,
    onClose
}) => {
    const { isInScale, rootNote, scaleName, nearestInScale } = useScale();
    const scrollContainerRef = useRef<HTMLDivElement>(null);

    // Generate note list (descending order for display)
    const midiNotes = useMemo(() => {
        const notes = [];
        for (let i = MAX_NOTE; i >= MIN_NOTE; i--) {
            notes.push(i);
        }
        return notes;
    }, []);

    const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    const getNoteName = (midi: number) => {
        const note = noteNames[midi % 12];
        const octave = Math.floor(midi / 12) - 1;
        return `${note}${octave}`;
    };

    const [isPainting, setIsPainting] = useState(false);
    const [paintMode, setPaintMode] = useState<'add' | 'remove' | null>(null); // Whether we are adding or removing
    const lastPaintedStep = useRef<{ step: number, note: number } | null>(null);

    const handleGridMouseDown = (e: React.MouseEvent, midiNote: number) => {
        if (!scrollContainerRef.current) return;

        const rect = scrollContainerRef.current.getBoundingClientRect();
        const scrollLeft = scrollContainerRef.current.scrollLeft;
        const relativeX = e.clientX - rect.left - KEY_WIDTH + scrollLeft;
        const clickedStep = Math.floor(relativeX / STEP_WIDTH);

        if (clickedStep >= 0 && clickedStep < steps) {
            setIsPainting(true);

            // Determine mode based on initial click
            const existingNote = track.notes.find(n => n.step === clickedStep && n.note === midiNote);
            const mode = existingNote ? 'remove' : 'add';
            setPaintMode(mode);

            // Perform action immediately
            onToggleStep(track.id, clickedStep, midiNote);
            lastPaintedStep.current = { step: clickedStep, note: midiNote };
        }
    };

    const handleGridMouseEnter = (e: React.MouseEvent, midiNote: number) => {
        if (!isPainting || !paintMode || !scrollContainerRef.current) return;

        // If buttons not pressed (drag released outside), stop
        if (e.buttons !== 1) {
            setIsPainting(false);
            setPaintMode(null);
            return;
        }

        const rect = scrollContainerRef.current.getBoundingClientRect();
        const scrollLeft = scrollContainerRef.current.scrollLeft;
        const relativeX = e.clientX - rect.left - KEY_WIDTH + scrollLeft;
        const hoveredStep = Math.floor(relativeX / STEP_WIDTH);

        if (hoveredStep >= 0 && hoveredStep < steps) {
            // Avoid double-toggling same step if we just processed it
            if (lastPaintedStep.current && lastPaintedStep.current.step === hoveredStep && lastPaintedStep.current.note === midiNote) {
                return;
            }

            const existingNote = track.notes.find(n => n.step === hoveredStep && n.note === midiNote);

            // Apply based on mode
            if (paintMode === 'add' && !existingNote) {
                onToggleStep(track.id, hoveredStep, midiNote);
            } else if (paintMode === 'remove' && existingNote) {
                onToggleStep(track.id, hoveredStep, midiNote);
            }

            lastPaintedStep.current = { step: hoveredStep, note: midiNote };
        }
    };

    const handleGridMouseUp = () => {
        setIsPainting(false);
        setPaintMode(null);
        lastPaintedStep.current = null;
    };

    // Auto-scroll to center notes on mount
    useEffect(() => {
        if (scrollContainerRef.current) {
            const centerNoteIndex = midiNotes.findIndex(n => n === 60); // Middle C
            if (centerNoteIndex !== -1) {
                scrollContainerRef.current.scrollTop = (centerNoteIndex * NOTE_HEIGHT) - (scrollContainerRef.current.clientHeight / 2);
            }
        }
    }, []);

    // Global MouseUp to catch drags ending outside
    useEffect(() => {
        const handleGlobalMouseUp = () => {
            setIsPainting(false);
            setPaintMode(null);
            lastPaintedStep.current = null;
        };
        window.addEventListener('mouseup', handleGlobalMouseUp);
        return () => window.removeEventListener('mouseup', handleGlobalMouseUp);
    }, []);

    const handleSnapToScale = () => {
        // Iterate all notes and snap them
        track.notes.forEach(n => {
            const snapped = nearestInScale(n.note);
            if (snapped !== n.note) {
                // Determine if we are just moving pitch
                onUpdateNote(track.id, n.step, { note: snapped });
            }
        });
    };

    return (
        <div style={pianoRollStyles}>
            <div style={toolbarStyles}>
                <span style={{ fontWeight: 'bold' }}>Piano Roll - {track.name}</span>
                <span style={{ fontSize: '0.8em', color: '#888' }}>{rootNote} {scaleName}</span>
                <div>
                    <button onClick={handleSnapToScale} style={{ cursor: 'pointer', padding: '5px 10px', marginRight: '10px', backgroundColor: '#444', color: '#fff', border: 'none', borderRadius: '4px' }}>
                        Snap to Scale
                    </button>
                    <button onClick={onClose} style={{ cursor: 'pointer', padding: '5px 10px' }}>Close</button>
                </div>
            </div>

            <div style={gridContainerStyles} ref={scrollContainerRef}>
                {/* Keys Column */}
                <div style={keysColumnStyles}>
                    <div style={{ height: HEADER_HEIGHT }}></div> {/* Spacer for header */}
                    {midiNotes.map(note => {
                        const isBlack = [1, 3, 6, 8, 10].includes(note % 12);
                        const inScale = isInScale(note);
                        return (
                            <div
                                key={note}
                                style={{
                                    height: NOTE_HEIGHT,
                                    fontSize: '10px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'flex-end',
                                    paddingRight: '5px',
                                    backgroundColor: isBlack ? '#111' : '#333',
                                    color: inScale ? '#fff' : '#555',
                                    borderBottom: '1px solid #222'
                                }}
                            >
                                {getNoteName(note)}
                            </div>
                        );
                    })}
                </div>

                {/* Grid Content */}
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                    {/* Header Row */}
                    <div style={{ ...stepHeaderStyles, width: steps * STEP_WIDTH }}>
                        {Array.from({ length: steps }).map((_, i) => (
                            <div
                                key={i}
                                style={{
                                    width: STEP_WIDTH,
                                    borderRight: '1px solid #444',
                                    textAlign: 'center',
                                    fontSize: '10px',
                                    lineHeight: '30px',
                                    color: i === currentStep ? '#0f0' : '#888',
                                    backgroundColor: i === currentStep ? 'rgba(0, 255, 0, 0.1)' : 'transparent'
                                }}
                            >
                                {i}
                            </div>
                        ))}
                    </div>

                    {/* Note Rows */}
                    {midiNotes.map(note => {
                        // isBlack logic
                        const isBlack = [1, 3, 6, 8, 10].includes(note % 12);
                        const inScale = isInScale(note);

                        return (
                            <div
                                key={note}
                                style={{
                                    height: NOTE_HEIGHT,
                                    width: steps * STEP_WIDTH,
                                    display: 'flex',
                                    position: 'relative',
                                    backgroundColor: inScale ? (isBlack ? '#222' : '#2A2A2A') : (isBlack ? '#151515' : '#1F1F1F'),
                                    borderBottom: '1px solid #252525'
                                }}
                                onMouseDown={(e) => handleGridMouseDown(e, note)}
                                onMouseEnter={(e) => handleGridMouseEnter(e, note)}
                            >
                                {/* Vertical Grid Lines */}
                                {Array.from({ length: steps }).map((_, i) => (
                                    <div
                                        key={i}
                                        style={{
                                            position: 'absolute',
                                            left: i * STEP_WIDTH,
                                            top: 0,
                                            bottom: 0,
                                            width: 1,
                                            backgroundColor: i % 4 === 0 ? '#444' : '#333'
                                        }}
                                    />
                                ))}

                                {/* Placed Notes */}
                                {track.notes.filter(n => n.note === note).map((n, idx) => (
                                    <div
                                        key={idx}
                                        style={{
                                            position: 'absolute',
                                            left: n.step * STEP_WIDTH + 1,
                                            width: (n.duration || 1) * STEP_WIDTH - 2,
                                            top: 1,
                                            bottom: 1,
                                            backgroundColor: track.color || '#007acc',
                                            borderRadius: '2px',
                                            pointerEvents: 'none' // Let click pass to grid for now (unless adding drag resize later)
                                        }}
                                    />
                                ))}

                                {/* Playhead Highlight */}
                                <div
                                    style={{
                                        position: 'absolute',
                                        left: currentStep * STEP_WIDTH,
                                        width: STEP_WIDTH,
                                        top: 0,
                                        bottom: 0,
                                        backgroundColor: 'rgba(255, 255, 255, 0.05)',
                                        pointerEvents: 'none'
                                    }}
                                />
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
};
