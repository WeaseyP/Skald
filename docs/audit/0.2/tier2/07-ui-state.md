# B07 — Editor UI state and canvas UX audit

## Summary

- **The graph's undo stack and the sequencer's undo stack are two independent LIFO histories that a
  single Ctrl+Z pops in lockstep, with no shared ordering.** The moment they have a different number
  of entries — which happens constantly, since a parameter tweak on a non-instrument node only ever
  pushes to the graph stack and a step toggle only ever pushes to the sequencer stack — one Ctrl+Z
  stops undoing "the last thing that happened" and starts undoing "the last graph thing and the last
  sequencer thing, whatever those happen to be." Deleting an Instrument node (which cascades into
  deleting its sequencer track as a side effect) is the single cleanest repro. This is the most
  significant undo-system defect found.
- **Node position drags are not meaningfully undoable.** React Flow reports drag position on every
  pointer-move as `dragging: true` (not snapshotted) and only the final release as `dragging: false`
  (snapshotted) — but the snapshot is taken of the *pre-release* state, which by then already reflects
  the second-to-last drag tick, not the pre-drag origin. Undo after a drag restores a position visually
  indistinguishable from where the node was dropped.
- **Two of the app's node-adding paths never touch the undo system at all**: dragging a node from the
  palette onto the canvas, and merge-importing a saved patch into the current graph. Ctrl+Z immediately
  after either action does nothing to remove what was just added.
- **"Load" is fully destructive with no confirmation and deliberately erases undo history** — by
  design, for the good reason that undoing across an unrelated loaded graph is nonsensical — but there
  is no "you have unsaved changes" prompt beforehand, so the previous graph is unrecoverable the moment
  Load succeeds.
- **Copying and pasting a Group together with its children silently detaches the paste from the copy**:
  the new Group node is empty, and the "duplicated" children reattach to the *original* Group instead
  (their `parentId` is never remapped through the paste's id table, unlike every other paste path in
  the codebase, which does remap ids).
- Established, per this agent's brief, that Tier 1's Oscillator "phase in the sidebar only" finding is
  one instance of a **codebase-wide pattern**: the canvas node body and the sidebar are two separately
  maintained UI implementations with no shared source of truth, and they disagree in both directions
  across at least five node types (new instances found here: Reverb, Wavetable, Instrument; Tier 1
  already found Oscillator, Mixer and Mapper instances of the same thing).

## Findings

### F-B07-1: Graph undo and sequencer undo are independent stacks popped by the same keystroke, producing wrong-object undos as soon as they drift out of lockstep
- **kind**: code-bug
- **area**: undo/redo (graph + sequencer)
- **severity**: high
- **confidence**: high
- **evidence**: `useGraphState.ts:39-40` (`history`/`future` for nodes+edges) and
  `useSequencerState.ts:9-39` (a completely separate `history`/`future` for `tracks`) are two
  unconnected `useState` stacks with no shared clock or ordering. `app.tsx:208-221` handles Ctrl+Z by
  calling `handleUndo()` (graph) **and** `sequencerStateHooks.handleUndo()` (sequencer) unconditionally,
  every time, regardless of which one (if either) the user's last action actually touched. Concretely:
  `useInstrumentRegistry.ts:28-35` auto-calls `sequencerActions.removeTrack(track.targetNodeId)` the
  instant an Instrument node disappears from `nodes` — i.e. deleting an Instrument pushes **one** entry
  onto graph history (the node removal, `useGraphState.ts:80-84`) and **one** entry onto sequencer
  history (`removeTrack`'s own `saveHistory()`, `useSequencerState.ts:59-63`) as a single user action.
  But any *unrelated* intervening sequencer edit (a step toggle, `toggleStep`, `useSequencerState.ts:75-109`)
  or graph edit (a slider drag elsewhere) pushes to only one of the two stacks, immediately desyncing
  their depths.
- **detail**: Concrete repro: toggle a step on Track A's pattern, then drag a Filter's cutoff on an
  unrelated node, then press Ctrl+Z once. The user's mental model is "undo the cutoff drag" — and the
  graph half of the call does exactly that — but the same keypress also calls the sequencer's
  `handleUndo()`, which pops its own most recent entry: the step toggle from a moment ago, which the
  user was not trying to touch and may not even remember doing. Worse, deleting an Instrument that owns
  a sequencer pattern destroys that pattern's notes as an unavoidable side effect of the node removal
  (`removeTrack` fully discards the track object, notes included); if *anything* else touched the
  sequencer or graph in between the delete and the undo, the one Ctrl+Z a user reaches for will not
  restore both halves together, and the instrument comes back with a **blank** pattern, its original
  notes gone with no further way to get them back.
- **suggested fix**: Merge the two histories into one ordered stack of "graph or sequencer" entries
  (a tagged union with a single global sequence counter), or at minimum push the sequencer-track cleanup
  in `useInstrumentRegistry.ts:28-35` onto the **same** history entry as the node deletion that caused it,
  and make Ctrl+Z pop only the single most-recently-touched stack rather than both stacks every time.

### F-B07-2: Node position drags are not meaningfully undoable
- **kind**: code-bug
- **area**: undo/redo (graph — node moves)
- **severity**: high
- **confidence**: high
- **evidence**: `useGraphState.ts:80-84`: `onNodesChange` treats a position change as undoable only when
  `c.type === 'position' && !c.dragging`, i.e. only the final release event of a drag gesture. But every
  intermediate `dragging: true` tick in between is still applied to `nodes` via the unconditional
  `setNodes(nds => applyNodeChanges(changes, nds))` on the same line — it simply isn't snapshotted. When
  the final `dragging: false` tick arrives, `saveStateForUndo()` (`useGraphState.ts:59-71`) is called
  with the *current* `nodes` closure, which is already the position from the second-to-last drag tick
  (one pointer-move frame before release), not the node's pre-drag origin.
- **detail**: A user who drags a node across the canvas and immediately presses Ctrl+Z sees the node
  snap back a few pixels — the position from one animation frame before the drop — instead of returning
  to where the drag started. For all practical purposes, moving a node is not undoable at all; the user
  has no way to recover a node's prior position short of manually dragging it back by eye. This is
  untested: `GraphStateUndo.test.tsx` covers `add`/`remove` node changes and `updateNodeData` coalescing,
  but has no test that drives a multi-tick `position`/`dragging` sequence through `onNodesChange`.
- **suggested fix**: Snapshot on the **first** `dragging: true` tick of a gesture (there's no history
  entry yet for this drag) rather than the last `dragging: false` tick, mirroring the "coalesce into one
  entry per gesture" pattern already used for slider drags (`saveStateForUndo(true)`,
  `useGraphState.ts:107-108`) — track "have we already snapshotted for this drag?" the same way
  `lastParamSnapshotAt` tracks it for parameter coalescing.

### F-B07-3: Two node-mutating entry points never call into the undo system at all
- **kind**: code-bug
- **area**: undo/redo (add node, import graph)
- **severity**: high
- **confidence**: high
- **evidence**: `useNodeComposition.ts:44-64` (`onDrop`, wired directly to `<ReactFlow onDrop={onDrop}>`
  at `app.tsx:402`) adds the dropped node via `setNodes((nds) => nds.concat(newNode))` with no
  `saveStateForUndo()` call anywhere in the function — contrast every other graph-mutating function in
  `useNodeComposition.ts` (`handleInstrumentNameSubmit:200`, `handleCreateGroup:217`,
  `handleExplodeInstrument:269`), all of which call it. `useFileIO.ts:138-239` (`handleImportGraph`,
  merge-import of a saved patch into the current graph) likewise calls `setNodes`/`setEdges` directly
  (`:233-234`) with no `saveStateForUndo()` call anywhere in the hook, and doesn't reset history either
  (contrast `handleLoad`'s explicit `setHistory([]); setFuture([]);` at `:134-135` for a full replace).
- **detail**: Dragging a node from the sidebar palette onto the canvas is the single most common action
  in the editor, and it leaves no undo entry. If a user drops a node and immediately regrets it, Ctrl+Z
  either does nothing (empty history) or undoes an unrelated *earlier* action — the newly-dropped node
  is not removed either way, because no snapshot was ever taken of the pre-drop graph. The same gap
  applies to "Import Patch": merging another file's nodes into the current graph cannot be undone, only
  manually reversed by deleting the merged nodes by hand (and figuring out which ones they were).
- **suggested fix**: Add `saveStateForUndo()` immediately before the `setNodes` call in both `onDrop`
  (`useNodeComposition.ts:63`) and `handleImportGraph` (`useFileIO.ts:233`), the same one-line fix
  already applied everywhere else in `useNodeComposition.ts`.

### F-B07-4: "Load" discards the current graph with no confirmation, and deliberately makes that discard un-undoable
- **kind**: risk
- **area**: file I/O / undo interaction
- **severity**: high
- **confidence**: high
- **evidence**: `useFileIO.ts:91-136` (`handleLoad`): on a successful file read, `setNodes(flow.nodes)` /
  `setEdges(flow.edges || [])` (`:113-114`) replace the entire graph outright, followed by
  `setHistory([]); setFuture([]);` (`:134-135`) — a deliberate design choice per the code's own comment
  in `app.tsx:147-148` ("resetHistory wired for real: the old no-op callbacks meant 'undo' after loading
  a file restored the stale pre-load graph"). Nothing in `handleLoad`, `Sidebar.tsx`'s `onLoad` wiring, or
  `main.ts`'s `dialog.showOpenDialog` call (`:334`) asks the user to confirm discarding unsaved work
  first — there is no dirty/unsaved-changes flag anywhere in the codebase (confirmed by grep for
  `isDirty`/`unsaved`/`beforeunload` across `skald-ui/src`).
- **detail**: The decision to wipe undo history on Load is correct — undoing "back into" an unrelated
  loaded project would be actively confusing. But that decision converts Load into the one action in
  the entire app where a mistake (wrong file picked, or forgetting there was unsaved work) is
  **permanently** unrecoverable, and it is one click away with zero friction: click Load, pick any
  `.json`, and the previous graph is gone the instant the dialog resolves. Every other destructive
  action in the app (delete, explode, create-group) at least has undo as a safety net; this is the one
  place that explicitly does not, and it is also the one place with no confirmation dialog to compensate.
- **suggested fix**: Add a native confirm dialog ("Discard the current graph and load a different file?")
  before applying `flow.nodes`/`flow.edges`, gated on whether the current graph is non-empty (or track a
  simple dirty flag set on any graph mutation, cleared on Save).

### F-B07-5: Copy/paste of a Group together with its children silently detaches the copy from the paste
- **kind**: code-bug
- **area**: copy/paste, grouping
- **severity**: medium
- **confidence**: high
- **evidence**: `useGraphState.ts:151-195` (`handlePaste`): for every node in the clipboard, a new id is
  generated and recorded in `idMap` (`:160-161`), and the new node is built via
  `{ ...node, id: newId, position: {...}, selected: true, data: JSON.parse(JSON.stringify(node.data)) }`
  (`:164-176`). `parentId` and `extent` are top-level `Node` fields (set on grouped children by
  `handleCreateGroup`, `useNodeComposition.ts:245-246`: `parentId: newGroupId, extent: 'parent'`) — they
  are **not** listed in that spread's overrides, so they pass through unchanged, still pointing at the
  *original* group's id. Nothing in `handlePaste` remaps a pasted child's `parentId` through `idMap` the
  way it already remaps `edge.source`/`edge.target` through the same map (`:180-186`).
- **detail**: Select a Group and its children together (e.g. via a drag-selection box), Ctrl+C, Ctrl+V.
  The paste creates a new Group node with a fresh id and no children (nothing in the clipboard has
  `parentId` pointing at *it*), while the pasted "duplicate" children silently reattach as children of
  the **original** Group instead, offset by the paste's `+50,+50` — which, combined with `extent: 'parent'`
  clamping (see F-B07-6), likely renders them jammed into a corner of the original group's box, visually
  overlapping the nodes they were copied from. The user sees an empty floating box (the new "group") and
  a puzzling pile-up inside the old one, with no indication of why the paste didn't work as expected.
  Contrast the Instrument path, which the code explicitly hardens against exactly this class of bug
  (`useGraphState.ts:172-175`'s "deep clone per paste" comment, about a different but related sharing bug).
- **suggested fix**: In the same loop that builds `idMap`, remap `parentId` through it when the parent
  was also copied (`newNode.parentId = idMap.get(node.parentId) ?? node.parentId`), and drop `extent`/
  `parentId` entirely on a pasted node whose original parent was *not* part of the copied selection (so a
  single child copied without its group doesn't end up mysteriously still confined to a box the user
  never selected).

### F-B07-6: No "ungroup" or "remove from group" action exists anywhere; grouped nodes are permanently position-locked
- **kind**: design
- **area**: grouping
- **severity**: medium
- **confidence**: high
- **evidence**: `useNodeComposition.ts:214-257` (`handleCreateGroup`) is the only group-related mutation
  function in the hook; the hook's full return list (`useNodeComposition.ts:456-462`) has
  `handleCreateGroup` and `handleExplodeInstrument` but nothing named `handleUngroup`/`handleRemoveFromGroup`/
  anything equivalent, and `Sidebar.tsx:210-236` ("Grouping" section) has buttons for "Create Instrument",
  "Create Group" and "Explode Instrument" but none for ungrouping. Every grouped child is given
  `extent: 'parent' as const` (`useNodeComposition.ts:246`), which is React Flow's built-in mechanism for
  clamping a node's draggable position to stay within its parent's bounds — permanently, since nothing
  ever clears that field once set.
- **detail**: Instruments have a dedicated, safe reverse operation (Explode) that returns their contents
  to loose canvas nodes; Groups do not. Once nodes are grouped, the only way to get a node out of the
  box — even just to reposition it next to, rather than inside, its former groupmates — is to delete the
  Group entirely, which (via React Flow's own cascading-delete logic for parented nodes) destroys every
  child along with it. That is recoverable via Ctrl+Z today, but only as a side effect of the delete
  cascade, not because the app offers a real "let these nodes go back to being independent" action. A
  user who groups nodes experimentally, then changes their mind about the layout, has no first-class way
  to walk that back — this is a one-way door dressed as a two-way one, since "Create Group" implies its
  natural opposite exists.
- **suggested fix**: Add an "Ungroup" action, mirroring Explode Instrument: clear `parentId`/`extent` on
  the group's children (converting their positions from parent-relative back to absolute), remove the
  Group node itself, and leave the (now-independent) children exactly where they visually were.
- **manual impact**: no dedicated chapter for Group exists in `docs/manual-source` today (grep of
  `docs/manual-source` finds no `group.md` under `nodes/`); whichever chapter eventually documents
  grouping would need a "How to ungroup" section from the start rather than retrofitting one.
- **migration**: none — this is a new, additive action with no effect on existing saved `.skald.json`
  files or their schema.

### F-B07-7: "Create Group" is clickable — and its own tooltip lies — with a selection of exactly one node, but silently does nothing
- **kind**: code-bug
- **area**: grouping, selection
- **severity**: medium
- **confidence**: high
- **evidence**: `app.tsx:379`: `canCreateInstrument={selectedNodesForGrouping.length > 0}` is the single
  boolean passed to **both** the "Create Instrument" button and the "Create Group" button in
  `Sidebar.tsx:212-227`. `Sidebar.tsx:220-227` uses it to enable/disable "Create Group" and to pick its
  tooltip text: `title={canCreateInstrument ? "Group selected nodes visually" : "Select 2 or more nodes
  to create a group"}`. But `handleCreateGroup` itself (`useNodeComposition.ts:214-215`) guards
  `if (selectedNodesForGrouping.length <= 1) return;` — a stricter precondition than the shared
  `canCreateInstrument` flag it's gated behind.
- **detail**: Select exactly one node and look at the "Create Group" button: it renders fully enabled
  (not the disabled/greyed style), and hovering it shows "Group selected nodes visually" — which
  actively asserts the click will work. Clicking it does nothing at all: no group is created, no error,
  no toast, nothing changes on screen. The button's own disabled tooltip text ("Select 2 or more nodes to
  create a group") describes exactly the condition the button is failing to enforce on itself.
- **suggested fix**: Pass a separate `canCreateGroup={selectedNodesForGrouping.length > 1}` prop from
  `app.tsx` and use it for the Create Group button's `disabled`/style/tooltip instead of reusing
  `canCreateInstrument`.

### F-B07-8: Systemic node-body vs sidebar parameter divergence — Tier 1's Oscillator finding is one instance of a codebase-wide pattern
- **kind**: design
- **area**: all nodes — canvas node body (`ParamNode`/individual `*Node.tsx`) vs sidebar
  (`NodeParameterControls.tsx`/`ParameterPanel.tsx`)
- **severity**: high
- **confidence**: high
- **evidence**: The canvas node body and the sidebar are two hand-maintained UI surfaces with no shared
  parameter-list source of truth — the node body is a declarative `fields: ParamField[]` spec per node
  (e.g. `OscillatorNode.tsx:15-21`, `ReverbNode.tsx:8-11`, `WavetableNode.tsx:15-20`) rendered generically
  by `ParamNode.tsx:111-153`, while the sidebar is an entirely separate hand-written `switch (type)` in
  `NodeParameterControls.tsx:115-327` (plus a further layer of node-specific hardcoded branches in
  `ParameterPanel.tsx:293-388` that runs *before* delegating to that switch). Nothing enforces that the
  two lists agree, and in practice they don't, in both directions:
  - **Reverb**: node body exposes only `decay`, `mix` (`ReverbNode.tsx:9-10`); the sidebar also exposes
    `preDelay` (`NodeParameterControls.tsx:237`) — a parameter Tier 1 confirmed is now fully implemented
    and audible in the backend (`F-A07-1`), so this is a *working* control invisible on the canvas.
  - **Wavetable**: node body exposes `position`, `amplitude`, `fixedPitch`, `frequency`
    (`WavetableNode.tsx:16-19`); the sidebar's `case 'wavetable'` (`NodeParameterControls.tsx:203-214`)
    renders `fixedPitch`, `frequency`, `position` — but never `amplitude`. Because the sidebar is also
    the only place a parameter can be marked "exposed" (via `renderControlWrapper`/`wrapper`,
    `ParameterPanel.tsx:281-291`), Wavetable's `amplitude` can be edited on the canvas but can **never**
    be exposed as a public API parameter — unlike every sibling oscillator-family node.
  - **Instrument**: the node body (`InstrumentNode.tsx:80-88`) renders exactly one control, Volume; the
    instrument's other own parameters — `voiceCount`, `glide`, `unison`, `detune` — exist only in the
    sidebar's `case 'instrument'` (`NodeParameterControls.tsx:308-323`, already partly flagged by Tier 1's
    `F-A01-5`/`F-A09-9`). This is the most extreme version of the pattern: an Instrument's entire
    *internal subgraph* also has zero canvas representation at all — it is only visible/editable as a
    flat list under "Internal Nodes" in the sidebar (`ParameterPanel.tsx:310-316`).
  - Tier 1 already found and confirmed (against the manual's own notes) two further instances of the
    same underlying pattern: Mixer's sidebar branch is an unreachable, differently-clamped shadow
    implementation of the reachable one (manual's `mixer.md` Code-vs-intent notes 3-4, confirmed true in
    `08-mixer-panner.md`), and Mapper's sidebar sliders are bounded to ±100/±10,000 versus the node
    body's unbounded fields and the backend's ±1,000,000 (`04-adsr-mapper.md` summary, "Mapper note 1").
- **detail**: The brief asked specifically how widespread the Oscillator phase gap is — the answer is:
  very. This is not a per-node oversight, it's a structural consequence of maintaining the same
  information twice by hand in two different files with two different code shapes (a declarative spec
  vs. an imperative switch-case). Every node added or edited going forward has to remember to update
  both, in the right direction, with the right range — and the codebase's own history shows that this
  has already failed at least five times across ten node types.
- **suggested fix**: Generate the sidebar's default per-node control list from the same `ParamField[]`
  spec the node body already uses (`ParamNodeConfig.fields`), falling back to today's hand-written
  `NodeParameterControls` cases only for the genuinely special widgets (envelope editor, XY pad, BPM
  sync). That turns "sidebar parameter list" into a derived view of "node body parameter list" instead of
  an independently-authored parallel one, and any future divergence becomes a compile-time-visible
  omission rather than a silent one.
- **manual impact**: `nodes/reverb.md` — "The controls" table (would need a note that Pre-Delay is
  canvas-invisible today); `nodes/wavetable.md` — "The controls" table (Amplitude's exposability gap);
  `nodes/instrument.md` — "What it looks like in Skald" / handles section (currently only describes the
  ports, not that Volume is the only on-canvas control); `nodes/oscillator.md`'s existing phase note
  would gain a cross-reference rather than standing alone as an isolated oddity.
- **migration**: none required for existing saved patches either way — this is a UI-only change. If the
  fix is "generate the sidebar from the node body's fields," a few sidebar-only parameters (Wavetable's
  missing `phase`, per Tier 1's `F-A01-8`) would need their node-body `fields` entries added *first*, or
  they'd disappear from the sidebar along with the migration rather than being newly added to the canvas.

### F-B07-9: Undo coalescing is time-windowed, not gesture-scoped — can both over-merge and under-merge
- **kind**: qol
- **area**: undo/redo (parameter edits)
- **severity**: medium
- **confidence**: high
- **evidence**: `useGraphState.ts:57-71`: `saveStateForUndo(true)` (called from `updateNodeData` on
  every single parameter change, `:107-108`) only pushes a new history entry if at least 500ms have
  elapsed since the *last push* (`lastParamSnapshotAt`), and only resets that timer when a push actually
  happens.
- **detail**: This is a wall-clock window, not a drag-lifecycle boundary (no pointerdown/pointerup
  signal is involved). Two consequences follow directly from the 500ms constant: (1) a slow, deliberate
  slider drag that runs longer than 500ms end-to-end will split into two or more separate undo entries
  mid-drag, rather than the single entry the comment at `:54-56` says is the intent; (2) two genuinely
  separate edits — e.g. tweaking one node's cutoff, then immediately tweaking a different node's
  resonance — will silently merge into one undo entry if the second edit's first tick lands within
  500ms of the first edit's last push, because the timer has no concept of "which control" or "which
  node" is being edited, only "was there a push recently."
  `GraphStateUndo.test.tsx:69-88` only tests the "one drag, three quick ticks" case, which this design
  handles correctly — it doesn't exercise either failure mode above.
- **suggested fix**: Coalesce by gesture rather than by wall-clock proximity — track pointerdown/blur on
  the actual control (CustomSlider/NumberInput already know when they're focused/dragging,
  `CustomSlider.tsx:88`, `NumberInput.tsx:34`) and have the control itself signal "this gesture just
  started" vs. "this gesture is still going," rather than inferring gesture boundaries from a fixed
  timeout with no per-control identity.

### F-B07-10: Groups have no rename affordance anywhere
- **kind**: qol
- **area**: grouping
- **severity**: low
- **confidence**: high
- **evidence**: `GroupNode.tsx:109-111` renders `{data.label || 'Group'}` as a static `<div>` with no
  `onDoubleClick`/input/editing state — contrast `InstrumentNode.tsx:18-31`, which implements exactly
  this (double-click the header to edit `data.name` inline). `NodeParameterControls.tsx` has no
  `case 'group'`, so the sidebar's container branch for a selected Group
  (`ParameterPanel.tsx:293-319`) falls through to the shared component's `default:` arm
  (`NodeParameterControls.tsx:324-325`, "No standard controls for group") — there is no name field
  there either.
- **detail**: `handleCreateGroup` always names a new group `'New Group'`
  (`useNodeComposition.ts:234`), and once created, nothing in the UI lets a user change that label —
  every Group in a project with more than one ends up named identically, with no way to tell them apart
  except by their contents or position.
- **suggested fix**: Give `GroupNode.tsx` the same double-click-to-rename affordance
  `InstrumentNode.tsx` already has, writing through `useNodeParamUpdater`/`updateNodeData` the same way.

### F-B07-11: Overall polish read — what makes this feel like 0.1
- **kind**: qol
- **area**: overall editor feel
- **severity**: medium
- **confidence**: high
- **evidence/detail**: Collected across this audit, the pattern that keeps recurring is *silent
  no-ops instead of feedback*: Create Group can be clicked and do nothing (F-B07-7) with no toast/shake/
  error; dropping a node or importing a patch leaves no undo trail to signal "this wasn't tracked"
  (F-B07-3); a dragged node's "undo" silently does almost nothing (F-B07-2); there is no on-canvas
  affordance for Undo/Redo at all — no button, no menu item, no "3 actions available to undo" indicator
  — the *only* way to discover the feature is the "?" shortcut legend (`ShortcutLegend.tsx:7-9`), and the
  only way to use it is a keyboard chord. Destructive actions (Load, Delete, cascading Group delete) rely
  entirely on the undo stack as their sole safety net, with zero confirmation dialogs anywhere in the
  app (confirmed by grep for `confirm(`/`window.confirm` across `skald-ui/src` — no hits outside test
  files). Two structurally identical actions — Create Instrument and Explode Instrument — have a proper
  reverse-of-each-other relationship; the visually equivalent Create Group does not (F-B07-6). None of
  this breaks audio or loses data outright (undo covers most of it, when it works), but together it is
  exactly the texture of a 0.1: real, working functionality with the "does the obvious thing fail
  loudly, or reversibly, or with feedback" layer not yet built on top of it.
- **suggested fix** (0.2 scope, roughly in priority order): fix the undo-stack desync (F-B07-1) and
  drag-undo (F-B07-2) first, since they make the app's central safety net actively unreliable; add the
  two missing `saveStateForUndo()` calls (F-B07-3); add a confirmation prompt to Load (F-B07-4); then
  layer in visible Undo/Redo buttons with an enabled/disabled state reflecting real stack depth, and a
  brief toast/inline message for the "this button did nothing" cases (F-B07-7) — none of this requires
  new features, only surfacing state that already exists.
