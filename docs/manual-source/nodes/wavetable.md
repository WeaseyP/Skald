# Wavetable

> A tone generator whose *shape* you can slide continuously from a smooth sine, through a triangle, through a sawtooth, to a square — so the timbre can change while the note is still ringing.

## What it is

Every oscillator you have met so far is a machine for repeating one shape. Skald's **Oscillator** node picks a shape from a dropdown — sine, triangle, saw, square — and repeats it forever. The shape is what gives the note its *timbre*: the character that lets you tell a flute from a trumpet at the same pitch and the same loudness. A sine has only the fundamental and sounds hollow and soft. A sawtooth contains every harmonic (2×, 3×, 4× the fundamental, falling off as 1/n) and sounds bright and buzzy. A square contains only the odd harmonics and sounds hollow but reedy, like a clarinet.

A **wavetable** oscillator refuses to choose. Instead of one shape, it holds a *stack* of single-cycle shapes and gives you a knob — the **table position** — that says how far up the stack to read. Wolfgang Palm built the first commercial one into the PPG Wave in the late 1970s: 32 tables, each holding 64 single-cycle waveforms, with a front-panel control (and LFOs, and envelopes) able to step through them while a note sounded [Source: https://www.soundonsound.com/sound-advice/q-can-you-explain-origins-wavetable-ss-and-vector-synthesis]. The PPG stepped between adjacent waves audibly, which is a large part of why it sounds like a PPG. Modern wavetable synths **interpolate** — they crossfade between the two waves you are sitting between, so a slow sweep of position is a smooth, seamless change of tone rather than a series of clicks [Source: https://en.wikipedia.org/wiki/Wavetable_synthesis].

Here is the analogy that makes it stick. A normal oscillator is a single photographic slide in a projector. A wavetable is a whole carousel of slides, and the position knob is a dissolve fader between the current slide and the next one. Set it to 1.4 and you are seeing 60% of slide 1 and 40% of slide 2 superimposed. Slide the fader slowly and the picture *becomes* the next picture without ever going dark.

Two distinctions matter and beginners routinely get them backwards.

**Wavetable is not sample playback.** A sampler plays a long recording — seconds of a real piano, attack and all — from start to end. A wavetable holds *one cycle* of a waveform, a few milliseconds at most, and loops it. Pitch comes from how fast you read through that one cycle, not from resampling a long file. As Julius Smith puts it at CCRMA, the classic wavetable oscillator is one period of a periodic sound, read back at any fundamental frequency using interpolation, with the loudness contour supplied separately by an amplitude envelope [Source: https://ccrma.stanford.edu/~jos/sasp/Wavetable_Synthesis.html]. The consequence: a sample has a fixed evolution baked into the recording, whereas a wavetable's evolution is *yours*, driven live by whatever you wire to position [Source: https://en.wikipedia.org/wiki/Wavetable_synthesis].

**Position is a destination, not a setting.** Parked at one value, a wavetable is just a slightly unusual oscillator. Everything that makes wavetable synthesis worth having comes from *modulating* position — from an LFO for slow drifting pads, from an envelope so the tone brightens on the attack and settles on the sustain, from a mod wheel so the player controls it. Native Instruments' rule of thumb for pads is a sub-1 Hz LFO on position for "shifting feel", and an envelope on position when you want the timbre to evolve within each note [Source: https://blog.native-instruments.com/what-is-wavetable-synthesis/]. Skald's own pad example follows exactly that advice, at 0.15 Hz.

One honest caveat before you start. Skald's Wavetable node is, at heart, a **four-shape morphing oscillator**, not a 64-wave PPG — its built-in table is fixed at sine, triangle, saw, square, and Position crossfades among only those four. Since packet G4 you *can* load one single-cycle wave of your own (see **Importing a custom single-cycle table** below), but that swaps the whole four-shape morph out for one static table — it does not add a fifth stop on the Position dial. Everything you learn here about position, interpolation, and modulation transfers directly to Serum or Vital; the size of the built-in table does not.

## What it looks like in Skald

**Where it lives.** Drag it out of the left-hand sidebar. It is in the source group with Oscillator, Noise, LFO, S & H and FM Operator, and its palette tooltip reads "Morphing wavetable: position sweeps sine → triangle → saw → square" (`skald-ui/src/components/Sidebar.tsx::Sidebar`). On the canvas it is the deep-orange card — that colour is reserved for this node type (`skald-ui/src/components/Nodes/NodeStyles.ts::NODE_ACCENTS`).

**Handles.** Four inputs down the left, one output on the right (`skald-ui/src/components/Nodes/WavetableNode.tsx::WavetableNode`):

| Handle | Direction | Label | What it accepts |
|---|---|---|---|
| `input_freq` | in | **Freq** | A pitch offset in volts-per-octave. Exponential: the incoming value is used as `2^x`, so +1 is one octave up, −1 one octave down, clamped to ±10 octaves (`skald-backend/core/codegen_nodes.odin::generate_wavetable_code`). |
| `input_pos` | in | **Pos** | A modulation signal **added** to the Position parameter (`skald-backend/core/codegen_nodes.odin::generate_wavetable_code`). |
| `input_amp` | in | **Amp** | A modulation signal **added** to the Amp parameter (`skald-backend/core/codegen_nodes.odin::generate_wavetable_code`). |
| `input_pulseWidth` | in | **PW** | A modulation signal **added** to the Pulse Width parameter. Added alongside the Pulse Width control itself in packet C5; only audible while Position sits near the square end (2–3). |
| `output` | out | **Out** | The generated audio signal, roughly ±1. |

Note the asymmetry, because it will bite you: `input_freq` is *multiplicative and exponential*, while `input_pos`, `input_amp` and `input_pulseWidth` are *additive and linear*. All go through the same summing rule — if you wire two cables into one input port, both are summed, not just the first (`skald-backend/core/param_utils.odin::get_f32_param`).

**Rate.** Audio rate, and — since packet C5 — unison-aware like the Oscillator: the same `unison`/`detune` instrument settings spread the Wavetable into several detuned copies, each with its own phase accumulator, summed and averaged (`skald-backend/core/codegen_nodes.odin::generate_wavetable_code`). One phase accumulator array lives *per voice* on the processor struct, reset to zero when a voice is stolen or retriggered (`skald-backend/core/codegen_processor.odin::generate_processor_code`). That per-voice state is why chords do not smear into each other.

**What it cannot connect to.** Wavetable is a *voice-coupled* node: its generated code reads `voice.current_freq`, the pitch of the note being played (`skald-backend/core/codegen_nodes.odin::generate_wavetable_code`). After a Delay or a Reverb, Skald has already summed all the voices together and there is no single "current note" any more. Wiring a Wavetable downstream of a Delay or Reverb is not a warning — the exporter refuses and exits with an error telling you to move it upstream (`skald-backend/core/codegen_analysis.odin::compute_bus_domain`). Put it at the head of the chain, where it belongs.

**Pitch.** By default the node ignores its own Frequency box and plays the note the sequencer or your MIDI keyboard sent (`skald-backend/core/codegen_nodes.odin::generate_wavetable_code`). Tick **Fixed Pitch** and it plays the Frequency value instead, for every note. Same contract as the Oscillator.

## The controls

| Parameter | Range | Default | Unit | What it does to the sound |
|---|---|---|---|---|
| **Position** | 0 – 3 | 0 | — | Slides the waveshape: 0 = sine, 1 = triangle, 2 = sawtooth, 3 = square, with a linear crossfade in between. |
| **Pulse Width** | 0.01 – 0.99 | 0.5 | `PW` | Duty cycle of the square end of the morph (position 3). 0.5 is the symmetric square every older patch had; narrower or wider pulses bring in the even harmonics, exactly as on the Oscillator. Added in packet C5. |
| **Phase** | 0 – 360° | 0 | — | Where in its cycle the wave starts on each note, as on the Oscillator. Two sine Wavetables on the same pitch 180° apart cancel. Added in packet C5. |
| **Amp** | 0 – 1 | 1 | — | Output level of the oscillator before anything downstream. |
| **Fixed Pitch** | off / on | off | — | Off: pitch follows the played note. On: pitch is locked to Frequency. |
| **Frequency** | 20 – 20000 | 440 | Hz | Only read when Fixed Pitch is on. |
| **Use Imported Table** | off / on | off | — | On: read the imported single-cycle table (see below) instead of the four-shape morph. Position and Pulse Width are then never read (`skald-backend/core/codegen_analysis.odin::param_is_reachable`). Added in packet G4. |

Sources: Position's authoritative range is the node-type override in the schema (`schema/nodes.json::position`, rendered into the generator's lookup table as `{0.0, 3.0, 0.0, ""}`), which matches the on-canvas slider `{ key: 'position', min: 0, max: 3, step: 0.01 }` (`skald-ui/src/components/Nodes/WavetableNode.tsx::WavetableNode`) and the properties-panel slider `slider('position', 0, 3, 0, undefined, 0.01)` (`skald-ui/src/components/NodeParameterControls.tsx::NodeParameterControls`). Amp's range and default of 1 come from the Wavetable-specific schema override (`schema/nodes.json::amplitude`, packet C5/SKB-024) rather than the generic `amplitude` row's 0.5 default, and the card carries the same 1 as a read-time default for saves made before `amplitude` was part of `WavetableParams` (`skald-ui/src/components/Nodes/ParamNode.tsx::ParamField`; canvas field at `skald-ui/src/components/Nodes/WavetableNode.tsx::WavetableNode`). Frequency comes from the generic `{20.0, 20000.0, 440.0, "Hz"}` row (`schema/nodes.json::frequency`) and the node's own default of 440 (`skald-ui/src/definitions/node-definitions.ts::defaultWavetableParams`). The DSP additionally hard-clamps position to 0–3 inside the morph function itself, so no amount of modulation can push it out of range (`skald-backend/core/codegen_project.odin::skald_wavetable_sample`).

## Importing a custom single-cycle table

Packet G4 (roadmap §9.20) adds a second source of material for this node: instead of the four built-in analytic shapes, you can import one single-cycle `.wav` — the same format Serum, Vital and most wavetable synths export a single frame or a "one-shot" wave as — and Skald compiles it straight into a static Odin float array with zero external dependencies on either side.

**How to import.** Tick **Use Imported Table**, then click **Import .wav…** in the properties panel sidebar (`skald-ui/src/components/NodeParameterControls.tsx::NodeParameterControls`, the Wavetable case). Pick a `.wav` file: PCM 8/16/24/32-bit or IEEE float32, mono or the first channel of a multi-channel file. Two shapes of source file both work:

- **A file with a loop point** (a `smpl` chunk, the kind Serum/Vital/Xfer's own tools and most sample editors write when you mark a loop): only the looped range becomes the cycle.
- **A file with no loop point**: the whole file is treated as one cycle. This is the common case for a wavetable synth's single-frame export, which is already exactly one period long.

Either way the cycle is resampled to 2048 samples by linear interpolation, has any DC offset removed, and is normalized so its peak sits at 1.0 (`skald-ui/src/audio/wavReader.ts::singleCycleTable`). A small waveform preview and the file's name (extension stripped) appear under the Import/Clear buttons once a table is loaded. **Clear** returns the node to the four analytic shapes — Position and Pulse Width read live again immediately.

**What changes once a table is imported and selected.** Position and Pulse Width stop doing anything: there is no stack of four shapes to crossfade among any more, and a single static table has no duty cycle (`skald-backend/core/codegen_analysis.odin::param_is_reachable`, mirrored in `skald-ui/src/utils/plockTargets.ts::paramIsReachable`). Amplitude, Phase, and instrument-level unison/detune all keep working exactly as they do on the analytic shapes — the imported table is sampled through the same per-voice phase accumulator and unison loop (`skald-backend/core/codegen_nodes.odin::generate_wavetable_code`), just with a different final lookup: `skald_wavetable_sample_custom`, a linear-interpolated read of your table, in place of `skald_wavetable_sample`'s four-shape crossfade.

**Storage and size.** The table travels in the save file as base64 of 2048 little-endian float32 samples on the node's own data — about **11 KB per imported table** in the `.skald.json` file. Generated Odin carries the same 2048 numbers written out as Odin float literals in a static array — about **20 KB of source text per distinct table**. Two Wavetable nodes that imported the exact same file share one array in the export rather than paying for it twice (deduplicated by a digest of the stored data, `skald-backend/core/param_utils.odin::custom_wavetable_digest`); two nodes with visually identical but separately-imported waves do not currently dedupe against each other, since nothing recomputes and compares the decoded floats, only the stored bytes. A project with no imported tables at all emits no trace of this feature — the helper proc and every array are gated on at least one node actually selecting a decodable table (`skald-backend/core/codegen_project.odin::generate_project_code`), so G4 does not add so much as a byte to any patch that predates it.

**What this is not.** There is still no interactive waveform *drawer* — sculpting harmonics by hand on a canvas — which remains item 1 of roadmap §9.20 and is not scheduled. Importing also does not currently support multiple frames/a real wavetable stack from one file (the way Serum's own multi-frame `.wav` tables work); Skald reads one cycle, from one file, per node.

### What you hear as you sweep Position

Play and hold a note, then drag Position from left to right. Do it slowly — the whole point of this control is the journey, not the endpoints.

**0.0 to 1.0 (sine → triangle).** You start with the purest sound Skald makes: one frequency, no harmonics, faintly like a whistle or a tuning fork. As you move up, faint odd harmonics fade in and the tone acquires a slightly woody, recorder-like edge. It is a *subtle* zone. It is also, oddly, the quietest zone — more on that in a moment. Musically this is where soft sub-bass and breathy background pads live.

**1.0 to 2.0 (triangle → sawtooth).** This is the big move. Even harmonics fade in alongside the odd ones and the tone opens up from woody to brassy to full buzzy saw. Somewhere around 1.6–1.9 you get the classic "string machine" tone: bright enough to cut, not yet abrasive. If you only ever use one region of this node, use this one, and put a lowpass filter after it.

**2.0 to 3.0 (sawtooth → square).** The even harmonics drain back out and the sound goes hollow and reedy — saw is nasal and full, square is hollow and clarinet-ish. This region has a strange middle: at position 2.5 the crossfade of an up-ramp and a hard step partially cancels, and the peak level falls to 0.5 while the RMS falls to about 0.29. Compare that with 1.00 RMS at position 3.0 exactly. **Sweeping position changes loudness, not just timbre — by roughly 11 dB across the full range.** Nothing in the code normalises the tables (`skald-backend/core/codegen_project.odin::skald_wavetable_sample`), which is a real departure from commercial wavetable synths, where tables are level-matched so that morphing does not pump. Plan for it: put a compressor-free, sane amount of headroom downstream, or keep your morph modulation inside a narrower window.

**Position 3.0 exactly** is the loudest setting on the node by a wide margin — a square wave spends all its time at full amplitude, so its RMS equals its peak. Parking a modulated position against that ceiling produces audible volume jumps.

### What you hear as you sweep Amp

0 is silence. 1.0 is the full ±1 output of the shape. Because the shapes themselves have wildly different RMS levels (see above), Amp is best used as a *static* trim to balance this oscillator against a second source in a Mixer, not as your volume envelope. Use an ADSR for the envelope.

### What you hear when you change Fixed Pitch and Frequency

Leave Fixed Pitch **off** for anything played from the sequencer or a keyboard — that is what makes it an instrument. Turn it **on** only when you want a drone at a fixed frequency regardless of note, or when you are using the Wavetable as an audio-rate *modulator* feeding something else. With Fixed Pitch on, note that pushing Frequency past a few kHz turns the higher positions into a dedicated aliasing generator, which the exercise below exploits on purpose.

### What "expose" does, and why you would do it

Click the small link icon beside a parameter in the properties panel to expose it (`skald-ui/src/components/ParameterPanel.tsx::ParameterPanel`). By default this node ships with `frequency`, `position` and — since packet C5 backfilled the "-6 dB from a checkbox" defect — `amplitude` exposed too (`skald-ui/src/definitions/node-definitions.ts::defaultWavetableParams`). `pulseWidth` and `phase` are not exposed by default; tick them yourself if a game needs to reach them.

Exposing changes the generated Odin in four concrete ways. Take the `position` parameter from the project's own regression fixture, which exposes exactly that one parameter:

1. **It becomes a real field on the processor struct**, initialised to your editor value, instead of being baked into the DSP line as a constant.
2. **The DSP line reads the field every sample.** With unison at 1 (the fixture's setting) the emitted line is `unison_out += skald_wavetable_sample(voice.wavetable_1_phase[i], f32(p.position), math.clamp(f32(f32(0.500000000)), 0.01, 0.99));` followed by `node_1_out = (unison_out / f32(unison_count)) * (f32(1.000000000));` (`skald-backend/tests/golden/wavetable_morph.odin.golden::Asset_process`) — the unison loop and the third, pulse-width argument to `skald_wavetable_sample` are both packet C5 additions. Note that the *unexposed* pulse width and amplitude in that line are frozen literals.
3. **You get a clamped typed setter:** `Asset_set_position` clips to [0, 3] before writing (`skald-backend/tests/golden/wavetable_morph.odin.golden::Asset_set_position`). Your game cannot corrupt the DSP by passing 500.
4. **It appears in a machine-readable table** — `Asset_PARAMS := []Skald_Param_Info{ {"position", 0.0, 3.0, 0.0, ""} }` — plus name-and-node-id dispatch through `Asset_set_param("position", …)` or `Asset_set_param("1::position", …)` (`skald-backend/tests/golden/wavetable_morph.odin.golden::Asset_PARAMS`). A tools programmer can iterate that table and build a debug UI without knowing anything about your patch.

For a game, this is the whole point: expose `position` and you can drive the pad's brightness from player health, from combat intensity, from depth underwater — one float, set from gameplay code, no re-export.

There is an immediate benefit in the editor too. Skald's live preview compiles your actual generated Odin to wasm and plays it (`skald-ui/src/hooks/nodeEditor/useWasmAudioEngine.ts::useWasmAudioEngine`). Changing an **exposed** parameter calls `skald_set_param` and takes effect instantly; changing anything else triggers a debounced regenerate-and-recompile of ~250 ms (`skald-ui/src/hooks/nodeEditor/useWasmAudioEngine.ts::useWasmAudioEngine`, `skald-ui/src/utils/projectSerializer.ts::canApplyParamLive`). So an exposed Position slider *sweeps*, and an unexposed one *steps*. If a control feels laggy while you are sound-designing, check whether it is exposed.

## Try it (hands-on)

Open **`examples/instruments/pads/pad-sequenced.skald.json`**. It is an eight-voice pad instrument at 90 BPM with three-note chords on steps 0 and 8, containing six nodes: a **Wavetable** (position 0.8, amplitude 1, fixedPitch off, `frequency`/`position` exposed) → **Filter** (lowpass, cutoff 900 Hz, resonance 0.8) → **Amp** ADSR (attack 0.9 s, decay 0.5, sustain 0.8, release 2.0) → **Reverb** (decay 4 s, mix 0.35) → **Output**, plus a **Slow Morph** LFO (sine, 0.15 Hz, amplitude 0.6) wired into the Wavetable's `input_pos` handle. `fixedPitch` is off, so exposing `frequency` here buys nothing — packet B2 silently prunes that setter and its `_PARAMS` row from the export rather than shipping a dead knob.

Budget about eight minutes.

1. **Hit play and just listen for two bars.** You are hearing a C minor-ish chord, then an F chord. Because the LFO is at 0.15 Hz, one full morph cycle takes 6.7 seconds — longer than a bar at 90 BPM. Listen for the tone slowly opening and closing underneath the chord. That slow drift *is* wavetable synthesis. Everything else in the patch is a lowpass filter and a reverb.

2. **Prove the LFO is doing it.** Click the **Slow Morph** LFO and drag its Amplitude down to 0. The pad goes static — still a pad, but now it is just an oscillator sitting at position 0.8 and it sounds dead within about three seconds of listening. Drag Amplitude back to 0.6. This is the single most useful thing to internalise: a wavetable with a parked position is *not interesting*.

3. **Find the endpoints by hand.** Set the LFO Amplitude to 0 again so you can hear position cleanly. Click the **Wavetable** node and drag **Table Position** slowly from 0 to 3 while the sequencer runs. Because `position` is exposed, this sweeps smoothly with no recompile stutter. Listen for the three regions described above: nearly nothing happens from 0 to 1, the sound blooms open from 1 to 2, and it goes hollow and hard from 2 to 3.

4. **Notice the loudness problem.** Park Position at **2.5**, listen for a couple of chords, then jump it to **3.0**. That is roughly a 10 dB level jump for what looks on the slider like a small move. Now go back to 2.5 and creep upward in steps of 0.1. The pad gets *louder as it gets more hollow*, which is the opposite of what your ear expects from a timbre control. This is the un-normalised table talking.

5. **Reopen the filter's ears.** Set Position back to 1.8 and leave the LFO at 0. Click the **Filter** node and raise Cutoff from 900 Hz to about 6000 Hz. Suddenly the morph you could barely hear at 900 Hz is obvious and buzzy. Lesson: a lowpass filter set low *hides* your wavetable movement, because everything the position control does happens in the harmonics above the fundamental. Drop the cutoff back to about 2000 Hz and turn the LFO amplitude back up to 0.6 — that is a much better-sounding compromise than the shipped 900 Hz.

6. **Widen the morph until it slams.** With the LFO back at 0.6, set the Wavetable's Position to **1.5** and the LFO Amplitude to **2.0**. Position now swings from −0.5 to 3.5, and the DSP clamps it to [0, 3] (`skald-backend/core/codegen_project.odin::skald_wavetable_sample`). Listen: the morph now *sits* at pure sine for a stretch, then *sits* at pure square, with a fast transit between. The clamp has turned your smooth sine LFO into something closer to a trapezoid, and the level pumps hard against the square end. That flat-topping is the sound of a modulation destination hitting its rails — you will meet it on filter cutoff and on pan too.

7. **Break it: make it alias.** Set the LFO Amplitude to 0 and Position to **3.0** (square). On the Wavetable, tick **Fixed Pitch** and set **Frequency** to **5000** Hz. You will hear a hard, thin, electronic tone — and underneath it, a cluster of whistles that are *not* harmonics of 5000 Hz. Now slide Frequency slowly up towards 8000. Some of those whistles move *downward* as you raise the pitch. That is **aliasing**. A square wave has odd harmonics at 15 k, 25 k, 35 k, 45 k and so on forever; anything above the Nyquist frequency (half your output sample rate, so about 22 or 24 kHz) cannot be represented and folds back down into the audible band as an inharmonic partial that moves the wrong way [Source: https://www.metafunction.co.uk/post/all-about-digital-oscillators-part-2-blits-bleps]. Now drag Position back to **0.0** (sine) at the same 5000 Hz — the whistles vanish completely, because a sine has no harmonics to fold. Skald's shapes are generated naively, with no band-limiting (`skald-backend/core/codegen_project.odin::skald_wavetable_shape`) — see **What Skald deliberately does not do** for why — so this is a permanent property of the node, not a bug you can dial out. **The practical rule: the higher you push Position, the lower you should keep the pitch.** High positions on notes above roughly C6 will get grainy.

8. **Untick Fixed Pitch**, set Frequency back to 440, Position back to 0.8, Filter cutoff back to 900, LFO Amplitude back to 0.6. You are back at the shipped patch — and you now know what every one of those numbers is buying you.

## Why you patch it this way

**Wavetable → Filter → ADSR → effects → Output** is the standard chain, and every link is load-bearing.

*Wavetable first, always.* It is voice-coupled, so it must live in the voice domain, upstream of any Delay or Reverb; the exporter enforces this with a hard error rather than silently dropping the node (`skald-backend/core/codegen_analysis.odin::compute_bus_domain`). It is also a *source* — it has no audio input port at all (`skald-ui/src/components/Nodes/WavetableNode.tsx::WavetableNode`), so nothing can feed into it except modulation.

*Filter second.* A wavetable's whole vocabulary is harmonics. A lowpass filter after it decides how much of that vocabulary reaches your ears. Historically this is exactly what made the PPG musical: digital oscillators smoothed out by analogue filters [Source: https://www.soundonsound.com/sound-advice/q-can-you-explain-origins-wavetable-ss-and-vector-synthesis]. Practically, it also tames the aliasing from step 7 above — the folded partials at the top of the spectrum get attenuated along with everything else. If you put the filter *before* something with no filter at all, you have wasted it; there is nothing upstream of the Wavetable to filter.

*ADSR third, as your level envelope.* This is where beginners most often go wrong with this node. Wavetable's `input_amp` port **adds** to the Amp parameter rather than multiplying it (`skald-backend/core/codegen_nodes.odin::generate_wavetable_code`, `skald-backend/core/param_utils.odin::get_f32_param`). Wire an ADSR into `input_amp` with Amp left at its default and you get an oscillator that runs from 1.0 up to 2.0 and *never goes silent between notes*. Do not do that. Route the audio *through* an ADSR node (or a VCA), the way `pad-sequenced` does, so the envelope multiplies the signal.

*The LFO goes to `input_pos`, not to the output.* Modulating position is a timbre change; modulating a gain is a volume change (tremolo). They sound completely different and only the first one is wavetable synthesis.

*Order mistakes and what they sound like.* Reverb before the filter: your reverb tail gets filtered too, and the pad loses its bloom. Filter before the Wavetable: impossible, no input port. Wavetable after the Reverb: export fails outright. ADSR after the reverb: the reverb tail gets chopped off at note release, which sounds like someone slamming a door.

## Going further

**Envelope the position, not just an LFO.** An LFO on position is periodic — the pad breathes at a fixed rate regardless of what you play. Add a second ADSR and route its output to `input_pos` for a per-note morph: fast attack, medium decay, low sustain means every note starts bright and settles dark, which is how almost every acoustic instrument behaves. This is the single biggest expressiveness upgrade available to this node.

**Stack an LFO and an envelope on the same port.** Both edges into `input_pos` are summed (`skald-backend/core/param_utils.odin::get_f32_param`), so you get per-note movement riding on a slow global drift, which is what expensive pads actually sound like. Keep the total swing modest so you do not spend your time pinned against the 0/3 clamp.

**Use a Mapper to shape the modulation window.** Rather than fighting the clamp, put a Mapper between your LFO and `input_pos` to rescale ±1 into, say, +1.2 to +1.9 — the musically rich triangle-to-saw region — and set the node's own Position to 0. Now the full range of your modulator maps onto the part of the table you actually want.

**Layer two Wavetables in parallel through a Mixer.** Give them different static positions (one at 0.4 for body, one at 2.2 for edge) and modulate them with LFOs at slightly different rates, e.g. 0.11 Hz and 0.17 Hz. Because the rates do not divide evenly, the combined timbre never repeats. Detune one slightly with a small constant on `input_freq` (0.01 ≈ 17 cents, since the port is exponential) for width.

**Drive `input_freq` from an envelope for a pitch attack.** A short envelope of depth 0.08 into `input_freq` gives about a semitone of upward pitch bend on the attack — enough to read as a "pluck" without sounding broken.

**Use it as an audio-rate modulator.** Turn on Fixed Pitch, set a frequency in the audio range, and feed the output into another node's modulation input. A morphing modulator gives you sidebands that change character as you sweep position — closer to a wavetable-FM hybrid than to classic subtractive synthesis.

**Sequence position with P-locks.** Skald's step editor can override a parameter per step, and a P-locked parameter is automatically promoted to an exposed processor field even if you never clicked the link icon (`skald-backend/core/codegen_analysis.odin::effective_exposed_params`). Set a different position on each step of a 16-step pattern and you have a timbre sequence, not just a note sequence.

## Under the hood

Every sample, for every unison copy of every active voice, the generated Odin runs the same unison/detune loop as the Oscillator (`skald-backend/core/codegen_nodes.odin::generate_wavetable_code`). With unison at 1 — the common case, and what the project's regression fixture uses — it collapses to this (`skald-backend/tests/golden/wavetable_morph.odin.golden::Asset_process`):

```odin
unison_out: f32 = 0.0;
unison_count := 1;
for i in 0..<unison_count {
	detune_amount: f32 = 0.0;
	detuned_freq: f32 = (voice.current_freq) * math.pow(2.0, detune_amount / 1200.0);
	voice.wavetable_1_phase[i] = math.mod(voice.wavetable_1_phase[i] + (detuned_freq / sample_rate), 1.0);
	if voice.wavetable_1_phase[i] < 0.0 do voice.wavetable_1_phase[i] += 1.0;
	unison_out += skald_wavetable_sample(voice.wavetable_1_phase[i], f32(p.position), math.clamp(f32(f32(0.500000000)), 0.01, 0.99));
}
node_1_out = (unison_out / f32(unison_count)) * (f32(1.000000000));
```

The phase line is a **phase accumulator**: a counter from 0 to 1 that advances by `frequency / sample_rate` each sample and wraps at 1. At 440 Hz and 48 kHz it advances by about 0.00917 per sample, so it completes a lap every ~109 samples — 440 laps per second. Phase *is* pitch here; the shape is looked up from the phase. When the `phase` parameter is non-zero, an extra line offsets the lookup by `phase / 360.0` before the sample call, the same convention as the Oscillator's degrees-based phase (`skald-backend/core/codegen_nodes.odin::generate_wavetable_code`). The third argument to `skald_wavetable_sample` is the clamped pulse width, which only changes anything once Position is near the square end.

The lookup is where the morph happens (`skald-backend/core/codegen_project.odin::skald_wavetable_sample`):

```odin
p    := math.clamp(pos, 0.0, 3.0)
i1   := int(p)          // lower shape index
i2   := (i1 + 1) % 4    // upper shape index, wrapping
frac := p - f32(i1)     // how far between them
s1   := skald_wavetable_shape(i1, ph, pw)
s2   := skald_wavetable_shape(i2, ph, pw)
return s1 + (s2 - s1) * frac
```

That last line is plain **linear interpolation** — a per-sample crossfade between the two neighbouring shapes. This is the textbook approach and it is what makes the sweep sound continuous instead of stepped [Source: https://en.wikipedia.org/wiki/Wavetable_synthesis]. Note what it is *not*: it is not spectral morphing. It crossfades the two time-domain waveforms directly, which is why the mid-morph level dips you heard in step 4 exist — the two shapes are not phase-aligned in the way a level-matched commercial wavetable would be.

The four shapes themselves are computed analytically rather than read from stored samples (`skald-backend/core/codegen_project.odin::skald_wavetable_shape`): triangle is `abs(ph*4 - 2) - 1`, sawtooth is `ph*2 - 1`, square is `ph < pw ? 1 : -1` (packet C5 parametrised this on the Pulse Width argument; it was a hard-coded 0.5 before), and index 0 falls through to `sin(ph * 2π)`. Strictly speaking this makes Skald's node a *morphing waveshape oscillator* rather than a table-lookup wavetable in Julius Smith's sense [Source: https://ccrma.stanford.edu/~jos/sasp/Wavetable_Synthesis.html] — there is no table in memory and no table-index interpolation, only the position crossfade. Audibly and musically it behaves the same way; the one place the difference shows is aliasing, since a stored band-limited table can be pre-filtered per octave and a formula cannot.

The project's regression suite pins this behaviour down: the `wavetable_morph` acceptance fixture renders MIDI note 69 and asserts both that the peak frequency is 440 Hz ± 8 Hz — proving pitch tracks the note rather than the Frequency box — and that moving position from 0.0 to 2.0 raises the spectral centroid, i.e. genuinely brightens the tone (`skald-backend/acceptance/main.odin::main`).

## Terms introduced

- **Timbre** — the character of a sound independent of its pitch and loudness; determined mostly by which harmonics are present and how loud each one is.
- **Harmonic** — a frequency component at an integer multiple of the fundamental. The 2nd harmonic is one octave up, the 3rd an octave-and-a-fifth, and so on.
- **Fundamental** — the lowest frequency component of a periodic tone; the pitch you perceive.
- **Single-cycle waveform** — one complete period of a wave, a few milliseconds long, intended to be looped rather than played once.
- **Wavetable** — a stack of single-cycle waveforms that an oscillator can read from, plus an index into that stack.
- **Table position** — the index into that stack. Skald's runs 0–3.
- **Interpolation / morphing** — blending between two adjacent waveforms rather than switching abruptly, so a position sweep sounds continuous.
- **Linear interpolation (lerp)** — the simplest such blend: `a + (b - a) × fraction`.
- **Scanning** — moving position over time, usually driven by an LFO or an envelope.
- **Modulation destination** — a parameter that another signal is wired to control, as opposed to one you set by hand.
- **Phase accumulator** — a counter that ramps 0→1 at the note frequency and wraps; the standard way a digital oscillator keeps track of where it is in a cycle.
- **Sample playback / sampling synthesis** — playing back a long recording, as distinct from looping one cycle.
- **Nyquist frequency** — half the sample rate; the highest frequency a digital system can represent.
- **Aliasing** — frequency content above Nyquist folding back into the audible band as inharmonic partials, which move downward when you move the pitch upward.
- **Band-limiting** — techniques (BLEP, band-limited tables) that suppress the harmonics which would alias. Skald's Wavetable does not do this.
- **Voice-coupled node** — a node whose DSP reads per-note state (pitch, velocity, envelope stage) and therefore cannot run after the voices are summed.
- **Bus domain** — the part of the signal chain that runs once per sample on the summed voices; where Delay and Reverb live.
- **Volts-per-octave (V/Oct)** — the convention where a modulation value of +1 means one octave up, implemented as `2^x`.
- **Exposed parameter** — one promoted to a runtime-settable field with a clamped setter and an entry in the generated `<Asset>_PARAMS` table.
- **P-lock (parameter lock)** — a per-step parameter override in the sequencer.
- **RMS** — root-mean-square level; a measure of average loudness, closer to perceived volume than peak level.

## Known issues

Defects that touch this chapter are tracked centrally in the **Known issues** chapter (`KNOWN-ISSUES.md`): KI-021, KI-022. Deliberate design limits — things Skald does not do on purpose — are collected in **What Skald deliberately does not do**.
