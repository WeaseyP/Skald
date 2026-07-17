import React, { createContext, useContext, useState, useMemo } from 'react';

export type NoteName = 'C' | 'C#' | 'D' | 'D#' | 'E' | 'F' | 'F#' | 'G' | 'G#' | 'A' | 'A#' | 'B';
export type ScaleName = 'Chromatic' | 'Major' | 'Minor' | 'Pentatonic' | 'Dorian' | 'Phrygian' | 'Lydian' | 'Mixolydian';

interface ScaleContextType {
    rootNote: NoteName;
    setRootNote: (note: NoteName) => void;
    scaleName: ScaleName;
    setScaleName: (scale: ScaleName) => void;
    isInScale: (midiNote: number) => boolean;
    getScaleNotes: () => number[];
    nearestInScale: (midiNote: number) => number;
}

const ScaleContext = createContext<ScaleContextType | undefined>(undefined);

const NOTES: NoteName[] = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

const SCALES: Record<ScaleName, number[]> = {
    'Chromatic': [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
    'Major': [0, 2, 4, 5, 7, 9, 11],
    'Minor': [0, 2, 3, 5, 7, 8, 10],
    'Pentatonic': [0, 3, 5, 7, 10],
    'Dorian': [0, 2, 3, 5, 7, 9, 10],
    'Phrygian': [0, 1, 3, 5, 7, 8, 10],
    'Lydian': [0, 2, 4, 6, 7, 9, 11],
    'Mixolydian': [0, 2, 4, 5, 7, 9, 10]
};

export const ScaleProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [rootNote, setRootNote] = useState<NoteName>('C');
    // Chromatic = quantization off. The default must not silently repitch:
    // with C Minor here, placing an E4 previewed AND exported as Eb4 while
    // the piano roll displayed E4 — opting into a scale is the user's call.
    const [scaleName, setScaleName] = useState<ScaleName>('Chromatic');

    const scaleIntervals = useMemo(() => SCALES[scaleName], [scaleName]);
    const rootIndex = useMemo(() => NOTES.indexOf(rootNote), [rootNote]);

    const normalize = (note: number) => note % 12;

    const isInScale = (midiNote: number) => {
        const noteIndex = normalize(midiNote);
        // Calculate relative to root
        const relativeIndex = (noteIndex - rootIndex + 12) % 12;
        return scaleIntervals.includes(relativeIndex);
    };

    const getScaleNotes = () => {
        return scaleIntervals.map(interval => (rootIndex + interval) % 12);
    };

    const nearestInScale = (midiNote: number) => {
        const noteIndex = normalize(midiNote);
        const relativeIndex = (noteIndex - rootIndex + 12) % 12;

        if (scaleIntervals.includes(relativeIndex)) return midiNote;

        // Debug Failure Case
        // If we are about to quantize something that looks safe, log WHY
        // console.warn(`[ScaleContext] QUANTIZING! Note: ${midiNote} (${noteIndex}), Root: ${rootIndex} (${rootNote}), Rel: ${relativeIndex}. Scale: ${scaleIntervals.join(',')}`);

        // Find nearest interval
        let bestDiff = 100;

        for (const interval of scaleIntervals) {
            let diff = interval - relativeIndex;
            // Shortest path on circle
            if (diff > 6) diff -= 12;
            else if (diff < -6) diff += 12;

            if (Math.abs(diff) < Math.abs(bestDiff)) {
                bestDiff = diff;
            }
        }

        return midiNote + bestDiff;
    };

    return (
        <ScaleContext.Provider value={{ rootNote, setRootNote, scaleName, setScaleName, isInScale, getScaleNotes, nearestInScale }}>
            {children}
        </ScaleContext.Provider>
    );
};

export const useScale = () => {
    const context = useContext(ScaleContext);
    if (!context) throw new Error('useScale must be used within a ScaleProvider');
    return context;
};

export { NOTES, SCALES };
