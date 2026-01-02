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

export const StepGrid: React.FC<StepGridProps & { onUpdateNote?: (trackId: string, step: number, changes: Partial<NoteEvent>) => void }> = ({ tracks, currentStep, steps = 16, onToggleStep, onUpdateNote, bpm }) => {
    // Calculate max steps based on tracks
    const maxSteps = Math.max(steps, ...tracks.map(t => t.steps || 16));
    const stepArray = Array.from({ length: maxSteps }, (_, i) => i);

    const isBeat = (step: number) => (step + 1) % 4 === 0;

    const [dragState, setDragState] = React.useState<{
        type: 'duration' | 'velocity';
        trackId: string;
        step: number;
        initialValue: number;
        startX: number;
        startY: number;
        currentValue: number;
    } | null>(null);

    React.useEffect(() => {
        if (!dragState) return;

        const handleMouseMove = (e: MouseEvent) => {
            if (dragState.type === 'duration') {
                const deltaX = e.clientX - dragState.startX;
                const stepDelta = Math.round(deltaX / 40); // 40px per step
                const newDuration = Math.max(1, dragState.initialValue + stepDelta);
                setDragState(prev => prev ? { ...prev, currentValue: newDuration } : null);
            } else if (dragState.type === 'velocity') {
                const deltaY = dragState.startY - e.clientY; // Up is positive
                const velDelta = deltaY / 200; // Sensitivity 
                const newVelocity = Math.max(0, Math.min(1, dragState.initialValue + velDelta));
                setDragState(prev => prev ? { ...prev, currentValue: newVelocity } : null);
            }
        };

        const handleMouseUp = () => {
            if (onUpdateNote) {
                if (dragState.type === 'duration') {
                    if (dragState.currentValue !== dragState.initialValue) {
                        onUpdateNote(dragState.trackId, dragState.step, { duration: dragState.currentValue });
                    }
                } else {
                    if (dragState.currentValue !== dragState.initialValue) {
                        onUpdateNote(dragState.trackId, dragState.step, { velocity: dragState.currentValue });
                    }
                }
            }
            setDragState(null);
        };

        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);
        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, [dragState, onUpdateNote]);

    const handleCellClick = (e: React.MouseEvent, trackId: string, step: number, hasNote: boolean, note?: NoteEvent) => {
        e.preventDefault();
        onToggleStep(trackId, step);
    };

    const [modifiers, setModifiers] = React.useState({ ctrl: false, shift: false });

    React.useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Control' || e.key === 'Meta') setModifiers(prev => ({ ...prev, ctrl: true }));
            if (e.key === 'Shift') setModifiers(prev => ({ ...prev, shift: true }));
        };
        const handleKeyUp = (e: KeyboardEvent) => {
            if (e.key === 'Control' || e.key === 'Meta') setModifiers(prev => ({ ...prev, ctrl: false }));
            if (e.key === 'Shift') setModifiers(prev => ({ ...prev, shift: false }));
        };

        window.addEventListener('keydown', handleKeyDown);
        window.addEventListener('keyup', handleKeyUp);
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('keyup', handleKeyUp);
        };
    }, []);

    // ... (dragState effect omitted/unchanged) 

    const handleNoteMouseDown = (e: React.MouseEvent, trackId: string, step: number, note: NoteEvent) => {
        // Only start drag if Modifier is held
        if (e.ctrlKey || e.metaKey) {
            e.stopPropagation();
            e.preventDefault();
            // Velocity Drag
            setDragState({
                type: 'velocity',
                trackId,
                step,
                initialValue: note.velocity,
                startX: e.clientX,
                startY: e.clientY,
                currentValue: note.velocity
            });
        } else if (e.shiftKey) {
            e.stopPropagation();
            e.preventDefault();
            // Duration Drag
            setDragState({
                type: 'duration',
                trackId,
                step,
                initialValue: note.duration || 1,
                startX: e.clientX,
                startY: e.clientY,
                currentValue: note.duration || 1
            });
        }
        // If no modifier, do nothing here. Event bubbles to Cell -> Click -> Toggle (Delete)
    };

    return (
        <div style={gridContainerStyles}>
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

                        // Base style
                        let currentCellStyle = isBeat(step) ? beatMarkerStyle : cellStyles;

                        // Apply disabled style
                        if (isDisabled) {
                            currentCellStyle = {
                                ...currentCellStyle,
                                backgroundColor: '#111',
                                cursor: 'not-allowed',
                                opacity: 0.3
                            };
                        }

                        // Ghost Note Opacity Logic
                        const baseOpacity = velocity;
                        const finalOpacity = track.isMuted ? baseOpacity * 0.2 : baseOpacity;

                        return (
                            <div
                                key={step}
                                style={currentCellStyle}
                                onClick={(e) => !isDisabled && handleCellClick(e, track.id, step, hasNote, note)}
                                onContextMenu={(e) => { e.preventDefault(); }}
                                title={isDisabled ? 'Disabled Step' : (hasNote ? `Step ${step}: Dur ${duration} (Drag: Ext/Vel)` : `Step ${step}`)}
                            >
                                {hasNote && !isDisabled && (
                                    <div
                                        style={{
                                            ...noteStyle,
                                            width: `${duration * 40 - 4}px`,
                                            backgroundColor: track.color || '#007acc',
                                            opacity: finalOpacity,
                                            cursor: modifiers.ctrl ? 'ns-resize' : (modifiers.shift ? 'ew-resize' : 'pointer'), // Visual cue
                                            border: isDragging ? '1px solid white' : (modifiers.shift || modifiers.ctrl ? '1px dashed rgba(255,255,255,0.5)' : 'none')
                                        }}
                                        onMouseDown={(e) => handleNoteMouseDown(e, track.id, step, note!)}
                                        onClick={(e) => {
                                            // Handle click to delete/toggle only if NOT dragging
                                            // onMouseDown handles propagation if modifier is held (drag)
                                            // If no modifier, propagation continues, toggling the step off.
                                            // No explicit action needed here except checking if we just handled a drag?
                                            // If modifier was held, onMouseDown called stopProp, so onClick won't fire here? 
                                            // Wait, onClick fires on MouseUp. MouseDown stopProp prevents PARENT onClick? Yes.
                                            // So if modifier held: MouseDown stops prop. Parent cell onClick does NOT fire.
                                            // If no modifier: MouseDown passes. Parent cell onClick fires. Note onClick also fires.
                                            // Note onClick bubbles to Parent unless stopped.
                                            // So we should NOT stop prop here unless we want to block the toggle.
                                            // We WANT to toggle if no drag.
                                            // So no stopPropagation by default.
                                            // But if we DID drag (dragState was active), we rely on MouseUp cleanup.
                                        }}
                                    />
                                )}
                            </div>
                        );
                    })}
                </div>
            ))}
        </div>
    );
};
