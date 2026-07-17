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
import { Node, Edge } from 'reactflow';
import useDeepCompareEffect from 'use-deep-compare-effect';
import { skaldWasmProcessorString } from './audioWorklets/skaldWasm.worklet';
import {
    buildProjectData,
    getInstrumentNodes,
    getUniqueExposedParams,
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

    const buildModule = useCallback(async (): Promise<{ module: WebAssembly.Module, signature: string, stepAsset: number }> => {
        // master_volume is baked as 1.0 for the preview: the dock's volume
        // slider drives the JS master GainNode live instead, so volume moves
        // don't force a recompile. The export path bakes the real value.
        const projectData = buildProjectData(nodes, edges, sequencerTracks, bpm, 1.0, patternSteps, nearestInScale);
        if (projectData.project.instruments.length === 0) {
            throw new Error('No instruments on the canvas. Wrap nodes in an Instrument before playing.');
        }
        const bytes = await window.electron.buildWasmPreview(JSON.stringify(projectData));
        const module = await WebAssembly.compile(bytes);
        return {
            module,
            signature: topologySignature(projectData),
            stepAsset: Math.max(computeStepAsset(nodes, sequencerTracks), 0),
        };
    }, [nodes, edges, sequencerTracks, bpm, patternSteps, nearestInScale, computeStepAsset]);

    const handleStop = useCallback(() => {
        logger.info('WasmAudioEngine', 'Stop requested');
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

    // Synchronous re-entry latch: `isPlaying` is React state and stays stale
    // for the whole async build, so a fast double-click on Play would start
    // two concurrent builds and leak an AudioContext without this.
    const startInFlight = useRef(false);

    const handlePlay = useCallback(async () => {
        logger.info('WasmAudioEngine', 'Play requested');
        if (isPlaying || startInFlight.current) return;
        startInFlight.current = true;
        setPreviewError(null);
        setPreviewStale(null);
        try {
            // Create the AudioContext synchronously, inside the click
            // gesture's window — created after the multi-hundred-ms build
            // await it can come up 'suspended' (autoplay policy) and play
            // silence.
            const context = new AudioContext();
            audioContext.current = context;

            const { module, signature, stepAsset } = await buildModule();
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
                processorOptions: { module, stepAsset, loop: isLooping },
            });
            node.port.onmessage = (e) => {
                const m = e.data;
                if (m.type === 'step' && m.step >= 0) setCurrentStep(m.step % patternSteps);
                else if (m.type === 'ended') handleStopRef.current();
                else if (m.type === 'error') {
                    logger.error('WasmAudioEngine', 'Worklet error', m.message);
                    setPreviewError(String(m.message));
                }
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
            const message = cleanIpcError(e);
            logger.error('WasmAudioEngine', 'Failed to start wasm preview', message);
            console.error('Failed to start wasm preview:', e);
            setPreviewError(message);
            audioContext.current?.close();
            audioContext.current = null;
        } finally {
            startInFlight.current = false;
        }
    }, [isPlaying, buildModule, isLooping, setCurrentStep, patternSteps, nodes]);

    // Instant path: uniquely-exposed param edits go straight to the running
    // module via skald_set_param — no recompile, no audio interruption.
    const sendChangedExposedParams = useCallback((instrumentNodes: Node[]) => {
        const port = workletNode.current?.port;
        if (!port) return;
        const prev = prevInstruments.current;
        instrumentNodes.forEach((inst, assetIdx) => {
            const prevInst = prev.find(p => p.id === inst.id);
            if (!prevInst || prevInst === inst) return;
            const counts = getUniqueExposedParams(inst);
            const prevSubnodes = new Map<string, any>(
                ((prevInst.data as any)?.subgraph?.nodes ?? []).map((sn: any) => [sn.id, sn])
            );
            for (const sn of (inst.data as any)?.subgraph?.nodes ?? []) {
                const prevSn = prevSubnodes.get(sn.id);
                if (!prevSn || prevSn.data === sn.data) continue;
                for (const name of (sn.data?.exposedParameters ?? []) as string[]) {
                    if (counts.get(name) !== 1) continue;
                    const value = Number(sn.data?.[name]);
                    const prevValue = Number(prevSn.data?.[name]);
                    if (Number.isFinite(value) && value !== prevValue) {
                        port.postMessage({
                            type: 'set-param',
                            asset: assetIdx,
                            nameBytes: new TextEncoder().encode(name),
                            value,
                        });
                        logger.debug('WasmAudioEngine', `set-param ${name}=${value} (asset ${assetIdx})`);
                    }
                }
            }
        });
        prevInstruments.current = instrumentNodes;
    }, []);

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
            try {
                const { module, signature, stepAsset } = await buildModule();
                if (!workletNode.current) return; // stopped while building
                workletNode.current.port.postMessage({ type: 'swap', module, stepAsset });
                lastSignature.current = signature;
                setPreviewStale(null);
                logger.info('WasmAudioEngine', 'Hot-swapped rebuilt wasm module');
            } catch (e) {
                // Keep playing the previous module: mid-edit states (e.g. a
                // half-wired graph) are expected to fail codegen sometimes.
                // But SAY so — silently playing the old DSP while the screen
                // shows the new graph is the one way preview and export can
                // still disagree.
                const message = cleanIpcError(e);
                logger.error('WasmAudioEngine', 'Preview rebuild failed; keeping last module', message);
                setPreviewStale(message);
            } finally {
                buildInFlight.current = false;
                if (rebuildQueued.current) {
                    rebuildQueued.current = false;
                    scheduleRebuild();
                }
            }
        }, REBUILD_DEBOUNCE_MS);
    }, [buildModule]);

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
