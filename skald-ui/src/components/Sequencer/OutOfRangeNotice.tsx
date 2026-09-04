/*
================================================================================
| FILE: skald-ui/src/components/Sequencer/OutOfRangeNotice.tsx                 |
|                                                                              |
| SKB-010: the count that makes out-of-range note data non-silent.              |
|                                                                              |
| Greying the unreachable cells tells a user who happens to be looking at them  |
| that they cannot edit there. It does not tell a user who lowered the pattern  |
| length that four notes just stopped playing — those cells may be off the      |
| right edge of a scrolling grid, or (before this) have no column at all.       |
|                                                                              |
| Deliberately NOT a destructive prompt. The data stays; raising the count      |
| brings it back, and Undo of the lowering restores the boundary. What was      |
| missing was any indication that the loss had happened at all.                 |
|                                                                              |
| B5-x5: the notice names WHICH length is the limit when it can (a single-track |
| view passes `trackSteps`), because "raise the pattern length" is the wrong    |
| advice when the track's own loop is the shorter one. B5-x2: it also says how  |
| to get rid of a stranded note — right-click it — since the greyed cells no    |
| longer accept a left click.                                                   |
|                                                                              |
| Shared by the step grid and the piano roll — and by whatever roadmap F1's     |
| drum roll turns out to be — so all of them phrase the same fact identically.  |
================================================================================
*/
import React from 'react';

const noticeStyles: React.CSSProperties = {
    flex: '0 0 auto',
    padding: '3px 8px',
    backgroundColor: 'rgba(178, 120, 25, 0.9)',
    color: '#fff',
    fontSize: '10px',
    fontFamily: 'sans-serif',
    borderBottom: '1px solid #1A1A1A',
    position: 'sticky',
    left: 0,
    zIndex: 20,
};

export interface OutOfRangeNoticeProps {
    count: number;
    patternSteps: number;
    /** The one track's own length, when the view shows exactly one track. */
    trackSteps?: number;
}

/** Which length bounds playback, phrased as the fix. Exported so the wording is pinned. */
export const outOfRangeLimitText = (patternSteps: number, trackSteps?: number): string => {
    if (trackSteps === undefined) {
        return `a track plays min(track length, pattern length) = at most ${patternSteps} steps. Raise the pattern or track length to hear them again`;
    }
    if (trackSteps < patternSteps) {
        return `this track's own length (${trackSteps} steps) is the limit, not the pattern (${patternSteps}). Raise the track length to hear them again`;
    }
    return `the pattern length (${patternSteps} steps) is the limit. Raise the pattern length to hear them again`;
};

export const OutOfRangeNotice: React.FC<OutOfRangeNoticeProps> = ({ count, patternSteps, trackSteps }) => {
    if (count <= 0) return null;
    return (
        <div style={noticeStyles} data-testid="out-of-range-notice">
            {count === 1 ? '1 note is' : `${count} notes are`} past the playable range and will
            not sound: {outOfRangeLimitText(patternSteps, trackSteps)}. The notes are kept;
            right-click a greyed note to delete it.
        </div>
    );
};
