// @vitest-environment jsdom
//
// SKB-023 acceptance fixture: notes held down across a hot-swap.
//
// Editing the graph while playing rebuilds the wasm module and swaps it into
// the running worklet. The new module starts with an empty voice pool, so a
// note the player was still holding went silent the moment they touched the
// canvas and stayed silent until they released the key and pressed it again —
// the module was fine, the engine had simply forgotten the keyboard was down.
//
// Like MasterVolumeLive.test.tsx, this drives the REAL worklet source
// (skaldWasmProcessorString) against a stand-in for the generated shim, so it
// proves the whole host path: a MIDI note-on is recorded as held, the swap
// installs a new module, and the note is re-sent INTO THAT MODULE. The shim
// clears its note log inside skald_init — which the worklet calls on every
// instantiate — so "did the NEW module hear it" is answerable rather than
// inferred from a running total.
//
// The three ways this can go wrong, all covered below: not replaying at all
// (the bug), replaying a note the player already released (a phantom sustain),
// and replaying into a module that failed to build (the previewStale/amber
// case, where the OLD module is still sounding and a second note-on doubles
// every held voice instead of restoring it).
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { Node, Edge } from '@xyflow/react';
import { useWasmAudioEngine } from '../../hooks/nodeEditor/useWasmAudioEngine';
import { skaldWasmProcessorString } from '../../hooks/nodeEditor/audioWorklets/skaldWasm.worklet';
import { SequencerTrack } from '../../definitions/types';

const NAME_BUF_PTR = 1024;

type NoteOnCall = { asset: number; note: number; velocity: number; duration: number };

// Mirrors the generated shim's exports surface (codegen_project.odin). The
// note log is cleared by skald_init rather than by the test, because that is
// exactly what the real module does to its voice pool: instantiate() calls
// skald_init on the initial build AND on every hot-swap, so anything in the
// log afterwards was sent to the module that is currently installed.
const makeShim = () => {
    const memory = { buffer: new ArrayBuffer(65536) };
    let notesSinceInit: NoteOnCall[] = [];
    let noteOffsSinceInit: number[] = [];
    let initCount = 0;
    const exports = {
        memory,
        skald_init: vi.fn(() => {
            initCount += 1;
            notesSinceInit = [];
            noteOffsSinceInit = [];
        }),
        skald_start_all: vi.fn(),
        skald_stop_all: vi.fn(),
        skald_asset_count: () => 1,
        skald_set_loop: vi.fn(),
        skald_is_playing: () => 1,
        skald_get_step: () => 0,
        skald_get_step_wait: () => 0,
        skald_seek: vi.fn(),
        skald_left_ptr: () => 4096,
        skald_right_ptr: () => 8192,
        skald_name_buf_ptr: () => NAME_BUF_PTR,
        skald_process: vi.fn(),
        skald_note_on: vi.fn((asset: number, note: number, velocity: number, duration: number) => {
            notesSinceInit.push({ asset, note, velocity, duration });
        }),
        skald_note_off: vi.fn((_asset: number, note: number) => {
            noteOffsSinceInit.push(note);
        }),
        skald_trigger: vi.fn(),
        skald_set_param: vi.fn(() => 1),
        skald_set_master_volume: vi.fn(),
        skald_get_master_volume: () => 1.0,
    };
    return {
        exports,
        notesSinceInit: () => notesSinceInit,
        noteOffsSinceInit: () => noteOffsSinceInit,
        initCount: () => initCount,
    };
};

// Evaluate the REAL worklet source with the worklet globals stubbed and
// WebAssembly shadowed — same technique as MasterVolumeLive.test.tsx.
const instantiateWorkletProcessor = (
    processorOptions: Record<string, unknown>,
    shimExports: Record<string, unknown>
) => {
    let captured: (new (options: unknown) => any) | null = null;
    class FakeAudioWorkletProcessor {
        port: { onmessage: ((e: { data: unknown }) => void) | null; onmessageerror: unknown; postMessage: (m: unknown) => void } = {
            onmessage: null,
            onmessageerror: null,
            postMessage: () => undefined,
        };
    }
    const registerProcessor = (_name: string, cls: new (options: unknown) => any) => {
        captured = cls;
    };
    const FakeWebAssembly = {
        Module: class { constructor(public bytes: unknown) {} },
        Instance: class { exports = shimExports; },
    };
    new Function('AudioWorkletProcessor', 'registerProcessor', 'sampleRate', 'WebAssembly', skaldWasmProcessorString)(
        FakeAudioWorkletProcessor,
        registerProcessor,
        48000,
        FakeWebAssembly
    );
    expect(captured).not.toBeNull();
    return new captured!({ processorOptions });
};

let activeShim: ReturnType<typeof makeShim> | null = null;
const createdNodes: EndToEndWorkletNode[] = [];

// An AudioWorkletNode whose port is genuinely wired to a live processor, so a
// postMessage from the hook really runs the worklet code — including the
// structured-clone-shaped payloads the port is fussy about.
class EndToEndWorkletNode {
    port: {
        onmessage: ((e: { data: unknown }) => void) | null;
        onmessageerror: unknown;
        postMessage: (m: unknown, transfer?: unknown[]) => void;
    };
    processor: any;
    connect = vi.fn();

    constructor(_ctx: unknown, _name: string, opts: { processorOptions: Record<string, unknown> }) {
        if (!activeShim) throw new Error('test forgot to set activeShim');
        this.processor = instantiateWorkletProcessor(opts.processorOptions, activeShim.exports);
        this.port = {
            onmessage: null,
            onmessageerror: null,
            postMessage: (m: unknown) => { this.processor.port.onmessage?.({ data: m }); },
        };
        this.processor.port.postMessage = (m: unknown) => { this.port.onmessage?.({ data: m }); };
        createdNodes.push(this);
    }
}

class FakeAudioContext {
    state = 'running';
    currentTime = 0;
    destination = {};
    audioWorklet = { addModule: vi.fn().mockResolvedValue(undefined) };
    createGain = vi.fn(() => ({ connect: vi.fn(), gain: { value: 1 } }));
    createAnalyser = vi.fn(() => ({ connect: vi.fn(), fftSize: 0 }));
    createChannelSplitter = vi.fn(() => ({ connect: vi.fn() }));
    resume = vi.fn().mockResolvedValue(undefined);
    close = vi.fn().mockResolvedValue(undefined);
}

// One fake MIDI input the test can push raw status bytes through, so notes
// enter the engine by the same door a real keyboard uses.
type FakeMidiInput = { onmidimessage: ((m: { data: number[] }) => void) | null };
const midiInputs: FakeMidiInput[] = [];

const stubMidi = () => {
    midiInputs.length = 0;
    const input: FakeMidiInput = { onmidimessage: null };
    midiInputs.push(input);
    const access = { inputs: new Map([['midi-in-1', input]]), onstatechange: null as unknown };
    Object.defineProperty(navigator, 'requestMIDIAccess', {
        value: vi.fn(() => Promise.resolve(access)),
        configurable: true,
        writable: true,
    });
};

const MIDI_VELOCITY = 100;
const noteOn = (note: number) => act(() => {
    midiInputs[0].onmidimessage?.({ data: [0x90, note, MIDI_VELOCITY] });
});
const noteOff = (note: number) => act(() => {
    midiInputs[0].onmidimessage?.({ data: [0x80, note, 0] });
});

beforeEach(() => {
    createdNodes.length = 0;
    activeShim = null;
    vi.stubGlobal('AudioContext', FakeAudioContext);
    vi.stubGlobal('AudioWorkletNode', EndToEndWorkletNode);
    (URL as unknown as { createObjectURL: unknown }).createObjectURL = vi.fn(() => 'blob:mock');
    (URL as unknown as { revokeObjectURL: unknown }).revokeObjectURL = vi.fn();
    (window as unknown as { electron: unknown }).electron = {
        buildWasmPreview: vi.fn().mockResolvedValue(new ArrayBuffer(8)),
    };
    stubMidi();
});

afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.useRealTimers();
});

const makeInstrument = (freq = 440): Node => ({
    id: 'inst-1',
    type: 'instrument',
    position: { x: 0, y: 0 },
    data: {
        name: 'Bass',
        voiceCount: 4,
        subgraph: {
            nodes: [
                { id: 'osc', type: 'oscillator', position: { x: 0, y: 0 }, data: { label: 'Osc', waveform: 'Sine', frequency: freq, amplitude: 0.5 } },
                { id: 'out', type: 'InstrumentOutput', position: { x: 0, y: 0 }, data: { label: 'Out', name: 'output' } },
            ],
            connections: [
                { from_node: 'osc', from_port: 'output', to_node: 'out', to_port: 'input' },
            ],
        },
    },
} as unknown as Node);

const noopStep = () => undefined;
const identityScale = (n: number) => n;

const startEngine = async (nodes: Node[] = [makeInstrument()]) => {
    activeShim = makeShim();
    const view = renderHook(
        ({ n }: { n: Node[] }) =>
            useWasmAudioEngine(n, [] as Edge[], false, 120, [] as SequencerTrack[], noopStep, 16, identityScale, 1.0),
        { initialProps: { n: nodes } }
    );
    await act(async () => { await view.result.current.handlePlay(); });
    expect(view.result.current.isPlaying).toBe(true);
    expect(createdNodes).toHaveLength(1);
    // The MIDI listener resolves requestMIDIAccess asynchronously; flush it so
    // the fake input actually has a handler attached.
    await act(async () => { await Promise.resolve(); });
    expect(midiInputs[0].onmidimessage).toBeTypeOf('function');
    return view;
};

// A topology edit (a non-exposed param change) plus the debounce window, which
// is the whole hot-swap path: rebuild -> 'swap' -> instantiate(preserveTransport).
const editAndSwap = async (rerender: (p: { n: Node[] }) => void, freq: number) => {
    await act(async () => { rerender({ n: [makeInstrument(freq)] }); });
    await act(async () => { await vi.advanceTimersByTimeAsync(REBUILD_DEBOUNCE); });
};
const REBUILD_DEBOUNCE = 250;

describe('held notes across a hot-swap (SKB-023)', () => {
    it('replays a note that is still held when the module is swapped', async () => {
        vi.useFakeTimers();
        const { rerender } = await startEngine([makeInstrument(440)]);

        await noteOn(60);
        expect(activeShim!.notesSinceInit()).toHaveLength(1);
        const initsBefore = activeShim!.initCount();

        await editAndSwap(rerender, 220);

        const buildWasmPreview = (window as any).electron.buildWasmPreview as ReturnType<typeof vi.fn>;
        expect(buildWasmPreview).toHaveBeenCalledTimes(2);
        // A swap really happened: instantiate() ran skald_init again, which
        // cleared the note log along with the (simulated) voice pool.
        expect(activeShim!.initCount()).toBe(initsBefore + 1);

        // ...and the held note is back, in the NEW module. Without the replay
        // this is an empty array and the player hears silence until they
        // release and re-press the key.
        const notes = activeShim!.notesSinceInit();
        expect(notes).toHaveLength(1);
        expect(notes[0].note).toBe(60);
        expect(notes[0].velocity).toBeCloseTo(MIDI_VELOCITY / 127, 5);
        // duration 0 is the "hold until note_off" contract; a positive duration
        // would make the replayed voice release on its own.
        expect(notes[0].duration).toBe(0);
    });

    it('does not replay a note the player already released', async () => {
        vi.useFakeTimers();
        const { rerender } = await startEngine([makeInstrument(440)]);

        await noteOn(60);
        await noteOff(60);
        expect(activeShim!.noteOffsSinceInit()).toContain(60);

        await editAndSwap(rerender, 220);

        expect(activeShim!.notesSinceInit()).toHaveLength(0);
    });

    it('replays only the notes still down when several were pressed and some released', async () => {
        vi.useFakeTimers();
        const { rerender } = await startEngine([makeInstrument(440)]);

        await noteOn(60);
        await noteOn(64);
        await noteOn(67);
        await noteOff(64);

        await editAndSwap(rerender, 220);

        const replayed = activeShim!.notesSinceInit().map(n => n.note).sort((a, b) => a - b);
        expect(replayed).toEqual([60, 67]);
    });

    it('does NOT replay when the rebuild fails — the old module is still sounding and would double every voice', async () => {
        vi.useFakeTimers();
        const { result, rerender } = await startEngine([makeInstrument(440)]);

        await noteOn(60);
        expect(activeShim!.notesSinceInit()).toHaveLength(1);
        const initsBefore = activeShim!.initCount();

        // Mid-edit codegen failures are expected and handled by keeping the
        // previous module: previewStale goes amber and nothing is swapped.
        (window as any).electron.buildWasmPreview = vi.fn().mockRejectedValue(new Error('codegen exploded'));
        await editAndSwap(rerender, 220);

        expect(result.current.previewStale).toBeTruthy();
        expect(activeShim!.initCount()).toBe(initsBefore); // no swap happened
        // Still exactly the one note-on the player actually played. A replay
        // here would be a SECOND note-on into the module already holding it.
        expect(activeShim!.notesSinceInit()).toHaveLength(1);
    });

    it('forgets held notes on Stop, so the next session cannot inherit a phantom sustain', async () => {
        vi.useFakeTimers();
        const { result, rerender } = await startEngine([makeInstrument(440)]);

        await noteOn(60);
        act(() => { result.current.handleStop(); });
        expect(result.current.isPlaying).toBe(false);

        await act(async () => { await result.current.handlePlay(); });
        await act(async () => { await Promise.resolve(); });
        const initsBefore = activeShim!.initCount();

        await editAndSwap(rerender, 330);

        expect(activeShim!.initCount()).toBe(initsBefore + 1); // the swap landed
        expect(activeShim!.notesSinceInit()).toHaveLength(0);
    });
});
