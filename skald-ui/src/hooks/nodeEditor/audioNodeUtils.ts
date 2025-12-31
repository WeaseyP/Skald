import { Node, Edge, Connection } from 'reactflow';
import type { AdsrDataMap } from './types';

const noteDivisionMap: { [key: string]: number } = {
    '1': 4,    // Whole Note
    '2': 2,    // Half Note
    '4': 1,    // Quarter Note
    '8': 0.5,  // 8th Note
    '16': 0.25, // 16th Note
    '32': 0.125,// 32nd Note
};

export const convertBpmToSeconds = (bpm: number, division: string): number => {
    if (bpm === 0) return 0;
    const quarterNoteTime = 60 / bpm;

    let timeMultiplier = 1;
    let noteValue = division;

    if (noteValue.endsWith('t')) { // Triplet
        timeMultiplier = 2 / 3;
        noteValue = noteValue.slice(0, -1);
    } else if (noteValue.endsWith('d')) { // Dotted
        timeMultiplier = 1.5;
        noteValue = noteValue.slice(0, -1);
    }

    const baseNoteKey = noteValue.startsWith('1/') ? noteValue.substring(2) : noteValue;
    const beatMultiplier = noteDivisionMap[baseNoteKey];

    if (beatMultiplier === undefined) {
        console.warn(`Unknown note division: ${division}, falling back to 1/4.`);
        return quarterNoteTime;
    }

    return quarterNoteTime * beatMultiplier * timeMultiplier;
};

export const connectNodes = (sourceNode: AudioNode, targetNode: any, edge: Edge | Connection) => {
    try {
        let effectiveSource = (sourceNode as any).output instanceof AudioNode ? (sourceNode as any).output : sourceNode;

        // Handle MidiInput outputs (gate, velocity)
        if (edge.sourceHandle === 'gate' && (sourceNode as any).gate) {
            effectiveSource = (sourceNode as any).gate;
        } else if (edge.sourceHandle === 'velocity' && (sourceNode as any).velocity) {
            effectiveSource = (sourceNode as any).velocity;
        }

        const handle = edge.targetHandle;
        const skaldNode = (targetNode as any)._skaldNode;

        // 1. Check explicit inputs on the SkaldWrapper (e.g. input_freq on SkaldOscillatorNode)
        if (skaldNode && handle && (skaldNode as any)[handle] instanceof AudioNode) {
            effectiveSource.connect((skaldNode as any)[handle]);
            return;
        }

        // 2. Check Input Gains (Dynamic input ports)
        if (targetNode.hasOwnProperty('inputGains') && handle && handle.startsWith('input_')) {
            const context = targetNode.context as AudioContext;
            let inputGain = targetNode.inputGains.get(handle);
            if (!inputGain) {
                inputGain = context.createGain();
                inputGain.connect(targetNode);
                targetNode.inputGains.set(handle, inputGain);
            }
            effectiveSource.connect(inputGain);
            return;
        }

        // 3. Check AudioWorkletParams
        if (targetNode instanceof AudioWorkletNode && handle?.startsWith('input_')) {
            const paramName = handle.substring(6);
            const param = targetNode.parameters.get(paramName);
            if (param) {
                effectiveSource.connect(param);
                return;
            }
        }

        // 4. Map Handles to Standard AudioParams
        let paramName = handle;
        if (handle === 'input_cutoff') paramName = 'frequency';
        if (handle === 'input_resonance') paramName = 'Q';
        if (handle === 'input_freq') paramName = 'frequency';
        if (handle === 'input_gain') paramName = 'gain';
        if (handle === 'input_detune') paramName = 'detune';

        if (paramName && (targetNode as any)[paramName] instanceof AudioParam) {
            effectiveSource.connect((targetNode as any)[paramName]);
            return;
        }

        // 5. Direct Node Input (Audio Connection)
        if (handle && (targetNode as any)[handle] instanceof AudioNode) {
            effectiveSource.connect((targetNode as any)[handle]);
        } else {
            // Fallback: If no handle match or just "input", connect to node itself
            if (effectiveSource.connect) {
                effectiveSource.connect(targetNode);
            }
        }
    } catch (e) {
        console.error(`Failed to connect ${edge.source} to ${edge.target}`, e);
    }
};

export const disconnectNodes = (sourceNode: AudioNode, targetNode: any, edge: Edge | Connection) => {
    try {
        if (targetNode.hasOwnProperty('inputGains') && edge.targetHandle && edge.targetHandle.startsWith('input_')) {
            const inputGain = targetNode.inputGains.get(edge.targetHandle);
            if (inputGain) sourceNode.disconnect(inputGain);
        } else if (targetNode instanceof AudioWorkletNode && edge.targetHandle?.startsWith('input_')) {
            const paramName = edge.targetHandle.substring(6);
            const param = targetNode.parameters.get(paramName);
            if (param) sourceNode.disconnect(param);
        } else if (targetNode[edge.targetHandle as keyof AudioNode] instanceof AudioParam) {
            sourceNode.disconnect(targetNode[edge.targetHandle as keyof AudioNode]);
        } else {
            sourceNode.disconnect(targetNode);
        }
    } catch (e) {
        // Errors are expected here if a node was deleted, so we can ignore them.
    }
};