/*
================================================================================
| FILE: skald-ui/src/definitions/bpm.ts                                        |
|                                                                              |
| Single source of truth for project-tempo constants and BPM-sync math on the |
| UI side. Every BPM edit control (Sidebar, Sequencer toolbar) clamps through |
| clampBpm, and every sync-rate dropdown (node cards AND the parameter panel) |
| offers the same SYNC_RATE_OPTIONS — they previously offered two different   |
| lists over the same stored `syncRate` value, so a rate picked in the panel  |
| could render as a blank select on the node card.                            |
|                                                                              |
| syncRateToSeconds mirrors skald-backend/core/codegen.odin's                 |
| bpm_sync_seconds_expr exactly (whole note = 4 beats, trailing 't' = triplet |
| = 2/3 length) so what the UI displays is what the generated code computes.  |
================================================================================
*/

export const BPM_MIN = 20;
// SKB-050: was 300, which no shipped patch ever needed and which nothing in
// this file's history justifies as a musical limit — it was a UI default
// picked in passing while fixing the NaN-clamp bug (BUG-BPM-SETUP-UX), not a
// considered ceiling. 999 unifies with `param_ranges.odin`'s "" "bpm" row,
// which predates this file and matches the conventional DAW tempo ceiling
// (Ableton Live, FL Studio, Logic all cap at 999 BPM). The backend's step
// accumulator (`codegen.odin`'s `samples_per_step_f` / `step_frac_acc`) never
// assumed an upper bound — it floors every step at 1 sample regardless of how
// small `samples_per_step_f` gets — so there is no engine reason to stay at
// 300 either. See BUGS.md SKB-050 and the retired allowlist entry this
// unification removes from RangeParity.test.tsx.
export const BPM_MAX = 999;
export const BPM_DEFAULT = 120;

// Clamp a BPM edit into the supported range. Non-finite input (empty field,
// garbage paste) falls back to the project default instead of poisoning the
// whole timing pipeline with NaN (NaN serialized as JSON null, which the
// backend read as bpm=0 — a divide-by-zero time base).
export const clampBpm = (value: number): number => {
    if (!Number.isFinite(value)) return BPM_DEFAULT;
    return Math.min(BPM_MAX, Math.max(BPM_MIN, value));
};

// Canonical musical divisions for BPM-synced nodes, longest to shortest.
// Superset of both previous lists; the backend parses any "1/N" or "1/Nt".
export const SYNC_RATE_OPTIONS = [
    '1/1',
    '1/2', '1/2t',
    '1/4', '1/4t',
    '1/8', '1/8t',
    '1/16', '1/16t',
    '1/32', '1/32t',
    '1/64', '1/64t',
];

// Seconds per cycle for a sync rate at a tempo. Mirror of the backend's
// bpm_sync_seconds_expr: whole note = 4 beats, trailing 't' = triplet (2/3).
export const syncRateToSeconds = (syncRate: string, bpm: number): number => {
    const triplet = syncRate.endsWith('t');
    const core = triplet ? syncRate.slice(0, -1) : syncRate;
    let denom = 4;
    if (core.startsWith('1/')) {
        const n = parseInt(core.slice(2), 10);
        if (Number.isFinite(n) && n > 0) denom = n;
    } else if (core === '1') {
        denom = 1;
    }
    let beats = 4 / denom;
    if (triplet) beats *= 2 / 3;
    return (60 / bpm) * beats;
};

// Human-readable effective time for a synced control, e.g.
// "1/8 at 120 BPM = 0.250 s". Shown beside sync-rate dropdowns so the user
// can see the project tempo their node is following without hunting for the
// global BPM field.
export const formatSyncTime = (syncRate: string, bpm: number): string =>
    `${syncRate} at ${bpm} BPM = ${syncRateToSeconds(syncRate, bpm).toFixed(3)} s`;
