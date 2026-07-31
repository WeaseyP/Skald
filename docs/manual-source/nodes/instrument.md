# Instrument / Group containers

> An Instrument is a box you draw around a finished patch to say "this is one playable sound" — and Skald then makes as many private copies of what's inside as it needs so you can play chords with it.

## What it is

Everything else in this manual is about making *one* sound. An oscillator makes one tone. An envelope shapes one note. A filter carves one signal. Wire them together and you have a patch that can play exactly one note at a time, because there is exactly one of each part.

Real instruments do not work like that. Press three keys on a piano and three hammers hit three strings, and each string has its own decay. Press three keys on a synthesiser and you need three oscillators, three filters and three envelopes, each running its own copy of the same recipe at its own pitch and its own point in its own envelope. That bundle — one oscillator, one filter, one envelope, one amplifier, everything needed to sound exactly one note — is called a **voice**. The number of voices an instrument has is its **polyphony**.

This is not a metaphor; it is literally how polysynths were built. The Polymoog gave every key on the keyboard its own filter, amplifier and contour generator, which was ruinously expensive and unreliable. The Oberheim Four-Voice fixed the economics by building only four complete voice circuits and adding a **voice allocation unit** — a small piece of logic that watches the keyboard and decides which of the four voices should play each incoming note [Source: https://www.soundonsound.com/techniques/polyphony-digital-synths]. Every polysynth since, hardware or software, is the same idea: **design one voice, duplicate it N times, and hand notes out to whichever copy is free.**

Software says this even more plainly. In Faust, "the DSP code written in the `process` line will be duplicated for each voice of the synth" — you write one voice and set a Poly Voices number [Source: https://ccrma.stanford.edu/courses/250a-winter-2020/labs/1/]. In Max/MSP the classic teaching example instantiates eight copies of one subpatch and routes each note-on to a copy [Source: https://music.arts.uci.edu/dobrian/maxcookbook/polyphony-multiple-copies-msp-subpatch]. Skald's Instrument node is exactly this: **the patch inside it is the voice recipe, and `voiceCount` is how many copies get built.**

Two consequences fall straight out of that design, and they are the two things beginners get wrong.

The first is **voice stealing**. If you have eight voices and you play a ninth note, something has to give. The synth picks a currently-sounding voice, cuts it off, and reuses it. Which one it picks is a real musical decision: the polite convention is to first look for a voice already in its release phase, because a note that is already fading out is the one a listener is least likely to miss, and after that to take the note that has been held longest [Source: https://electronicmusic.fandom.com/wiki/Voice_stealing]. The alternative — refusing the new note until a voice frees up, "first-note priority" — is often *worse*, because a note that simply never sounds is more jarring than one that got cut short [Source: https://www.soundonsound.com/techniques/polyphony-digital-synths]. Skald steals the oldest voice; the detail of how, and why it does not click, is in "Under the hood".

The second is **not everything should be duplicated**. A reverb is a room. Eight voices playing into eight separate rooms is not a chord in a hall, it is eight people in eight bathrooms, and it costs eight times the CPU for a worse result. Faust makes this an explicit feature: declare an `effect` line and it is instantiated *once* across all voices rather than duplicated, "significantly saving computation" [Source: https://ccrma.stanford.edu/courses/250a-winter-2020/labs/1/]. Skald does the same split automatically — see "Why you patch it this way".

The Instrument node also owns two things that only make sense once more than one copy of a voice exists.

**Unison** builds several copies of each *oscillator* inside a single voice and pushes them slightly apart in pitch. Two tones a few Hz apart do not sound like two tones; they sound like one tone whose loudness pulses, because they drift in and out of phase with each other. The pulse rate is simply the difference between the two frequencies: 440 Hz against 443 Hz gives 3 pulses a second [Source: https://en.wikiversity.org/wiki/Beat_(acoustics)]. Instrument designers have known for decades that the sweet spot is roughly **one to five beats per second** — slow enough to hear as shimmer rather than wobble, fast enough to feel alive. That is the "celeste" or chorus effect [Source: https://image-ppubs.uspto.gov/dirsearch-public/print/downloadPdf/4080861]. Stack seven detuned sawtooths this way and you have the Roland JP-8000 supersaw: one centre saw in tune, six spread around it [Source: https://blog.faderpro.com/techniques/supersaw-how-make-iconic-sound/].

**Glide** (also called portamento, or "slide" on a TB-303) makes pitch travel continuously from the old note to the new one instead of jumping. On a monosynth this is the defining gesture of an acid bassline: the 303's sequencer had a dedicated slide button that drifted the oscillator from one step's pitch to the next [Source: https://www.attackmagazine.com/technique/passing-notes/legato-synths-glide-slide-portamento/2/]. Glide is fundamentally a *reuse* behaviour: it only means something when a voice that was already playing a pitch is asked to play a new one. Skald implements it exactly that way, and that is why glide and polyphony interact in a way that will surprise you the first time.

## What it looks like in Skald

The Instrument is **not** in the sidebar's Nodes palette — that list runs from Oscillator to MIDI Input and contains no container types (`skald-ui/src/components/Sidebar.tsx:263-281`). You do not drag an Instrument in. You *make* one out of nodes you already patched.

Select some nodes on the canvas, then use the sidebar's **Grouping** section (`skald-ui/src/components/Sidebar.tsx:210-235`):

- **Create Instrument** — prompts for a name, then swallows the selected nodes into a new Instrument node.
- **Create Group** — wraps the selection in a visual container only.
- **Explode Instrument** — the inverse; enabled only when exactly one Instrument is selected (`skald-ui/src/app.tsx:385`).

### What "Create Instrument" actually does

The selected nodes are **moved**, not copied, into the Instrument's `subgraph`, and renumbered `1, 2, 3…` (`skald-ui/src/hooks/nodeEditor/useNodeComposition.ts:84-100`). Wires that were entirely inside the selection become subgraph connections (`:102-108`). Wires that *crossed* the selection boundary get an automatic port: an `InstrumentInput` node for each incoming wire and an `InstrumentOutput` for each outgoing one, and the main-canvas wire is re-pointed at a matching handle on the new Instrument node (`:130-177`). Those ports are keyed by *(internal node, handle)* rather than by handle name, because keying by name alone used to merge two unrelated wires that both happened to be called `input` into one port and silently cross-wire the patch (`:113-117`).

The new node is created with these values regardless of what you had selected (`skald-ui/src/hooks/nodeEditor/useNodeComposition.ts:179-198`): `voiceCount: 8`, `glide: 0.05`, `unison: 1`, `detune: 5`, `voiceStealing: 'oldest'`.

### Handles

`InstrumentNode.tsx` renders one handle per named port, and falls back to a single generic pair when there are none (`skald-ui/src/components/InstrumentNode.tsx:64-104`):

| Handle | Side | Meaning |
|---|---|---|
| one target handle per name in `data.inputs` | left | External audio into the corresponding `InstrumentInput` inside. Reaches the DSP via `<Foo>_feed_input` (`skald-backend/core/codegen.odin:1544-1552`, `:1909-1910`). |
| `input` (labelled **In**) | left | The fallback when `data.inputs` is empty. |
| one source handle per name in `data.outputs` | right | Audio out of the corresponding `InstrumentOutput`. |
| `output` (labelled **Out**) | right | The fallback when `data.outputs` is empty. |

Double-click the title bar to rename the instrument (`skald-ui/src/components/InstrumentNode.tsx:18-31`). The name matters: it becomes the prefix on every generated procedure, so an instrument called `TestSynth` exports `TestSynth_trigger`, `TestSynth_set_param` and so on.

### What it can and cannot connect to

This is the single most important structural fact in Skald, and it is easy to miss:

**Only Instrument nodes become audio.** Both the export path and the live preview build their project description with `getInstrumentNodes`, which filters the canvas down to `n.type === 'instrument'` and ignores everything else (`skald-ui/src/utils/projectSerializer.ts:88-89`, `:119`). A beautiful oscillator-into-filter-into-output chain sitting loose on the main canvas, outside any Instrument, produces **silence** — in the preview and in the export.

A **Group** is purely cosmetic. `GroupNode.tsx` draws a translucent box, finds its children by `parentId`, and derives labelled handles by inspecting which wires cross its boundary (`skald-ui/src/components/Nodes/GroupNode.tsx:59-105`). It is a very good tidying tool. It is not an asset: the serializer never emits it, and even if a Group reached the backend, `normalize_node_type` maps `"group"` to the empty string and `build_graph_from_raw` skips it (`skald-backend/core/json.odin:31`, `:165`).

### Rate

The Instrument is not a signal processor and has no rate of its own. It is a *container plus a loop bound*. What it does is decide how many times the voice loop runs each sample (`skald-backend/core/codegen.odin:1738`) and where the per-voice work stops and the shared bus work begins (`:1874-1947`).

## The controls

Select the Instrument node and the right-hand parameter panel shows five instrument-level controls, then an **Internal Nodes** heading followed by the full parameter set of every node inside the subgraph (`skald-ui/src/components/ParameterPanel.tsx:294-319`). The Volume box is also duplicated on the node body itself (`skald-ui/src/components/InstrumentNode.tsx:80-88`).

| Parameter | Range | Default | Unit | What it does to the sound |
|---|---|---|---|---|
| `name` | text | `New Instrument` | — | Becomes the exported symbol prefix (`Foo_trigger`, `Foo_PARAMS`). |
| `volume` | 0 – 1 | 1.0 | linear gain | Output trim for the whole asset, applied at the very last line of `_process`. |
| `voiceCount` | 1 – 32 | 8 | voices | How many independent copies of the subgraph exist. |
| `glide` | 0 – 5 | 0.05 | s | How long a reused voice takes to slide from its old pitch to the new one. |
| `unison` | 1 – 16 | 1 | copies | How many detuned copies of **each Oscillator node** run inside every voice. |
| `detune` | 0 – 100 | 5 | cents | Total spread of the unison stack: ±this many cents around the true pitch. |

Sources: the defaults are `skald-ui/src/definitions/node-definitions.ts:162-177`; the types are `skald-ui/src/definitions/types.ts:188-204`; the slider ranges are `skald-ui/src/components/NodeParameterControls.tsx:318-322`; the export clamps are `skald-ui/src/utils/projectSerializer.ts:199-207`; the codegen-side range table is `skald-backend/core/param_ranges.odin:106-113`. Where those disagree, see "Code-vs-intent notes" — they do, in two places.

### Voice Count — what you hear as you change it

- **1.** Monophonic. Every new note lands on the same voice and cuts the previous one. This is not a limitation, it is a *style*: basses, 303 leads and 808 sub lines are monophonic on purpose, because overlapping low notes turn into mud. It is also the only setting at which Skald's glide is guaranteed to fire on every note.
- **2–4.** Enough for two-note harmony or for a mono line whose release tails can overlap the next note without being chopped. Watch for stealing on fast runs.
- **6–12.** Comfortable chord territory. The 8 default plays four-note chords with headroom for the previous chord's release tail.
- **16–32.** Pads, held chords over a sustain pedal, and anything with a long release. Costs proportionally: everything inside the subgraph runs `voiceCount` times per sample (`skald-backend/core/codegen.odin:1738-1740`).

The musical zone is "one more than the largest chord you play, plus room for the tail". Do not just set 32: an idle voice is skipped (`:1740`), so unused voices are nearly free at runtime, but every voice permanently occupies its own copy of the state struct (`:1105`) and the *active* ones all sum into the output with **no division by the voice count** (`:1965-1987`). Eight loud voices really are eight times as loud as one, and the master stage catches that with a `tanh` soft-limiter rather than a divide (`:2417-2418`). Note that Max/MSP's teaching patch explicitly scales by 1/8 at this point [Source: https://music.arts.uci.edu/dobrian/maxcookbook/polyphony-multiple-copies-msp-subpatch]; Skald does not, deliberately, so that one note played on a 16-voice instrument is not 16 times quieter than it should be. The price is that you must manage headroom yourself with **Volume**.

### Glide — what you hear as you sweep it

- **0.** Off. Pitch snaps. The glide code is not even emitted (`skald-backend/core/codegen.odin:1746`).
- **0.01 – 0.05 s.** Not heard as a slide. Heard as a *softened attack* — the pitch arrives so fast it just removes the click of the jump. Useful on leads.
- **0.06 – 0.15 s.** The classic slide. This is the 808/303 zone; the sub-808 example ships at **0.09 s** (`examples/instruments/bass/sub-808-glide-bass.skald.json:13`). Practitioner emulations of the 303 typically default around 60 ms and expose 1–200 ms [Source: https://github.com/thorinside/nt_303].
- **0.2 – 0.6 s.** Overtly expressive. Theremin, whale song, sci-fi.
- **Above ~1 s.** With any normal note rhythm the pitch never arrives before the next note redirects it. You get a wandering smear with no stable pitch at all. Try it once, on purpose — see the exercise.

**The thing you must know about glide in Skald:** it fires *only when a voice is reused*, never on a fresh voice (`skald-backend/core/codegen.odin:1390-1398`). The comment there explains why — gliding every new note from whatever the previous note was would smear chords into nonsense. The practical effect is that **glide is a monophonic feature here**. At `voiceCount: 1` every note reuses the one voice, so every note glides. At `voiceCount: 8`, a note only glides once all eight voices are already busy, which is not a musical rule and will feel random. If you want glide, set `voiceCount` to 1.

Standard practice is slightly different: most synths tie portamento to *legato* — glide when the new note overlaps the previous one, snap when it doesn't [Source: https://www.attackmagazine.com/technique/passing-notes/legato-synths-glide-slide-portamento/2/]. Skald's "glide on reuse" is equivalent to that only in the mono case.

### Unison and Detune — what you hear as you sweep them

These two only work together. `unison` on its own does nothing audible; `detune` on its own does nothing at all unless `unison > 1`.

The spread is even and symmetrical: copy *i* out of *n* is offset by `(i/(n-1) - 0.5) * 2 * detune` cents (`skald-backend/core/codegen.odin:182`). So `unison: 7, detune: 30` gives you −30, −20, −10, **0**, +10, +20, +30 cents — one copy exactly in tune and three pairs around it, which is precisely the JP-8000 supersaw layout [Source: https://blog.faderpro.com/techniques/supersaw-how-make-iconic-sound/]. Odd unison counts have an in-tune centre; **even counts do not**, so at `unison: 2` the whole sound is detuned and nothing holds the true pitch.

- **unison 1.** Off. One oscillator. Tight, focused, correct for bass and for anything that has to sit precisely in a mix.
- **unison 2–3, detune 5–12.** Subtle thickening. On a note at A4 (440 Hz), adjacent copies 10 cents apart beat at about 2.5 Hz — right inside the 1–5 beats/second zone that reads as pleasant chorus rather than wobble [Source: https://image-ppubs.uspto.gov/dirsearch-public/print/downloadPdf/4080861].
- **unison 5–8, detune 20–40.** Big, wide, trance-lead territory. Seven is the traditional magic number and the point of diminishing returns [Source: https://blog.faderpro.com/techniques/supersaw-how-make-iconic-sound/]. Skald's supersaw example uses exactly `unison: 7, detune: 30` (`examples/instruments/leads/supersaw-hypersaw-lead.skald.json`).
- **detune above ~50 cents.** Half a semitone of spread. The copies stop fusing into one pitch and start sounding like a badly tuned choir; the effect turns dissonant rather than lush.

Two Skald-specific facts that change how you use these.

**Detune is worth much less on bass than on leads.** Beat rate is a *frequency difference*, but detune is specified in cents, which is a *ratio*. Ten cents at A4 (440 Hz) is 2.5 Hz of beating. The same ten cents at C1 (32.7 Hz) is 0.19 Hz — one pulse every five seconds. That is why the 808 example ships with `unison: 1, detune: 0` and the supersaw ships with 7 and 30. If you want width on a sub, get it from a separate layer an octave up, not from detune.

**Unison applies to Oscillator nodes only.** The unison loop lives in `generate_oscillator_code` (`skald-backend/core/codegen.odin:169-212`). FM Operator (`:464`), Wavetable (`:502`) and Noise are single-copy no matter what `unison` says. An FM bell instrument with `unison: 7` pays nothing and gains nothing.

**Unison costs CPU multiplicatively.** Per sample, each Oscillator runs `voiceCount × unison` times. `voiceCount: 16` with `unison: 7` is 112 oscillator evaluations per Oscillator node per sample.

### Volume

Applied as a plain multiply on both channels at the last line of the instrument's `_process` (`skald-backend/core/codegen.odin:1949-1952`). Use it to balance assets against each other *before* they hit the master limiter, which is a `tanh` and will audibly squash a hot instrument rather than clip it (`:2417-2418`). The serializer floors the value at 0.001 rather than allowing a true 0, because the backend reads an exact 0 as "field absent, default to unity" (`skald-ui/src/utils/projectSerializer.ts:197-199`, `skald-backend/core/json.odin:265-268`). Muting is the sequencer track's job, not this control's.

### What "expose" does, and why you would use it

Next to most parameters in the panel there is a small link button (`skald-ui/src/components/ParameterPanel.tsx:228-236`). Clicking it adds the parameter's name to that node's `exposedParameters` list (`:197-211`).

Exposing turns a baked-in constant into a **live, named, runtime-settable field on the generated processor**. Concretely, at codegen time every exposed parameter gets:

1. A real `f32` field on the `<Foo>_Processor` struct (`skald-backend/core/codegen.odin:1262-1263`), initialised to the value you left in the editor.
2. A typed setter `<Foo>_set_<name>(p, value)` that **clamps to the range table** before writing (`:1610-1625`, using `lookup_param_range` at `:1191`).
3. A string-keyed `<Foo>_set_param(p, "name", value)` dispatch, plus a `"<nodeId>::<param>"` alias so several nodes exposing the same name stay individually addressable (`:1679-1694`).
4. An entry in `<Foo>_PARAMS`, a static table of `{name, min, max, default, unit}` your game's tooling or debug overlay can iterate to discover what the asset offers (`:1631-1643`).

That is the whole point. An unexposed parameter is a number frozen into the generated Odin; changing it means regenerating and rebuilding. An exposed one is a knob your game can turn every frame — filter cutoff following the player's speed, reverb mix rising as they walk into a cave, distortion drive tracking engine RPM. Exposure is also what makes a value editable live in the preview without a full rebuild (`skald-ui/src/utils/projectSerializer.ts:236-248`) and what lets the sequencer's per-step P-locks target it (`skald-backend/core/codegen.odin:1168-1170`, `:2106-2138`).

The 808 example exposes generously: the oscillator's `amplitude`, the filter's `cutoff` and `resonance`, all five envelope controls, and the saturator's `drive`, `tone` and `mix` (`examples/instruments/bass/sub-808-glide-bass.skald.json:33`, `:45`, `:60`, `:73`).

**Exposure only works on nodes inside the subgraph.** The Instrument's own five controls display a link button too, but nothing downstream reads it — see "Code-vs-intent notes". Voice count, glide, unison and detune are structural: they change how much code is generated, so they are decided at build time, not at runtime.

## Try it (hands-on)

We will use `examples/instruments/bass/sub-808-glide-bass.skald.json` — one Instrument, one voice, one sine, and a glide that is doing all the musical work. About eight minutes.

**Setup.** Sidebar → **Graph Actions** → **Load**, and open `examples/instruments/bass/sub-808-glide-bass.skald.json`. You should see a single node on the canvas titled **808 Glide Sub**, and a sequencer track of the same name. The session is 140 BPM, 16 steps, master volume 0.75.

1. **Press Play and listen once through.** Five notes: C1 held long, up to G1, back to C1, up to F1, and finishing on C2 (MIDI 24, 31, 24, 29, 36 — `sub-808-glide-bass.skald.json:103-107`). Every pitch change *slides*. Nothing in the subgraph is doing that: the subgraph is just a sine oscillator, a 180 Hz lowpass, an envelope and a gentle saturator (`:20-81`). The slide is coming from the Instrument container.

2. **Look at where the sound actually lives.** Click the **808 Glide Sub** node. The right-hand panel shows the five instrument controls, then **Internal Nodes**: Sine Sub, Tame Highs, Long Amp, 808 Saturation, Output. That list *is* the voice. Skald will build `voiceCount` private copies of it.

3. **Kill the glide, then bring it back.** With the instrument still selected, set **Glide (s)** to `0` and let the loop go round. The pitch now steps. It sounds like five separate notes instead of one moving bass. Set it back to `0.09` and hear the phrase re-form. That one number is the difference between "a bassline" and "an 808 line".

4. **Push glide too far — break it.** Set **Glide (s)** to `5.0` (the slider's maximum). Listen for a full loop. The pitch never reaches any of its targets — each new note grabs the slide mid-journey and redirects it, so you hear a continuous seasick wander with no notes in it at all. This is the failure mode that teaches the concept: glide is a *race* between the slide time and the note rhythm. At 140 BPM a 16th note is 0.107 s, so anything much past ~0.15 s starts eating the next note. Set it back to `0.09`.

5. **Now the important one: turn the instrument polyphonic.** Set **Voice Count** to `8`. Play the loop.

   Two things happen at once. First, **the glide vanishes completely.** Second, the low end goes thick and slightly muddy. Both come from the same cause: with eight voices available, each new note gets its own *fresh* voice instead of reusing the one that was playing, and fresh voices start exactly on pitch (`skald-backend/core/codegen.odin:1390-1398`). No reuse, no glide. Meanwhile the old note's 0.5 s release tail (`sub-808-glide-bass.skald.json:57`) is still ringing underneath the new one, so C1 and G1 overlap and their sub frequencies pile up. This is the polyphony lesson in one slider: **polyphony is not "better", it is a different instrument.** Basses are mono for a reason. Set **Voice Count** back to `1`.

6. **Watch a voice get stolen.** Leave **Voice Count** at `1` and set **Glide (s)** to `0`. Now open the sequencer and shorten the first note (step 0) from 6 steps to 1 step. Play. The note at step 0 now ends almost immediately but its release tail continues; at step 6 the new note still has to take that same single voice. Listen closely to the transition — there is no click. Skald deliberately hands the stolen voice's *live* envelope level to the new note's attack ramp instead of snapping to zero (`skald-backend/core/codegen.odin:1401-1409`) and does not reset the oscillator phase or filter state on a steal (`:1411-1441`). Undo the note-length change.

7. **Add unison, and discover it does nothing — break it.** Set **Unison Voices** to `8`, leave **Detune (cents)** at `0`. Play. It sounds *identical*. It is identical: with zero detune, all eight copies run at the same frequency from the same start phase, get summed, and then divided by eight (`skald-backend/core/codegen.odin:181-182`, `:212`). You have just multiplied the oscillator's CPU cost by eight for a bit-for-bit identical output. Unison without detune is not a thing.

8. **Add detune, and discover it barely helps.** Now push **Detune (cents)** to `30` — the supersaw value. On a C1 sub you will hear almost nothing: adjacent copies are only 8.6 cents apart, which at 32.7 Hz is one beat every six seconds. Push detune to the maximum `100`. *Now* you hear it, and it is horrible — a full semitone of spread on a sub turns a pitch into a low growling cluster and the fundamental stops being identifiable. This is the detune lesson: **cents are a ratio, beating is a difference, so the same detune is dramatic on a lead and inaudible on a bass.** Set **Unison Voices** back to `1` and **Detune** back to `0`.

9. **See the contrast.** Load `examples/instruments/leads/supersaw-hypersaw-lead.skald.json`. Same two controls, different octave: `unison: 7, detune: 30` at MIDI 64–72. Set **Unison Voices** to `1` and play — thin, ordinary saw lead. Set it back to `7` and play — the whole thing widens and starts shimmering. That is the identical mechanism that did nothing on the 808.

10. **Balance it.** Back on the 808, set **Volume** to `1.0` and then to `0.3`. This is the trim that lets a hot asset sit under the master `tanh` limiter instead of fighting it (`skald-backend/core/codegen.odin:1952`, `:2417`). Leave it at `0.78`.

## Why you patch it this way

**The Instrument is the outermost wrapper, always.** Nothing outside one makes sound (`skald-ui/src/utils/projectSerializer.ts:88-89`). The normal workflow is: patch freely on the open canvas until it sounds right, select the whole chain, **Create Instrument**. If you find yourself with a silent preview and a canvas full of nodes, this is almost certainly why.

**One Instrument = one game asset.** Each Instrument becomes its own namespaced processor with its own public API — `<Name>_trigger`, `<Name>_note_on` / `_note_off`, `<Name>_start` / `_stop`, `<Name>_set_param`, `<Name>_PARAMS` (`skald-backend/core/codegen.odin:1334`, `:1503`, `:1554-1588`, `:1679`). Whether it exports as a one-shot SFX or a looping music layer is decided by whether a sequencer track points at it (`skald-backend/core/types.odin:176-182`). So: one Instrument per distinct sound your game triggers. A footstep, a laser, a bass layer, a pad layer — four Instruments, not one.

**Inside, the canonical chain is source → shaper → amplifier → colour → Output.** The 808 example is the textbook form: Oscillator → Filter → ADSR → Distortion → Output (`sub-808-glide-bass.skald.json:83-88`). Every Instrument must end at an Output node (codegen type `GraphOutput`) or it produces silence — that is what `output_left` / `output_right` accumulate into (`skald-backend/core/codegen.odin:1965-1987`).

**Order matters in a way that is enforced, not just advised.** Skald splits your subgraph into two domains (`skald-backend/core/codegen.odin:64-69`):

- The **voice domain** runs `voiceCount` times per sample, once per active voice. Oscillators, envelopes, filters, MIDI nodes.
- The **bus domain** runs *once* per sample on the summed output of all voices. Delay and Reverb live here by definition, along with everything downstream of them.

The split exists because a Delay holds one shared buffer. Running it per-voice divided its delay time by the number of active voices, bled voices into each other's feedback, and cut the tail dead the instant the last voice ended (`:64-69`). It is the same optimisation Faust exposes as its `effect` line [Source: https://ccrma.stanford.edu/courses/250a-winter-2020/labs/1/].

**Get the order wrong and codegen refuses to build.** Put an Oscillator or an ADSR *after* a Reverb and you get an explicit error naming the offending node, because a per-voice envelope has no meaning in a place where no single voice exists (`skald-backend/core/codegen.odin:90-97`, `:1935-1944`). This is deliberate: the earlier behaviour silently dropped those nodes, producing an asset that compiled cleanly and sounded wrong. So: **all pitch and envelope work first, then Delay/Reverb, then Output.** A Filter or Distortion is allowed on either side — put it before the reverb to shape each note, after it to shape the whole tail.

**Feeding an Instrument.** Two ways in. A **MIDI Input** node wired to the Instrument populates its MIDI config (`skald-ui/src/utils/projectSerializer.ts:124-137`). An audio wire into an input handle becomes an `InstrumentInput`, reaching the DSP through `<Foo>_feed_input`, which is how you build an Instrument that is really an *effect* — a reverb bus your game routes other assets through (`skald-backend/core/codegen.odin:1544-1552`, `:1909-1910`).

**Group vs Instrument.** Use a Group when you want to tidy the canvas or annotate a section. Use an Instrument when you want sound. A Group does not make its contents audible, does not give them polyphony, and is discarded before codegen (`skald-backend/core/json.odin:31`, `:165`).

## Going further

**Layer instead of stacking unison.** Two Oscillator nodes inside one voice — a sine at pitch and a saw an octave up, mixed — gives you body plus bite from a single note and a single envelope. Add a Mixer to balance them. This costs `voiceCount × 2` oscillators, exactly the same as `unison: 2`, but you control both halves independently instead of getting two copies of the same thing.

**Give the second layer its own envelope.** The 808 example has one ADSR. Add a second, short one (attack 0.001, decay 0.06, sustain 0) on a noise or click layer and mix it in at low level: now the instrument has a *transient* separate from its *body*, which is how real percussive instruments work. Both envelopes live in the voice domain and both retrigger per note automatically.

**Use a second envelope as a modulator, not an amplifier.** The supersaw example does this: a dedicated `Filter Env` ADSR → a Mapper scaling 0–1 into 0–3500 Hz → the filter's `input_cutoff` (`supersaw-hypersaw-lead.skald.json`, connections `saw-filter-env → saw-env-map → saw-filter:input_cutoff`). Per-voice filter envelopes are one of the biggest expressiveness wins available, and they only work because each voice has a private filter and a private envelope.

**Series vs parallel inside the voice.** Series (osc → filter → dist) compounds: the distortion hears what the filter left behind. Parallel (osc → Mixer, and osc → dist → Mixer) blends: you keep the clean fundamental and add grit alongside it, which is usually better on bass because distortion tends to eat low end. The 808 example is effectively parallel already — its saturator runs at `mix: 0.22`, so 78% of what you hear is the clean signal (`sub-808-glide-bass.skald.json:72`).

**Shared reverb, not per-voice reverb.** Put one Reverb after the point where all voices sum. Skald does this for you automatically by domain-splitting, but knowing it lets you make the choice consciously: a filter before the reverb shapes each note, the same filter after it shapes the room.

**Expose the parameters your game will actually drive, and nothing else.** Every exposure is a struct field and a setter. Expose filter cutoff and reverb mix if the game modulates them; do not reflexively expose everything. `<Foo>_PARAMS` is a public contract, and a short one is easier for tooling and for whoever writes the game code (`skald-backend/core/codegen.odin:1631-1643`).

**Pick `voiceCount` from the music, not from ambition.** Mono for basses and 303 leads, so glide works and low notes cannot pile up. 4–8 for plucks and keys. 12–16 for pads with long releases, where you need room for the tail of the previous chord underneath the new one.

**Velocity is already wired.** Each voice stores its note velocity and every ADSR scales by `(1 - velocitySensitivity) + velocitySensitivity × velocity` (`skald-backend/core/codegen.odin:284`). The 808 sets 0.4 and the sequencer varies velocity from 0.7 to 0.95 (`sub-808-glide-bass.skald.json:59`, `:103-107`). Raising velocity sensitivity toward 1.0 makes the instrument dramatically more dynamic for free.

## Under the hood

The Instrument node is not a DSP block. It is the thing that decides the *shape* of the generated Odin.

**The voice struct.** Every node in the subgraph contributes its private state fields to one `<Foo>_Voice_State` struct: oscillator phases, envelope stages, filter memory (`skald-backend/core/codegen.odin:1048-1099`). The oscillator's phase is not a single float but an array sized by unison, `osc_<id>_phase: [unison]f32` (`:1064`). The processor then holds `voices: [voiceCount]<Foo>_Voice_State` (`:1105`). Bus-domain nodes are excluded and keep their state on the processor instead (`:1062`, `:1135`) — that is the one-shared-reverb rule made concrete in the type system.

**Note on and voice allocation.** `<Foo>_note_on` scans for the first inactive voice (`:1336-1341`). If there is none, it scans again for the greatest `age` and takes that one (`:1344-1354`) — oldest-note stealing, chosen over round-robin because round-robin could steal the note that started one sample ago while a ten-second pad kept ringing. Pitch comes straight from the equal-temperament formula:

```odin
freq := 440.0 * math.pow(2.0, (f32(note) - 69.0) / 12.0)
```
(`skald-backend/core/codegen.odin:1387`)

**Why stealing does not click.** Before the voice is reset, the generator captures each envelope's live level, rescaling it by the remaining release fraction if it was already releasing (`:1364-1381`). The new note's attack then ramps *from* that level rather than from zero (`:1401-1409`), and oscillator phase, filter memory and tone state are only zeroed on a genuinely fresh voice (`:1411-1441`). The result is a sample-continuous handover.

**Glide.** `note_on` bakes the instrument's glide time into the voice and sets the target pitch, but only points `current_freq` at the *old* pitch when the voice was stolen (`:1389-1398`). The per-sample slide is a one-pole approach with a snap threshold:

```odin
glide_k := 1.0 / math.max(voice.glide_time * sample_rate, 1.0)
voice.current_freq += (voice.target_freq - voice.current_freq) * glide_k
if abs(voice.target_freq - voice.current_freq) < 0.1 do voice.current_freq = voice.target_freq
```
(`skald-backend/core/codegen.odin:1744-1753`)

Note that this is exponential, not linear — the pitch moves fastest at the start and eases in. `glide_time` therefore behaves as a time *constant* rather than an exact arrival time; the 0.1 Hz snap is what guarantees it actually lands. The whole block is only emitted when glide > 0 (`:1746`), so a zero-glide instrument pays nothing.

**Unison and detune.** Inside the oscillator generator, each copy gets an evenly-spaced cent offset and a frequency scaled by the standard cents-to-ratio conversion, and the copies are averaged:

```odin
detune_amount = (f32(i) / (f32(unison_count) - 1.0) - 0.5) * 2.0 * DETUNE_CENTS
detuned_freq  = base_freq * math.pow(2.0, detune_amount / 1200.0)
...
node_<id>_out = (unison_out / f32(unison_count)) * amplitude
```
(`skald-backend/core/codegen.odin:182-183`, `:212`)

The `2^(cents/1200)` is the definition of a cent: 1200 of them per octave. The divide-by-N is why a unison stack does not get louder as you add copies — but because detuned copies drift out of phase, their sum is *less* than N times one copy, so a heavily detuned stack is measurably quieter than a single oscillator. Compensate with amplitude, not with unison.

**The per-sample loop.** `<Foo>_process` runs the sequencer once, then loops `voiceCount` times skipping inactive voices, ages each voice, applies glide, auto-releases envelopes whose duration has elapsed, runs every voice-domain node in topological order, and accumulates into `output_left`/`output_right` (`:1727-1872`, `:1965-1987`). A voice frees itself when all its envelopes reach Idle (`:1855-1870`). Then the bus block runs once on the summed signal (`:1874-1947`). Finally:

```odin
return output_left * VOLUME, output_right * VOLUME
```
(`skald-backend/core/codegen.odin:1952`)

Above that, `project_process` sums every unmuted instrument and applies `tanh(x * master_volume)` as a soft limiter with a true ceiling of 1.0 (`:2398-2419`).

## Terms introduced

- **Voice** — one complete copy of a synth's signal chain: everything needed to sound exactly one note at one pitch with its own envelope position. In Skald, a voice is one instance of an Instrument's subgraph.
- **Polyphony** — how many voices an instrument has, i.e. how many notes it can sound simultaneously. Skald's `voiceCount`.
- **Monophonic** — polyphony of one. Each new note takes over the single voice.
- **Voice allocation** — the logic that decides which voice plays an incoming note.
- **Voice stealing** — cutting off a currently sounding voice so a new note can use it, because all voices are busy. Skald always steals the oldest.
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

## Code-vs-intent notes

**1. `voiceStealing` is a dead control.** `InstrumentParams` declares `voiceStealing: 'oldest' | 'newest'` (`skald-ui/src/definitions/types.ts:194`), the default parameters set it (`skald-ui/src/definitions/node-definitions.ts:166`), instrument creation writes it (`skald-ui/src/hooks/nodeEditor/useNodeComposition.ts:187`), and all 40-odd shipped examples carry `"voiceStealing": "oldest"`. Nothing reads it. There is no control for it in `NodeParameterControls.tsx` (the instrument case at `:318-322` renders only volume, voiceCount, glide, unison, detune), the serializer does not emit it (`skald-ui/src/utils/projectSerializer.ts:189-210`), `Project_Instrument` has no corresponding field (`skald-backend/core/types.odin:150-166`), and `note_on` unconditionally steals by greatest `age` (`skald-backend/core/codegen.odin:1342-1354`). *Severity: cosmetic today* — the behaviour matches the value every example carries — but it is a promised option that does not exist.

**2. Standard practice steals releasing voices first; Skald steals by age only.** Practitioner guidance is that "the first choice for a victim will be a voice in its release phase, on the theory that the sudden disappearance of a note fading out is less likely to be noticed" [Source: https://electronicmusic.fandom.com/wiki/Voice_stealing]. Skald's steal loop only compares `age` (`skald-backend/core/codegen.odin:1348-1353`), so a long-held sustaining pad note that started first is stolen ahead of a note released a moment ago. This is partly mitigated by the click-free handover (`:1401-1409`), but on a sustained chord you will lose the note you are most likely to notice. *Severity: confusing* — it is a real audible difference from what an experienced synth player expects.

**3. `voiceCount` and `glide` used to disagree with the range table on their upper bound; both now match.** `voiceCount` is 1–32 in the range table and 1–32 on the UI slider and in the serializer's hard clamp, a limit the test suite pins. `glide` is 0.0–5.0 in the range table, and the UI slider now runs 0–5 s as well — widened from an earlier 0–2 s cap that had no backend basis. The serializer applies no clamp of its own to `glide`, so a hand-edited save can still carry a value the slider can't produce, but the UI and the table agree on what the slider itself allows. None of this was ever load-bearing for these four instrument-level names regardless — `lookup_param_range` is only consulted for *node*-level exposed parameters, and `voiceCount`, `glide`, `unison` and `detune` are instrument-level and cannot be exposed at all (see note 4), so the table's fallback values for them are structurally unreachable, matching or not. *Severity: cosmetic* — and now the table's own header, which calls itself the ranges that "match the ranges sliders use in the UI's parameter panel," is accurate for these four names too.

**4. The Instrument's own parameters show an "expose" button that does nothing.** `ParameterPanel`'s wrapper defaults `isExposable` to `true` (`skald-ui/src/components/ParameterPanel.tsx:281-291`, `:220`), and the instrument branch passes the wrapper straight through without opting out (`skald-ui/src/components/NodeParameterControls.tsx:318-322`), so Volume, Voice Count, Glide, Unison and Detune each render a link button whose tooltip promises to "Expose … to public API" (`ParameterPanel.tsx:232`). Clicking it writes to the Instrument node's `exposedParameters`, which the serializer never emits — it only forwards the subgraph's nodes (`skald-ui/src/utils/projectSerializer.ts:189-210`, `:74-84`) — and the codegen's exposure walk only iterates nodes *inside* the instrument graph (`skald-backend/core/codegen.odin:1173-1190`). Three of the five (voiceCount, unison, and glide's emit-or-not decision) are structural and *cannot* be runtime parameters, since they determine array sizes and whether code blocks are emitted at all (`:1064`, `:1105`, `:1746`). `volume` and `detune` are baked constants that could in principle be exposed (`:1952`, `:182`) but are not. *Severity: confusing* — the control implies a capability that does not exist.

**5. `new_docs/InstrumentNode.md` describes a file that no longer exists in that form.** It documents the node as taking only `data.name` and having no ports. The live component renders per-port handles from `data.inputs`/`data.outputs`, an inline Volume control, and double-click renaming (`skald-ui/src/components/InstrumentNode.tsx:64-104`, `:18-31`, `:80-88`). The doc also lives under `new_docs/` alongside `GroupNode.md` while the actual component sits at `skald-ui/src/components/InstrumentNode.tsx`, not in `components/Nodes/`. *Severity: cosmetic* — stale component doc.

**6. "Create Group" is enabled for a single-node selection but silently does nothing.** `app.tsx:379` sets `canCreateInstrument={selectedNodesForGrouping.length > 0}` and that same flag drives both the Create Instrument and Create Group buttons (`skald-ui/src/components/Sidebar.tsx:213`, `:221`). Both tooltips read "Select 2 or more nodes" (`:216`, `:224`). Create Instrument in fact accepts one node (`skald-ui/src/hooks/nodeEditor/useNodeComposition.ts:207-212`), but `handleCreateGroup` returns early on `length <= 1` (`:214-216`), so with exactly one node selected the button is lit, clickable, and inert. *Severity: cosmetic.*

**7. Unison copies all start at phase zero, so unison width fades in rather than being present at the attack.** Fresh voices zero the whole phase array (`skald-backend/core/codegen.odin:1427`), so at the note's onset every unison copy is perfectly in phase and the stack is momentarily indistinguishable from a single louder oscillator; the copies only decorrelate as detune drives them apart. At `unison: 7, detune: 30` on A4 the outermost pair differ by about 15 Hz, so full width arrives after roughly 60–70 ms — audible on a plucked attack. Hardware and software supersaws conventionally randomise the start phase of each copy for this reason [Source: https://blog.faderpro.com/techniques/supersaw-how-make-iconic-sound/]. *Severity: cosmetic* — a timbral difference from the classic sound, not a bug, and the flip side is that Skald's attack is perfectly reproducible sample-for-sample.
