import React from 'react';
import { SequencerTrack, NoteEvent } from '../../definitions/types';

interface StepGridProps {
    tracks: SequencerTrack[];
    currentStep: number;
    steps: number; // usually 16
    onToggleStep: (trackId: string, step: number) => void;
    bpm: number;
}

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
    height: '30px', // Matches TrackList header height
    display: 'flex',
    borderBottom: '1px solid #2A2A2A',
    boxSizing: 'border-box'
};

const cellStyles: React.CSSProperties = {
    flex: '0 0 40px', // Fixed width per step
    width: '40px',
    height: '30px',
    borderRight: '1px solid #2A2A2A',
    cursor: 'pointer',
    position: 'relative',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center'
};

const beatMarkerStyle: React.CSSProperties = {
    ...cellStyles,
    borderRight: '1px solid #444' // Every 4th step
};

const noteStyle: React.CSSProperties = {
    height: '80%',
    borderRadius: '2px',
    backgroundColor: '#007acc',
    position: 'absolute',
    left: '2px',
    zIndex: 5,
    cursor: 'ew-resize', // Default cursor for note is resize/move logic
    // Actually, if we want to click the "note" to delete it, we click the cell.
};

// Playhead overlay
const Playhead: React.FC<{ step: number; bpm: number }> = ({ step, bpm }) => {
    // 16th note duration in seconds = 60 / bpm / 4
    const duration = 60 / bpm / 4;

    return (
        <div style={{
            position: 'absolute',
            top: 0,
            bottom: 0,
            left: `${step * 40}px`, // 40px per step
            width: '40px',
            backgroundColor: 'rgba(255, 255, 255, 0.1)',
            borderLeft: '1px solid rgba(255, 255, 255, 0.3)',
            pointerEvents: 'none',
            zIndex: 10,
            transition: `left ${duration}s linear` // Smooth animation
        }} />
    );
};

export const StepGrid: React.FC<StepGridProps & {
    onUpdateNote?: (trackId: string, step: number, changes: Partial<NoteEvent>) => void;
    onStepContext?: (trackId: string, step: number, x: number, y: number) => void;
}> = ({ tracks, currentStep, steps = 16, onToggleStep, onUpdateNote, bpm, onStepContext }) => {
    // Calculate max steps based on tracks
    const maxSteps = Math.max(steps, ...tracks.map(t => t.steps || 16));
    const stepArray = Array.from({ length: maxSteps }, (_, i) => i);

    const isBeat = (step: number) => (step + 1) % 4 === 0;

    const [dragState, setDragState] = React.useState<{
        type: 'duration' | 'velocity' | 'probability';
        trackId: string;
        step: number;
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

    const handleMouseDown = (e: React.MouseEvent, trackId: string, step: number, hasNote: boolean) => {
        // 1. Modifiers check (Priority: Velocity/Duration/Prob Drag)
        if (e.shiftKey || e.ctrlKey || e.metaKey || e.altKey) {
            // Let the Note's onMouseDown handle this if it exists.
            // If we are clicking an empty cell with modifiers, do nothing or handle future empty-drag?
            return;
        }

        // 2. Right Click (Erase)
        if (e.button === 2) {
            e.preventDefault();
            interactionRef.current.isErasing = true;
            if (hasNote) onToggleStep(trackId, step); // Delete
            return;
        }

        // 3. Left Click (Paint / Select)
        if (e.button === 0) {
            e.preventDefault();
            interactionRef.current.isPainting = true;

            if (hasNote) {
                // Select existing
                if (onStepContext) onStepContext(trackId, step, e.clientX, e.clientY);
            } else {
                // Place new
                onToggleStep(trackId, step);
                // Also Select it? Typically yes.
                if (onStepContext) onStepContext(trackId, step, e.clientX, e.clientY);
            }
        }
    };

    const handleMouseEnter = (e: React.MouseEvent, trackId: string, step: number, hasNote: boolean) => {
        if (interactionRef.current.isErasing) {
            if (hasNote) onToggleStep(trackId, step);
        } else if (interactionRef.current.isPainting) {
            if (!hasNote) {
                onToggleStep(trackId, step);
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
                initialValue,
                startX: e.clientX,
                startY: e.clientY,
                currentValue: initialValue
            });
        }
        // If no modifier, let event bubble to Cell's handleMouseDown for Select/Context logic
    };

    return (
        <div style={gridContainerStyles} onContextMenu={(e) => e.preventDefault()}>
            <Playhead step={currentStep} bpm={bpm} />

            {tracks.map(track => (
                <div key={track.id} style={rowStyles}>
                    {stepArray.map(step => {
                        const trackSteps = track.steps || 16;
                        const isDisabled = step >= trackSteps;

                        const note = track.notes.find(n => n.step === step);
                        const hasNote = !!note;

                        // Check if this note is being dragged
                        const isDragging = dragState && dragState.trackId === track.id && dragState.step === step;

                        // Use preview values if dragging, else actual
                        const duration = isDragging && dragState.type === 'duration' ? dragState.currentValue : (note?.duration || 1);
                        const velocity = isDragging && dragState.type === 'velocity' ? dragState.currentValue : (note?.velocity || 1);
                        const probability = isDragging && dragState.type === 'probability' ? dragState.currentValue : (note?.probability ?? 1);

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

                        // Ghost Note Opacity Logic
                        const baseOpacity = velocity;
                        const finalOpacity = track.isMuted ? baseOpacity * 0.2 : baseOpacity;

                        return (
                            <div
                                key={step}
                                style={currentCellStyle}
                                onMouseDown={(e) => !isDisabled && handleMouseDown(e, track.id, step, hasNote)}
                                onMouseEnter={(e) => !isDisabled && handleMouseEnter(e, track.id, step, hasNote)}
                                title={isDisabled ? 'Disabled Step' : (hasNote ? `Step ${step}: Dur ${duration} Vel ${Math.round(velocity * 100)}% Prob ${Math.round(probability * 100)}% (Drag: Shift=Dur, Ctrl=Vel, Alt=Prob)` : `Step ${step}`)}
                                data-testid={`step-${track.id}-${step}`}
                            >
                                {hasNote && !isDisabled && (
                                    <div
                                        style={{
                                            ...noteStyle,
                                            width: `${duration * 40 - 4}px`,
                                            backgroundColor: track.color || '#007acc',
                                            opacity: finalOpacity,
                                            cursor: modifiers.ctrl ? 'ns-resize' : (modifiers.shift ? 'ew-resize' : (modifiers.alt ? 'help' : 'pointer')), // Visual cue
                                            border: isDragging ? '1px solid white' : (modifiers.shift || modifiers.ctrl || modifiers.alt ? '1px dashed rgba(255,255,255,0.5)' : 'none'),
                                            display: 'flex',
                                            flexDirection: 'column',
                                            justifyContent: 'flex-end'
                                        }}
                                        onMouseDown={(e) => handleNoteMouseDown(e, track.id, step, note!)}
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
                                )}
                            </div>
                        );
                    })}
                </div>
            ))}
        </div>
    );
};
