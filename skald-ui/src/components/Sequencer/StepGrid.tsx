import React from 'react';
import { SequencerTrack, NoteEvent } from '../../definitions/types';
import { effectiveTrackSteps, noteExtent, outOfRangeNoteCount, scrollLeftForStep, stepWidthFor } from './stepMetrics';
import { useViewport } from '../../hooks/useViewport';
import { useElementWidth } from './useElementWidth';
import { OutOfRangeNotice } from './OutOfRangeNotice';

interface StepGridProps {
    tracks: SequencerTrack[];
    currentStep: number;
    steps: number; // usually 16
    // SKB-025: the pitch is not optional from this component any more. A grid
    // row has no pitch axis, so every gesture here has to say out loud which
    // note it means; omitting it meant "the first note in insertion order".
    onToggleStep: (trackId: string, step: number, notePitch?: number) => void;
    // Right-click erase. A row cannot express "erase the G of this chord", so
    // it erases the step — explicitly, rather than deleting one arbitrary
    // member and leaving a sibling to take over the block.
    onClearStep?: (trackId: string, step: number) => void;
    bpm: number;
}

/** The pitch a click on the cell itself means: the root, deterministically. */
const lowestPitchAt = (track: SequencerTrack, step: number): number | undefined => {
    let lowest: number | undefined;
    for (const note of track.notes) {
        if (note.step !== step) continue;
        if (lowest === undefined || note.note < lowest) lowest = note.note;
    }
    return lowest;
};

/** Default pitch for a note painted into an empty cell (middle C). */
const PAINT_PITCH = 60;

const gridContainerStyles: React.CSSProperties = {
    flexGrow: 1,
    backgroundColor: '#1E1E1E',
    display: 'flex',
    flexDirection: 'column',
    overflowX: 'auto',
    overflowY: 'hidden',
    position: 'relative'
};

const rowStyles: React.CSSProperties = {
    height: '34px', // Matches TrackList header height
    display: 'flex',
    borderBottom: '1px solid #2A2A2A',
    boxSizing: 'border-box'
};

// Cell width is per-render now: long patterns shrink their steps to fit the
// dock and only scroll once they hit the floor in stepMetrics.
const cellStylesFor = (stepWidth: number): React.CSSProperties => ({
    flex: `0 0 ${stepWidth}px`,
    width: `${stepWidth}px`,
    height: '34px',
    borderRight: '1px solid #2A2A2A',
    cursor: 'pointer',
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center'
});

const noteStyle: React.CSSProperties = {
    // Height and vertical offset come from the lane calculation instead: a step
    // draws one block per chord member now, stacked (SKB-025).
    borderRadius: '2px',
    backgroundColor: '#007acc',
    position: 'absolute',
    left: '2px',
    zIndex: 5,
    cursor: 'ew-resize', // Default cursor for note is resize/move logic
    // Actually, if we want to click the "note" to delete it, we click the cell.
};

// Playhead overlay
const Playhead: React.FC<{ step: number; bpm: number; stepWidth: number }> = ({ step, bpm, stepWidth }) => {
    // 16th note duration in seconds = 60 / bpm / 4
    const duration = 60 / bpm / 4;

    return (
        <div style={{
            position: 'absolute',
            top: 0,
            bottom: 0,
            left: `${step * stepWidth}px`,
            width: `${stepWidth}px`,
            backgroundColor: 'rgba(255, 255, 255, 0.1)',
            borderLeft: '1px solid rgba(255, 255, 255, 0.3)',
            pointerEvents: 'none',
            zIndex: 10,
            transition: `left ${duration}s linear` // Smooth animation
        }} />
    );
};

export const StepGrid: React.FC<StepGridProps & {
    onUpdateNote?: (trackId: string, step: number, changes: Partial<NoteEvent>, notePitch?: number) => void;
    // `notePitch` is which chord member the selection refers to — the step
    // properties editor is otherwise left guessing (SKB-025).
    onStepContext?: (trackId: string, step: number, notePitch: number, x: number, y: number) => void;
}> = ({ tracks, currentStep, steps = 16, onToggleStep, onClearStep, onUpdateNote, bpm, onStepContext }) => {
    // Columns to draw. `noteExtent` is the SKB-010 half: lowering BOTH the
    // pattern length and a track's length used to leave a note at step 20 with
    // no column at all — invisible in the editor, still in the save file, still
    // in the export, and back again the instant either count was raised. It
    // only widens the grid when such a note exists, so an ordinary pattern
    // draws exactly as many columns as before.
    const maxSteps = Math.max(steps, noteExtent(tracks), ...tracks.map(t => t.steps || 16));
    const stepArray = Array.from({ length: maxSteps }, (_, i) => i);

    // Notes the generated sequencer can never reach. Counted across every
    // track so one lowered pattern length reports the whole loss at once.
    const strandedCount = outOfRangeNoteCount(tracks, steps);

    // Fit the whole pattern into the dock where possible; scroll past the floor.
    const [gridRef, gridWidth] = useElementWidth<HTMLDivElement>();
    const stepWidth = stepWidthFor(maxSteps, gridWidth);
    const cellStyles = cellStylesFor(stepWidth);
    const beatMarkerStyle: React.CSSProperties = { ...cellStyles, borderRight: '1px solid #444' };
    const rowWidth = maxSteps * stepWidth;

    // E13: on a phone the dock shows a few bars of a long pattern, and the
    // playhead used to walk off the right edge and keep going — a blank grid
    // for most of every loop. Only the narrow layout follows it: on the
    // desktop the pattern usually fits, and moving a scroll position the user
    // just set by hand would be a regression, not a feature.
    const { isNarrow } = useViewport();
    React.useEffect(() => {
        if (!isNarrow) return;
        const el = gridRef.current;
        if (!el) return;
        const target = scrollLeftForStep(currentStep, stepWidth, el.scrollLeft, el.clientWidth);
        if (target !== null) el.scrollLeft = target;
    }, [isNarrow, currentStep, stepWidth, gridRef]);

    const isBeat = (step: number) => (step + 1) % 4 === 0;

    const [dragState, setDragState] = React.useState<{
        type: 'duration' | 'velocity' | 'probability';
        trackId: string;
        step: number;
        // Which note of the step was grabbed. Without it the commit landed on
        // whichever chord member came first in the array (SKB-025).
        notePitch: number;
        initialValue: number;
        startX: number;
        startY: number;
        currentValue: number;
    } | null>(null);

    // Interaction State
    const interactionRef = React.useRef<{
        isPainting: boolean;
        isErasing: boolean;
        actionId: string; // Unique ID for this drag session to prevent multi-trigger
    }>({ isPainting: false, isErasing: false, actionId: '' });

    React.useEffect(() => {
        const handleGlobalMouseUp = () => {
            interactionRef.current = { isPainting: false, isErasing: false, actionId: '' };
        };
        window.addEventListener('mouseup', handleGlobalMouseUp);
        return () => window.removeEventListener('mouseup', handleGlobalMouseUp);
    }, []);

    const handleMouseDown = (e: React.MouseEvent, track: SequencerTrack, step: number, hasNote: boolean, isDisabled = false) => {
        // 1. Modifiers check (Priority: Velocity/Duration/Prob Drag)
        if (e.shiftKey || e.ctrlKey || e.metaKey || e.altKey) {
            // Let the Note's onMouseDown handle this if it exists.
            // If we are clicking an empty cell with modifiers, do nothing or handle future empty-drag?
            return;
        }

        // 2. Right Click (Erase the whole step — see onClearStep)
        if (e.button === 2) {
            e.preventDefault();
            // B5-x2: erasing is allowed on a greyed (out-of-range) cell too.
            // Creating there is not — the note could never sound — but a note
            // stranded past the playable range used to be visible and
            // untouchable, its only remedy raise-delete-lower. Erase-drag
            // (isErasing) is left off for greyed cells so a sweep across the
            // boundary does not silently take stranded notes with it.
            if (!isDisabled) interactionRef.current.isErasing = true;
            if (hasNote && onClearStep) onClearStep(track.id, step);
            return;
        }
        if (isDisabled) return;

        // 3. Left Click (Paint / Select)
        if (e.button === 0) {
            e.preventDefault();
            interactionRef.current.isPainting = true;

            // Clicking the cell rather than a specific block means the root of
            // whatever is there, and middle C where nothing is. Both are
            // deterministic; array order was not.
            const pitch = hasNote ? (lowestPitchAt(track, step) ?? PAINT_PITCH) : PAINT_PITCH;
            if (!hasNote) onToggleStep(track.id, step, pitch);
            if (onStepContext) onStepContext(track.id, step, pitch, e.clientX, e.clientY);
        }
    };

    const handleMouseEnter = (e: React.MouseEvent, track: SequencerTrack, step: number, hasNote: boolean) => {
        if (interactionRef.current.isErasing) {
            if (hasNote && onClearStep) onClearStep(track.id, step);
        } else if (interactionRef.current.isPainting) {
            if (!hasNote) {
                onToggleStep(track.id, step, PAINT_PITCH);
                // Auto-select newly painted nodes? Maybe too spammy for parameter panel updates.
            }
        }
    };

    const [modifiers, setModifiers] = React.useState({ ctrl: false, shift: false, alt: false });

    React.useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Control' || e.key === 'Meta') setModifiers(prev => ({ ...prev, ctrl: true }));
            if (e.key === 'Shift') setModifiers(prev => ({ ...prev, shift: true }));
            if (e.key === 'Alt') setModifiers(prev => ({ ...prev, alt: true }));
        };
        const handleKeyUp = (e: KeyboardEvent) => {
            if (e.key === 'Control' || e.key === 'Meta') setModifiers(prev => ({ ...prev, ctrl: false }));
            if (e.key === 'Shift') setModifiers(prev => ({ ...prev, shift: false }));
            if (e.key === 'Alt') setModifiers(prev => ({ ...prev, alt: false }));
        };

        window.addEventListener('keydown', handleKeyDown);
        window.addEventListener('keyup', handleKeyUp);
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('keyup', handleKeyUp);
        };
    }, []);

    const handleNoteMouseDown = (e: React.MouseEvent, trackId: string, step: number, note: NoteEvent) => {
        // Only start drag if Modifier is held
        if (e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) {
            e.stopPropagation();
            e.preventDefault();

            let type: 'velocity' | 'duration' | 'probability' = 'velocity';
            let initialValue = note.velocity;

            if (e.shiftKey) {
                type = 'duration';
                initialValue = note.duration || 1;
            } else if (e.altKey) {
                type = 'probability';
                initialValue = note.probability ?? 1;
            }

            setDragState({
                type,
                trackId,
                step,
                notePitch: note.note,
                initialValue,
                startX: e.clientX,
                startY: e.clientY,
                currentValue: initialValue
            });
            return;
        }
        // No modifier: this block IS the selection, so it names its own pitch
        // rather than letting the cell fall back to the root.
        if (e.button === 0) {
            e.stopPropagation();
            e.preventDefault();
            interactionRef.current.isPainting = true;
            if (onStepContext) onStepContext(trackId, step, note.note, e.clientX, e.clientY);
        }
    };

    // Drive + commit the modifier-drag. The drag state used to be set on
    // mousedown and then... nothing: no mousemove updated it and no mouseup
    // committed it — the gesture the tooltip advertises did literally
    // nothing. Vertical drag edits velocity/probability, horizontal edits
    // duration; mouseup commits through onUpdateNote.
    React.useEffect(() => {
        if (!dragState) return;

        const handleMove = (e: MouseEvent) => {
            setDragState(prev => {
                if (!prev) return prev;
                let value = prev.currentValue;
                if (prev.type === 'duration') {
                    const dx = e.clientX - prev.startX;
                    value = Math.max(1, Math.min(16, Math.round(prev.initialValue + dx / 20)));
                } else {
                    const dy = prev.startY - e.clientY; // up = louder / more likely
                    value = Math.max(0, Math.min(1, prev.initialValue + dy / 100));
                }
                return { ...prev, currentValue: value };
            });
        };

        const handleUp = () => {
            setDragState(prev => {
                if (prev && onUpdateNote) {
                    onUpdateNote(prev.trackId, prev.step, { [prev.type]: prev.currentValue }, prev.notePitch);
                }
                return null;
            });
        };

        window.addEventListener('mousemove', handleMove);
        window.addEventListener('mouseup', handleUp);
        return () => {
            window.removeEventListener('mousemove', handleMove);
            window.removeEventListener('mouseup', handleUp);
        };
    }, [dragState !== null, onUpdateNote]);

    return (
        <div ref={gridRef} style={gridContainerStyles} data-testid="step-grid-scroll" onContextMenu={(e) => e.preventDefault()}>
            <OutOfRangeNotice count={strandedCount} patternSteps={steps} />
            <Playhead step={currentStep} bpm={bpm} stepWidth={stepWidth} />

            {tracks.map(track => (
                <div key={track.id} style={{ ...rowStyles, width: rowWidth }}>
                    {stepArray.map(step => {
                        // The boundary is min(track loop, global pattern) — the
                        // grid used to grey only past the track's own length, so
                        // steps 16..31 of a 32-step track under a 16-step
                        // pattern were fully editable and never played.
                        const playableSteps = effectiveTrackSteps(track.steps, steps);
                        const isDisabled = step >= playableSteps;

                        // SKB-025: EVERY note on the step, lowest pitch first.
                        // This used to be `notes.find(n => n.step === step)` —
                        // one block, carrying the first-inserted member's
                        // duration, velocity and probability, with the rest of
                        // the chord not drawn at all. A user could not see that
                        // a step held three notes, let alone which one an edit
                        // was about to land on.
                        const stepNotes = track.notes
                            .filter(n => n.step === step)
                            .slice()
                            .sort((a, b) => a.note - b.note);
                        const hasNote = stepNotes.length > 0;

                        // Base style
                        let currentCellStyle = isBeat(step) ? beatMarkerStyle : cellStyles;

                        // Apply disabled style
                        if (isDisabled) {
                            currentCellStyle = {
                                ...currentCellStyle,
                                ...{
                                    backgroundColor: '#111',
                                    cursor: 'not-allowed',
                                    opacity: 0.3
                                }
                            };
                        }

                        // One block per member, stacked so a chord looks like
                        // one. Height is shared, floored so a dense chord stays
                        // visible rather than collapsing to nothing.
                        const laneHeight = Math.max(4, Math.floor(28 / Math.max(1, stepNotes.length)));

                        // Two different reasons a cell is not editable, and
                        // they are NOT the same fact. codegen_project.odin
                        // emits `switch p.current_step %% track_steps` and runs
                        // `p.current_step` over 0..pattern_steps-1, so:
                        //   step < steps  -> the moment exists; the modulo maps
                        //                    it onto an earlier column, which
                        //                    is what sounds there.
                        //   step >= steps -> `p.current_step` never reaches it
                        //                    and nothing sounds there at all.
                        // The test is the COLUMN against the pattern length,
                        // not the track length against it: at trackLoop ===
                        // steps a column past both (drawn because noteExtent
                        // widened the grid) is silent, and telling the user it
                        // "replays step N" would be exactly backwards.
                        const trackLoop = track.steps || 16;
                        const loopsBack = isDisabled && step < steps;
                        const disabledTitle = loopsBack
                            ? `Step ${step}: this track's loop is ${trackLoop} steps, so this column replays step ${step % trackLoop}. Edit it there, or raise the track length.`
                            : `Step ${step} is past the pattern length (${playableSteps} playable steps = min(track ${trackLoop}, pattern ${steps})) and never sounds.${hasNote ? ' The note here is kept, not deleted — right-click to delete it.' : ''}`;

                        const cellTitle = isDisabled
                            ? disabledTitle
                            : !hasNote
                                ? `Step ${step}`
                                : stepNotes.length > 1
                                    // Naming the count is the difference between
                                    // a chord and a note that looks like one.
                                    ? `Step ${step}: ${stepNotes.length} notes (${stepNotes.map(n => n.note).join(', ')}) — right-click clears the step`
                                    : `Step ${step}: Dur ${(dragState && dragState.trackId === track.id && dragState.step === step && dragState.notePitch === stepNotes[0].note && dragState.type === 'duration' ? dragState.currentValue : (stepNotes[0].duration || 1))} Vel ${Math.round((stepNotes[0].velocity ?? 1) * 100)}% Prob ${Math.round((stepNotes[0].probability ?? 1) * 100)}% (Drag: Shift=Dur, Ctrl=Vel, Alt=Prob)`;

                        return (
                            <div
                                key={step}
                                style={currentCellStyle}
                                onMouseDown={(e) => handleMouseDown(e, track, step, hasNote, isDisabled)}
                                onMouseEnter={(e) => !isDisabled && handleMouseEnter(e, track, step, hasNote)}
                                aria-disabled={isDisabled}
                                title={cellTitle}
                                data-testid={`step-${track.id}-${step}`}
                            >
                                {/* An out-of-range note is drawn, dimmed, not
                                    hidden: the user has to be able to see the
                                    data they are about to lose the sound of. */}
                                {stepNotes.map((note, lane) => {
                                    const isDragging = !!dragState
                                        && dragState.trackId === track.id
                                        && dragState.step === step
                                        && dragState.notePitch === note.note;
                                    const duration = isDragging && dragState!.type === 'duration' ? dragState!.currentValue : (note.duration || 1);
                                    const velocity = isDragging && dragState!.type === 'velocity' ? dragState!.currentValue : (note.velocity ?? 1);
                                    const probability = isDragging && dragState!.type === 'probability' ? dragState!.currentValue : (note.probability ?? 1);
                                    const finalOpacity = (track.isMuted ? velocity * 0.2 : velocity)
                                        * (isDisabled ? 0.35 : 1);

                                    return (
                                        <div
                                            key={note.note}
                                            data-testid={`step-note-${track.id}-${step}-${note.note}`}
                                            title={`Step ${step} note ${note.note}: Dur ${duration} Vel ${Math.round(velocity * 100)}% Prob ${Math.round(probability * 100)}% (Drag: Shift=Dur, Ctrl=Vel, Alt=Prob)`}
                                            style={{
                                                ...noteStyle,
                                                width: `${Math.max(2, duration * stepWidth - 4)}px`,
                                                height: `${laneHeight}px`,
                                                top: `${3 + lane * laneHeight}px`,
                                                backgroundColor: track.color || '#007acc',
                                                opacity: finalOpacity,
                                                outline: isDisabled ? '1px dashed rgba(224,160,48,0.9)' : 'none',
                                                cursor: modifiers.ctrl ? 'ns-resize' : (modifiers.shift ? 'ew-resize' : (modifiers.alt ? 'help' : 'pointer')), // Visual cue
                                                border: isDragging ? '1px solid white' : (modifiers.shift || modifiers.ctrl || modifiers.alt ? '1px dashed rgba(255,255,255,0.5)' : 'none'),
                                                display: 'flex',
                                                flexDirection: 'column',
                                                justifyContent: 'flex-end'
                                            }}
                                            onMouseDown={(e) => {
                                                if (!isDisabled) { handleNoteMouseDown(e, track.id, step, note); return; }
                                                // B5-x2: a stranded note can be deleted where it
                                                // sits (right-click), even though it cannot be
                                                // edited or dragged there.
                                                if (e.button === 2) {
                                                    e.preventDefault();
                                                    e.stopPropagation();
                                                    onToggleStep(track.id, step, note.note);
                                                }
                                            }}
                                        >
                                            {/* Probability Bar */}
                                            {probability < 1 && (
                                                <div style={{
                                                    height: '3px',
                                                    width: `${probability * 100}%`,
                                                    backgroundColor: 'yellow',
                                                    opacity: 0.8,
                                                    marginBottom: '1px'
                                                }} />
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        );
                    })}
                </div>
            ))}
        </div>
    );
};
