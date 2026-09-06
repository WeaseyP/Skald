
/*
================================================================================
| FILE: skald-ui/src/hooks/useCodeGeneration.ts                                |
|                                                                              |
| This hook encapsulates the explicit Generate flow: serialize the React Flow |
| graph (shared serializer — the SAME transform the live wasm preview builds  |
| from, so what you hear is what ships) and hand it to the backend codegen.   |
================================================================================
*/
import { useState } from 'react';
import { Node, Edge } from '@xyflow/react';
import { NodeParams, SequencerTrack } from '../definitions/types';
import { buildProjectData } from '../utils/projectSerializer';
import { collectProjectIssues, formatProjectIssues } from '../utils/projectWarnings';
import { FileStatus } from './nodeEditor/useFileIO';

/**
 * `notify` carries export warnings to the same on-canvas status banner
 * Save/Load uses, where an 'error' stays up until the next file action.
 *
 * Serialization is the moment a non-numeric P-lock is filtered away (SKB-045),
 * an unresolvable one is handed to a codegen that will exit(1) over it
 * (SKB-009), and an out-of-range note is written into a `case` the generated
 * sequencer can never reach (SKB-010). None of those had ANY user-facing
 * report — not even a console.warn — so an override authored in the step
 * editor could vanish between the preview and the export leaving no trace at
 * all. The warnings do not veto the build; they say what it cost.
 */
export const useCodeGeneration = (notify?: (status: FileStatus) => void) => {
    const [generatedCode, setGeneratedCode] = useState<string | null>(null);

    const handleGenerate = async (
        nodes: Node<NodeParams>[],
        edges: Edge[],
        sequencerTracks: SequencerTrack[],
        bpm: number,
        masterVolume: number,
        packageName: string,
        outputPath: string,
        // Global pattern length: the loop boundary the preview engine uses.
        // Without it the generated loop silently reverted to 16 steps.
        patternSteps = 16,
        // Scale quantizer from ScaleContext: the preview quantizes at
        // schedule time, so exported notes must be quantized too or the
        // generated code plays the raw (out-of-key) pitches.
        nearestInScale?: (note: number) => number,
        // G3: the session's key/scale, so the runtime scale API is emitted
        // for an exported build the same way the live preview would need it.
        rootNote?: string,
        scaleName?: string
    ) => {
        if (nodes.length === 0) {
            console.warn("Graph is empty.");
            setGeneratedCode("// Graph is empty.");
            return;
        }

        const warnings = formatProjectIssues(
            collectProjectIssues(nodes, sequencerTracks, patternSteps)
        );
        if (warnings.length > 0 && notify) {
            notify({
                kind: 'error',
                message: [`Export warnings (${warnings.length}):`, ...warnings.map(w => `- ${w}`)].join('\n'),
            });
        }

        const projectData = buildProjectData(
            nodes, edges, sequencerTracks, bpm, masterVolume, patternSteps, nearestInScale,
            undefined, rootNote, scaleName
        );

        try {
            const code = await window.electron.invokeCodegen(JSON.stringify(projectData, null, 2), { packageName, outputPath });
            setGeneratedCode(code);
        } catch (error) {
            console.error("Error during code generation:", error);
            setGeneratedCode(`// ERROR: Failed to generate code.\n// ${error}`);
        }
    };

    return {
        generatedCode,
        setGeneratedCode,
        handleGenerate,
    };
};
