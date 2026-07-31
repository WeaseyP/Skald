# B06 — Serialization, save/load/import, schema migration, example corpus

## Summary

- **There is no schema/version concept anywhere in the save format.** `useFileIO.ts`'s
  `handleSave` writes `{...flow, sequencerTracks, session}` with no version tag, and every
  compatibility decision on load (`parentNode`→`parentId`, absent `session`) is done by
  structural sniffing (`typeof x === 'string'`, `x !== undefined`), not by branching on a
  version number. This is the single biggest risk for 0.2, whose own design findings (Tier 1's
  boolean→continuous-parameter proposals) all assume an "upgrade on load" story that has nowhere
  to attach today (F-B06-1, F-B06-12).
- **Load is destructive with no guard rail and no undo.** `handleLoad` replaces the entire node/edge
  state and explicitly clears undo/redo history (`setHistory([]); setFuture([])`) with zero
  confirmation dialog and no "unsaved changes" indicator anywhere in the app. A stray click loses
  the whole current graph, permanently (F-B06-2).
- **The shipped example corpus outgrew its own audit.** `examples/AUDIT.md` (dated 2026-07-24,
  62 files) is now stale against a 94-file tree — 32 files (~34%), including an entire new
  `snes-kit/` folder and 6 new instrument families, were never run through codegen by that audit.
  I re-ran codegen + `odin check` against all 94 files myself: everything passes except the
  already-known-broken `archive/PulsarBeam.json`. The audit's own claim that a
  `songs/loops/to implement/…boss battle…json` junk file "does not exist in this worktree" is now
  false — it's back, and it happens to codegen cleanly (F-B06-4).
- **The 2026-07-24 "cleanup" that moved bad files to `examples/archive/` didn't actually remove them
  from the shipped product.** `forge.config.ts`'s `extraResource: ['./skald_codegen.exe',
  '../examples']` copies the whole `examples/` tree — archive included — into every packaged build,
  and Load's dialog opens right at `examples/`, one folder-up from `archive/`. The one file in that
  folder that hard-fails codegen (`PulsarBeam.json`) still ships and is still reachable (F-B06-5).
- Confirmed Tier 1's F-A03-5 independently at the file level: `wobble-samplehold-bass.skald.json`'s
  `wob-lfo.frequency: 2` is 14.3% off its true `1/4 @ 140 BPM` value (2.333). From the
  serialization side, the reason this can never self-heal is structural, not accidental: **Save is
  a pure passthrough** (`reactFlowInstance.toObject()` verbatim) — nothing recomputes a BPM-synced
  node's stale free-run value before it's re-written to disk, so every subsequent Save just
  re-embeds the same wrong number forever (F-B06-8, extends F-A03-5/F-A03-7).
- Two more silent persistence gaps found by direct comparison: `songs/full/four-bar-song.skald.json`
  has no `session` block (so it loads at whatever tempo the app happened to be at) while its sibling
  `possible-background-music.skald.json` does (F-B06-6); and the codegen/export **package name**
  (`packageName` state in `app.tsx`) round-trips nowhere — every reload resets it to
  `"generated_audio"`, silently discarding a deliberate rename (F-B06-11).

## Findings

### F-B06-1: No schema version field exists anywhere in the save format
- **kind**: risk
- **area**: serialization / save format
- **severity**: high
- **confidence**: high
- **evidence**: `skald-ui/src/hooks/nodeEditor/useFileIO.ts:70-89` (`handleSave` builds
  `{...flow, sequencerTracks, session: sessionSettings}` — no `version`/`schemaVersion` key
  anywhere); `parseSaveFile` (`useFileIO.ts:28-54`) makes every forward/backward-compat decision by
  structural sniffing (`n.parentId === undefined && typeof n.parentNode === 'string'`,
  `flow.session` truthiness) rather than a version check. A repo-wide search for
  `schemaVersion|schema_version|fileVersion` under `skald-ui/src` returns zero matches.
- **detail**: Every compatibility fix that exists today (the `parentNode`→`parentId` rehydration,
  the "older saves have no session block" branch) was hand-written against one specific known-old
  shape. There is no general mechanism — nothing a future migration could hook into to say "this
  file predates keytrack-amount, apply upgrade X." Every future schema change will have to invent
  both the version concept and its own bespoke sniffing logic from scratch, the same way the two
  existing ones were.
- **suggested fix**: add a small integer `version` field to `saveData` in `handleSave`, default
  absent-version files to `0` on load, and centralize the compatibility branches in `parseSaveFile`
  into an ordered list of `(fromVersion) => flow` upgraders that run in sequence up to the current
  version. See F-B06-12 for what this specifically needs to look like for the 0.2 changes already
  proposed by Tier 1.

### F-B06-2: Load replaces the whole canvas and wipes undo history with no confirmation and no "unsaved changes" indicator
- **kind**: code-bug
- **area**: save/load UX
- **severity**: high
- **confidence**: high
- **evidence**: `useFileIO.ts:113-136` — `handleLoad` calls `setNodes(flow.nodes)`,
  `setEdges(flow.edges || [])`, and unconditionally `setHistory([]); setFuture([])` the instant a
  valid file is parsed, with no prompt beforehand. `app.tsx:375` wires `onLoad={handleLoad}`
  directly to the menu action with nothing in between. Grepped `app.tsx` for
  `unsaved|confirm|dirty|beforeunload|document.title` — zero matches; there is no dirty-state
  tracking anywhere in the app.
- **detail**: A user who has been building a patch for an hour and clicks Load — even to just peek
  at a reference example, or by mis-click — loses the entire current graph permanently: not only is
  it overwritten, the undo stack that could have recovered it is deliberately cleared in the same
  action. There is no title-bar asterisk, no "you have unsaved changes" toast, nothing. This is the
  most consequential data-loss path in the whole save/load system and it has no safety net at all.
- **suggested fix**: track a `dirty` flag (set on any node/edge/session mutation, cleared on
  successful Save) and gate `handleLoad` behind a native confirm dialog ("Discard unsaved changes
  and load?") whenever dirty is true; skip the dialog when the canvas is already empty/unmodified.

### F-B06-3: Save is a direct, non-atomic write — a failed overwrite can destroy the previous good save
- **kind**: risk
- **area**: save/load durability
- **severity**: medium
- **confidence**: high
- **evidence**: `skald-ui/src/main.ts:323-329` — `fs.writeFileSync(filePath, graphJson, {encoding:
  'utf8'})` writes directly to the user-chosen path (which is very often the same file they just
  loaded — "resave my song" is the common case, not "always Save As a new timestamped name").
  There is no write-to-temp-then-rename, no backup-before-overwrite.
- **detail**: If the process is killed, the disk fills, or the write throws partway through (all
  are already-anticipated failure modes per the surrounding comment about "a full disk / locked
  file / permission error"), a truncated/corrupt file is left in place of what was, a moment ago, a
  perfectly good save — with nothing to recover from since the write target and the previous good
  content are the same path. The error *is* surfaced to the user (per the existing hardening
  comment), but "you got an error" doesn't un-destroy the file that used to be there.
- **suggested fix**: write to `${filePath}.tmp`, then `fs.renameSync` over the target only after a
  successful write; rename is atomic on the same volume, so the previous file is never in a
  partially-written state.

### F-B06-4: `examples/AUDIT.md` is stale by ~34% of the current corpus, and its own "this file doesn't exist" claim is now false
- **kind**: doc-bug
- **area**: example corpus / examples/AUDIT.md
- **severity**: high
- **confidence**: high
- **evidence**: `examples/AUDIT.md:1-8` states the audit covers "62 files" as of 2026-07-24. The
  current tree (`examples/**/*.json`, checked directly) has **94** files. Files entirely absent
  from the audit's table include the whole `snes-kit/` kit (9 files: `drums/{hat,kick,snare,tom}`,
  `instruments/{brass-stabs,crunch-guitar,echo-bell,pulse-lead,slap-bass}`), the whole
  `instruments/guitar/` family (6 files), and nine new `instruments/bass/*` files including
  `wobble-samplehold-bass.skald.json` and `fm-growl-bass.skald.json` — the exact two files Tier 1's
  F-A03-5 and F-A10-6 found stored-value bugs in. Separately, `AUDIT.md`'s "Discrepancies from the
  bug ticket's framing" section states outright: "The task brief mentioned … a `songs/loops/to
  implement/` directory containing a file named with a long sentence. **None of these exist in this
  worktree.**" That file (`songs/loops/to implement/this wont be the final boss battle but I do
  want to put this into geowars for the boss and then play geowars with just the boss..json`) is
  present in the current tree — I ran it through `codegen.exe` and it succeeds cleanly (3
  instruments, 44 KB output), so it isn't even a discarded stub; it's a real, working, unshipped
  song sitting in an "unfinished work" folder inside the import-facing `songs/` tree.
- **detail**: I independently re-ran `skald-backend/codegen.exe -in:<file> -out:<x>.odin
  -package:generated_audio` against every one of the current 94 files, then `odin check` on every
  successfully-generated `.odin` file in isolation (same method `AUDIT.md` itself used). Result:
  **93/94 succeed at both stages**; the sole failure is the already-documented
  `archive/PulsarBeam.json` (unknown port `input_delayTime` on Delay — a known, pre-existing bug,
  not a regression). So the corpus is in fact healthy — but `AUDIT.md` is the only artifact anyone
  would consult to know that, and it currently asserts things about the tree that are no longer
  true. A reader trusting it would believe the corpus is smaller and cleaner than it is, and would
  not know the new `snes-kit`/`guitar` families were never independently verified by this process
  (they happen to be fine, per my run, but that's luck plus my re-check, not the audit).
- **suggested fix**: re-run the `AUDIT.md` methodology against the current 94-file tree (the
  codegen/`odin check` harness clearly still works — I used it above) and either delete the
  `songs/loops/to implement/` file or move it out of the import-facing `songs/` tree; its own
  filename says it isn't meant to ship.

### F-B06-5: The "archived" broken/duplicate examples still ship in every packaged build and are still reachable via Load
- **kind**: code-bug
- **area**: example corpus / packaging
- **severity**: high
- **confidence**: high
- **evidence**: `examples/archive/README.md` says the three files there (`Sax2.json`,
  `AlarmPulse.json`, `PulsarBeam.json`) were "moved out of the import-facing library." But
  `skald-ui/forge.config.ts:20` — `extraResource: ['./skald_codegen.exe', '../examples']` — copies
  the entire `examples/` directory, `archive/` included, into `resources/examples` on every
  packaged build (confirmed against the comment directly above it: "The example patches ship
  alongside it… because the Load / Save / Import dialogs open on that folder"). `skald-ui/src/main/
  dialogDefaults.ts`'s `openDialogDefaultPath`/`saveDialogDefaultPath` point the Load/Save dialogs at
  `resources/examples` (or the dev-tree `examples/`) directly — `archive/` is one folder-navigation
  away, not deleted, not excluded, not hidden. `archive/PulsarBeam.json` fails codegen with exit 1
  (confirmed by direct run: `Error: instrument "Asset": connection into Delay(3) uses unknown input
  port "input_delayTime"`).
- **detail**: The example-audit process recorded these three files as remediated ("DELETE-CANDIDATE
  … since moved to `examples/archive/`"), which reads as resolved, but the actual shipped artifact
  is unchanged: a user who opens Load, glances one folder up or types a path, and picks
  `PulsarBeam.json` gets a file that cannot be code-generated at all — the exact "shipped example
  that does not work" class of bug this audit was asked to treat as high severity. The duplicates
  (`Sax2.json`, `AlarmPulse.json`) are lower-stakes (they do codegen, just redundantly) but are still
  shipped despite being "removed."
- **suggested fix**: either exclude `archive/` from the `extraResource` copy (a second, narrower
  `extraResource` entry, or a build-time filter step) or actually delete the three files from the
  repo per the README's own "safe to remove permanently whenever" — right now the fix that was
  recorded as done was never actually applied to what ships.

### F-B06-6: `songs/full/four-bar-song.skald.json` has no `session` block; its sibling song does
- **kind**: inconsistency
- **area**: example corpus / session persistence
- **severity**: medium
- **confidence**: high
- **evidence**: Direct inspection: `examples/songs/full/four-bar-song.skald.json` top-level keys are
  `['nodes', 'sequencerTracks']` only — no `session`, no `bpm` anywhere in the file (grepped the
  serialized JSON for `bpm`: zero occurrences) despite having 6 sequencer tracks. Its sibling in the
  same folder, `examples/songs/full/possible-background-music.skald.json`, has
  `session: {bpm: 120, patternSteps: 8, masterVolume: 0.8}`. Per `useFileIO.ts:118-133`, when
  `flow.session` is absent, the loader deliberately "leave[s] the current settings alone rather than
  inventing defaults" — a reasonable policy for a one-shot SFX/instrument patch, but here it means a
  full multi-instrument *song*, whose whole identity is bar/tempo-relative, loads at whatever tempo
  the app happened to be left at.
- **detail**: AUDIT.md itself describes this file as "5-instrument song project" (its own table,
  line 96) — the kind of file for which tempo is not incidental. Since one song in the same folder
  has a session block and the other doesn't, this reads as an authoring oversight rather than a
  deliberate "this file has no opinion about tempo" choice, and a user who loads it right after
  working on something else gets a "four bar song" that doesn't sound like four bars at their
  current session tempo.
- **suggested fix**: add the missing `session` block to `four-bar-song.skald.json` (its authored
  tempo/pattern length can likely be recovered from the sequencer tracks' step count and the
  intended playback feel); more generally, treat "song"-tier examples (multiple instruments +
  sequencer tracks) as required to carry a `session` block and check for that in whatever audit
  pass addresses F-B06-4.

### F-B06-7: `parentNode`→`parentId` rehydration only walks top-level nodes, never into Instrument subgraphs — untested, unexercised by any shipped example
- **kind**: risk
- **area**: serialization / schema compatibility
- **severity**: low
- **confidence**: medium
- **evidence**: `useFileIO.ts:44-52` — the rehydration loop is `for (const n of flow.nodes) { if
  (…typeof n.parentNode === 'string') { n.parentId = n.parentNode; … } }`, iterating only the
  top-level `flow.nodes` array. An Instrument node's internal graph lives at
  `node.data.subgraph.nodes` (confirmed shape via `ProjectSerializer.test.ts:17-27` and
  `json.odin`'s `extract_graph_raw_from_object`) and is never visited by this loop. Grepping the
  entire 94-file example corpus for `parentNode`/`parentId` (both) returns **zero** occurrences in
  any file, top-level or nested. Grepping `skald-ui/src/tests` for `parentNode` also returns zero
  matches — `FileIO.test.tsx` tests `handleSave`/`handleLoad` outcomes but never exercises this
  branch at all.
- **detail**: If a pre-v12 (React Flow v11) save ever had a group nested *inside* an instrument's
  internal graph — plausible, since grouping is a generic canvas feature and instrument subgraphs
  are edited on the same kind of canvas — loading it today would silently drop that nested grouping
  (child nodes keep the dead `parentNode` key, which v12 ignores, and flatten out of the group)
  while a top-level group in the same file would be correctly preserved. Low severity only because
  nothing in the shipped corpus currently exercises the path either way, so it's unverified rather
  than demonstrated broken.
- **suggested fix**: make the rehydration recursive (walk into every `node.data.subgraph.nodes`
  array, same shape, same fix) and add at least one unit test for `parseSaveFile` covering both a
  top-level and a subgraph-nested `parentNode` key.

### F-B06-8: Save never recomputes a BPM-synced node's stale free-run value — the drift Tier 1 found can never self-heal
- **kind**: risk
- **area**: serialization / LFO+SampleHold BPM sync
- **severity**: medium
- **confidence**: high
- **evidence**: Independently reconfirmed Tier 1's F-A03-5: `examples/instruments/bass/
  wobble-samplehold-bass.skald.json`'s `wob-lfo` node stores `frequency: 2`, `syncRate: "1/4"` at
  session `bpm: 140`; the true resolved value is `(60/140)×1 = 0.4286s → 2.3333 Hz` — the stored
  number is 14.3% low. `useFileIO.ts:69-77`'s `handleSave` is `const flow =
  reactFlowInstance.toObject(); const saveData = {...flow, sequencerTracks, session:
  sessionSettings}; JSON.stringify(saveData, null, 2)` — a pure passthrough of whatever is
  currently in React Flow's node state, with no normalization step of any kind.
- **detail**: This is the serialization-layer half of Tier 1's F-A03-7 design finding (which proposes
  keeping `frequency` "live-equal to the sync-derived value while synced"): even without that
  redesign, the save pipeline today has no opportunity to catch or correct drift at the one point it
  naturally could — the moment the file is written. Every time this project is opened and re-saved
  (even with zero changes to the LFO), the exact same wrong `2` gets faithfully re-embedded, because
  nothing in `handleSave` ever asks "is this BPM-synced node's stored free-run value still consistent
  with its `syncRate` and the current session `bpm`?" The bug is therefore permanent by construction,
  not just an authoring slip that happened once.
- **suggested fix**: short of the full F-A03-7 redesign, add a normalization pass in `handleSave` (or
  in a `toObject()`-adjacent helper) that recomputes and overwrites `frequency`/`rate` for any node
  with `bpmSync: true` immediately before serializing, using the same `bpm_sync_seconds_expr` math
  the backend already uses — so a file can never be saved with a value that disagrees with its own
  sync division.

### F-B06-9: `handleImportGraph`'s integration layer has zero test coverage, despite the logic it delegates to being well tested
- **kind**: risk
- **area**: import / test coverage
- **severity**: low
- **confidence**: high
- **evidence**: `useFileIO.ts:142-201` (`handleImportGraph`) wires the `import-patches` IPC call,
  per-file `parseSaveFile` parsing with skip-tracking, viewport-centre math, and
  `notifyFileStatus` messaging around a call to `layOutImportBatch`
  (`skald-ui/src/utils/importLayout.ts:66-142`). The pure function itself is well covered —
  `skald-ui/src/tests/utils/importLayout.test.ts` has 13 tests covering id uniqueness, layout,
  edge-endpoint rewriting/dropping, track re-pointing, orphaned-track preservation, and `parentId`
  following within a batch. But `skald-ui/src/tests/hooks/FileIO.test.tsx` only tests `handleSave`/
  `handleLoad` — there is no test anywhere for `handleImportGraph`, and the test file's mocked
  `window.electron` object (`FileIO.test.tsx:53`, `{ saveGraph, loadGraph }`) doesn't even define
  `importPatches`, so any test added today would first need that mock extended.
  (Note for whoever picks this up: `useFileIO.ts`, `main.ts`, `preload.ts` and `forge.config.ts` were
  all mid-edit in the working tree while this audit ran — `git diff --stat` showed all four
  modified, uncommitted, moving the import path from a single-file to a multi-file batch design
  with per-file error reporting. This finding is against the code as it stood at the time of
  writing; re-check `handleImportGraph` is unchanged before acting on this.)
- **detail**: The parts most likely to have an off-by-one or a wrong precedence (does a skipped file
  in the middle of a 5-file batch still let the other 4 through? does the viewport math match what
  `layOutImportBatch`'s `center` parameter expects? does `notifyFileStatus`'s `kind` correctly flip
  to `'error'` only when `skipped.length > 0` even on a fully-successful batch import) are exactly
  the parts with no test proving them.
- **suggested fix**: add `importPatches` to the `window.electron` mock in `FileIO.test.tsx` and add
  a handful of `handleImportGraph` tests mirroring the existing save/load ones: all-succeed,
  partial-skip, all-skip/nothing-importable, and canceled-dialog.

### F-B06-10: Saved `viewport` is written but never restored (or re-fit) on Load — dead round-trip data
- **kind**: qol
- **area**: save/load fidelity
- **severity**: medium
- **confidence**: high
- **evidence**: `handleSave` persists whatever `reactFlowInstance.toObject()` returns, which
  includes `viewport: {x, y, zoom}` (confirmed shape in `FileIO.test.tsx:24`'s mock). `handleLoad`
  (`useFileIO.ts:113-136`) reads `flow.nodes`, `flow.edges`, `flow.sequencerTracks`, `flow.session` —
  never `flow.viewport`. `app.tsx:394-412`'s `<ReactFlow … fitView …>` has `fitView` as a static
  boolean prop, which React Flow only applies once, on that component's initial mount — not on every
  subsequent `setNodes` call. Grepped the whole `skald-ui/src` for `setViewport`/`flow.viewport` —
  no other call site re-centers the view after a load.
- **detail**: A file faithfully records where its author was looking when they saved it, and that
  information is thrown away on load. Worse, since the running app's ReactFlow instance is already
  mounted by the time Load runs, nothing re-fits the view to the newly-loaded nodes either — if the
  loaded graph's node positions are far from wherever the canvas currently happens to be panned/
  zoomed, the user can land on an apparently empty canvas immediately after a successful load. It is
  recoverable (the `<Controls />` component's built-in "fit view" button is one click away), which is
  why this is medium rather than high, but it's still a confusing first impression on every load of
  a file whose author worked far from the origin.
- **suggested fix**: either restore `flow.viewport` via `reactFlowInstance.setViewport(...)` in
  `handleLoad` when present, or call `reactFlowInstance.fitView()` unconditionally right after
  `setNodes`/`setEdges` — either fixes the blank-canvas-after-load case; restoring the saved
  viewport is more faithful to "what the author saved."

### F-B06-11: The codegen/export package name (`packageName`) is UI state that never round-trips through save/load
- **kind**: missing-feature
- **area**: serialization / project identity
- **severity**: low
- **confidence**: high
- **evidence**: `app.tsx:86` — `const [packageName, setPackageName] = useState("generated_audio")` —
  plain component state, passed to `Sidebar` (`app.tsx:386-387`) and into `handleGenerate`
  (`app.tsx:370`), but never read into or written from `sessionSettings`
  (`app.tsx:149-151`: `useMemo(() => ({bpm, patternSteps, masterVolume}), …)`) and therefore never
  appears in `saveData` in `useFileIO.ts:72-76`.
- **detail**: `bpm`/`patternSteps`/`masterVolume` were fixed in a prior pass specifically because
  losing them on save/load was a real reported bug (per the file header comment on
  `SessionSettings`: "a 140 BPM / 32-step song reloaded as 120 BPM / 16 steps"). `packageName` is the
  same category of "project identity" setting — it's the name every generated Odin proc for this
  project is prefixed with — but it was never added to that fix. Every reload of a saved project
  silently resets the export package name back to the generic default, discarding any deliberate
  rename (e.g. a user who set it to `boss_battle_audio` gets `generated_audio` back after their next
  Load).
- **suggested fix**: add `packageName` to `SessionSettings` (or a small sibling `ProjectSettings`
  block) alongside `bpm`/`patternSteps`/`masterVolume`, following the exact same save/restore pattern
  already in place for those three fields.

### F-B06-12: [design] What 0.2's schema-breaking changes actually need: a version field and a migration registry, neither of which exist today
- **kind**: design
- **area**: serialization / schema migration infrastructure
- **severity**: n/a (design)
- **confidence**: high
- **evidence**: F-B06-1 (no version field at all); every migration section Tier 1 wrote for its
  own design findings (e.g. F-A10-14's block-rate opt-out flag, F-A10-17's per-parameter
  `{min,max}`, F-A03-7's live-recompute-on-load for `frequency`) independently proposes "an
  automatic upgrade-on-load" as the safety mechanism, and every one of them assumes there is
  something to upgrade *from* — a way to tell an old file from a new one and run exactly the
  transforms it's missing, once, without re-running already-applied ones on a re-save.
- **detail**: Concretely, a boolean→continuous change like Oscillator `fixedPitch: boolean` →
  `keyTrack: number` (the worked example in the Tier 2 brief) needs, at minimum: (1) a `version`
  field written on every save (F-B06-1) so a loader can tell "this file predates keytrack" from "this
  file already has it" without guessing from field presence alone (fragile — `keyTrack` being
  merely *absent* is not distinguishable from "author explicitly set it to 0" without a version
  gate); (2) an ordered list of migration functions keyed by version, run once at load time before
  the graph reaches any node component (today, the closest thing to this is the ad hoc
  `parentNode`→`parentId` branch and the `flow.session` presence check in `parseSaveFile` — both are
  one-off, not a registered/ordered mechanism); (3) a policy for what happens on Save after a
  migration runs — does the file get silently upgraded in place (so the next Load doesn't need to
  migrate again), or does Save always write current-version data regardless (making every Save an
  implicit migration)? Nothing today answers that question because nothing today has ever needed
  to. Every one of Tier 1's "migration: automatic upgrade on load, feasible" verdicts is true only
  if this infrastructure gets built first — right now it would have to be invented from scratch,
  simultaneously with whichever specific 0.2 change ships first, rather than being a known quantity
  the 0.2 features can each plug into independently.
- **manual impact**: `00-foundations.md` would need a new section describing the save-file schema
  and its version field (currently the manual never mentions a schema version because there isn't
  one); any manual chapter documenting a 0.2 boolean→continuous change (e.g. a rewritten
  `nodes/oscillator.md` "Fixed Pitch" section) would need a paragraph on what happens when an old
  `examples/*.json` file with the old boolean is loaded.
- **migration**: This finding *is* the migration-infrastructure gap — building it is the
  precondition, not a consequence, of any 0.2 schema change. Recommended shape: add
  `version: number` to `saveData` (default `1` for the current shape, `0` implied for any file
  missing the key); centralize `parseSaveFile`'s ad hoc branches plus all future ones into an
  ordered `MIGRATIONS: Array<{from: number, to: number, apply: (flow) => flow}>` run in a loop
  until `flow.version === CURRENT_VERSION`; have `handleSave` always stamp `CURRENT_VERSION`, so a
  migrated-then-resaved file never needs the same migration again. This is additive and backward
  compatible by construction — every file in `examples/` today has no `version` key and would be
  treated as version `0`/`1` and migrated forward exactly once.

## Corpus audit — method and result (supporting F-B06-4/F-B06-5)

Ran `skald-backend/codegen.exe -in:<file> -out:<scratch>.odin -package:generated_audio` against
every one of the 94 `.json` files currently under `examples/` (the existing prebuilt `codegen.exe`
is newer than every `.odin` source file it depends on, so it reflects current backend behavior;
attempting a from-scratch `odin build .` in `skald-backend/` fails for an unrelated reason — a
stray leftover `skald-backend/generated_audio.odin` scratch file with `package generated_audio`
sitting directly in the backend's root package directory conflicts with `main.odin`'s `package
skald_codegen`; this blocks a clean rebuild of the backend from that directory and is worth fixing
independently, though it's outside this scope's remit). Then ran `odin check <dir> -no-entry-point`
on every successfully-generated `.odin` file in isolation, matching `AUDIT.md`'s own two-stage
method.

Result: **93/94 pass both stages.** The one failure, `archive/PulsarBeam.json`, is the same
pre-existing, already-documented bug `AUDIT.md` itself recorded (wiring an LFO into `Delay`'s
never-supported `input_delayTime` port). No new codegen or compile failures were found across the
32 files `AUDIT.md` never audited. Also swept the full corpus for legacy port handle names still
reaching the validator: only `cutoff`, `frequency`, `pulseWidth` appear (all three are mapped by
`normalize_port` in `skald-backend/core/json.odin:36-49`, confirming Tier 1's F-A10-2 holds across
the whole corpus, not just the four files it spot-checked) plus `input_delayTime` (the one known
PulsarBeam failure) — no unmapped legacy names were found anywhere else in the library.
