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
| SKB-019 (packet B6-1): a graph with no Instrument node is auto-wrapped as one  |
|   SFX instrument named "Asset" by buildProjectData. That auto-wrap is NOT      |
|   reported here — it is informational, not a problem, and this module's       |
|   `formatProjectIssues` output is funneled into the SAME 'error'-kind status   |
|   banner Save/Load uses (useCodeGeneration.ts), which never auto-clears. An    |
|   earlier revision reported it here and painted a PERMANENT red "Export        |
|   warnings" overlay over every one of the 24 loose-graph examples even though  |
|   their build succeeded. It is announced once, on load, via the auto-clearing  |
|   success toast instead (useFileIO.ts's applySaveData) — see that file.        |
|                                                                              |
|   The wrap DOES still change what this module reports: a loose graph puts     |
|   EVERY sequencer track into the one synthetic Asset instrument regardless of  |
|   its own targetNodeId (buildProjectData maps `sequencerTracks` unconditionally|
|   in that branch, unlike the per-instrument path's                            |
|   `.filter(t => t.targetNodeId === instNode.id)`), so `subgraphNodesFor` and   |
|   `activeTrackIds` below mirror that same predicate — otherwise every P-lock   |
|   on a loose graph misreported as unresolvable (SKB-019's worst regression:    |
|   "Code generation will fail" over a build that actually exits 0).             |
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
import { getInstrumentNodes } from './projectSerializer';

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

/**
 * Same predicate buildProjectData uses to decide whether to wrap (SKB-019 /
 * packet B6-1): a graph with at least one node but no Instrument node. Shared
 * here so `subgraphNodesFor` and `activeTrackIds` resolve P-locks against
 * exactly the shape the backend will actually see, not the pre-wrap one.
 */
const isLooseGraph = (nodes: Node<NodeParams>[]): boolean =>
    nodes.length > 0 && getInstrumentNodes(nodes).length === 0;

/**
 * The nodes a track's P-locks resolve against.
 *
 * On a loose graph (no Instrument node), buildProjectData funnels EVERY
 * sequencer track into the ONE synthetic "Asset" instrument's audio_graph
 * regardless of the track's own targetNodeId — it maps `sequencerTracks`
 * unconditionally in that branch, unlike the per-instrument path's
 * `.filter(t => t.targetNodeId === instNode.id)`. So a loose graph's P-locks
 * resolve against the WHOLE top-level graph, not whatever single (possibly
 * unrelated, pre-wrap) node id the track happens to name. Getting this wrong
 * was SKB-019's worst editor-side regression: every P-lock on a loose graph
 * reported `kind: 'unresolvable'` / `blocksBuild: true` — "Code generation
 * will fail" — for a project whose editor-path codegen actually exits 0.
 */
const subgraphNodesFor = (
    nodes: Node<NodeParams>[],
    track: SequencerTrack,
): Node<NodeParams>[] | null => {
    if (isLooseGraph(nodes)) return nodes;

    const instrument = nodes.find(n => n.id === track.targetNodeId);
    if (!instrument) return null;
    const subgraph = (instrument.data as { subgraph?: { nodes?: unknown } } | undefined)?.subgraph;
    const subNodes = subgraph?.nodes;
    return Array.isArray(subNodes) ? (subNodes as Node<NodeParams>[]) : [];
};

/**
 * Mirror of `active_sequencer_tracks`.
 *
 * Three details are load-bearing:
 *
 *  - the solo test is scoped to ONE instrument's tracks (`all` is built from
 *    the tracks whose target is this instrument), so soloing a drum track does
 *    not silence a bass track — EXCEPT on a loose graph (SKB-019 / packet
 *    B6-1), where buildProjectData puts every track under the SAME synthetic
 *    Asset instrument regardless of targetNodeId, so grouping by targetNodeId
 *    there would score solo/mute against groups that do not exist backend-side;
 *  - only a track that would otherwise sound counts as soloing —
 *    `t.solo && !t.mute && len(t.events) > 0`. A soloed-but-muted track leaves
 *    any_solo false, which means its unsoloed siblings stay ACTIVE.
 *
 * Getting any of these wrong makes this over- or under-report inactivity, and
 * `blocksBuild` then lies about whether Generate actually fails. That is the
 * one failure mode a mirror must not have.
 */
const activeTrackIds = (tracks: SequencerTrack[], nodes: Node<NodeParams>[]): Set<string> => {
    const loose = isLooseGraph(nodes);
    const byInstrument = new Map<string, SequencerTrack[]>();
    for (const t of tracks) {
        const key = loose ? '__ASSET__' : t.targetNodeId;
        const group = byInstrument.get(key);
        if (group) group.push(t);
        else byInstrument.set(key, [t]);
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
    const active = activeTrackIds(tracks, nodes);
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
 *
 * Deliberately does NOT report the loose-graph auto-wrap (SKB-019 / packet
 * B6-1): it is informational, not a problem, and this function's output is
 * funneled into the SAME 'error'-kind status banner Save/Load uses
 * (useCodeGeneration.ts), which never auto-clears — reporting it here once
 * painted a PERMANENT red "Export warnings" overlay over a build that
 * actually succeeded, on all 24 loose-graph examples. It is announced once,
 * on load, via the auto-clearing success toast instead (useFileIO.ts).
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
