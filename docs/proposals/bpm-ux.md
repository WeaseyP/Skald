# BPM input hygiene

*(formerly “BPM setup UX — current state, inconsistencies, proposal (BUG-BPM-SETUP-UX)”)*

Status: Phase A/B analysis + proposal. The "Implemented now" subset at the end
of this document has landed on this branch; everything else is a
recommendation only and deliberately **not** implemented, because it could
change how existing saved projects sound.

---

## 0. Status update (2026-09-06)

This proposal's tempo-consistency defects are closed, not open. **B2 (Exposure Honesty)** and
**C7 (BPM-Sync Value Hygiene)** in `ROADMAP.md` are both ✅ CLOSED (2026-09-05) and cover the
dead-parameter class this document's inconsistencies feed into: a `bpmSync`/`syncRate` control
that reads as live in the editor while the generated setter for it is never actually reachable
(F-A03-3). Do not read what follows as unfinished tempo work — it is a historical record of
what shipped on this branch before B2/C7 landed, checked against the code as of today.

**§4 "Implemented now" — status of each item:**

1. `bpm.ts` shared `BPM_MIN/MAX/DEFAULT`, `clampBpm`, `SYNC_RATE_OPTIONS`, `syncRateToSeconds` —
   **landed**, unchanged.
2. `Sidebar.tsx` clamped `NumberInput`, shared tooltip — **landed**.
3. `SequencerToolbar.tsx` shared clamp/constants — **landed**.
4. Shared sync-rate dropdowns (`BpmSyncControl.tsx`, `DelayNode.tsx`, `LFONode.tsx`,
   `SampleHoldNode.tsx`) — **landed**.
5. Effective-time annotation in `NodeParameterControls.tsx`/`ParameterPanel.tsx` — **landed**.
6. `json.odin`'s `build_project_from_raw` defaulting `bpm <= 0` to 120 — **landed**.
7. `BpmConsistency.test.tsx` + golden `bpm_absent_defaults` — **landed**.

**§3.4 "Deferred / explicitly not implemented" — current status:**

- Removing the sidebar BPM field — **not landed**; the field is still in `Sidebar.tsx`. Still a
  UX decision, not a defect.
- Node-card tempo badge + resolved-time on cards — **landed, superseded by C7**:
  `ParamNode.tsx`'s `ParamField.hint` renders `formatSyncTime` on the LFO/Delay/SampleHold cards
  via `useProjectBpm`/`GraphActionsContext`. No decorative "♩ = project BPM" badge was added,
  but the substantive resolved-time annotation this item asked for exists.
- Dropping `start_time` from the export contract — **not landed**; `projectSerializer.ts` still
  serializes it. Still a JSON-contract change, not forced by anything closed since.
- Unifying UI (300) and backend (999) max BPM — **landed, superseded**: `SKB-050` (Wave A) set
  `BPM_MAX = 999` everywhere (`skald-ui/src/definitions/bpm.ts`), unifying from the opposite
  direction than this row proposed (raise the UI ceiling, not lower the backend's).
- "No tempo in this save" load banner — **not landed**; no such banner exists in `useFileIO.ts`.
- Runtime tempo changes without rebuild (`skald_set_param` for bpm) — **not landed**; still an
  engine feature, not a UX fix.

## 1. Current-state map: where tempo lives

### 1.1 Ownership

Tempo is a **single project-level value**. There is exactly one owner:

| What | Where |
| --- | --- |
| The owning state | `skald-ui/src/app.tsx:76` — `const [bpm, setBpm] = useState(120);` |
| Default | 120 (UI), 120 (backend fallback: `skald-backend/core/json.odin` `build_project_from_graph`, and now also `build_project_from_raw`), 120 (`skald-backend/core/param_ranges.odin:104-105`, range 20–999) |

There is **no per-instrument or per-sequencer-node tempo**. Nodes never store
a BPM; three node types (LFO, Delay, Sample & Hold) store a *relationship* to
the project tempo instead: `bpmSync: boolean` + `syncRate: string` ("1/4",
"1/8t", …) in node data (`skald-ui/src/definitions/node-definitions.ts:65-80,
114-121`, `skald-ui/src/definitions/types.ts:27-32`).

### 1.2 Every place tempo can be edited

| Control | File | Behavior (before this branch) |
| --- | --- | --- |
| Sidebar "Global → BPM" number field | `skald-ui/src/components/Sidebar.tsx:151-159` | Raw `<input type="number">`, `parseInt` with **no NaN guard and no clamping** (min/max attributes are not enforced for typed input) |
| Sequencer toolbar "BPM:" field | `skald-ui/src/components/Sequencer/SequencerToolbar.tsx:96-103` | `NumberInput` clamped to 20–300 |
| Loading a save file | `skald-ui/src/hooks/nodeEditor/useFileIO.ts:112-124` | Restores `session.bpm` only if finite and > 0; older saves without a session block keep the *current* BPM |

Both visible controls write the **same** `app.tsx` state — they cannot
diverge from each other, but nothing tells the user they are the same field.

### 1.3 Every consumer of the value

| Consumer | Path | Notes |
| --- | --- | --- |
| Web Audio preview (wasm engine) | `app.tsx:140` → `useWasmAudioEngine.ts:45,94,301` → `buildProjectData(..., bpm, ...)` → codegen → wasm | The preview plays the *actual generated Odin code*; `p.bpm` is baked at build. A BPM edit while playing changes `topologySignature` and hot-swap-rebuilds the module (`useWasmAudioEngine.ts:301-306`) |
| Odin export (Generate) | `app.tsx:370` → `useCodeGeneration.ts:23,42` → the **same** `buildProjectData` | Preview and export are fed byte-identical project JSON, including `project.bpm` |
| Serialized project JSON | `skald-ui/src/utils/projectSerializer.ts:94` (`bpm:`), `:144` (`start_time: n.step * (60/bpm/4)`) | `start_time` is compatibility-only — the backend schedules by `step` and runtime `p.bpm` (`skald-backend/core/types.odin:11`) |
| Generated code runtime | `skald-backend/core/codegen.odin:1240` (`p.bpm = <value>`), `:1950` (`samples_per_step_f := p.sample_rate * 60.0 / (p.bpm * 4.0)`), `:2038` (note duration `* (60.0 / p.bpm / 4.0)`) | Tempo is a runtime field on every generated processor; BPM-synced nodes resolve through `bpm_sync_seconds_expr` (`codegen.odin:28-51`) |
| Saved session | `useFileIO.ts:63-67` (`session: { bpm, patternSteps, masterVolume }`) | |
| Sequencer playhead animation | `skald-ui/src/components/Sequencer/StepGrid.tsx:58-60` (`duration = 60 / bpm / 4`) | Display only |
| Parameter panel | `skald-ui/src/components/ParameterPanel.tsx:99,110` | Received `bpm` but **never used it** (dead prop before this branch) |

### 1.4 How BPM sync is communicated on nodes

- LFO / Delay / S&H node cards show a "BPM Sync" toggle and, when on, a sync
  rate dropdown while hiding the free-run Hz/seconds control
  (`skald-ui/src/components/Nodes/LFONode.tsx`, `DelayNode.tsx`,
  `SampleHoldNode.tsx` via `ParamNode.tsx` `showIf`).
- The parameter panel shows the same toggle + a `BpmSyncControl` dropdown
  (`skald-ui/src/components/NodeParameterControls.tsx`,
  `ParameterPanel.tsx:243-272`).
- **Nothing anywhere showed the effective time** ("1/8 at 140 BPM = 0.214 s"),
  and nothing on a synced node shows *which* tempo it follows.

---

## 2. Inconsistencies found

1. **Sidebar BPM input could poison the whole pipeline with NaN**
   (`Sidebar.tsx:155`, pre-fix). Clearing the field yielded
   `parseInt('') = NaN` → playhead animation math NaN, preview rebuilds with
   `"bpm": null` in the JSON (JSON.stringify of NaN), which the backend parsed
   as `0` → generated `samples_per_step_f = sample_rate*60/(0*4)` — division
   by zero; sequences never advance, note durations become infinite. The
   toolbar field clamped, the sidebar field didn't: two different validation
   policies for the same value. **Fixed on this branch.**

2. **Two different sync-rate option lists over the same stored value.** Node
   cards offered 9 divisions (`['1/1','1/2','1/4','1/8','1/16','1/32','1/4t',
   '1/8t','1/16t']`, duplicated in three files) while the panel's
   `BpmSyncControl` offered 13 (down to 1/64t, plus 1/2t/1/32t). Picking
   "1/64" in the panel rendered the node card's select as *blank*, and
   touching the node select silently rewrote the rate to a coarser value.
   **Fixed on this branch** (single shared `SYNC_RATE_OPTIONS`).

3. **Backend accepted `bpm <= 0` from raw project JSON.**
   `build_project_from_raw` (`json.odin:241`) copied the value unchecked;
   only the legacy-graph path defaulted to 120. A project JSON missing `bpm`
   (or carrying `null`) generated `p.bpm = 0` — broken output, not a slower
   tempo. **Fixed on this branch** (`bpm <= 0 → 120`, matching the legacy
   path and `param_ranges`). No valid project changes: all 25 pre-existing
   golden snapshots are byte-identical after the change.

4. **No visible link between a synced node and the tempo it follows.** The
   user sets "1/8" but has to do mental math against a BPM field in a
   different corner of the screen. **Partially addressed on this branch**
   (effective-time annotation in the parameter panel).

5. **UI clamp range (20–300) vs backend range table (20–999)**
   (`SequencerToolbar.tsx` / `param_ranges.odin:105`). Harmless today — the
   UI is the only producer — but the two bounds should eventually be one
   constant in the JSON contract. Documented only.

6. **`start_time` in exported track events is dead weight.** It's serialized
   BPM-derived seconds (`projectSerializer.ts:144`) but the backend schedules
   purely by `step` at runtime tempo (`types.odin:11` says "might be unused").
   Removing it is a JSON-contract change — proposal only.

7. **Old saves without a `session` block keep whatever BPM the app currently
   has** (`useFileIO.ts:109-124`). Correct in that nothing is silently
   retimed to a *wrong new* value, but the user gets no signal that the file
   carried no tempo. Proposal only (see migration).

No divergence was found between preview, sequencer UI, saved session, and
export for a *valid* BPM: all four read the single `app.tsx` state, and
preview/export share one serializer (`projectSerializer.ts`). The failure
modes were all at the *edges* (invalid input, missing field, mismatched
option lists).

---

## 3. UX proposal

### 3.1 Single source of truth (already true — make it visible)

Keep tempo project-level, owned by `app.tsx` (later: a `ProjectSettings`
context). The problem is communication, not architecture:

- **Primary edit point: the sequencer toolbar** ("Master Transport" strip) —
  tempo is a transport concept. Keep the sidebar field as a mirror but label
  both identically ("Project BPM") and give both the same tooltip stating the
  value drives preview, sequencer and export (tooltips added on this branch).
  Longer term, consider removing the sidebar field entirely to end the
  "which BPM is real?" question — pure UX call, zero data risk.
- **One guarded write path**: every control goes through `clampBpm`
  (`skald-ui/src/definitions/bpm.ts`) — done on this branch.

### 3.2 How nodes indicate sync

- Parameter panel: annotate the sync-rate dropdown with the resolved time at
  the current tempo — "1/8 at 140 BPM = 0.214 s" (done on this branch, via
  `syncRateToSeconds`, a UI mirror of the backend's
  `bpm_sync_seconds_expr`).
- Node cards (recommended, not implemented): a small "♩ = project BPM" badge
  in the header of a node whose `bpmSync` is on, and the same resolved-time
  annotation under the rate select. Needs a BPM context provider so
  `ParamNode` can read the tempo; today node cards are deliberately
  tempo-blind. Low risk but touches the node rendering layer broadly — do it
  as its own change.

### 3.3 Migration — existing projects must not be silently retimed

- **Saves with a valid `session.bpm`**: untouched. The load path already
  restores it verbatim; nothing on this branch or in this proposal changes a
  stored tempo.
- **Saves with no session block (pre-session format)**: today they inherit
  the app's current BPM silently. Recommendation: on load, show the existing
  file-status banner with "This save has no tempo; keeping current
  N BPM" — an *informational* message, not a behavior change. If instead we
  ever default these to 120, that MUST be opt-in via the banner, because the
  user may have deliberately set the tempo before loading.
- **Project JSONs with `bpm <= 0` / missing**: these never played correctly
  at any tempo (divide-by-zero time base), so the backend default of 120 is
  a repair, not a retiming. Golden test `bpm_absent_defaults` pins it.
- **Do not** normalize or re-quantize `syncRate` strings on load. Unknown
  rates (hand-edited JSON, e.g. "1/128") still parse backend-side via the
  generic `1/N[t]` grammar; the UI dropdown now covers the full historical
  option set so no stored value renders blank.

### 3.4 Deferred / explicitly not implemented

| Item | Why deferred |
| --- | --- |
| Removing the sidebar BPM field | UX decision; needs a human sign-off on layout |
| Node-card tempo badge + resolved-time on cards | Needs a BPM context; broader render-layer touch |
| Dropping `start_time` from the export contract | JSON contract change; backend must confirm nothing external reads it |
| Unifying UI (300) and backend (999) max BPM | Contract change; pick one bound and ship both sides together |
| "No tempo in this save" load banner | Copy/UX decision; touches load flow messaging |
| Runtime tempo changes without rebuild (`skald_set_param` for bpm) | Engine feature, not a UX fix; p.bpm already exists on the processor for it |

---

## 4. Implemented now (this branch)

1. `skald-ui/src/definitions/bpm.ts` — new single source for `BPM_MIN/MAX/
   DEFAULT`, `clampBpm`, `SYNC_RATE_OPTIONS`, `syncRateToSeconds`,
   `formatSyncTime`.
2. `Sidebar.tsx` — BPM field is now a clamped `NumberInput` (NaN can no
   longer enter project state); tooltip states the value is shared.
3. `SequencerToolbar.tsx` — uses the same shared clamp/constants + tooltip.
4. `BpmSyncControl.tsx`, `DelayNode.tsx`, `LFONode.tsx`, `SampleHoldNode.tsx`
   — all sync-rate dropdowns render the one shared option list.
5. `NodeParameterControls.tsx` + `ParameterPanel.tsx` — synced rate controls
   show the effective time at the project tempo (makes the previously dead
   `bpm` prop live).
6. `skald-backend/core/json.odin` — `build_project_from_raw` defaults
   `bpm <= 0` to 120 (matches the legacy-graph path; golden-verified as a
   no-op for every valid fixture).
7. Tests: `skald-ui/src/tests/bpm/BpmConsistency.test.tsx` (clamp, sync math,
   shared option list, sidebar NaN/clamp behavior, panel annotation) and
   backend golden `bpm_absent_defaults` (fixture without a `bpm` field emits
   `p.bpm = 120`).
