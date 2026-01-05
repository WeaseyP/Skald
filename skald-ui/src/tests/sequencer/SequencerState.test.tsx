// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSequencerState } from '../../hooks/sequencer/useSequencerState';

describe('useSequencerState', () => {

    it('should initialize with default state', () => {
        const { result } = renderHook(() => useSequencerState());

        expect(result.current.tracks).toEqual([]);
        expect(result.current.currentStep).toBe(0);
    });

    it('should add and remove a track', () => {
        const { result } = renderHook(() => useSequencerState());

        act(() => {
            result.current.addTrack('node-1', 'Kick', '#ff0000');
        });

        expect(result.current.tracks).toHaveLength(1);
        expect(result.current.tracks[0].name).toBe('Kick');
        expect(result.current.tracks[0].targetNodeId).toBe('node-1');

        act(() => {
            result.current.removeTrack('node-1');
        });

        expect(result.current.tracks).toHaveLength(0);
    });

    it('should toggle a step', () => {
        const { result } = renderHook(() => useSequencerState());

        act(() => {
            result.current.addTrack('node-1', 'Kick', '#ff0000');
        });

        const trackId = result.current.tracks[0].id;

        act(() => {
            result.current.toggleStep(trackId, 0);
        });

        expect(result.current.tracks[0].notes).toHaveLength(1);
        expect(result.current.tracks[0].notes[0].step).toBe(0);

        act(() => {
            result.current.toggleStep(trackId, 0);
        });

        expect(result.current.tracks[0].notes).toHaveLength(0);
    });
});
