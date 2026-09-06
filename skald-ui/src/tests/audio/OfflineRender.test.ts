// Roadmap G1 (§9.12 item 1) — faster-than-realtime offline bounce.
//
// The claim the bounce makes to the user is not "here is some audio", it is
// "here is what you were just listening to". That claim is only worth
// anything if it is checked, so the centrepiece here is an equality test:
// the SAME wasm exports are driven through the real AudioWorkletProcessor
// source (skaldWasmProcessorString, evaluated the way WasmWorkletGuard and
// NonfiniteFlushLive already do) and through renderOffline, and the two
// buffers must be sample-for-sample identical. Master volume, the DC blocker
// and the soft limiter are all inside skald_process, so nothing in this file
// re-implements any of them — that is the whole reason the bounce goes
// through skald_process instead of summing assets itself.
import { describe, it, expect, vi, afterEach } from 'vitest';
import {
    renderOffline,
    renderOfflineChunked,
    framesForBars,
    barsForPatternSteps,
    MAX_TAIL_SECONDS,
    OFFLINE_BLOCK_FRAMES,
} from '../../audio/offlineRender';
import { skaldWasmProcessorString } from '../../hooks/nodeEditor/audioWorklets/skaldWasm.worklet';

/**
 * A stand-in for the generated shim. `skald_process(n)` writes n frames of a
 * deterministic, module-state-dependent signal into the left/right buffers,
 * so two runs of the same module agree and a path that skipped or duplicated
 * a block cannot pass by accident.
 */
const makeShim = (opts: { assetCount?: number; playingFrames?: number } = {}) => {
    const assetCount = opts.assetCount ?? 1;
    // playingFrames: how long skald_is_playing keeps reporting 1 after
    // start_all, standing in for a pattern plus its release tail.
    const playingFrames = opts.playingFrames ?? Number.POSITIVE_INFINITY;
    const LEFT_PTR = 4096;
    const RIGHT_PTR = 8192;
    const memory = { buffer: new ArrayBuffer(65536) };
    let frame = 0;
    let stopped = false;
    const volumes: number[] = new Array(assetCount).fill(1);
    const calls: string[] = [];
    const exports = {
        memory,
        skald_init: vi.fn((rate: number) => {
            calls.push(`init:${rate}`);
            frame = 0;
            stopped = false;
        }),
        skald_start_all: vi.fn(() => calls.push('start_all')),
        skald_stop_all: vi.fn(() => {
            calls.push('stop_all');
            stopped = true;
        }),
        skald_asset_count: () => assetCount,
        skald_set_loop: vi.fn((a: number, loop: number) => calls.push(`set_loop:${a}:${loop}`)),
        skald_set_master_volume: vi.fn((v: number) => calls.push(`master:${v}`)),
        skald_set_volume: vi.fn((a: number, v: number) => {
            volumes[a] = v;
            calls.push(`volume:${a}:${v}`);
        }),
        skald_is_playing: () => (stopped && frame >= playingFrames ? 0 : 1),
        skald_get_step: () => 0,
        skald_get_step_wait: () => 0,
        skald_seek: vi.fn(),
        skald_left_ptr: () => LEFT_PTR,
        skald_right_ptr: () => RIGHT_PTR,
        skald_name_buf_ptr: () => 1024,
        skald_set_param: vi.fn(() => 1),
        skald_note_on: vi.fn(),
        skald_note_off: vi.fn(),
        skald_trigger: vi.fn(),
        skald_process: vi.fn((n: number) => {
            calls.push('process');
            const left = new Float32Array(memory.buffer, LEFT_PTR, n);
            const right = new Float32Array(memory.buffer, RIGHT_PTR, n);
            const gain = volumes.reduce((sum, v) => sum + v, 0) / assetCount;
            for (let i = 0; i < n; i++) {
                left[i] = Math.sin(frame * 0.01) * gain;
                right[i] = Math.cos(frame * 0.013) * gain;
                frame++;
            }
            return n;
        }),
    };
    return { exports, calls, framesRendered: () => frame };
};

/** Point global WebAssembly at a shim so both paths instantiate the same thing. */
const stubWebAssembly = (shimExports: Record<string, unknown>) => {
    const original = globalThis.WebAssembly;
    (globalThis as { WebAssembly: unknown }).WebAssembly = {
        Module: class { constructor(public bytes: unknown) {} },
        Instance: class { exports = shimExports; },
    };
    return () => { (globalThis as { WebAssembly: unknown }).WebAssembly = original; };
};

let restoreWasm: (() => void) | null = null;
afterEach(() => {
    restoreWasm?.();
    restoreWasm = null;
});

/** Evaluate the REAL worklet source and return the constructed processor. */
const makeWorkletProcessor = (processorOptions: Record<string, unknown>, shimExports: Record<string, unknown>) => {
    let captured: (new (options: unknown) => any) | null = null;
    class FakeAudioWorkletProcessor {
        port = { onmessage: null, onmessageerror: null, postMessage: vi.fn() };
    }
    const registerProcessor = (_name: string, cls: new (options: unknown) => any) => { captured = cls; };
    const FakeWebAssembly = {
        Module: class { constructor(public bytes: unknown) {} },
        Instance: class { exports = shimExports; },
    };
    new Function('AudioWorkletProcessor', 'registerProcessor', 'sampleRate', 'WebAssembly', skaldWasmProcessorString)(
        FakeAudioWorkletProcessor,
        registerProcessor,
        48000,
        FakeWebAssembly,
    );
    expect(captured).not.toBeNull();
    return new captured!({ processorOptions });
};

describe('bounce length', () => {
    it('a bar is four beats at the session tempo, in samples', () => {
        // 120 BPM: a beat is 0.5 s, a bar 2 s, so 96000 frames at 48 kHz.
        expect(framesForBars(1, 120, 48000)).toBe(96000);
        expect(framesForBars(4, 120, 48000)).toBe(384000);
        expect(framesForBars(1, 60, 44100)).toBe(44100 * 4);
    });

    it('defaults the bar count from the pattern length, sixteen steps to the bar', () => {
        expect(barsForPatternSteps(16)).toBe(1);
        expect(barsForPatternSteps(32)).toBe(2);
        expect(barsForPatternSteps(64)).toBe(4);
        // A part-bar pattern still bounces at least one whole bar.
        expect(barsForPatternSteps(8)).toBe(1);
        expect(barsForPatternSteps(17)).toBe(2);
    });

    it('clamps a nonsense pattern length into the 1..64 bar range the UI offers', () => {
        expect(barsForPatternSteps(0)).toBe(1);
        expect(barsForPatternSteps(Number.NaN)).toBe(1);
        expect(barsForPatternSteps(100000)).toBe(64);
    });
});

describe('renderOffline', () => {
    it('renders exactly the requested frames, instantiating the module the way the worklet does', () => {
        const shim = makeShim();
        restoreWasm = stubWebAssembly(shim.exports);

        const out = renderOffline({
            bytes: new Uint8Array([0, 97, 115, 109]),
            sampleRate: 48000,
            frames: OFFLINE_BLOCK_FRAMES * 3 + 5,
            masterVolume: 0.75,
        });

        expect(out.left.length).toBe(OFFLINE_BLOCK_FRAMES * 3 + 5);
        expect(out.right.length).toBe(out.left.length);
        expect(out.sampleRate).toBe(48000);
        // Same opening sequence as skaldWasm.worklet.ts::instantiate.
        expect(shim.calls.slice(0, 3)).toEqual(['init:48000', 'master:0.75', 'start_all']);
        expect(shim.calls).toContain('set_loop:0:1');
        // The shim caps a call at 128 frames; a bounce that asked for more in
        // one go would silently drop the remainder into whatever the buffer
        // held from the previous block.
        for (const call of shim.exports.skald_process.mock.calls) {
            expect(call[0]).toBeLessThanOrEqual(OFFLINE_BLOCK_FRAMES);
        }
        expect(shim.framesRendered()).toBe(out.left.length);
    });

    it('is sample-for-sample identical to what the real worklet plays from the same module', () => {
        // THE claim G1 makes. Two independent shims (identical behaviour,
        // separate state) so neither path can be reading the other's leftovers.
        const blocks = 6;
        const workletShim = makeShim();
        const offlineShim = makeShim();

        const proc = makeWorkletProcessor(
            { bytes: new Uint8Array([1]), stepAsset: 0, loop: true, masterVolume: 0.5 },
            workletShim.exports,
        );
        const fromWorklet = { left: [] as number[], right: [] as number[] };
        for (let b = 0; b < blocks; b++) {
            const out = [new Float32Array(OFFLINE_BLOCK_FRAMES), new Float32Array(OFFLINE_BLOCK_FRAMES)];
            proc.process([], [out]);
            fromWorklet.left.push(...out[0]);
            fromWorklet.right.push(...out[1]);
        }

        restoreWasm = stubWebAssembly(offlineShim.exports);
        const bounced = renderOffline({
            bytes: new Uint8Array([1]),
            sampleRate: 48000,
            frames: blocks * OFFLINE_BLOCK_FRAMES,
            masterVolume: 0.5,
        });

        expect(Array.from(bounced.left)).toEqual(fromWorklet.left);
        expect(Array.from(bounced.right)).toEqual(fromWorklet.right);
        // Not a pair of matching silences.
        expect(bounced.left.some((v) => v !== 0)).toBe(true);
    });

    it('with the tail requested, stops the sequencer and keeps rendering until nothing is playing', () => {
        // 200 frames of ring-out after the bars are done.
        const shim = makeShim({ playingFrames: OFFLINE_BLOCK_FRAMES * 4 + 200 });
        restoreWasm = stubWebAssembly(shim.exports);

        const bars = OFFLINE_BLOCK_FRAMES * 4;
        const out = renderOffline({
            bytes: new Uint8Array([1]),
            sampleRate: 48000,
            frames: bars,
            includeTail: true,
        });

        expect(shim.calls).toContain('stop_all');
        expect(out.left.length).toBeGreaterThan(bars);
        // The tail ends where the module says it ended, rounded up to a block.
        expect(out.left.length).toBeLessThanOrEqual(bars + 200 + OFFLINE_BLOCK_FRAMES);
    });

    it('bounds a tail that never ends, so a self-oscillating patch cannot render forever', () => {
        const shim = makeShim(); // is_playing never returns 0
        restoreWasm = stubWebAssembly(shim.exports);

        const out = renderOffline({
            bytes: new Uint8Array([1]),
            sampleRate: 8000,
            frames: 800,
            includeTail: true,
        });

        expect(out.left.length).toBeLessThanOrEqual(800 + MAX_TAIL_SECONDS * 8000 + OFFLINE_BLOCK_FRAMES);
        expect(out.left.length).toBeGreaterThan(800);
    });

    it('without the tail, the file ends on the last bar and the sequencer is never stopped', () => {
        const shim = makeShim();
        restoreWasm = stubWebAssembly(shim.exports);

        const out = renderOffline({ bytes: new Uint8Array([1]), sampleRate: 48000, frames: 512 });

        expect(out.left.length).toBe(512);
        expect(shim.calls).not.toContain('stop_all');
    });

    it('applies per-asset volumes before the first frame, which is how a stem isolates one instrument', () => {
        const shim = makeShim({ assetCount: 3 });
        restoreWasm = stubWebAssembly(shim.exports);

        renderOffline({
            bytes: new Uint8Array([1]),
            sampleRate: 48000,
            frames: 128,
            assetVolumes: [0, 1, 0],
        });

        expect(shim.exports.skald_set_volume).toHaveBeenCalledTimes(3);
        // Every volume must land BEFORE the first block, or that block leaks
        // the other instruments into the stem — a defect you would only hear
        // in the first 2.7 ms of the file and would never think to look for.
        const lastVolume = shim.calls.map((c) => c.startsWith('volume:')).lastIndexOf(true);
        const firstProcess = shim.calls.indexOf('process');
        expect(firstProcess).toBeGreaterThan(lastVolume);
        expect(shim.calls.filter((c) => c.startsWith('volume:'))).toEqual([
            'volume:0:0', 'volume:1:1', 'volume:2:0',
        ]);
    });

    it('reports progress and honours a cancel between blocks', () => {
        const shim = makeShim();
        restoreWasm = stubWebAssembly(shim.exports);
        const seen: number[] = [];

        const out = renderOffline({
            bytes: new Uint8Array([1]),
            sampleRate: 48000,
            frames: OFFLINE_BLOCK_FRAMES * 10,
            onProgress: (done, total) => {
                seen.push(done / total);
                return done < OFFLINE_BLOCK_FRAMES * 3; // false = cancel
            },
        });

        expect(out.canceled).toBe(true);
        expect(out.left.length).toBeLessThan(OFFLINE_BLOCK_FRAMES * 10);
        expect(seen.length).toBeGreaterThan(0);
    });
});

describe('renderOfflineChunked', () => {
    // The UI driver yields to the event loop between chunks so the busy
    // indicator paints and Cancel stays clickable. It must be the SAME render:
    // if pumping the job in slices could change where a tail ends or drop a
    // block at a chunk boundary, every bounce the user actually makes would
    // differ from the one the equality test above proved correct.
    it('is byte-identical to the synchronous render of the same module', async () => {
        const syncShim = makeShim({ playingFrames: 5000 });
        restoreWasm = stubWebAssembly(syncShim.exports);
        const opts = { bytes: new Uint8Array([1]), sampleRate: 8000, frames: 4000, includeTail: true };
        const fromSync = renderOffline(opts);
        restoreWasm();

        const chunkShim = makeShim({ playingFrames: 5000 });
        restoreWasm = stubWebAssembly(chunkShim.exports);
        const fromChunked = await renderOfflineChunked(opts);

        expect(fromChunked.left.length).toBe(fromSync.left.length);
        expect(Array.from(fromChunked.left)).toEqual(Array.from(fromSync.left));
        expect(Array.from(fromChunked.right)).toEqual(Array.from(fromSync.right));
    });

    it('stops where Cancel says, and hands back what was rendered rather than throwing it away', async () => {
        const shim = makeShim();
        restoreWasm = stubWebAssembly(shim.exports);

        const out = await renderOfflineChunked({
            bytes: new Uint8Array([1]),
            sampleRate: 48000,
            frames: 48000 * 20,
            onProgress: () => false,
        });

        expect(out.canceled).toBe(true);
        expect(out.left.length).toBeGreaterThan(0);
        expect(out.left.length).toBeLessThan(48000 * 20);
    });
});
