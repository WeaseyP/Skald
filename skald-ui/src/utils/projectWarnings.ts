/*
================================================================================
| FILE: skald-ui/src/utils/projectWarnings.ts                                  |
|                                                                              |
| Everything wrong with a project that the user can only find out about by      |
| trying to build it — collected as data, at edit time, so the editor can point |
| at the offender instead of the build printing a message nobody sees.          |
|                                                                              |
| SKB-009: an unresolvable P-lock key ("<NodeLabel>:<param>" naming a node that |
|   was renamed or deleted) is a HARD codegen error — codegen_analysis.odin's   |
|   collect_plock_targets calls os.exit(1). One stale override in one step of    |
|   one track and nothing generates at all, with the reason reaching the user   |
|   only as "Generate failed". Renaming a node now tells you immediately.       |
| SKB-045: a non-numeric override is filtered out by projectSerializer, because |
|   the generated per-step setter takes an f32. That filter is correct and       |
|   silent, which is the bug: a waveform or BPM-Sync override authored in the    |
|   step editor disappeared between the preview and the export with no trace.   |
| SKB-009 (B5-4-followup): `collect_plock_targets` has a SECOND os.exit(1) —      |
|   a key that resolves fine but whose target parameter is not currently live    |
|   (`param_is_reachable` says no, e.g. an Oscillator's `frequency` while         |
|   `fixedPitch` is off). Toggling BPM Sync / fixedPitch AFTER a P-lock was       |
|   authored is exactly the graph edit the backend's own error message points     |
|   at as the expected user path, so it is the case most likely to turn a         |
|   previously-fine override fatal with nothing in the editor saying so.          |
| SKB-010: notes past min(track length, pattern length) are kept but never       |
|   sound. Also reported here, so Generate says so once rather than the user     |
|   discovering it by ear.                                                      |
|                                                                              |
| Every predicate here comes from plockTargets.ts / stepMetrics.ts, which mirror |
| the backend. This module only decides what is worth SAYING, never what is      |
| true — so it cannot drift away from what codegen actually does.                |
================================================================================
*/
import { Node } from '@xyflow/react';
import { NodeParams, NoteEvent, SequencerTrack } from '../definitions/types';
import {
    firstDeadTarget,
    isExportablePlockValue,
    paramDeadReason,
    plockTargetLabels,
    resolvePlockTargets,
} from './plockTargets';
import { effectiveTrackSteps, outOfRangeNotes } from '../components/Sequencer/stepMetrics';

export type PlockIssueKind = 'unresolvable' | 'dead' | 'non-numeric';

export interface PlockIssue {
    kind: PlockIssueKind;
    trackId: string;
    trackName: string;
    /** 0-based, as stored. User-facing strings add 1. */
    step: number;
    /** Which chord member owns the override — a step can hold several notes. */
    notePitch: number;
    key: string;
    value: unknown;
    /**
     * True when this override sits on a track codegen actually reads, i.e. the
     * build really does fail. Mirrors `active_sequencer_tracks` (see
     * activeTrackIds): unmuted, non-empty, and soloed whenever anything on the
     * SAME instrument is audibly soloing. A stale key on a muted track is
     * still worth showing, but saying Generate will fail when it will not is
     * its own lie — and so is the reverse.
     */
    blocksBuild: boolean;
    /** The labels codegen would print after "Valid targets:". */
    validTargets: string[];
    /**
     * Only for `kind === 'dead'`: which parameter was found dead (there can be
     * several resolved targets for a bare, label-less key) and `param_dead_reason`'s
     * wording for why, so the editor and the generator's exit message agree.
     */
    deadParam?: string;
    deadReason?: string;
}

export interface StepRangeIssue {
    trackId: string;
    trackName: string;
    count: number;
    playableSteps: number;
}

export interface ProjectIssues {
    plocks: PlockIssue[];
    stepRange: StepRangeIssue[];
}

/** The nodes a track's P-locks resolve against: its instrument's subgraph. */
const subgraphNodesFor = (
    nodes: Node<NodeParams>[],
    track: SequencerTrack,
): Node<NodeParams>[] | null => {
    const instrument = nodes.find(n => n.id === track.targetNodeId);
    if (!instrument) return null;
    const subgraph = (instrument.data as { subgraph?: { nodes?: unknown } } | undefined)?.subgraph;
    const subNodes = subgraph?.nodes;
    return Array.isArray(subNodes) ? (subNodes as Node<NodeParams>[]) : [];
};

/**
 * Mirror of `active_sequencer_tracks`.
 *
 * Two details are load-bearing and were both wrong when this was a one-line
 * `tracks.some(t => t.isSolo)`:
 *
 *  - the solo test is scoped to ONE instrument's tracks (`all` is built from
 *    the tracks whose target is this instrument), so soloing a drum track does
 *    not silence a bass track;
 *  - only a track that would otherwise sound counts as soloing —
 *    `t.solo && !t.mute && len(t.events) > 0`. A soloed-but-muted track leaves
 *    any_solo false, which means its unsoloed siblings stay ACTIVE.
 *
 * Getting either wrong makes this over-report inactivity, and `blocksBuild`
 * then tells the user "Generate still succeeds" about a project codegen exits
 * over. That is the one failure mode a mirror must not have.
 */
const activeTrackIds = (tracks: SequencerTrack[]): Set<string> => {
    const byInstrument = new Map<string, SequencerTrack[]>();
    for (const t of tracks) {
        const group = byInstrument.get(t.targetNodeId);
        if (group) group.push(t);
        else byInstrument.set(t.targetNodeId, [t]);
    }

    const active = new Set<string>();
    for (const group of byInstrument.values()) {
        const anySolo = group.some(t => t.isSolo && !t.isMuted && t.notes.length > 0);
        for (const t of group) {
            if (t.isMuted || t.notes.length === 0) continue;
            if (anySolo && !t.isSolo) continue;
            active.add(t.id);
        }
    }
    return active;
};

export const collectPlockIssues = (
    nodes: Node<NodeParams>[],
    tracks: SequencerTrack[],
): PlockIssue[] => {
    const active = activeTrackIds(tracks);
    const issues: PlockIssue[] = [];

    for (const track of tracks) {
        const subNodes = subgraphNodesFor(nodes, track);
        // No instrument node means the track is an orphan the registry is about
        // to prune; codegen never sees it, so there is nothing to warn about.
        if (!subNodes) continue;
        const validTargets = plockTargetLabels(subNodes);

        for (const note of track.notes) {
            for (const [key, value] of Object.entries(note.patchOverrides ?? {})) {
                const resolved = resolvePlockTargets(subNodes, key);
                let kind: PlockIssueKind | null = null;
                let dead: { node: Node<NodeParams>; param: string } | null = null;

                if (resolved.length === 0) {
                    kind = 'unresolvable';
                } else if (!isExportablePlockValue(value)) {
                    // A non-numeric value never survives projectSerializer's
                    // filter, so collect_plock_targets never even sees this
                    // key — it cannot ALSO be the dead-parameter exit path.
                    // Reporting both for one key would be noise even if it
                    // could; this is why it can't.
                    kind = 'non-numeric';
                } else {
                    dead = firstDeadTarget(subNodes, resolved);
                    if (dead) kind = 'dead';
                }
                if (!kind) continue;

                issues.push({
                    kind,
                    trackId: track.id,
                    trackName: track.name,
                    step: note.step,
                    notePitch: note.note,
                    key,
                    value,
                    // `dead` mirrors the same os.exit(1) path `unresolvable`
                    // does — both are hard codegen errors, so both defer to
                    // activeTrackIds the same way.
                    blocksBuild: (kind === 'unresolvable' || kind === 'dead') && active.has(track.id),
                    validTargets,
                    ...(dead ? { deadParam: dead.param, deadReason: paramDeadReason(dead.node, dead.param) } : {}),
                });
            }
        }
    }
    return issues;
};

export const collectStepRangeIssues = (
    tracks: SequencerTrack[],
    patternSteps: number,
): StepRangeIssue[] => tracks
    .map(track => ({
        trackId: track.id,
        trackName: track.name,
        count: outOfRangeNotes(track, patternSteps).length,
        playableSteps: effectiveTrackSteps(track.steps, patternSteps),
    }))
    .filter(issue => issue.count > 0);

export const collectProjectIssues = (
    nodes: Node<NodeParams>[],
    tracks: SequencerTrack[],
    patternSteps: number,
): ProjectIssues => ({
    plocks: collectPlockIssues(nodes, tracks),
    stepRange: collectStepRangeIssues(tracks, patternSteps),
});

/**
 * One human-readable line per problem, each naming what to do about it. Steps
 * are 1-based here, matching every other user-facing step string in the
 * sequencer (`pushHistory('Toggle step ${step + 1}')`).
 */
export const formatProjectIssues = ({ plocks, stepRange }: ProjectIssues): string[] => {
    const lines: string[] = [];

    for (const issue of plocks) {
        const where = `"${issue.trackName}" step ${issue.step + 1} (note ${issue.notePitch})`;
        if (issue.kind === 'unresolvable') {
            const targets = issue.validTargets.length > 0
                ? issue.validTargets.map(t => `"${t}"`).join(', ')
                : 'none';
            lines.push(
                `${where}: the step override "${issue.key}" matches no node in the patch — `
                + `the node was probably renamed or deleted. Valid targets: ${targets}. `
                + (issue.blocksBuild
                    ? 'Codegen rejects unresolvable overrides, so Generate will fail until this is removed or the label restored.'
                    : 'This track is silent right now, so Generate still succeeds — but unmuting it will fail the build.')
            );
        } else if (issue.kind === 'dead') {
            // A dead parameter (unlike an unresolvable key) names a LIVE node,
            // so removing the override is only one of two fixes — the other is
            // reconfiguring the node so param_is_reachable says yes. syncRate
            // is the one exception: no configuration ever makes it live, so
            // only the delete fix exists (mirrors collect_plock_targets'
            // separate wording for that case).
            const onlyFixIsDelete = issue.deadParam === 'syncRate';
            lines.push(
                `${where}: the step override "${issue.key}" targets a parameter that is dead right `
                + `now — ${issue.deadReason} — so the generated code never reads it and the override `
                + 'would silently do nothing. '
                + (onlyFixIsDelete
                    ? 'No node configuration makes `syncRate` live, so the only fix is removing this override.'
                    : 'Toggle BPM Sync / fixedPitch so the parameter is live again, or remove this override.')
                + ' '
                + (issue.blocksBuild
                    ? 'Codegen rejects a dead-parameter override, so Generate will fail until this is fixed.'
                    : 'This track is silent right now, so Generate still succeeds — but activating it will fail the build.')
            );
        } else {
            lines.push(
                `${where}: the step override "${issue.key}" holds ${JSON.stringify(issue.value)}, `
                + 'which the generated per-step setter cannot carry (it takes a number). '
                + 'It is dropped on export and in the preview — remove it, or automate a numeric parameter instead.'
            );
        }
    }

    for (const issue of stepRange) {
        lines.push(
            `"${issue.trackName}": ${issue.count} ${issue.count === 1 ? 'note' : 'notes'} past step `
            + `${issue.playableSteps} will not sound — the track plays ${issue.playableSteps} steps `
            + '(the smaller of its own length and the pattern length). The notes are kept; raise '
            + 'either length to hear them.'
        );
    }

    return lines;
};

/** Overrides on one note that the export will silently discard (SKB-045). */
export const droppedOverrideKeys = (note: NoteEvent | undefined): string[] =>
    Object.entries(note?.patchOverrides ?? {})
        .filter(([, value]) => !isExportablePlockValue(value))
        .map(([key]) => key);
