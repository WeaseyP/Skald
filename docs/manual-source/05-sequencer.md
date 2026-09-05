# The sequencer, tempo and the transport

> The sequencer is not a preview tool bolted onto the editor. It is a piece of the asset: press Play and you are hearing the same generated sequencer your game will run, off the same notes, at the same tempo.

## What it is

Everything else in this manual makes *one* sound. The sequencer decides *when* that sound happens, how loud, at what pitch, how often, and — through P-locks — what the patch is set to at that instant.

It lives in the dock along the bottom of the window. From left to right: a transport strip (Play, Stop, BPM, Steps, Key, Scale, Loop), then a Master column with the scope and the peak meter, then a list of tracks, then a grid of steps. The whole dock collapses to just the transport strip with the ▼ button, and you can drag its top edge to resize it between 150 and 800 pixels (`skald-ui/src/components/Sequencer/SequencerDock.tsx::SequencerDock`).

One thing to fix in your head before anything else, because it explains most first-hour confusion:

**A sequencer track exists because an Instrument node exists.** The track list is derived state. You do not create a track; you create an Instrument on the canvas, and a track appears for it (`skald-ui/src/hooks/sequencer/useInstrumentRegistry.ts::useInstrumentRegistry`). Delete the Instrument and its track goes with it. Nothing else on the canvas can have a track, because nothing else becomes an asset — see the Instrument chapter.

## The transport

### Play

**Play** serialises your whole project to JSON, hands it to the code generator, compiles the result to WebAssembly, and loads that module into an audio worklet (`skald-ui/src/hooks/nodeEditor/useWasmAudioEngine.ts::handlePlay`, which calls `::buildModule`). It takes roughly a fifth of a second on an ordinary patch. While it is working, a small amber pip reading **Building…** appears next to the buttons, so a slow build is visibly a build rather than nothing happening.

That is worth restating: **the preview is not a simulation.** There is no second, hand-written audio engine. The worklet runs `<Asset>_process` — the exact procedure your game will call — through a thin `@(export)` shim (`skald-backend/core/codegen_project.odin::generate_wasm_shim_code`). The sequencer you hear is `<Asset>_process_sequence`, generated once and used by both (`::generate_sequencer_logic`).

**What Play needs.** Two conditions, and they are different:

1. **Something on the canvas.** A genuinely empty canvas throws `No instruments on the canvas. Wrap nodes in an Instrument before playing.` A canvas with loose nodes and *no* Instrument node is wrapped automatically into a single one-shot asset called `Asset`, exactly as the command-line generator has always wrapped it (`skald-ui/src/utils/projectSerializer.ts::buildProjectData`, mirroring `skald-backend/core/json.odin::build_project_from_graph_raw`). So a loose graph will build and play.
2. **An Instrument node, if you want the sequencer to play it.** This is the rule that catches people. A loose graph gets no track, because tracks come from Instrument nodes — so it compiles, plays, and sits in silence until you send it a note from a MIDI keyboard. If you want a *pattern*, select your chain and use the sidebar's **Create Instrument**.

There is a third condition hiding behind the first two. The generator emits a sequencer only for an asset whose type is **Music layer**; a one-shot SFX gets an empty `_process_sequence` (`skald-backend/core/codegen_analysis.odin::detect_asset_type`). An Instrument card set to *Auto* — which is what every file that never chose gets — is judged a Music layer if an unmuted, non-empty track points at it. Muting the only track on an Instrument therefore does more than silence it: at the next build the asset is regenerated as an SFX with no sequencer at all.

### Stop and Loop

**Stop** tears down the audio context. It is not a pause: the next Play rebuilds and restarts from step 0.

**Loop** is a live toggle — it does not rebuild, because `skald-ui/src/hooks/nodeEditor/useWasmAudioEngine.ts::useWasmAudioEngine` posts a `set-loop` message straight to the running worklet. With Loop on, the pattern wraps at the end forever. With Loop off, the generated sequencer sets `p.playing = false` when the step counter reaches the pattern length, and the transport returns to Stop once the last voice has finished ringing. The two are separate: `<Asset>_is_playing` stays true through a release tail and through a Delay or Reverb tail after the pattern has ended, which is why "the pattern is over" and "the asset is silent" are different moments.

### The playhead

The pale vertical band sliding across the grid is the playhead. It is not animated on a timer — the worklet reads `skald_get_step` out of the running module every render quantum and posts the value up when it changes (`skald-ui/src/hooks/nodeEditor/audioWorklets/skaldWasm.worklet.ts::skaldWasmProcessorString`). So the playhead is *reporting* the DSP's step counter, not driving it. If audio glitches, the playhead glitches with it.

It follows **one** asset: the first Instrument, in generated order, that has a track with at least one unmuted note (`skald-ui/src/hooks/nodeEditor/useWasmAudioEngine.ts::computeStepAsset`). In a song where tracks have different lengths, the playhead is telling you where *that* asset is.

## BPM: one tempo, three consumers

There is exactly one tempo in a Skald project. The **BPM** box in the sequencer toolbar and the **BPM** box in the sidebar are the same field; the toolbar's tooltip says so out loud. Range **20 to 999**, default **120** (`skald-ui/src/definitions/bpm.ts::BPM_MIN`, `::BPM_MAX`, `::BPM_DEFAULT`). Anything typed is clamped through `::clampBpm`, and a cleared field falls back to 120 rather than poisoning the timing with `NaN` — an empty box once serialised as JSON `null`, which the generator read as `bpm = 0`, a divide-by-zero time base.

That one number feeds three things:

- **The step clock.** A step is a sixteenth note: `samples_per_step_f := p.sample_rate * 60.0 / (p.bpm * 4.0)`. At 120 BPM a step is 0.125 s; at 110 BPM it is 0.13636 s.
- **Note duration.** A step's Duration is in *steps*, converted at runtime: `<Asset>_note_on(p, note, velocity, duration * (60.0 / p.bpm / 4.0))`. Slow the tempo and notes get proportionally longer, so the phrasing survives a tempo change.
- **Every BPM-synced node.** See "BPM sync" below.

### Where it is stored

BPM lives in the save file's top-level `session` block, alongside pattern length, master volume and the export package name (`skald-ui/src/hooks/nodeEditor/useSessionSettings.ts::DEFAULT_SESSION` — `bpm: 120`, `patternSteps: 16`, `masterVolume: 0.8`, `packageName: 'generated_audio'`). Save writes all four; Load restores each one it finds and leaves the current value alone for any it does not, so an older save with no `session` block opens at your current tempo rather than snapping to 120 (`skald-ui/src/hooks/nodeEditor/useFileIO.ts::applySaveData`).

The generator reads the same block. Hand it a `.skald.json` with no `session` and it warns, loudly, that it has assumed `bpm = 120`, `masterVolume = 1.0` and a pattern length taken from the longest active track — because a patch composed at 90 BPM and exported at 120 is not the patch (`skald-backend/core/json.odin::warn_legacy_session_defaults`, `::session_has_values`).

Every session field has its own labelled undo entry — *Change BPM*, *Change pattern length*, *Change master volume*, *Change package name* — and a drag or a burst of typing on one field collapses into a single entry (`skald-ui/src/hooks/nodeEditor/useSessionSettings.ts::useSessionSettings`). Setting the tempo to 240 by accident used to be unrecoverable.

### Runtime BPM is not part of the generated API

In the exported code, `bpm` is a plain `f32` field on `<Asset>_Processor`, assigned once in `<Asset>_init` from the project tempo. There is **no `<Asset>_set_bpm`**, no `"bpm"` case in `<Asset>_set_param`, and no `bpm` row in `<Asset>_PARAMS` (`skald-backend/core/codegen_processor.odin::generate_processor_code`). Because it is an ordinary public struct field, game code *can* assign `p.bpm = 90.0` directly and both the step clock and every synced node will follow immediately — but you are on your own for clamping, and a zero divides by zero. A supported runtime-tempo API is deliberately out of scope for this release and named for the next one in the exclusions chapter.

Changing the BPM in the editor **while playing** changes the project description, so it triggers a debounced rebuild and hot-swap (about a quarter of a second), preserving the step position. You will hear a short seam.

## Steps and pattern length

### Two lengths, and the smaller one wins

**Steps** in the toolbar is the *global pattern length* — the loop boundary, in sixteenth notes. 16 is one bar. It accepts **1 to 1024** (64 bars), clamped by `skald-ui/src/components/Sequencer/stepMetrics.ts::clampPatternSteps` against `::MAX_PATTERN_STEPS`, which is the same clamp the serializer applies to the number that actually reaches the generator.

**Len** on each track row is that track's *own* loop length, same range (`skald-ui/src/components/Sequencer/TrackList.tsx::TrackList`).

How many steps a track actually plays is the smaller of the two:

```
playable = min(track length, pattern length)
```

That is `skald-ui/src/components/Sequencer/stepMetrics.ts::effectiveTrackSteps`, and it is the single definition every surface reads — the step grid, the piano roll, Export Step and the Generate warnings — so they cannot drift apart. A track that stores no length at all is treated as 16 (`::DEFAULT_TRACK_STEPS`), mirroring the generator's own `if track_steps <= 0 do track_steps = 16`.

The reason it is a `min` and not just the pattern length is visible in the generated code. Each track becomes `switch p.current_step % <track_steps>`, while `p.current_step` only ever runs from 0 to `pattern_steps - 1`. So:

- **A track shorter than the pattern loops back.** An 8-step track under a 32-step pattern plays its 8 steps four times. Hover a column past the track's own length and the tooltip tells you which earlier step is replaying there.
- **A track longer than the pattern is truncated.** A `case 20:` inside a `% 16` switch is code the modulo can never reach. Steps 16 onwards of a 32-step track simply never fire under a 16-step pattern.

### Shortening a pattern that has notes past the end

Nothing is deleted. The policy is **keep the data and show it**:

- The unreachable columns are drawn, greyed, at 30 % opacity, with `cursor: not-allowed` and `aria-disabled` set. Notes in them are drawn too, dimmed, with a dashed amber outline (`skald-ui/src/components/Sequencer/StepGrid.tsx::StepGrid`).
- An amber notice appears above the grid counting them and naming *which* length is the limit — "this track's own length (4 steps) is the limit, not the pattern (16)" when the track is the shorter one, otherwise the pattern (`skald-ui/src/components/Sequencer/OutOfRangeNotice.tsx::outOfRangeLimitText`).
- The grid grows extra columns if it has to, so a note stranded past *both* lengths still has somewhere to be seen (`skald-ui/src/components/Sequencer/stepMetrics.ts::noteExtent`). Before that, lowering both counts left notes with no column at all: invisible in the editor, still in the save file, still in the export.
- Raise either length and the notes come back, unchanged. Undo restores the boundary.
- The notes stay in the save file **and in the export** — the serializer is deliberately not destructive.

You can still get rid of a stranded note where it sits: **right-click** it. Left-click creates nothing in a greyed cell, because a note there could never sound, and the erase-drag does not arm on greyed cells so a sweep across the boundary cannot take stranded notes with it.

This matters because a shipped file demonstrates it. `examples/songs/full/four-bar-song.skald.json` has 64-step tracks; before it carried a `session` block it opened at the default 16 and three of its four bars arrived out of range. Anything that had trusted the boundary over the notes would have deleted three bars of shipped music on export.

## Tracks

### One per Instrument

On every change to the canvas, the registry reconciles the track list against the Instrument nodes in a single write: add a track for any Instrument that has none, rename any whose Instrument was renamed, drop any whose Instrument is gone (`skald-ui/src/hooks/sequencer/useSequencerState.ts::syncInstrumentTracks`). A new track arrives with `steps: 16`, no notes, unmuted, unsoloed.

- **Rename an Instrument** and the track is renamed in place. Same track id, same notes.
- **Delete an Instrument** and the track is removed with it — and **one Ctrl+Z brings back the node and its whole track of notes together.** That works because this reconciliation is deliberately silent: it pushes no undo entry of its own. The graph edit that deleted the node already pushed one, and that entry's snapshot contains the tracks as they were. Two entries meant one undo restored a track whose node was still gone, and the next tick deleted it again.

The registry never creates a second track for one Instrument, but it does not forbid one either: a hand-authored or older file can carry several tracks pointing at the same Instrument, and all of them are kept and all of them play. `examples/songs/full/four-bar-song.skald.json` does exactly this — *Pad Root* and *Pad Third* both target `inst_pad`, and the generated `Pad_process_sequence` contains two `switch` statements sharing one step counter.

### Mute, Solo, and what they do to the export

**M** and **S** on the track row are not preview-only conveniences; they change the emitted code. A muted track is dropped from the asset's active track set, and an Instrument whose every track is muted is excluded from the mix entirely. Soloing any track bubbles up to the Instrument, and once any Instrument is soloed the unsoloed ones are excluded (`skald-ui/src/utils/projectSerializer.ts::buildProjectData`, `skald-backend/core/codegen_analysis.odin::active_sequencer_tracks`). Because this is structural, toggling M or S during playback triggers a rebuild rather than applying instantly — and leaving a Solo on when you export ships a project with the other assets missing.

Clicking a track's **name** selects and centres its Instrument node on the canvas (`skald-ui/src/app.tsx::handleFocusNode`). **Edit** opens the piano roll for it.

## The Step Grid versus the Piano Roll

They edit the same notes. They differ in what axis they give you.

### The Step Grid

One row per track, one column per step, all tracks at once. There is no pitch axis, so:

- **Left-click an empty cell** paints a note at **MIDI 60 (middle C)**, velocity 1.0, duration 1 step (`skald-ui/src/hooks/sequencer/useSequencerState.ts::toggleStep`). Drag across cells to paint a run.
- **Left-click a cell that has notes** selects the lowest-pitched one and opens Step Properties in the right-hand panel.
- **Right-click** deletes *every* note on the step, and drag-right-click erases a sweep. This is why: a grid row cannot express "erase the G of this chord", and the old behaviour deleted whichever chord member happened to be first in insertion order — so erasing a triad took three clicks, and after each one a sibling took over the block and the step never appeared to clear.

A step holding a chord draws one block per member, stacked, so three notes look like three notes. What you can read off a block without clicking it: its **width** is duration in steps, its **opacity** is velocity, and a yellow bar along the bottom is probability below 100 %. The tooltip spells all three out numerically. Every fourth column has a brighter right border, so beats are countable.

Columns shrink to fit the dock rather than forcing you to scroll a long pattern: 40 px each by default, down to a 10 px floor, past which the grid scrolls (`skald-ui/src/components/Sequencer/stepMetrics.ts::stepWidthFor`).

### The Piano Roll

One track, with a pitch axis. Open it from **Edit** on the track row; **Close** returns you to the grid.

**The pitch range is the whole MIDI space, 0 to 127** — `skald-ui/src/components/Sequencer/stepMetrics.ts::MIDI_NOTE_MIN` and `::MIDI_NOTE_MAX`, laid out highest-at-top by `::pitchRowsDescending`, 20 px per lane (`::NOTE_ROW_HEIGHT`), 128 rows in all. Row labels run `C-1` at the bottom to `G9` at the top. Earlier versions hardcoded a narrower window — MIDI 36–84, then 21–84 — and a note above the ceiling still played and still shipped, it just had nowhere to be seen, edited or deleted. If an older passage of this manual tells you the roll stops at C6, it is out of date.

Because the range is now five octaves taller than anything most patches use, the roll opens scrolled to put **middle C in the middle of the viewport** (`::scrollTopForPitch`).

- **Click a cell** to add a note at that pitch, or remove one that is there; drag to continue in the mode the first click chose (all adds, or all removes).
- Rows whose pitch is **in the current scale** are drawn brighter, and their key label is white rather than grey. This is the only place Key and Scale show you anything before you press Play.
- Columns past the playable range are darkened with a banner naming both lengths. A note stranded there can be removed with a single click; nothing can be added.
- **Snap to Scale** in the roll's toolbar rewrites every note's *stored* pitch to the nearest in-scale pitch, one chord member at a time (`skald-ui/src/components/Sequencer/PianoRoll.tsx::handleSnapToScale`).

The roll draws narrower columns than the grid — 30 px down to an 8 px floor (`skald-ui/src/components/Sequencer/stepMetrics.ts::PIANO_STEP_WIDTH_DEFAULT`) — because it needs the width for the keys column.

### Chords and note identity

A note's address is the pair **(step, pitch)**, everywhere: both editors, Step Properties, and Export Step. That pair is unique. Retune a chord member onto a sibling's pitch and the retuned note wins — the one it landed on is absorbed, the same way a long note absorbs the notes it ties over in its own pitch lane (`skald-ui/src/hooks/sequencer/useSequencerState.ts::updateNote`). A file that arrives with two notes at one (step, pitch) is de-duplicated on load, first one kept, and Load reports the count (`skald-ui/src/utils/trackNotes.ts::dedupeTrackNotes`).

## Step Properties

Click a step and the right-hand parameter panel becomes **Edit Step N (note P)**, with an **Export Step to Instrument** button and the step's properties (`skald-ui/src/components/Sequencer/StepPropertiesEditor.tsx::StepPropertiesEditor`). Selecting a node on the canvas returns the panel to normal.

| Field | Range | Default | What it does |
|---|---|---|---|
| **Note (MIDI)** | 0 – 127 | 60 when painted in the grid | Pitch. `0` is C-1, `60` is middle C, `127` is G9. |
| **Duration** | 1 – 16 | 1 | How many *steps* the note is held. Converted to seconds at the project tempo. |
| **Vel** | 0 – 1 | 1.0 | Velocity. Reaches the voice and scales every ADSR by its `velocitySensitivity`. |
| **Prob** | 0 – 1 | 1.0 (absent) | Chance the step fires, rolled fresh each loop. |

There is **no micro-timing, swing or per-step offset field.** Every note lands exactly on its sixteenth. If you want a shuffle, you write it as notes.

Two details that only show up in the generated code. Probability becomes `if next_float32(&p.prng) <= 0.55 { … }` around the note-on, seeded deterministically, so a probabilistic pattern is reproducible run to run but not step to step. And a probability of exactly 0 is floored to 0.001 on the way out, because the generator reads a zero as "field absent — play always"; if you want a step never to fire, delete it.

If a chord occupies the step, a row of pitch buttons appears above the fields — *This step holds 3 notes — editing* — so you can switch which member you are editing. Every edit is addressed to the named pitch, and retuning a note carries the selection with it rather than dropping you on "No note at pitch 60 on Step 4".

## Key and Scale

Two dropdowns in the toolbar: **Key** (the twelve chromatic note names) and a scale. Eight scales, defined as semitone offsets from the key (`skald-ui/src/contexts/ScaleContext.tsx::SCALES`):

| Scale | Intervals |
|---|---|
| Chromatic | 0 1 2 3 4 5 6 7 8 9 10 11 |
| Major | 0 2 4 5 7 9 11 |
| Minor | 0 2 3 5 7 8 10 |
| Pentatonic | 0 3 5 7 10 |
| Dorian | 0 2 3 5 7 9 10 |
| Phrygian | 0 1 3 5 7 8 10 |
| Lydian | 0 2 4 6 7 9 11 |
| Mixolydian | 0 2 4 5 7 9 10 |

The default is **C Chromatic**, and *Chromatic is how you turn quantisation off* — its interval list contains all twelve semitones, so nothing is ever out of scale. That default is deliberate: with C Minor as the default, placing an E4 previewed and exported as E♭4 while the piano roll went on displaying E4. Opting into a scale is your call.

**What quantisation does.** `skald-ui/src/contexts/ScaleContext.tsx::nearestInScale` returns the note unchanged if it is already in the scale; otherwise it moves it by the shortest distance round the twelve-semitone circle, and on a tie the interval listed first wins — which is the *lower* one for a note sitting between two scale tones. A♯1 in C Major becomes A1, not B1.

**When it is applied — this is the part that surprises people.** Quantisation is *not* applied when you paint. Your note keeps the pitch you gave it, in the editor and in the save file. It is applied at exactly three moments:

1. **When the project is serialised for the preview**, on every Play and every rebuild (`skald-ui/src/hooks/nodeEditor/useWasmAudioEngine.ts::buildModule` passes it into `skald-ui/src/utils/projectSerializer.ts::buildProjectData`).
2. **When the project is serialised for export**, by the same function, in the same place (`skald-ui/src/utils/projectSerializer.ts::serializeTracks`). Preview and export therefore always agree about pitch.
3. **When you press Snap to Scale** in the piano roll — the only one of the three that changes your stored data.

So with a non-Chromatic scale selected, the grid and the roll show you the pitches you wrote while the preview and the export play something else. The piano roll's in-scale row shading is the warning you get. If the pitches you hear are not the pitches you drew, check the scale dropdown first.

Two more things worth knowing:

- **Changing Key or Scale while playing does not rebuild the preview.** The rebuild watcher is keyed on the nodes, edges, tracks, tempo and pattern length, and the quantiser is not among them (the deep-compare rebuild effect in `skald-ui/src/hooks/nodeEditor/useWasmAudioEngine.ts::useWasmAudioEngine`, comparing `skald-ui/src/utils/projectSerializer.ts::topologySignature`). Stop and Play to hear a scale change on the sequencer. The export is unaffected — Download Code always uses the current scale.
- **MIDI Input is quantised too, and that path is live.** A note played on a connected MIDI keyboard is passed through `nearestInScale` on the way in, and its note-off is matched on the quantised pitch so releases still line up (`skald-ui/src/hooks/nodeEditor/useWasmAudioEngine.ts::sendNoteOn`). So a MIDI key snaps to the scale immediately while the sequencer's notes wait for the next build. See the MIDI Input chapter.
- Quantisation touches **pitch only.** Velocity, duration and probability pass through untouched.

## P-locks

A **P-lock** — a parameter lock, the name comes from Elektron's sequencers — is a per-step override of a patch parameter. It is how you get a hi-hat that opens on the offbeat, or a bassline whose filter snaps open on one note.

### Setting one

Select a step. Below the note fields, Step Properties lists every node inside the Instrument's subgraph with its full parameter set, each with a padlock:

- **🔒 closed** — no override; this step uses the node's own value.
- **🔓 open** — this step has an override.

Click the padlock to create an override seeded with the node's current value, or just move the control — changing a value auto-unlocks it (`skald-ui/src/components/Sequencer/StepPropertiesEditor.tsx::toggleLock`). Click the open padlock to remove the override.

The override is stored on the note as `patchOverrides`, keyed `"<NodeLabel>:<param>"` — `"Bass Tone:cutoff"`. A bare `"cutoff"` with no label is legal too and matches every node in the patch that has that parameter.

Not every parameter can be locked. A P-lock reaches the DSP through an `f32` setter, so only numeric parameters qualify. A waveform name or a BPM Sync checkbox shows **not automatable per step** instead of a padlock, and its control is rendered dimmed and inert — an editable control whose edits are silently discarded is worse than no control.

### Who wins

This is the part that is easy to get wrong, so here is the whole rule. Take a Filter's `cutoff` that is exposed to the game, P-locked on step 8, and fed by an LFO. The generated line is exactly:

```odin
cutoff_c_2: f32 = math.clamp(f32((p.cutoff) + (node_5_out)), 10.0, sample_rate * 0.16)
```

Read off it:

1. **The base is a single `f32` field** — `p.cutoff` — because the parameter is exposed. An unexposed parameter is a baked literal instead (`skald-backend/core/param_utils.odin::get_f32_param`).
2. **Modulation is added on top of the base, per sample, unscaled.** One `+ (src)` per wire; two modulators sum. Modulation is never overridden by anything, and it never overrides anything — it is arithmetic, not precedence.
3. **The P-lock and the game's setter write the same field.** The P-lock is literally `<Asset>_set_param(p, "cutoff", 8000.0)` emitted into `_process_sequence` immediately before that step's `note_on`. It goes through the same typed setter your game calls, so it is clamped to the same range.
4. **P-locks stick.** Nothing restores the authored value. A lock on step 8 is still in force on step 9, 10, 15, and on every subsequent pass through the loop. One P-lock anywhere in a pattern makes that parameter permanently sequencer-owned.
5. **There is no arbitration between the two writers.** A game that drives `cutoff` from gameplay and a pattern that locks `cutoff` on any step are fighting over one float, and the sequencer wins — permanently — at the next locked step. There is no "locked" flag, no precedence order, no way for game code to detect it.

**The preview and the export agree on all five points.** They are not two implementations: the wasm shim calls the same `<Asset>_process`, which calls the same `<Asset>_process_sequence`, which contains the same `set_param` calls. Whatever the stickiness does to your ears in the editor is what it will do in the game.

The practical consequence, and it is worth saying plainly: if you lock a parameter on some steps, **lock it on the steps you want it back on too.** A shipped example shows the trap. `examples/songs/loops/geowars/hat-static.skald.json` locks `decay: 0.12` on steps 2, 6, 10 and 14 over an authored 0.045 and never restores it. What you actually hear: two short ticks, then long ones from step 2 to the end of the pattern, and on every later pass through the loop all sixteen are long. Read as intent, it was meant to be an accent every fourth step.

For game programmers reading the exported header: treat a P-locked parameter as owned by the asset's sequencer, and do not write it from gameplay.

### What a P-lock does to the public API

A P-lock **exposes** the parameter, whether or not you ever clicked the expose button. The generator unions each node's `exposedParameters` with every P-lock target on it (`skald-backend/core/codegen_analysis.odin::effective_exposed_params`, feeding `::build_instrument_plan`), so locking a step mints a real struct field, a clamping typed setter `<Asset>_set_<field>`, a `set_param` case with its `"<nodeId>::<param>"` alias, and a row in `<Asset>_PARAMS`. Your public contract grew because you dragged a value in the step editor. That is not a bug — the P-lock needs the field — but it is worth knowing before you wonder where `Asset_set_cutoff` came from.

### "No dead P-locks"

An override that cannot work is now caught, everywhere, rather than silently doing nothing:

- **A key that matches no node** — you renamed or deleted the node after authoring the lock — is a **hard build failure**. Code generation prints the offending key, lists the valid target labels, and exits (`skald-backend/core/codegen_analysis.odin::collect_plock_targets`).
- **A key that resolves but targets a parameter the DSP never reads under the node's current configuration** is also a hard build failure. `frequency` on a BPM-synced LFO, `frequency` on an oscillator with Fixed Pitch off, `pulseWidth` on anything but a square wave, anything on a MIDI Input, and `syncRate` on any node ever (`::param_is_reachable`, with the human-readable reason in `::param_dead_reason`).
- **A non-numeric value** is filtered out on the way to both the preview and the export.

Crucially, the editor reproduces the generator's judgement rather than guessing at it: `skald-ui/src/utils/plockTargets.ts::resolvePlockTargets` is a case-by-case mirror of the Odin, right down to folding ASCII case only. The moment the node a key names goes away, or the node's configuration kills the parameter, an amber panel appears at the top of Step Properties naming the key, explaining why the build will fail, and offering **Remove**. It also distinguishes the two cases, because the fixes differ: a stale reference can only be deleted, while a dead parameter can also be revived by flipping BPM Sync or Fixed Pitch back — except `syncRate`, where deletion is the only fix. The project issues banner reports the same thing at project level, and it knows not to claim a build failure for an override on a muted track.

## BPM sync for LFO, Sample & Hold and Delay

Three nodes can take their time base from the project tempo instead of a free-running number: the **LFO** (rate), **Sample & Hold** (rate) and **Delay** (time). Tick **BPM Sync** on the node card or in the parameter panel and the Hz or seconds box is replaced by a **note division** dropdown.

Thirteen divisions, longest to shortest (`skald-ui/src/definitions/bpm.ts::SYNC_RATE_OPTIONS`):

`1/1`, `1/2`, `1/2t`, `1/4`, `1/4t`, `1/8`, `1/8t`, `1/16`, `1/16t`, `1/32`, `1/32t`, `1/64`, `1/64t`

A trailing `t` is a **triplet**. **There are no dotted divisions** — no `1/8d` — and no `1/1t`.

### The formula

A whole note is four beats, so `1/N` is `4/N` beats; a triplet is two thirds of that; and:

```
seconds = (60 / bpm) × beats        where beats = 4/N, × 2/3 if triplet
```

Identical in both languages: `skald-backend/core/codegen_analysis.odin::bpm_sync_beats` feeding `::bpm_sync_seconds_expr`, mirrored by `skald-ui/src/definitions/bpm.ts::syncRateToSeconds`. The generated expression is `((60.0 / p.bpm) * <beats>)`, evaluated against the live `p.bpm`, so a division stays a division. An unparseable division falls back to `1/4`, which is also what a node with BPM Sync on and no stored division follows (`::DEFAULT_SYNC_RATE`, mirroring the generator's `get_string_param(node, "syncRate", "1/4")`).

| Division | Beats | Seconds at 120 BPM |
|---|---|---|
| `1/1` | 4 | 2.000 |
| `1/2` | 2 | 1.000 |
| `1/2t` | 4/3 | 0.667 |
| `1/4` | 1 | 0.500 |
| `1/4t` | 2/3 | 0.333 |
| `1/8` | 1/2 | 0.250 |
| `1/8t` | 1/3 | 0.167 |
| `1/16` | 1/4 | 0.125 |
| `1/16t` | 1/6 | 0.083 |
| `1/32` | 1/8 | 0.063 |
| `1/32t` | 1/12 | 0.042 |
| `1/64` | 1/16 | 0.031 |
| `1/64t` | 1/24 | 0.021 |

For an LFO or a Sample & Hold the number you want is the *rate*, so the node follows the reciprocal: `1/4` at 120 BPM is 0.5 s per cycle, i.e. 2 Hz. For a Delay it is the time directly.

### The hint on the card, and the one truth in the file

Next to every sync-rate dropdown — on the node card and in the parameter panel — sits the resolved time at the project tempo: **"1/8 at 90 BPM = 0.333 s"** (`::formatSyncTime`, rendered through the `hint` slot of `skald-ui/src/components/Nodes/ParamNode.tsx::ParamField`, which reads the tempo from `skald-ui/src/contexts/GraphActionsContext.tsx::useProjectBpm`). You never have to hunt for the BPM box to know what a division means.

A synced node stores two numbers: the division the generator follows, and a free-run field the generator ignores while sync is on (`frequency` for the LFO, `rate` for Sample & Hold, `delayTime` for the Delay). Nothing used to keep them in step, so a file could carry a free-run value 14 % off its own division and unticking BPM Sync landed the node on a stale number. Now **every save and every load rewrites the free-run field to the value the division resolves to** — at the session tempo on save, at the file's own tempo on load (`skald-ui/src/utils/syncNormalize.ts::normalizeSyncedFreeRun`, using `::resolvedFreeRunValue`). Two consequences you can rely on:

- The Hz or seconds you see when you untick BPM Sync is the speed you were just hearing. Toggling sync off is a no-op for the sound.
- Ticking BPM Sync on a node that stores no division writes `1/4` explicitly rather than leaving three readers to guess (`::bpmSyncToggleChanges`).

Two honest limits. **Skald syncs the rate, not the phase** — nothing resets an LFO's phase on a bar line or a note-on, so a `1/4` LFO reliably completes one cycle per beat but where in that cycle the downbeat lands depends on how long the voice has been running. And **`syncRate` can never be P-locked or exposed**: it is read at code-generation time as a string, never through a struct field, so no node configuration ever makes it live. For what these nodes are musically *for*, see the LFO, Sample & Hold and Delay chapters.

## Try it (hands-on)

We will use `examples/instruments/bass/bass-sequenced.skald.json` — one Instrument called **Bass**, one 16-step track, six notes, 110 BPM. About fifteen minutes.

1. **Load it and press Play.** Sidebar → **Load**, open `examples/instruments/bass/bass-sequenced.skald.json`. Click **Loop**, then **Play**. You get a short square-plus-sine bassline. The BPM box reads **110** and Steps reads **16**, both restored from the file's `session` block. One track row, named **Bass**, appears because there is one Instrument node on the canvas.

2. **Watch the playhead and count the grid.** Six blocks at steps 0, 3, 5, 8, 11, 13. Notice the blocks are different widths and different brightnesses: width is duration in steps, brightness is velocity. Every fourth column has a brighter border — that is the beat.

3. **Change the tempo and hear what follows it.** Set **BPM** to `70`. The whole thing slows down *and stays phrased* — the notes get proportionally longer, because Duration is in steps, not seconds. Now set it to `180`; a step is down to 0.083 s, the two-step notes are barely a sixth of a second long, and the 0.1 s release tails start piling into each other. Put it back to `110`. Each of those was a rebuild; you should have heard a short seam and seen the amber **Building…** pip.

4. **Halve the pattern.** Set **Steps** to `8`. The loop now turns over twice as often and you hear only the first half of the phrase. Above the grid an amber notice appears: three notes are past the playable range and will not sound. Look at columns 8–15 — greyed, `not-allowed` cursor, the three notes still drawn but dim with a dashed outline. **Nothing was deleted.** Set Steps back to `16` and the phrase is whole again.

5. **Make the track shorter than the pattern, and hear it loop back.** Leave Steps at 16 and set the track row's **Len** to `4`. Now you hear the first four steps four times per bar. Hover column 5: the tooltip reads *this track's loop is 4 steps, so this column replays step 1*. That is `switch p.current_step % 4` in the generated code. Put **Len** back to `16`.

6. **Paint and erase.** Left-click the empty cell at step 6. A note appears at **MIDI 60** — middle C, roughly two octaves above the bassline and obviously wrong for it; that is the grid's fixed paint pitch, and the grid has no way to offer you another. Drag right across steps 7, 8, 9 to paint a run. Now **right-click-drag** back across them to erase.

7. **Pitch it properly in the piano roll.** Click **Edit** on the track row. The roll opens with middle C centred, right on the wrong note you just painted — click that cell (step 6, middle C) once to remove it; the roll toggles, so a click on a filled cell deletes and a click on an empty one adds. Now scroll down to the C2 region and click at step 6 on **D2 (MIDI 38)** to add the real pitch. The label column is white for in-scale notes — right now every row is white, because the scale is Chromatic. Click **Close**.

8. **Give the new note some shape.** Click your step-6 note in the grid. The right-hand panel becomes **Edit Step 6 (note 38)**. Set **Duration** to `2`, drag **Vel** down to about 60 %, and drag **Prob** to about 50 %. The block gets wider, dimmer, and grows a yellow probability bar. Listen: the note now appears on roughly half the passes.

9. **Try the drag modifiers instead.** Hold **Shift** and drag the step-0 block horizontally — that is duration. Hold **Ctrl** and drag vertically — velocity. Hold **Alt** and drag vertically — probability. The block updates as you drag and commits on release, one undo entry per gesture. Ctrl+Z anything you did not mean.

10. **Turn on a scale, and catch it moving your notes.** Set **Scale** to `Major`, leave **Key** at `C`, then **Stop and Play** (a scale change does not rebuild on its own). The two A♯1 notes at steps 8 and 11 now sound as A1 — a semitone *down*, because A comes before B in the Major interval list and both are one semitone away. Look at the grid and the piano roll: they still say 34. **This is the single most confusing thing in the sequencer.** The displayed pitch is your data; the played pitch is your data quantised.

11. **Make it obvious, then undo it.** Set **Key** to `A`, still Major. Stop and Play. Every one of the four pitches drops a semitone — the whole bassline has been transposed by a quantiser doing exactly what it was told. Open the piano roll and press **Snap to Scale**: now the stored pitches move too, and the display finally matches what you hear. Snap to Scale retunes each note as its own edit, so Ctrl+Z a few times to get all six pitches back. Then set **Scale** to `Chromatic` — that is how quantisation is switched off.

12. **Add a P-lock.** Click the note at **step 5** (MIDI 43). Scroll the panel down past the note fields to **Bass Tone**, the filter. Its **Cutoff (Hz)** reads 500 with a closed padlock 🔒. Drag it up to about `4000`. The padlock opens 🔓 and the preview rebuilds. Play.

13. **Hear the stickiness.** Step 5 snaps bright — and so do steps 8, 11 and 13, and so does the whole next pass through the loop. **The lock never comes back off.** Nothing in the generated code restores 500; the P-lock is a single `Bass_set_param(p, "cutoff", 4000.0)` written into the step and left standing.

14. **Fix it the way P-locks are meant to be used.** Click the note at **step 8** and click **Bass Tone**'s closed padlock — it seeds an override at the node's own 500 without your having to type it. Now step 5 is the accent and step 8 puts the tone back — one bright note per bar, which is what you wanted at step 12. This is the whole discipline: **a lock lane needs a resting value written into it explicitly.**

15. **Author a P-lock that cannot work, and watch it get caught.** Still on a step, scroll the panel to **Growl** — the square oscillator — and nudge its greyed **Frequency (Hz)** control. The padlock opens, and an amber panel appears immediately at the top of Step Properties: this override *targets a parameter that is dead right now — fixedPitch is off, so the played note drives pitch instead*, code generation rejects it, and the fix is to toggle Fixed Pitch or remove the lock. Prove the toggle really is the other fix: select the **Bass** Instrument (which puts the step panel away), scroll its **Internal Nodes** list to Growl, tick **Fixed Pitch (ignore note)**, then click your step again — the amber panel is gone, because the parameter is live now. It is also the wrong fix here: the oscillator has stopped following the pattern's pitches. Untick it, click the step, and click **Remove** in the panel. That is what "no dead P-locks" means — the editor is running the generator's own reachability rule, so you find out here rather than at a failed build.

## Keyboard shortcuts and drag modifiers

The full list is in the app: press **?** or click the **?** button at the bottom right (`skald-ui/src/components/ShortcutLegend.tsx::SHORTCUTS`). The ones that apply to the sequencer:

| Keys | What it does |
|---|---|
| `Shift` + drag a note (grid) | Edit note duration |
| `Ctrl` + drag a note (grid) | Edit note velocity |
| `Alt` + drag a note (grid) | Edit note probability |
| Right-click, or right-click-drag (grid) | Erase — clears every note on the step |
| `Ctrl/Cmd + Z` | Undo. The graph, the sequencer and the transport share **one** history |
| `Ctrl/Cmd + Shift + Z`, or `Ctrl + Y` | Redo |
| Double-click a slider | Reset that parameter to its default |
| `?` | Toggle the shortcut legend |

The drag modifiers give the note block a dashed outline and change the cursor while held — `ns-resize` for velocity, `ew-resize` for duration — so you can see which gesture is armed before you press the button. A drag is one undo entry however long it takes, and duration-then-velocity is always two.

Note the shared history. Painting a note, changing the tempo, deleting an Instrument and moving a node all go on the same 100-entry stack, in order (`skald-ui/src/hooks/nodeEditor/editorSnapshot.ts::HISTORY_LIMIT`). That is what makes one Ctrl+Z after deleting an Instrument bring back the node *and* its whole track of notes.

## Terms introduced

| Term | Meaning |
|---|---|
| **Transport** | Play, Stop and Loop — the controls that start and stop the whole project. |
| **Playhead** | The moving highlight showing which step is sounding. It reports the DSP's own step counter for one asset. |
| **BPM / tempo** | Beats per minute, 20–999, one value per project, stored in the save file's `session` block. |
| **Step** | One sixteenth note: `60 / BPM / 4` seconds. The sequencer's grid unit. |
| **Pattern length** | The global loop boundary in steps, 1–1024. 16 steps is one bar. |
| **Track length** | One track's own loop length. A track plays `min(track length, pattern length)` steps. |
| **Out-of-range note** | A note past a track's playable range. Kept, greyed, counted, still saved and exported — never heard. |
| **Track** | One lane of notes, belonging to exactly one Instrument node. Created and destroyed with it. |
| **Step Grid** | All tracks, all steps, no pitch axis. Paints at MIDI 60; right-click clears a whole step. |
| **Piano Roll** | One track with a full MIDI 0–127 pitch axis, opened from the track row's **Edit** button. |
| **Velocity** | 0–1 per note. Drives ADSR depth through each envelope's velocity sensitivity; drawn as block opacity. |
| **Probability** | 0–1 chance the step fires, rolled fresh each loop from the asset's seeded PRNG. |
| **Duration** | Note length in *steps*, 1–16, converted to seconds at the project tempo. |
| **Key / Scale** | The quantisation target. Eight scales; **Chromatic means off**. |
| **Quantisation** | Snapping a pitch to the nearest note in the scale. Applied at preview and export time, not when you paint. |
| **P-lock** | A per-step override of a numeric patch parameter, stored on the note as `patchOverrides`. |
| **Stickiness** | A P-lock persists after its step and through the loop. Nothing restores the authored value. |
| **Note division** | A musical fraction (`1/8`, `1/4t`) a BPM-synced node's time base follows. Triplets only; no dotted values. |
| **Triplet** | A division squeezed to two thirds of its length — three in the space of two. |
| **Free-run field** | The Hz or seconds value a synced node ignores. Rewritten to the resolved value on every save and load. |
| **Session block** | The save file's `{bpm, patternSteps, masterVolume, packageName}` object. |
| **Music layer / SFX** | The two asset types. Only a Music layer gets a generated sequencer. |

Known issues affecting the sequencer are tracked in KNOWN-ISSUES.md under **Sequencer**.
