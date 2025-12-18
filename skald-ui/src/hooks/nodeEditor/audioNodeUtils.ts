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
        const effectiveSource = (sourceNode as any).output instanceof AudioNode ? (sourceNode as any).output : sourceNode;
        const handle = edge.targetHandle;

        if (targetNode.hasOwnProperty('inputGains') && handle && handle.startsWith('input_')) {
            const context = targetNode.context as AudioContext;
            let inputGain = targetNode.inputGains.get(handle);
            if (!inputGain) {
                inputGain = context.createGain();
                inputGain.connect(targetNode);
                targetNode.inputGains.set(handle, inputGain);
            }
            effectiveSource.connect(inputGain);
        } else if (targetNode instanceof AudioWorkletNode && handle?.startsWith('input_')) {
            const paramName = handle.substring(6);
            const param = targetNode.parameters.get(paramName);
            if (param) effectiveSource.connect(param);
        } else if (handle && targetNode[handle as keyof AudioNode] instanceof AudioParam) {
            effectiveSource.connect(targetNode[handle as keyof AudioNode]);
        } else if (handle && targetNode[handle as keyof AudioNode] instanceof AudioNode) {
            effectiveSource.connect(targetNode[handle as keyof AudioNode]);
        } else {
            effectiveSource.connect(targetNode);
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