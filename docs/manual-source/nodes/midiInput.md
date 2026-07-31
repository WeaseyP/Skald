# MIDI Input

> The node that turns "somebody pressed a key" into three numbers your patch can actually use: how high the note is, whether the finger is still down, and how hard it was hit.

## What it is

Sound doesn't know about keyboards. An oscillator only knows a frequency in hertz; a filter only knows a cutoff in hertz; an amplifier only knows a gain number. A keyboard, meanwhile, produces *events* — "note 60 started, hard" and "note 60 stopped". Something has to sit between the two and translate. Historically that something was a box called a **keyboard CV interface**, and the translation it performed is the whole reason electronic instruments respond to playing at all.

The translation has three parts, and they map exactly onto the three outputs of this node.

**Pitch.** MIDI numbers notes as integers: middle C is 60, the A above it is 69, and each step of 1 is one **semitone** (the smallest interval on a piano — the gap between a white key and the black key next to it). To turn that integer into hertz you need one anchor and one ratio. The anchor is A4 = 440 Hz = note 69. The ratio comes from **equal temperament**, the tuning system Western music has used for roughly three centuries, in which an octave (a doubling of frequency) is divided into twelve identical steps, so one semitone multiplies frequency by 2^(1/12) ≈ 1.0595. Put those together and you get the formula every synthesiser in the world uses: *f = 440 × 2^((n − 69)/12)* [Source: https://newt.phys.unsw.edu.au/jw/notes.html]. Middle C (60) lands on 261.63 Hz; A5 (81) lands on 880 Hz, exactly double A4, as an octave must be.

Notice that the formula is *exponential*, not linear. Twelve semitones up doesn't add a fixed number of hertz, it doubles. This is why the analogue world settled on **1 volt per octave** (1V/oct) rather than volts-per-hertz: the control signal is the *exponent*, and the oscillator does the doubling. One volt up, one octave up, at any starting pitch [Source: https://www.perfectcircuit.com/signal/what-is-cv-gate]. Skald's Pitch output speaks this language: it emits octaves, not hertz. That matters enormously and is the single most common thing people get wrong with this node — see [The controls](#the-controls).

**Gate.** A **gate** is the "finger is down" signal: high while the key is held, low the instant it is released. Its cousin the **trigger** is a momentary blip at the moment of the press, with no information about the release [Source: https://www.perfectcircuit.com/signal/what-is-cv-gate]. The distinction is musically enormous: a gate lets an envelope know when to *let go*, which is what makes a held organ chord different from a plucked string. Every sustain you have ever heard from a synth exists because a gate stayed high.

**Velocity.** MIDI encodes how hard a key was struck as a 7-bit number, 1–127. Zero is reserved: a note-on with velocity 0 is defined to *mean* note-off, which is why the usable range is 127 values and not 128 [Source: https://melatonin.dev/blog/doing-my-synthesizer-homework-the-quirks-of-midi-velocity/]. Skald normalises this to 0.0–1.0 before it reaches your patch.

Here is the part beginners routinely miss: **velocity is not volume.** On an acoustic instrument, hitting harder doesn't just move more air, it changes the *timbre* — a hard-struck piano string is brighter and more percussive, not merely louder. If you wire velocity only to level, you get a synth that sounds like someone riding a volume fader. The idiomatic move, and the one the example patch in this chapter uses, is to send velocity to **both** amplitude and filter brightness, so playing harder opens the tone up [Source: https://melatonin.dev/blog/doing-my-synthesizer-homework-the-quirks-of-midi-velocity/] [Source: https://yamahasynth.com/learn/montage-series-synthesizers/montage-velocity-sensitivity/]. Percussive patches — drums, plucks, stabs — are the exception where velocity-to-volume alone works well.

**MPE** (MIDI Polyphonic Expression) is the modern extension of all this. In ordinary MIDI, a pitch bend or a modulation message applies to the whole channel, so bending one note in a chord bends all of them. MPE fixes that by giving every sounding note its own temporary MIDI channel (typically channels 2–16), so pitch bend, pressure and CC74 "brightness" can be addressed to a single finger. Controllers built for it sense three dimensions of touch: press (continuous pressure), slide along the key (timbre), and glide across the keyboard (per-note pitch), and the spec defaults each per-note channel to a ±48-semitone bend range so a finger can travel a long way [Source: https://www.soundonsound.com/sound-advice/mpe-midi-polyphonic-expression] [Source: https://midi.org/midi-polyphonic-expression-mpe-specification-adopted]. The price is that polyphony caps at 15–16 simultaneous notes, one per channel. **Skald's MIDI Input node has an MPE checkbox, but nothing in the codebase implements it** — see [Code-vs-intent notes](#code-vs-intent-notes).

## What it looks like in Skald

It is the last entry in the node palette on the left, coloured yellow (`#F6E05E`) to mark it as an *external input* rather than a sound source or a processor — `Sidebar.tsx:280`, `NodeStyles.ts:102`. Its palette tooltip reads "Pitch (V/Oct), gate and velocity signals from your MIDI device", which is an accurate description of the units; keep it in mind.

**Handles.** Three, all on the right, all outputs (`type="source"`):

| Handle id | Label on the node | Carries |
|---|---|---|
| `pitch` | Pitch | Octaves relative to A4 (V/oct) |
| `gate` | Gate | 1.0 while held, 0.0 after release |
| `velocity` | Vel | 0.0–1.0 |

Cited to `MidiInputNode.tsx:12-16` (port list) and `:23` (all three rendered as `Handle type="source" position={Position.Right}`). There are **no input handles** — nothing can be wired *into* a MIDI Input. The backend agrees: `graph_validate.odin:57` lists `MidiInput` among the types that return `nil, true` from the input-port table, commented "sources only — no modulation inputs". Try to wire into it and codegen exits with an error.

The backend also validates the port names you wire *out* of. `graph_validate.odin:66-70` accepts only `pitch`, `gate`, `velocity` (plus the generic `""`/`"output"`, allowed for every node at `:64`), and a typo produces an explicit error naming the three valid ports (`graph_validate.odin:105-112`) rather than a silently dropped wire.

**Where it can live.** MIDI Input is *voice-coupled*: its outputs are read out of the per-voice state, so it only exists inside the per-voice loop. `codegen.odin:55-62` lists it alongside Oscillator, ADSR, FmOperator and Wavetable in `is_voice_coupled_type`. Two consequences, both enforced with a hard error:

- It cannot sit downstream of a Delay or Reverb, because everything after those runs once per sample on the *summed* voices, where no single voice exists (`codegen.odin:80-96`).
- Its port outputs cannot feed anything in that post-effect bus either — there is a dedicated check and error message for exactly this at `codegen.odin:98-110`: *"Route MIDI signals through per-voice nodes before any Delay/Reverb."*

**Rate.** Audio rate, in the sense that the three values are recomputed every sample inside the voice loop (`codegen.odin:1820-1821` dispatches to `generate_midi_input_code` in the voice-domain emission pass). But they only *change* at note boundaries and at note-off, so treat them as control signals: they are stair-steps, not waveforms.

**The other place it appears.** Dropped on the top-level canvas (not inside an instrument) and wired to an Instrument node, a MIDI Input contributes a `midi_config` block — device name and channel — to that instrument in the exported project JSON (`projectSerializer.ts:128-143`, pinned by `ProjectSerializerPipeline.test.ts:248-259`). This is a separate role from the three signal ports, and as of today the generated Odin never reads that block; see the notes at the end.

## The controls

| Parameter | Range | Default | Unit | What it does to the sound |
|---|---|---|---|---|
| `device` | `"All"`, `"Device A (Mock)"`, `"Device B (Mock)"` | `"All"` | — | Which MIDI hardware to listen to. Nothing at all, today: the preview listens to every attached input regardless. |
| `useMpe` | `true` / `false` | `false` | — | Draws an "MPE Active" badge on the node. No DSP anywhere reads it. |

Defaults: `node-definitions.ts:181-185`. Types: `types.ts:145-148` (`device: string`, `useMpe: boolean`). The dropdown options and the checkbox: `ParameterPanel.tsx:363-374`. Neither parameter has an entry in `param_ranges.odin` — they aren't numeric, so `lookup_param_range` falls through to the unknown-parameter fallback at `param_ranges.odin:153-157`, `{-1e6, 1e6, 0.0, ""}`.

The real "controls" of this node are its three output ports. Their ranges come from `generate_midi_input_code` at `codegen.odin:717-730`:

| Output | Expression emitted | Range for MIDI notes 0–127 | Unit |
|---|---|---|---|
| Pitch | `(f32(voice.note) - 69.0) / 12.0` (`codegen.odin:723`) | −5.75 … +4.83 | octaves (V/oct) |
| Gate | `1.0`, set to `0.0` once `voice.time_released > 0.0` (`codegen.odin:726-727`) | 0.0 or 1.0 | — |
| Velocity | `voice.velocity` (`codegen.odin:729`) | 0.0 … 1.0 | — |

### What you hear as you sweep each one

**Pitch.** This is the one that will bite you, so read carefully. Skald oscillators **already track the played note without any wire at all** — `codegen.odin:129` sets the oscillator's base frequency to `voice.current_freq`, which `codegen.odin:1387` filled in with `440.0 * math.pow(2.0, (f32(note) - 69.0) / 12.0)` when the note started. The Pitch port is therefore not "the note", it is *an extra transposition in octaves* applied on top of the note. Modulation into `input_freq` is exponential: `base * 2^(sum)`, with the exponent clamped to ±10 octaves so a hot modulation source can't overflow the float and latch the phase to NaN (`codegen.odin:151-156`).

So if you wire Pitch straight into an oscillator's `input_freq`, you get `440 × 2^((n−69)/12) × 2^((n−69)/12)` = `440 × 2^((n−69)/6)`. The keyboard now tracks at **two semitones per key**. Play C4 and C5 and they come out two octaves apart (155.6 Hz and 622.3 Hz) instead of one (261.6 and 523.3). It is not subtle, and you will hear it in step 4 of the exercise below.

The useful zone for Pitch is *deliberate* transposition and pitch-tracked modulation: send it through a Mapper scaled to ±1 to detune a second oscillator by a fixed interval, or use it as the "keyboard tracking" source for a filter so the cutoff rises with pitch and high notes don't sound duller than low ones. Small values are musical — 0.0833 is one semitone, 0.5 is a tritone, 1.0 is an octave. Beyond about ±4 the sound leaves the useful band: down there you are below the fundamental of a bass guitar, up there you are past the top of a piccolo and heading for the sample-rate ceiling.

**Gate.** Two values, no in-between, so there is nothing to sweep — but there *is* something to understand. Gate goes high the moment a voice is allocated and drops to 0 as soon as `time_released` is stamped, which happens either at note-off (`codegen.odin:1470`) or when a fixed-duration note runs out (`codegen.odin:1759-1766`). The key point is that Skald's ADSR does **not** need this wire. Envelopes are driven by a separate per-voice stage machine that note-on and note-off flip directly (`codegen.odin:1404-1410` and `codegen.odin:1477`). The ADSR's `input` port is a *signal to be multiplied by the envelope* (`codegen.odin:285`: `out = input * envelope * depth * vel_scale`), not a trigger. Wire Gate into it and you are multiplying the envelope by 1 while held and by 0 the instant you release — which chops the release tail off dead. That is audible, it is what the shipped example patch does, and you will hear it and fix it in step 8.

Gate's genuinely useful destinations are the ones where you want a hard on/off: a VCA's `input_gain` for a gated, organ-like articulation with no envelope at all, or as a multiplier on a modulation path you want silenced during the release.

**Velocity.** Linear 0.0 to 1.0, straight from the note event. In the preview it is `data2 / 127` from the incoming Web MIDI message (`useWasmAudioEngine.ts:373`); from the sequencer it is the per-step Vel slider, 0–100% (`StepPropertiesEditor.tsx:207-213`), defaulting to 1.0 on a freshly placed note (`useSequencerState.ts:100`).

At the bottom of the range (0.0–0.15) you get whatever your patch does when barely touched — with the example patch, a soft, dull, half-volume note. In the middle (0.4–0.7, the zone most DAWs put default notes in: Logic writes 80/127, Ableton 100/127 [Source: https://melatonin.dev/blog/doing-my-synthesizer-homework-the-quirks-of-midi-velocity/]) you should be hearing a clear tonal change, not just a level change. At 1.0 the patch should be at its brightest and loudest. If a sweep from 0 to 1 only changes loudness, your patch is under-using velocity; find a filter cutoff to send it to as well.

One thing to know about Velocity's *other* route into your sound: the ADSR node has its own `velocitySensitivity` parameter, range 0.0–1.0, default 0.5 (`param_ranges.odin:70-71`), which scales the envelope by `(1 − vs) + vs × voice.velocity` (`codegen.odin:284`). At 0 the envelope ignores velocity entirely; at 1 a velocity-0 note is silent; at the 0.5 default a softly played note comes out at half level. This happens *without any wire from the MIDI Input node* — every ADSR is velocity-sensitive by default. You use the Velocity port when you want velocity to reach somewhere *else*, typically a filter.

### Exposing a parameter

The link icon next to a parameter in the panel toggles **exposure** (`ParameterPanel.tsx:228-236`, tooltip: *"Expose … to public API"*). An exposed parameter stops being a constant baked into the generated DSP and becomes a real field on the processor struct, with a typed setter, an entry in the introspectable `<Foo>_PARAMS` table carrying its min/max/default/unit, and a string-keyed `set_param` case (`codegen.odin:1160-1233` builds the resolution table; `param_utils.odin:79-85` makes the generator emit `p.<field>` instead of a literal). That is what lets a game change the sound at runtime — sweep a filter as the player enters a cave, raise a pad's release as tension builds — without regenerating any code.

For MIDI Input specifically, exposure is a dead end. The node ships with **both** parameters already in `exposedParameters` (`node-definitions.ts:184`), the panel gives you no toggle to switch them off (`device` is rendered with `isExposable = false` at `ParameterPanel.tsx:369`; the MPE checkbox at `:371-374` bypasses the wrapper entirely), and the exposure resolver only reads numeric defaults — its `#partial switch` at `codegen.odin:1193-1198` handles `json.Float` and `json.Integer` and nothing else. A string and a bool therefore both resolve to `0.0` with the ±1e6 fallback range. Generate the example patch and you will find `device: f32` and `useMpe: f32` on the processor struct, initialised to zero, with setters and PARAMS rows, wired to nothing. Harmless, but ignore them.

## Try it (hands-on)

Open `examples/instruments/winds/midi-setup/sax3.json`. One instrument, named **sax**: 8 voices, glide 0.05 s, unison 1, detune 5 cents (`sax3.json:13-17`). Inside it, seven nodes — Oscillator (sawtooth, amp 0.5), Filter (lowpass, cutoff 857 Hz, resonance 1.91), ADSR (A 0.053 / D 0.24 / S 0.82 / R 0.213), VCA (gain 0), Mapper (0–1 in, 400–3000 out), Output, and our MIDI Input (`sax3.json:22-210`). The wiring that matters (`sax3.json:231-266`): MIDI Input `pitch` → Oscillator `input_freq`; MIDI Input `gate` → ADSR `input`; MIDI Input `velocity` → Mapper → Filter `input_cutoff`; ADSR → VCA `input_gain` and also → Filter `input_cutoff`.

You do not need a MIDI keyboard. The sequencer will do everything.

1. **Select the `sax` instrument node.** The parameter panel fills with an "Internal Nodes" list — every node inside the instrument, MIDI Input among them, showing MIDI Device = *All Devices* and Enable MPE unchecked (`ParameterPanel.tsx:309-316`, `:363-374`). This is where you'll edit values in the steps below.

2. **Put two notes in.** The project already carries an empty sequencer track called "sax" (`sax3.json:284-295`). Open its piano roll and place a note on step 1 at **C4** (MIDI 60) and a note on step 9 at **C5** (MIDI 72). The roll spans A0–C6 (`PianoRoll.tsx:20-21`), so both are on screen with room to spare below. New notes default to velocity 1.0.

3. **Press play.** You hear two saw-ish notes, second higher than the first.

4. **Listen to the interval — this is the lesson.** Sing the two notes. They are not an octave apart; they are *two* octaves apart. The math: the oscillator's base frequency is already the played note (`codegen.odin:129`), and the Pitch wire multiplies that again by 2^((n−69)/12) (`codegen.odin:151-156`, `codegen.odin:723`). C4 comes out at 155.6 Hz and C5 at 622.3 Hz instead of 261.6 and 523.3. Every key on your keyboard is worth two semitones.

5. **Fix it.** Select the sax instrument and click **Explode Instrument** in the sidebar (`Sidebar.tsx:229-235`) to spread its guts onto the canvas. Delete the wire from MIDI Input `Pitch` to the Oscillator's `input_freq`. Select all the exploded nodes and click **Create Instrument** (`Sidebar.tsx:218`) to collapse them back. Play again: C4 and C5 are now exactly an octave apart, and the pitch is correct in absolute terms too. **Remember this**: in Skald, oscillators track the note for free. The Pitch port is a transpose, not the note.

6. **Now hear velocity.** Click the note on step 1 and drag its **Vel** slider down to about **10%** (`StepPropertiesEditor.tsx:207-213`). Play. That note is now noticeably duller *and* quieter than the C5 at full velocity. Two things happened at once: the Mapper turned velocity 0.1 into 400 + 0.1 × 2600 = 660 Hz of extra cutoff, so the filter sits at roughly 1.5 kHz instead of 3.9 kHz (`codegen.odin:323` sums modulation onto the base cutoff; `param_utils.odin:138-155` shows modulation is *added*, not substituted), and the ADSR's own velocity sensitivity of 0.5 scaled the level to 0.5 + 0.5 × 0.1 = 0.55 (`codegen.odin:284`). That combination — brighter *and* louder with harder playing — is what makes velocity sound like an instrument instead of a fader.

7. **Break it #1: run out of filter.** In the Mapper's controls, drag **Output Max** from 3000 up to **10000** (`ParameterPanel.tsx:355` allows ±10000). Set the step-1 note back to 100% velocity and play both notes. The dynamics at the top of the velocity range flatten out: everything above roughly velocity 0.6 sounds the same. The reason is in `codegen.odin:339` — the state-variable filter clamps its cutoff to `sample_rate * 0.16`, about 7 kHz at 44.1 kHz, because the integrator diverges to infinity beyond ~fs/6. Your Mapper is asking for 10.8 kHz and getting 7 kHz, so the whole upper half of your velocity range maps to the same clamped value. Lesson: a modulation range wider than the destination can use doesn't give you *more* expression, it gives you *less*. Put Output Max back to 3000.

8. **Break it #2: the missing release.** In the ADSR controls, drag **Release** up to about **2.0 s** and play. You expect a long saxophone-ish fade. You get none — the note stops dead. Look at the wiring: MIDI Input `gate` → ADSR `input`, and the ADSR emits `out = input * envelope * depth * vel_scale` (`codegen.odin:285`). Gate flips to 0.0 the instant `time_released` is stamped (`codegen.odin:726-727`), which multiplies the entire envelope — release stage included — by zero. Explode the instrument, delete the Gate → ADSR wire, and re-collapse. Play again: the 2-second tail is there. The gate wire was never needed, because note-off already drives the envelope's stage machine directly (`codegen.odin:1477`). Lesson: **in Skald, Gate is a multiplier, not a trigger.**

9. **Optional, if you have a keyboard.** Plug in any USB MIDI controller and press keys while the transport is running. Skald grabs every attached input via the Web MIDI API and forwards note-on/note-off to every instrument in the project (`useWasmAudioEngine.ts:361-406`). Play soft and hard and listen to the filter open. Note that you never had to touch the Device dropdown — and that it would have made no difference if you had.

## Why you patch it this way

The reliable pattern is: **let the note drive pitch implicitly, and use the MIDI Input node only for the things the note does *not* do for free.**

Nothing needs to feed a MIDI Input — it has no inputs, by design (`graph_validate.odin:57`). What it feeds is where the thinking happens:

- **Velocity → Mapper → Filter `input_cutoff`.** The single most valuable use of this node. It has to go through a Mapper because modulation into a hertz-valued parameter is *added* to it (`param_utils.odin:138-155`), and velocity's native 0–1 range would add at most one hertz to an 857 Hz cutoff — completely inaudible. The Mapper rescales 0–1 into a useful hertz span; 400–3000 Hz in the example patch is a sane starting point for a bright-but-not-harsh sweep. Get the order wrong (velocity straight into `input_cutoff`, no Mapper) and you will swear velocity is broken. It isn't; it's just 1 Hz of it.
- **Velocity → Mapper → almost any other quantity.** Distortion drive, reverb send, LFO depth. Same rule: check the destination's units first, then set the Mapper's output range to match.
- **Pitch → Mapper → Filter `input_cutoff`** for keyboard tracking, or **Pitch → a second Oscillator's `input_freq`** when you *want* a fixed interval on top of the played note. Both are deliberate transpositions of a signal that is already correct on its own.
- **Gate → VCA `input_gain`** for an envelope-free, hard-gated articulation.
- **Gate → ADSR `input`.** Don't. See step 8.
- **Pitch/Gate/Velocity → Output.** Meaningless. These are control signals in octaves and normalised units, not audio.

Order matters in one hard-enforced way: everything a MIDI Input touches must be in the per-voice part of the graph, before any Delay or Reverb. Codegen refuses to build otherwise, with a message telling you exactly which node crossed the line (`codegen.odin:98-110`). This isn't fussiness — a reverb holds one shared buffer for the whole instrument, so there is no "the current voice" to read a note number from once you're past it.

## Going further

- **Two velocity destinations, different curves.** Feed Velocity into two Mappers with different output ranges: one to filter cutoff (say 300 → 4000 Hz) and one to distortion drive (1 → 8). Now hard playing is brighter *and* grittier, which is what a hard-blown reed or an overdriven amp actually does.
- **Velocity → ADSR `input_attack`, inverted.** Wire Velocity through a Mapper with `outMin` 0.3 and `outMax` 0.001 — note the reversed order, which flips the mapping. Hard notes now attack almost instantly, soft notes bloom in over 300 ms. This one trick does more for realism on wind and bowed patches than any amount of filter tweaking.
- **Keyboard tracking on the filter.** Pitch → Mapper (in −2 → 2, out 0 → 3000) → Filter `input_cutoff`. Without this, high notes sound progressively duller than low ones because a fixed cutoff removes proportionally more of a high note's harmonics. Every hardware synth has this control; in Skald you patch it.
- **Layer, don't stack.** Add a second Oscillator and drive its `input_freq` from Pitch through a Mapper set to a constant fixed interval (0.0833 for a semitone of detune-beating, 0.5833 for a fifth, −1 for a sub-octave). Because Pitch is exponential, the interval stays constant across the whole keyboard — which is exactly why V/oct won and Hz/V lost.
- **Two envelopes.** One ADSR for the VCA, a second, faster one for filter cutoff via a Mapper. Give the filter envelope a short decay and near-zero sustain and you get the classic percussive "bite" on the front of each note while the amplitude envelope sustains behind it. Set both ADSRs' `velocitySensitivity` differently (`param_ranges.odin:70-71`) so velocity affects timbre more than level.
- **Velocity → unison spread.** Not directly patchable today (unison is an instrument-level parameter), but exposing an oscillator's `amplitude` and driving it from a game at runtime gets you part of the way.

## Under the hood

The generated Odin is three lines long, and it is worth reading because it tells you precisely what the node is (`codegen.odin:717-730`):

```odin
// --- MIDI Input Node 6 ---
node_6_out_pitch := (f32(voice.note) - 69.0) / 12.0
node_6_out_gate := f32(1.0)
if voice.time_released > 0.0 do node_6_out_gate = 0.0
node_6_out_velocity := voice.velocity
```

That's the whole node. It holds no state of its own; it is a *view* onto the voice struct that `note_on` filled in. The key formula is the pitch one — `(note − 69) / 12` — which is the exponent of the note-to-frequency formula with the 440 Hz factor and the power-of-two stripped off. The full conversion lives in `note_on` instead, at `codegen.odin:1387`:

```odin
freq := 440.0 * math.pow(2.0, (f32(note) - 69.0) / 12.0)
```

Every downstream consumer reaches these three values by name. `get_output_var` in `param_utils.odin:64-71` maps the port you wired (`pitch`/`gate`/`velocity`) onto `node_<id>_out_pitch` / `_out_gate` / `_out_velocity`; every other node in Skald has only a plain `node_<id>_out`, which is why the port-name validation at `graph_validate.odin:66-70` exists.

Two details worth internalising. First, the gate has no state of its own either — it is derived from `voice.time_released`, the same timestamp the ADSR's release stage reads, which is why gate and envelope release are always perfectly in step. Second, `voice.velocity` is written once at note-on (`codegen.odin:1384`) and never changes for the life of the note. There is no continuous per-note pressure signal in Skald: what MPE would call *press* simply does not exist here yet.

## Terms introduced

- **Semitone** — the smallest interval in Western tuning; one step between adjacent keys, black or white. Multiplies frequency by 2^(1/12) ≈ 1.0595.
- **Octave** — a doubling of frequency; twelve semitones. Notes an octave apart sound like "the same note, higher".
- **Equal temperament** — the tuning system that divides the octave into twelve identical semitones, so every key sounds equally (slightly) out of tune and music can modulate freely.
- **MIDI note number** — an integer naming a pitch. 60 = middle C, 69 = A4 = 440 Hz.
- **Note-to-frequency conversion** — *f = 440 × 2^((n − 69)/12)*, the formula turning a MIDI note number into hertz.
- **Control voltage (CV)** — a signal used to control a parameter rather than be heard.
- **V/oct (1 volt per octave)** — the exponential pitch-control convention: adding a fixed amount to the control signal multiplies frequency by a fixed ratio, so intervals stay constant at any pitch. Skald's Pitch port emits octaves in this sense.
- **Gate** — a signal that is high while a key is held and low when released. Tells an envelope when to sustain and when to let go.
- **Trigger** — a momentary pulse at the moment of the press, carrying no release information.
- **Velocity** — how hard a note was struck; MIDI 1–127, normalised to 0.0–1.0 in Skald. MIDI velocity 0 means note-off.
- **Velocity sensitivity** — how strongly velocity scales a destination. Skald's ADSR has this as a parameter, 0.0–1.0, default 0.5.
- **Note-on / note-off** — the two events that bracket a played note.
- **Voice** — one independently-playing copy of the patch. Polyphony is the number of voices available.
- **Voice-coupled node** — a node whose output depends on which voice is playing (pitch, envelope stage, velocity), and which therefore cannot run after the voices are summed.
- **MPE (MIDI Polyphonic Expression)** — an extension giving each sounding note its own MIDI channel so pitch bend, pressure and timbre can be controlled per finger. Default per-note bend range ±48 semitones; polyphony capped at 15–16.
- **Aftertouch / channel pressure** — continuous pressure applied *after* a key is down. Not represented in Skald.
- **Keyboard tracking** — raising filter cutoff with played pitch so high notes don't sound duller than low ones.

## Code-vs-intent notes

**1. Pitch → Oscillator `input_freq` transposes twice, and the suggested example patch does exactly that. (blocker)**
The oscillator's base frequency is already the played note (`codegen.odin:129`: `base_freq_str := "voice.current_freq"`, set from the note at `codegen.odin:1387`). Modulation into `input_freq` is then applied exponentially on top: `base * math.pow(2.0, clamp(sum, -10, 10))` (`codegen.odin:151-156`). Because the Pitch port emits `(note − 69)/12` (`codegen.odin:723`), wiring it to `input_freq` yields `440 × 2^((n−69)/6)` — two semitones of pitch per key. `sax3.json:231-236` wires precisely this connection, so the shipped "midi-setup" example plays every interval doubled. The UI does not warn, and codegen does not either. Both behaviours are individually defensible (note-wins-by-default is documented as an intentional fix at `codegen.odin:121-128`; V/oct summing is standard); it is their combination in the example patch that is wrong.

**2. Gate → ADSR `input` silences the release stage, and the same example patch does that too. (blocker)**
The ADSR's `input` port is a signal multiplicand, not a trigger: `codegen.odin:285` emits `node_<id>_out = (input) * envelope * depth * vel_scale`, with `input` defaulting to `1.0` when unwired (`codegen.odin:217`). Gate becomes `0.0` as soon as `voice.time_released > 0.0` (`codegen.odin:726-727`), which is stamped at note-off (`codegen.odin:1470`) — the exact moment the release stage begins (`codegen.odin:1477`). `sax3.json:237-242` wires Gate into the ADSR's `input`, so the patch's 0.213 s release (`sax3.json:186`) is multiplied by zero and never sounds. The voice still stays allocated for the full release (`codegen.odin:1856-1860`), so this also silently costs a voice slot.

**3. `device` and `useMpe` are exposed by default, cannot be un-exposed from the UI, and generate meaningless `f32` fields. (confusing)**
`node-definitions.ts:184` ships `exposedParameters: ['device', 'useMpe']`. The parameter panel offers no toggle for either — `device` is rendered with `isExposable = false` (`ParameterPanel.tsx:369`) and the MPE checkbox bypasses the `wrapper` helper entirely (`ParameterPanel.tsx:371-374`), so the link icon at `ParameterPanel.tsx:228-236` is never drawn. Meanwhile the exposure resolver reads defaults only from `json.Float` / `json.Integer` (`codegen.odin:1193-1198`), so a string and a bool both resolve to `0.0`, and `lookup_param_range` has no entry for either name and returns the `{-1e6, 1e6, 0.0, ""}` fallback (`param_ranges.odin:153-157`). Generating `sax3.json` produces `device: f32` and `useMpe: f32` on the processor struct, plus `sax_set_device` / `sax_set_useMpe` setters and two PARAMS rows with ±1e6 ranges — all inert.

**4. `useMpe` has no implementation. (confusing)**
The UI presents MPE as a feature: a checkbox labelled "Enable MPE" (`ParameterPanel.tsx:372-373`) and an "MPE Active" badge on the node (`MidiInputNode.tsx:27-31`). Nothing in `skald-backend/core/` mentions MPE, and the preview's MIDI listener handles only status bytes `0x90` and `0x80` — no pitch bend, no channel pressure, no CC74, and no per-channel note tracking (`useWasmAudioEngine.ts:366-381`). The voice struct has no continuous pressure or per-note bend field (`codegen.odin:1048-1057`), and `voice.velocity` is written once at note-on and never updated (`codegen.odin:1384`). Standard MPE practice expects per-note pitch bend with a ±48-semitone default and continuous pressure [Source: https://midi.org/midi-polyphonic-expression-mpe-specification-adopted]; none of that exists here.

**5. The `device` dropdown lists mock devices, and nothing routes by device anyway. (confusing)**
`ParameterPanel.tsx:365-367` offers "All Devices", "Device A (Mock)" and "Device B (Mock)" — the last two are placeholders, not enumerated hardware. In preview, the listener attaches to *every* input port (`useWasmAudioEngine.ts:385-387`) and posts each note to `asset: -1`, i.e. all instruments (`useWasmAudioEngine.ts:374`), so the selection has no effect and a MIDI Input node is not even required to receive live MIDI. In export, the top-level wiring path does serialise a `midi_config` block (`projectSerializer.ts:128-143`, tested at `ProjectSerializerPipeline.test.ts:248-259`, with channel normalisation to 1..16 tested at `IntegerContracts.test.ts:97-104`), and the backend parses and stores it (`json.odin:280`, `types.odin:118`), but no code generator ever reads it. It is a contract with no consumer on either side.

**6. ADSR → Filter `input_cutoff` in the example contributes at most ~1 Hz. (cosmetic)**
`sax3.json:249-254` wires the ADSR output into the filter's `input_cutoff` alongside the Mapper. Modulation is additive (`param_utils.odin:138-155`) and cutoff is in hertz (`codegen.odin:323`, base 857.097 from `sax3.json:86`), so a 0–1 envelope moves the cutoff by less than a hertz — inaudible. Only the Mapper's 400–3000 Hz actually does anything. Not a defect so much as a demonstration of why the Mapper is mandatory on this path, but a reader comparing the patch to what they hear should know the wire is decorative.

**7. The MIDI Input port label vs. the palette tooltip. (cosmetic)**
The node draws the port simply as "Pitch" (`MidiInputNode.tsx:13`), which reads as "the note's frequency". The sidebar tooltip is correct and explicit — "Pitch (V/Oct), gate and velocity signals from your MIDI device" (`Sidebar.tsx:280`) — but it is only visible on hover in the palette, not once the node is on the canvas. Given finding 1, the units are the whole story here.
