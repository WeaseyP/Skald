export abstract class BaseSkaldNode {
    abstract update(data: any): void;
}

export type SkaldNodeWithUpdate = AudioNode & {
    _skaldNode: BaseSkaldNode;
};

