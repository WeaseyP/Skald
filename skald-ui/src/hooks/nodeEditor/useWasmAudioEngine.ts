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
|                  and hot-swaps it, preserving the sequencer position        |
================================================================================
*/
import { useState, useRef, useCallback, useEffect } from 'react';
import { Node, Edge } from '@xyflow/react';
import useDeepCompareEffect from 'use-deep-compare-effect';
import { skaldWasmProcessorString } from './audioWorklets/skaldWasm.worklet';
import {
    buildProjectData,
    canApplyParamLive,
    getInstrumentNodes,
    liveParamKey,
    topologySignature,
} from '../../utils/projectSerializer';
import { SequencerTrack } from '../../definitions/types';
import { logger } from '../../utils/logger';

// Debounce for regenerate+recompile on topology edits. Long enough to
// coalesce a drag, short enough to feel live (measured build is ~200ms).
const REBUILD_DEBOUNCE_MS = 250;

// Electron wraps errors thrown by ipcMain.handle in
// "Error invoking remote method 'x': Error: <real message>" — strip that
// envelope so logs and any UI surface show the actual compiler/codegen error.
const cleanIpcError = (e: unknown): string => {
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
    nearestInScale: (note: number) => number
) => {
    const [isPlaying, setIsPlaying] = useState(false);
    const audioContext = useRef<AudioContext | null>(null);
    const workletNode = useRef<AudioWorkletNode | null>(null);
    const [analyserState, setAnalyserState] = useState<AnalyserNode | null>(null);
    const [masterGainState, setMasterGainState] = useState<GainNode | null>(null);

    // Surfaced to the UI — these errors were console-only, which made every
    // failure mode (Odin missing, codegen error, build timeout) look exactly
    // like "my patch is silent".
    // previewError: Play/worklet failed outright — nothing is sounding.
    // previewStale: a live-edit rebuild failed and the PREVIOUS module is
    // still playing — what you hear is not the graph on screen.
    const [previewError, setPreviewError] = useState<string | null>(null);
    const [previewStale, setPreviewStale] = useState<string | null>(null);

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

    // The asset whose step clock drives the UI playhead: first instrument
    // with a non-muted, non-empty track (mirrors the backend's Music Layer
    // detection). -1 keeps the playhead still when nothing sequences.
    const computeStepAsset = useCallback((currentNodes: Node[], tracks: SequencerTrack[]): number => {
        const instruments = getInstrumentNodes(currentNodes);
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
        // master_volume is baked as 1.0 for the preview: the dock's volume
        // slider drives the JS master GainNode live instead, so volume moves
        // don't force a recompile. The export path bakes the real value.
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
        setMasterGainState(null);
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
        setPreviewError(null);
        setPreviewStale(null);
        try {
            // Create the AudioContext synchronously, inside the click
            // gesture's window — created after the multi-hundred-ms build
            // await it can come up 'suspended' (autoplay policy) and play
            // silence.
            const context = new AudioContext();
            audioContext.current = context;

            const { bytes, signature, stepAsset } = await buildModule();
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
                processorOptions: { bytes, stepAsset, loop: isLooping },
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
            };
            // Structured-deserialization failures on messages FROM the worklet
            // are otherwise dropped without a trace (the worklet side has the
            // same net — that silence is how hot-swaps died undetected).
            node.port.onmessageerror = () => {
                logger.error('WasmAudioEngine', 'Message from worklet failed to deserialize');
                setPreviewError('A message from the audio engine was dropped (deserialization error).');
            };

            const masterGain = context.createGain();
            const analyser = context.createAnalyser();
            analyser.fftSize = 2048;
            node.connect(masterGain);
            masterGain.connect(analyser);
            analyser.connect(context.destination);

            if (context.state === 'suspended') {
                await context.resume();
            }

            workletNode.current = node;
            lastSignature.current = signature;
            prevInstruments.current = getInstrumentNodes(nodes);
            setAnalyserState(analyser);
            setMasterGainState(masterGain);
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
    }, [isPlaying, buildModule, isLooping, setCurrentStep, patternSteps, nodes]);

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
                if (rebuildQueued.current) {
                    rebuildQueued.current = false;
                    scheduleRebuild();
                }
            }
        }, REBUILD_DEBOUNCE_MS);
        // Stable identity (state lives in refs): the queued-rebuild recursion
        // in `finally` must call a scheduleRebuild that reads the LATEST
        // buildModuleRef, never one pinned to the render that started a build.
    }, []);

    // React to edits while playing: instant param path first, then decide
    // whether the change needs a re-codegen (topology signature changed).
    useDeepCompareEffect(() => {
        if (!isPlaying || !workletNode.current) return;

        const instrumentNodes = getInstrumentNodes(nodes);
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
                port.postMessage({ type: 'note-on', asset: -1, note, velocity, duration: 0.0 });
            } else if (command === 0x80 || (command === 0x90 && data2 === 0)) { // Note Off
                // Quantize exactly like note-on: the generated note_off
                // matches by note number, so an unquantized off leaves the
                // quantized note stuck on.
                port.postMessage({ type: 'note-off', asset: -1, note: nearestInScale(data1) });
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
    }, [nearestInScale]);

    return {
        isPlaying,
        handlePlay,
        handleStop,
        analyserNode: { current: analyserState },
        masterGainNode: { current: masterGainState },
        // Preview health, for visible UI surfacing (console-only errors made
        // toolchain failures indistinguishable from a silent patch).
        previewError,
        previewStale,
    };
};
