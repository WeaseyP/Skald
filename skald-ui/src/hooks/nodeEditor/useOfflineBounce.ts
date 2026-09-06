/*
================================================================================
| FILE: skald-ui/src/hooks/nodeEditor/useOfflineBounce.ts                      |
|                                                                              |
| Roadmap G1 (§9.12 item 1) — "Bounce to WAV" in the sidebar's export section. |
|                                                                              |
| Serialise -> build -> render -> encode -> save. The three middle steps live  |
| in pure modules (audio/offlineRender.ts, audio/wavEncoder.ts) with their own |
| fixtures; this hook exists to make the first and last honest.                |
|                                                                              |
| SERIALISE. It calls the same buildProjectData with the same arguments        |
| useWasmAudioEngine::buildModule uses, master_volume baked at a               |
| topology-neutral 1.0, and then reapplies the live fader through              |
| skald_set_master_volume the way the worklet does. That is not an             |
| optimisation, it is the correctness claim: a bounce built from a DIFFERENT   |
| project description would be a different program, and "the WAV doesn't       |
| sound like the preview" would be unanswerable. (It also means the main       |
| process is handed a byte-identical build request to the one the preview      |
| already made.)                                                               |
|                                                                              |
| SAVE. Every failure in the chain is surfaced through the same file-status    |
| banner Save and Generate use. A bounce is minutes of a user's attention; a   |
| silent failure that leaves a spinner turning is worse here than anywhere     |
| else in the editor.                                                          |
================================================================================
*/
import { useCallback, useRef, useState } from 'react';
import { Node, Edge } from '@xyflow/react';
import { buildProjectData } from '../../utils/projectSerializer';
import { SequencerTrack } from '../../definitions/types';
import { FileStatus } from './useFileIO';
import { cleanIpcError } from './useWasmAudioEngine';
import { encodeWav24 } from '../../audio/wavEncoder';
import { framesForBars, renderOfflineChunked } from '../../audio/offlineRender';
import { logger } from '../../utils/logger';

/**
 * Delivery rate for every bounce, regardless of what the preview's
 * AudioContext happens to be running at. A game engine and a DAW both want a
 * predictable file, and the render is faster than realtime either way — the
 * module has no wall clock, so the rate is just the number skald_init seeds
 * the step divisor with (see audio/offlineRender.ts).
 */
export const BOUNCE_SAMPLE_RATE = 48000;

export interface BounceRequest {
    /** Whole bars of sequenced material to render. */
    bars: number;
    /** Keep rendering after the last bar until the ring-out has died away. */
    includeTail: boolean;
}

export interface OfflineBounceParams {
    nodes: Node[];
    edges: Edge[];
    tracks: SequencerTrack[];
    bpm: number;
    patternSteps: number;
    masterVolume: number;
    packageName: string;
    nearestInScale: (note: number) => number;
    notify: (status: FileStatus) => void;
}

/** A file name a filesystem will accept, derived from the project's package name. */
export const bounceFileName = (packageName: string, suffix = ''): string => {
    const base = (packageName || 'skald').replace(/[^A-Za-z0-9_-]+/g, '_').replace(/^_+|_+$/g, '');
    return `${base || 'skald'}${suffix}.wav`;
};

export const useOfflineBounce = ({
    nodes,
    edges,
    tracks,
    bpm,
    patternSteps,
    masterVolume,
    packageName,
    nearestInScale,
    notify,
}: OfflineBounceParams) => {
    const [isBouncing, setIsBouncing] = useState(false);
    const [progress, setProgress] = useState(0);
    // A ref as well as the state flag: two clicks in the same tick both see
    // `isBouncing === false` (React has not re-rendered yet) and would start
    // two renders over the same wasm build.
    const busy = useRef(false);
    const canceled = useRef(false);

    const cancelBounce = useCallback(() => {
        canceled.current = true;
    }, []);

    /** Build the wasm module a bounce renders from — the preview's own build request. */
    const buildBounceModule = useCallback(async (): Promise<{ bytes: ArrayBuffer; instrumentNames: string[] }> => {
        const projectData = buildProjectData(
            nodes, edges, tracks, bpm, 1.0, patternSteps, nearestInScale);
        if (projectData.project.instruments.length === 0) {
            throw new Error('No instruments on the canvas. Wrap nodes in an Instrument before bouncing.');
        }
        const bytes = await window.electron.buildWasmPreview(JSON.stringify(projectData));
        // Asset index order IS this array's order: the generated shim
        // addresses assets by their position in project.instruments
        // (skald-backend/core/codegen_project.odin's `case %d:` switches), and
        // buildProjectData emits them in orderedInstrumentNodes order. Reading
        // the names from the very array that was sent is what keeps a stem's
        // file name attached to the asset it actually silenced everything else
        // for.
        const instrumentNames = projectData.project.instruments.map(
            (inst: { name?: string }, i: number) => inst.name || `Asset${i + 1}`);
        return { bytes, instrumentNames };
    }, [nodes, edges, tracks, bpm, patternSteps, nearestInScale]);

    /** Render one pass and hand back an encoded WAV, or null if the user canceled. */
    const renderToWav = useCallback(async (
        bytes: ArrayBuffer,
        request: BounceRequest,
        assetVolumes?: readonly number[],
    ): Promise<Uint8Array | null> => {
        const frames = framesForBars(request.bars, bpm, BOUNCE_SAMPLE_RATE);
        const rendered = await renderOfflineChunked({
            bytes,
            sampleRate: BOUNCE_SAMPLE_RATE,
            frames,
            masterVolume,
            // Looping is forced ON for the bar count regardless of the
            // transport's Loop button: the user asked for N bars, and a
            // non-looping pattern shorter than N bars would hand them silence
            // for the remainder rather than the take they asked for.
            loop: true,
            includeTail: request.includeTail,
            assetVolumes,
            onProgress: (done, total) => {
                setProgress(total > 0 ? Math.min(1, done / total) : 0);
                return !canceled.current;
            },
        });
        if (rendered.canceled) return null;
        return encodeWav24(rendered.left, rendered.right, BOUNCE_SAMPLE_RATE);
    }, [bpm, masterVolume]);

    /** Report a save result through the banner. A canceled dialog is not a failure. */
    const reportSave = useCallback((
        result: { saved: boolean; path?: string; error?: string },
        what: string,
    ): void => {
        if (result.saved) {
            notify({ kind: 'success', message: `${what} saved to ${result.path ?? 'disk'}` });
        } else if (result.error) {
            notify({ kind: 'error', message: `${what} failed: ${result.error}` });
        }
    }, [notify]);

    const bounceToWav = useCallback(async (request: BounceRequest): Promise<void> => {
        if (busy.current) return;
        busy.current = true;
        canceled.current = false;
        setIsBouncing(true);
        setProgress(0);
        try {
            const { bytes } = await buildBounceModule();
            const wav = await renderToWav(bytes, request);
            if (!wav) {
                notify({ kind: 'success', message: 'Bounce canceled' });
                return;
            }
            const saveWav = window.electron.saveWav;
            if (!saveWav) {
                throw new Error('This build cannot write WAV files (the app needs restarting after an update).');
            }
            reportSave(await saveWav(bounceFileName(packageName), wav), 'Bounce');
        } catch (err) {
            const message = cleanIpcError(err);
            logger.error('OfflineBounce', `Bounce failed: ${message}`);
            notify({ kind: 'error', message: `Bounce failed: ${message}` });
        } finally {
            setIsBouncing(false);
            setProgress(0);
            busy.current = false;
        }
    }, [buildBounceModule, renderToWav, notify, packageName, reportSave]);

    return { isBouncing, progress, bounceToWav, cancelBounce };
};
