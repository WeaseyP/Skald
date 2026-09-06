/*
================================================================================
| FILE: skald-ui/src/hooks/nodeEditor/useWasmAudioEngine.ts                   |
|                                                                              |
| Live preview engine that plays the ACTUAL generated Odin code compiled to   |
| wasm, replacing the old hand-maintained Web Audio node-graph mirror.        |
|                                                                              |
| Flow:                                                                        |
|   Play        -> serialize project -> main process: codegen + odin build    |
|                  -> wasm bytes -> AudioWorklet plays the real DSP           |
|   Knob tweak  -> exposed params apply instantly via skald_set_param         |
|                  (no recompile); anything else debounce-rebuilds the module |
|                  and hot-swaps it, preserving the sequencer position and    |
|                  replaying whatever notes are still held down               |
================================================================================
*/
import { useState, useRef, useCallback, useEffect } from 'react';
import { Node, Edge } from '@xyflow/react';
import useDeepCompareEffect from 'use-deep-compare-effect';
import { skaldWasmProcessorString } from './audioWorklets/skaldWasm.worklet';
import {
    buildProjectData,
    canApplyParamLive,
    orderedInstrumentNodes,
    liveParamKey,
    topologySignature,
    wrappedInstrumentNodes,
} from '../../utils/projectSerializer';
import { SequencerTrack } from '../../definitions/types';
import { logger } from '../../utils/logger';
import { NonfiniteCounts, StereoAnalysers } from '../../utils/meter';

// Debounce for regenerate+recompile on topology edits. Long enough to
// coalesce a drag, short enough to feel live (measured build is ~200ms).
const REBUILD_DEBOUNCE_MS = 250;

// Electron wraps errors thrown by ipcMain.handle in
// "Error invoking remote method 'x': Error: <real message>" — strip that
// envelope so logs and any UI surface show the actual compiler/codegen error.
// Exported because the offline bounce (G1) calls the same build IPC and must
// report the same compiler error the same way; a second copy of this regex
// would drift the moment Electron changed its wording.
export const cleanIpcError = (e: unknown): string => {
    const msg = e instanceof Error ? e.message : String(e);
    return msg.replace(/^Error invoking remote method '[^']+': (?:Error: )?/, '');
};

export const useWasmAudioEngine = (
    nodes: Node[],
    edges: Edge[],
    isLooping: boolean,
    bpm: number,
    sequencerTracks: SequencerTrack[],
    setCurrentStep: (step: number) => void,
    patternSteps: number,
    nearestInScale: (note: number) => number,
    // Master fader, live (SKB-011). Applied INSIDE the DSP graph via the
    // generated skald_set_master_volume export, at the same point the
    // exported binary applies project.master_volume — not as a post-worklet
    // JS GainNode. That workaround baked master_volume=1.0 into the worklet
    // and multiplied the slider on afterward (vol·tanh(x)); the export
    // computes tanh(vol·x). tanh is concave, so the two only ever agreed at
    // vol∈{0,1} — every other setting played a louder, less-saturated signal
    // than what was tuned by ear (BUGS.md SKB-011).
    masterVolume: number
) => {
    const [isPlaying, setIsPlaying] = useState(false);
    const audioContext = useRef<AudioContext | null>(null);
    const workletNode = useRef<AudioWorkletNode | null>(null);
    const [analyserState, setAnalyserState] = useState<AnalyserNode | null>(null);
    // Packet B10: the peak meter's stereo tap, one analyser per channel.
    const [meterState, setMeterState] = useState<StereoAnalysers | null>(null);
    // E5 (roadmap 9.9): the DC-blocker/limiter's non-finite flush counts, as a
    // ref rather than React state — the worklet can post an updated count
    // dozens of times a second (once per skald_process call that changed it)
    // and a warning badge has no business forcing a re-render on every one.
    // PeakMeter polls `.current` the same way it already polls the audio
    // buffers, via its own rAF loop. Reset at the top of handlePlay (not just
    // relying on the fresh module's own zeroed counters) so a STALE reading
    // from a stopped session's ref can never be exposed through a NEW
    // session's meterState before the first 'nonfinite' message arrives.
    const nonfiniteCountsRef = useRef<NonfiniteCounts>({ total: 0, perAsset: [] });

    // Surfaced to the UI — these errors were console-only, which made every
    // failure mode (Odin missing, codegen error, build timeout) look exactly
    // like "my patch is silent".
    // previewError: Play/worklet failed outright — nothing is sounding.
    // previewStale: a live-edit rebuild failed and the PREVIOUS module is
    // still playing — what you hear is not the graph on screen.
    const [previewError, setPreviewError] = useState<string | null>(null);
    const [previewStale, setPreviewStale] = useState<string | null>(null);

    // True while a codegen+odin build is actually in flight — either the
    // initial Play build or a debounced hot-swap rebuild. `-o:none` made
    // rebuilds fast (~172ms measured on the snes demo, was 702ms), which
    // solved the "live edits feel slow" problem but created a smaller one: a
    // SLOW successful rebuild (a big patch, a loaded machine) is now
    // indistinguishable from nothing happening at all, because nothing ever
    // showed work in progress. Reusing this state (rather than a second
    // channel) keeps the preview's health surfaced through one place, same as
    // previewError/previewStale above.
    const [isBuilding, setIsBuilding] = useState(false);

    const lastSignature = useRef<string | null>(null);
    const prevInstruments = useRef<Node[]>([]);
    const rebuildTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const buildInFlight = useRef(false);
    const rebuildQueued = useRef(false);

    // Monotonic rebuild-lineage id, bumped on every Stop and Play. An async
    // rebuild captures it when it starts and its completion is DROPPED if the
    // id has moved on. Without this, a rebuild kicked off before Stop could
    // resolve after the next Play and hot-swap the older graph's module into
    // the new session's worklet — the `workletNode.current` null-check alone
    // is true precisely when a NEW worklet exists, i.e. the failure case
    // (stop→play stale-swap race, F-B09b-6).
    const rebuildGeneration = useRef(0);

    // Notes the HOST is currently holding down: a note-on with no duration and
    // no matching note-off yet. Keyed "<asset>:<note>" and storing the asset
    // verbatim so a replay reproduces the exact message that was sent — the
    // MIDI path always addresses -1 ("every asset"), and re-deriving a concrete
    // asset list would break the moment a rebuild changed the asset count.
    //
    // SKB-023: a hot-swap installs a NEW module whose voice pool is empty, so a
    // sustained note went silent the instant the user touched the graph and
    // stayed silent until they let go and pressed the key again. Nothing was
    // wrong with the module; the engine had simply forgotten that the keyboard
    // was still down.
    const heldNotes = useRef<Map<string, { asset: number; note: number; velocity: number }>>(new Map());

    // The one door notes go through, so the held set cannot drift from what the
    // module was actually told. A note-on WITH a duration is a one-shot — it
    // releases itself — so it plays but is never tracked; replaying one after a
    // swap would retrigger a sound the player already heard finish.
    const sendNoteOn = useCallback((asset: number, note: number, velocity: number, duration: number) => {
        const port = workletNode.current?.port;
        if (!port) return;
        port.postMessage({ type: 'note-on', asset, note, velocity, duration });
        if (duration <= 0) heldNotes.current.set(`${asset}:${note}`, { asset, note, velocity });
    }, []);

    // The delete happens whether or not a worklet exists: the key is up either
    // way, and a note left in the map would be replayed into the next module as
    // a phantom sustain.
    const sendNoteOff = useCallback((asset: number, note: number) => {
        heldNotes.current.delete(`${asset}:${note}`);
        workletNode.current?.port.postMessage({ type: 'note-off', asset, note });
    }, []);

    // Only ever called after a 'swap' the worklet actually received. Replaying
    // on a FAILED rebuild would push a second note-on into the module that is
    // still sounding (the previewStale/amber case), doubling every held voice
    // instead of restoring it.
    const replayHeldNotes = useCallback(() => {
        const port = workletNode.current?.port;
        if (!port) return;
        for (const held of heldNotes.current.values()) {
            // Plain numbers only. A payload that fails structured
            // serialization is dropped by the port with no event on the sender
            // — the same trapdoor that swallowed every hot-swap for as long as
            // they carried a compiled WebAssembly.Module (see the note on
            // buildModule below, and the worklet's own header).
            port.postMessage({
                type: 'note-on',
                asset: held.asset,
                note: held.note,
                velocity: held.velocity,
                duration: 0.0,
            });
        }
        if (heldNotes.current.size > 0) {
            logger.info(
                'WasmAudioEngine',
                `Replayed ${heldNotes.current.size} held note(s) into the swapped module`
            );
        }
    }, []);

    // The asset whose step clock drives the UI playhead: first instrument
    // with a non-muted, non-empty track (mirrors the backend's Music Layer
    // detection). -1 keeps the playhead still when nothing sequences.
    //
    // `orderedInstrumentNodes` — the order the emitted project lists assets
    // in (sorted by sanitized id, B6-1-x1), which is what the worklet's asset
    // index means; canvas order here pointed the playhead at the wrong asset
    // whenever the sequenced instrument was not also the first by id.
    // Deliberately NOT `wrappedInstrumentNodes`: on a
    // loose graph (SKB-019 / packet B6-1) `instruments` is `[]`, `findIndex`
    // short-circuits to -1, and `Math.max(computeStepAsset(...), 0)` at the
    // call site lands on asset index 0 — which correctly IS the Asset, since
    // buildProjectData emits it as the ONLY instrument. Checking a synthetic
    // wrapped node's track membership here would be answering a question that
    // does not apply: a loose graph's tracks all drive the same single asset
    // regardless of which node they used to name, so asset 0 is always right.
    const computeStepAsset = useCallback((currentNodes: Node[], tracks: SequencerTrack[]): number => {
        const instruments = orderedInstrumentNodes(currentNodes);
        const idx = instruments.findIndex(inst => {
            const track = tracks.find(t => t.targetNodeId === inst.id);
            return track && track.notes.length > 0 && !track.isMuted;
        });
        return idx; // -1 falls back to asset 0 in the worklet's ?? guard
    }, []);

    // Returns raw wasm BYTES, not a compiled WebAssembly.Module: the worklet
    // compiles them itself. A compiled Module survives processorOptions at
    // node construction but is SILENTLY DROPPED when posted through the
    // MessagePort (structured deserialization fails on the audio thread with
    // only an unobserved messageerror) — every hot-swap vanished in transit
    // and live edits never applied until Stop/Play.
    const buildModule = useCallback(async (): Promise<{ bytes: ArrayBuffer, signature: string, stepAsset: number }> => {
        // master_volume is baked as a topology-neutral 1.0 for the preview
        // build: the dock's fader instead drives skald_set_master_volume
        // live (see the masterVolume effect below), so dragging it never
        // forces a recompile — same treatment as an exposed instrument
        // param. The export path bakes the real authored value (SKB-011's
        // backend half); baking it here too would fold volume into
        // topologySignature and turn every drag into a full rebuild.
        const projectData = buildProjectData(nodes, edges, sequencerTracks, bpm, 1.0, patternSteps, nearestInScale);
        if (projectData.project.instruments.length === 0) {
            throw new Error('No instruments on the canvas. Wrap nodes in an Instrument before playing.');
        }
        const bytes = await window.electron.buildWasmPreview(JSON.stringify(projectData));
        return {
            bytes,
            signature: topologySignature(projectData),
            stepAsset: Math.max(computeStepAsset(nodes, sequencerTracks), 0),
        };
    }, [nodes, edges, sequencerTracks, bpm, patternSteps, nearestInScale, computeStepAsset]);

    const handleStop = useCallback(() => {
        logger.info('WasmAudioEngine', 'Stop requested');
        // Invalidate any rebuild still in flight: its completion must never
        // reach a worklet created by a LATER Play (stale-swap race).
        rebuildGeneration.current++;
        // The session is over, so nothing is held any more as far as the engine
        // is concerned. A note left here would be replayed into the next
        // session's first rebuild as a phantom sustain.
        heldNotes.current.clear();
        if (rebuildTimer.current) {
            clearTimeout(rebuildTimer.current);
            rebuildTimer.current = null;
        }
        const ctx = audioContext.current;
        if (!ctx) return;
        workletNode.current?.port.postMessage({ type: 'stop-all' });
        ctx.close().then(() => {
            logger.info('WasmAudioEngine', 'AudioContext closed');
        });
        audioContext.current = null;
        workletNode.current = null;
        lastSignature.current = null;
        setAnalyserState(null);
        setMeterState(null);
        setIsPlaying(false);
        // Stopped = no longer listening to a stale module. A play *error*
        // stays visible until the next Play attempt resolves it.
        setPreviewStale(null);
    }, []);

    const handleStopRef = useRef(handleStop);
    handleStopRef.current = handleStop;
    const patternStepsRef = useRef(patternSteps);
    patternStepsRef.current = patternSteps;

    // Synchronous re-entry latch: `isPlaying` is React state and stays stale
    // for the whole async build, so a fast double-click on Play would start
    // two concurrent builds and leak an AudioContext without this.
    const startInFlight = useRef(false);

    const handlePlay = useCallback(async () => {
        logger.info('WasmAudioEngine', 'Play requested');
        if (isPlaying || startInFlight.current) return;
        startInFlight.current = true;
        // New session: any rebuild completion from before this Play is stale.
        rebuildGeneration.current++;
        heldNotes.current.clear();
        setPreviewError(null);
        setPreviewStale(null);
        // E5: a fresh session's meter must never show a leftover count from
        // whatever the LAST session's patch did — a one-off glitch flushed
        // ten notes ago must not read as "still happening" after the very
        // next Play.
        nonfiniteCountsRef.current = { total: 0, perAsset: [] };
        try {
            // Create the AudioContext synchronously, inside the click
            // gesture's window — created after the multi-hundred-ms build
            // await it can come up 'suspended' (autoplay policy) and play
            // silence.
            const context = new AudioContext();
            audioContext.current = context;

            setIsBuilding(true);
            const { bytes, signature, stepAsset } = await buildModule().finally(() => setIsBuilding(false));
            if (audioContext.current !== context) return; // stopped while building

            const workletUrl = URL.createObjectURL(
                new Blob([skaldWasmProcessorString], { type: 'application/javascript' })
            );
            await context.audioWorklet.addModule(workletUrl);
            URL.revokeObjectURL(workletUrl);

            const node = new AudioWorkletNode(context, 'skald-wasm', {
                numberOfInputs: 0,
                numberOfOutputs: 1,
                outputChannelCount: [2],
                // masterVolume seeds the worklet's live fader state (applied
                // inside the DSP via skald_set_master_volume — see the
                // masterVolume effect below for changes during playback).
                // Same treatment as `loop`: the value read here is
                // reapplied by the worklet after every hot-swap too, because
                // skald_init resets the module's copy to the baked 1.0.
                processorOptions: { bytes, stepAsset, loop: isLooping, masterVolume },
            });
            node.port.onmessage = (e) => {
                const m = e.data;
                // patternSteps via ref: this handler lives for the whole
                // playback session, so a captured value goes stale the moment
                // the user changes the pattern length mid-play — the audio
                // followed the new length but the playhead kept wrapping at
                // the old one.
                if (m.type === 'step' && m.step >= 0) setCurrentStep(m.step % patternStepsRef.current);
                else if (m.type === 'ended') handleStopRef.current();
                else if (m.type === 'error') {
                    logger.error('WasmAudioEngine', 'Worklet error', m.message);
                    setPreviewError(String(m.message));
                }
                // A set-param the running module did NOT apply. Audio keeps
                // playing — with the OLD value — so this is previewStale's
                // exact meaning (what you hear is not the graph on screen),
                // not previewError's (nothing is sounding). Before this was
                // surfaced, a stale codegen build made every exposed-param
                // knob an undetected no-op (SKB-001 / F-C4-2).
                else if (m.type === 'param-dropped') {
                    const message = `Live edit "${m.key}" was not applied — ${m.reason}. The preview is still playing the previous value.`;
                    logger.error('WasmAudioEngine', 'Live param edit dropped', message);
                    setPreviewStale(message);
                }
                // E5: the DC-blocker/limiter flushed a NaN/Inf sample to
                // silence and counted it. Mutated in place on the SAME ref
                // object handed to meterState below, not replaced — PeakMeter
                // holds onto that ref across re-renders and reads `.current`
                // itself, so no setState (and no re-render) is needed here.
                else if (m.type === 'nonfinite') {
                    nonfiniteCountsRef.current = { total: m.total, perAsset: m.perAsset ?? [] };
                }
            };
            // Structured-deserialization failures on messages FROM the worklet
            // are otherwise dropped without a trace (the worklet side has the
            // same net — that silence is how hot-swaps died undetected).
            node.port.onmessageerror = () => {
                logger.error('WasmAudioEngine', 'Message from worklet failed to deserialize');
                setPreviewError('A message from the audio engine was dropped (deserialization error).');
            };

            // No master GainNode: the worklet output IS the mixed, faded
            // signal (master_volume applied inside the DSP graph, same point
            // the export applies it — see skald_set_master_volume above).
            // Two places that could apply the fader is exactly the bug.
            const analyser = context.createAnalyser();
            analyser.fftSize = 2048;
            node.connect(analyser);
            analyser.connect(context.destination);

            // Packet B10: the peak meter's tap. An AnalyserNode downmixes to
            // mono, so a stereo meter needs a ChannelSplitterNode feeding one
            // analyser per channel; these are sinks (never routed to the
            // destination), so they add no audio path. fftSize 1024 is the
            // window the meter reads with getFloatTimeDomainData — about 21 ms
            // at 48 kHz, a frame's worth of samples for a 60 Hz repaint.
            const splitter = context.createChannelSplitter(2);
            const meterLeft = context.createAnalyser();
            const meterRight = context.createAnalyser();
            meterLeft.fftSize = 1024;
            meterRight.fftSize = 1024;
            node.connect(splitter);
            splitter.connect(meterLeft, 0);
            splitter.connect(meterRight, 1);

            if (context.state === 'suspended') {
                await context.resume();
            }

            workletNode.current = node;
            lastSignature.current = signature;
            // wrappedInstrumentNodes, not getInstrumentNodes: on a loose graph
            // (SKB-019 / packet B6-1) this must seed the synthetic "Asset"
            // stand-in, or sendChangedExposedParams below has nothing to diff
            // against on the very first live edit after Play.
            prevInstruments.current = wrappedInstrumentNodes(nodes);
            setAnalyserState(analyser);
            setMeterState({ left: meterLeft, right: meterRight, nonfiniteCounts: nonfiniteCountsRef });
            setIsPlaying(true);
            logger.info('WasmAudioEngine', 'Playing generated wasm module');
        } catch (e) {
            // Structured logger only — this used to also go through
            // console.error directly, which doubled up every failed-Play
            // message in the console (BUG-PREVIEW-CONSOLE-NOISE).
            const message = cleanIpcError(e);
            logger.error('WasmAudioEngine', 'Failed to start wasm preview', message);
            setPreviewError(message);
            audioContext.current?.close();
            audioContext.current = null;
        } finally {
            startInFlight.current = false;
        }
    }, [isPlaying, buildModule, isLooping, setCurrentStep, patternSteps, nodes, masterVolume]);

    // Instant path: exposed param edits go straight to the running module
    // via skald_set_param — no recompile, no audio interruption. Params are
    // addressed as "<nodeId>::<param>" (the codegen emits that alias next to
    // every collision-resolved field name), so instruments where several
    // nodes expose the SAME name — e.g. the Normal Sax's three filters all
    // exposing `cutoff`/`resonance` — hit the instant path too. They used to
    // be skipped here (only uniquely-exposed names were addressable) and fell
    // back to the debounced rebuild, so a filter knob drag killed the
    // sounding voices and only became audible at the next note.
    const sendChangedExposedParams = useCallback((instrumentNodes: Node[]) => {
        const port = workletNode.current?.port;
        if (!port) return;
        const prev = prevInstruments.current;
        instrumentNodes.forEach((inst, assetIdx) => {
            const prevInst = prev.find(p => p.id === inst.id);
            if (!prevInst || prevInst === inst) return;
            const prevSubnodes = new Map<string, any>(
                ((prevInst.data as any)?.subgraph?.nodes ?? []).map((sn: any) => [sn.id, sn])
            );
            for (const sn of (inst.data as any)?.subgraph?.nodes ?? []) {
                const prevSn = prevSubnodes.get(sn.id);
                if (!prevSn || prevSn.data === sn.data) continue;
                for (const name of (sn.data?.exposedParameters ?? []) as string[]) {
                    // Keys past the shim's name-buffer limit — and values
                    // skald_set_param's f32 can't carry (non-number,
                    // non-finite, oversize) — can't be applied live;
                    // topologySignature leaves them unmasked so they take the
                    // rebuild path instead of silently no-oping.
                    const value = sn.data?.[name];
                    if (!canApplyParamLive(sn.id, name, value)) continue;
                    const prevValue = Number(prevSn.data?.[name]);
                    if (value !== prevValue) {
                        const key = liveParamKey(sn.id, name);
                        port.postMessage({
                            type: 'set-param',
                            asset: assetIdx,
                            // key rides along so the worklet can NAME the
                            // param in its param-dropped report without
                            // needing TextDecoder (not guaranteed in
                            // AudioWorkletGlobalScope).
                            key,
                            nameBytes: new TextEncoder().encode(key),
                            value,
                        });
                        logger.debug('WasmAudioEngine', `set-param ${key}=${value} (asset ${assetIdx})`);
                    }
                }
            }
        });
        prevInstruments.current = instrumentNodes;
    }, []);

    // Latest-graph accessor for the debounced/queued rebuild below. Those
    // closures outlive renders: a rebuild QUEUED while an older build was in
    // flight used to re-run through the scheduleRebuild instance that started
    // that build — whose buildModule had captured the OLD nodes. The preview
    // then permanently played a graph that was no longer on screen, with
    // lastSignature matching the stale build, so no further rebuild fired and
    // no previewStale warning showed. The ref always points at the current
    // render's builder, so a queued rebuild serializes what's on screen NOW.
    const buildModuleRef = useRef(buildModule);
    buildModuleRef.current = buildModule;

    const scheduleRebuild = useCallback(() => {
        if (rebuildTimer.current) clearTimeout(rebuildTimer.current);
        rebuildTimer.current = setTimeout(async () => {
            rebuildTimer.current = null;
            if (!workletNode.current) return;
            if (buildInFlight.current) {
                rebuildQueued.current = true;
                return;
            }
            buildInFlight.current = true;
            setIsBuilding(true);
            // Stamp the rebuild with the CURRENT lineage id. If Stop (or
            // Stop→Play) happens during the await, the id moves on and this
            // completion is dropped: the workletNode null-check alone cannot
            // catch a rebuild that resolves after a NEW worklet exists, and
            // swapping there would put the pre-stop graph's module into the
            // new session's live graph (F-B09b-6).
            const generation = rebuildGeneration.current;
            try {
                const { bytes, signature, stepAsset } = await buildModuleRef.current();
                if (!workletNode.current) return; // stopped while building
                if (generation !== rebuildGeneration.current) {
                    logger.info('WasmAudioEngine', 'Dropped stale rebuild (playback restarted while it was compiling)');
                    return;
                }
                // Raw bytes, transferred: a compiled WebAssembly.Module here is
                // silently dropped by the port and the edit never lands.
                workletNode.current.port.postMessage({ type: 'swap', bytes, stepAsset }, [bytes]);
                lastSignature.current = signature;
                setPreviewStale(null);
                // SKB-023. Ordering is the whole trick: the port delivers in
                // order, so these note-ons land on the module 'swap' just
                // installed, not on the one it replaced.
                replayHeldNotes();
                logger.info('WasmAudioEngine', 'Hot-swapped rebuilt wasm module');
            } catch (e) {
                // Keep playing the previous module: mid-edit states (e.g. a
                // half-wired graph) are expected to fail codegen sometimes.
                // But SAY so — silently playing the old DSP while the screen
                // shows the new graph is the one way preview and export can
                // still disagree. (Unless the rebuild itself is stale: a
                // pre-stop build failing must not flag the NEW session.)
                if (generation === rebuildGeneration.current) {
                    const message = cleanIpcError(e);
                    logger.error('WasmAudioEngine', 'Preview rebuild failed; keeping last module', message);
                    setPreviewStale(message);
                }
            } finally {
                buildInFlight.current = false;
                setIsBuilding(false);
                if (rebuildQueued.current) {
                    rebuildQueued.current = false;
                    scheduleRebuild();
                }
            }
        }, REBUILD_DEBOUNCE_MS);
        // Stable identity (state lives in refs): the queued-rebuild recursion
        // in `finally` must call a scheduleRebuild that reads the LATEST
        // buildModuleRef, never one pinned to the render that started a build.
        // replayHeldNotes is itself dependency-free, so naming it here does not
        // cost that stability.
    }, [replayHeldNotes]);

    // React to edits while playing: instant param path first, then decide
    // whether the change needs a re-codegen (topology signature changed).
    useDeepCompareEffect(() => {
        if (!isPlaying || !workletNode.current) return;

        // wrappedInstrumentNodes, not getInstrumentNodes (SKB-019 / packet
        // B6-1): on a loose graph the latter is always `[]`, so
        // sendChangedExposedParams had nothing to diff and posted no
        // `set-param` — while topologySignature below DOES walk the wrapped
        // Asset's audio_graph and masks the same exposed param there, so the
        // signature never changed either. NEITHER path fired: a live exposed
        // frequency edit on a loose graph did nothing at all, the exact
        // silent-drop topologySignature's own header forbids.
        const instrumentNodes = wrappedInstrumentNodes(nodes);
        sendChangedExposedParams(instrumentNodes);

        const projectData = buildProjectData(nodes, edges, sequencerTracks, bpm, 1.0, patternSteps, nearestInScale);
        const signature = topologySignature(projectData);
        if (signature !== lastSignature.current) {
            scheduleRebuild();
        }
    }, [nodes, edges, sequencerTracks, bpm, patternSteps, isPlaying]);

    // Loop toggle applies live.
    useEffect(() => {
        workletNode.current?.port.postMessage({ type: 'set-loop', loop: isLooping });
    }, [isLooping, isPlaying]);

    // Master fader applies live, same shape as the loop toggle above: the
    // value lands inside the DSP graph via skald_set_master_volume, at the
    // same mix point the exported binary applies it, instead of a
    // post-worklet JS GainNode (SKB-011 — see the masterVolume param comment
    // at the top of this hook). No `??`/`||` here: a slider at 0 must reach
    // the worklet as a real 0, not be treated as an absent/falsy value —
    // that is the exact Maybe(f32) distinction SKB-004 fixed on the backend.
    useEffect(() => {
        workletNode.current?.port.postMessage({ type: 'set-master-volume', value: masterVolume });
    }, [masterVolume, isPlaying]);

    // Audition: the Output node's test button stamps lastTrigger; fire every
    // asset like the old engine did (C4, short preview envelope).
    const lastAuditionStamp = useRef<unknown>(null);
    useEffect(() => {
        if (!isPlaying) return;
        for (const node of nodes) {
            if (node.type !== 'output' && node.type !== 'InstrumentOutput' && node.type !== 'GraphOutput') continue;
            const stamp = (node.data as any)?.lastTrigger;
            if (stamp && stamp !== lastAuditionStamp.current) {
                lastAuditionStamp.current = stamp;
                workletNode.current?.port.postMessage({ type: 'trigger', asset: -1, note: 60, velocity: 1.0, duration: 0.2 });
            }
        }
    }, [nodes, isPlaying]);

    useEffect(() => {
        return () => { if (audioContext.current) handleStopRef.current(); };
    }, []);

    // === Global MIDI listener: live notes go into the wasm processors ===
    useEffect(() => {
        let midiAccess: any = null;

        const handleMidiMessage = (message: any) => {
            const port = workletNode.current?.port;
            if (!port) return;
            const [status, data1, data2] = message.data;
            const command = status & 0xf0;

            if (command === 0x90 && data2 > 0) { // Note On
                const note = nearestInScale(data1); // Apply Scale Quantization
                const velocity = data2 / 127;
                logger.debug('WasmAudioEngine', `[MIDI In] Raw: ${data1} -> Quantized: ${note}`);
                // Through sendNoteOn, not the port directly, so the note is
                // recorded as held and survives a hot-swap (SKB-023).
                sendNoteOn(-1, note, velocity, 0.0);
            } else if (command === 0x80 || (command === 0x90 && data2 === 0)) { // Note Off
                // Quantize exactly like note-on: the generated note_off
                // matches by note number, so an unquantized off leaves the
                // quantized note stuck on — and, since SKB-023, would leave it
                // in the held set to be replayed after every later rebuild.
                sendNoteOff(-1, nearestInScale(data1));
            }
        };

        if (navigator.requestMIDIAccess) {
            navigator.requestMIDIAccess().then(access => {
                midiAccess = access;
                for (const input of midiAccess.inputs.values()) {
                    input.onmidimessage = handleMidiMessage;
                }
                midiAccess.onstatechange = () => {
                    const inputs = midiAccess?.inputs.values();
                    if (inputs) {
                        for (const input of inputs) {
                            input.onmidimessage = handleMidiMessage;
                        }
                    }
                };
            });
        }

        return () => {
            if (midiAccess) {
                for (const input of midiAccess.inputs.values()) {
                    input.onmidimessage = null;
                }
            }
        };
    }, [nearestInScale, sendNoteOn, sendNoteOff]);

    return {
        isPlaying,
        handlePlay,
        handleStop,
        analyserNode: { current: analyserState },
        // Packet B10: per-channel analysers for the peak meter; null when stopped.
        meterAnalysers: meterState,
        // Preview health, for visible UI surfacing (console-only errors made
        // toolchain failures indistinguishable from a silent patch).
        previewError,
        previewStale,
        // True while a preview build (Play or a hot-swap rebuild) is
        // actually running — drives the small status pip in SequencerToolbar
        // (roadmap A7 item 3, second half).
        isBuilding,
        // The same door the MIDI listener above goes through, exposed so the
        // QWERTY keyboard (roadmap E1) uses it too. A second poster to the
        // port would bypass the held-note set and reintroduce SKB-023 for
        // computer-keyboard notes only — silent after any hot-swap, and
        // indistinguishable from a patch that stopped making sound.
        sendNoteOn,
        sendNoteOff,
    };
};
