# Bass, Taken Apart

> A bass line is a very low note that has been shaped so you can still tell where it starts, where it stops and what note it is — and every knob in this chapter exists to do one of those three jobs.

This is the chapter where the manual stops explaining nodes one at a time and shows you a whole instrument. Skald ships fourteen bass patches in `examples/instruments/bass/`. They are not a demo folder; they are a curriculum. We start with the three-node one, take it apart, and then climb a ladder where each rung adds exactly one idea. By the end you will be able to look at any of the fourteen and say what each node is for and what the patch would sound like without it.

Have the app open. Every claim here is something you can hear.

---

## What it is

**Bass** is the bottom two and a bit octaves of music. Engineers usually split it in two. **Sub-bass** runs roughly 20–60 Hz: you feel it in your chest and in the floor more than you hear it as a pitch. **Bass** proper runs roughly 60–250 Hz, and that is where the fundamental frequencies of most rhythm-section instruments actually live [Source: https://www.masteringthemix.com/blogs/learn/understanding-the-different-frequency-ranges]. Above that, 250–500 Hz is the **low mids**, and a build-up there is the standard cause of a mix sounding *muddy* [Source: same]. Those three bands are the whole geography of this chapter: you are always deciding how much of your bass sits in each one.

Here is the physical reality that makes low notes hard. A **fundamental** is the slowest repetition in a sound — the one your brain calls "the note". Everything above it is a **harmonic**, a whole-number multiple of the fundamental. A 41 Hz note (the low E on a bass guitar, MIDI note 28) has harmonics at 82, 123, 164 Hz and up. Now: a laptop speaker is a 40 mm cone. It physically cannot move enough air to reproduce 41 Hz. Neither can a phone, and neither can most earbuds. If your bass is *only* a 41 Hz fundamental, half your listeners hear silence.

Your brain saves you, but only if you help it. Given harmonics at 82, 123 and 164 Hz with nothing at 41, the auditory system reconstructs the missing 41 Hz fundamental anyway — you perceive the low note even though the speaker never produced it. This is why a bass patch is almost always *two things at once*: a clean low fundamental for the systems that can reproduce it, and a harmonically richer layer an octave or so up that carries the same note on the systems that cannot. Nearly every patch in the bass folder is built exactly that way — a **Sub** oscillator and a **Body**/**Growl**/**Pick** oscillator, mixed. Pure sine-wave sub-bass sounds enormous on a subwoofer and disappears entirely on a phone [Source: https://unison.audio/808-sound-design/], and that single sentence explains most of the architecture you are about to read.

Why a **sine** for the sub layer? A sine has exactly one harmonic — itself, and nothing else. That is the point. Any energy your sub layer puts above ~80 Hz is energy that collides with the kick drum, the low mids, and the body layer you deliberately added. A sine keeps the sub band uncluttered and predictable; the standard advice is a sine oscillator tuned into the 30–50 Hz region for weight without mud [Source: https://emastered.com/blog/sub-bass]. It is also the waveform that survives the most abuse downstream, because there is nothing in it to smear.

The second reality is **mono compatibility**. Two copies of the same low note, slightly apart in time or pitch, will drift in and out of phase with each other — sometimes adding, sometimes cancelling. At 41 Hz one wavelength is about 8.4 metres, so even a tiny difference between left and right becomes a large fraction of a cycle, and when a club PA, a phone or a vinyl cutter sums left and right to mono, your bass can partially vanish. Standard practice is to keep everything below about 80 Hz dead centre and mono, and to put stereo width only on the layers above that [Source: https://www.producerspot.com/how-to-make-sub-bass-that-sits-in-the-mix-like-a-pro/] [Source: https://www.mypulseacademy.com/blog/reese-bass-fix]. In Skald that has a concrete consequence you will meet on the Reese rung: the Instrument's `unison`/`detune` controls apply to **every** oscillator in the subgraph at once, sub included, and detuning a sub is exactly the thing you were told not to do.

The third thing that makes a bass line *readable* is the start of each note. Your ear identifies instruments largely from their **transient** — the first few tens of milliseconds. On a real bass that transient is the finger or pick, a brief burst of noise and brightness that decays almost instantly. In a synth you fake it with a **filter envelope**: a second envelope that opens the filter wide for a moment at note start and then closes it. A fast attack and a moderate decay on the filter is the entire recipe for the "pluck" of subtractive synthesis — each note begins bright and immediately darkens [Source: https://beatkitchen.io/guides/mix-primer/04-shaping-sound-envelopes-filters-and-amplifiers/]. Nine of the fourteen bass patches contain a second ADSR doing exactly this and nothing else.

---

## What it looks like in Skald

### Where the patches live

`examples/instruments/bass/` — fourteen `.skald.json` files. Open one with **Open File...** in the sidebar's *Graph Actions* section (`skald-ui/src/components/Sidebar.tsx::onLoad`). Load replaces the whole graph and also restores the file's tempo, pattern length and master volume from its `session` block (`skald-ui/src/hooks/nodeEditor/useFileIO.ts::applySaveData`). **Import Patch** (`skald-ui/src/components/Sidebar.tsx::onImport`) merges a file into what you already have — use Load, not Import, for everything in this chapter.

### The two shapes a bass patch comes in

Twelve of the fourteen are wrapped in an **Instrument** node: one node on the canvas with the whole voice hidden inside it as a `subgraph`. Two of them — `sine-sub-bass.skald.json` and `lfo-filter-wobble-bass.skald.json` — are loose graphs with no wrapper at all. The backend still handles those: a graph with no Instrument node is auto-wrapped into a single asset named `Asset` with `voice_count = 1`, `unison = 1` and `glide` at its zero default (`skald-backend/core/json.odin::build_project_from_graph_raw`; mirrored on the live-preview path by `skald-ui/src/utils/projectSerializer.ts::buildProjectData`). That is worth knowing because it means a loose graph is **monophonic and cannot glide**, no matter what you do.

There is no Instrument entry in the node palette. You build the nodes loose, select two or more, and press **Create Instrument** in the sidebar's *Grouping* section (`skald-ui/src/components/Sidebar.tsx::onCreateInstrument`). The moment an Instrument node exists, the sequencer automatically gives it a 16-step track (`skald-ui/src/hooks/sequencer/useInstrumentRegistry.ts::useInstrumentRegistry`).

### The nodes a bass patch is made of, and their handles

Every one of these is dragged in from the **Nodes** section of the sidebar (`skald-ui/src/components/Sidebar.tsx::paletteNodes`).

| Node | Palette label | Inputs (handle id → label) | Outputs | Cited |
|---|---|---|---|---|
| Oscillator | Oscillator | `input_freq`→Freq, `input_amp`→Amp, `input_pulseWidth`→PW | `output`→Out | `skald-ui/src/components/Nodes/OscillatorNode.tsx::OscillatorNode` |
| Noise | Noise | `input_amp`→Amp | `output`→Out | `skald-ui/src/components/Nodes/NoiseNode.tsx::NoiseNode` |
| Filter | Filter | `input`→In, `input_cutoff`→Cut, `input_res`→Res | `output`→Out | `skald-ui/src/components/Nodes/FilterNode.tsx::FilterNode` |
| ADSR | ADSR | `input`→In | `output`→Env | `skald-ui/src/components/Nodes/ADSRNode.tsx::ADSRNode` |
| Mapper | Mapper (Scale) | `input`→In | `output`→Out | `skald-ui/src/components/Nodes/MapperNode.tsx::MapperNode` |
| Mixer | Mixer | `input_1` … `input_N` (one per channel) | `output`→Out | `skald-ui/src/components/Nodes/MixerNode.tsx::MixerNode` |
| Distortion | Distortion | `input`→In | `output`→Out | `skald-ui/src/components/Nodes/DistortionNode.tsx::DistortionNode` |
| LFO | LFO | *(none)* | `output`→Out | `skald-ui/src/components/Nodes/LFONode.tsx::LFONode` |
| S & H | S & H | *(none)* | `output`→Out | `skald-ui/src/components/Nodes/SampleHoldNode.tsx::SampleHoldNode` |
| FM Operator | FM Operator | `input_mod`→Mod, `input_carrier`→Carrier, `input_amp`→Amp in | `output`→Out | `skald-ui/src/components/Nodes/FMOperatorNode.tsx::FmOperatorNode` |
| Output | Output | `input`→In | *(none)* | `skald-ui/src/components/Nodes/GraphOutputNode.tsx::GraphOutputNode` |

Two rules govern what can connect to what, and they explain most of the layouts you will see.

**Rule 1 — a port sums.** Wire three sources into one `input` and the generated code adds them (`skald-backend/core/param_utils.odin::get_f32_param`). That is why `house-pluck-bass.skald.json` has no Mixer: both oscillators go straight into the Filter's `input` and are summed there (`examples/instruments/bass/house-pluck-bass.skald.json::pluck-filter`). A Mixer is only needed when you want a *level knob per source*.

**Rule 2 — modulation ADDS to the knob, it does not replace it.** When you wire something into `input_cutoff`, the generated expression is `(cutoff parameter) + (incoming signal)` (`skald-backend/core/param_utils.odin::get_f32_param`). This is the single most important fact in this chapter. In `synth-reese-bass.skald.json` the Filter's own cutoff is 300 Hz (`examples/instruments/bass/synth-reese-bass.skald.json::reese-filter`), the filter envelope maps to 0–1100 Hz (`examples/instruments/bass/synth-reese-bass.skald.json::reese-fenv-map`) and a slow LFO maps to 0–500 Hz (`examples/instruments/bass/synth-reese-bass.skald.json::reese-sweep-map`) — all three land on the same `input_cutoff` port on `reese-filter`, so the cutoff actually travels roughly 300 Hz → 1900 Hz. Read a patch's cutoff range by *adding*, never by reading one number.

The one exception is pitch: `input_freq` on an Oscillator is **exponential**, not additive. The code computes `base_freq * 2^(sum of inputs)`, clamped to ±10 octaves (`skald-backend/core/codegen_nodes.odin::generate_oscillator_code`). An incoming value of 1.0 means *one octave up*. This is why the Fretless patch's vibrato LFO has an amplitude of 0.015 (`examples/instruments/bass/fretless-bass.skald.json::fl-vibrato`) — 0.015 of an octave is about 18 cents, a musical vibrato. An amplitude of 1 there would be a one-octave siren.

### Rate and domain

There is no separate "control rate" in Skald. LFOs, envelopes, S&H and mappers are all computed once per sample inside the per-voice loop, alongside the oscillators (`skald-backend/core/codegen_processor.odin::generate_processor_code`). The only split that exists is **voice domain** vs **bus domain**: Delay and Reverb pull everything downstream of them out of the per-voice loop, so it runs once per sample on the *summed* output of all voices (`skald-backend/core/codegen_analysis.odin::seed_bus_domain`, `skald-backend/core/codegen_analysis.odin::compute_bus_domain`). Oscillator, ADSR, FM Operator and Wavetable are voice-coupled and can never live in the bus domain (`skald-backend/core/codegen_analysis.odin::is_voice_coupled_type`), because they read a specific voice's pitch and envelope stage.

One consequence worth filing away now: because LFO and S&H run in the voice domain, **each voice gets its own LFO phase and its own random-number stream** — both are reset only when a voice is freshly started, not when it is stolen (`skald-backend/core/codegen_processor.odin::generate_processor_code`). Two overlapping notes on a wobble bass wobble independently. That is a reason to set `voiceCount` to 1 on any patch whose character comes from stepped or random modulation.

---

## The controls

### Instrument-level (select the Instrument node; controls at `skald-ui/src/components/NodeParameterControls.tsx::NodeParameterControls`)

| Parameter | Range | Default | Unit | What it does to the sound |
|---|---|---|---|---|
| `volume` | 0–1 (UI slider) | 1.0 | linear gain | Multiplies the instrument's stereo output (`skald-backend/core/codegen_processor.odin::generate_processor_code`). A value of exactly 0 is read as "absent" and becomes 1.0 (`skald-backend/core/json.odin::build_project_from_raw`). |
| `voiceCount` | 1–32 | 8 | voices | How many notes can sound at once. Also decides whether glide ever happens — see below. |
| `glide` | 0–5 | 0.05 | s | Portamento time between notes. |
| `unison` | 1–16 | 1 | copies | Extra detuned copies of **every** oscillator in the subgraph. |
| `detune` | 0–100 | 5 | cents | Total spread across the unison copies. |

Ranges and defaults from `schema/nodes.json::generic`, the one authored copy; UI slider bounds from `skald-ui/src/components/NodeParameterControls.tsx::NodeParameterControls`.

**Glide is the 808 slide, and it only fires on voice steal.** The generated `note_on` slides pitch from the previous note only when the new note had to *steal* an already-busy voice; a fresh voice starts exactly on pitch (`skald-backend/core/codegen_processor.odin::generate_processor_code`). The slide itself is a one-pole approach to the target frequency, one step per sample (`skald-backend/core/codegen_processor.odin::generate_processor_code`). So: `voiceCount: 1` plus `glide: 0.09` (as in `examples/instruments/bass/sub-808-glide-bass.skald.json::instrument-808-glide-bass`) means *every note after the first* slides — the trap/drill 808 sound, and 90 ms sits right in the 80–120 ms window practitioners quote for a smooth slide [Source: https://www.audeobox.com/learn/fl-studio/how-to-make-808s-in-fl-studio/]. With `voiceCount: 6` there is almost always a free voice, so glide almost never happens. Keep that in mind when you get to the Fretless patch.

**Unison and detune are all-or-nothing.** They are applied inside the oscillator generator itself, to every oscillator, from the Instrument's settings (`skald-backend/core/codegen_nodes.odin::generate_oscillator_code`). You cannot detune the Body oscillator and leave the Sub alone. That is why the Reese patch has one oscillator and nothing else (`examples/instruments/bass/synth-reese-bass.skald.json::reese-osc`): with `unison: 7, detune: 28` it does not want a mono sub in the same graph getting smeared.

### Per-node parameters that shape a bass

| Node | Parameter | Range | Default | Unit | What it does to the sound |
|---|---|---|---|---|---|
| Oscillator | `waveform` | Sine / Sawtooth / Square / Triangle | Sawtooth | — | The harmonic recipe. Sine = fundamental only. |
| Oscillator | `amplitude` | 0–1 | 0.5 | gain | Level before anything else. |
| Oscillator | `pulseWidth` | 0.01–0.99 | 0.5 | duty | Square only; clamped 0.01–0.99 in the DSP. |
| Oscillator | `fixedPitch` | off/on | off | — | Off = pitch follows the played note and the `frequency` box is inert. |
| Filter | `type` | Lowpass / Highpass / Bandpass / Notch | Lowpass | — | Which part of the spectrum survives. |
| Filter | `cutoff` | 20–20000 | 800 | Hz | Where the lowpass starts removing. **DSP clamps to `sample_rate × 0.16`.** |
| Filter | `resonance` | 0.1–20 | 1.0 | Q | Emphasis right at the cutoff. Higher = more ring. |
| ADSR | `attack` | 0–10 | 0.1 | s | Time from silence to full. Zero is a supported value — it is not clamped up to an instant-but-not-quite ramp. |
| ADSR | `decay` | 0–10 | 0.2 | s | Time from full down to sustain. |
| ADSR | `sustain` | 0–1 | 0.5 | level | Level held while the note lasts. |
| ADSR | `release` | 0–10 | 1.0 | s | Fade after the note ends. |
| ADSR | `depth` | 0–1 | 1.0 | scale | Scales the whole envelope output. |
| ADSR | `velocitySensitivity` | 0–1 | 0.5 | — | How much note velocity scales the envelope. |
| Mapper | `inMin`/`inMax` | ±1e6 | 0 / 1 | — | The input range you promise to feed it. |
| Mapper | `outMin`/`outMax` | ±1e6 | 0 / 20000 | — | The range it produces. |
| Distortion | `drive` | 1–100 | 20 | × | Input gain into the shaping curve. |
| Distortion | `shape` | classic / soft / hard / asymmetric | classic | — | Which curve. |
| Distortion | `tone` | 100–20000 | 4000 | Hz | One-pole lowpass **on the wet path only**. |
| Distortion | `mix` | 0–1 | 0.5 | — | Dry/wet blend. This is built-in parallel processing. |
| LFO | `frequency` | 0.01–100 | 5.0 | Hz | Free-run rate. **Inert when `bpmSync` is on.** |
| LFO | `amplitude` | 0–20000 | 1.0 | — | Output swing, ±amplitude. |
| S & H | `rate` | 0.1–1000 | 10 | Hz | How often a new random value is latched. Inert when synced. |
| FM Operator | `frequency` | 0.01–32 | 2 | ratio | Carrier pitch as a **multiple of the played note**, not Hz. |
| FM Operator | `modIndex` | 0–1000 | 100 | radians | Depth of phase modulation. |

Ranges and defaults are authored once in `schema/nodes.json` (`schema/nodes.json::overrides` for the node-type-specific rows, `schema/nodes.json::generic` for the name-keyed fallback table), rendered to `skald-backend/core/param_ranges.generated.odin` and to `skald-ui/src/definitions/nodeSchema.generated.ts`; the editor's per-node defaults in `skald-ui/src/definitions/node-definitions.ts` read the generated TypeScript copy. UI bounds are set independently in the node cards (`Nodes/*.tsx`) and the parameter panel (`skald-ui/src/components/NodeParameterControls.tsx::NodeParameterControls`).

### What you hear as you sweep them

**Filter cutoff.** This is the loudest knob in a bass patch. Down at 60–120 Hz a sawtooth turns into something almost indistinguishable from a sine: all body, no definition, invisible on a laptop. Around 150–250 Hz (where `house-pluck-bass` sits at 220, `slap-bass` at 240, `wobble-samplehold-bass` at 160) you get weight plus just enough second and third harmonic to hear the pitch on a small speaker. From 300–700 Hz (`synth-reese-bass` 300, `fingered-electric-bass` 340, `palm-muted-bass` 380, `random-acid-bass` 400, `fm-growl-bass` 480, `bass-sequenced` 500, `picked-rock-bass` 650) the sound acquires a midrange "voice" and starts competing with guitars and keys — this is the useful musical zone for a bass you want people to *hear* rather than only feel. Above about 1.5 kHz a bass stops being a bass and becomes a lead. And there is a hard ceiling you need to know about: the DSP clamps cutoff to `sample_rate × 0.16` (`skald-backend/core/codegen_nodes.odin::generate_filter_code`), which is 7056 Hz at 44.1 kHz and 7680 Hz at 48 kHz. Dial 15000 into the box and nothing above ~7 kHz will actually happen.

**Filter resonance.** In the generated code resonance is inverted into a damping term, `q = clamp(1/max(res, 0.1), 0.05, 1.9 − f)` (`skald-backend/core/codegen_nodes.odin::generate_filter_code`). Low damping means more ringing, so *bigger `resonance` = more emphasis*. At 1.0–1.5 (most of the "played instrument" patches) you get a gentle lift at the cutoff that reads as body. At 2.5–3 (`slap-bass` 2.6, `wobble-samplehold-bass` 3) the peak becomes a distinct vocal "quack" that follows the filter envelope. At 4 (`random-acid-bass`) it is a squelch — the resonant peak is louder than the harmonic it is sitting on, which is the entire TB-303 acid sound [Source: https://www.musicradar.com/news/producers-guide-to-the-roland-tb-303-and-clones]. Push it toward the 20 maximum and it rings hard, but note the honest gap: the damping floor of 0.05 means Skald's filter **never truly self-oscillates**. A real 303 does; this one gets loud and gets close.

**Amp attack.** Every bass patch here uses 0.5–30 ms. The reason is that attack is where "plucked" and "bowed" live. `slap-bass` uses 2 ms (`examples/instruments/bass/slap-bass.skald.json::sl-thumb-env`), `sub-808-glide-bass` 4 ms (`examples/instruments/bass/sub-808-glide-bass.skald.json::sub-amp`), `fretless-bass` 30 ms (`examples/instruments/bass/fretless-bass.skald.json::fl-amp`). Take an attack past ~50 ms and the note stops sounding struck and starts sounding faded-in; past 200 ms it will simply arrive late relative to the drums. The 0 end is not free either: an instant attack on a waveform that is not at zero produces a click, which is why the shortest attack in the folder is 0.5 ms and not 0.

**Amp decay and sustain together** decide the *shape* between the attack and the note-off. `palm-muted-bass` (decay 0.09, sustain 0.15, `examples/instruments/bass/palm-muted-bass.skald.json::pm-amp`) collapses to 15% almost immediately — that is what "muted" means. `sub-808-glide-bass` (decay 0.35, sustain 0.9, `examples/instruments/bass/sub-808-glide-bass.skald.json::sub-amp`) barely decays at all — an 808 is a long ringing tone. Everything in between is a dial between "chug" and "drone".

**Distortion drive and mix.** Drive is a gain into the curve; with the `soft` shape the curve is `tanh(x × drive)` (`skald-backend/core/codegen_nodes.odin::generate_distortion_code`). At drive 3 with a signal peaking near 0.8 you are already at `tanh(2.4) ≈ 0.98` — flat-topped. That is what `sub-808-glide-bass` does (`examples/instruments/bass/sub-808-glide-bass.skald.json::sub-sat`), and it gets away with it because `mix` is 0.22 (same node): 78% of what you hear is the untouched signal. Push `mix` toward 1.0 on that patch and the sub audibly *shrinks* — you will do this deliberately in the exercise. The useful zone for a sub is mix 0.15–0.3; for a mid-forward growl (`fm-growl-bass` mix 0.4, `wobble-samplehold-bass` 0.38, `random-acid-bass` 0.3) you can go higher because the filter has already removed most of the low end before the distortion sees it.

**Mapper `outMax`.** This is the "how much" knob for every modulation in the folder, and it is the one to grab when a patch is nearly right. `palm-muted-bass` maps its filter envelope to 0–650 Hz (`examples/instruments/bass/palm-muted-bass.skald.json::pm-filter-map`); `slap-bass` maps its to 0–4000 (`examples/instruments/bass/slap-bass.skald.json::sl-filter-map`). Same topology, six times the range, completely different instrument. Sweep `outMax` from 0 upward and you hear the filter envelope fade in from "no pluck" to "huge pluck" to "the filter is now a lead synth".

**`velocitySensitivity`.** The generated scale factor is `(1 − vs) + vs × velocity` (`skald-backend/core/codegen_nodes.odin::generate_adsr_code`). At the default 0.5, a velocity of 0.70 gives 0.85 and a velocity of 0.95 gives 0.975 — about 1.2 dB apart, which is nearly inaudible. At `vs = 1.0` the same two velocities give 0.70 and 0.95, about 2.7 dB apart, which reads clearly as accented and unaccented notes. If your sequenced bass line sounds flat and robotic, this is usually the parameter, not the notes.

### What "expose" does, and why you would

Every control in the parameter panel has a little chain-link button next to it (`skald-ui/src/components/ParameterPanel.tsx::ParameterPanel`). Clicking it adds the parameter's name to that node's `exposedParameters` array — that is all it does in the UI.

At code-generation time it does four things (`skald-backend/core/codegen_processor.odin::generate_processor_code`):

1. The value stops being baked in as a literal and becomes a field on the processor struct; every reference to it in the DSP becomes `p.<field>` (`skald-backend/core/param_utils.odin::get_f32_param`).
2. The current value in the patch becomes the field's initial value (`skald-backend/core/codegen_processor.odin::generate_processor_code`).
3. You get a typed setter, `<Asset>_set_<field>(p, value)`, with the min/max from `schema/nodes.json` clamped in (`skald-backend/core/codegen_processor.odin::generate_processor_code`).
4. The parameter appears in the asset's `<Asset>_PARAMS` introspection table with its name, range, default and unit (`skald-backend/core/codegen_processor.odin::generate_processor_code`), plus a string-keyed `set_param`/`get_param` pair.

Why you would: this is how the game drives the music. Expose a bass Filter's `cutoff` and the game can open the bass up as the player enters combat. Expose the amp ADSR's `release` and a stealth section can shorten every note. Expose the Distortion's `mix` and damage can dirty the bass progressively. The bass patches expose a sensible default set already — look at `examples/instruments/bass/sub-808-glide-bass.skald.json::sub-filter` (`cutoff`, `resonance`), `examples/instruments/bass/sub-808-glide-bass.skald.json::sub-amp` (the whole amp envelope), `examples/instruments/bass/sub-808-glide-bass.skald.json::sub-sat` (`drive`, `tone`, `mix`).

Two gotchas. First, exposure changes the *clamp*, and the clamp comes from `schema/nodes.json`, not from the UI slider — the two do not always agree. An exposed LFO's `frequency` clamps to 0.01–100 Hz at runtime (`schema/nodes.json::overrides`) but the panel's own slider stops at 50 Hz (`skald-ui/src/components/NodeParameterControls.tsx::NodeParameterControls`), so typing past 50 on the node card is the only way to reach the runtime ceiling — worth knowing on the Fretless and Reese patches, both of which expose LFO parameters. Second, `schema/nodes.json::overrides` contains node-type-specific overrides that exist precisely because the generic table was wrong: an exposed FM Operator `frequency` is a *ratio* clamped 0.01–32 (not 20–20000 Hz), and an exposed LFO `amplitude` gets a 0–20000 range because an LFO wired straight into a cutoff needs to swing in hertz, not in units.

---

## Try it (hands-on)

Four exercises. Do them in order; each one assumes the last.

### Exercise 1 — Take `sine-sub-bass` apart (10 minutes)

**Open File...** `examples/instruments/bass/sine-sub-bass.skald.json`. You get three nodes and two edges (`examples/instruments/bass/sine-sub-bass.skald.json::osc_1`, `examples/instruments/bass/sine-sub-bass.skald.json::adsr_1`, `examples/instruments/bass/sine-sub-bass.skald.json::output_1`):

```
Oscillator (Sine) ──output──▶ ADSR ──output──▶ Output
```

That is the smallest thing in Skald that counts as an instrument. Walk it in signal order.

1. **Click the Oscillator.** In the parameter panel you will see Waveform = Sine, Amplitude = 0.5, and a *Fixed Pitch* checkbox that is off. Notice the file stores `"frequency": 440` (`examples/instruments/bass/sine-sub-bass.skald.json::osc_1`) but there is **no frequency slider visible**. That is correct and deliberate: with Fixed Pitch off, the oscillator's pitch comes from the played note and the `frequency` value is inert (`skald-backend/core/codegen_nodes.odin::generate_oscillator_code`; the UI hides the box for the same reason, `skald-ui/src/components/Nodes/OscillatorNode.tsx::OscillatorNode`). The 440 in the file is the standard dormant fallback, not the note this patch plays. *Without this node there is no sound at all — everything else in Skald only shapes what an oscillator produces.*

2. **Press Play** in the sidebar (*Graph Actions*), then click the **Output** node and press its **Test Audio** button (`skald-ui/src/components/ParameterPanel.tsx::ParameterPanel`). You hear a short blip. It is not a sub. The audition always fires MIDI note 60 — middle C, 261.6 Hz — for 200 ms (`skald-ui/src/hooks/nodeEditor/useWasmAudioEngine.ts::useWasmAudioEngine`). Remember this: Test Audio is a "does anything come out" check, not a bass audition.

3. **Click the ADSR.** Attack 0.01, Decay 0.1, Sustain 1.0, Release 0.2 (`examples/instruments/bass/sine-sub-bass.skald.json::adsr_1`). Its input handle is labelled **In** — a deliberate correction, since it is not a gate: the generated code multiplies whatever arrives at `input` by the envelope (`skald-backend/core/codegen_nodes.odin::generate_adsr_code`) rather than switching on it. In Skald, ADSR **is** the VCA. *Without this node the tone would be a permanently-on drone that switches on and off with a click.*

4. **Break it deliberately.** Delete the ADSR (click it, press Delete), then drag a wire from the Oscillator's **Out** to the Output's **In**. Press Test Audio a few times. The note is louder — nothing is scaling it down — and it starts and stops as a flat block of tone with no shape at all. It does not click at the end: a voice with no ADSR anywhere in its graph now fades linearly to silence over the last 5 ms after its duration expires, instead of switching off on the sample where the duration ends (`skald-backend/core/codegen_processor.odin::generate_processor_code`, the `NOADSR_FADE_SECONDS` fade). What you lose by deleting the ADSR is not "no click" — codegen already prevents that for you — it is *shape*: no attack ramp, no decay, no sustain level, no release tail, just full volume for the note's whole duration and a fade-out too short to register as anything but an edge. Press Ctrl+Z twice to put the ADSR back.

5. **Break the ADSR instead of removing it.** Set Attack to 0 and Release to 0 in the parameter panel. Test Audio. With the ADSR still present, a release of 0 really does cut the envelope to zero on the sample the note ends — you get a genuine click at that end (the automatic no-ADSR fade from step 4 does not apply here, because an ADSR exists). Now set Attack to 2.0. Test Audio: nothing — the 200 ms audition ends long before a 2-second attack ramp gets anywhere. Put it back to 0.01 / 0.2.

6. **Hear why the sub layer is a sine.** Change the Oscillator waveform to **Sawtooth** and Test Audio. It is much brighter and much bigger-sounding — because a saw contains every harmonic. Now imagine that at 32 Hz with a kick drum on top: all those harmonics land in the 60–500 Hz range and fight everything else there. Switch back to Sine.

7. **Add the missing node.** This patch has no Filter, and it does not need one — a sine has nothing to filter. Drag a **Filter** in between the Oscillator and the ADSR anyway (delete the osc→ADSR wire, then osc→Filter `In`, Filter `Out`→ADSR `In`). Set its cutoff to 20000. Test Audio: unchanged. Now set it to 100 with the waveform still Sine and Test Audio: quieter but not obviously different in tone. That is the lesson — **a filter can only remove harmonics that exist.** Delete the Filter again.

*What the patch would be without each node, summarised:* no Oscillator → silence; no ADSR → the shapeless, 5 ms-faded tone from step 4, not a drone with no dynamics and no velocity response — either way, no expression; no Output → the graph builds fine and nothing reaches the speakers, because `output_left` is only ever added to by a GraphOutput node (`skald-backend/core/codegen_nodes.odin::generate_graph_output_adds`).

### Exercise 2 — Climb the ladder (25 minutes, or one rung at a time)

Load each patch, press Play, let its sequencer line run, and read the diff. The counts below are node and connection counts inside the Instrument's `subgraph` (or the whole graph, for the two loose ones).

---

**Rung 0 · `sine-sub-bass.skald.json` — 3 nodes, 2 edges, loose graph.**
Oscillator → ADSR → Output. Monophonic, no glide (`skald-backend/core/json.odin::build_project_from_graph_raw`).
*Idea: a note needs a shape.*

---

**Rung 1 · `sub-808-glide-bass.skald.json` — 5 nodes, 4 connections, wrapped in an Instrument.**
**Added vs Rung 0:** an Instrument wrapper with `voiceCount: 1`, `glide: 0.09`, `volume: 0.78` (`examples/instruments/bass/sub-808-glide-bass.skald.json::instrument-808-glide-bass`); a **Filter** (Lowpass, cutoff 180, resonance 0.8, `examples/instruments/bass/sub-808-glide-bass.skald.json::sub-filter`); a **Distortion** (`soft`, drive 3, tone 2200, mix 0.22, `examples/instruments/bass/sub-808-glide-bass.skald.json::sub-sat`); a sequencer track at 140 BPM (`examples/instruments/bass/sub-808-glide-bass.skald.json::track-808-glide-bass`); and a much longer amp envelope (A 0.004 / D 0.35 / S 0.9 / R 0.5, `examples/instruments/bass/sub-808-glide-bass.skald.json::sub-amp`).
*Ideas: glide, tone-taming, and gentle parallel saturation.*
Listen for the slide between the C1 at step 0 and the G1 at step 6 (`examples/instruments/bass/sub-808-glide-bass.skald.json::track-808-glide-bass`). It happens because `voiceCount` is 1, so every note after the first must steal the only voice, and glide only fires on steal (`skald-backend/core/codegen_processor.odin::generate_processor_code`). **Try this:** set `voiceCount` to 4 in the parameter panel and play again — the slides vanish, because there is now always a free voice. Set it back to 1.
Then find the Distortion (labelled *808 Saturation*) and drag `mix` from 0.22 up to 1.0. The note gets *brighter and smaller* — the low fundamental audibly loses weight. That is a memoryless waveshaper flattening the peak of a sine and converting fundamental energy into harmonics. Drag it back to 0.22.

---

**Rung 2 · `house-pluck-bass.skald.json` — 8 nodes, 7 connections.**
**Added vs Rung 1:** a second Oscillator — a Sub Sine at amplitude 0.35 (`examples/instruments/bass/house-pluck-bass.skald.json::pluck-sub`) — wired *directly* into the Filter's `input` alongside the saw, with no Mixer (`examples/instruments/bass/house-pluck-bass.skald.json::pluck-filter`); and a **second ADSR used as a filter envelope** (A 0.001 / D 0.09 / S 0.1 / R 0.07, `examples/instruments/bass/house-pluck-bass.skald.json::pluck-fenv`) feeding a **Mapper** (0→1 in, 0→2100 Hz out, `examples/instruments/bass/house-pluck-bass.skald.json::pluck-fenv-map`) into the Filter's `input_cutoff` (`examples/instruments/bass/house-pluck-bass.skald.json::pluck-filter`). `glide` drops to 0 (`examples/instruments/bass/house-pluck-bass.skald.json::instrument-house-pluck-bass`) and the amp envelope shortens hard (D 0.12 / S 0.2, `examples/instruments/bass/house-pluck-bass.skald.json::pluck-amp`).
*Ideas: layered fundamentals, and the filter envelope as the source of "pluck".*
The filter's own cutoff is 220 Hz (`examples/instruments/bass/house-pluck-bass.skald.json::pluck-filter`); the envelope adds up to ~2100 Hz on top. So each note snaps open to roughly 2.3 kHz and shuts back to ~430 Hz in 90 ms. **Try this:** click the Mapper (*Env 0-2100 Hz*) and drag `outMax` down to 0. The pluck disappears completely and you are left with a dull thud. Drag it to 6000. Now it is a lead. Land it back around 2100.

---

**Rung 3 · `fingered-electric-bass.skald.json` — 8 nodes, 7 connections.**
**Added vs Rung 2:** an explicit **Mixer** with two channels at levels 0.65 and 0.70 (`examples/instruments/bass/fingered-electric-bass.skald.json::fb-mixer`) instead of a direct sum; the Distortion is *removed*; the envelopes lengthen (amp D 0.12 / S 0.7, `examples/instruments/bass/fingered-electric-bass.skald.json::fb-amp`; filter env D 0.18 / S 0.25, `examples/instruments/bass/fingered-electric-bass.skald.json::fb-filter-env`); the filter env range narrows to 0–1200 Hz (`examples/instruments/bass/fingered-electric-bass.skald.json::fb-filter-map`) and cutoff drops to 340 (`examples/instruments/bass/fingered-electric-bass.skald.json::fb-filter`). BPM 100 (`examples/instruments/bass/fingered-electric-bass.skald.json::track-fingered-bass`).
*Idea: per-source level control, and the difference between "plucked" and "played".*
Compare the mixer levels to the oscillator amplitudes: Body is 0.42 (`examples/instruments/bass/fingered-electric-bass.skald.json::fb-body`) into a 0.65 channel; Sub is 0.50 (`examples/instruments/bass/fingered-electric-bass.skald.json::fb-sub`) into a 0.70 channel. Two gain stages in series, both audible. **Try this:** set Mixer channel 2 (the Sub) to 0 and listen — the line still has a clear pitch but nothing underneath it. Set channel 1 (the Body) to 0 instead — enormous on headphones, invisible on a laptop speaker. That is the entire argument for layering, in two clicks.

---

**Rung 4 · `picked-rock-bass.skald.json` — 11 nodes, 10 connections.**
**Added vs Rung 3:** a **Noise** node (White, amplitude 0.55, `examples/instruments/bass/picked-rock-bass.skald.json::pb-click`) with its own tiny ADSR (A 0.001 / D 0.03 / S 0, `examples/instruments/bass/picked-rock-bass.skald.json::pb-click-env`) as a third mixer channel at 0.35 (`examples/instruments/bass/picked-rock-bass.skald.json::pb-mixer`); a **Distortion** (`soft`, drive 8, mix 0.25, `examples/instruments/bass/picked-rock-bass.skald.json::pb-dist`) placed **before** the amp envelope (`examples/instruments/bass/picked-rock-bass.skald.json::pb-dist`); brighter cutoff at 650 (`examples/instruments/bass/picked-rock-bass.skald.json::pb-filter`) and a 0–1600 Hz filter env (`examples/instruments/bass/picked-rock-bass.skald.json::pb-filter-map`).
*Idea: the transient. Your ear identifies "pick" from a 30-millisecond noise burst.*
That noise ADSR has sustain 0, so it fires once at note-on and then goes idle (`skald-backend/core/codegen_nodes.odin::generate_adsr_code`) — it is a one-shot click generator, not a sustaining layer. **Try this:** set the Pick Click envelope's `decay` from 0.03 to 0.3. It stops being a pick and becomes a hi-hat glued to every note. Set it to 0.005: almost gone. Land back at 0.03.
Note the ordering: this is the only bass patch where Distortion sits *before* the amp envelope. That means the distortion always sees a full-level signal, so the timbre is identical from the start of the note to the end. Everywhere else (Rungs 1, 2, 8, 9, 10) distortion sits *after* the amp, so the grit fades as the note decays. Both are valid; they sound different, and you should know which one you asked for.

---

**Rung 5 · `slap-bass.skald.json` — 10 nodes, 9 connections.**
**Added vs Rung 4:** essentially nothing structural — the Distortion is *removed* — but four numbers change character completely. The noise burst shortens to 15 ms with a 0.5 ms attack (`examples/instruments/bass/slap-bass.skald.json::sl-thumb-env`); the filter env range explodes to 0–4000 Hz (`examples/instruments/bass/slap-bass.skald.json::sl-filter-map`); resonance climbs to 2.6 (`examples/instruments/bass/slap-bass.skald.json::sl-filter`) while cutoff drops to 240 (same node); and `velocitySensitivity` on the snap envelope goes to 0.8 (`examples/instruments/bass/slap-bass.skald.json::sl-thumb-env`).
*Idea: the same topology plus an extreme filter-envelope range equals a different instrument.*
A cutoff of 240 with a 4000 Hz envelope on top is a 16:1 sweep on every note, and at resonance 2.6 the peak is loud enough to be heard travelling. That is the "quack". **Try this:** drop the *Quack* filter's resonance from 2.6 to 1.0. The slap becomes an ordinary bass. Put it back.

---

**Rung 6 · `palm-muted-bass.skald.json` — 8 nodes, 7 connections.**
**Added vs Rung 5:** nothing. Everything is *subtracted*. Filter env range 0–650 Hz (`examples/instruments/bass/palm-muted-bass.skald.json::pm-filter-map`), filter env decay 0.05 with sustain 0.1 (`examples/instruments/bass/palm-muted-bass.skald.json::pm-filter-env`), amp decay 0.09 with sustain 0.15 (`examples/instruments/bass/palm-muted-bass.skald.json::pm-amp`), every sequencer note duration 1 step (`examples/instruments/bass/palm-muted-bass.skald.json::track-palm-muted-bass`), and `glide: 0` (`examples/instruments/bass/palm-muted-bass.skald.json::instrument-palm-muted-bass`).
*Idea: articulation is mostly subtraction. Short is a sound.*
At 140 BPM one step is 107 ms, so every note is a 107 ms chug. **Try this:** set the amp `sustain` from 0.15 to 0.9. The palm mute becomes an organ.

---

**Rung 7 · `fretless-bass.skald.json` — 9 nodes, 9 connections.**
**Added vs Rung 6:** an **LFO** (Sine, 5 Hz, amplitude 0.015, `bpmSync: false`, `examples/instruments/bass/fretless-bass.skald.json::fl-vibrato`) wired into **both** oscillators' `input_freq` ports (same node, fanned out to `fl-body` and `fl-sub`); `glide: 0.08` (`examples/instruments/bass/fretless-bass.skald.json::instrument-fretless-bass`); slow envelopes (amp A 0.03 / R 0.25, `examples/instruments/bass/fretless-bass.skald.json::fl-amp`; filter env A 0.06 / D 0.3, `examples/instruments/bass/fretless-bass.skald.json::fl-filter-env`); BPM 85 (`examples/instruments/bass/fretless-bass.skald.json::track-fretless-bass`).
*Idea: pitch modulation, and why `input_freq` is measured in octaves.*
An amplitude of 0.015 octaves is ±18 cents at 5 Hz — a human vibrato. The LFO card itself carries the warning (`skald-ui/src/components/Nodes/LFONode.tsx::LFONode`). **Break it:** set the Vibrato LFO's `amplitude` to 1.0. You now have a one-octave-deep siren, because the code computes `base × 2^input` (`skald-backend/core/codegen_nodes.odin::generate_oscillator_code`). Set it to 0.05 (≈60 cents) for an exaggerated but musical wobble, then back to 0.015.
Now the honest part: this patch is *named* for its glide, has `glide: 0.08`, and has `voiceCount: 4` (`examples/instruments/bass/fretless-bass.skald.json::instrument-fretless-bass`). With four voices and this note pattern, a note almost never has to steal a voice — so the glide almost never fires. Set `voiceCount` to 1 and play again. *Now* it is a fretless.

---

**Rung 8 · `synth-reese-bass.skald.json` — 8 nodes, 7 connections.**
**Added vs Rung 7:** `unison: 7` and `detune: 28` cents at the Instrument level (`examples/instruments/bass/synth-reese-bass.skald.json::instrument-reese-bass`); a single Sawtooth oscillator and nothing else in the audio path (`examples/instruments/bass/synth-reese-bass.skald.json::reese-osc`); and **two** modulation sources summed into one `input_cutoff` on `reese-filter` — a filter ADSR through a 0–1100 Hz Mapper (`examples/instruments/bass/synth-reese-bass.skald.json::reese-fenv-map`) and a 0.25 Hz LFO through a −1..1 → 0–500 Hz Mapper (`examples/instruments/bass/synth-reese-bass.skald.json::reese-sweep-map`). BPM 172 (`examples/instruments/bass/synth-reese-bass.skald.json::track-reese-bass`).
*Idea: detuning creates beating, and modulation sources add.*
Seven detuned saws spread over 28 cents produce slow amplitude beating as they drift in and out of phase — that is the Reese, and the beating gets faster as the note gets higher [Source: https://blog.landr.com/reese-bass/]. **Try this:** set `detune` to 0. It collapses into one flat saw. Set it to 100 cents (a full semitone): it becomes two chords fighting. The musical zone is roughly 10–40 cents.
Now the mono-compatibility lesson: this patch deliberately has **no sub sine**, because `unison`/`detune` would detune it too (`skald-backend/core/codegen_nodes.odin::generate_oscillator_code`). If you want a Reese *and* a solid sub, you need a second Instrument with `unison: 1` playing the same line — Skald cannot detune one oscillator and not another.
Also note the Mapper input ranges. The filter env Mapper uses `inMin: 0, inMax: 1` because an envelope is unipolar (`examples/instruments/bass/synth-reese-bass.skald.json::reese-fenv-map`); the LFO Mapper uses `inMin: -1, inMax: 1` because an LFO is bipolar (`examples/instruments/bass/synth-reese-bass.skald.json::reese-sweep-map`). Get this wrong and the Mapper clamps half your modulation away (`skald-backend/core/codegen_nodes.odin::generate_mapper_code`). **Break it:** change the sweep Mapper's `inMin` from −1 to 0 and listen — you lose the bottom half of the sweep, because every negative LFO value now clamps to `outMin`.

---

**Rung 9 · `fm-growl-bass.skald.json` — 8 nodes, 7 connections.**
**Added vs Rung 8:** an **FM Operator** (`frequency: 1` — a 1:1 ratio — and `modIndex: 190`, `examples/instruments/bass/fm-growl-bass.skald.json::growl-fm`) fed by a plain Sine oscillator on its `input_mod` port (same node); a BPM-synced 1/8 LFO through a Mapper into the *modulator oscillator's* `input_amp` (`examples/instruments/bass/fm-growl-bass.skald.json::growl-mod-osc`); Distortion at drive 7, mix 0.4 (`examples/instruments/bass/fm-growl-bass.skald.json::growl-drive`). Unison back to 1.
*Idea: frequency modulation, and modulating the modulator.*
FM works by using one oscillator to shove another oscillator's phase around. The number of significant sideband pairs is roughly the modulation index plus two, and they sit at `carrier ± k × modulator` [Source: https://ccrma.stanford.edu/software/clm/compmus/clm-tutorials/fm2.html]. A 1:1 ratio means every sideband lands on a harmonic of the played note, so the result stays *pitched* rather than bell-like; non-integer ratios are what give you metallic and inharmonic timbres [Source: same].
**Try this:** click the FM Carrier and drag `Ratio (× note)` from 1 to 1.41. The bass instantly turns into a gong. Drag it to 2: an octave-up harmonic growl. Back to 1.
**Break it:** drag `Mod Index` from 190 down to 8. The growl vanishes and you get something close to a plain sine — because at index 8 you only have about ten sideband pairs. Now drag it to 1000. It is noise. The FM Operator card in Skald says the musical range is roughly 1–8 (`skald-ui/src/components/Nodes/FMOperatorNode.tsx::FmOperatorNode`); this patch runs at 190 and gets away with it only because the 1:1 ratio keeps every sideband harmonic and the 480 Hz lowpass afterwards throws most of them away.

---

**Rung 10 · `wobble-samplehold-bass.skald.json` — 9 nodes, 8 connections.**
**Added vs Rung 9:** a **Sample & Hold** node, BPM-synced to 1/8 (`examples/instruments/bass/wobble-samplehold-bass.skald.json::wob-sh`), through a Mapper to 150–1900 Hz (`examples/instruments/bass/wobble-samplehold-bass.skald.json::wob-sh-map`), *and* a Triangle LFO synced to 1/4 (`examples/instruments/bass/wobble-samplehold-bass.skald.json::wob-lfo`) through a second Mapper to 0–900 Hz (`examples/instruments/bass/wobble-samplehold-bass.skald.json::wob-lfo-map`) — both landing on the same `input_cutoff` on `wob-filter`. Resonance 3, cutoff 160 (`examples/instruments/bass/wobble-samplehold-bass.skald.json::wob-filter`). `unison: 2, detune: 12` (`examples/instruments/bass/wobble-samplehold-bass.skald.json::instrument-wobble-sh-bass`).
*Idea: stepped modulation versus smooth modulation, layered.*
The S&H latches a new random value every eighth note and holds it — that is the "stepped" part of the wobble. The triangle LFO glides continuously underneath at half that rate. Together the cutoff travels roughly 310 Hz → 2960 Hz in a pattern that is rhythmic but never repeats exactly. Practitioners sync wobble LFOs to 1/4, 1/8 or 1/16 for slow, medium and fast [Source: https://www.musicradar.com/how-to/lfo-wobble-bass].
**Try this:** click the *Stepped 1/8* S&H and change its Rate dropdown to 1/16, then 1/4. Notice the **Rate (Hz)** box is not visible while BPM Sync is on — that is deliberate (`skald-ui/src/components/Nodes/SampleHoldNode.tsx::SampleHoldNode`), because a synced node ignores its free-run rate entirely (`skald-backend/core/codegen_nodes.odin::generate_sample_hold_code`). The `"rate": 8` sitting in the file (`examples/instruments/bass/wobble-samplehold-bass.skald.json::wob-sh`) does nothing.
**Break it:** set `voiceCount` from 4 to 1 and play the line again, then set it to 8. With more voices, overlapping notes each get their *own* S&H random stream and their own LFO phase (`skald-backend/core/codegen_processor.odin::generate_processor_code`), so the wobble smears. For any patch whose identity is a rhythmic modulation, `voiceCount: 1` is usually correct.

---

**Rung 11 · `random-acid-bass.skald.json` — 7 nodes, 6 connections.**
**Added vs Rung 10:** simplification plus extremes. One saw, one filter at cutoff 400 / **resonance 4** (`examples/instruments/bass/random-acid-bass.skald.json::acid-filter`), one amp, one distortion at drive 15 (`examples/instruments/bass/random-acid-bass.skald.json::acid-drive`), and a single 1/16-synced S&H mapped to a very wide 0–2500 Hz (`examples/instruments/bass/random-acid-bass.skald.json::acid-random-map`). `voiceCount: 1`, `glide: 0.04` (`examples/instruments/bass/random-acid-bass.skald.json::instrument-random-acid-bass`).
*Idea: high resonance plus a fast random sweep plus monophonic glide equals acid.*
This is a deliberate approximation of a TB-303: one oscillator, one resonant lowpass, an envelope on the cutoff, and a slide between notes [Source: https://www.musicradar.com/news/producers-guide-to-the-roland-tb-303-and-clones]. What Skald does differently is that the sweep here is *random* (S&H) rather than a per-note envelope, which is why it sounds like a 303 played by someone twisting the cutoff knob at random.
**Break it:** drag `resonance` from 4 up to 20. The filter rings violently and the pitch of the ring becomes more audible than the note. Then drag `drive` from 15 to 100 with mix still at 0.3 and listen to what happens to the bottom end. Put both back.

---

**Rung X · `lfo-filter-wobble-bass.skald.json` — 5 nodes, 4 edges, loose graph. The diagnostic rung.**
This patch is named for a wobble and does not audibly wobble. Load it and listen; then work out why. The LFO's `output` goes **straight** into the Filter's `cutoff` port with no Mapper (`examples/instruments/bass/lfo-filter-wobble-bass.skald.json::edge_1`). The LFO has no `amplitude` in the file, so the generated code uses its default of 1.0 (`skald-backend/core/codegen_nodes.odin::generate_lfo_code`). Modulation *adds* to the parameter (`skald-backend/core/param_utils.odin::get_f32_param`). So the cutoff travels from 149 Hz to 151 Hz. Two hertz.
**Fix it yourself:** drag in a **Mapper**, set `inMin: -1`, `inMax: 1`, `outMin: 0`, `outMax: 1200`, and put it between the LFO and the Filter. Now the cutoff travels 150 → 1350 Hz and the patch does what its name says. This is *why* every other patch in the folder has a Mapper: an LFO speaks in units of ±1, and a cutoff listens in hertz.

---

### Exercise 3 — Build a bass voice from an empty graph (15 minutes)

Start with a blank canvas. Press **Play** in the sidebar first so you can hear each step as you build; use the Output node's **Test Audio** button to fire a note (remember: it always plays C4 for 200 ms).

1. Drag an **Oscillator** from the palette onto the canvas. Set Wave = **Sine**. Nothing is audible — there is no Output.
2. Drag an **Output**. Wire Oscillator `Out` → Output `In`. Test Audio: a clicky blip. This is Rung 0 minus the envelope.
3. Drag an **ADSR**. Delete the osc→output wire. Wire Oscillator `Out` → ADSR `In`, ADSR `Env` → Output `In`. Set A 0.005 / D 0.2 / S 0.8 / R 0.2. Test Audio: the click is gone. *You now have a sub.*
4. Drag a second **Oscillator**. Leave it on **Sawtooth**, set Amp to 0.4. Wire its `Out` into the *same* ADSR `In` handle — the port sums (`skald-backend/core/param_utils.odin::get_f32_param`). Test Audio: much brighter, and you can hear the pitch clearly on a laptop. *You now have a layered bass.*
5. Drag a **Mixer**, set Inputs to 2. Rewire: Oscillator 1 → `input_1`, Oscillator 2 → `input_2`, Mixer `Out` → ADSR `In`. Set channel 1 to 0.7 and channel 2 to 0.5. Test Audio. Same sound, but now the balance is a knob instead of two amplitude fields.
6. Drag a **Filter**. Insert it between the Mixer and the ADSR. Set Type = Lowpass, Cutoff = 300, Res = 1.2. Test Audio: the saw's fizz is gone, the note is rounder.
7. Drag a second **ADSR** and a **Mapper**. Set the ADSR to A 0.002 / D 0.12 / S 0.2 / R 0.1. Set the Mapper to `inMin 0`, `inMax 1`, `outMin 0`, `outMax 1800`. Wire ADSR-2 `Env` → Mapper `In`, Mapper `Out` → Filter `Cut`. Test Audio. *That* is the pluck. Drag `outMax` up and down and listen to it appear and disappear.
8. Drag a **Distortion**. Insert it between the amp ADSR and the Output. Set Shape = `soft`, Drive = 6, Tone = 3000, Mix = 0.25. Test Audio: the note gains presence without losing weight, because 75% of it is untouched.
9. **Select all nine nodes** (drag a box around them) and press **Create Instrument** in the sidebar's *Grouping* section. Name it. The canvas collapses to one node, and a sequencer track appears at the bottom automatically (`skald-ui/src/hooks/sequencer/useInstrumentRegistry.ts::useInstrumentRegistry`).
10. Click the Instrument and set `Voice Count` to 1 and `Glide (s)` to 0.08. You now have a monophonic sliding bass.

Save it. This is the same architecture as Rung 2 with the Rung 3 mixer bolted on, and you built every wire.

### Exercise 4 — Make it a LINE, not a note (10 minutes)

Load `examples/instruments/bass/bass-sequenced.skald.json`. Six subgraph nodes, five connections: a Square oscillator with `pulseWidth: 0.3` labelled *Growl* (`examples/instruments/bass/bass-sequenced.skald.json::bass-growl`), a Sine *Sub* (`examples/instruments/bass/bass-sequenced.skald.json::bass-sub`), a two-channel Mixer at 0.7/0.9 (`examples/instruments/bass/bass-sequenced.skald.json::bass-mixer`), a Lowpass at 500 Hz / resonance 1.5 (`examples/instruments/bass/bass-sequenced.skald.json::bass-filter`), an amp ADSR (`examples/instruments/bass/bass-sequenced.skald.json::bass-amp`), and Output. Tempo 110, 16 steps (`examples/instruments/bass/bass-sequenced.skald.json::session`).

The line is six notes across one bar (`examples/instruments/bass/bass-sequenced.skald.json::track-bass`):

| Step | MIDI | Note | Velocity | Duration (steps) |
|---|---|---|---|---|
| 0 | 36 | C2 (65.4 Hz) | 0.95 | 2 |
| 3 | 36 | C2 | 0.72 | 1 |
| 5 | 43 | G2 (98.0 Hz) | 0.88 | 2 |
| 8 | 34 | A♯1 (58.3 Hz) | 0.92 | 2 |
| 11 | 34 | A♯1 | 0.70 | 1 |
| 13 | 31 | G1 (49.0 Hz) | 0.86 | 2 |

Pitches from `skald-backend/core/codegen_processor.odin::generate_processor_code` (`freq = 440 × 2^((note − 69)/12)`).

1. **Press Play on the sequencer transport.** One step is `60 / 110 / 4 = 136 ms`, so a duration of 2 is 273 ms and a duration of 1 is 136 ms (`skald-backend/core/codegen_project.odin::generate_sequencer_logic`). Sixteen steps is one bar.

2. **Count the rests.** Ten of the sixteen steps are empty. Steps 1, 2, 4, 6, 7, 9, 10, 12, 14 and 15 have nothing on them, and that silence is the groove. Right-click a step to erase a note (`skald-ui/src/components/Sequencer/StepGrid.tsx::handleMouseDown`); left-click an empty cell to paint one (same function; dragging across cells continues the paint via `skald-ui/src/components/Sequencer/StepGrid.tsx::handleMouseEnter`). **Fill in every empty step** and press Play. It turns into a drone with a pulse — no phrasing at all. Undo.

3. **Make velocity audible.** The ghost notes at steps 3 and 11 (velocity 0.70–0.72) are only about 1.2 dB below the accents, because `velocitySensitivity` is 0.5 and the generated scale is `(1 − vs) + vs × velocity` (`skald-backend/core/codegen_nodes.odin::generate_adsr_code`, patch value at `examples/instruments/bass/bass-sequenced.skald.json::bass-amp`). Click the Instrument, find the **Amp** section, and drag **Velocity Sens.** to 1.0. Play again. Now the same notes are 2.7 dB down and the line has an obvious accent pattern. This is the difference between a programmed bass and a played one.

4. **Change note length and hear the articulation.** Click the note at step 0 to select it. In the right-hand panel, set **Duration** from 2 to 1 (`skald-ui/src/components/Sequencer/StepPropertiesEditor.tsx::StepPropertiesEditor`). It shortens to 136 ms and the line gets bouncier. Set it to 6: it now overlaps the notes at steps 3 and 5. With `voiceCount: 4` (`examples/instruments/bass/bass-sequenced.skald.json::instrument-bass`) they simply stack. Set `voiceCount` to 1 and play again — now the long note gets stolen mid-flight, and because `glide` is 0.03 (same node) you hear a short slide into the stealing note. That is the mechanism behind every 808 slide (`skald-backend/core/codegen_processor.odin::generate_processor_code`).
Note that a note's total length is duration **plus** release: release is triggered when `voice.age` reaches the duration (`skald-backend/core/codegen_processor.odin::generate_processor_code`), and the amp release here is 0.1 s (`examples/instruments/bass/bass-sequenced.skald.json::bass-amp`).

5. **Drag-edit without the panel.** Hold **Shift** and drag a note horizontally to change its duration; hold **Ctrl** (or **Cmd**) and drag vertically for velocity; hold **Alt** and drag vertically for probability (`skald-ui/src/components/Sequencer/StepGrid.tsx::handleNoteMouseDown`). Set the note at step 11 to about 50% probability and play four bars — it now appears roughly half the time, gated by the processor's PRNG at runtime (`skald-backend/core/codegen_project.odin::generate_sequencer_logic`).

6. **The pitch trap.** Painting a new step **in the Step Grid** gives you MIDI note **60** — middle C, two octaves above where this bass line lives (`skald-ui/src/components/Sequencer/StepGrid.tsx::PAINT_PITCH`). The Piano Roll is the way out: it now draws the full MIDI range, 0 to 127 (`skald-ui/src/components/Sequencer/stepMetrics.ts::MIDI_NOTE_MIN`/`MIDI_NOTE_MAX`), and opens scrolled to middle C, so you can scroll down to the low notes this folder uses and click them in at the pitch you actually want. If you prefer to stay in the grid, paint the step there, select it, and **type the MIDI number** into the Note field in the Step Properties panel (`skald-ui/src/components/Sequencer/StepPropertiesEditor.tsx::StepPropertiesEditor`, range 0–127). Useful numbers: 24 = C1, 28 = E1, 31 = G1, 33 = A1, 36 = C2, 40 = E2, 43 = G2.

7. **Break the groove on purpose.** Set every note's velocity to 1.0 and every duration to 2. Play. It is mechanically correct and completely lifeless. That comparison is the point of the whole exercise: the notes were never the groove — the lengths, the rests and the accents were.

---

## Why you patch it this way

**Signal order is: sources → mix → filter → amp → colour → output.** Almost every patch in the folder follows it. There are reasons for each hop.

*Sources before the mix.* You need per-source level control before anything shared happens to them, because the balance between the sub and the body layer is the single decision that determines whether your bass survives on a phone. If you do not need per-source levels, skip the Mixer entirely — a port sums (`skald-backend/core/param_utils.odin::get_f32_param`), which is exactly what `examples/instruments/bass/house-pluck-bass.skald.json::pluck-filter` relies on.

*Filter before the amp.* Put them the other way round and the filter is chewing on a signal that has already been faded, which does nothing bad but also does nothing useful — and, more importantly, the filter's own resonant ring would be applied *after* the envelope decided the note was over, so release tails would ring on. Filter first is also how every hardware synth is wired, so it is what your ear expects.

*Filter envelope through a Mapper, always.* An envelope produces 0..1. A cutoff wants hundreds or thousands of hertz. The Mapper is the translator, and Rung X above shows exactly what happens when you leave it out. Match the Mapper's `inMin`/`inMax` to the *source*: 0..1 for an envelope, −1..1 for an LFO or S&H (`skald-backend/core/codegen_nodes.odin::generate_mapper_code` clamps anything outside the declared input range).

*Distortion after the amp, usually.* Put it after and the drive follows the envelope: loud at the attack, clean in the tail, which behaves like a very simple compressor and sounds natural. Put it before (as `examples/instruments/bass/picked-rock-bass.skald.json::pb-dist` does) and the timbre is constant for the whole note, which sounds more like an amplifier that is always cooking. Choose deliberately.

*Never distort a whole sub hard.* A waveshaper is memoryless: it generates harmonics at multiples of what you feed it, and once the peaks are flat, extra drive only converts fundamental energy into harmonics. The perceived sub gets *smaller* while the mids get louder. The standard studio answer is to split the signal and leave everything below roughly 80–120 Hz clean while distorting the mids [Source: https://unison.audio/multiband-distortion/]. Skald's Distortion node has no crossover, so you have two options that do work: (a) use `mix` as the parallel blend it is (`skald-backend/core/codegen_nodes.odin::generate_distortion_code`) and stay under about 0.3 on sub-heavy material, or (b) build the crossover yourself — fan the Mixer's output into two branches, put a **Highpass** Filter at 150 Hz followed by the Distortion on one branch, leave the other clean, and sum them in a second Mixer. Note that the Distortion's `tone` control does *not* do this job: it is a one-pole lowpass on the wet path only (`skald-backend/core/codegen_nodes.odin::generate_distortion_code`), so it tames distorted highs but does nothing to protect your low end.

*Keep the bass mono and centred.* Every Mixer channel in every bass patch has `pan: 0`. That is not laziness. Below about 80 Hz, stereo information turns into phase cancellation the moment anything sums to mono, and club systems, phones and vinyl all sum to mono [Source: https://www.producerspot.com/how-to-make-sub-bass-that-sits-in-the-mix-like-a-pro/].

*Monophonic for anything with a rhythmic identity.* Glide only fires on voice steal (`skald-backend/core/codegen_processor.odin::generate_processor_code`), so slides need `voiceCount: 1`. LFO phase and S&H random streams are per-voice (`skald-backend/core/codegen_processor.odin::generate_processor_code`), so a shared, coherent wobble also needs `voiceCount: 1`. Bass lines are monophonic in real life anyway.

*What breaks if you get the order wrong.* Put the Distortion before the Filter and the filter has to clean up harmonics you just paid to create — you will find yourself lowering the cutoff to compensate and losing the point of both nodes. Put the amp ADSR before the Mixer and the sub and body layers get separate envelopes, which is a legitimate technique but not the one the patch intended. Put an Oscillator downstream of a Delay or Reverb and codegen refuses outright, because those two run in the bus domain and an oscillator needs a voice (`skald-backend/core/codegen_analysis.odin::compute_bus_domain`).

---

## Going further

**Give the sub its own envelope.** Right now most patches share one amp ADSR across both layers. Split it: put a separate ADSR on the Sub oscillator with a longer decay and higher sustain, and a shorter one on the Body. The sub rings while the pluck snaps. Two ADSRs, two extra wires.

**Add a pitch envelope to the attack.** Real bass strings go slightly sharp for the first few milliseconds. Add an ADSR (A 0.001, D 0.03, S 0) → Mapper (`inMin 0`, `inMax 1`, `outMin 0`, `outMax 0.08`) → both oscillators' `input_freq`. Because `input_freq` is exponential (`skald-backend/core/codegen_nodes.odin::generate_oscillator_code`), 0.08 is about one semitone of upward blip. Set `outMax` to 1.0 instead and you have an 808 kick.

**Build a real band-split distortion.** As described above: fan the Mixer output into a Highpass Filter (150 Hz) → Distortion (drive 20, mix 1.0), and in parallel into a Lowpass Filter (150 Hz) left clean. Sum both into a second Mixer. This is the technique the multiband references describe, built out of Skald primitives, and it is a genuinely better answer than turning `mix` down.

**Sidechain-style ducking by hand.** Skald has no compressor, but the ADSR is a VCA. Route the bass through an extra ADSR and drive it with a sequencer track that fires on every kick step; set that ADSR to A 0.001 / D 0.12 / S 1.0 and invert your thinking — short duck, long recovery. Crude, and it works.

**Modulate two things from one envelope.** A Mapper's output can feed several targets. Take the filter envelope you already have and send it *also* through a second Mapper into the Distortion's `drive` (if you expose it) or into a Mixer channel level, so louder notes are also dirtier.

**Series vs parallel filters.** Two Lowpass filters in series at the same cutoff give you a steeper slope (roughly 24 dB/octave instead of 12) and a much more "closed" sound — closer to a real 303. Two filters in *parallel* — one Lowpass at 120 Hz, one Bandpass at 800 Hz, summed — gives you a sub and a formant peak that you can move independently. Try both on the acid patch.

**Layer two Instruments instead of two oscillators.** Because `unison`/`detune` are instrument-wide, the only way to have a detuned Reese *and* a clean mono sub is two Instrument nodes playing the same sequencer line: one with `unison: 7, detune: 28` containing only saws, one with `unison: 1` containing only a sine. Duplicate the track's notes onto both.

**Expose the right five things.** For a game bass, expose: the Filter `cutoff` (intensity), the Distortion `mix` (aggression), the amp `release` (space), the Instrument `volume` (ducking), and the filter-env Mapper `outMax` (attack character). Those five give a runtime system almost the whole emotional range of the instrument through five clamped float setters (`skald-backend/core/codegen_processor.odin::generate_processor_code`).

---

## Under the hood

**The oscillator.** For each unison copy `i`, the code offsets pitch by `(i/(n−1) − 0.5) × 2 × detune` cents, converts that to a ratio with `2^(detune/1200)`, advances a per-voice phase accumulator, and averages the copies before applying amplitude (`skald-backend/core/codegen_nodes.odin::generate_oscillator_code`). The waveform branch is chosen at codegen time, not at runtime, so only the shape you picked is emitted (same proc). Sawtooth is `(phase/π) − 1`; Square is a true duty-cycle comparator against `pulseWidth`; Triangle is `(2/π)·asin(sin(phase))`; Sine is `sin(phase)`. These are naive (not band-limited) shapes, so at bass frequencies they are clean, and at high frequencies they alias.

**The filter** is a Chamberlin state-variable filter, three lines per sample (`skald-backend/core/codegen_nodes.odin::generate_filter_code`):

```
f    = 2·sin(π · cutoff / sample_rate)
low += f · band
high = input − low − q · band
band+= f · high
```

with `q = clamp(1 / max(resonance, 0.1), 0.05, 1.9 − f)` and `cutoff = clamp(cutoff, 10, sample_rate × 0.16)`. Lowpass takes `low`, Highpass takes `high`, Bandpass takes `band`, Notch takes `high + low` (same proc). Both clamps exist because the integrator diverges without them, and the damping floor of 0.05 is why the filter rings hard but never self-oscillates forever.

**The envelope** is four linear segments driven by `voice.age`, and it doubles as a VCA:

```
node_out = input × envelope × depth × ((1 − velSens) + velSens × velocity)
```

(`skald-backend/core/codegen_nodes.odin::generate_adsr_code`). When nothing is wired to its `input`, `input` is the literal `1.0` (same proc) and the node outputs the bare envelope — that is what makes the same node usable as both an amplifier and a modulation source. Sustain is a level, not an exit ramp: even a sustain of 0 holds in the Sustain stage — waiting on `note_off` or the note's duration — rather than auto-idling, so a held note whose envelope only shapes a filter does not go silent early and lose its release (`skald-backend/core/codegen_nodes.odin::generate_adsr_code`, fixed as SKB-041).

**Glide** is a one-pole approach to the target frequency, one step per sample: `current += (target − current) × (1 / max(glide_time × sample_rate, 1))`, snapping when the gap drops below 0.1 Hz (`skald-backend/core/codegen_processor.odin::generate_processor_code`). It is armed only when `note_on` stole a busy voice (same proc).

**The Mapper** is a clamped linear interpolation: `lerp(outMin, outMax, clamp((input − inMin)/(inMax − inMin), 0, 1))`, with a runtime guard that turns a zero-width input range into 1.0 so nothing divides by zero (`skald-backend/core/codegen_nodes.odin::generate_mapper_code`).

**Distortion** shapes, lowpasses the wet path, then blends:

```
wet   = tanh(input × drive)                  // "soft"
tone += k · (wet − tone),  k = 2π·tone_hz/fs // one-pole LP, wet only
out   = input·(1 − mix) + tone·mix
```

(`skald-backend/core/codegen_nodes.odin::generate_distortion_code`). The `classic` shape uses `(π + k)·x / (π + k·|x|)` instead, `hard` is a plain clamp, `asymmetric` shapes only the negative half (all in the same proc).

**The sequencer** recomputes `samples_per_step = sample_rate × 60 / (bpm × 4)` every call, accumulating the fractional remainder so long renders never drift (`skald-backend/core/codegen_project.odin::generate_sequencer_logic`). Sixteenth notes, so 16 steps is one bar. Each event fires `note_on(note, velocity, duration_in_steps × 60/bpm/4)` (same proc), and MIDI note numbers become hertz with the standard `440 × 2^((n − 69)/12)` (`skald-backend/core/codegen_processor.odin::generate_processor_code`). Finally, each instrument's output is scaled by its `volume` (`skald-backend/core/codegen_processor.odin::generate_processor_code`) and the project sum passes through `tanh(x × master_volume)` as a soft limiter (`skald-backend/core/codegen_project.odin::generate_project_code`).

---

## Terms introduced

- **Fundamental** — the slowest repetition in a sound; the frequency your brain calls "the note".
- **Harmonic** — a component at a whole-number multiple of the fundamental.
- **Sub-bass** — roughly 20–60 Hz; felt more than heard as pitch.
- **Bass** — roughly 60–250 Hz; where most rhythm-section fundamentals live.
- **Low mids** — roughly 250–500 Hz; where "mud" accumulates.
- **Missing fundamental** — the perceptual reconstruction of a low note from its harmonics alone, on a speaker that cannot reproduce the fundamental.
- **Mono compatibility** — whether a sound survives having its left and right channels summed together.
- **Phase cancellation** — two copies of a signal partially or wholly nulling each other when summed.
- **Beating** — the slow pulsing produced when two slightly detuned tones drift in and out of phase.
- **Transient** — the first few tens of milliseconds of a note; the main cue your ear uses to identify how a note was produced.
- **Filter envelope** — a second envelope wired to the filter's cutoff, used to open the filter briefly at note start.
- **Pluck** — the perceptual result of a fast filter-envelope attack and a short decay.
- **Portamento / glide / slide** — a continuous pitch bend from one note to the next instead of a jump.
- **Voice stealing** — reassigning an already-sounding voice to a new note when all voices are busy.
- **Polyphony / voice count** — how many notes an instrument can sound simultaneously.
- **Unison** — extra detuned copies of an oscillator, played together.
- **Detune** — the pitch spread between unison copies, measured in cents (100 cents = one semitone).
- **Resonance (Q)** — emphasis of frequencies right at a filter's cutoff point.
- **Self-oscillation** — a resonant filter ringing indefinitely with no input.
- **Waveshaper** — a memoryless distortion that maps each input sample to an output sample through a fixed curve.
- **Parallel processing** — blending a processed copy of a signal back with the untouched original.
- **Band-splitting / multiband** — dividing a signal into frequency bands and processing them separately.
- **Sample & hold** — a modulator that latches a new random value at a fixed rate and holds it until the next.
- **Modulation index (FM)** — the depth of phase modulation; roughly index + 2 significant sideband pairs.
- **Sideband** — a frequency component created by modulation, sitting at `carrier ± k × modulator`.
- **Carrier-to-modulator ratio** — integer ratios give harmonic (pitched) FM tones; non-integer ratios give metallic, bell-like ones.
- **V/Oct (exponential pitch modulation)** — a pitch input measured in octaves rather than hertz.
- **Voice domain / bus domain** — Skald's split between per-voice DSP and DSP that runs once on the summed output.
- **Velocity sensitivity** — how much a note's velocity scales its envelope.
- **P-lock (parameter lock)** — a per-step parameter override in the sequencer.

---

## Known issues

Defects that touch this chapter are tracked centrally in the **Known issues** chapter (`KNOWN-ISSUES.md`): KI-002, KI-005, KI-013, KI-014, KI-015, KI-023, KI-037, KI-039, KI-053. Deliberate design limits — things Skald does not do on purpose — are collected in **What Skald deliberately does not do**.
