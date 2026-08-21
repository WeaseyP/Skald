/*
================================================================================
| FILE: skald-ui/src/hooks/nodeEditor/useProjectIssues.ts                      |
|                                                                              |
| SKB-009 (b): validate the project on GRAPH CHANGE rather than at build time.  |
|                                                                              |
| An unresolvable P-lock key aborts codegen outright (os.exit(1) in             |
| collect_plock_targets), and until now the ONLY thing that ever checked was    |
| codegen itself. Renaming a node was therefore silent: the editor looked fine, |
| autosave kept writing, and the failure surfaced at the next Generate as a     |
| build error rather than as "step 4 of Bass names a node that no longer        |
| exists".                                                                     |
|                                                                              |
| Deriving the answer from the live document instead means the rename reports    |
| itself in the same frame it happens — and un-reports itself on Undo, because  |
| there is no cached verdict to go stale.                                      |
================================================================================
*/
import { useMemo } from 'react';
import { Node } from '@xyflow/react';
import { NodeParams, SequencerTrack } from '../../definitions/types';
import {
    ProjectIssues,
    collectProjectIssues,
    formatProjectIssues,
} from '../../utils/projectWarnings';

export interface LiveProjectIssues extends ProjectIssues {
    /** One user-facing line per problem. */
    lines: string[];
    /** True when at least one issue really does fail Generate right now. */
    blocksBuild: boolean;
}

export const useProjectIssues = (
    nodes: Node<NodeParams>[],
    tracks: SequencerTrack[],
    patternSteps: number,
): LiveProjectIssues => useMemo(() => {
    const issues = collectProjectIssues(nodes, tracks, patternSteps);
    return {
        ...issues,
        lines: formatProjectIssues(issues),
        blocksBuild: issues.plocks.some(p => p.blocksBuild),
    };
}, [nodes, tracks, patternSteps]);
