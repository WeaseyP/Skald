/*
================================================================================
| FILE: skald-ui/src/audio/offlineRender.ts                                    |
|                                                                              |
| Faster-than-realtime bounce of a Skald project (roadmap G1, §9.12 item 1).   |
|                                                                              |
| WHY THIS IS A LOOP AROUND skald_process AND NOTHING ELSE.                    |
| The generated shim's skald_process is the whole master bus: it sums every    |
| unmuted asset, multiplies by wasm_master_volume, runs skald_dc_block, then   |
| skald_soft_limit, in that order (skald-backend/core/codegen_project.odin::   |
| generate_wasm_shim_code). Every one of those stages therefore comes for      |
| free here, and — more to the point — comes out IDENTICAL to the preview,     |
| because it is the same compiled code running the same way. A bounce that     |
| read per-asset output and did its own mixdown would be a second answer to    |
| "what does this project sound like", and the first time the two disagreed    |
| the user would have no way to tell which one their game will ship with.      |
| OfflineRender.test.ts pins the equality against the real worklet source.     |
|                                                                              |
| The module has no wall clock. skald_init(sample_rate) seeds the float the    |
| step clock divides by (`samples_per_step_f := p.sample_rate*60/(p.bpm*4)`),  |
| and time advances only by frames actually requested — so running the loop    |
| flat out renders an hour of audio in whatever the CPU takes, with the exact  |
| sample values realtime playback would have produced.                         |
|                                                                              |
| This module stays free of DOM, Electron and React: the editor pumps it in    |
| chunks (renderOfflineChunked) and tests call it outright, and both must get  |
| the same numbers. It never runs on the AudioWorklet thread — a bounce that   |
| blocked the audio callback would glitch the very preview it is supposed to   |
| reproduce.                                                                   |
================================================================================
*/
import { skaldWasmImports } from '../hooks/nodeEditor/audioWorklets/skaldWasmImports';

/**
 * Frames per skald_process call. The generated shim clamps its own argument
 * to `SKALD_WASM_BLOCK :: 128` and returns the clamped count; asking for more
 * would silently render fewer frames than the caller then copied out, so the
 * host must not exceed it. Same block size the AudioWorklet runs at, which is
 * also what makes the two paths comparable frame for frame.
 */
export const OFFLINE_BLOCK_FRAMES = 128;

/** Sequencer steps in one bar: the step clock counts 16ths (four to a beat). */
export const STEPS_PER_BAR = 16;

/** Bar counts the bounce UI offers. */
export const MIN_BOUNCE_BARS = 1;
export const MAX_BOUNCE_BARS = 64;

/**
 * Ceiling on the ring-out rendered after the bars are done. A patch with a
 * self-oscillating filter or a reverb at full feedback never reports
 * `skald_is_playing == 0`, and "the bounce hung" is a worse failure than "the
 * bounce is thirty seconds longer than you wanted".
 */
export const MAX_TAIL_SECONDS = 30;

export interface OfflineRenderOptions {
    /** The wasm binary — the same bytes the preview worklet is fed. */
    bytes: BufferSource;
    sampleRate: number;
    /** Frames of sequenced material to render, before any tail. */
    frames: number;
    /**
     * Live master fader position, applied through skald_set_master_volume
     * exactly as the worklet applies it, at the same point in the same graph.
     * The preview build bakes a topology-neutral 1.0 (see useWasmAudioEngine's
     * buildModule) and drives the fader live; the bounce reuses that build, so
     * it must reapply the fader the same way or it would render the patch at
     * unity no matter where the fader sits.
     */
    masterVolume?: number;
    /** Sequencer looping, as the transport is set in the editor. */
    loop?: boolean;
    /**
     * Per-asset volume, indexed the way the shim indexes assets: position in
     * `project.instruments`, which the editor produces via
     * projectSerializer.ts::orderedInstrumentNodes. Used by stem export (G2)
     * to silence every instrument but one.
     *
     * `undefined` at an index means "leave this asset exactly as the build
     * baked it" — which is how a stem keeps the instrument's own authored
     * volume without the host having to re-derive it. The backend is the one
     * reader of an absent volume (`volume <= 0 -> 1.0` in
     * build_project_from_raw); a host-side mirror of that rule would be a
     * second reader, and the stem would drift from the mix the day it changed.
     */
    assetVolumes?: readonly (number | undefined)[];
    /** Render the release/reverb tail after the sequenced bars. */
    includeTail?: boolean;
    /**
     * Called after each block with (framesDone, framesTotal). Return false to
     * cancel; the frames rendered so far are still returned, flagged.
     * framesTotal is an estimate while a tail is being rendered — nothing
     * knows how long a tail is until it ends.
     */
    onProgress?: (framesDone: number, framesTotal: number) => boolean | void;
}

export interface OfflineRenderResult {
    left: Float32Array;
    right: Float32Array;
    sampleRate: number;
    /** True when onProgress asked to stop before the render finished. */
    canceled: boolean;
}

/**
 * Samples in `bars` bars at `bpm`. Mirrors the generated step clock's own
 * arithmetic — `samples_per_step_f := p.sample_rate * 60.0 / (p.bpm * 4.0)`
 * (skald-backend/core/codegen_project.odin) — times sixteen steps to the bar,
 * rather than deriving seconds a second way and rounding differently.
 */
export const framesForBars = (bars: number, bpm: number, sampleRate: number): number => {
    const samplesPerStep = (sampleRate * 60) / (bpm * 4);
    return Math.round(bars * STEPS_PER_BAR * samplesPerStep);
};

/**
 * The bar count the bounce dialog opens on: however many whole bars the
 * project's pattern occupies. A pattern shorter than a bar still bounces one
 * whole bar, because a fractional bar is not something the transport or the
 * user thinks in.
 */
export const barsForPatternSteps = (patternSteps: number): number => {
    if (!Number.isFinite(patternSteps) || patternSteps <= 0) return MIN_BOUNCE_BARS;
    const bars = Math.ceil(patternSteps / STEPS_PER_BAR);
    return Math.min(MAX_BOUNCE_BARS, Math.max(MIN_BOUNCE_BARS, bars));
};

/** The generated shim's export surface, as much of it as a bounce touches. */
interface SkaldExports {
    memory: WebAssembly.Memory;
    skald_init: (sampleRate: number) => void;
    skald_set_master_volume: (value: number) => void;
    skald_start_all: () => void;
    skald_stop_all: () => void;
    skald_asset_count: () => number;
    skald_set_loop: (asset: number, loop: number) => void;
    skald_set_volume: (asset: number, value: number) => void;
    skald_is_playing: (asset: number) => number;
    skald_left_ptr: () => number;
    skald_right_ptr: () => number;
    skald_process: (frames: number) => number;
}

/**
 * Instantiate a Skald wasm module the way the AudioWorkletProcessor does.
 *
 * The order matters and is copied from skaldWasm.worklet.ts::instantiate:
 * skald_init reseeds wasm_master_volume from the value baked into the build,
 * so the live fader has to be reapplied AFTER it, not before — same reason
 * the worklet reapplies loop state per asset instead of trusting the fresh
 * module's defaults.
 */
const instantiateForRender = (
    bytes: BufferSource,
    sampleRate: number,
    masterVolume: number,
    loop: boolean,
    assetVolumes?: readonly (number | undefined)[],
): SkaldExports => {
    const module = new WebAssembly.Module(bytes as BufferSource);
    const ex = new WebAssembly.Instance(module, skaldWasmImports()).exports as unknown as SkaldExports;
    ex.skald_init(sampleRate);
    ex.skald_set_master_volume(masterVolume);
    ex.skald_start_all();
    const assetCount = ex.skald_asset_count();
    for (let a = 0; a < assetCount; a++) {
        ex.skald_set_loop(a, loop ? 1 : 0);
        // Applied before the first block, never per block: a stem whose
        // silencing landed one block late would carry 2.7 ms of the rest of
        // the mix at its head.
        const v = assetVolumes?.[a];
        if (v !== undefined) ex.skald_set_volume(a, v);
    }
    return ex;
};

/** True while any asset still has a voice, a sequencer or an effect tail running. */
const anyAssetPlaying = (ex: SkaldExports): boolean => {
    const count = ex.skald_asset_count();
    for (let a = 0; a < count; a++) {
        if (ex.skald_is_playing(a) === 1) return true;
    }
    return false;
};

/**
 * A bounce in progress, resumable a slice at a time.
 *
 * The render itself has to be one uninterrupted walk of the module (its state
 * IS the audio), but a bounce of 64 bars is millions of frames and doing them
 * all inside one synchronous call freezes whatever thread it runs on. Handing
 * the caller a `renderSlice` it can pump lets the SAME core serve a test that
 * wants a plain answer and a UI driver that must yield to the event loop
 * between slices — as opposed to a second, async copy of the loop, which is
 * how the sync and async paths would eventually come to disagree about where
 * the tail ends.
 */
interface OfflineRenderJob {
    /** Render up to `maxFrames` more frames. Returns true when finished. */
    renderSlice: (maxFrames: number) => boolean;
    /** Abandon the render; whatever has been rendered is kept. */
    cancel: () => void;
    result: () => OfflineRenderResult;
    /** Frames rendered so far, and the most this render can reach. */
    progress: () => { done: number; total: number };
}

const startOfflineRender = (options: OfflineRenderOptions): OfflineRenderJob => {
    const {
        bytes,
        sampleRate,
        frames,
        masterVolume = 1.0,
        loop = true,
        assetVolumes,
        includeTail = false,
    } = options;

    const ex = instantiateForRender(bytes, sampleRate, masterVolume, loop, assetVolumes);
    const leftPtr = ex.skald_left_ptr();
    const rightPtr = ex.skald_right_ptr();

    const target = Math.max(0, frames);
    const maxTailFrames = includeTail ? Math.round(MAX_TAIL_SECONDS * sampleRate) : 0;
    const capacity = target + maxTailFrames;
    // One allocation for the worst case, sliced down at the end: growing a
    // Float32Array per block would copy the whole bounce again every time.
    const left = new Float32Array(capacity);
    const right = new Float32Array(capacity);

    let written = 0;
    let canceled = false;
    let finished = false;
    let inTail = false;

    const renderBlock = (want: number): void => {
        const n = ex.skald_process(want);
        const count = Math.min(n, want, capacity - written);
        left.set(new Float32Array(ex.memory.buffer, leftPtr, count), written);
        right.set(new Float32Array(ex.memory.buffer, rightPtr, count), written);
        written += count;
    };

    const renderSlice = (maxFrames: number): boolean => {
        if (finished || canceled) return true;
        const sliceEnd = written + Math.max(OFFLINE_BLOCK_FRAMES, maxFrames);

        while (written < sliceEnd) {
            if (!inTail && written >= target) {
                if (!includeTail) { finished = true; return true; }
                // Stop the sequencer before the tail: what follows is what is
                // still ringing, not another lap of the pattern. `<Asset>_stop`
                // only clears `p.playing`, so voices, release stages and any
                // Delay/Reverb tail keep sounding — and keep reporting through
                // `_is_playing` — until they are genuinely done
                // (skald-backend/core/codegen_processor.odin's `%s_is_playing`).
                ex.skald_stop_all();
                inTail = true;
            }
            if (inTail && (written >= capacity || !anyAssetPlaying(ex))) {
                finished = true;
                return true;
            }
            renderBlock(Math.min(OFFLINE_BLOCK_FRAMES, capacity - written));
            if (written >= capacity) { finished = true; return true; }
        }
        return false;
    };

    return {
        renderSlice,
        cancel: () => { canceled = true; },
        progress: () => ({ done: written, total: capacity }),
        result: () => ({
            left: left.subarray(0, written),
            right: right.subarray(0, written),
            sampleRate,
            canceled,
        }),
    };
};

/**
 * Render a project to stereo float buffers, synchronously.
 *
 * Pure with respect to everything but the wasm module it instantiates, so a
 * test can call it and compare the result against the live worklet's output
 * frame for frame.
 */
export const renderOffline = (options: OfflineRenderOptions): OfflineRenderResult => {
    const job = startOfflineRender(options);
    const { onProgress } = options;
    for (;;) {
        const done = job.renderSlice(OFFLINE_BLOCK_FRAMES);
        const p = job.progress();
        if (onProgress && onProgress(p.done, p.total) === false) {
            job.cancel();
            break;
        }
        if (done) break;
    }
    return job.result();
};

/** Frames rendered between yields to the event loop — about a second of audio. */
const CHUNK_FRAMES = 48000;

/**
 * The same render, pumped in chunks with a yield between them.
 *
 * This is what the editor calls. It is deliberately NOT a Web Worker: the
 * bounce must instantiate the identical module the preview does, and the one
 * thing it must never run on is the AudioWorklet thread, where a
 * faster-than-realtime loop would starve the audio callback and glitch the
 * very playback it is reproducing. Yielding between chunks keeps the busy
 * indicator painting and the Cancel button clickable, which is the whole of
 * what a worker would have bought here; `startOfflineRender` is worker-ready
 * if that changes, because it has no DOM in it.
 */
export const renderOfflineChunked = async (
    options: OfflineRenderOptions,
): Promise<OfflineRenderResult> => {
    const job = startOfflineRender(options);
    const { onProgress } = options;
    for (;;) {
        const done = job.renderSlice(CHUNK_FRAMES);
        const p = job.progress();
        if (onProgress && onProgress(p.done, p.total) === false) {
            job.cancel();
            break;
        }
        if (done) break;
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
    return job.result();
};
