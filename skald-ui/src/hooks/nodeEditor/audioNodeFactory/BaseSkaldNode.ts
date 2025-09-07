import { Edge, Connection } from 'reactflow';

export abstract class BaseSkaldNode {
    abstract update(data: any, options?: { bpm?: number }): void;
    
    // Default connection logic can be handled here if there's a common input property.
    // Otherwise, subclasses must implement this.
    abstract connectInput(
        sourceNode: AudioNode,
        targetHandle: string | null,
        edge: Edge | Connection
    ): void;

    abstract disconnectInput(
        sourceNode: AudioNode,
        targetHandle: string | null,
        edge: Edge | Connection
    ): void;
}

export type SkaldNodeWithUpdate = AudioNode & {
    _skaldNode: BaseSkaldNode;
};

