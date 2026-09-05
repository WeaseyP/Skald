# Instrument / Group containers

> An Instrument is a box you draw around a finished patch to say "this is one playable sound" — and Skald then makes as many private copies of what's inside as it needs so you can play chords with it.

## What it is

Everything else in this manual is about making *one* sound. An oscillator makes one tone. An envelope shapes one note. A filter carves one signal. Wire them together and you have a patch that can play exactly one note at a time, because there is exactly one of each part.

Real instruments do not work like that. Press three keys on a piano and three hammers hit three strings, and each string has its own decay. Press three keys on a synthesiser and you need three oscillators, three filters and three envelopes, each running its own copy of the same recipe at its own pitch and its own point in its own envelope. That bundle — one oscillator, one filter, one envelope, one amplifier, everything needed to sound exactly one note — is called a **voice**. The number of voices an instrument has is its **polyphony**.

This is not a metaphor; it is literally how polysynths were built. The Polymoog gave every key on the keyboard its own filter, amplifier and contour generator, which was ruinously expensive and unreliable. The Oberheim Four-Voice fixed the economics by building only four complete voice circuits and adding a **voice allocation unit** — a small piece of logic that watches the keyboard and decides which of the four voices should play each incoming note [Source: https://www.soundonsound.com/techniques/polyphony-digital-synths]. Every polysynth since, hardware or software, is the same idea: **design one voice, duplicate it N times, and hand notes out to whichever copy is free.**

Software says this even more plainly. In Faust, "the DSP code written in the `process` line will be duplicated for each voice of the synth" — you write one voice and set a Poly Voices number [Source: https://ccrma.stanford.edu/courses/250a-winter-2020/labs/1/]. In Max/MSP the classic teaching example instantiates eight copies of one subpatch and routes each note-on to a copy [Source: https://music.arts.uci.edu/dobrian/maxcookbook/polyphony-multiple-copies-msp-subpatch]. Skald's Instrument node is exactly this: **the patch inside it is the voice recipe, and `voiceCount` is how many copies get built.**

Two consequences fall straight out of that design, and they are the two things beginners get wrong.

The first is **voice stealing**. If you have eight voices and you play a ninth note, something has to give. The synth picks a currently-sounding voice, cuts it off, and reuses it. Which one it picks is a real musical decision: the polite convention is to first look for a voice already in its release phase, because a note that is already fading out is the one a listener is least likely to miss, and after that to take the note that has been held longest [Source: https://electronicmusic.fandom.com/wiki/Voice_stealing]. The alternative — refusing the new note until a voice frees up, "first-note priority" — is often *worse*, because a note that simply never sounds is more jarring than one that got cut short [Source: https://www.soundonsound.com/techniques/polyphony-digital-synths]. Skald steals the oldest *releasing* voice first, falling back to the oldest voice overall only when nothing is releasing (or the graph has no ADSR at all); the detail of how, and why it does not click, is in "Under the hood".

The second is **not everything should be duplicated**. A reverb is a room. Eight voices playing into eight separate rooms is not a chord in a hall, it is eight people in eight bathrooms, and it costs eight times the CPU for a worse result. Faust makes this an explicit feature: declare an `effect` line and it is instantiated *once* across all voices rather than duplicated, "significantly saving computation" [Source: https://ccrma.stanford.edu/courses/250a-winter-2020/labs/1/]. Skald does the same split automatically — see "Why you patch it this way".

The Instrument node also owns two things that only make sense once more than one copy of a voice exists.

**Unison** builds several copies of each *oscillator* inside a single voice and pushes them slightly apart in pitch. Two tones a few Hz apart do not sound like two tones; they sound like one tone whose loudness pulses, because they drift in and out of phase with each other. The pulse rate is simply the difference between the two frequencies: 440 Hz against 443 Hz gives 3 pulses a second [Source: https://en.wikiversity.org/wiki/Beat_(acoustics)]. Instrument designers have known for decades that the sweet spot is roughly **one to five beats per second** — slow enough to hear as shimmer rather than wobble, fast enough to feel alive. That is the "celeste" or chorus effect [Source: https://image-ppubs.uspto.gov/dirsearch-public/print/downloadPdf/4080861]. Stack seven detuned sawtooths this way and you have the Roland JP-8000 supersaw: one centre saw in tune, six spread around it [Source: https://blog.faderpro.com/techniques/supersaw-how-make-iconic-sound/].

**Glide** (also called portamento, or "slide" on a TB-303) makes pitch travel continuously from the old note to the new one instead of jumping. On a monosynth this is the defining gesture of an acid bassline: the 303's sequencer had a dedicated slide button that drifted the oscillator from one step's pitch to the next [Source: https://www.attackmagazine.com/technique/passing-notes/legato-synths-glide-slide-portamento/2/]. Glide is fundamentally a *reuse* behaviour: it only means something when a voice that was already playing a pitch is asked to play a new one. Skald implements it exactly that way, and that is why glide and polyphony interact in a way that will surprise you the first time.

## What it looks like in Skald

The Instrument is **not** in the sidebar's Nodes palette — that list runs from Oscillator to MIDI Input and contains no container types (`skald-ui/src/components/Sidebar.tsx::paletteNodes`). You do not drag an Instrument in. You *make* one out of nodes you already patched.

Select some nodes on the canvas, then use the sidebar's **Grouping** section (`skald-ui/src/components/Sidebar.tsx::Sidebar`):

- **Create Instrument** — prompts for a name, then swallows the selected nodes into a new Instrument node. Enabled for a selection of one or more nodes.
- **Create Group** — wraps the selection in a visual container only. Also enabled for one or more nodes; the sidebar's own tooltip on the disabled state reads "Select one or more nodes to create a group".
- **Explode Instrument** — the inverse; enabled only when exactly one Instrument is selected (`skald-ui/src/app.tsx::EditorLayout`).

### What "Create Instrument" actually does

The selected nodes are **moved**, not copied, into the Instrument's `subgraph`, and renumbered `1, 2, 3…` (`skald-ui/src/hooks/nodeEditor/useNodeComposition.ts::useNodeComposition`). Wires that were entirely inside the selection become subgraph connections. Wires that *crossed* the selection boundary get an automatic port: an `InstrumentInput` node for each incoming wire and an `InstrumentOutput` for each outgoing one, and the main-canvas wire is re-pointed at a matching handle on the new Instrument node. Those ports are keyed by *(internal node, handle)* rather than by handle name, because keying by name alone used to merge two unrelated wires that both happened to be called `input` into one port and silently cross-wire the patch.

The new node is created with these values regardless of what you had selected (`skald-ui/src/hooks/nodeEditor/useNodeComposition.ts::useNodeComposition`): `voiceCount: 8`, `glide: 0.05`, `unison: 1`, `detune: 5`, `voiceStealing: 'oldest'`.

### Handles

`InstrumentNode.tsx` renders one handle per named port, and falls back to a single generic pair when there are none (`skald-ui/src/components/InstrumentNode.tsx::InstrumentNode`):

| Handle | Side | Meaning |
|---|---|---|
| one target handle per name in `data.inputs` | left | External audio into the corresponding `InstrumentInput` inside. Reaches the DSP via `<Foo>_feed_input` (`skald-backend/core/codegen_processor.odin::generate_processor_code`). |
| `input` (labelled **In**) | left | The fallback when `data.inputs` is empty. |
| one source handle per name in `data.outputs` | right | Audio out of the corresponding `InstrumentOutput`. |
| `output` (labelled **Out**) | right | The fallback when `data.outputs` is empty. |

Port names are derived from the handle they replaced, so two ports on the same instrument can end up both called `output` if you were not paying attention when you wired the original chain — see KI-009 and KI-010 for the rough edges this creates. Double-click the title bar to rename the instrument (`skald-ui/src/components/InstrumentNode.tsx::InstrumentNode`). The name is a **display label only** since packet C3; see "Why you patch it this way" for the Export ID, which is the identity your game actually links against.

### What it can and cannot connect to

This is the single most important structural fact in Skald, and it is easy to miss:

**Only Instrument nodes become audio.** Both the export path and the live preview build their project description by filtering the canvas down to `n.type === 'instrument'` (`skald-ui/src/utils/projectSerializer.ts::getInstrumentNodes`, `::isInstrumentNodeType`). A beautiful oscillator-into-filter-into-output chain sitting loose on the main canvas, *alongside at least one real Instrument elsewhere*, produces **silence** — in the preview and in the export, because the serialiser has no reason to look at it. The one exception is a canvas with **no** Instrument node at all: since packet B6-1 (SKB-019), that whole loose graph is auto-wrapped into a single synthetic SFX asset named `Asset` and played rather than refused (`skald-ui/src/utils/projectSerializer.ts::buildProjectData`) — convenient for opening an old save, but not a substitute for wrapping deliberately, since the auto-wrapped version is not a node you can open, rename, or give an Export ID.

A **Group** is purely cosmetic. `GroupNode.tsx` draws a translucent box, finds its children by `parentId`, and derives labelled handles by inspecting which wires cross its boundary (`skald-ui/src/components/Nodes/GroupNode.tsx::GroupNode`). It is a very good tidying tool. It is not an asset: the serializer never emits it, and even if a Group reached the backend, the type normaliser maps `"group"` to the empty string and the graph builder skips it (`skald-backend/core/json.odin::normalize_node_type`, `::build_graph_from_raw`).

### Rate

The Instrument is not a signal processor and has no rate of its own. It is a *container plus a loop bound*. What it does is decide how many times the voice loop runs each sample and where the per-voice work stops and the shared bus work begins (`skald-backend/core/codegen_processor.odin::generate_processor_code`).

## The controls

Select the Instrument node and the right-hand parameter panel shows five instrument-level controls, then an **Internal Nodes** heading followed by the full parameter set of every node inside the subgraph (`skald-ui/src/components/ParameterPanel.tsx::ParameterPanel`). The Volume box is also duplicated on the node body itself (`skald-ui/src/components/InstrumentNode.tsx::InstrumentNode`).

| Parameter | Range | Default | Unit | What it does to the sound |
|---|---|---|---|---|
| `name` | text | `New Instrument` | — | Display label only since packet C3; the exported symbol prefix comes from the Export ID (see "Why you patch it this way"). |
| `volume` | 0 – 1 | 1.0 | linear gain | Output trim for the whole asset, applied at the very last line of `_process` — and, since packet B1, a genuine runtime field with its own setter (see the Output chapter). |
| `voiceCount` | 1 – 32 | 8 | voices | How many independent copies of the subgraph exist. |
| `glide` | 0 – 5 | 0.05 | s | How long a reused voice takes to slide from its old pitch to the new one. |
| `unison` | 1 – 16 | 1 | copies | How many detuned copies of **each Oscillator or Wavetable node** run inside every voice (`skald-backend/core/codegen_nodes.odin::generate_oscillator_code`, `skald-backend/core/codegen_nodes.odin::generate_wavetable_code`; FM Operators and Noise are not stacked). |
| `detune` | 0 – 100 | 5 | cents | Total spread of the unison stack: ±this many cents around the true pitch. |

A sixth field, `voiceStealing: 'oldest' | 'newest'`, is carried in every Instrument's data and written whenever `useNodeComposition` creates one, but no control in the parameter panel renders it, and the generator's steal order is fixed logic rather than something this field can steer — see KI-018.

Sources: the defaults are `skald-ui/src/definitions/node-definitions.ts::defaultInstrumentParams`; the types are `skald-ui/src/definitions/types.ts::InstrumentParams`; the slider ranges are `skald-ui/src/components/NodeParameterControls.tsx::NodeParameterControls`; the export clamps are `skald-ui/src/utils/projectSerializer.ts::buildProjectData`; and — since packet C2 — all four numeric ranges are authored exactly once, in the schema's fallback rows for parameters the editor treats as instrument-level (`schema/nodes.json::generic`), and rendered into both the editor's TypeScript and the generator's Odin from that single source. The old framing of two independently maintained tables that could quietly disagree no longer applies to these four; where a genuine editor/generator gap remains for an *Instrument*-level control, it is `voiceStealing` (KI-018) and the expose mechanism (KI-019) below, not the ranges.

### Voice Count — what you hear as you change it

- **1.** Monophonic. Every new note lands on the same voice and cuts the previous one. This is not a limitation, it is a *style*: basses, 303 leads and 808 sub lines are monophonic on purpose, because overlapping low notes turn into mud. It is also the only setting at which Skald's glide is guaranteed to fire on every note.
- **2–4.** Enough for two-note harmony or for a mono line whose release tails can overlap the next note without being chopped. Watch for stealing on fast runs.
- **6–12.** Comfortable chord territory. The 8 default plays four-note chords with headroom for the previous chord's release tail.
- **16–32.** Pads, held chords over a sustain pedal, and anything with a long release. Costs proportionally: everything inside the subgraph runs `voiceCount` times per sample (`skald-backend/core/codegen_processor.odin::generate_processor_code`).

The musical zone is "one more than the largest chord you play, plus room for the tail". Do not just set 32: an idle voice is skipped, so unused voices are nearly free at runtime, but every voice permanently occupies its own copy of the state struct and the *active* ones all sum into the output with **no division by the voice count** (`skald-backend/core/codegen_nodes.odin::generate_graph_output_adds`). Eight loud voices really are eight times as loud as one, and the per-asset soft limiter catches that with a `tanh` rather than a divide (`skald-backend/core/codegen_project.odin::emit_soft_limit_proc`). Note that Max/MSP's teaching patch explicitly scales by 1/8 at this point [Source: https://music.arts.uci.edu/dobrian/maxcookbook/polyphony-multiple-copies-msp-subpatch]; Skald does not, deliberately, so that one note played on a 16-voice instrument is not 16 times quieter than it should be. The price is that you must manage headroom yourself with **Volume**.

### Glide — what you hear as you sweep it

- **0.** Off. Pitch snaps. The glide code is not even emitted — the whole block is conditional on `instrument.glide > 0.0` (`skald-backend/core/codegen_processor.odin::generate_processor_code`).
- **0.01 – 0.05 s.** Not heard as a slide. Heard as a *softened attack* — the pitch arrives so fast it just removes the click of the jump. Useful on leads.
- **0.06 – 0.15 s.** The classic slide. This is the 808/303 zone; the sub-808 example ships at **0.09 s** (`examples/instruments/bass/sub-808-glide-bass.skald.json::nodes`). Practitioner emulations of the 303 typically default around 60 ms and expose 1–200 ms [Source: https://github.com/thorinside/nt_303].
- **0.2 – 0.6 s.** Overtly expressive. Theremin, whale song, sci-fi.
- **Above ~1 s.** With any normal note rhythm the pitch never arrives before the next note redirects it. You get a wandering smear with no stable pitch at all. Try it once, on purpose — see the exercise.

**The thing you must know about glide in Skald:** it fires *only when a voice is reused*, never on a fresh voice (`skald-backend/core/codegen_processor.odin::generate_processor_code`). The code's own comment explains why — gliding every new note from whatever the previous note was would smear chords into nonsense. The practical effect is that **glide is a monophonic feature here**. At `voiceCount: 1` every note reuses the one voice, so every note glides. At `voiceCount: 8`, a note only glides once all eight voices are already busy, which is not a musical rule and will feel random. If you want glide, set `voiceCount` to 1.

Standard practice is slightly different: most synths tie portamento to *legato* — glide when the new note overlaps the previous one, snap when it doesn't [Source: https://www.attackmagazine.com/technique/passing-notes/legato-synths-glide-slide-portamento/2/]. Skald's "glide on reuse" is equivalent to that only in the mono case.

### Unison and Detune — what you hear as you sweep them

These two only work together. `unison` on its own does nothing audible; `detune` on its own does nothing at all unless `unison > 1`.

The spread is even and symmetrical: copy *i* out of *n* is offset by `(i/(n-1) - 0.5) * 2 * detune` cents (`skald-backend/core/codegen_nodes.odin::generate_oscillator_code`). So `unison: 7, detune: 30` gives you −30, −20, −10, **0**, +10, +20, +30 cents — one copy exactly in tune and three pairs around it, which is precisely the JP-8000 supersaw layout [Source: https://blog.faderpro.com/techniques/supersaw-how-make-iconic-sound/]. Odd unison counts have an in-tune centre; **even counts do not**, so at `unison: 2` the whole sound is detuned and nothing holds the true pitch.

- **unison 1.** Off. One oscillator. Tight, focused, correct for bass and for anything that has to sit precisely in a mix.
- **unison 2–3, detune 5–12.** Subtle thickening. On a note at A4 (440 Hz), adjacent copies 10 cents apart beat at about 2.5 Hz — right inside the 1–5 beats/second zone that reads as pleasant chorus rather than wobble [Source: https://image-ppubs.uspto.gov/dirsearch-public/print/downloadPdf/4080861].
- **unison 5–8, detune 20–40.** Big, wide, trance-lead territory. Seven is the traditional magic number and the point of diminishing returns [Source: https://blog.faderpro.com/techniques/supersaw-how-make-iconic-sound/]. Skald's supersaw example uses exactly `unison: 7, detune: 30` (`examples/instruments/leads/supersaw-hypersaw-lead.skald.json::nodes`).
- **detune above ~50 cents.** Half a semitone of spread. The copies stop fusing into one pitch and start sounding like a badly tuned choir; the effect turns dissonant rather than lush.

Two Skald-specific facts that change how you use these.

**Detune is worth much less on bass than on leads.** Beat rate is a *frequency difference*, but detune is specified in cents, which is a *ratio*. Ten cents at A4 (440 Hz) is 2.5 Hz of beating. The same ten cents at C1 (32.7 Hz) is 0.19 Hz — one pulse every five seconds. That is why the 808 example ships with `unison: 1, detune: 0` and the supersaw ships with 7 and 30. If you want width on a sub, get it from a separate layer an octave up, not from detune.

**Unison applies to Oscillator nodes only.** The unison loop lives in `generate_oscillator_code` (`skald-backend/core/codegen_nodes.odin::generate_oscillator_code`). FM Operator and Wavetable also run a unison loop with the same spread formula, but Noise is single-copy no matter what `unison` says. Every unison-capable node pays the same multiplicative CPU cost; a bell instrument built purely from Noise pays nothing for a high `unison` and gains nothing either.

**Unison costs CPU multiplicatively.** Per sample, each unison-capable node runs `voiceCount × unison` times. `voiceCount: 16` with `unison: 7` is 112 evaluations per node per sample.

Both `unison` and `detune` start every copy at the same phase, so all copies of a fresh voice's oscillator begin perfectly aligned and only drift apart as their (slightly different) frequencies accumulate phase at different rates — a design choice, not an oversight; see **What Skald deliberately does not do** for what randomised unison phase would buy you and why Skald does not offer it.

### Volume

Applied as a plain multiply on both channels at the last line of the instrument's `_process`, and — since packet B1 — read from a genuine runtime field rather than baked in as a literal, with a dedicated `<Foo>_set_volume` setter (`skald-backend/core/codegen_processor.odin::generate_processor_code`). Use it to balance assets against each other *before* they hit either soft limiter, which will audibly squash a hot instrument rather than clip it (`skald-backend/core/codegen_project.odin::emit_soft_limit_proc`). The serializer floors the value at 0.001 rather than allowing a true 0, because the backend reads an exact 0 as "field absent, default to unity" (`skald-ui/src/utils/projectSerializer.ts::buildProjectData`, `skald-backend/core/json.odin::normalize_legacy_parameters`). Muting is the sequencer track's job, not this control's.

### What "expose" does, and why you would use it

Next to most parameters in the panel there is a small link button (`skald-ui/src/components/ParameterPanel.tsx::ParameterPanel`). Clicking it adds the parameter's name to that node's `exposedParameters` list.

Exposing turns a baked-in constant into a **live, named, runtime-settable field on the generated processor**. Concretely, at codegen time every exposed parameter on a node *inside* an Instrument's subgraph gets:

1. A real `f32` field on the `<Foo>_Processor` struct, initialised to the value you left in the editor.
2. A typed setter `<Foo>_set_<name>(p, value)` that **clamps to the range table** before writing.
3. A string-keyed `<Foo>_set_param(p, "name", value)` dispatch, plus a `"<nodeId>::<param>"` alias so several nodes exposing the same name stay individually addressable.
4. An entry in `<Foo>_PARAMS`, a static table of `{name, min, max, default, unit}` your game's tooling or debug overlay can iterate to discover what the asset offers.

(All four emitted together in `skald-backend/core/codegen_processor.odin::generate_processor_code`.)

That is the whole point. An unexposed parameter is a number frozen into the generated Odin; changing it means regenerating and rebuilding. An exposed one is a knob your game can turn every frame — filter cutoff following the player's speed, reverb mix rising as they walk into a cave, distortion drive tracking engine RPM. Exposure is also what makes a value editable live in the preview without a full rebuild and what lets the sequencer's per-step P-locks target it (`skald-ui/src/utils/projectSerializer.ts::buildProjectData`, `skald-backend/core/codegen_project.odin::generate_sequencer_logic`).

The 808 example exposes generously: the oscillator's `amplitude`, the filter's `cutoff` and `resonance`, all five envelope controls, and the saturator's `drive`, `tone` and `mix` (`examples/instruments/bass/sub-808-glide-bass.skald.json::nodes`).

**Exposure only does something on nodes inside the subgraph.** The Instrument's own five controls — Volume, Voice Count, Glide, Unison, Detune — each show the same link button, because the panel wrapper defaults every parameter to exposable and the Instrument's own case never overrides that. Clicking it writes into the Instrument's `exposedParameters`, and nothing downstream ever reads that list for these five names: the serialiser emits `voice_count`, `glide`, `unison`, `detune` and `volume` as plain structural fields regardless, and the generator's exposure walk only inspects nodes inside the subgraph (KI-019). Three of the five — Voice Count, Glide, Unison — could not become runtime parameters through this mechanism even in principle: they size arrays or decide whether whole blocks of code exist, so a value that arrived after codegen would have nothing to write into. The other two are more interesting. `Volume` already has a real runtime setter, `<Foo>_set_volume` (packet B1) — it simply arrives through an unconditional path unrelated to this checkbox, so ticking the link icon still visibly does nothing even though the capability exists. `Detune` could in principle be exposed with no structural change at all, and currently is not.

## Try it (hands-on)

We will use `examples/instruments/bass/sub-808-glide-bass.skald.json` — one Instrument, one voice, one sine, and a glide that is doing all the musical work. About eight minutes.

**Setup.** Sidebar → **Graph Actions** → **Open File...**, and open `examples/instruments/bass/sub-808-glide-bass.skald.json`. You should see a single node on the canvas titled **808 Glide Sub**, and a sequencer track of the same name. The session is 140 BPM, 16 steps, master volume 0.75.

1. **Press Play and listen once through.** Five notes: C1 held long, up to G1, back to C1, up to F1, and finishing on C2 (MIDI 24, 31, 24, 29, 36 — `examples/instruments/bass/sub-808-glide-bass.skald.json::sequencerTracks`). Every pitch change *slides*. Nothing in the subgraph is doing that: the subgraph is just a sine oscillator, a 180 Hz lowpass, an envelope and a gentle saturator. The slide is coming from the Instrument container.

2. **Look at where the sound actually lives.** Click the **808 Glide Sub** node. The right-hand panel shows the five instrument controls, then **Internal Nodes**: Sine Sub, Tame Highs, Long Amp, 808 Saturation, Output. That list *is* the voice. Skald will build `voiceCount` private copies of it.

3. **Kill the glide, then bring it back.** With the instrument still selected, set **Glide (s)** to `0` and let the loop go round. The pitch now steps. It sounds like five separate notes instead of one moving bass. Set it back to `0.09` and hear the phrase re-form. That one number is the difference between "a bassline" and "an 808 line".

4. **Push glide too far — break it.** Set **Glide (s)** to `5.0` (the slider's maximum). Listen for a full loop. The pitch never reaches any of its targets — each new note grabs the slide mid-journey and redirects it, so you hear a continuous seasick wander with no notes in it at all. This is the failure mode that teaches the concept: glide is a *race* between the slide time and the note rhythm. At 140 BPM a 16th note is 0.107 s, so anything much past ~0.15 s starts eating the next note. Set it back to `0.09`.

5. **Now the important one: turn the instrument polyphonic.** Set **Voice Count** to `8`. Play the loop.

   Two things happen at once. First, **the glide vanishes completely.** Second, the low end goes thick and slightly muddy. Both come from the same cause: with eight voices available, each new note gets its own *fresh* voice instead of reusing the one that was playing, and fresh voices start exactly on pitch (`skald-backend/core/codegen_processor.odin::generate_processor_code`). No reuse, no glide. Meanwhile the old note's 0.5 s release tail is still ringing underneath the new one, so C1 and G1 overlap and their sub frequencies pile up. This is the polyphony lesson in one slider: **polyphony is not "better", it is a different instrument.** Basses are mono for a reason. Set **Voice Count** back to `1`.

6. **Watch a voice get stolen.** Leave **Voice Count** at `1` and set **Glide (s)** to `0`. Now open the sequencer and shorten the first note (step 0) from 6 steps to 1 step. Play. The note at step 0 now ends almost immediately but its release tail continues; at step 6 the new note still has to take that same single voice — with only one voice there is nothing to choose between, so this does not exercise the release-first tier, only the reuse-and-glide path you already saw. Listen closely to the transition — there is no click. Skald deliberately hands the stolen voice's *live* envelope level to the new note's attack ramp instead of snapping to zero and does not reset the oscillator phase or filter state on a steal (`skald-backend/core/codegen_processor.odin::generate_processor_code`). Undo the note-length change.

7. **Add unison, and discover it does nothing — break it.** Set **Unison Voices** to `8`, leave **Detune (cents)** at `0`. Play. It sounds *identical*. It is identical: with zero detune, all eight copies run at the same frequency from the same start phase, get summed, and then divided by eight (`skald-backend/core/codegen_nodes.odin::generate_oscillator_code`). You have just multiplied the oscillator's CPU cost by eight for a bit-for-bit identical output. Unison without detune is not a thing.

8. **Add detune, and discover it barely helps.** Now push **Detune (cents)** to `30` — the supersaw value. On a C1 sub you will hear almost nothing: adjacent copies are only 8.6 cents apart, which at 32.7 Hz is one beat every six seconds. Push detune to the maximum `100`. *Now* you hear it, and it is horrible — a full semitone of spread on a sub turns a pitch into a low growling cluster and the fundamental stops being identifiable. This is the detune lesson: **cents are a ratio, beating is a difference, so the same detune is dramatic on a lead and inaudible on a bass.** Set **Unison Voices** back to `1` and **Detune** back to `0`.

9. **See the contrast.** Load `examples/instruments/leads/supersaw-hypersaw-lead.skald.json`. Same two controls, different octave: `unison: 7, detune: 30` at MIDI 64–72. Set **Unison Voices** to `1` and play — thin, ordinary saw lead. Set it back to `7` and play — the whole thing widens and starts shimmering. That is the identical mechanism that did nothing on the 808.

10. **Balance it.** Back on the 808, set **Volume** to `1.0` and then to `0.3`. This is the trim that lets a hot asset sit under either soft limiter instead of fighting it (`skald-backend/core/codegen_processor.odin::generate_processor_code`, `skald-backend/core/codegen_project.odin::emit_soft_limit_proc`). Leave it at `0.78`.

## Why you patch it this way

**The Instrument is the outermost wrapper, always.** Nothing outside one makes sound unless it is the only thing on the canvas, in which case B6-1's auto-wrap plays it as a stand-in you cannot otherwise edit (`skald-ui/src/utils/projectSerializer.ts::getInstrumentNodes`, `::buildProjectData`). The normal workflow is: patch freely on the open canvas until it sounds right, select the whole chain, **Create Instrument**. If you find yourself with a silent preview and a canvas full of nodes next to an existing Instrument, this is almost certainly why.

**One Instrument = one game asset.** Each Instrument becomes its own namespaced processor with its own public API — `<Name>_trigger`, `<Name>_note_on` / `_note_off`, `<Name>_start` / `_stop`, `<Name>_set_param`, `<Name>_PARAMS` (`skald-backend/core/codegen_processor.odin::generate_processor_code`). So: one Instrument per distinct sound your game triggers. A footstep, a laser, a bass layer, a pad layer — four Instruments, not one.

**`<Name>` is the Instrument's Export ID, not its title.** The card carries an **Export ID** field (`skald-ui/src/components/InstrumentNode.tsx::InstrumentNode`); every generated symbol is prefixed with it, and the card prints the resulting `<ExportID>_trigger` so there is no guessing. Leave it empty and the prefix is derived from the display name exactly as older versions did — the placeholder shows what that is. Pin it once your game code links against the asset: renaming the instrument's title then never changes a symbol (`skald-backend/core/codegen_analysis.odin::instrument_export_prefix`). Two instruments pinned to one Export ID stop the build with a message naming both (`skald-backend/core/codegen_analysis.odin::find_export_prefix_conflict`), and the editor's issues banner says so as soon as it happens. A pasted or step-exported Instrument gets a fresh Export ID rather than its source's.

**Whether it exports as a one-shot SFX or a self-playing music layer is the card's Type setting.** *One-shot SFX* is fired by the game with `<ExportID>_trigger`; *Music layer* also runs its own sequencer track inside `<ExportID>_process`. *Auto* — what a file that never chose gets — still decides from whether an unmuted, non-empty sequencer track points at the Instrument at Generate time (`skald-backend/core/codegen_analysis.odin::detect_asset_type`). Older saves are given the type they would have been generated with when they are first opened, so pick a Type deliberately: deleting the last note from a track can no longer silently turn a music layer into an SFX.

**Inside, the canonical chain is source → shaper → amplifier → colour → Output.** The 808 example is the textbook form: Oscillator → Filter → ADSR → Distortion → Output (`examples/instruments/bass/sub-808-glide-bass.skald.json::nodes`). Every Instrument must end at an Output node (codegen type `GraphOutput`) or it produces silence — see KI-008.

**Order matters in a way that is enforced, not just advised.** Skald splits your subgraph into two domains (`skald-backend/core/codegen_analysis.odin::seed_bus_domain`):

- The **voice domain** runs `voiceCount` times per sample, once per active voice. Oscillators, envelopes, filters, MIDI nodes.
- The **bus domain** runs *once* per sample on the summed output of all voices. Delay and Reverb live here by definition, along with everything downstream of them.

The split exists because a Delay holds one shared buffer. Running it per-voice would divide its delay time by the number of active voices, bleed voices into each other's feedback, and cut the tail dead the instant the last voice ended. It is the same optimisation Faust exposes as its `effect` line [Source: https://ccrma.stanford.edu/courses/250a-winter-2020/labs/1/].

**Get the order wrong and codegen refuses to build.** Put an Oscillator or an ADSR *after* a Reverb and you get an explicit error naming the offending node, because a per-voice envelope has no meaning in a place where no single voice exists (`skald-backend/core/codegen_analysis.odin::compute_bus_domain`). This is deliberate: the earlier behaviour silently dropped those nodes, producing an asset that compiled cleanly and sounded wrong. So: **all pitch and envelope work first, then Delay/Reverb, then Output.** A Filter or Distortion is allowed on either side — put it before the reverb to shape each note, after it to shape the whole tail.

**Feeding an Instrument.** Two ways in. A **MIDI Input** node wired to the Instrument populates its MIDI config (`skald-ui/src/utils/projectSerializer.ts::buildProjectData`). An audio wire into an input handle becomes an `InstrumentInput`, reaching the DSP through `<Foo>_feed_input`, which is how you build an Instrument that is really an *effect* — a reverb bus your game routes other assets through (`skald-backend/core/codegen_processor.odin::generate_processor_code`).

**Group vs Instrument.** Use a Group when you want to tidy the canvas or annotate a section. Use an Instrument when you want sound. A Group does not make its contents audible, does not give them polyphony, and is discarded before codegen (`skald-backend/core/json.odin::normalize_node_type`, `::build_graph_from_raw`).

## Going further

**Layer instead of stacking unison.** Two Oscillator nodes inside one voice — a sine at pitch and a saw an octave up, mixed — gives you body plus bite from a single note and a single envelope. Add a Mixer to balance them. This costs `voiceCount × 2` oscillators, exactly the same as `unison: 2`, but you control both halves independently instead of getting two copies of the same thing.

**Give the second layer its own envelope.** The 808 example has one ADSR. Add a second, short one (attack 0.001, decay 0.06, sustain 0) on a noise or click layer and mix it in at low level: now the instrument has a *transient* separate from its *body*, which is how real percussive instruments work. Both envelopes live in the voice domain and both retrigger per note automatically.

**Use a second envelope as a modulator, not an amplifier.** The supersaw example does this: a dedicated `Filter Env` ADSR → a Mapper scaling 0–1 into 0–3500 Hz → the filter's `input_cutoff` (`examples/instruments/leads/supersaw-hypersaw-lead.skald.json::nodes`). Per-voice filter envelopes are one of the biggest expressiveness wins available, and they only work because each voice has a private filter and a private envelope.

**Series vs parallel inside the voice.** Series (osc → filter → dist) compounds: the distortion hears what the filter left behind. Parallel (osc → Mixer, and osc → dist → Mixer) blends: you keep the clean fundamental and add grit alongside it, which is usually better on bass because distortion tends to eat low end. The 808 example is effectively parallel already — its saturator runs at `mix: 0.22`, so 78% of what you hear is the clean signal (`examples/instruments/bass/sub-808-glide-bass.skald.json::nodes`).

**Shared reverb, not per-voice reverb.** Put one Reverb after the point where all voices sum. Skald does this for you automatically by domain-splitting, but knowing it lets you make the choice consciously: a filter before the reverb shapes each note, the same filter after it shapes the room.

**Expose the parameters your game will actually drive, and nothing else.** Every exposure is a struct field and a setter. Expose filter cutoff and reverb mix if the game modulates them; do not reflexively expose everything. `<Foo>_PARAMS` is a public contract, and a short one is easier for tooling and for whoever writes the game code (`skald-backend/core/codegen_processor.odin::generate_processor_code`).

**Pick `voiceCount` from the music, not from ambition.** Mono for basses and 303 leads, so glide works and low notes cannot pile up. 4–8 for plucks and keys. 12–16 for pads with long releases, where you need room for the tail of the previous chord underneath the new one.

**Velocity is already wired.** Each voice stores its note velocity and every ADSR scales by `(1 - velocitySensitivity) + velocitySensitivity × velocity` (`skald-backend/core/codegen_nodes.odin::generate_adsr_code`). The 808 sets 0.4 and the sequencer varies velocity from 0.7 to 0.95 (`examples/instruments/bass/sub-808-glide-bass.skald.json::sequencerTracks`). Raising velocity sensitivity toward 1.0 makes the instrument dramatically more dynamic for free.

## Under the hood

The Instrument node is not a DSP block. It is the thing that decides the *shape* of the generated Odin.

**The voice struct.** Every node in the subgraph contributes its private state fields to one `<Foo>_Voice_State` struct: oscillator phases, envelope stages, filter memory (`skald-backend/core/codegen_processor.odin::generate_processor_code`). The oscillator's phase is not a single float but an array sized by unison, `osc_<id>_phase: [unison]f32`. The processor then holds `voices: [voiceCount]<Foo>_Voice_State`. Bus-domain nodes are excluded and keep their state on the processor instead — that is the one-shared-reverb rule made concrete in the type system.

**Note on and voice allocation.** `<Foo>_note_on` scans for the first inactive voice. If there is none, packet C6-1 (SKB-030) applies a two-tier steal: it first looks for a voice whose every voice-domain ADSR has already left Attack/Decay/Sustain — one already fading toward silence — and, among those, takes the one that has been releasing longest; only when *nothing* is releasing (or the graph has no ADSR at all) does it fall back to the plain oldest-by-age rule the whole instrument used before C6-1 (`skald-backend/core/codegen_processor.odin::generate_processor_code`). Release-first beats plain oldest-note stealing because a note the player is still actively holding should not lose to one that was already on its way out; oldest-by-age beats round-robin because round-robin could steal the note that started one sample ago while a ten-second pad kept ringing. Pitch comes straight from the equal-temperament formula:

```odin
freq := 440.0 * math.pow(2.0, (f32(note) - 69.0) / 12.0)
```

**Why stealing does not click.** Before the voice is reset, the generator captures each envelope's live level, rescaling it by the remaining release fraction if it was already releasing. The new note's attack then ramps *from* that level rather than from zero, and oscillator phase, filter memory and tone state are only zeroed on a genuinely fresh voice (`skald-backend/core/codegen_processor.odin::generate_processor_code`). The result is a sample-continuous handover whichever tier stole the voice.

**Glide.** `note_on` bakes the instrument's glide time into the voice and sets the target pitch, but only points `current_freq` at the *old* pitch when the voice was stolen. The per-sample slide is a one-pole approach with a snap threshold:

```odin
glide_k := 1.0 / math.max(voice.glide_time * sample_rate, 1.0)
voice.current_freq += (voice.target_freq - voice.current_freq) * glide_k
if abs(voice.target_freq - voice.current_freq) < 0.1 do voice.current_freq = voice.target_freq
```

(`skald-backend/core/codegen_processor.odin::generate_processor_code`)

Note that this is exponential, not linear — the pitch moves fastest at the start and eases in. `glide_time` therefore behaves as a time *constant* rather than an exact arrival time; the 0.1 Hz snap is what guarantees it actually lands. The whole block is only emitted when glide > 0, so a zero-glide instrument pays nothing.

**Unison and detune.** Inside the oscillator generator, each copy gets an evenly-spaced cent offset and a frequency scaled by the standard cents-to-ratio conversion, and the copies are averaged:

```odin
detune_amount = (f32(i) / (f32(unison_count) - 1.0) - 0.5) * 2.0 * DETUNE_CENTS
detuned_freq  = base_freq * math.pow(2.0, detune_amount / 1200.0)
...
node_<id>_out = (unison_out / f32(unison_count)) * amplitude
```

(`skald-backend/core/codegen_nodes.odin::generate_oscillator_code`)

The `2^(cents/1200)` is the definition of a cent: 1200 of them per octave. The divide-by-N is why a unison stack does not get louder as you add copies — but because detuned copies drift out of phase, their sum is *less* than N times one copy, so a heavily detuned stack is measurably quieter than a single oscillator. Compensate with amplitude, not with unison.

**The per-sample loop.** `<Foo>_process` runs the sequencer once, then loops `voiceCount` times skipping inactive voices, ages each voice, applies glide, auto-releases envelopes whose duration has elapsed, runs every voice-domain node in topological order, and accumulates into `output_left`/`output_right`. A voice frees itself when all its envelopes reach Idle. Then the bus block runs once on the summed signal (`skald-backend/core/codegen_processor.odin::generate_processor_code`). Finally:

```odin
return skald_soft_limit(output_left * p.volume, output_right * p.volume)
```

(`skald-backend/core/codegen_processor.odin::generate_processor_code`; unclamped, without the limiter, on an instrument authored `limit: false`)

Above that, `project_process` sums every unmuted, already-limited instrument and applies `math.tanh(mixed * master_volume)` as a second soft-limit pass with a true ceiling of 1.0 (`skald-backend/core/codegen_project.odin::generate_project_code`, `::emit_soft_limit_proc`).

## Terms introduced

- **Voice** — one complete copy of a synth's signal chain: everything needed to sound exactly one note at one pitch with its own envelope position. In Skald, a voice is one instance of an Instrument's subgraph.
- **Polyphony** — how many voices an instrument has, i.e. how many notes it can sound simultaneously. Skald's `voiceCount`.
- **Monophonic** — polyphony of one. Each new note takes over the single voice.
- **Voice allocation** — the logic that decides which voice plays an incoming note.
- **Voice stealing** — cutting off a currently sounding voice so a new note can use it, because all voices are busy. Skald steals the oldest *releasing* voice first, falling back to the oldest voice overall.
- **Note priority** — the rule for choosing the victim: oldest, newest, lowest, highest, or "release-phase first".
- **Unison** — running several slightly detuned copies of the same oscillator inside one voice, to thicken the tone.
- **Detune** — how far apart, in cents, those unison copies are pushed.
- **Cent** — one hundredth of a semitone; 1200 cents to an octave. A *ratio*, not a fixed number of Hz.
- **Beating** — the slow pulsing in loudness you hear when two close frequencies are played together. Its rate equals the difference between them.
- **Chorus / celeste** — the pleasant shimmer produced by beating at roughly 1–5 pulses per second.
- **Supersaw** — a stack of around seven detuned sawtooths, popularised by the Roland JP-8000.
- **Portamento / glide / slide** — continuous pitch travel from one note to the next instead of a jump.
- **Legato** — playing a new note before releasing the previous one; on many synths this is the condition that enables glide.
- **Voice domain / bus domain** — Skald's split between per-voice DSP (runs once per active voice) and shared post-mix DSP (runs once per sample).
- **Exposed parameter** — a parameter promoted to a named, clamped, runtime-settable field on the generated processor.
- **Asset** — one exported Instrument, with its own namespaced public API. Either an SFX (one-shot) or a Music Layer (sequenced loop).

## Known issues

Defects that touch this chapter are tracked centrally in the **Known issues** chapter (`KNOWN-ISSUES.md`): KI-009, KI-010, KI-018, KI-019. Deliberate design limits — things Skald does not do on purpose — are collected in **What Skald deliberately does not do**.
