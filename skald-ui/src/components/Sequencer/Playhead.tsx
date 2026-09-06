/*
================================================================================
| FILE: skald-ui/src/components/Sequencer/Playhead.tsx                        |
|                                                                              |
| One overlay spanning every row of a step-based grid, animating its left     |
| edge from step to step. Extracted from StepGrid.tsx (roadmap F1 item 5) so a |
| third reader (the drum roll, which is StepGrid-shaped: one row per kit      |
| piece rather than one row per pitch) reuses this instead of copying it.     |
|                                                                              |
| PianoRoll's own playhead is deliberately NOT this component. It draws one   |
| small highlight PER PITCH ROW inside a scrolling matrix — 128 of them, each |
| relative to its own row — not one overlay spanning the whole grid the way   |
| this is. Making the roll share this component would need its "Grid         |
| Content" wrapper turned position:relative and the highlight lifted out of  |
| the per-row map into a single sibling, a real layout change with no        |
| existing test (here or in PianoRoll.test.tsx) that would catch a pixel     |
| regression against it. Left alone rather than risking a silent visual      |
| break for a cosmetic-consistency win.                                      |
================================================================================
*/
import React from 'react';

export interface PlayheadProps {
    step: number;
    bpm: number;
    stepWidth: number;
}

export const Playhead: React.FC<PlayheadProps> = ({ step, bpm, stepWidth }) => {
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
