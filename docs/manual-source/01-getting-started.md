# Getting started and the editor tour

> Every other chapter in this manual assumes Skald is already open in front of you. This one gets it there, shows you the five things on screen, and teaches the one rule that makes Play work at all.

---

## What Skald is

Skald is a Windows desktop application for building audio instruments, sound effects and songs with a node graph. You wire boxes together on a canvas, hear the result immediately through a live preview, and when you are happy you export the same patch as dependency-free Odin source code that your game links against. There is no separate "export mode": the sound you hear while designing is generated and compiled the same way the shipped game will play it.

Two kinds of reader use this manual. A **sound designer** opens the app, wires a patch, tunes it by ear, and never opens a text editor. A **game programmer** receives the `.odin` file the sound designer's Instrument produces, and calls its `_trigger`, `_set_param` and `_process` functions from game code. If you are the second kind of reader and just want to know what an exported asset looks like, read this chapter's "The one rule" and "Generate Code" sections, then skip to the Exporting chapter (`80-exporting-odin.md`).

---

## Installing and starting Skald

There are three ways to get Skald running, in order of how much you want to touch the source.

### The release installer

Windows builds are published on the project's GitHub releases page. Download the **Setup executable** for a normal per-user install — it does not require administrator access — or the **portable ZIP** if you would rather run Skald from a folder with no installer at all (`README.md`, `docs/releases/v0.1.0.md`). Both are Windows x64 only in this release; binaries are unsigned, so Windows SmartScreen may warn you the first time you run one.

### The developer route

If you want to build from source, or you intend to modify the node graph or the Odin generator:

```powershell
git clone https://github.com/WeaseyP/Skald.git
cd Skald
.\scripts\setup-dev.ps1
```

`scripts/setup-dev.ps1` installs the npm dependencies, downloads the pinned Odin toolchain (`dev-2025-02`) into an ignored `.tools/` directory, and builds the Odin code generator. It does **not** install Odin system-wide or touch your PATH. From then on:

```powershell
cd skald-ui
npm start
```

runs the app using the code generator you already built. If you have changed anything under `skald-backend/`, use `npm run start:rebuild` instead, which rebuilds the generator first — plain `npm start` will otherwise keep running the stale binary. `.\scripts\setup-dev.ps1 -Start` does the setup and the first launch in one command.

The developer route needs Windows 10 or newer, Git, Node.js 22 with npm, and the Windows C++ build tools Electron's native dependencies compile against (`README.md`). If you intend to package a release build rather than just run one locally, `docs/RELEASING.md` covers `.\scripts\build-release.ps1`, which runs every test gate before assembling the installer and portable ZIP — not something you need for ordinary use of the app.

### What Skald needs to make sound, and what it ships with

This is worth understanding before your first Play, because it is the one install-time gap that produces a real, first-launch error message.

Skald's Play button does not fake your patch with a hand-written approximation — it runs the real Odin code generator, compiles the result to WebAssembly, and plays that. Compiling to WebAssembly needs an Odin **compiler** on the machine. A packaged installer bundles the code generator itself (`skald_codegen.exe`, which turns your project into `.odin` text) but deliberately does **not** bundle the Odin compiler toolchain — it is roughly 443 MB with its own licence obligations, and a machine that already has Odin installed does not need a second copy (`skald-ui/forge.config.ts`). If a packaged build cannot find a compiler — checking, in order, the `SKALD_ODIN` environment variable, a vendored `.tools/` folder, `odin` on your PATH, then the conventional `C:\Odin\odin.exe` install path — it says so, in the app, both at first launch and on your first Play, naming exactly which of those four it checked and how to fix it (`skald-ui/src/main/odinToolchain.ts::odinMissingMessage`). The message opens plainly: "Odin compiler not found, so audio preview is unavailable," followed by which of the four locations it tried and where to get the compiler from. Editing, Download Code, save and load all work with no compiler at all; only the live preview needs one. The developer setup route above installs the compiler for you, which is why `npm start` never hits this message on a machine that ran `setup-dev.ps1`.

### First launch

The very first time Skald opens on a machine — nothing recovered from a previous crash, an empty canvas, no record of a prior run — it loads a small shipped patch and drops you straight onto a sounding project instead of an empty grid (`skald-ui/src/hooks/nodeEditor/useFirstRunPatch.ts::shouldLoadFirstRunPatch`). That patch is the first entry in the **Start Here** examples (see "The Examples library" below), so pressing **Play** on a brand-new install makes a sound before you have built anything yourself.

---

## The editor tour

### The five surfaces

Everything you do lives on one of five surfaces:

- **The sidebar** down the left edge — tempo, code generation, Play/Stop/Save/Load, the Instrument-grouping actions, and the node palette you drag from.
- **The canvas** in the centre — the node graph itself.
- **The parameter panel** on the right — appears when you select a node, and carries the full-fidelity controls for it.
- **The sequencer dock** along the bottom — one track per Instrument, a step grid, and the master volume slider. Its transport row also carries a **Kit** button, which appears once two or more tracks are percussive and opens every one of them as rows of a single drum grid (`skald-ui/src/components/Sequencer/SequencerToolbar.tsx::SequencerToolbar`).
- **The code preview panel** — replaces the parameter panel when you open it, and shows the actual Odin the generator produced for your patch.

(`skald-ui/src/components/Sidebar.tsx::Sidebar`, `skald-ui/src/components/NodeParameterControls.tsx`, `skald-ui/src/components/Sequencer/SequencerDock.tsx`, `skald-ui/src/components/CodePreviewPanel.tsx`.)

Two of these are worth a second look before you start patching. The parameter panel is not just sliders: an ADSR shows its own attack/decay/sustain/release graph, and a Filter shows an XY pad with cutoff on one axis and resonance on the other, both alongside exact typed number boxes for the same values — drag the pad for a quick sweep, type in the box for an exact number. And the sequencer dock is not just a step grid: it is where tempo, pattern length and master volume live, because those are project-wide settings a single node cannot own.

A node also draws small quick-edit boxes directly on its own body, for the parameters that most benefit from being visible without a click. These are duplicates of what the parameter panel shows, not a second, independent copy — the panel is authoritative, and it is the only place the **expose** toggle lives (see "The parameter panel and 'expose'" below).

### What's in the sidebar

Top to bottom, the sidebar is six labelled sections (`skald-ui/src/components/Sidebar.tsx::Sidebar`):

- **Global** — the project's BPM.
- **Generation** — Package Name, the output-file picker, and **Download Code**.
- **Graph Actions** — **Examples Library**, Play/Stop, Loop, **Save File**, **Open File...**, **Import Patch...**.
- **History** — Undo and Redo, each showing how many steps are behind it.
- **Grouping** — **Create Instrument**, **Create Group**, **Explode Instrument**.
- **Nodes** — the palette you drag from, covered next.

Everything under "Save, Load, Import Patch, autosave and recovery" and "Generate Code" below refers to buttons in this list. One quick distinction inside Grouping: **Create Instrument** is what makes a selection audible (see "The one rule" below); **Create Group** only draws a labelled box around a selection for tidying a busy canvas and has no effect on sound at all.

### The node palette and its colour system

The sidebar's **Nodes** section lists seventeen entries you can drag onto the canvas: Oscillator, Noise, LFO, S & H, FM Operator, Wavetable, ADSR, Filter, Delay, Reverb, Distortion, Mixer, Mapper, Panner, VCA, Output and MIDI Input, each with a one-line tooltip explaining what it does (`skald-ui/src/components/Sidebar.tsx::paletteNodes`).

Every node type has one fixed accent colour that never changes between sessions, and the colours are a real system worth learning at a glance (`skald-ui/src/components/Nodes/NodeStyles.ts::NODE_ACCENTS`):

| Role | Colour | Node types |
|---|---|---|
| Sources | orange / deep orange / pink / white | Oscillator, Wavetable, FM Operator, Noise |
| Modulators | purple / deep purple | LFO, Sample & Hold |
| Envelope | green | ADSR |
| Tone shaping | blue | Filter |
| Time & space | teal / deep teal | Delay, Reverb |
| Drive | red | Distortion |
| Utility | grey / lilac / cyan / pale yellow | Mixer, VCA, Panner, Mapper |
| External input | yellow | MIDI Input |
| Destination | burnt orange | Output |
| Structure | indigo / slate | Instrument, Group |

Note that the Instrument and Group are **not** in the palette — you never drag one in. You build one out of nodes you have already placed; see "The one rule" below.

Once a graph grows past a handful of nodes, the colour is what lets you read it at a glance without opening every parameter panel: a screenful of orange and purple tells you "several sources feeding several modulators" before you have traced a single wire.

### Placing, wiring, selecting and deleting nodes

**Navigating the canvas.** Scroll to zoom in and out; click and drag on empty canvas to pan around. This is standard behaviour of the node-graph library the canvas is built on, not something Skald adds. A minimap in the bottom-right corner mirrors the full graph at a glance, tinting each node the same fixed accent colour its card uses (`skald-ui/src/app.tsx::EditorLayout`, colours from `skald-ui/src/components/Nodes/NodeStyles.ts::accentFor`) — useful once a patch outgrows one screen.

**Snap to grid.** The checkbox in the canvas's top-right corner makes a dragged or dropped node land on a 20-pixel grid — the same spacing as the dots in the background — instead of wherever the pointer happened to be, which keeps a tidy patch tidy. It is a view preference, not part of your patch: it is remembered on this machine but never saved into the file and never appears in the undo history (`skald-ui/src/hooks/nodeEditor/useSnapToGridPreference.ts::useSnapToGridPreference`).

**Placing.** Drag an entry from the sidebar's Nodes palette and drop it on the canvas.

**Wiring.** Every node's edges carry small dot **handles**: inputs on the left (rendered in blue), outputs on the right (rendered in green) (`skald-ui/src/components/Nodes/ParamNode.tsx::makeParamNode`, colours from `skald-ui/src/components/Nodes/NodeStyles.ts::NodeTheme`) — that fixed blue/green is about the handle's *direction* (input vs. output), not what travels through it. Click an output handle and drag to an input handle to wire them; the handle's *name* decides what actually travels — a port named plain `input` carries audio, one named `input_<something>` (`input_freq`, `input_cutoff`, and so on) carries modulation. Foundations covers this distinction in full.

**Cable colours.** The wire itself — not the handle dot — is tinted by what it carries, so a busy patch reads at a glance: green for an audio signal, orange for a continuous modulation source, blue for a trigger or gate pulse (`skald-ui/src/components/Edges/edgeKind.ts::classifyEdgeKind`). This is inferred from the port you land on — audio in on a Filter is green, its Cutoff or Resonance input is orange — falling back to what the source node typically emits only for a generic pass-through port, such as an Instrument's collapsed exposed-parameter handle. A gate wire (MIDI Input's Gate output) is blue wherever it lands, even into a plain audio input, because that combination is itself worth noticing. Selecting or hovering a wire keeps React Flow's own highlight regardless of its colour. The "?" shortcuts popup repeats this key at the bottom.

**Selecting.** Click one node to select it. Shift-click or Ctrl-click to add more nodes to the selection. Click and drag on empty canvas to rubber-band-select everything inside the box. `[` and `]` cycle the selection through the nodes on the canvas one at a time (`skald-ui/src/components/ShortcutLegend.tsx`).

**Deleting.** Select one or more nodes (or wires) and press **Delete** or **Backspace**.

**Duplicating.** There is no separate "duplicate" command — copy the selection with **Ctrl/Cmd+C** and paste it with **Ctrl/Cmd+V**.

---

## The one rule: wrap it in an Instrument before you press Play

This is the single most important structural fact in Skald, and it is easy to get a misleading first impression of, so read this section carefully rather than assuming.

**A patch you have not wrapped does not simply do nothing.** If your *entire* canvas has no Instrument node on it at all — a plain chain of Oscillator, Filter and Output with nothing grouping them — Skald does not go silent. It auto-wraps the whole graph into one SFX asset named `Asset` (voice count 1, unison 1, no custom name) for both the live preview and Generate Code, and tells you it did so the moment you load or play such a file: "no Instrument node — the whole graph will auto-wrap as one 'Asset' SFX instrument for Play/Generate" (`skald-ui/src/utils/projectSerializer.ts::buildProjectData`, `skald-ui/src/hooks/nodeEditor/useFileIO.ts::applySaveData`). This exists so the many older, pre-Instrument example files still play; nearly every shipped patch you build from scratch should still get an explicit Instrument, because the auto-wrap gives you none of the polyphony, naming or export-identity controls a real Instrument card does.

**What genuinely produces silence is different, and narrower.** If your canvas already has *at least one* Instrument somewhere on it, any other nodes sitting outside it are simply ignored — not wrapped, not played — because both the preview and Generate Code build their project description by keeping only nodes of type Instrument (`skald-ui/src/utils/projectSerializer.ts::getInstrumentNodes`). And if the canvas is completely empty — no nodes at all — Play refuses outright rather than producing an empty project: "No instruments on the canvas. Wrap nodes in an Instrument before playing." (`skald-ui/src/hooks/nodeEditor/useWasmAudioEngine.ts::buildModule`).

The practical rule is still the simple one: select the nodes that make up your patch, then Sidebar → **Create Instrument**, and give it a name. The selected nodes collapse into a single Instrument card — the unit that both the preview and the exported `.odin` file actually compile, and what gives your patch polyphony, a name, and a public API (`_trigger`, `_set_param`, and so on). The Instrument chapter covers everything the container itself controls (voice count, glide, unison); this chapter only needs you to remember: **patch first, wrap it deliberately, then Play** — do not rely on the auto-wrap just because it happens to work.

One more thing worth knowing before you wire your first patch: Skald will not silently accept a wire into a port that does not make sense for that node type. Wire something into a port a node does not have, or past a Mixer channel it was not configured for, and code generation refuses with a specific error rather than quietly producing a patch that compiles but sounds wrong. Foundations covers the full set of rules; here, the point is simply that a red error on Generate is Skald catching a mistake, not the tool being broken.

---

## Try it (hands-on): sound in 60 seconds

**What you will hear:** a plain tone at middle C from a graph you built with three nodes, then a full bassline loop from a shipped example — nothing here requires you to know any synthesis yet.

**What you will do:** build the smallest patch that can make a sound, hear it, then load a finished example.

1. If the canvas already has something on it (a fresh install auto-loads a starter patch — see "First launch" above), click and drag a selection box around every node, then press **Delete** to clear it.
2. Drag an **Oscillator** from the Nodes palette onto the canvas.
3. Drag an **ADSR** next to it.
4. Drag an **Output** next to that.
5. Wire the Oscillator's output handle to the ADSR's input handle.
6. Wire the ADSR's output handle to the Output's input handle. You now have the minimum complete voice: a source, an amplitude control, and a destination.
7. Rubber-band-select all three nodes, then Sidebar → **Create Instrument**, and name it anything you like.
8. Sidebar → **Play**. You will hear silence — this is correct, because nothing has triggered a note yet.
9. Select the Instrument, scroll the parameter panel down to the **Output** sub-node, and click **Test Audio**. You should hear a short tone at middle C — the button fires a note at full velocity for 0.2 seconds regardless of what is in the sequencer (`skald-ui/src/components/ParameterPanel.tsx::renderNodeParameters`).
10. Click **Stop**.
11. Now load a finished patch: Sidebar → **📚 Examples Library** → the **🚀 Start Here** category → **1. Sequenced Bass** → **Load Project**.
12. Sidebar → **Play**. This time notes come from the sequencer dock at the bottom, not from Test Audio, and you should hear a bassline loop.

That is the whole loop this manual assumes you can perform from here on: place nodes, wire them, wrap them, play them.

---

## The parameter panel and "expose"

Select a node and the parameter panel on the right shows its full set of controls — sliders, number boxes, and node-specific widgets like the ADSR's envelope graph or the Filter's XY pad. Next to most parameters is a small link-icon button, not a checkbox: clicking it toggles that parameter's **exposure** (`skald-ui/src/components/ParameterPanel.tsx::renderParameterControl`, tooltip text `Expose "<label>" to public API`). An exposed parameter becomes a named, range-clamped field on the generated processor with its own setter function, so your game can change it at runtime; an un-exposed one is baked into the generated code as a constant and can only change by regenerating. Exposed parameters also apply live in the preview with no rebuild, while everything else queues a short recompile. The Exporting chapter (`80-exporting-odin.md`) covers exactly what an exposed parameter turns into in the generated file and how your game code reaches it — this chapter only needs you to recognise the toggle when you see it.

---

## Save, Load, Import Patch, autosave and recovery

Skald's Graph Actions (Sidebar) give you four file operations, plus one that runs on its own:

- **Save File** writes your project as JSON. The shipped examples use the `.skald.json` extension by convention.
- **Open File...** ("Load") replaces your entire canvas with a file from disk. If you have unsaved changes, Skald asks you to confirm before it discards them (`skald-ui/src/hooks/nodeEditor/useFileIO.ts::defaultConfirmDiscard`).
- **Import Patch...** merges one or more saved patches into your *current* graph instead of replacing it — useful for pulling in a whole drum kit at once — and is treated as a normal edit, so Undo reaches it.
- **📚 Examples Library** opens the same Load/Import choice against the shipped example corpus rather than your own files (see below).

Every save carries a **session block** alongside the node graph: the project's `bpm`, `patternSteps`, `masterVolume` and `packageName`. Loading a file restores all four; an older save with no session block leaves your current settings untouched rather than resetting them to invented defaults (`skald-ui/src/hooks/nodeEditor/useFileIO.ts::applySaveData`).

Every save also carries a **version stamp**. If you try to open a file saved by a newer version of Skald than the one you are running, it is refused outright with a message naming both version numbers and telling you to update, rather than being partially and silently misread (`skald-ui/src/utils/saveMigrations.ts::migrateSaveFile`). Files from older versions are migrated forward automatically as they load.

**Autosave and recovery.** A short idle moment after each edit, Skald writes your working document to local storage — no explicit save required (`skald-ui/src/hooks/nodeEditor/useAutosave.ts::useAutosave`). If a crash or a closed window leaves a recovery record behind, the next launch offers it back to you in a banner across the top of the canvas, with **Restore** and **Dismiss** buttons; restoring it resets your undo history exactly the way Load does, because whatever the canvas held before the crash is not a state you can undo back to.

**Undo and redo** cover the graph, the wires, the sequencer tracks and the session settings as one combined history — a wiring change, a step you painted, and a BPM edit all sit on the same Ctrl+Z stack, in the order you made them, with the sidebar's Undo/Redo buttons showing how many steps are available.

**How Skald tells you what happened.** File operations report themselves two different ways, and it is worth knowing which is which. A Save, Load or Import result appears as a small banner across the top of the canvas that names what happened — "Saved to `<path>`", a dropped-duplicate-note count, an import summary — and a success message clears itself after a few seconds, while an error stays until your next file action (`skald-ui/src/app.tsx::notifyFileStatus`). That is different from the **Project Issues** banner, which reports problems with the graph itself — an unresolved parameter lock, a build that will fail — and is deliberately non-dismissible, because it describes something in your project that still needs fixing, not a one-off event (`skald-ui/src/components/ProjectIssuesBanner.tsx::ProjectIssuesBanner`).

---

## The Examples library

Sidebar → **📚 Examples Library** opens a browsable, searchable catalogue of every shipped patch, organised into categories: **🚀 Start Here**, **🎵 Songs & Loops**, **🎹 Instruments**, **🎮 SNES Kit** and **💥 Sound Effects** (`skald-ui/src/components/ExamplesModal.tsx::CATEGORIES`). Each entry offers **Load Project** (replaces your canvas) or **Import Patch** (merges into it).

**Start Here is the reading order.** It lists six examples, in the order they are meant to be opened, each teaching one new idea: a sequenced instrument, a playable graph with no sequencer, a percussion voice, a loose graph exporting as a one-shot SFX, a bus effect (Delay), and finally a full multi-instrument song (`examples/start-here/README.md`). The first of the six is what a brand-new install loads automatically (see "First launch"). Work through them before wandering the rest of the library.

Below the category tabs, a row of **tag chips** (`percussion`, `bass-synth`, `sfx`, `lead`, `pad`, `midi`, `sequenced`, and more) narrows the library further; click one to show only examples carrying it, click a second to narrow further (an example must carry every selected tag), and click either again to clear it. Tags are derived automatically from each file — its folder, whether it carries a MIDI Input node, whether its sequencer tracks hold any notes, and so on (`skald-ui/src/utils/exampleTags.mjs::deriveTags`) — so nothing needs to be hand-labelled for a tag to appear, and an example predating this feature is simply untagged rather than missing. The search box also matches tags, so typing `sfx` finds the same examples as clicking the `sfx` chip (`skald-ui/src/components/ExamplesModal.tsx::filteredExamples`).

---

## Keyboard shortcuts and drag modifiers

Every shortcut in the app, taken from the in-app legend (press **?** at any time to open it):

| Shortcut | Action |
|---|---|
| `Ctrl/Cmd + Z` | Undo the last edit (graph, sequencer and transport share one history) |
| `Ctrl/Cmd + Shift + Z` / `Ctrl + Y` | Redo |
| `Ctrl/Cmd + C` / `V` | Copy / paste selected nodes |
| `Delete` / `Backspace` | Delete selected nodes & wires |
| `Shift` or `Ctrl` + click | Multi-select nodes |
| `[` and `]` | Cycle through nodes |
| `A W S E D F T G Y H U J K` | Play the patch live (one octave, C upward) — the preview must be running |
| `Z` / `X` | Shift the QWERTY keyboard down / up an octave |
| `,` and `.` | Step through the selected node's ports (input and output sockets) |
| `Enter` (on a port) | Start a wire at an output, then land it on an input |
| `Escape` | Cancel the wire, then drop the port focus |
| Double-click slider | Reset parameter to default |
| `Shift` + drag note (grid) | Edit note duration |
| `Ctrl` + drag note (grid) | Edit note velocity |
| `Alt` + drag note (grid) | Edit note probability |
| Right-click drag (grid) | Erase notes |
| `?` | Toggle this help |

(`skald-ui/src/components/ShortcutLegend.tsx::SHORTCUTS`.) The four "drag note (grid)" rows apply in the sequencer's step grid and piano roll, which the Sequencer chapter covers in full.

**Patching without a mouse.** `[` and `]` select a node; `,` and `.` then step through that node's ports, one at a time, with a ring drawn on the socket itself (`skald-ui/src/hooks/useGraphKeyboardTraversal.ts::portsOfNode`). A readout in the top-left corner names the port you are on. Press **Enter** on an output to anchor a wire — the socket goes amber — then `[` or `]` to the destination node, `,` / `.` to its input, and **Enter** again to connect. **Escape** drops the wire; a second **Escape** drops the port focus (`skald-ui/src/hooks/useGraphKeyboardTraversal.ts::useGraphKeyboardTraversal`).

Wires start at outputs and land on inputs, never the other way round, which is the same rule the mouse follows. The edge that appears is an ordinary edge: it goes through the same connect handler a drag ends in, so it is one `Connect wire` step on the undo stack and obeys the same refusal to wire a node to itself (`skald-ui/src/hooks/nodeEditor/useGraphState.ts::useGraphState`). `,` and `.` were chosen because React Flow already owns `Tab` (it moves focus between nodes) and the arrow keys (they nudge the selected node's position), so binding the port walker to either would be two features fighting over one keystroke.

**The letter keys are a keyboard.** `A` is middle C (MIDI 60) and the thirteen keys run up a chromatic octave to `K`, with the black keys on `W E T Y U` above the gaps — the layout Ableton Live and most trackers use. `Z` and `X` move that octave down and up, clamped so no key can leave the MIDI range (`skald-ui/src/hooks/useQwertyKeyboard.ts::QWERTY_SEMITONES`, `skald-ui/src/hooks/useQwertyKeyboard.ts::MIN_BASE_OCTAVE`). Notes sustain for as long as you hold the key, go to every Instrument in the project, and pass through the same scale quantiser a hardware MIDI keyboard's notes do, so the two always agree (`skald-ui/src/hooks/useQwertyKeyboard.ts::useQwertyKeyboard`). A small readout in the bottom-left corner of the canvas names the octave while you play.

The preview engine has to be running: press **Play** first. A letter key pressed with playback stopped does not start it — Play starts the transport as well as the engine, so it would launch the whole sequenced pattern underneath the note you wanted to hear — the readout says *press Play to hear it* instead (`skald-ui/src/hooks/useQwertyKeyboard.ts::useQwertyKeyboard`). Typing in any text field, and any `Ctrl`/`Cmd` chord, stays typing and stays a chord (`skald-ui/src/utils/keyboardTarget.ts::isTypingTarget`).

---

## On a phone or tablet

Skald's web build runs in a mobile browser, and below 720 CSS pixels of window width the editor folds itself into one column (`skald-ui/src/hooks/useViewport.ts::NARROW_MAX_WIDTH`). The node palette becomes a drawer that slides in from the left, the parameter panel becomes a sheet that rises from the bottom, and both start closed so the canvas gets the whole screen (`skald-ui/src/app.tsx::drawerSidebarStyles`, `skald-ui/src/app.tsx::sheetParameterStyles`). A four-button bar along the bottom of the canvas opens them: **☰ Nodes**, **▶ Play**, **⌫ Delete** and **⚙ Settings**. The sequencer dock keeps its own row underneath, so the transport is never covered by either panel.

**⌫ Delete** is there because on a desktop the only way to remove a node or a wire is the `Delete` key, and a phone has no `Delete` key. It removes whatever is selected, and lands on the undo stack exactly as the key does (`skald-ui/src/app.tsx::handleDeleteSelection`).

Everything on the canvas is a touch gesture: pinch to zoom, drag the background to pan, drag from a port to draw a wire, drag a node to move it. Dragging a node never also starts a selection box. Press the **?** button in the corner and the help panel leads with those gestures rather than with keyboard shortcuts (`skald-ui/src/components/ShortcutLegend.tsx::TOUCH_GESTURES`); the shortcut table is still printed underneath it, because a tablet with a keyboard paired reports a touch pointer and every shortcut still works there.

Where a control was drawn for a mouse, it grows for a fingertip — but only when the browser reports that the primary pointer *is* a fingertip, so a desktop is untouched down to the pixel (`skald-ui/src/hooks/useViewport.ts::COARSE_POINTER_QUERY`). Node ports get a 24-pixel hit area without being drawn any larger, so the wires still leave the sockets they appear to. The step grid stops shrinking its columns at 24 pixels instead of 10 and scrolls instead (`skald-ui/src/components/Sequencer/stepMetrics.ts::STEP_WIDTH_MIN_COARSE`), and because it scrolls, it now follows the playhead: a step that would fall off the edge is scrolled back into view (`skald-ui/src/components/Sequencer/stepMetrics.ts::scrollLeftForStep`). The piano roll's pitch lanes go from 20 pixels tall to 32, which is roughly the difference between hitting one semitone and hitting one of three (`skald-ui/src/components/Sequencer/stepMetrics.ts::NOTE_ROW_HEIGHT_COARSE`). Parameter sliders get a 28-pixel thumb.

The minimap is not drawn on a narrow screen: it costs about a third of a phone's canvas to save a pan gesture that is easier by finger than by mouse.

---

## Where sound goes: peak meter, clip LED and master volume

The sequencer dock's Master section carries a stereo peak meter — two bars reading −60 to 0 dBFS with a falling peak-hold tick — and a **CLIP** LED that latches on the instant any sample reaches 0 dBFS and stays lit until you click it (`skald-ui/src/components/Visualization/PeakMeter.tsx::PeakMeter`). It is tapped from the same signal your exported game gets: the worklet's mixed, faded, soft-limited output, after the master volume fader and the `tanh` soft limiter, not some separate approximation. Next to it is the **master volume** slider, which multiplies every Instrument's summed output before that limiter — pull it down if the clip LED keeps lighting on a busy project rather than expecting individual Instruments to leave headroom for you.

A patch that goes actively unstable — a self-feeding Reverb/Delay, a resonant Filter driven past its clamp, a Mapper output gone out of range — used to just get quieter or fall silent with no indication why: the master limiter's own NaN/Inf guard swallows the fault before it reaches your speakers. An amber **⚠ N** badge next to CLIP now appears the moment that has happened one or more times since the last Play — N is the running count of samples the DC-blocker/limiter stage had to flush to silence (`skald-ui/src/utils/meter.ts::NonfiniteCounts`). It clears on the next Play (a freshly built preview has flushed nothing yet), not on click — unlike CLIP, there is no "acknowledge and keep playing" state for a patch that is producing invalid audio, because the fix is in the graph, not in the meter.

---

## Generate Code

The sidebar's Generation section holds a **Package Name** field — it becomes the `package` declaration at the top of the generated Odin file (`skald-backend/main.odin::package_name`), so it needs to be a legal Odin package name, not a display label — a button that opens a file picker for the output location, and the primary button itself, labelled **Download Code** (it read "Generate Code" in earlier versions, before Play started running the real generator on every edit — the name changed because writing the file to disk is now the only thing left for this button to do; the preview already ran it) (`skald-ui/src/components/Sidebar.tsx::Sidebar`). Clicking it writes the same Odin the preview is already playing to the output file you chose, under the package name you typed above it. The Exporting chapter (`80-exporting-odin.md`) covers what that file contains and how a game links against it — this chapter only needs you to find the button.

---

## Reading order for the rest of this manual

Read the Foundations chapter next (`00-foundations.md`) — it defines every audio term this manual uses and explains how a graph becomes sound. Then the Instrument chapter, because it is the container every other chapter assumes your patch is already inside. From there, the node chapters teach one node family at a time — sources, modulation, shaping, space, routing — in the order a synthesiser is usually built: source, then filter, then amplifier, then colour and space. The worked-example chapters (a bass teardown, a complexity ladder, a full build) show those pieces combined into real patches. Finish with the Exporting chapter, which is where a sound designer's finished Instrument becomes a game programmer's linkable API.

---

## Terms introduced

- **Instrument** — the container you wrap a finished patch in. Only Instrument nodes produce audio, in the preview and in the export.
- **Handle** — the small dot on a node's edge that a wire connects to; inputs on the left, outputs on the right.
- **Expose** — mark a parameter as a named, runtime-settable field on the generated code instead of a baked-in constant.
- **Session** — the project-wide settings (tempo, pattern length, master volume, package name) saved alongside the node graph.
- **Autosave / recovery** — a background copy of your unsaved work, offered back to you after a crash or closed window.
- **Save version** — the number stamped in every save file that tells Skald how to read it; a file from a newer version is refused rather than guessed at.
- **Peak meter / clip LED** — the stereo level display and over-0-dBFS indicator in the sequencer dock, tapped from the exact signal the export produces.
- **Download Code** — the button that writes the currently-previewed patch to an Odin source file on disk.

Known issues affecting the editor are tracked in KNOWN-ISSUES.md under **Editor**.
