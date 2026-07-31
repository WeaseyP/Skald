## Summary

- The sequencer has **two independent, unlinked pattern-length controls** — a global
  `patternSteps` (the actual loop boundary) and a per-track `steps`/`num_steps` (a polyrhythm
  modulus). The polyrhythm design itself is sound and documented, but the UI never stops a track
  from being *longer* than the global loop, and when it is, the extra steps are provably
  unreachable — a user can compose notes that mathematically can never sound, with zero warning.
- **Undo is two separate, unsynchronized history stacks** (graph nodes/edges vs. sequencer
  tracks/notes) that a single Ctrl+Z pops together. Any session that touches both the canvas and
  the sequencer — which is the normal way of working — makes one undo silently discard two
  unrelated edits at once, or leaves the two domains out of step.
- **P-locks are addressed by node label, not node id**, in three separate code paths (step
  editor, codegen, "Export Step"), while the exposed-parameter live-set path was already
  migrated to id-based addressing to fix exactly this class of bug. Same-label nodes (which the
  UI creates by default and never flags) silently share P-locks; renaming/deleting a P-locked
  node orphans the override invisibly in the UI and only surfaces as a hard codegen crash.
- The **Piano Roll cannot fully edit the note model it creates**: duration/velocity/
  probability/P-locks are only reachable through the flat Step Grid or its side panel, and both
  of those address only "the first note at a step" — so a chord (only creatable in the Piano
  Roll) cannot be individually edited, and right-click erase on a chorded step silently deletes
  one arbitrary chord tone at a time.
- Global transport controls (BPM, Pattern Steps, Master Volume) have **no undo at all** — they
  live in plain `useState`, outside both history stacks.
- Tier 1's `audio-oddities.md` finding #4 (P-lock ↔ exposed-param name collision) appears to be
  **already fixed** in this checkout via node-id addressing (`liveParamKey`/`canApplyParamLive` +
  backend `<node_id>::<param>` alias) — the investigation doc and its "CONFIRMED-OPEN" status are
  stale for the current tree.

## Findings

### F-B01-1: A track's step count can exceed the global pattern length, creating notes that can never play
- **kind**: code-bug
- **area**: sequencer pattern model / playback scheduling
- **severity**: high
- **confidence**: high
- **evidence**: `skald-ui/src/components/Sequencer/TrackList.tsx:97-108` (per-track "Len" field, 1–64, independent of the toolbar); `skald-ui/src/components/Sequencer/SequencerToolbar.tsx:108-118` (global "Steps" field, 1–64, tooltip "Global Pattern Length"); `skald-ui/src/components/Sequencer/StepGrid.tsx:256-257` (`isDisabled = step >= trackSteps` — never compared against the global `steps` prop, only the track's own length) and `:83` (`maxSteps = Math.max(steps, ...tracks.map(t => t.steps || 16))`, which *widens* the grid to show a long track's extra steps as editable); `skald-backend/core/codegen.odin:2096-2103` (`global_steps := project.pattern_steps`) and `:2125-2137` (`switch p.current_step % track_steps`) and `:2218-2227` (`p.current_step` wraps/halts at `global_steps`, so it never reaches a value ≥ `global_steps`).
- **detail**: `current_step` only ever ranges over `[0, global_steps)`. When a track's own `num_steps` is larger than the global pattern length (e.g. track Len=32 while the toolbar's Steps=16, both independently settable up to 64), the modulo `current_step % track_steps` is a no-op for every step ≥ `global_steps` — those `case` branches in the generated switch are unreachable. The Step Grid doesn't disable or even visually distinguish steps 16–31 for that track (it only disables past the track's *own* length), so a user can place, audition-by-eye, and save notes on steps that are mathematically guaranteed to never fire — with no test fixture, code path, or UI affordance that catches it.
- **suggested fix**: In the Step Grid, clamp the editable/visible range per track to `min(track.steps, patternSteps)` and gray out the remainder with a tooltip explaining why ("beyond the global pattern length — will never play"), or clamp `track.steps` itself to `<= patternSteps` in `updateTrackSteps`/`onUpdateSteps`. Either removes the silent dead zone.

### F-B01-2: Sequencer undo and graph undo are two independent stacks popped together by one Ctrl+Z
- **kind**: code-bug
- **area**: sequencer / undo-redo
- **severity**: high
- **confidence**: high
- **evidence**: `skald-ui/src/hooks/sequencer/useSequencerState.ts:8-39` (own `history`/`future` arrays, pushed by every track/note mutation); `skald-ui/src/hooks/nodeEditor/useGraphState.ts:39-40,59-71,197-217` (a completely separate `history`/`future` for nodes/edges); `skald-ui/src/app.tsx:209-218` (`if ... key === 'z' ... handleRedo(); sequencerStateHooks.handleRedo(); ... handleUndo(); sequencerStateHooks.handleUndo();` — both stacks popped unconditionally on the same keystroke).
- **detail**: These are not one undo timeline with two kinds of entries; they are two timelines of different depths, each advanced by unrelated user actions, that a single Ctrl+Z always pops in lockstep. Concretely: drag a node into position (pushes 1 graph entry), then toggle a sequencer step (pushes 1 sequencer entry), then press Ctrl+Z once expecting to undo the step — it undoes the step *and* snaps the node back, silently. Conversely, ten sequencer edits with no graph edits leave the graph's `handleUndo` a no-op every time (`history.length === 0`) while the sequencer keeps undoing one edit per press — the two controls drift apart the moment the session isn't perfectly alternating between canvas and sequencer work, which is the common case.
- **suggested fix**: Merge into one history stack that stores `{nodes, edges, tracks}` snapshots together (or a single "action log" with typed entries), so one Ctrl+Z always undoes exactly the most recent user action regardless of which panel it touched.

### F-B01-3: Deleting an Instrument node hard-deletes its whole sequencer track with no confirmation, recoverable only via the fragile dual-undo (F-B01-2)
- **kind**: inconsistency
- **area**: sequencer / track-to-node binding
- **severity**: high
- **confidence**: high
- **evidence**: `skald-ui/src/hooks/sequencer/useInstrumentRegistry.ts:27-36` (`if (!activeNodeIds.has(track.targetNodeId)) sequencerActions.removeTrack(...)` — reactive, unconditional); no `window.confirm` or equivalent exists anywhere in `skald-ui/src` (checked project-wide).
- **detail**: Deleting an Instrument node (a single Delete keypress or a multi-select delete) silently discards every note, P-lock, mute/solo state, and track-length setting on its sequencer track — there's no dialog, no grace period, and no distinct "are you sure" for something that is, unlike most node deletions, potentially minutes of composed pattern data. The only safety net is undo, but per F-B01-2 that safety net is a second, differently-paced history stack driven by the same keystroke as the graph's — so recovering the track reliably depends on no other sequencer or graph edit having happened since, which the user has no way to know.
- **suggested fix**: Either fold track deletion into the same atomic undo entry as the node deletion (fixing this is a corollary of fixing F-B01-2), or add a lightweight confirm specifically when the deleted node has non-empty `notes` (data-loss-shaped, unlike an empty oscillator node).

### F-B01-4: P-locks are addressed by node label, not node id; duplicate labels (which the UI creates by default) silently alias overrides across nodes
- **kind**: design
- **area**: sequencer P-locks / node addressing
- **severity**: medium
- **confidence**: high
- **evidence**: `skald-ui/src/hooks/nodeEditor/useNodeComposition.ts:59` (`label: definition.label` — every new node gets the *type's* generic display label, e.g. every Filter starts life labeled `"Filter"`, not a unique instance name); `skald-ui/src/definitions/node-definitions.ts:207` etc. (labels are per-type, not per-instance); `skald-ui/src/components/Sequencer/StepPropertiesEditor.tsx:105,113,163-169` (`const label = data.label || node.type;` then `paramKey = "${label}:${paramName}"`, and overrides are demuxed back to a node by `targetLabel === label`); `skald-ui/src/app.tsx:318-336` ("Export Step" does the same label-string match a third time); `skald-backend/core/codegen.odin:865-909` (`plock_node_label`, `resolve_plock_targets` — code comment explicitly: *"same-label nodes intentionally share overrides"*).
- **detail**: Add two Filters to an instrument's subgraph without renaming either — both have `label: "Filter"` by default, with no UI warning that this happened. Locking/overriding `Filter:cutoff` from the step editor then affects **both** nodes identically (per the codegen's own documented semantics, which mirrors the UI's demux) — a user trying to give two filters independent per-step automation gets one shared value with no indication anything is wrong; the two controls in the properties panel will show identical override state and move together. This is a real trap given the UI actively encourages non-unique labels by defaulting every instance to the type name.
- **manual impact**: `docs/manual-source/nodes/instrument.md` — the "Exposure" section (around the `exposedParameters`/P-lock cross-reference near line 138) would need a note on label uniqueness; no dedicated sequencer chapter currently exists to update.
- **migration**: None required for existing saves — this is additive (a UI-side rename-or-warn, or switching the P-lock key format to `<nodeId>:<param>` while keeping the `<label>:<param>` alias for backward compatibility). If the key format itself changes, every saved project's `patch_overrides` keys would need a one-time rewrite at load (map old label-keys to the resolved node id using the same `resolve_plock_targets` logic, then re-key) — feasible since the resolution algorithm already exists in the backend and is deterministic.
- **suggested fix**: Short term, warn in the UI when two nodes in the same subgraph share a label (the same validation the addressing scheme already implicitly requires). Longer term, switch the P-lock key format to node-id-based (mirroring `liveParamKey`), which is a strictly more correct addressing scheme already proven out for exposed params.

### F-B01-5: Renaming or deleting a P-locked node orphans the override invisibly; the only symptom is a hard codegen failure
- **kind**: code-bug
- **area**: sequencer P-locks / node lifecycle
- **severity**: high
- **confidence**: high
- **evidence**: `skald-backend/core/codegen.odin:911-954` (`collect_plock_targets` — on any P-lock key that resolves to zero nodes, prints an error and calls `os.exit(1)`, aborting the whole codegen run; comment: *"The node was probably renamed or deleted after the override was created"*); `skald-ui/src/components/Sequencer/StepPropertiesEditor.tsx:161-181` (`renderNodeOverrides` only iterates *current* subgraph nodes and only surfaces override keys whose label matches a *current* node — a stale key is filtered out of the demux and never rendered anywhere); `skald-ui/src/hooks/nodeEditor/useWasmAudioEngine.ts:279-314` (the same codegen path builds the live preview, so this isn't export-only — it breaks the running preview too, surfaced generically via `cleanIpcError`/`previewStale`).
- **detail**: Rename a Filter from "F2" to "Filter2" (or delete it) after P-locking one of its params, and the note's `patchOverrides["F2:cutoff"]` becomes permanently unresolvable. It doesn't show up anywhere in the Step Properties Editor (that UI only ever displays overrides matching a *current* node), so there is nothing to click to fix it. The first symptom is every subsequent preview rebuild failing with a generic "Preview rebuild failed" banner (or, via the Generate/export flow, the codegen process exiting non-zero) — the user has to reason backward from a compiler-shaped error message to "which step, which track, which old label" with no UI pointing at the answer, even though the backend error message itself lists exactly that information (instrument name, key, valid labels) to stderr, which the UI does capture but doesn't parse or link back to a step.
- **suggested fix**: Client-side, validate every note's `patchOverrides` keys against current subgraph labels whenever the graph changes, and surface unresolvable ones directly in the Step Properties Editor (e.g., a red "F2:cutoff — no matching node, click to remove" row) instead of only finding out at build time.

### F-B01-6: P-lock edits never take the instant/live param path — every value tweak forces a full rebuild that cuts all sounding voices
- **kind**: design
- **area**: sequencer P-locks / preview engine
- **severity**: medium
- **confidence**: high
- **evidence**: `skald-ui/src/hooks/nodeEditor/useWasmAudioEngine.ts:232-266` (`sendChangedExposedParams` walks only `sn.data?.exposedParameters` on subgraph nodes — nothing here reads `sequencerTracks`/`patchOverrides`); `:322-333` (`topologySignature(projectData)` is computed from the *whole* `buildProjectData` output, which embeds every note's `patch_overrides` verbatim — unlike node `parameters`, sequencer events are never masked, so any P-lock value edit changes the signature and calls `scheduleRebuild()`); this rebuild is the same audio-cutting hot-swap documented as by-design in `docs/investigations/audio-oddities.md` finding #11 (extends that finding).
- **detail**: Dragging the main cutoff knob on an exposed filter is instant and silent (no audio interruption). Editing that exact same parameter as a per-step P-lock value in the Step Properties Editor — a core sequencer workflow ("brighten the filter on step 12") — instead debounces a full Odin rebuild and hot-swaps the wasm module, which per finding #11 kills every currently-sounding voice. Dialing in a P-lock sweep by ear means an audible glitch on every adjustment, which actively discourages the interactive tweak-while-listening workflow P-locks are meant to support.
- **manual impact**: No existing chapter documents P-lock live-editing behavior (there's no sequencer chapter yet); a future one's "Try it" / timing sections would need to describe whichever behavior ships.
- **migration**: None for saved projects — this is a preview-engine change only (extending the live-set path to also address sequencer-track P-lock values keyed by `<nodeId>::<param>` against the *currently playing step's* override, or simply always applying the *current* step's resolved value live when scrubbing). No JSON schema change required.
- **suggested fix**: Extend `sendChangedExposedParams` (or a sibling) to detect P-lock value-only edits (same set of steps/tracks/notes, only `patchOverrides` values changed) and push them through `skald_set_param` against the currently active step instead of going through `topologySignature`.

### F-B01-7: Piano Roll's visible/editable note range (21–84) is narrower than the valid data range (0–127) and undersells itself as "88-key"
- **kind**: qol
- **area**: sequencer / Piano Roll
- **severity**: medium
- **confidence**: high
- **evidence**: `skald-ui/src/components/Sequencer/PianoRoll.tsx:20-21` (`MIN_NOTE = 21; // A0 (lowest key on an 88-key piano)` / `MAX_NOTE = 84; // C6`); `skald-ui/src/components/Sequencer/StepPropertiesEditor.tsx:190-194` (the numeric "Note (MIDI)" field allows the full `0..127`); `skald-backend/core/types.odin:9` (`Note_Event.note: u8`, i.e. the model supports the full MIDI range).
- **detail**: An 88-key piano is A0(21)–C8(108), but the grid's row list (`for i := MAX_NOTE; i >= MIN_NOTE; i--`) stops at C6(84) — 24 semitones short of the comment's own claim, and with no scroll/zoom to reach higher notes. Any note at MIDI 85–127 (a very ordinary range for leads, plucks, and FX) or 0–20 can be *entered* via the numeric Step Properties field but is then permanently invisible and unreachable in the Piano Roll grid — there is no row for it and no way to scroll to one.
- **suggested fix**: Either extend `MAX_NOTE` to 108 (matching the stated 88-key range) or make the range dynamic/scrollable so any note the data model can hold has a reachable row.

### F-B01-8: Chords can only be created in the Piano Roll but can't be edited there, and the Step Grid/Properties Editor only ever address "the first note at a step"
- **kind**: inconsistency
- **area**: sequencer note editing
- **severity**: high
- **confidence**: high
- **evidence**: `skald-ui/src/components/Sequencer/PianoRoll.tsx:312` (note block has `pointerEvents: 'none'` with the comment *"Let click pass to grid for now (unless adding drag resize later)"* — no drag-resize, and the Piano Roll never calls an equivalent of `onStepSelect`, so nothing opens the Step Properties Editor from within it); `skald-ui/src/components/Sequencer/StepGrid.tsx` (its `onToggleStep`/`onMouseDown` calls never pass a note pitch — see the `SequencerDockProps.onToggleStep: (trackId, step) => void` signature with no `note` param); `skald-ui/src/components/Sequencer/StepPropertiesEditor.tsx:69` (`const note = track.notes.find(n => n.step === step);` — always the first match, no pitch parameter); `skald-ui/src/hooks/sequencer/useSequencerState.ts:75-109` (`toggleStep` with `note === undefined` matches/deletes the first note found at that step, regardless of pitch — contrast with `updateNote`'s explicit `notePitch` parameter added specifically to fix "Snap to Scale destroys chords", per the comment at `:111-114`, which only the Piano Roll's Snap-to-Scale button actually supplies).
- **detail**: The data model and `updateNote` already support addressing one note out of a chord by pitch (built for Snap-to-Scale). But every *other* editing surface ignores it: the flat Step Grid can only place single notes (clicking an occupied step deletes it rather than adding a second pitch) and its velocity/duration/probability drag-gestures and right-click erase all operate on "whatever `.find()` returns first" for a chorded step — so erasing a 3-note chord one right-click at a time silently removes one arbitrary tone per click with no indication of which, or how many remain. Since the Piano Roll is the only place a chord can be built, but has no way to select a note to open the Properties panel and no drag-resize, a chord's duration/velocity/probability/P-locks are effectively **impossible to set per-tone** through the UI at all.
- **suggested fix**: Wire click-to-select in the Piano Roll (passing `note` pitch) to open the Step Properties Editor scoped to that specific note, and make the Step Grid's erase/drag operations pitch-aware (or explicitly restrict the Step Grid to monophonic tracks and document that chords require the Piano Roll end-to-end).

### F-B01-9: BPM, Pattern Steps, and Master Volume have no undo at all
- **kind**: qol
- **area**: sequencer / global transport
- **severity**: medium
- **confidence**: high
- **evidence**: `skald-ui/src/app.tsx:76,78,82` (`useState(120)` / `useState(16)` / `useState(0.8)` for `bpm`/`patternSteps`/`masterVolume` — plain component state, never pushed to either `useGraphState`'s or `useSequencerState`'s history arrays).
- **detail**: Every note, P-lock, mute/solo, and node edit is undoable via one of the two history stacks (see F-B01-2 for how they interact), but the three transport-level controls in the sequencer toolbar are not tracked by either — a mis-typed BPM, an accidental pattern-length change (which per F-B01-1 can also strand notes), or a master-volume slider bump cannot be undone with Ctrl+Z; the user has to remember and re-enter the old value manually.
- **suggested fix**: Fold these three fields into whichever history mechanism results from fixing F-B01-2, or give them their own minimal undo (even just "last value" single-step revert) if a full history entry per keystroke is undesirable.

### F-B01-10: Tier 1's P-lock/exposed-param collision finding (audio-oddities.md #4) appears already fixed — investigation doc is stale for this tree
- **kind**: doc-bug
- **area**: sequencer P-locks / live param addressing
- **severity**: low
- **confidence**: high
- **evidence**: `docs/investigations/audio-oddities.md:114-146` describes `getUniqueExposedParams`/bare-name addressing as CONFIRMED-OPEN, and cites `docs/investigations/fixtures/plock_collision.json` as a live repro. In this checkout, `getUniqueExposedParams` no longer exists anywhere in `skald-ui/src` (searched project-wide). Instead: `skald-ui/src/utils/projectSerializer.ts:216-248` defines `liveParamKey(nodeId, param) = "${nodeId}::${param}"`, `canApplyParamLive`, and a `topologySignature` that masks by this same id-keyed scheme; `skald-ui/src/hooks/nodeEditor/useWasmAudioEngine.ts:232-266` (`sendChangedExposedParams`) addresses every live param by `liveParamKey(sn.id, name)`, never by bare name; `skald-backend/core/codegen.odin:1002-1024` (`node_key_emittable`, `emit_param_case`) emits the `"<node_id>::<param>"` alias case the frontend now always uses.
- **detail**: The collision described in the investigation (UI addressing by bare name while the backend disambiguates by label-prefixing) can't reproduce against the current live-set path, because the UI no longer ever sends a bare name for the instant path — it always sends the node-id-qualified key, which the backend always accepts regardless of collisions. The `plock_collision.json` fixture is still useful for confirming the *codegen's* label-prefixing behavior in isolation, but the end-to-end bug the investigation reports (an exposed knob doing nothing while playing) reads as resolved.
- **suggested fix**: Re-run the `plock_collision.json` repro end-to-end through the live UI (not just the codegen binary in isolation) to confirm, then update `audio-oddities.md` finding #4's status from CONFIRMED-OPEN to CONFIRMED-FIXED, or explain what still reproduces if something does.

### F-B01-11: P-locks can only target numeric params — switches/enums (waveform, filter type, etc.) are silently unavailable for per-step automation
- **kind**: missing-feature
- **area**: sequencer P-locks / pattern model limits
- **severity**: low
- **confidence**: high
- **evidence**: `skald-ui/src/utils/projectSerializer.ts:174-182` (`patch_overrides: Object.fromEntries(Object.entries(n.patchOverrides ?? {}).filter(([, v]) => typeof v === 'number' && Number.isFinite(v)))` — non-numeric overrides are dropped at serialization, with the comment explaining a string override would fail the whole backend JSON unmarshal); `skald-backend/core/types.odin:19` (`patch_overrides: map[string]f32`).
- **detail**: This is a deliberate, sensible constraint given the `set_param` API is f32-only, but nothing in the Step Properties Editor tells the user their attempt to P-lock, say, a Filter's `type` (Lowpass/Highpass) silently vanished on save/export rather than erroring — `StepPropertiesEditor.tsx`'s `renderNodeOverrides` renders whatever `NodeParameterControls` gives it, including non-numeric controls, so the UI will happily let a user "lock" an enum control that the serializer then drops without any warning.
- **suggested fix**: Either filter enum/string controls out of the P-lock-able set in `renderNodeOverrides` (matching what the serializer actually keeps), or surface a warning when a non-numeric override exists in a note (defensive, in case one is ever created via import/hand-edited JSON).
