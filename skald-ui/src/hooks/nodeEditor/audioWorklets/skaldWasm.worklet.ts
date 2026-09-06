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
|   {type:'set-param', asset, key, nameBytes, value}  live exposed-param edit |
|                                     (key = the decoded name, for reporting) |
|   {type:'note-on'|'note-off'|'trigger', asset, note, velocity?, duration?}  |
|   {type:'set-loop', loop}                                                    |
|   {type:'set-master-volume', value}  live master-fader edit, applied       |
|                                     INSIDE the DSP graph via                 |
|                                     skald_set_master_volume — replacing the  |
|                                     post-worklet JS GainNode whose           |
|                                     vol*tanh(x) never matched the export's   |
|                                     tanh(vol*x) (BUGS.md SKB-011). Re-applied|
|                                     after every instantiate() (initial build |
|                                     and hot-swap alike), same as loopEnabled |
|                                     below — skald_init always reseeds the    |
|                                     wasm global from the BAKED project value.|
|   {type:'start-all'} / {type:'stop-all'}                                     |
| Messages out:                                                                |
|   {type:'step', step}      sequencer step changed (drives the UI playhead)  |
|   {type:'ended'}           non-looping pattern finished                      |
|   {type:'error', message}  worklet failure — playback itself is broken       |
|   {type:'nonfinite', total, perAsset}   E5 (roadmap 9.9): the DC-blocker/    |
|                                     limiter flushed a NaN/Inf sample to      |
|                                     silence and counted it. Posted only when |
|                                     either number changes (skald_process     |
|                                     runs 300+ times/sec; a message every     |
|                                     call would flood the port for no reason  |
|                                     once the count stops moving).            |
|   {type:'param-dropped', key, reason}   a set-param did NOT apply: the       |
|                                     running module rejected the name (e.g.  |
|                                     a stale build without the "::" alias)   |
|                                     or the name exceeded the wasm buffer.   |
|                                     Audio keeps playing the OLD value —     |
|                                     surfaced by the host like previewStale, |
|                                     never silently swallowed (that silence  |
|                                     is how a stale compiler turned every    |
|                                     knob into an undetected no-op, SKB-001) |
================================================================================
*/
import { skaldWasmImports } from './skaldWasmImports';

export const skaldWasmProcessorString = `
// G1: the libm import table, interpolated from its ONE authored copy
// (skaldWasmImports.ts) rather than written out again here. A worklet module
// cannot \`import\`, and the offline bounce instantiates the very same wasm
// outside this file — two hand-kept copies of this table is how a bounce ends
// up subtly detuned from the preview it is supposed to reproduce.
const skaldWasmImports = ${skaldWasmImports.toString()};

class SkaldWasmProcessor extends AudioWorkletProcessor {
    constructor(options) {
        super();
        this.ex = null;
        this.stepAsset = 0;
        this.lastStep = -1;
        this.wasPlaying = false;
        this.loopEnabled = true;
        // Mirrors loopEnabled: kept here (not read back from wasm) because
        // skald_init reseeds the wasm global from the baked project value
        // (always 1.0 for the preview build — see buildModule in
        // useWasmAudioEngine.ts) on every instantiate, including a hot-swap.
        // Without a host-side copy to reapply, a mid-play topology edit would
        // snap the fader back to full every time the module rebuilt.
        this.masterVolume = 1.0;
        // E5: last-reported values, so process() below can post a 'nonfinite'
        // message only on a real change instead of every single block.
        this.lastNonfiniteTotal = 0;
        this.lastNonfinitePerAsset = [];
        const opts = options.processorOptions || {};
        if (typeof opts.loop === 'boolean') this.loopEnabled = opts.loop;
        // typeof check, not a nullish/OR default: an authored/live 0 (silence)
        // must not be read as "absent" and fall back to 1.0 — that is the
        // exact Maybe(f32)-vs-0 bug SKB-004 fixed on the backend (BUGS.md).
        if (typeof opts.masterVolume === 'number') this.masterVolume = opts.masterVolume;
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
        return skaldWasmImports();
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
        // Reapply the live master volume immediately: skald_init just reset
        // the module's wasm_master_volume to the baked project value, same
        // reason skald_set_loop is reapplied per asset below rather than
        // trusting the freshly-initialized module's own defaults.
        ex.skald_set_master_volume(this.masterVolume);
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
        // E5: skald_init just reset the fresh module's own counters to 0
        // (project_init's p.dc = {} / skald_master_flush_count never having
        // moved, Asset_init's p.nonfinite_count = 0), so the host-side "last
        // reported" tracking must follow suit — sized to THIS module's asset
        // count, which may differ from whatever module preceded it.
        this.lastNonfiniteTotal = 0;
        this.lastNonfinitePerAsset = new Array(assetCount).fill(0);
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
                    if (!this.ex) break;
                    const len = m.nameBytes ? m.nameBytes.length : 0;
                    // 128 = the generated shim's skald_name_buf size
                    // ([128]u8). The wasm side rejects oversized names, but
                    // only AFTER the host wrote the bytes — writing more than
                    // 128 here would corrupt whatever wasm global follows the
                    // name buffer. Rejected here = still reported, not thrown:
                    // playback is fine, only this edit didn't land.
                    if (len === 0 || len > 128) {
                        this.port.postMessage({ type: 'param-dropped', key: m.key ?? '(unknown)', reason: 'parameter name exceeds the 128-byte wasm name buffer' });
                        break;
                    }
                    new Uint8Array(this.ex.memory.buffer, this.nameBufPtr, len)
                        .set(m.nameBytes);
                    // skald_set_param returns 1 only when the running module
                    // actually dispatched the name to a setter. 0 means the
                    // knob did NOTHING — e.g. a stale build that predates the
                    // "<nodeId>::<param>" alias. Discarding that return value
                    // is exactly what made SKB-001 invisible.
                    if (this.ex.skald_set_param(m.asset, len, m.value) !== 1) {
                        this.port.postMessage({ type: 'param-dropped', key: m.key ?? '(unknown)', reason: 'the running module did not accept this parameter (stale or mismatched build?)' });
                    }
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
                case 'set-master-volume':
                    // Stored (not just forwarded) so instantiate() can
                    // reapply it after the NEXT hot-swap too — see the
                    // constructor comment on this.masterVolume.
                    this.masterVolume = m.value;
                    this.ex?.skald_set_master_volume(m.value);
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

        // E5: a typeof guard, not a version check — a hot-swap can carry a
        // module built before this packet existed (a preview rebuilt from a
        // cached artifact), and calling an export that isn't there would
        // throw out of process() and kill playback outright.
        if (typeof this.ex.skald_get_nonfinite_count === 'function') {
            const total = this.ex.skald_get_nonfinite_count();
            const count = this.ex.skald_asset_count();
            const perAsset = new Array(count);
            let changed = total !== this.lastNonfiniteTotal;
            for (let a = 0; a < count; a++) {
                const c = this.ex.skald_get_asset_nonfinite_count(a);
                perAsset[a] = c;
                if (c !== (this.lastNonfinitePerAsset[a] ?? 0)) changed = true;
            }
            if (changed) {
                this.lastNonfiniteTotal = total;
                this.lastNonfinitePerAsset = perAsset;
                this.port.postMessage({ type: 'nonfinite', total, perAsset });
            }
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
