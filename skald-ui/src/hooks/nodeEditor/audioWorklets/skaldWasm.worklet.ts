/*
================================================================================
| FILE: skald-ui/src/hooks/nodeEditor/audioWorklets/skaldWasm.worklet.ts      |
|                                                                              |
| AudioWorkletProcessor that plays the ACTUAL generated Odin code, compiled   |
| to wasm by the main process. This replaces the old per-node Web Audio       |
| preview graph — the preview and the shipped export are now the same DSP.    |
|                                                                              |
| Messages in:                                                                 |
|   {type:'swap', bytes, stepAsset}   hot-swap freshly built wasm BYTES,      |
|                                     preserving the step-clock position       |
|                                     (bytes, never a compiled Module — the   |
|                                     port silently drops Module payloads)     |
|   {type:'set-param', asset, nameBytes, value}   live exposed-param edit     |
|   {type:'note-on'|'note-off'|'trigger', asset, note, velocity?, duration?}  |
|   {type:'set-loop', loop}                                                    |
|   {type:'start-all'} / {type:'stop-all'}                                     |
| Messages out:                                                                |
|   {type:'step', step}      sequencer step changed (drives the UI playhead)  |
|   {type:'ended'}           non-looping pattern finished                      |
|   {type:'error', message}                                                    |
================================================================================
*/
export const skaldWasmProcessorString = `
class SkaldWasmProcessor extends AudioWorkletProcessor {
    constructor(options) {
        super();
        this.ex = null;
        this.stepAsset = 0;
        this.lastStep = -1;
        this.wasPlaying = false;
        this.loopEnabled = true;
        const opts = options.processorOptions || {};
        if (typeof opts.loop === 'boolean') this.loopEnabled = opts.loop;
        if (opts.bytes) {
            this.instantiate(opts.bytes, opts.stepAsset ?? 0, false);
        }
        this.port.onmessage = (e) => this.handleMessage(e.data);
        // A message whose payload fails structured deserialization is
        // otherwise dropped WITHOUT any event on the sender — this is
        // exactly how live hot-swaps died silently when they carried a
        // compiled WebAssembly.Module (Chromium won't deserialize one on
        // the audio thread). Swaps now carry raw bytes, but keep the net.
        this.port.onmessageerror = () => {
            this.port.postMessage({ type: 'error', message: 'worklet message failed to deserialize — live edit was dropped' });
        };
    }

    // Odin's core:math on freestanding_wasm32 imports libm; supply it from JS.
    imports() {
        return { env: {
            sinf: Math.sin, cosf: Math.cos, tanf: Math.tan,
            sin: Math.sin, cos: Math.cos, tan: Math.tan,
            exp: Math.exp, expf: Math.exp,
            exp2f: (x) => 2 ** x, exp2: (x) => 2 ** x,
            log: Math.log, logf: Math.log, log2f: Math.log2, log10f: Math.log10,
            pow: Math.pow, powf: Math.pow, sqrtf: Math.sqrt, cbrtf: Math.cbrt,
            tanh: Math.tanh, tanhf: Math.tanh, coshf: Math.cosh, sinhf: Math.sinh,
            atan2f: Math.atan2, acosf: Math.acos, asinf: Math.asin, atanf: Math.atan,
            fmodf: (a, b) => a % b,
        }};
    }

    // bytes: raw wasm binary (ArrayBuffer). Compiled HERE, on the audio
    // thread, because a pre-compiled WebAssembly.Module survives
    // processorOptions at construction but is silently dropped when posted
    // through the MessagePort — the hot-swap path never received a single
    // module. Sync compile off the main thread is allowed at any size, and
    // preview modules are tiny.
    instantiate(bytes, stepAsset, preserveTransport) {
        let seek = null;
        if (preserveTransport && this.ex) {
            const step = this.ex.skald_get_step(this.stepAsset);
            const wait = this.ex.skald_get_step_wait(this.stepAsset);
            if (step >= 0 && wait >= 0) seek = { step, wait };
        }
        const module = new WebAssembly.Module(bytes);
        const ex = new WebAssembly.Instance(module, this.imports()).exports;
        ex.skald_init(sampleRate);
        ex.skald_start_all();
        const assetCount = ex.skald_asset_count();
        for (let a = 0; a < assetCount; a++) {
            ex.skald_set_loop(a, this.loopEnabled ? 1 : 0);
            if (seek) ex.skald_seek(a, seek.step, seek.wait);
        }
        this.ex = ex;
        this.stepAsset = stepAsset;
        this.leftPtr = ex.skald_left_ptr();
        this.rightPtr = ex.skald_right_ptr();
        this.nameBufPtr = ex.skald_name_buf_ptr();
        this.wasPlaying = ex.skald_is_playing(stepAsset) === 1;
    }

    forEachAsset(fn) {
        if (!this.ex) return;
        const count = this.ex.skald_asset_count();
        for (let a = 0; a < count; a++) fn(a);
    }

    handleMessage(m) {
        try {
            switch (m.type) {
                case 'swap':
                    this.instantiate(m.bytes, m.stepAsset ?? this.stepAsset, true);
                    break;
                case 'set-param': {
                    if (!this.ex || !m.nameBytes || m.nameBytes.length === 0) break;
                    new Uint8Array(this.ex.memory.buffer, this.nameBufPtr, m.nameBytes.length)
                        .set(m.nameBytes);
                    this.ex.skald_set_param(m.asset, m.nameBytes.length, m.value);
                    break;
                }
                case 'note-on':
                    if (m.asset < 0) this.forEachAsset(a => this.ex.skald_note_on(a, m.note, m.velocity ?? 1.0, m.duration ?? 0.0));
                    else this.ex?.skald_note_on(m.asset, m.note, m.velocity ?? 1.0, m.duration ?? 0.0);
                    break;
                case 'note-off':
                    if (m.asset < 0) this.forEachAsset(a => this.ex.skald_note_off(a, m.note));
                    else this.ex?.skald_note_off(m.asset, m.note);
                    break;
                case 'trigger':
                    if (m.asset < 0) this.forEachAsset(a => this.ex.skald_trigger(a, m.note ?? 60, m.velocity ?? 1.0, m.duration ?? 0.2));
                    else this.ex?.skald_trigger(m.asset, m.note ?? 60, m.velocity ?? 1.0, m.duration ?? 0.2);
                    break;
                case 'set-loop':
                    this.loopEnabled = !!m.loop;
                    this.forEachAsset(a => this.ex.skald_set_loop(a, this.loopEnabled ? 1 : 0));
                    break;
                case 'start-all':
                    this.ex?.skald_start_all();
                    this.wasPlaying = true;
                    break;
                case 'stop-all':
                    this.ex?.skald_stop_all();
                    break;
            }
        } catch (err) {
            this.port.postMessage({ type: 'error', message: String(err) });
        }
    }

    process(inputs, outputs) {
        if (!this.ex) return true;
        const out = outputs[0];
        if (!out || !out[0]) return true;
        const n = out[0].length;
        this.ex.skald_process(n);
        out[0].set(new Float32Array(this.ex.memory.buffer, this.leftPtr, n));
        (out[1] ?? out[0]).set(new Float32Array(this.ex.memory.buffer, this.rightPtr, n));

        const step = this.ex.skald_get_step(this.stepAsset);
        if (step !== this.lastStep) {
            this.lastStep = step;
            this.port.postMessage({ type: 'step', step });
        }
        const playing = this.ex.skald_is_playing(this.stepAsset) === 1;
        if (this.wasPlaying && !playing && !this.loopEnabled) {
            this.port.postMessage({ type: 'ended' });
        }
        this.wasPlaying = playing;
        return true;
    }
}
registerProcessor('skald-wasm', SkaldWasmProcessor);
`;
