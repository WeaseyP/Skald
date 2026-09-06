/*
================================================================================
| FILE: skald-ui/src/components/Sequencer/DrumRollRow.tsx                      |
|                                                                              |
| Roadmap F3 — one percussive track's row of cells, and every gesture that     |
| acts on it. Extracted from DrumRoll.tsx so the kit workspace (N rows) is the |
| SAME row N times rather than a second implementation of paint, erase,        |
| velocity-drag and select that could drift from the single-track one.         |
|                                                                              |
| The paint gesture lives HERE, per row, and that is load-bearing rather than  |
| incidental: rows look like one instrument's lanes and are not. Each is a     |
| separate SequencerTrack keyed 1:1 to an Instrument in the backend model      |
| (codegen_analysis.odin::active_sequencer_tracks filters on target_node_id),  |
| so a drag that leaked from one row into the next would write into a          |
| different asset's export. A per-row hook cannot leak; a hoisted one could.   |
================================================================================
*/
import React, { useCallback } from 'react';
import { NoteEvent, SequencerTrack } from '../../definitions/types';
import { isBeatStart } from './stepMetrics';
import { useNoteDrag } from '../../hooks/sequencer/useNoteDrag';
import { useStepPaintInteraction } from '../../hooks/sequencer/useStepPaintInteraction';

export interface DrumRollRowProps {
    track: SequencerTrack;
    /** Columns to draw, and how many of them can actually sound. */
    columns: number;
    playableSteps: number;
    stepWidth: number;
    rowHeight: number;
    /** The MIDI note a new hit is written at — drumKit.ts::canonicalDrumPitch. */
    paintPitch: number;
    /** Prefix for this row's testids, so N rows do not collide. */
    idPrefix: string;
    /** Names both lengths in the disabled cells' tooltips. */
    trackSteps: number;
    patternSteps: number;
    onToggleStep: (trackId: string, step: number, notePitch?: number) => void;
    onClearStep: (trackId: string, step: number) => void;
    onUpdateNote: (trackId: string, step: number, changes: Partial<NoteEvent>, notePitch?: number) => void;
    onSelectNote?: (trackId: string, step: number, notePitch: number) => void;
}

/** useStepPaintInteraction's cell key: one row, so the step alone identifies a cell. */
const cellKey = (step: number): string => String(step);

export const DrumRollRow: React.FC<DrumRollRowProps> = ({
    track,
    columns,
    playableSteps,
    stepWidth,
    rowHeight,
    paintPitch,
    idPrefix,
    trackSteps,
    patternSteps,
    onToggleStep,
    onClearStep,
    onUpdateNote,
    onSelectNote,
}) => {
    // hooks/sequencer/useStepPaintInteraction.ts. One button, and the mode is
    // decided by the first cell touched (the Piano Roll's policy, not the Step
    // Grid's two-button one): a gesture that starts on empty adds all the way,
    // one that starts on a hit clears all the way.
    const hasHitAt = useCallback((key: string) => {
        const step = Number(key);
        return track.notes.some(n => n.step === step);
    }, [track.notes]);
    const addHit = useCallback((key: string) => {
        onToggleStep(track.id, Number(key), paintPitch);
    }, [onToggleStep, track.id, paintPitch]);
    const removeHits = useCallback((key: string) => {
        onClearStep(track.id, Number(key));
    }, [onClearStep, track.id]);
    const paint = useStepPaintInteraction({ hasEventAt: hasHitAt, onPaint: addHit, onErase: removeHits });

    // hooks/sequencer/useNoteDrag.ts. Velocity only, on the vertical axis, with
    // StepGrid's own scale so the same pointer movement means the same change
    // in both editors. It commits once, on release, which is what makes a drag
    // of any length one undo entry (useSequencerState::updateNote).
    const velocityValueFor = useCallback((_field: 'velocity', initialValue: number, _dx: number, deltaY: number) =>
        Math.max(0, Math.min(1, initialValue + deltaY / 100)),
    []);
    const velocityOnCommit = useCallback((trackId: string, step: number, _field: 'velocity', value: number, notePitch: number) =>
        onUpdateNote(trackId, step, { velocity: value }, notePitch),
    [onUpdateNote]);
    const velocityDrag = useNoteDrag<'velocity'>({ valueFor: velocityValueFor, onCommit: velocityOnCommit });

    const handleCellMouseDown = (e: React.MouseEvent, step: number, hasHit: boolean, isDisabled: boolean) => {
        // Right-click belongs to the hit below (selection for Step Properties),
        // not to the cell — left-click is already the toggle here the way it is
        // in the roll, so the grid's right-click-erases has no job to do.
        if (e.button !== 0) return;
        e.preventDefault();

        const mode = hasHit ? 'erase' : 'paint';
        if (isDisabled) {
            // B5-x2: past the playable range nothing may be CREATED — it could
            // never sound — but a note already stranded there must stay
            // deletable where it sits. `applyOnce`, not `start`: a sweep must
            // not be allowed to cross the boundary and take cells with it.
            if (mode === 'erase') paint.applyOnce('erase', cellKey(step));
            return;
        }
        paint.start(mode, cellKey(step));
    };

    return (
        <div style={{ height: rowHeight, display: 'flex' }} data-testid={`${idPrefix}-cells`}>
            {Array.from({ length: columns }, (_, step) => {
                const isDisabled = step >= playableSteps;
                const stepNotes = track.notes
                    .filter(n => n.step === step)
                    .slice()
                    .sort((a, b) => a.note - b.note);
                const hasHit = stepNotes.length > 0;
                const laneHeight = Math.max(6, Math.floor((rowHeight - 8) / Math.max(1, stepNotes.length)));

                return (
                    <div
                        key={step}
                        data-testid={`${idPrefix}-cell-${step}`}
                        aria-disabled={isDisabled}
                        title={isDisabled
                            ? `Step ${step} is past the playable range (${playableSteps} steps = min(track ${trackSteps}, pattern ${patternSteps})) and never sounds.${hasHit ? ' Click to delete the hit that is stranded here.' : ''}`
                            : `Step ${step}${hasHit ? ' — click to clear, drag the bar to change velocity, right-click for Step Properties' : ` — click to add a hit at note ${paintPitch}`}`}
                        onMouseDown={(e) => handleCellMouseDown(e, step, hasHit, isDisabled)}
                        onMouseEnter={() => !isDisabled && paint.continueAt(cellKey(step))}
                        style={{
                            flex: `0 0 ${stepWidth}px`,
                            width: stepWidth,
                            height: rowHeight,
                            boxSizing: 'border-box',
                            position: 'relative',
                            cursor: isDisabled ? 'not-allowed' : 'pointer',
                            backgroundColor: isDisabled ? '#111' : (isBeatStart(step) ? '#242424' : '#1E1E1E'),
                            opacity: isDisabled ? 0.4 : 1,
                            borderRight: isBeatStart(step + 1) ? '1px solid #444' : '1px solid #2A2A2A',
                        }}
                    >
                        {stepNotes.map((note, lane) => {
                            const isDragging = velocityDrag.state !== null
                                && velocityDrag.state.step === step
                                && velocityDrag.state.notePitch === note.note;
                            const velocity = isDragging ? velocityDrag.state!.currentValue : (note.velocity ?? 1);
                            const probability = note.probability ?? 1;

                            return (
                                <div
                                    key={note.note}
                                    data-testid={`${idPrefix}-hit-${step}-${note.note}`}
                                    title={`Step ${step} note ${note.note}: Vel ${Math.round(velocity * 100)}% Prob ${Math.round(probability * 100)}% Dur ${note.duration || 1}`}
                                    onContextMenu={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        onSelectNote?.(track.id, step, note.note);
                                    }}
                                    style={{
                                        position: 'absolute',
                                        left: 2,
                                        right: 2,
                                        top: 4 + lane * laneHeight,
                                        height: laneHeight - 2,
                                        borderRadius: '2px',
                                        // Velocity IS the cell's intensity: on a row with no
                                        // pitch axis it is the only thing left to read off a
                                        // hit at a glance.
                                        backgroundColor: track.color || '#007acc',
                                        opacity: (track.isMuted ? 0.2 : 1) * (0.25 + 0.75 * velocity),
                                        outline: isDragging ? '1px solid #fff'
                                            : (note.note === paintPitch ? 'none' : '1px dashed rgba(224,160,48,0.9)'),
                                    }}
                                >
                                    {/* The velocity grip. Same split as the roll's duration
                                        handle (E2): the hit's body keeps passing clicks
                                        through to the cell, so left-click still clears the
                                        step, and only this strip starts a drag. */}
                                    <div
                                        data-testid={`${idPrefix}-velocity-${step}-${note.note}`}
                                        title="Drag up/down to change velocity"
                                        onMouseDown={(e) => {
                                            e.preventDefault();
                                            e.stopPropagation();
                                            velocityDrag.start({
                                                trackId: track.id,
                                                step,
                                                notePitch: note.note,
                                                field: 'velocity',
                                                initialValue: note.velocity ?? 1,
                                                startX: e.clientX,
                                                startY: e.clientY,
                                            });
                                        }}
                                        style={{
                                            position: 'absolute',
                                            left: 0,
                                            right: 0,
                                            bottom: 0,
                                            height: Math.max(6, Math.round((laneHeight - 2) * 0.4)),
                                            cursor: 'ns-resize',
                                            backgroundColor: 'rgba(0,0,0,0.25)',
                                        }}
                                    />
                                </div>
                            );
                        })}
                    </div>
                );
            })}
        </div>
    );
};
