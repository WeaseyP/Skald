/*
================================================================================
| FILE: skald-ui/src/hooks/nodeEditor/useProjectIssues.ts                      |
|                                                                              |
| SKB-009 (b): validate the project on GRAPH CHANGE rather than at build time.  |
|                                                                              |
| collect_plock_targets has TWO os.exit(1) paths and until now the ONLY thing   |
| that ever checked either was codegen itself: an unresolvable key (the node    |
| was renamed or deleted) and — B5-4-followup — a key that still resolves but   |
| whose target parameter param_is_reachable says is dead under the node's       |
| CURRENT configuration (e.g. an Oscillator's frequency after fixedPitch is      |
| switched off). Both were silent: the editor looked fine, autosave kept        |
| writing, and the failure surfaced at the next Generate as a build error       |
| rather than as "step 4 of Bass names a node that no longer exists" or         |
| "step 4 of Bass P-locks a parameter that toggle just turned off".              |
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

/**
 * The banner’s severity, and the ONE place the document’s issues collapse into
 * a verdict. ‘error’ means codegen will exit(1) over a P-lock that resolves to
 * nothing or to a dead parameter; ‘warning’ means a problem worth showing that
 * still builds; ‘none’ means there is nothing to say and the banner does not
 * render at all.
 *
 * Only conditions the user must ACT on belong here. A condition the app
 * already handled — the loose-graph auto-wrap (SKB-019) — is announced once by
 * the load-time success toast in useFileIO.ts, which auto-clears, because this
 * banner is non-dismissible by design and a permanent notice about a handled
 * condition reads as an unfixed problem.
 */
export type ProjectIssueSeverity = 'none' | 'warning' | 'error';

export interface LiveProjectIssues extends ProjectIssues {
    /** One user-facing line per problem. */
    lines: string[];
    /** What ProjectIssuesBanner should style itself as. */
    severity: ProjectIssueSeverity;
}

export const useProjectIssues = (
    nodes: Node<NodeParams>[],
    tracks: SequencerTrack[],
    patternSteps: number,
): LiveProjectIssues => useMemo(() => {
    const issues = collectProjectIssues(nodes, tracks, patternSteps);
    const blocksBuild = issues.plocks.some(p => p.blocksBuild) || issues.exportIds.length > 0;
    const hasWarnings = issues.plocks.length > 0 || issues.stepRange.length > 0 || issues.exportIds.length > 0;
    const severity: ProjectIssueSeverity = blocksBuild
        ? 'error'
        : hasWarnings
            ? 'warning'
            : 'none';
    return {
        ...issues,
        lines: formatProjectIssues(issues),
        severity,
    };
}, [nodes, tracks, patternSteps]);
