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

export const OutOfRangeNotice: React.FC<{ count: number; patternSteps: number }> = ({ count, patternSteps }) => {
    if (count <= 0) return null;
    return (
        <div style={noticeStyles} data-testid="out-of-range-notice">
            {count === 1 ? '1 note is' : `${count} notes are`} past the playable range and will
            not sound: a track plays min(track length, pattern length) = at most {patternSteps} steps.
            The notes are kept — raise the pattern or track length to hear them again.
        </div>
    );
};
