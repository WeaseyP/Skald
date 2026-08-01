// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSequencerState } from '../../hooks/sequencer/useSequencerState';

describe('useSequencerState', () => {

    it('should initialize with default state', () => {
        const { result } = renderHook(() => useSequencerState({ pushHistory: vi.fn() }));

        expect(result.current.tracks).toEqual([]);
        expect(result.current.currentStep).toBe(0);
    });

    // Tracks are derived from the Instrument nodes on the canvas, so they are
    // added and removed by one reconciliation rather than by callers — see
    // useInstrumentRegistry, and LoadThenUndo.test.tsx for why that
    // reconciliation must not touch the history.
    it('should add and remove a track as the instrument list changes', () => {
        const { result } = renderHook(() => useSequencerState({ pushHistory: vi.fn() }));

        act(() => {
            result.current.syncInstrumentTracks([{ id: 'node-1', name: 'Kick' }]);
        });

        expect(result.current.tracks).toHaveLength(1);
        expect(result.current.tracks[0].name).toBe('Kick');
        expect(result.current.tracks[0].targetNodeId).toBe('node-1');

        act(() => {
            result.current.syncInstrumentTracks([]);
        });

        expect(result.current.tracks).toHaveLength(0);
    });

    it('renames a track in place when its instrument is renamed, keeping its notes', () => {
        const { result } = renderHook(() => useSequencerState({ pushHistory: vi.fn() }));
        act(() => { result.current.syncInstrumentTracks([{ id: 'node-1', name: 'Kick' }]); });
        const trackId = result.current.tracks[0].id;
        act(() => { result.current.toggleStep(trackId, 2); });

        act(() => { result.current.syncInstrumentTracks([{ id: 'node-1', name: 'Kick 808' }]); });

        expect(result.current.tracks).toHaveLength(1);
        expect(result.current.tracks[0].id).toBe(trackId);
        expect(result.current.tracks[0].name).toBe('Kick 808');
        expect(result.current.tracks[0].notes).toHaveLength(1);
    });

    it('should toggle a step', () => {
        const { result } = renderHook(() => useSequencerState({ pushHistory: vi.fn() }));

        act(() => {
            result.current.syncInstrumentTracks([{ id: 'node-1', name: 'Kick' }]);
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
