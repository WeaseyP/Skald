import { NodeParams } from "../../../definitions/types";

export abstract class BaseSkaldNode {
    abstract update(data: Partial<NodeParams>): void;
}

export type SkaldNodeWithUpdate = AudioNode & {
    _skaldNode: BaseSkaldNode;
};

