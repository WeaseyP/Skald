// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { Node, Edge } from '@xyflow/react';
import { useWasmAudioEngine } from '../../hooks/nodeEditor/useWasmAudioEngine';
import { SequencerTrack } from '../../definitions/types';

// ---------------------------------------------------------------------------
// jsdom has no Web Audio. We stub only the surface the engine touches:
//   - AudioContext        (createGain/createAnalyser/audioWorklet/resume/close)
//   - AudioWorkletNode    (its .port is the live control channel)
//   - WebAssembly.compile (bytes -> module)
//   - window.electron.buildWasmPreview (the IPC that does the real codegen+build)
// Each stub records the calls the contract tests assert on. The goal is to pin
// user-observable behavior (does audio start? does a knob rebuild or not?),
// never internal engine state.
// ---------------------------------------------------------------------------

interface FakePort { onmessage: ((e: MessageEvent) => void) | null; postMessage: ReturnType<typeof vi.fn>; }

const createdContexts: FakeAudioContext[] = [];
const createdWorklets: FakeAudioWorkletNode[] = [];

class FakeAudioContext {
    state = 'running';
    currentTime = 0;
    destination = {};
    audioWorklet = { addModule: vi.fn().mockResolvedValue(undefined) };
    createGain = vi.fn(() => ({ connect: vi.fn(), gain: { value: 1 } }));
    createAnalyser = vi.fn(() => ({ connect: vi.fn(), fftSize: 0 }));
    resume = vi.fn().mockResolvedValue(undefined);
    close = vi.fn().mockResolvedValue(undefined);
    constructor() { createdContexts.push(this); }
}

class FakeAudioWorkletNode {
    port: FakePort = { onmessage: null, postMessage: vi.fn() };
    connect = vi.fn();
    // processorOptions captured (not just discarded): the master-volume
    // contract tests below assert on it directly (SKB-011 — the initial
    // fader value must seed the worklet the same way `loop` and `stepAsset`
    // already do, not arrive only via a later postMessage).
    constructor(_ctx: unknown, _name: string, public opts: { processorOptions?: Record<string, unknown> }) { createdWorklets.push(this); }
}

let buildWasmPreview: ReturnType<typeof vi.fn>;

beforeEach(() => {
    createdContexts.length = 0;
    createdWorklets.length = 0;

    vi.stubGlobal('AudioContext', FakeAudioContext);
    vi.stubGlobal('AudioWorkletNode', FakeAudioWorkletNode);
    // NOTE: the engine deliberately never calls WebAssembly.compile — raw
    // bytes go to the worklet, which compiles them itself (a compiled
    // Module is silently dropped by the worklet port; see the engine).

    (URL as unknown as { createObjectURL: unknown }).createObjectURL = vi.fn(() => 'blob:mock');
    (URL as unknown as { revokeObjectURL: unknown }).revokeObjectURL = vi.fn();

    buildWasmPreview = vi.fn().mockResolvedValue(new ArrayBuffer(8));
    (window as unknown as { electron: unknown }).electron = { buildWasmPreview };
});

afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.useRealTimers();
});

// An instrument whose filter exposes 'cutoff' (instant set-param path)
// and whose oscillator frequency is NOT exposed (rebuild path).
const makeInstrument = (freq = 440, cutoff = 800): Node => ({
    id: 'inst-1',
    type: 'instrument',
    position: { x: 0, y: 0 },
    data: {
        name: 'Bass',
        voiceCount: 4,
        subgraph: {
            nodes: [
                { id: 'osc', type: 'oscillator', position: { x: 0, y: 0 }, data: { label: 'Osc', waveform: 'Sine', frequency: freq, amplitude: 0.5 } },
                { id: 'flt', type: 'filter', position: { x: 0, y: 0 }, data: { label: 'Filter', type: 'Lowpass', cutoff, resonance: 1, exposedParameters: ['cutoff'] } },
                { id: 'out', type: 'InstrumentOutput', position: { x: 0, y: 0 }, data: { label: 'Out', name: 'output' } },
            ],
            connections: [
                { from_node: 'osc', from_port: 'output', to_node: 'flt', to_port: 'input' },
                { from_node: 'flt', from_port: 'output', to_node: 'out', to_port: 'input' },
            ],
        },
    },
} as unknown as Node);

const noopStep = () => undefined;
const identityScale = (n: number) => n;

const renderEngine = (nodes: Node[], tracks: SequencerTrack[] = [], masterVolume = 1.0) =>
    renderHook(
        ({ n }: { n: Node[] }) =>
            useWasmAudioEngine(n, [] as Edge[], false, 120, tracks, noopStep, 16, identityScale, masterVolume),
        { initialProps: { n: nodes } }
    );

describe('useWasmAudioEngine — Play error path', () => {
    it('rejects Play with no instruments: no worklet is built and the AudioContext does not leak', async () => {
        const { result } = renderEngine([
            { id: 'lonely-gain', type: 'gain', position: { x: 0, y: 0 }, data: { gain: 0.5 } } as unknown as Node,
        ]);

        await act(async () => { await result.current.handlePlay(); });

        // Build was never dispatched — the empty-instruments check fires first.
        expect(buildWasmPreview).not.toHaveBeenCalled();
        expect(createdWorklets).toHaveLength(0);
        expect(result.current.isPlaying).toBe(false);
        // The context created inside the click gesture is closed, not leaked.
        expect(createdContexts).toHaveLength(1);
        expect(createdContexts[0].close).toHaveBeenCalled();
    });
});

describe('useWasmAudioEngine — start re-entry latch', () => {
    it('a double-click on Play triggers exactly ONE build', async () => {
        const { result } = renderEngine([makeInstrument()]);

        await act(async () => {
            // Two synchronous clicks before the first build resolves. The
            // startInFlight ref latches out the second.
            const p1 = result.current.handlePlay();
            const p2 = result.current.handlePlay();
            await Promise.all([p1, p2]);
        });

        expect(buildWasmPreview).toHaveBeenCalledTimes(1);
        expect(createdWorklets).toHaveLength(1);
        expect(result.current.isPlaying).toBe(true);
    });
});

describe('useWasmAudioEngine — stop during build', () => {
    it('a Stop that lands before the build resolves creates no worklet node', async () => {
        // Hold the build open so we can Stop mid-flight.
        let resolveBuild!: (b: ArrayBuffer) => void;
        buildWasmPreview.mockImplementation(() => new Promise<ArrayBuffer>((res) => { resolveBuild = res; }));

        const { result } = renderEngine([makeInstrument()]);

        // Kick off Play (do not await — the build is parked).
        let playPromise!: Promise<void>;
        act(() => { playPromise = result.current.handlePlay(); });

        // Stop while the build is still parked.
        act(() => { result.current.handleStop(); });

        // Now let the build resolve. handlePlay must notice the context was torn
        // down and bail before constructing a worklet.
        await act(async () => {
            resolveBuild(new ArrayBuffer(8));
            await playPromise;
        });

        expect(createdWorklets).toHaveLength(0);
        expect(result.current.isPlaying).toBe(false);
    });
});

describe('useWasmAudioEngine — live edits while playing', () => {
    const startPlaying = async (nodes: Node[]) => {
        const view = renderEngine(nodes);
        await act(async () => { await view.result.current.handlePlay(); });
        expect(view.result.current.isPlaying).toBe(true);
        expect(buildWasmPreview).toHaveBeenCalledTimes(1);
        return view;
    };

    it('a topology edit (non-exposed param) schedules a debounced rebuild', async () => {
        vi.useFakeTimers();
        const { result, rerender } = await startPlaying([makeInstrument(440)]);

        // Change the oscillator frequency — not an exposed param, so the
        // topology signature changes and a rebuild must be scheduled.
        await act(async () => { rerender({ n: [makeInstrument(220)] }); });

        // Nothing rebuilds until the debounce elapses...
        expect(buildWasmPreview).toHaveBeenCalledTimes(1);
        await act(async () => { await vi.advanceTimersByTimeAsync(250); });

        // ...then the module is rebuilt.
        expect(buildWasmPreview).toHaveBeenCalledTimes(2);

        // The swap must carry raw BYTES, never a compiled WebAssembly.Module:
        // the worklet port silently drops Module payloads (no error, no
        // delivery), which made every live edit a no-op until Stop/Play.
        const swaps = createdWorklets[0].port.postMessage.mock.calls
            .map((c) => c[0]).filter((m: { type: string }) => m.type === 'swap');
        expect(swaps).toHaveLength(1);
        expect(swaps[0].bytes).toBeInstanceOf(ArrayBuffer);
        expect('module' in swaps[0]).toBe(false);
    });

    it('a failed rebuild flags the preview STALE (old module still playing) and a later success clears it', async () => {
        vi.useFakeTimers();
        const { result, rerender } = await startPlaying([makeInstrument(440)]);
        expect(result.current.previewStale).toBeNull();

        // Break the next build (e.g. a half-wired graph mid-edit).
        buildWasmPreview.mockRejectedValueOnce(new Error('codegen: broken wire'));
        await act(async () => { rerender({ n: [makeInstrument(220)] }); });
        await act(async () => { await vi.advanceTimersByTimeAsync(250); });

        // The engine keeps playing the previous module but SAYS so.
        expect(result.current.isPlaying).toBe(true);
        expect(result.current.previewStale).toContain('codegen: broken wire');

        // Next successful rebuild clears the stale flag.
        await act(async () => { rerender({ n: [makeInstrument(330)] }); });
        await act(async () => { await vi.advanceTimersByTimeAsync(250); });
        expect(result.current.previewStale).toBeNull();
    });

    it('a failed Play surfaces previewError instead of dying console-only', async () => {
        buildWasmPreview.mockRejectedValueOnce(new Error('Odin compiler not found'));
        const { result } = renderEngine([makeInstrument()]);

        await act(async () => { await result.current.handlePlay(); });

        expect(result.current.isPlaying).toBe(false);
        expect(result.current.previewError).toContain('Odin compiler not found');
    });

    it('a rebuild queued during a slow in-flight build uses the LATEST graph, not the graph captured when the slow build started', async () => {
        vi.useFakeTimers();
        const { rerender } = await startPlaying([makeInstrument(440)]);

        // Park the next build (the first rebuild) so edits land mid-flight.
        let resolveSlow!: (b: ArrayBuffer) => void;
        buildWasmPreview.mockImplementationOnce(
            () => new Promise<ArrayBuffer>((res) => { resolveSlow = res; })
        );

        // Edit 1: freq 220 → debounce fires → slow build starts (it captured
        // the 220 graph).
        await act(async () => { rerender({ n: [makeInstrument(220)] }); });
        await act(async () => { await vi.advanceTimersByTimeAsync(250); });
        expect(buildWasmPreview).toHaveBeenCalledTimes(2);

        // Edit 2 while that build is still in flight: freq 330. Its debounce
        // fires during the flight, so the rebuild gets QUEUED.
        await act(async () => { rerender({ n: [makeInstrument(330)] }); });
        await act(async () => { await vi.advanceTimersByTimeAsync(250); });
        expect(buildWasmPreview).toHaveBeenCalledTimes(2); // still queued

        // Slow build resolves; the queued rebuild then runs after its
        // debounce. It MUST serialize the 330 graph — the stale-closure bug
        // rebuilt the 220 graph here, leaving the preview permanently playing
        // a graph that is not on screen, with no stale warning.
        await act(async () => { resolveSlow(new ArrayBuffer(8)); });
        await act(async () => { await vi.advanceTimersByTimeAsync(250); });

        expect(buildWasmPreview).toHaveBeenCalledTimes(3);
        const lastPayload = String(buildWasmPreview.mock.calls[2][0]);
        expect(lastPayload).toContain('"frequency":330');
        expect(lastPayload).not.toContain('"frequency":220');
    });

    it('a uniquely-exposed param edit applies via set-param WITHOUT rebuilding', async () => {
        vi.useFakeTimers();
        const { result, rerender } = await startPlaying([makeInstrument(440, 800)]);
        const port = createdWorklets[0].port;
        port.postMessage.mockClear();

        // Change only the exposed 'cutoff'. The signature masks exposed
        // values, so this must take the instant set-param channel, not a rebuild.
        await act(async () => { rerender({ n: [makeInstrument(440, 4000)] }); });
        await act(async () => { await vi.advanceTimersByTimeAsync(250); });

        expect(buildWasmPreview).toHaveBeenCalledTimes(1); // no rebuild
        const setParamCalls = port.postMessage.mock.calls
            .map((c) => c[0])
            .filter((m: { type: string }) => m.type === 'set-param');
        expect(setParamCalls).toHaveLength(1);
        expect(setParamCalls[0].value).toBe(4000);
        // Node-scoped key: the generated set_param dispatch accepts
        // "<nodeId>::<param>" for every exposed param.
        expect(new TextDecoder().decode(setParamCalls[0].nameBytes)).toBe('flt::cutoff');
        void result;
    });

    it('an exposed param edited to a value the f32 path cannot carry (NaN) falls back to a REBUILD instead of vanishing', async () => {
        vi.useFakeTimers();
        const { rerender } = await startPlaying([makeInstrument(440, 800)]);
        const port = createdWorklets[0].port;
        port.postMessage.mockClear();

        // Drag the exposed cutoff to NaN (e.g. a corrupt control state).
        await act(async () => { rerender({ n: [makeInstrument(440, NaN)] }); });
        await act(async () => { await vi.advanceTimersByTimeAsync(250); });

        // The instant path must NOT post it into the worklet...
        const setParamCalls = port.postMessage.mock.calls
            .map((c) => c[0]).filter((m: { type: string }) => m.type === 'set-param');
        expect(setParamCalls).toHaveLength(0);
        // ...and the edit must not be dropped on the floor either: the
        // topology signature leaves the value unmasked, so the debounced
        // rebuild fires. Before canApplyParamLive took the value, NEITHER
        // happened — the signature masked the value while the instant path
        // skipped it, so the edit changed nothing until an unrelated rebuild
        // (the silent-failure shape of F-C1-3).
        expect(buildWasmPreview).toHaveBeenCalledTimes(2);
    });

    it('a param-dropped report from the worklet (the knob did nothing) surfaces as previewStale, not as a fatal error', async () => {
        const { result } = await startPlaying([makeInstrument()]);
        const port = createdWorklets[0].port;
        expect(result.current.previewStale).toBeNull();

        // The worklet reports that skald_set_param rejected the key — the
        // exact shape a stale build without the "::" alias produces (SKB-001).
        act(() => {
            port.onmessage?.({
                data: { type: 'param-dropped', key: 'flt::cutoff', reason: 'the running module did not accept this parameter (stale or mismatched build?)' },
            } as MessageEvent);
        });

        // Same surfacing channel as a failed rebuild: what you hear is not
        // the graph on screen. Playback itself is fine, so NOT previewError.
        expect(result.current.previewStale).toContain('flt::cutoff');
        expect(result.current.previewError).toBeNull();
        expect(result.current.isPlaying).toBe(true);
    });

    // Regression: BUGS.md "Normal Sax" — multiple filters exposing the SAME
    // param names (cutoff/resonance). These edits used to be skipped by the
    // instant path (only uniquely-exposed names were addressable) and fell
    // back to a debounced rebuild, so a filter knob only became audible at
    // the next note/pass. Node-scoped keys make every instance live.
    it('a COLLIDING exposed param edit (multi-filter sax shape) still applies instantly, no rebuild', async () => {
        vi.useFakeTimers();
        // Sax-shaped instrument: two filters, both exposing cutoff+resonance.
        const makeSax = (formantCutoff: number): Node => ({
            id: 'inst-sax',
            type: 'instrument',
            position: { x: 0, y: 0 },
            data: {
                name: 'Sax',
                voiceCount: 4,
                subgraph: {
                    nodes: [
                        { id: 'reed', type: 'oscillator', position: { x: 0, y: 0 }, data: { label: 'Reed', waveform: 'Sawtooth', frequency: 440, amplitude: 0.5, exposedParameters: ['amplitude'] } },
                        { id: 'body', type: 'filter', position: { x: 0, y: 0 }, data: { label: 'Body', type: 'Lowpass', cutoff: 1600, resonance: 1.2, exposedParameters: ['cutoff', 'resonance'] } },
                        { id: 'formant', type: 'filter', position: { x: 0, y: 0 }, data: { label: 'Formant', type: 'Bandpass', cutoff: formantCutoff, resonance: 2.5, exposedParameters: ['cutoff', 'resonance'] } },
                        { id: 'out', type: 'InstrumentOutput', position: { x: 0, y: 0 }, data: { label: 'Out', name: 'output' } },
                    ],
                    connections: [
                        { from_node: 'reed', from_port: 'output', to_node: 'body', to_port: 'input' },
                        { from_node: 'reed', from_port: 'output', to_node: 'formant', to_port: 'input' },
                        { from_node: 'body', from_port: 'output', to_node: 'out', to_port: 'input' },
                        { from_node: 'formant', from_port: 'output', to_node: 'out', to_port: 'input' },
                    ],
                },
            },
        } as unknown as Node);

        const { rerender } = await startPlaying([makeSax(1100)]);
        const port = createdWorklets[0].port;
        port.postMessage.mockClear();

        // Drag the SECOND filter's cutoff while playing.
        await act(async () => { rerender({ n: [makeSax(2200)] }); });
        await act(async () => { await vi.advanceTimersByTimeAsync(250); });

        // No rebuild: the edit must not kill sounding voices or wait for
        // codegen — it applies through the running module.
        expect(buildWasmPreview).toHaveBeenCalledTimes(1);
        const setParamCalls = port.postMessage.mock.calls
            .map((c) => c[0])
            .filter((m: { type: string }) => m.type === 'set-param');
        expect(setParamCalls).toHaveLength(1);
        expect(new TextDecoder().decode(setParamCalls[0].nameBytes)).toBe('formant::cutoff');
        expect(setParamCalls[0].value).toBe(2200);
    });
});

describe('useWasmAudioEngine — isBuilding status (roadmap A7 item 3)', () => {
    it('is true only while the initial Play build is actually in flight', async () => {
        let resolveBuild!: (b: ArrayBuffer) => void;
        buildWasmPreview.mockImplementation(() => new Promise<ArrayBuffer>((res) => { resolveBuild = res; }));

        const { result } = renderEngine([makeInstrument()]);
        expect(result.current.isBuilding).toBe(false);

        let playPromise!: Promise<void>;
        act(() => { playPromise = result.current.handlePlay(); });
        expect(result.current.isBuilding).toBe(true);

        await act(async () => {
            resolveBuild(new ArrayBuffer(8));
            await playPromise;
        });
        expect(result.current.isBuilding).toBe(false);
        expect(result.current.isPlaying).toBe(true);
    });

    it('is true only while a hot-swap rebuild is actually in flight, and clears even when the rebuild fails', async () => {
        vi.useFakeTimers();
        const { result, rerender } = renderEngine([makeInstrument(440)]);
        await act(async () => { await result.current.handlePlay(); });
        expect(result.current.isBuilding).toBe(false);

        let resolveRebuild!: (b: ArrayBuffer) => void;
        buildWasmPreview.mockImplementationOnce(
            () => new Promise<ArrayBuffer>((res) => { resolveRebuild = res; })
        );

        await act(async () => { rerender({ n: [makeInstrument(220)] }); });
        await act(async () => { await vi.advanceTimersByTimeAsync(250); });
        // Debounce elapsed and the rebuild is now parked mid-flight.
        expect(result.current.isBuilding).toBe(true);

        await act(async () => { resolveRebuild(new ArrayBuffer(8)); });
        expect(result.current.isBuilding).toBe(false);
    });

    it('clears even when the initial Play build fails outright', async () => {
        buildWasmPreview.mockRejectedValueOnce(new Error('Odin compiler not found'));
        const { result } = renderEngine([makeInstrument()]);

        await act(async () => { await result.current.handlePlay(); });

        expect(result.current.isBuilding).toBe(false);
        expect(result.current.previewError).toContain('Odin compiler not found');
    });
});

describe('useWasmAudioEngine — stop→play stale-swap race (F-B09b-6)', () => {
    it('a rebuild that resolves AFTER Stop→Play never swaps its stale module into the new session\'s worklet', async () => {
        vi.useFakeTimers();

        // --- Session 1: play, then edit so a rebuild starts... slowly. ---
        const { result, rerender } = renderHook(
            ({ n }: { n: Node[] }) =>
                useWasmAudioEngine(n, [] as Edge[], false, 120, [], noopStep, 16, identityScale, 1.0),
            { initialProps: { n: [makeInstrument(440)] } }
        );
        await act(async () => { await result.current.handlePlay(); });
        expect(createdWorklets).toHaveLength(1);
        expect(buildWasmPreview).toHaveBeenCalledTimes(1);

        // Park the rebuild triggered by the next edit. Its bytes are
        // distinguishable so a leak is provable.
        const staleBytes = new ArrayBuffer(64);
        let resolveStaleRebuild!: (b: ArrayBuffer) => void;
        buildWasmPreview.mockImplementationOnce(
            () => new Promise<ArrayBuffer>((res) => { resolveStaleRebuild = res; })
        );
        await act(async () => { rerender({ n: [makeInstrument(220)] }); });
        await act(async () => { await vi.advanceTimersByTimeAsync(250); });
        expect(buildWasmPreview).toHaveBeenCalledTimes(2); // stale rebuild in flight

        // --- Stop, then immediately Play again (session 2, new worklet). ---
        act(() => { result.current.handleStop(); });
        await act(async () => { await result.current.handlePlay(); });
        expect(buildWasmPreview).toHaveBeenCalledTimes(3); // session 2's own build
        expect(createdWorklets).toHaveLength(2);
        const session2Port = createdWorklets[1].port;
        session2Port.postMessage.mockClear();

        // --- The promises resolve OUT of lineage order: the pre-stop rebuild
        // completes only now, AFTER session 2 is already live. ---
        await act(async () => { resolveStaleRebuild(staleBytes); });
        await act(async () => { await vi.advanceTimersByTimeAsync(250); });

        // The stale module must never reach the live graph. Before the
        // rebuild-generation id, the only guard was `workletNode.current`
        // being non-null — which session 2's worklet SATISFIES, so the
        // pre-stop graph's bytes were hot-swapped into the new session and
        // the user briefly heard a patch that was no longer on screen.
        const swaps = session2Port.postMessage.mock.calls
            .map((c) => c[0]).filter((m: { type: string }) => m.type === 'swap');
        expect(swaps).toHaveLength(0);

        // And the stale completion must not poison session 2's health flags.
        expect(result.current.previewStale).toBeNull();
        expect(result.current.isPlaying).toBe(true);
    });
});

// SKB-011: master volume must apply INSIDE the DSP graph (skald_set_master_
// volume), at the same point the export applies it, not through a post-
// worklet JS GainNode. These pin the hook's side of that contract — that the
// worklet is CONSTRUCTED with the current fader value and that changes are
// pushed live via postMessage, the same shape as the `loop` flag. The
// end-to-end proof that the real worklet code actually calls
// skald_set_master_volume (in the right order, and survives a hot-swap)
// lives in MasterVolumeLive.test.tsx, which drives the real
// skaldWasmProcessorString against a wasm-shim stand-in.
describe('useWasmAudioEngine — master volume (SKB-011)', () => {
    const renderEngineWithVolume = (nodes: Node[], masterVolume: number) =>
        renderHook(
            ({ n, mv }: { n: Node[]; mv: number }) =>
                useWasmAudioEngine(n, [] as Edge[], false, 120, [], noopStep, 16, identityScale, mv),
            { initialProps: { n: nodes, mv: masterVolume } }
        );

    it('Play constructs the worklet with the current slider value in processorOptions.masterVolume', async () => {
        const { result } = renderEngineWithVolume([makeInstrument()], 0.42);

        await act(async () => { await result.current.handlePlay(); });

        expect(createdWorklets).toHaveLength(1);
        expect(createdWorklets[0].opts.processorOptions?.masterVolume).toBe(0.42);
    });

    it('masterVolume = 0 is passed through as a real 0, not dropped as falsy', async () => {
        const { result } = renderEngineWithVolume([makeInstrument()], 0);

        await act(async () => { await result.current.handlePlay(); });

        // Exact 0, and specifically not `undefined` (which the worklet would
        // read as "absent" and default to 1.0 — the SKB-004 failure shape).
        expect(createdWorklets[0].opts.processorOptions?.masterVolume).toBe(0);
    });

    it('a live masterVolume change while playing posts set-master-volume to the worklet port', async () => {
        const { result, rerender } = renderEngineWithVolume([makeInstrument()], 0.5);
        await act(async () => { await result.current.handlePlay(); });
        const port = createdWorklets[0].port;
        port.postMessage.mockClear();

        await act(async () => { rerender({ n: [makeInstrument()], mv: 0.8 }); });

        const calls = port.postMessage.mock.calls
            .map((c) => c[0])
            .filter((m: { type: string }) => m.type === 'set-master-volume');
        expect(calls).toHaveLength(1);
        expect(calls[0].value).toBe(0.8);
    });
});
