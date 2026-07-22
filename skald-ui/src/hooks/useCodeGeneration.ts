
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
import { Node, Edge } from 'reactflow';
import { NodeParams, SequencerTrack } from '../definitions/types';
import { buildProjectData } from '../utils/projectSerializer';

export const useCodeGeneration = () => {
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
        nearestInScale?: (note: number) => number
    ) => {
        if (nodes.length === 0) {
            console.warn("Graph is empty.");
            setGeneratedCode("// Graph is empty.");
            return;
        }

        const projectData = buildProjectData(
            nodes, edges, sequencerTracks, bpm, masterVolume, patternSteps, nearestInScale
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
