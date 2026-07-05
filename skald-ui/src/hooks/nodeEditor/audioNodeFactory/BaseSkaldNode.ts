import { NodeParams } from "../../../definitions/types";

export abstract class BaseSkaldNode {
    // Stable dispatch tag. Edge routing used to switch on
    // `constructor.name`, which minified production builds mangle —
    // silently breaking ALL modulation wiring in the packaged app.
    // Subclasses override with their own literal.
    public readonly skaldType: string = 'SkaldNode';
    abstract update(data: Partial<NodeParams>): void;
}

export type SkaldNodeWithUpdate = AudioNode & {
    _skaldNode: BaseSkaldNode;
};

