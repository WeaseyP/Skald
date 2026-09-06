import React, { useMemo, useState, useRef, useEffect } from 'react';
import { SequencerTrack, NoteEvent } from '../../definitions/types';
import { useScale } from '../../contexts/ScaleContext';
import {
    MIDI_NOTE_MAX,
    MIDI_NOTE_MIN,
    PIANO_STEP_WIDTH_DEFAULT,
    effectiveTrackSteps,
    noteExtent,
    noteRowHeightFor,
    outOfRangeNoteCount,
    pianoStepWidthMinFor,
    pitchRowsDescending,
    scrollTopForPitch,
    stepWidthFor,
} from './stepMetrics';
import { useViewport } from '../../hooks/useViewport';
import { OutOfRangeNotice } from './OutOfRangeNotice';
import { useElementWidth } from './useElementWidth';
import { usePlayheadScroll } from '../../hooks/sequencer/usePlayheadScroll';

interface PianoRollProps {
    track: SequencerTrack;
    onUpdateNote: (trackId: string, step: number, changes: Partial<NoteEvent>, notePitch?: number) => void;
    onToggleStep: (trackId: string, step: number, note?: number) => void;
    currentStep: number;
    steps?: number;
    // Global pattern length. The roll used to know only the track's own loop
    // length, so it happily offered 32 editable columns under a 16-step
    // pattern - half of them silently inaudible (SKB-010).
    patternSteps?: number;
    onClose: () => void;
    // E3: names which chord member a right-click landed on, so Step
    // Properties can address it directly (StepPropertiesEditor already
    // supports notePitch; only the roll's own click never fed it one).
    // Mirrors StepGrid's onStepContext -> onStepSelect wiring in
    // SequencerDock.tsx.
    onSelectNote?: (trackId: string, step: number, notePitch: number) => void;
}

const KEY_WIDTH = 50;
const HEADER_HEIGHT = 30;

// SKB-026: the range used to be local constants pinned to an 88-key piano
// (21..84), which is not a chromatic editor's remit — a note the sequencer
// happily played and exported above 84 had no row to appear in, so it could
// neither be seen nor deleted. The range is the whole MIDI space now, shared
// from stepMetrics with whatever else draws a pitch axis (roadmap F1's drum
// roll). This container was already `overflow: auto`, so the taller canvas
// costs nothing but the rows themselves.

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
    patternSteps,
    onClose,
    onSelectNote
}) => {
    const { isInScale, rootNote, scaleName, nearestInScale } = useScale();
    const scrollContainerRef = useRef<HTMLDivElement>(null);

    // Long patterns shrink their columns to fit rather than forcing a scroll
    // across dozens of bars; below the floor the grid scrolls as before. The
    // keys column is sticky, so subtract it from the space the steps can use.
    // Steps the generated sequencer can actually reach, and the columns the
    // roll draws. They differ in both directions: a track longer than the
    // pattern has trailing columns that never play, and a note stranded past
    // both counts still needs a column to be seen and deleted in.
    const playableSteps = effectiveTrackSteps(steps, patternSteps ?? steps);
    const columns = Math.max(steps, noteExtent([track]));
    const strandedCount = outOfRangeNoteCount([track], patternSteps ?? steps);

    // E13: both axes of a note's hit area come from the pointer class. The
    // floors themselves live in stepMetrics with the mouse ones, so the roll
    // and the step grid still measure this axis exactly once.
    const { isNarrow, isCoarsePointer } = useViewport();
    const NOTE_HEIGHT = noteRowHeightFor(isCoarsePointer);

    const [, containerWidth] = useElementWidth<HTMLDivElement>(scrollContainerRef);
    const stepWidth = stepWidthFor(columns, Math.max(0, containerWidth - KEY_WIDTH), {
        preferred: PIANO_STEP_WIDTH_DEFAULT,
        min: pianoStepWidthMinFor(isCoarsePointer),
    });

    // Highest pitch at the top, as on a score.
    const midiNotes = useMemo(() => pitchRowsDescending(MIDI_NOTE_MIN, MIDI_NOTE_MAX), []);

    const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    const getNoteName = (midi: number) => {
        const note = noteNames[midi % 12];
        const octave = Math.floor(midi / 12) - 1;
        return `${note}${octave}`;
    };

    const [isPainting, setIsPainting] = useState(false);
    const [paintMode, setPaintMode] = useState<'add' | 'remove' | null>(null); // Whether we are adding or removing
    const lastPaintedStep = useRef<{ step: number, note: number } | null>(null);

    // E3: which chord member a right-click last named. Local rather than
    // lifted to the document (unlike selectedStep in app.tsx) — the roll
    // only needs to draw the highlight; the actual Step Properties selection
    // already reaches app.tsx through onSelectNote, which is the same prop
    // StepGrid's onStepContext feeds.
    const [selectedNote, setSelectedNote] = useState<{ step: number; note: number } | null>(null);

    // E2: an in-progress duration drag. Only ever one note at a time, so a
    // single slot (not a per-note map) is enough; identified by (step, pitch)
    // rather than array index because a chord's other members must not move
    // when one is dragged.
    const [resizeDrag, setResizeDrag] = useState<{
        trackId: string;
        step: number;
        notePitch: number;
        startX: number;
        initialDuration: number;
        currentDuration: number;
    } | null>(null);

    const handleGridMouseDown = (e: React.MouseEvent, midiNote: number) => {
        if (!scrollContainerRef.current) return;

        const rect = scrollContainerRef.current.getBoundingClientRect();
        const scrollLeft = scrollContainerRef.current.scrollLeft;
        const relativeX = e.clientX - rect.left - KEY_WIDTH + scrollLeft;
        const clickedStep = Math.floor(relativeX / stepWidth);

        if (clickedStep >= 0 && clickedStep < playableSteps) {
            setIsPainting(true);

            // Determine mode based on initial click
            const existingNote = track.notes.find(n => n.step === clickedStep && n.note === midiNote);
            const mode = existingNote ? 'remove' : 'add';
            setPaintMode(mode);

            // Perform action immediately
            onToggleStep(track.id, clickedStep, midiNote);
            lastPaintedStep.current = { step: clickedStep, note: midiNote };
        } else if (clickedStep >= playableSteps) {
            // B5-x2: past the playable range nothing can be ADDED (it could
            // never sound), but a note already stranded there can be removed
            // with a click — it used to be visible and untouchable, its only
            // remedy raise-delete-lower. No paint mode: a single click, a
            // single note.
            const stranded = track.notes.find(n => n.step === clickedStep && n.note === midiNote);
            if (stranded) onToggleStep(track.id, clickedStep, midiNote);
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
        const hoveredStep = Math.floor(relativeX / stepWidth);

        if (hoveredStep >= 0 && hoveredStep < playableSteps) {
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

    // E3: a chord's members occupy different pitch ROWS in the roll (unlike
    // the step grid, where they stack inside one cell), so naming (step,
    // pitch) needs no search through the row's notes — the row IS the pitch.
    // Right-click, not left: left is already the roll's paint/remove toggle,
    // so reusing it for selection would mean every selection also mutated
    // the note. preventDefault always, so the browser's own context menu
    // never appears over the roll now that right-click means something here.
    const handleGridContextMenu = (e: React.MouseEvent, midiNote: number) => {
        e.preventDefault();
        if (!scrollContainerRef.current) return;

        const rect = scrollContainerRef.current.getBoundingClientRect();
        const scrollLeft = scrollContainerRef.current.scrollLeft;
        const relativeX = e.clientX - rect.left - KEY_WIDTH + scrollLeft;
        const clickedStep = Math.floor(relativeX / stepWidth);

        const existing = track.notes.find(n => n.step === clickedStep && n.note === midiNote);
        if (!existing) return;

        setSelectedNote({ step: clickedStep, note: midiNote });
        if (onSelectNote) onSelectNote(track.id, clickedStep, midiNote);
    };

    // E2: grab the right-edge handle to start a duration drag. Stops the
    // event reaching the row underneath — otherwise the row's own
    // onMouseDown would ALSO fire and paint/remove a note out from under the
    // drag, since the handle sits inside the (pointerEvents: none) note but
    // is itself interactive.
    const handleResizeMouseDown = (e: React.MouseEvent, n: NoteEvent) => {
        e.stopPropagation();
        e.preventDefault();
        setResizeDrag({
            trackId: track.id,
            step: n.step,
            notePitch: n.note,
            startX: e.clientX,
            initialDuration: n.duration || 1,
            currentDuration: n.duration || 1,
        });
    };

    // E2: local drag state carries the pointer; onUpdateNote (which already
    // pushes history) is called exactly once, on release, so a drag of any
    // length is one undo entry — the same "commit on mouseup, not on every
    // mousemove" shape as StepGrid's own duration/velocity/probability drag.
    // Escape drops the local state without ever calling onUpdateNote, so
    // there is nothing to undo: the next render reads the note's real
    // duration back off the track, which is the "restore" the cancelled drag
    // promised.
    useEffect(() => {
        if (!resizeDrag) return;

        const handleMove = (e: MouseEvent) => {
            setResizeDrag(prev => {
                if (!prev) return prev;
                const deltaSteps = Math.round((e.clientX - prev.startX) / stepWidth);
                return { ...prev, currentDuration: Math.max(1, prev.initialDuration + deltaSteps) };
            });
        };

        const handleUp = () => {
            setResizeDrag(prev => {
                if (prev) onUpdateNote(prev.trackId, prev.step, { duration: prev.currentDuration }, prev.notePitch);
                return null;
            });
        };

        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') setResizeDrag(null);
        };

        window.addEventListener('mousemove', handleMove);
        window.addEventListener('mouseup', handleUp);
        window.addEventListener('keydown', handleKeyDown);
        return () => {
            window.removeEventListener('mousemove', handleMove);
            window.removeEventListener('mouseup', handleUp);
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, [resizeDrag !== null, onUpdateNote, stepWidth]);

    // Open on middle C. With the full MIDI range the default scroll position is
    // no longer incidental: row 0 is now G9, five octaves above anything most
    // patches use.
    useEffect(() => {
        const el = scrollContainerRef.current;
        // The row height is part of this sum: a coarse-pointer roll draws
        // taller lanes, so middle C is a different number of pixels down.
        if (el) el.scrollTop = scrollTopForPitch(60, el.clientHeight, MIDI_NOTE_MIN, MIDI_NOTE_MAX, NOTE_HEIGHT);
    }, [NOTE_HEIGHT]);

    // Roadmap F1: StepGrid already followed the playhead on a narrow viewport
    // (E13); the roll never did, which is the one gap the map calls out as an
    // actual behaviour change, not just a shared implementation. The roll's
    // own scrollContainerRef already carries the vertical scroll above, so
    // this adds a horizontal follow on the same element without a second
    // effect duplicating StepGrid's arithmetic.
    usePlayheadScroll(isNarrow, scrollContainerRef, currentStep, stepWidth);

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
        // Iterate all notes and snap them. The original pitch is passed as
        // the note's identity so every chord member snaps independently —
        // addressing by step alone could only ever move one note per step
        // and wiped its chord siblings.
        track.notes.forEach(n => {
            const snapped = nearestInScale(n.note);
            if (snapped !== n.note) {
                onUpdateNote(track.id, n.step, { note: snapped }, n.note);
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

            <OutOfRangeNotice count={strandedCount} patternSteps={patternSteps ?? steps} trackSteps={steps} />

            {columns > playableSteps && (
                <div
                    data-testid="piano-roll-out-of-range"
                    style={{
                        flex: '0 0 auto',
                        padding: '3px 10px',
                        fontSize: '10px',
                        color: '#e0a030',
                        backgroundColor: '#252526',
                        borderBottom: '1px solid #333',
                    }}
                >
                    Steps {playableSteps} to {columns - 1} are greyed: this track plays{' '}
                    {playableSteps} steps, which is min(track length {steps}, pattern length{' '}
                    {patternSteps ?? steps}).
                </div>
            )}

            <div style={gridContainerStyles} ref={scrollContainerRef} data-testid="piano-roll-scroll-container">
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
                    <div style={{ ...stepHeaderStyles, width: columns * stepWidth }}>
                        {Array.from({ length: columns }).map((_, i) => (
                            <div
                                key={i}
                                title={i >= playableSteps
                                    ? `Step ${i} is past the playable range (${playableSteps} steps = min(track ${steps}, pattern ${patternSteps ?? steps}))`
                                    : `Step ${i}`}
                                style={{
                                    width: stepWidth,
                                    borderRight: '1px solid #444',
                                    textAlign: 'center',
                                    fontSize: '10px',
                                    lineHeight: '30px',
                                    color: i === currentStep ? '#0f0' : (i >= playableSteps ? '#5a5a5a' : '#888'),
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
                                data-testid={`piano-roll-note-${note}`}
                                style={{
                                    height: NOTE_HEIGHT,
                                    width: columns * stepWidth,
                                    display: 'flex',
                                    position: 'relative',
                                    backgroundColor: inScale ? (isBlack ? '#222' : '#2A2A2A') : (isBlack ? '#151515' : '#1F1F1F'),
                                    borderBottom: '1px solid #252525'
                                }}
                                onMouseDown={(e) => handleGridMouseDown(e, note)}
                                onMouseEnter={(e) => handleGridMouseEnter(e, note)}
                                onContextMenu={(e) => handleGridContextMenu(e, note)}
                            >
                                {/* Vertical Grid Lines */}
                                {Array.from({ length: columns }).map((_, i) => (
                                    <div
                                        key={i}
                                        style={{
                                            position: 'absolute',
                                            left: i * stepWidth,
                                            top: 0,
                                            bottom: 0,
                                            width: 1,
                                            backgroundColor: i % 4 === 0 ? '#444' : '#333'
                                        }}
                                    />
                                ))}

                                {/* Placed Notes */}
                                {track.notes.filter(n => n.note === note).map((n, idx) => {
                                    const isResizingThis = resizeDrag !== null
                                        && resizeDrag.trackId === track.id
                                        && resizeDrag.step === n.step
                                        && resizeDrag.notePitch === n.note;
                                    const duration = isResizingThis ? resizeDrag!.currentDuration : (n.duration || 1);
                                    const isSelected = selectedNote !== null
                                        && selectedNote.step === n.step
                                        && selectedNote.note === n.note;

                                    return (
                                        <div
                                            key={idx}
                                            data-testid={`piano-roll-placed-note-${n.step}-${n.note}`}
                                            style={{
                                                position: 'absolute',
                                                left: n.step * stepWidth + 1,
                                                width: duration * stepWidth - 2,
                                                top: 1,
                                                bottom: 1,
                                                backgroundColor: track.color || '#007acc',
                                                borderRadius: '2px',
                                                // E3: a selected note is outlined so the member Step
                                                // Properties is editing is visibly the one lit up, not
                                                // a guess from the chord-member button row alone.
                                                outline: isSelected ? '2px solid #fff' : (isResizingThis ? '1px dashed #fff' : 'none'),
                                                // Body stays click-through (paint/remove, E1's toggle);
                                                // only the resize handle below opts back into pointer
                                                // events, and E3's selection reads from the ROW, not
                                                // from this element.
                                                pointerEvents: 'none'
                                            }}
                                        >
                                            {/* E2: right-edge duration handle. Narrow enough that most
                                                of the note keeps passing clicks through to the row. */}
                                            <div
                                                data-testid={`piano-roll-resize-${n.step}-${n.note}`}
                                                title="Drag to change duration"
                                                style={{
                                                    position: 'absolute',
                                                    top: 0,
                                                    bottom: 0,
                                                    right: 0,
                                                    width: 6,
                                                    cursor: 'ew-resize',
                                                    pointerEvents: 'auto'
                                                }}
                                                onMouseDown={(e) => handleResizeMouseDown(e, n)}
                                            />
                                        </div>
                                    );
                                })}

                                {/* Unreachable columns: greyed, never hidden -
                                    the user has to see why the right-hand end
                                    of the roll refuses to accept notes. */}
                                {columns > playableSteps && (
                                    <div
                                        style={{
                                            position: 'absolute',
                                            left: playableSteps * stepWidth,
                                            width: (columns - playableSteps) * stepWidth,
                                            top: 0,
                                            bottom: 0,
                                            backgroundColor: 'rgba(0, 0, 0, 0.55)',
                                            pointerEvents: 'none'
                                        }}
                                    />
                                )}

                                {/* Playhead Highlight */}
                                <div
                                    style={{
                                        position: 'absolute',
                                        left: currentStep * stepWidth,
                                        width: stepWidth,
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
