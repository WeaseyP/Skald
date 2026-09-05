# Oscillator

> The thing that actually makes a sound. Everything else in your patch only shapes what the oscillator produces.

## What it is

An **oscillator** is a machine that repeats. It produces a number that rises and falls over and over, thousands of times a second, and when you send that stream of numbers to a speaker the cone pushes air back and forth at the same rate. That back-and-forth is what your ear registers as a *tone*. How many times per second the pattern repeats is the **frequency**, measured in hertz (Hz), and your brain interprets frequency as **pitch**: 440 Hz is the A above middle C, 220 Hz is the A an octave below it, 880 Hz the A above.

The thing that makes one 440 Hz tone sound like a flute and another like a buzzsaw is not the frequency but the **shape** of the repeating pattern — the **waveform**. Here is the single most useful fact in all of synthesis: *any* repeating shape can be described as a stack of pure sine waves at whole-number multiples of the fundamental frequency. Those multiples are called **harmonics**. A 440 Hz tone's harmonics sit at 880, 1320, 1760 Hz and so on. Which harmonics are present, and how loud each one is, is the entire recipe for the tone colour, or **timbre**.

The four waveforms Skald offers are the four classic recipes:

- A **sine** has exactly one harmonic — the fundamental, nothing else. It is the sonic equivalent of a single colour of light. Pure, hollow, flute-like, and impossible to make brighter with a filter because there is nothing above the fundamental to let through.
- A **sawtooth** contains *every* harmonic, with the nth harmonic at 1/n the amplitude of the fundamental [Source: https://github.com/micjamking/synth-secrets/blob/master/part-14.md]. That means the 2nd harmonic is at half strength, the 3rd at a third, the 10th at a tenth. It is the brightest, buzziest, most harmonically dense of the four, and because it contains everything, it is the best raw material for subtractive synthesis — you can carve any narrower spectrum out of it with a filter. Strings, brass, and virtually every big supersaw lead start here.
- A **square** contains only the **odd** harmonics (1st, 3rd, 5th…), also falling off at 1/n [Source: https://thewolfsound.com/sine-saw-square-triangle-pulse-basic-waveforms-in-synthesis/]. Removing the even harmonics removes the octave-and-fifth reinforcement that makes a saw sound "full", so a square sounds hollow and woody — a clarinet rather than a violin.
- A **triangle** contains the same odd harmonics as a square, but they die away as 1/n² instead of 1/n [Source: https://thewolfsound.com/sine-saw-square-triangle-pulse-basic-waveforms-in-synthesis/]. Squaring the denominator crushes the upper harmonics fast: the 9th harmonic is at 1/81 rather than 1/9. A triangle is therefore a slightly gritty sine — soft, but with just enough edge to survive in a mix where a pure sine would disappear.

A square wave is really a special case of a more general shape called a **pulse**. A pulse spends some fraction of each cycle "up" and the rest "down"; that fraction is the **pulse width** or **duty cycle**. At 50% duty cycle the up and down halves are equal and you get the square. Change the duty cycle and the harmonic recipe changes with it: the first missing harmonic (the first *null* in the spectrum) sits at the harmonic number equal to 1/duty [Source: https://thewolfsound.com/sine-saw-square-triangle-pulse-basic-waveforms-in-synthesis/]. At 50% the nulls land on every even harmonic, which is exactly why a square has none. At 10% the nulls spread out to every 10th harmonic, so nine out of ten survive and the sound turns bright, thin and nasal [Source: https://www.perfectcircuit.com/signal/what-is-pwm]. Sweep the duty cycle slowly with an LFO — **pulse-width modulation**, PWM — and harmonics fade in and out continuously. Your ear reads that constant spectral churn as thickness and motion, the way a chorus pedal does, from a single oscillator [Source: https://www.perfectcircuit.com/signal/what-is-pwm].

The last idea you need is **phase**: where in its cycle the oscillator currently is, expressed as an angle from 0° to 360°, with 360° being one complete cycle. On its own, phase is inaudible — your ear responds to the *shape* of the repeating pattern, not to where an arbitrary clock says the pattern began [Source: https://www.soundonsound.com/techniques/phase-demystified]. Phase becomes audible the instant you have *two* of something. Two identical waves at 0° relative phase sum to double amplitude; at 180° they cancel to silence [Source: https://www.soundonsound.com/techniques/phase-demystified]. Phase also becomes audible at the *start* of a note, because whether the waveform leaps from zero to full amplitude or eases in from zero decides whether the note begins with a click.

One more thing, and it is the awkward truth about digital oscillators. A sawtooth and a square both have a vertical edge in them — an instantaneous jump. To draw a perfectly vertical edge you need infinitely many harmonics, and a digital system cannot store frequencies above half its sample rate (the **Nyquist frequency**). Harmonics that go over that limit do not just vanish; they **fold back** down into the audible range as **aliases** — extra tones at frequencies that are not multiples of the fundamental, so they are not musically related to the note you played [Source: https://www.metafunction.co.uk/post/all-about-digital-oscillators-part-2-blits-bleps]. You hear this as a metallic, gritty roughness that gets worse the higher you play, and — the tell-tale sign — as a tone that slides *downward* while the note you are playing slides up. Real synth code fixes this with band-limited techniques (BLIT, BLEP, PolyBLEP, DPW) that round off the discontinuities [Source: https://www.metafunction.co.uk/post/all-about-digital-oscillators-part-2-blits-bleps]. **Skald's oscillator does none of that** — it is a straight "naive" or "trivial" oscillator. That is a real, hearable limitation of the tool and you will make it audible in the exercise below.

## What it looks like in Skald

The Oscillator lives at the top of the node palette in the left sidebar, in the sources group, described there as "Tone generator (sine/saw/triangle/PWM square). Pitch tracks the played note." (`skald-ui/src/components/Sidebar.tsx::Sidebar`). Drag it onto the canvas, or onto an Instrument's subgraph if you are building a playable instrument.

**Input handles** (left side, `skald-ui/src/components/Nodes/OscillatorNode.tsx::OscillatorNode`):

| Handle id | Label on the card | What it does |
|---|---|---|
| `input_freq` | Freq | Exponential pitch modulation. The incoming value is a number of **octaves**, not hertz. |
| `input_amp` | Amp | Adds to the amplitude parameter. |
| `input_pulseWidth` | PW | Adds to the pulse width parameter (only meaningful on Square). |

**Output handle** (right side, `skald-ui/src/components/Nodes/OscillatorNode.tsx::OscillatorNode`): a single `output`, labelled Out.

Those three inputs are the complete, enforced list. The graph validator hard-codes `{"input_freq", "input_amp", "input_pulseWidth"}` for the Oscillator (`skald-backend/core/graph_validate.odin::OSC_INPUTS`, dispatched from `skald-backend/core/graph_validate.odin::valid_input_ports`), and the only legal source port on the far end is `output` or an empty string (`skald-backend/core/graph_validate.odin::valid_output_port`). Older project files that name a handle `frequency`, `amplitude` or `pulseWidth` still load — the JSON reader rewrites them to `input_freq` / `input_amp` / `input_pulseWidth` on the way in (`skald-backend/core/json.odin::normalize_port`).

The oscillator **runs at audio rate**: its code is emitted inside the per-sample, per-voice loop (`skald-backend/core/codegen_processor.odin::generate_processor_code`). It is also **voice-coupled** — its default pitch comes from `voice.current_freq`, which only exists inside a voice (`skald-backend/core/codegen_nodes.odin::generate_oscillator_code`). The practical consequence: an Oscillator can never sit *after* a Delay or Reverb. Those two nodes run once per sample on the summed output of all voices (the "bus domain", `skald-backend/core/codegen_analysis.odin::compute_bus_domain`), and everything downstream of them joins them there. Keep your oscillators upstream of any Delay or Reverb and you will never trip over this.

Nothing feeds the oscillator's *audio* path, because it has no audio input — it is a source. Everything you wire into it is modulation.

## The controls

| Parameter | Range | Default | Unit | What it does to the sound |
|---|---|---|---|---|
| `waveform` | Sine, Sawtooth, Square, Triangle | `Sawtooth` | — | Picks the harmonic recipe. |
| `amplitude` | 0.0 – 1.0 | 0.5 | — (linear gain) | How loud this oscillator is before anything else touches it. |
| `pulseWidth` | 0.01 – 0.99 | 0.5 | — (fraction of a cycle) | Duty cycle of the Square. Ignored by the other three waveforms. |
| `phase` | 0 – 360 | 0 | deg | Where in the cycle each note starts. |
| `fixedPitch` | off / on | off | — | Off: pitch follows the played note. On: pitch is locked to `frequency`. |
| `frequency` | 20 – 20000 | 440 | Hz | Only used when `fixedPitch` is on. Packet B2 prunes the exposed setter and `_PARAMS` row for `frequency` from the generated code whenever `fixedPitch` is off, so an unreachable knob never ships a dead public setter. |

Sources: defaults and the exposed-by-default list in `skald-ui/src/definitions/node-definitions.ts::defaultOscillatorParams`; the TypeScript shape and the `fixedPitch` opt-in semantics in `skald-ui/src/definitions/types.ts::OscillatorParams`; the ranges are authored once in the schema and rendered into the generator's lookup table — `schema/nodes.json::frequency`, `schema/nodes.json::amplitude`, `schema/nodes.json::pulseWidth` (unified to 0.01–0.99 by packet A8, closing the divergence between the UI slider and the DSP clamp), `schema/nodes.json::phase` — none of which the Oscillator overrides; slider ranges in `skald-ui/src/components/NodeParameterControls.tsx::NodeParameterControls`; on-card number boxes in `skald-ui/src/components/Nodes/OscillatorNode.tsx::OscillatorNode`.

**Waveform — what you hear.** Switch between the four with a filter open and you are hearing pure harmonic content. Sine is a soft hum with no edge at all; a filter has literally nothing to do to it. Triangle adds a faint reediness. Square jumps to a hollow, clarinet-ish buzz — it is obviously "electronic" but oddly narrow, because half the harmonics are missing. Sawtooth is the loudest and brightest of the four for the same amplitude setting, because it has the most harmonics packed into it. If you are unsure what to use, start on Sawtooth and take away with a filter; that is what subtractive synthesis is for. Note that `waveform` is deliberately **not exposable** (`skald-ui/src/components/NodeParameterControls.tsx::NodeParameterControls`, the `false` argument) — it is a string, and the runtime parameter API is numeric only.

**Amplitude — what you hear.** At 0.0 the oscillator is silent. From 0.1 to about 0.7 you are simply setting how much this oscillator contributes; the useful zone when you are mixing two or three oscillators is 0.3–0.6 each, so their sum does not slam the output. At 1.0 a single oscillator already swings the full ±1 range, which leaves no headroom for a second one, for resonance peaks from a filter, or for the Instrument's own volume. Amplitude is the first place to look when a patch sounds crunchy for no obvious reason.

**Pulse width — what you hear.** The node card only shows this control when the waveform is Square (`skald-ui/src/components/Nodes/OscillatorNode.tsx::OscillatorNode`). The parameter panel shows it regardless of waveform, but greys it out and disables its expose toggle with an explanatory tooltip when the waveform isn't Square — packet B2's "grey out, don't hide" rule for a control the DSP is not currently reading (`skald-ui/src/components/NodeParameterControls.tsx::NodeParameterControls`). At 0.5 you get the textbook square: hollow, symmetric, no even harmonics. Drag toward 0.2 and the tone brightens and narrows — more of the spectrum survives, the low end thins out, and it starts to sound nasal, closer to an oboe than a clarinet. Below about 0.1 it becomes a thin buzz that almost disappears at low volumes because so little energy is left near the fundamental. Above 0.5 the shape is the mirror image of below 0.5, so 0.7 sounds the same as 0.3 — the spectrum only depends on how *unequal* the two halves are. The musical zone is 0.15–0.5, and the real magic is not any single setting but sweeping it: wire an LFO into the `PW` handle and you get PWM.

**Phase — what you hear.** On a sustained note, nothing. Set it to 0 or 180 on a lone sine and you cannot tell the difference, which is exactly what the theory predicts. Phase matters in two places. First, at note onset: Skald resets every oscillator's phase to zero on each new note (`skald-backend/core/codegen_nodes.odin::generate_oscillator_code`), so a phase of 90° on a sine means every note begins at the waveform's peak — an instant jump from silence to full amplitude, which is a **click**. With a fast attack that click is a useful transient (it is how you get a kick drum to *thump*); with a slow pad it is a defect. Second, when two oscillators are summed: their *relative* phase decides whether they reinforce or cancel. Two identical sawtooths 180° apart produce silence. Phase has no modulation input handle. It used to be editable only from the parameter panel; a card/sidebar parity test later caught that the sidebar had offered it since the node shipped while the card's field list stopped at `frequency`, so the card gained its own Phase field too (`skald-ui/src/components/Nodes/OscillatorNode.tsx::OscillatorNode`) — both surfaces expose it today (`skald-ui/src/components/NodeParameterControls.tsx::NodeParameterControls`).

**Fixed Pitch and frequency — what you hear.** By default the oscillator ignores its own `frequency` value entirely and tracks the played note (`skald-backend/core/codegen_nodes.odin::generate_oscillator_code`). This is what you want almost always: it is why the sequencer's piano roll and your MIDI keyboard change the pitch. Tick **Fixed Pitch** and the frequency slider appears and takes over; the oscillator now sits stubbornly at one pitch no matter what note you play. Use it for drones, for a fixed sub layer under a melody, or for a sound-effect component (a fixed 60 Hz rumble under a footstep) that must not transpose. On the node card the frequency box is hidden unless Fixed Pitch is on, deliberately — "an editable-but-inert control is a lie" (`skald-ui/src/components/Nodes/OscillatorNode.tsx::OscillatorNode`). The parameter panel takes the opposite approach for an *already-exposed* value: rather than hiding it, it greys the control out and disables its expose toggle so an exposure that has gone dead stays visible instead of disappearing (`skald-ui/src/components/NodeParameterControls.tsx::NodeParameterControls`, packet B2).

**What "expose" does.** Next to each parameter in the right-hand panel is a small link button that toggles exposure (`skald-ui/src/components/ParameterPanel.tsx::ParameterPanel`). Exposing a parameter changes what the exported Odin looks like. Instead of the value being baked into the DSP as a literal, the code generator gives it a real field on the processor struct, plus:

- a clamped typed setter, e.g. `Reese_Bass_set_amplitude(p, value)`, with the min/max compiled in as `if v < … do v = …` guards (`skald-backend/core/codegen_processor.odin::generate_processor_code`);
- a row in the introspection table `<Instrument>_PARAMS` giving name, min, max, default and unit, so a game's debug overlay or save system can enumerate the knobs (`skald-backend/core/codegen_processor.odin::generate_processor_code`);
- string-keyed `set_param` / `get_param` dispatch, including a `"<node id>::<param>"` alias (`skald-backend/core/codegen_processor.odin::generate_processor_code`).

That is why you expose things: an exposed parameter is the *public API of your sound*. Your game calls `set_param("cutoff", 900)` when the player enters a tunnel; nothing else can reach inside a compiled instrument. There is an immediate benefit inside the editor too — exposed parameters are applied to the running preview instantly via `skald_set_param`, while any other edit debounces a full re-codegen and recompile of the WebAssembly module (`skald-ui/src/hooks/nodeEditor/useWasmAudioEngine.ts::useWasmAudioEngine`). Tweaking an exposed slider is smooth; changing the waveform briefly rebuilds.

If two nodes expose the same parameter name, the generator prefixes the field with the node's label — `Osc_A_amplitude`, `Osc_B_amplitude` (and, in the same fixture, `Osc_A_phase`/`Osc_B_phase`) — so they stay separately addressable (`skald-backend/core/codegen_analysis.odin::build_instrument_plan`; see the generated result in `skald-backend/tests/golden/dual_osc.odin.golden::Asset_set_Osc_A_amplitude`).

## Try it (hands-on)

Open `examples/instruments/bass/synth-reese-bass.skald.json`. It is a single Instrument called **Reese Bass** containing one Oscillator labelled **Detuned Saws** (Sawtooth, amplitude 0.7, `fixedPitch` off) into a Lowpass filter at 300 Hz, into an amp ADSR, into Output — plus a filter envelope and a slow LFO both modulating the filter's cutoff. The instrument itself is set to 6 voices, **unison 7**, **detune 28 cents**, glide 0.02 s (`examples/instruments/bass/synth-reese-bass.skald.json::unison`), and there is a 16-step pattern at 172 BPM playing low F and C notes among others (`examples/instruments/bass/synth-reese-bass.skald.json::sequencerTracks`).

A "Reese" is a specific classic: two or more sawtooths detuned against each other so their cycles drift in and out of alignment, producing a slow beating wobble [Source: https://blog.native-instruments.com/reese-bass/]. That wobble *is* phase interference, heard over time.

1. **Press play.** You should hear a growling, moving bass line. Everything you are hearing came out of one Oscillator node.

2. **Find the oscillator.** Click the Reese Bass instrument node, then scroll the right-hand parameter panel to **Internal Nodes → Detuned Saws**. You will see Waveform (Sawtooth), a Fixed Pitch checkbox (unticked), Amplitude (0.7) and Phase (0). No Pulse Width — the waveform is not Square.

3. **Kill the unison.** Scroll back up to the instrument's own controls and drag **Unison Voices** from 7 down to 1. The movement disappears instantly and you are left with a single flat, static saw. This is the whole trick laid bare: the growl was never in the oscillator's settings, it was in there being seven slightly different copies of itself. (In the generated code, unison of 1 skips the detune maths entirely — `skald-backend/core/codegen_nodes.odin::generate_oscillator_code` only computes a detune offset when `unison_count > 1`.)

4. **Bring it back and sweep the detune.** Set Unison Voices back to 7, then drag **Detune (cents)** from 28 down to 0 and slowly back up. At 0 cents all seven copies are identical, so they sum to exactly the same sound as one copy — proof that phase-identical signals just add. Around 5–10 cents you get a gentle shimmer. Around 25–35 cents you get the classic Reese growl. Past about 60 cents your ear stops hearing "one thick note" and starts hearing "several out-of-tune notes"; by 100 it is a detuned cluster. The useful zone for thickness is roughly 10–35 cents. Leave it at 28.

5. **Change the harmonic recipe.** Back in Detuned Saws, switch **Waveform** to **Sine**. The patch nearly vanishes — a soft, distant hum. Nothing is broken: the Lowpass filter is at 300 Hz, and a sine playing a 44 Hz F has no harmonics above 44 Hz for the filter to shape, so all the "growl" you were enjoying was upper harmonics of the saw. Now try **Triangle** — a little body returns. Then **Square** — hollow and woody, noticeably different from the saw even though both are bright, because the square is missing all its even harmonics.

6. **Do some PWM by hand.** With Square still selected, a **Pulse Width** slider appears. Drag it from 0.5 down to 0.15 and back, slowly. Listen to the tone thin out and turn nasal as the harmonic nulls spread apart, then fill back in. Now try 0.7 and 0.3 alternately — they sound the same, because only the *asymmetry* matters. Set it back to 0.5 and return the waveform to Sawtooth.

7. **Break it: make the aliasing audible.** Tick **Fixed Pitch** on Detuned Saws. A Frequency slider appears at 440 Hz. Because the oscillator no longer tracks the note, the whole pattern flattens to one pitch — that is expected. Now drag the frequency slider slowly up from 440 Hz toward 20000 Hz and listen closely, especially above about 2 kHz. You will hear a second, ghostly tone that slides *downward* as you drag *upward*, and the sound turns metallic and grainy rather than simply getting higher — that is **aliasing**, the sawtooth's harmonics crossing the Nyquist frequency and folding back down as inharmonic partials. Switch the waveform to **Sine** while still up at 6–8 kHz: the grain vanishes completely, because a sine has no harmonics to fold. Switch back to Sawtooth and it returns. Skald's oscillator is naive — the saw is literally `phase/π − 1` (`skald-backend/core/codegen_nodes.odin::generate_oscillator_code`) with no band-limiting anywhere in the file; see **What Skald deliberately does not do** for why. Keep this in mind for bright leads in the top octave.

8. **Undo the damage and hear phase.** Untick Fixed Pitch. Set Waveform to **Sine** and, in the amp ADSR ("Amp"), pull **Attack** down to its minimum. Now set the oscillator's **Phase** to 0 and play; then set it to 90 and play again. At 90° every note starts at the sine's peak — an instantaneous jump from silence — and you get an audible tick on each note. At 0° the wave eases up from zero and the onset is clean. Nothing about the sustained tone changed; only the very first instant did. Restore Attack to 0.006 and Waveform to Sawtooth, Phase to 0.

9. **Optional, if you want to see PWM automated:** open `examples/instruments/pads/pwm-pad.skald.json`, which patches an LFO at 0.5 Hz into a Square oscillator's pulse width (`examples/instruments/pads/pwm-pad.skald.json::edges`). Note that this file was written with the legacy handle name `pulseWidth` rather than `input_pulseWidth`; the backend rewrites it on load (`skald-backend/core/json.odin::normalize_port`) but the wire has nowhere to attach on the canvas, since the Oscillator card only declares `input_pulseWidth` — see KI-003. If the wire is not drawn, delete the edge and redraw it from the LFO's Out to the oscillator's **PW** input.

## Why you patch it this way

The Oscillator is a source, so it is always at the head of the chain. The idiomatic subtractive-synthesis order — and the one the Reese example uses — is:

**Oscillator → Filter → ADSR (or VCA) → Output**, with envelopes and LFOs branching in sideways as modulation.

Each step has a reason. The oscillator makes a spectrum that is deliberately *too* bright; the filter removes what you do not want; the envelope decides when you hear it at all. Reverse the last two and you get the classic beginner mistake: if you put the ADSR before the filter, the filter's resonance still rings after the envelope has closed, and self-oscillation leaks through into what should be silence. Put a Delay or Reverb before the filter and you are filtering the tail rather than the source, which almost never sounds like what you meant.

What feeds an Oscillator:

- **Nothing at all**, most commonly. The played note already drives pitch through `voice.current_freq`; you do not need to wire anything for a melody to work.
- **An LFO or Sample & Hold into `input_freq`** for vibrato or random pitch jumps. Remember this input is exponential — the value is *octaves*, and the generator clamps the exponent to ±10 octaves so a runaway modulator cannot produce a NaN and permanently silence the voice (`skald-backend/core/codegen_nodes.odin::generate_oscillator_code`). For a subtle vibrato you want a very small number here; run the LFO through a Mapper to scale it down to something like ±0.01 (about ±17 cents).
- **An LFO into `input_pulseWidth`** for PWM, on a Square. Slow — 0.2 to 1 Hz — is the classic setting; the point is a lazy drift, not a tremolo.
- **A MIDI Input's pitch port into `input_freq`** if you are building a modular-style patch rather than relying on note tracking.

What an Oscillator feeds:

- **A Filter**, nearly always, because that is where a saw becomes an instrument.
- **A Mixer**, when you are layering several oscillators; the mixer's per-channel levels let you balance them without touching each oscillator's own amplitude.
- **An ADSR's `input`**, which in Skald doubles as a VCA — the envelope multiplies the signal passing through it.
- **A Gain (VCA)** node, if you want the level itself to be modulated.

One trap worth knowing about. The `input_amp` handle **adds** to the amplitude parameter rather than multiplying it (`skald-backend/core/codegen_nodes.odin::generate_oscillator_code` calls `get_f32_param` with the port name, and that function sums the parameter and every wire feeding the port — `skald-backend/core/param_utils.odin::get_f32_param`). So wiring an ADSR into `input_amp` does *not* gate the oscillator: with amplitude at 0.5, the "off" state is still 0.5, not silence. To actually gate a note, pass the *audio* through an ADSR or a Gain node in series. The same additive rule applies to `input_pulseWidth`, where it is exactly what you want — the LFO offsets the base pulse width you dialled in.

## Going further

**Stack and detune.** The Reese patch gets its size from `unison` and `detune` on the Instrument, which multiply one Oscillator node into several copies spread symmetrically in cents (`skald-backend/core/codegen_nodes.odin::generate_oscillator_code`; UI sliders at `skald-ui/src/components/NodeParameterControls.tsx::NodeParameterControls`, unison 1–16, detune 0–100 cents). That is cheap and effective, but every copy is the same waveform at the same amplitude. For real character, add a *second* Oscillator node instead: a Sawtooth for the body and a Square an octave down for weight, summed through a Mixer so you can balance them. Two different waveforms beat a bigger unison count nearly every time.

**Add a sub.** Drop in a second Oscillator, set Waveform to Sine, tick **Fixed Pitch** off (so it tracks), and mix it in at 0.3. Because it tracks the note it stays musical; because it is a sine it adds pure fundamental weight without muddying the midrange. This is the standard way to make a bass hold up on small speakers.

**Give the pitch a shape.** Wire an ADSR through a Mapper into `input_freq`, with the Mapper's output range set to something tiny like 0 → 0.08 (about a semitone) and a very short decay. You now have a pitch blip at the start of each note — the difference between a synth bass and a *plucked* synth bass. Take the same idea further with a range of 0 → 3 octaves and a 0.05 s decay and you have a kick drum.

**Modulate the modulator.** Instead of one LFO into pulse width, use two at slightly different rates (0.3 Hz and 0.47 Hz) summed into the PW handle. The pattern never quite repeats, and the result sounds much less like an effect and much more like an instrument. Because the port sums all incoming wires (`skald-backend/core/param_utils.odin::get_f32_param`), you can just draw both edges.

**Series versus parallel.** Two oscillators into one filter (parallel sources, shared shaping) glues them into a single instrument. Two oscillators each into their own filter, then mixed, keeps them as two distinguishable layers — useful when one is a bright pluck and the other a dark pad. Use the first for "one bigger sound", the second for "two sounds that arrive together".

**Live control.** Expose `amplitude` on each oscillator in a layered patch and your game can crossfade between layers at runtime by calling `set_param` — a low-intensity and a high-intensity version of the same engine sound, blended by RPM. That is a far cheaper trick than streaming two audio files.

## Under the hood

Every sample, for every unison copy `i`, the generated Odin advances a stored phase accumulator and wraps it to one full turn:

```odin
voice.osc_<id>_phase[i] = math.mod(
    voice.osc_<id>_phase[i] + (2 * f32(math.PI) * detuned_freq / sample_rate),
    2 * f32(math.PI))
```

(`skald-backend/core/codegen_nodes.odin::generate_oscillator_code`). That is the whole oscillator: add `2π · f / sample_rate` radians per sample, and you have gone round exactly `f` times per second. `detuned_freq` is the base frequency — `voice.current_freq` from the played note, or the `frequency` parameter when Fixed Pitch is on — first shifted by any `input_freq` modulation as `base * 2^clamp(sum, -10, 10)`, then by this copy's detune as `* 2^(cents/1200)` (all in the same proc). Both use powers of two because pitch is perceived logarithmically: adding a fixed number to the exponent always moves the same musical interval, whatever the starting pitch.

The `phase` parameter is converted from degrees to radians and added just before the waveform is evaluated, with the result wrapped back into `[0, 2π)`: skipping that wrap would push the sawtooth formula out of its expected range and inject DC offset, which is why the wrap happens before the waveform switch below, not after.

Then one line of arithmetic turns the angle into a sample (`skald-backend/core/codegen_nodes.odin::generate_oscillator_code`):

- **Sawtooth**: `(final_phase / π) - 1.0` — a straight ramp from −1 to +1 across the cycle.
- **Square**: `final_phase < 2π · clamp(pulseWidth, 0.01, 0.99) ? +1 : -1` — a genuine duty-cycle comparator against the wrapped phase, not a sine threshold, so the 0.01–0.99 clamp maps directly onto duty cycle with no silent edge case at either end.
- **Triangle**: `(2/π) · asin(sin(final_phase))` — the arcsine straightens the sine's curve into a linear ramp up and down.
- **Sine** (and anything unrecognised): `sin(final_phase)`.

Finally the copies are averaged and scaled: `node_<id>_out = (unison_out / unison_count) * amplitude` (`skald-backend/core/codegen_nodes.odin::generate_oscillator_code`). Dividing by the count is why raising unison thickens the sound without making it louder.

None of these four expressions is band-limited — see **What Skald deliberately does not do** for why — and that is precisely the aliasing you provoked in step 7 of the exercise.

Phase state lives on the voice, one float per unison copy, and is zeroed on every note-on *unless* the voice was stolen from a still-ringing note (`skald-backend/core/codegen_processor.odin::generate_processor_code`). So Skald's oscillators are retriggered, not free-running: every note starts from the same point in the cycle, which makes short percussive sounds perfectly repeatable and makes the `phase` parameter meaningful at note onset.

## Terms introduced

- **Oscillator** — a source that produces a repeating waveform; the origin of all sound in a patch.
- **Frequency** — how many times per second the waveform repeats, in hertz (Hz). Perceived as pitch.
- **Pitch** — the perceptual counterpart of frequency; doubling frequency raises pitch by one octave.
- **Waveform** — the shape of one cycle. Determines timbre.
- **Timbre** — tone colour; what makes two notes at the same pitch and loudness sound different.
- **Harmonic** — a sine component at a whole-number multiple of the fundamental frequency.
- **Fundamental** — the 1st harmonic; the frequency you hear as the note's pitch.
- **Sine / Sawtooth / Square / Triangle** — the four classic waveforms: one harmonic; all harmonics at 1/n; odd harmonics at 1/n; odd harmonics at 1/n².
- **Pulse wave** — a two-level waveform whose up and down halves need not be equal.
- **Pulse width / duty cycle** — the fraction of each cycle a pulse spends "up". 0.5 gives a square.
- **PWM (pulse-width modulation)** — continuously varying the duty cycle, usually with an LFO, to produce a chorus-like thickening from a single oscillator.
- **Harmonic null** — a harmonic whose amplitude falls to zero at a given duty cycle; the nulls sit at multiples of 1/duty.
- **Phase** — the oscillator's position within its cycle, measured 0°–360°.
- **Relative phase** — the phase difference between two signals; 0° reinforces, 180° cancels.
- **Phase cancellation** — the loss of level when two signals sum with opposing polarity.
- **Beating** — the slow throb heard when two nearly-identical frequencies drift in and out of phase.
- **Detune** — deliberate small pitch offset between copies of a sound, measured in cents.
- **Cent** — 1/100 of a semitone; 1200 cents to the octave.
- **Unison** — playing several detuned copies of one oscillator per note to thicken it.
- **Amplitude** — the linear level of a signal, 0 = silence, 1 = full scale.
- **Sample rate** — how many samples per second the audio system uses.
- **Nyquist frequency** — half the sample rate; the highest frequency a digital system can represent.
- **Aliasing** — frequencies above Nyquist folding back into the audible range as inharmonic tones.
- **Band-limiting** — techniques that generate saw and square waveforms without aliasing. Skald does not use them; see **What Skald deliberately does not do**.
- **Naive (trivial) oscillator** — one that computes the ideal waveform directly, accepting the aliasing.
- **Voice** — one simultaneously-sounding note's worth of state.
- **Voice-coupled node** — a node whose code reads per-voice state and therefore cannot run after the voice sum.
- **Subtractive synthesis** — starting with a harmonically rich waveform and removing content with filters.
- **Exposed parameter** — one promoted to the compiled instrument's runtime API, with a clamped setter and an entry in the PARAMS table.
- **Reese bass** — a bass sound built from detuned sawtooths whose beating produces the characteristic growl.

## Known issues

Defects that touch this chapter are tracked centrally in the **Known issues** chapter (`KNOWN-ISSUES.md`): KI-003. Deliberate design limits — things Skald does not do on purpose — are collected in **What Skald deliberately does not do**.
