// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useAudioEngine } from '../../hooks/nodeEditor/useAudioEngine';

// Mock Web Audio API
const mockConnect = vi.fn();
const mockContext = {
    createGain: vi.fn(() => ({
        connect: mockConnect,
        disconnect: vi.fn(),
        gain: { value: 1, setTargetAtTime: vi.fn() }
    })),
    createAnalyser: vi.fn(() => ({
        connect: mockConnect,
        disconnect: vi.fn(),
        frequencyBinCount: 1024,
        getByteTimeDomainData: vi.fn(),
        getByteFrequencyData: vi.fn()
    })),
    destination: {},
    audioWorklet: {
        addModule: vi.fn().mockResolvedValue(undefined)
    },
    currentTime: 0,
    state: 'suspended',
    resume: vi.fn(),
    suspend: vi.fn()
} as unknown as AudioContext;

// Mock globals
vi.stubGlobal('AudioContext', class {
    constructor() {
        return mockContext;
    }
});
// Need to mock window.AudioContext too if used directly? 
// The hook uses `new AudioContext() || new (window as any).webkitAudioContext()` inside? 
// Actually useAudioEngine instantiates it.

describe('Master Bus Integration', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('initializes Master Gain and Analyser nodes', async () => {
        const { result } = renderHook(() => useAudioEngine([], [], false, 120, [], vi.fn()));

        // Check if masterGainNode and analyserNode refs are populated (eventually/initially?)
        // The current implementation creates them in refs but instantiates context on 'play'? 
        // No, let's check the code: 
        // `context` is created lazily or on mount?
        // useAudioEngine actually manages context state.

        // Wait, checking the implementation: 
        // `masterGainNode` and `analyserNode` are Refs. They are assigned in `handlePlay`.
        // So we need to trigger play.

        await act(async () => {
            await result.current.handlePlay();
        });

        // Wait for next tick if needed, but await act should handle promise resolution
        expect((result.current as any).masterGainNode.current).toBeDefined();
        expect((result.current as any).analyserNode.current).toBeDefined();

        // Verify connections: 
        // MasterGain -> Analyser -> Destination
        // Since we mocked 'connect', we can check calls if we had access to the instances.
        // But createGain returns new instances.
    });
});
