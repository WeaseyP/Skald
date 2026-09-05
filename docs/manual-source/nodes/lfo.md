# LFO

> An oscillator so slow you don't hear it as a note — you hear the thing it wobbles.

## What it is

Every synthesiser has knobs. Cutoff, pitch, volume, pan. An LFO — **Low Frequency Oscillator** — is a machine that turns one of those knobs for you, back and forth, forever, at a steady speed. That is the whole idea. It is an oscillator built exactly like the one that makes your tone, running the same sine or square shape, but at a speed *below* the range of human hearing. Feed its output to a loudspeaker and you hear nothing (a 3 Hz sine is a pressure wave far too slow to register as pitch). Feed it to a knob and you hear everything.

The audible band runs roughly 20 Hz to 20 kHz. An LFO lives underneath it, typically between about 0.1 Hz (one full cycle every ten seconds — a slow tidal swell) and 20 Hz (a shudder). Because it never reaches your ear directly, an LFO is a **control signal**, not an **audio signal**. Same maths, different job. The moment you route a signal to a parameter instead of to the output, it stops being a sound and becomes a gesture.

What that gesture sounds like depends entirely on where you point it, and the three classic destinations have their own names. Point it at **pitch** and you get **vibrato** — the wavering a violinist makes by rocking a finger on the string. Point it at **volume** and you get **tremolo** — the pulsing throb of an old guitar amp. Point it at a **filter cutoff** and you get everything from a slow ambient sweep to the "wah" of a wah pedal to a dubstep wobble. Sound On Sound puts useful numbers on that last one: around 0.1 Hz you get a slow evolving sweep, around 1–2 Hz you get a wah-wah, and up in the 10–20 Hz range you get a growl that works well for imitating brass [Source: https://www.soundonsound.com/techniques/modulation].

The waveform matters as much as the speed, because the waveform *is* the shape of the gesture. A **sine** or **triangle** glides smoothly out and back — breathing, swelling, wobbling. A **square** doesn't glide at all: it jumps between two values and holds, which reads as a gate, a stutter, a two-state on/off. A **sawtooth** ramps steadily in one direction then snaps back, which reads as a repeated rising (or falling) sweep with a hard reset at the top. Standard LFO waveform sets are sine, triangle, sawtooth and rectangle, plus random sources like sample & hold [Source: https://theproaudiofiles.com/essential-lfo-parameters/].

Two more numbers worth carrying around. Musical vibrato sits near 5–6 Hz and is *shallow*: for bowed strings, 2–10 Hz at a maximum depth of about 35 cents, and around 20 cents for saxophone — wider and slower is possible but not what players actually do [Source: https://sfzformat.com/tutorials/vibrato/]. A common general-purpose vibrato default is about 6 Hz [Source: https://theproaudiofiles.com/essential-lfo-parameters/]. Depth is what separates "expressive" from "seasick", and beginners almost always set it ten times too high.

The last big idea is **tempo sync**. A free-running LFO at 3.7 Hz will drift against your track forever. Lock it instead to a **note division** — one full cycle per quarter note, per eighth, per sixteenth — and the wobble becomes part of the groove rather than a thing happening near it. This is the entire basis of the wobble bass: a tempo-synced LFO on a lowpass cutoff, usually at 1/4, 1/8 or 1/16, with a triangle shape and a resonant filter [Source: https://www.musicradar.com/how-to/lfo-wobble-bass].

## What it looks like in Skald

The LFO lives in the sidebar's **Nodes** palette, between Noise and S & H, described as "Low-frequency oscillator for modulating parameters. Can sync to BPM." (`skald-ui/src/components/Sidebar.tsx:266`). Drag it onto the canvas. It draws as a purple card — purple is Skald's colour for modulators (`skald-ui/src/components/Nodes/NodeStyles.ts:91`).

**Ports.** The LFO has exactly one handle: an output on the right labelled **Out**, handle id `output` (`skald-ui/src/components/Nodes/LFONode.tsx:12`). It has **no inputs at all**. This is enforced end to end — the backend's connection validator lists LFO under "sources only — no modulation inputs" and will refuse to generate a patch that wires anything into one (`skald-backend/core/graph_validate.odin:57-58`). The codegen agrees: it reads the LFO's own frequency and amplitude with an empty modulation-port argument, so no wire could reach them even if you drew one (`skald-backend/core/codegen.odin:364,368`).

That is worth sitting with for a second, because it shapes how you patch. **You cannot modulate an LFO in Skald.** No LFO-modulating-an-LFO, no envelope fading the vibrato in. Everything shaped has to happen *downstream*, between the LFO and its target — which is what the Mapper and VCA nodes are for (see "Going further").

**What it can connect to.** Anything with a modulation input. The useful destinations, with the port each generator actually reads:

| Target node | Port | What the LFO's value means there |
|---|---|---|
| Oscillator | `input_freq` | **octaves** (exponential / V-Oct) — `codegen.odin:156` |
| Oscillator | `input_amp` | linear amplitude — `codegen.odin:161` |
| Oscillator | `input_pulseWidth` | duty cycle 0–1 — `codegen.odin:162` |
| Filter | `input_cutoff` | **hertz**, added to the cutoff — `codegen.odin:323` |
| Filter | `input_res` | Q, added to resonance — `codegen.odin:324` |
| VCA (Gain) | `input_gain` | linear gain multiplier — `codegen.odin:711` |
| Panner | `input_pan` | −1…+1 position — `generate_panner_code` |
| Mapper | `input` | raw, to be rescaled — `codegen.odin:685` |
| ADSR | `input_attack`/`_decay`/`_sustain`/`_release` | seconds (or level, for sustain) — `codegen.odin:237-240` |
| FM Operator | `input_mod` / `input_carrier` | modulator signal / octaves — `codegen.odin:411,435` |

The full allowed-port list per node type is in `skald-backend/core/graph_validate.odin:26-34`. Note the aliasing convenience: older saved patches that name a port `cutoff`, `frequency` or `amplitude` are rewritten to `input_cutoff`, `input_freq` and `input_amp` at load time (`skald-backend/core/json.odin:36-49`), so both spellings work.

**Rate.** Skald has no separate control-rate tier. The LFO's `sin()` is evaluated once per audio sample, inside the same loop as the oscillators (`skald-backend/core/codegen.odin:372,1824-1825`). It is a control *signal* running at *audio rate*. Practically this means the modulation is perfectly smooth — no stair-stepping or "zipper" noise — and also that nothing stops you from pushing the rate up into the audible band, where it stops behaving like an LFO at all. You will do that deliberately in the exercise.

**One LFO per voice.** The LFO's phase is stored on the *voice*, not on the processor (`skald-backend/core/codegen.odin:1078-1079`), and the per-voice loop only advances voices that are currently sounding (`codegen.odin:1740`). So each note gets its own private LFO. Two consequences you can hear: play a chord and the notes will generally wobble slightly out of step with each other, and — because `note_on` deliberately does *not* reset LFO phase (the reset list at `codegen.odin:1420-1435` covers oscillators, filters, FM and distortion, but not LFOs) — a new note picks the LFO up wherever the previous note in that voice slot left it. The LFO free-runs; it does not retrigger.

## The controls

| Parameter | Range | Default | Unit | What it does to the sound |
|---|---|---|---|---|
| `waveform` | Sine, Sawtooth, Square, Triangle | `Sine` | — | The *shape* of the gesture: glide, ramp-and-snap, or hard two-state jump |
| `bpmSync` | on / off | `false` | — | Take the rate from the project tempo instead of the Hz box |
| `syncRate` | `1/1`, `1/2`, `1/2t`, `1/4`, `1/4t`, `1/8`, `1/8t`, `1/16`, `1/16t`, `1/32`, `1/32t`, `1/64`, `1/64t` | `1/4` | note division | One full LFO cycle per this note value |
| `frequency` | 0.01 – 100 (node card) / 0.1 – 50 (panel) | `5.0` | Hz | Free-run speed. Ignored entirely when `bpmSync` is on |
| `amplitude` | 0 – 10 (node card) / 0 – 1 (panel) | `1.0` | *target's own units* | How far the knob is turned each way |

Defaults: `skald-ui/src/definitions/node-definitions.ts:73-80`. The type contract: `skald-ui/src/definitions/types.ts:61-66`. Node-card ranges: `skald-ui/src/components/Nodes/LFONode.tsx:14-18`. Parameter-panel ranges: `skald-ui/src/components/NodeParameterControls.tsx:155-168`. Sync-rate list: `skald-ui/src/definitions/bpm.ts:33-41`. Backend clamps for exposed parameters: `skald-backend/core/param_ranges.odin:29-31`.

Yes, the two UI surfaces disagree on the ranges. That is real and it matters — see **Code-vs-intent notes**.

### Amplitude — read this one twice

This is the single parameter that trips everybody up, because **the LFO's output is not normalised to anything and it is not a percentage.** The generated code is literally `shape(phase) × amplitude`, and that number is *added directly* to the target parameter in whatever units that parameter uses (`skald-backend/core/codegen.odin:377-386`, then `param_utils.odin:149-154` which sums modulation sources onto the base value).

So:

- Into a **filter cutoff**, amplitude is **hertz**. Amplitude `1.0` — the default — sweeps the cutoff by ±1 Hz. On a bass filter sitting at 160 Hz, that is completely inaudible. Real cutoff sweeps want *hundreds to thousands*: Skald's own test fixture uses 2000 (`skald-backend/tests/fixtures/SEED_FIXTURE_INSTRUCTIONS.md:301`), the evolving-motion pad uses 380 (`examples/instruments/pads/evolving-motion-pad.skald.json:89`), and the deliberately-hostile stress fixture uses 30000 (`skald-backend/tests/fixtures/hostile_modulation.json:51-56`).
- Into an **oscillator's Freq port**, amplitude is **octaves**, because that port is exponential: the generated code computes `base × 2^(sum of modulation)` (`codegen.odin:156`). One octave is 1200 cents, so amplitude `0.02` is ±24 cents — right in the middle of the 20–35 cent band real players use. The LFO component file says exactly this in a comment: "modulation into a Freq port is in OCTAVES (V/Oct), so vibrato wants tiny amplitudes (~0.02)" (`skald-ui/src/components/Nodes/LFONode.tsx:6-8`), and the sax patch uses precisely 0.02 (`examples/instruments/winds/normal-sax.skald.json`, node `sax-vibrato`).
- Into a **gain or amplitude** port, amplitude is linear gain, and here the *bipolar* nature bites: an LFO swings symmetrically about zero, so amplitude `0.5` into a gain of 1.0 gives you 0.5 → 1.5, which clips on the loud half. Tremolo wants a one-sided swing, which means a Mapper.

Sweeping it by ear, on a filter cutoff: at 0 the sound is static (but see the exercise — "static" may not mean "unmodulated"). Between roughly 100 and 400 Hz of swing you get subtle motion, the sound breathing rather than talking. From 500 to 1500 Hz is the musical zone for a wobble bass — the filter opens far enough to expose the sawtooth's upper harmonics and closes far enough to swallow them. Past about 3000 Hz the filter spends most of each cycle wide open, so you stop hearing a sweep and start hearing a periodic *thump* as it slams shut.

### Frequency and syncRate — the same control, two clocks

When `bpmSync` is off, `frequency` is the rate in Hz and the node card shows a **Freq (Hz)** box; when it is on, the box disappears and a **Rate** dropdown of note divisions takes its place (`LFONode.tsx:16-17`, `NodeParameterControls.tsx:158-161`). The parameter panel also prints the resolved time underneath — "1/4 at 120 BPM = 0.500 s" — so you can see what the division actually means at your tempo (`skald-ui/src/definitions/bpm.ts:64-65`; the test that pins this format is `skald-ui/src/tests/bpm/BpmConsistency.test.tsx:155-165`).

The conversion, identical in the UI and the backend: a whole note is 4 beats, so `1/N` is `4/N` beats, a trailing `t` multiplies by 2/3 for a triplet, and seconds-per-cycle is `(60 / bpm) × beats` (`skald-backend/core/codegen.odin:44-50`, mirrored at `skald-ui/src/definitions/bpm.ts:45-58`). The LFO's frequency is then just the reciprocal (`codegen.odin:365-367`).

At 120 BPM that gives you: `1/1` = 0.5 Hz, `1/2` = 1 Hz, `1/4` = 2 Hz, `1/8t` = 6 Hz, `1/8` = 4 Hz, `1/16` = 8 Hz, `1/32` = 16 Hz, `1/64` = 32 Hz.

What you hear as you climb that ladder is not "the same thing, faster". It is three different phenomena in sequence. Below about 1 Hz the ear tracks the sweep as a slow shape — ambience, evolution, something breathing across a bar. From roughly 1 to 8 Hz you hear *rhythm*: individual wobbles you could tap along to. From 8 to about 20 Hz the wobbles fuse into a rough, buzzing texture — the "growl" zone. Above 20 Hz there is no rhythm left at all; you are amplitude- or frequency-modulating the signal at an audible rate and you get sidebands, metallic overtones and a new timbre. Skald lets you go there: the node card's Freq box accepts up to 100 Hz and the exposed-parameter clamp allows the same (`LFONode.tsx:17`, `param_ranges.odin:30`).

One honest gap versus what "tempo sync" means in a DAW: **Skald syncs the rate, not the phase.** The generated code derives the LFO's frequency from `p.bpm` every sample, but nothing ever resets `lfo_<id>_phase` to zero on a bar line, a note-on, or a transport start (`codegen.odin:372`; the note-on reset block at `codegen.odin:1420-1435` has no LFO case). So a 1/4-synced LFO reliably completes one cycle per beat, but *where* in the cycle it is when the downbeat lands depends on how long that voice has been running. For a continuous wobble bass you will not care. If you need the wobble to hit its peak exactly on the beat, you cannot get that from the LFO today — use Sample & Hold, or shape the note with an ADSR instead.

### What "expose" does

Next to every parameter in the right-hand panel is a small chain-link icon. Click it and the link turns blue: that parameter is now **exposed** (`skald-ui/src/components/ParameterPanel.tsx:197-211,228-236`). Exposing does three concrete things.

1. **In the generated Odin**, the parameter stops being a baked-in constant and becomes a real field on the processor struct that the DSP reads every sample. Compare the two emissions: an unexposed LFO amplitude compiles to the literal `* (f32(1.000000000))`, while an exposed one compiles to `* (p.Vibrato_amplitude)` (`skald-backend/tests/generated_audio.odin:861` versus `:1984`).
2. **You get an API for it.** The codegen emits a typed setter `<Asset>_set_<field>(p, value)` that clamps to the range from `param_ranges.odin` (`codegen.odin:1612-1625`), a string-keyed `<Asset>_set_param` / `get_param` pair (`codegen.odin:1677-1710`), and an introspection table `<Asset>_PARAMS` listing every exposed name with its min, max, default and unit so a tools panel or debug overlay can discover them at runtime (`codegen.odin:1631-1643`). For an LFO, `lookup_param_range` returns `{0.01, 100.0, 5.0, "Hz"}` for frequency and `{0.0, 20000.0, 1.0, ""}` for amplitude — deliberate node-specific overrides, because the generic name-keyed table would have clamped an LFO's frequency to the *audio* range 20–20000 Hz and made it useless (`param_ranges.odin:22-31`, and read the comment at lines 24-25).
3. **In the editor, it becomes live.** Exposed-parameter values are masked out of the topology fingerprint, so dragging them applies instantly through `skald_set_param` with no recompile; changing anything else triggers a debounced rebuild of the whole wasm module (`skald-ui/src/utils/projectSerializer.ts:227-247`, `skald-ui/src/hooks/nodeEditor/useWasmAudioEngine.ts:1-15`). You can feel the difference while the patch is playing.

Why you'd expose an LFO parameter for game runtime: rate and depth are the two dials that map most naturally onto game state. Tie LFO amplitude on a filter cutoff to enemy proximity and the drone gets more agitated as the threat closes. Tie LFO frequency to engine RPM and the wobble speeds up with the motor. Tie vibrato depth to a character's stress level. Skald exposes `frequency` and `amplitude` by default on every new LFO for exactly this reason (`node-definitions.ts:79`).

## Try it (hands-on)

We are going to use `examples/instruments/bass/wobble-samplehold-bass.skald.json`. (The file named `lfo-filter-wobble-bass.skald.json` looks like the obvious choice, but it is a bare, unwrapped graph that the preview engine cannot play and its LFO depth is left at the inaudible default — see the last Code-vs-intent note.)

Read the patch before you touch it. Inside the **S&H Wobble Bass** instrument there is a sawtooth oscillator → a lowpass filter at 160 Hz with resonance 3 → an amp ADSR → a distortion → the output. Two modulators feed the filter's cutoff, each through a Mapper:

- **Smooth 1/4** (the LFO): Triangle, BPM Sync **on**, rate **1/4**, Amount **1.0** (`examples/instruments/bass/wobble-samplehold-bass.skald.json:103-115`) → **Sweep 0-900 Hz** (Mapper, in −1…1, out 0…900) (`:117-127`).
- **Stepped 1/8** (Sample & Hold): BPM Sync on, 1/8 → **Steps 150-1900 Hz** (Mapper).

Both mapper outputs are *summed* onto the filter's base cutoff, so the filter actually travels between about 310 Hz and 2960 Hz. Project tempo is 140 BPM.

1. **Load and play.** Sidebar → **Load**, pick `examples/instruments/bass/wobble-samplehold-bass.skald.json`. The BPM box should read 140 (the file carries a `session` block and Load restores it — `skald-ui/src/hooks/nodeEditor/useFileIO.ts:121-131`). Click **Loop**, then **Play**. You should hear a dirty bass with two things moving at once: a smooth *wah* about twice a second, and random stepped jumps on top of it.

2. **Isolate the LFO.** Click the **S&H Wobble Bass** instrument node once. The right-hand panel fills with an **Internal Nodes** list (`skald-ui/src/components/ParameterPanel.tsx:310-316`). Scroll to the **Steps 150-1900 Hz** mapper and drag its *Output Max* down until it meets *Output Min* at about 150. The Sample & Hold's contribution is now a constant 150 Hz offset instead of a random jump, the stepping stops, and only the smooth LFO wobble remains. (These mapper values are exposed, so the change applies instantly with no rebuild.) The filter now sits at 160 + 150 = 310 Hz and the LFO is the only thing moving it.

3. **Hear the division.** Scroll to **Smooth 1/4**. Its BPM Sync box is ticked and Sync Rate reads `1/4`, with the hint underneath: *1/4 at 140 BPM = 0.429 s*. That is one complete wobble — open, closed, open — per beat. Tap along; the wobble peak arrives once per tap.

4. **Halve it, then halve it again.** Set Sync Rate to `1/8`. The hint now reads *0.214 s* (4.7 Hz) and you get two wobbles per beat. Set it to `1/16` — *0.107 s*, 9.3 Hz. Notice the change in *kind*: at 1/16 you are no longer hearing separate wobbles, you are hearing a continuous rough buzz. That is the growl zone Sound On Sound puts at 10–20 Hz. Sync-rate changes are not live-applied, so expect a short gap while the module rebuilds.

5. **Change the shape.** Put Sync Rate back to `1/4` and change Waveform from Triangle to **Square**. The glide vanishes: the filter now snaps between two cutoffs and holds — a gate, not a sweep. Try **Sawtooth**: each beat ramps the filter steadily open then slams it shut, an audible "whoop… *snap*". Try **Sine** and compare it to Triangle — very close, with the sine lingering slightly longer at the extremes because it slows down near its peaks while a triangle travels at constant speed. Return to Triangle.

6. **Break the sync.** Untick **BPM Sync**. A *Frequency (Hz)* slider appears, holding the stored free-run value of 2 Hz — very close to the 2.33 Hz the 1/4 division was giving you at 140 BPM. Now change the project BPM in the sidebar from 140 to 90. The bassline slows down; the wobble does not. Re-tick BPM Sync and the wobble locks back to the beat (`1/4` at 90 BPM = 0.667 s). This is the whole argument for tempo sync in one A/B.

7. **Break it #1 — find out what the Mapper is for.** Set BPM back to 140 and re-tick BPM Sync. Now scroll to **Sweep 0-900 Hz** and drag its *Output Max* slider down toward 0. As the range collapses the wobble fades to nothing and you are left with a dull, closed, lifeless bass sitting at its 310 Hz floor. Here is the lesson: with Output Max at ~1 you have reproduced *exactly* what you would get by deleting the Mapper and wiring the LFO straight into the filter's Cut port. The LFO's raw output is ±1 (amplitude × waveform), and into a cutoff port that means **±1 hertz**. Not a wobble. A rounding error. Put Output Max back to about 900.

8. **Break it #2 — bipolar is not "off".** Set the LFO's *Amplitude (Depth)* to 0. The wobble stops, as expected — but listen to where the tone *lands*. It does not return to the closed 310 Hz sound from step 7; it parks distinctly brighter, around 760 Hz. Why: the Mapper maps input −1…+1 onto output 0…900 by clamped linear interpolation (`skald-backend/core/codegen.odin:701-703`), and an input of 0 is the *midpoint* of −1…+1, so it emits 450 Hz — on top of the 310 Hz floor. Zero LFO output means "centre of the mapped range", not "no modulation". This is the single most useful thing to understand about bipolar modulation: the LFO doesn't add movement on top of your setting, it *replaces* your setting with a moving one whose average is the middle of whatever range you mapped it into. Set Amplitude back to 1.

9. **Break it #3 — push it out of the low-frequency band.** Set Waveform to **Square** and Sync Rate to **1/64** (*0.027 s* at 140 BPM — about 37 Hz). Everything rhythmic disappears. The filter is now being slammed between two states 37 times a second, which is well inside the audible band, so instead of a wobble you hear a harsh buzzing tone sitting *on top of* the bass note — and crucially, its pitch does not follow the note, because it comes from the LFO's clock, not the oscillator's. There is also a gritty edge that has nothing to do with the filter: Skald's square LFO is a naive comparator with instantaneous jumps (`codegen.odin:381`), and instantaneous jumps contain energy above the Nyquist frequency, which folds back down as **aliasing** — inharmonic tones that don't track pitch. This is normally harmless in an LFO precisely because the fundamental is so low that every harmonic above Nyquist is negligible [Source: https://www.metafunction.co.uk/post/all-about-digital-oscillators-part-2-blits-bleps]. At 37 Hz it isn't negligible any more. You have just crossed the boundary where an LFO stops being a low-frequency oscillator.

10. Set Waveform back to Triangle, Sync Rate to `1/4`, and drag the **Steps 150-1900 Hz** mapper's *Output Max* back up to around 1900. You have your bass back.

## Why you patch it this way

**The canonical modulation chain is LFO → Mapper → target.** Not LFO → target. Look at every mature example patch in the repo and you will find the Mapper in the middle: the Reese bass (`examples/instruments/bass/synth-reese-bass.skald.json`, `reese-sweep-lfo` → `reese-sweep-map` → `input_cutoff`), the wobble bass, the FM growl bass. The Mapper node's own source comment names the reason: "The classic use: an envelope/LFO's 0–1 into the hundreds-of-Hz a filter cutoff actually needs" (`skald-ui/src/components/Nodes/MapperNode.tsx:4-6`).

The Mapper earns its place twice over. First it does the unit conversion, turning a dimensionless ±1 into hertz. Second — and this is the part people miss — it lets you set the **floor and ceiling of the sweep independently**, which a bare amplitude control cannot. `outMin: 150, outMax: 1900` says "never let the filter close past 150 Hz, never let it open past 1900". A raw LFO can only say "±N around whatever the base is", which means turning the depth up also drives the filter into its closed extreme where the sound disappears. And because the Mapper's own `outMin`/`outMax` can be exposed, the *shape of the sweep range* becomes a runtime parameter — that is why the example patches expose them (`wobble-samplehold-bass.skald.json:126`).

**There are two exceptions where you go direct.** Into an oscillator's Freq port for vibrato, the natural unit is octaves and the natural depth is tiny, so a bare amplitude of 0.02 is already correct — the sax patch wires `sax-vibrato` straight into `sax-reed`'s `input_freq` with no Mapper. And into a Mixer or straight into an audio path, where the LFO is being used as an audio source rather than a controller.

**Order matters, and it matters in a specific way.** The LFO is a *source*, so it always sits at the head of a modulation branch that runs *parallel* to the audio path, not in series with it. The audio path is oscillator → filter → ADSR → effects → output. The modulation branch hangs off the side and lands on a *parameter port* (`input_cutoff`), never on the audio port (`input`). Wire the LFO into the filter's **In** handle instead of its **Cut** handle and Skald will happily generate it — you will just be summing a 2 Hz sine wave into your audio signal, which produces a huge inaudible DC-ish rumble that eats headroom and makes everything else quieter and lopsided. The handles are labelled **In** and **Cut** on the Filter card for exactly this reason (`skald-ui/src/components/Nodes/FilterNode.tsx:5-9`).

**Put the LFO before the envelope, conceptually.** Because Skald's LFO free-runs per voice and never retriggers, it is a property of the *instrument*, not of the note. The ADSR is the opposite: it restarts on every note-on (`codegen.odin:1404-1410`). If you want per-note movement — a filter that opens once at the start of each note — that is an ADSR into a Mapper into `input_cutoff`, not an LFO. The Reese bass runs both at once, which is the idiomatic combination: an envelope for the per-note attack shape and an LFO for the continuous drift underneath.

**Multiple modulators on one port sum.** `get_f32_param` collects *every* connection into a port and adds them all to the base value (`skald-backend/core/param_utils.odin:138-155`), which is exactly how the wobble bass layers its smooth LFO sweep and its stepped S&H on the same cutoff. Budget your ranges accordingly: two mappers each topping out at 1900 Hz on a 160 Hz base can push the cutoff to 3960 Hz. (The filter clamps at 10 Hz to `sample_rate × 0.16` — about 7.7 kHz at 48 kHz — for stability reasons, so extreme sums get flattened rather than exploding: `codegen.odin:339`.)

## Going further

**Two LFOs at unrelated rates.** The fastest way to make a patch stop sounding like a loop is to modulate two different things at two rates that don't divide into each other — say a 1/4-synced wobble on cutoff and a free-running 0.07 Hz drift on resonance. Their combined pattern takes minutes to repeat. The evolving-motion pad does this: a 0.12 Hz sweep on cutoff plus a separate 4.5 Hz shimmer at 0.015 octaves (±18 cents) on pitch (`examples/instruments/pads/evolving-motion-pad.skald.json:82-92,122-132`).

**Fade the vibrato in.** Real players don't start a note with vibrato; they add it a fraction of a second later, typically after about half a second [Source: https://sfzformat.com/tutorials/vibrato/]. Skald's LFO has no delay or fade control and no input port to modulate its depth — so you build it downstream with a **VCA**. Patch LFO **Out** → VCA **In**, and a second ADSR (slow attack, full sustain, e.g. attack 0.5 s, sustain 1.0) → VCA **Gain**. The VCA multiplies the LFO by the envelope (`codegen.odin:711-714`), so the vibrato swells in over the attack time. Then VCA **Out** → Oscillator **Freq**. This is the single highest-value addition you can make to any sustained instrument, and it is why the sax and tuba patches sound like instruments rather than synths.

**Tremolo, done properly.** Bipolar into a gain port gives you an amplitude that goes above unity and clips. Insert a Mapper set to `inMin: -1, inMax: 1, outMin: 0.4, outMax: 1.0` and you get a one-sided throb between 40% and full volume with no clipping. The FM growl bass uses exactly this shape — `Mod Depth 0.3-1.0` into the modulator oscillator's `input_amp` (`examples/instruments/bass/fm-growl-bass.skald.json`, node `growl-lfo-map`).

**Modulate the modulation.** You cannot feed an LFO, but you can put a second modulator on the **Mapper's** exposed `outMax`, or on the filter's resonance while the LFO drives its cutoff. An LFO on cutoff plus a slower LFO on resonance gives a wobble whose *character* changes over time — sometimes soft, sometimes screaming — from two cheap nodes.

**Series vs parallel on one target.** Two LFOs both wired to `input_cutoff` sum (parallel): you get the *average* of two motions, and if one is much deeper it dominates. Two LFOs chained through a Mapper each (series-ish, LFO A → Mapper → nothing can reach LFO B) is not possible in Skald — which is the practical consequence of the no-inputs rule. If you want one LFO to gate another, run both through VCAs and multiply them there.

**Pulse-width modulation.** Set an oscillator to Square and route an LFO through a Mapper (`out 0.15 … 0.85`) into `input_pulseWidth`. The generated square uses true duty-cycle PWM (`codegen.odin:196-204`), so a slow LFO here gives you the classic thick, chorusing PWM pad — one oscillator that sounds like three. Keep the range away from 0 and 1: the codegen clamps duty to 0.01–0.99 because 1.0 is silent DC.

**Reach for Sample & Hold instead** when you want *stepped* random motion rather than smooth periodic motion — same tempo-sync machinery, same Mapper pattern, different character (`skald-backend/core/codegen.odin:389-405`).

## Under the hood

The generated Odin keeps one number per LFO per voice: a phase angle in radians, `voice.lfo_<id>_phase` (`skald-backend/core/codegen.odin:1078-1079`). Every sample it advances that angle by however much of a cycle fits in one sample period, and wraps it back into `[0, 2π)`:

```odin
voice.lfo_1_phase = math.mod(
    voice.lfo_1_phase + (2 * f32(math.PI) * (FREQ) / sample_rate),
    2 * f32(math.PI))
if voice.lfo_1_phase < 0.0 do voice.lfo_1_phase += 2 * f32(math.PI)
```

(`codegen.odin:372,375`. The negative-phase guard exists because an exposed frequency can legally be driven negative, and Odin's `math.mod` keeps the sign — without the fix-up the sawtooth branch would output the range [−3, −1] instead of [−1, +1].)

`FREQ` is either the frequency parameter, or — when BPM sync is on — the reciprocal of the tempo-derived cycle length, computed against the live `p.bpm` so a tempo change at runtime retunes the LFO immediately (`codegen.odin:365-367`, using `bpm_sync_seconds_expr` at `codegen.odin:28-51`):

```
seconds_per_cycle = (60.0 / p.bpm) × beats      where beats = 4/N, ×2/3 if triplet
FREQ              = 1.0 / seconds_per_cycle
```

Then the phase is turned into a value by one of four shaping functions, each multiplied by amplitude (`codegen.odin:377-386`):

| Waveform | Emitted expression | Output |
|---|---|---|
| Sine | `math.sin(phase) * amp` | smooth ±amp |
| Triangle | `(2/π) · math.asin(math.sin(phase)) * amp` | linear ±amp — `asin(sin(x))` is the classic zero-table triangle |
| Sawtooth | `((phase / π) − 1.0) * amp` | rising ramp −amp → +amp, hard reset |
| Square | `sin(phase) > 0 ? amp : −amp` | 50% duty, instantaneous ±amp |

All four are **bipolar and centred on zero**. Nothing normalises them and nothing scales them to the target — the result is simply added into the destination parameter by `get_f32_param`, which emits `(base) + (node_<lfo>_out)` for every wire landing on that port (`param_utils.odin:149-154`). That one line is why amplitude means hertz for a cutoff and octaves for a pitch: the LFO doesn't know or care what it is plugged into.

Two consequences worth noticing in the emitted code. There is no per-sample branch on the waveform — the codegen picks the branch at generation time and emits only the chosen expression, so a Sine LFO costs one `sin()` and one multiply per sample. And the triangle's `asin(sin(x))` is two transcendental calls, making Triangle the *most* expensive LFO shape in Skald, not the cheapest — worth knowing if you are budgeting a hundred voices on a console.

## Terms introduced

- **LFO (Low Frequency Oscillator)** — an oscillator running below the audible band, used to move a parameter rather than to make a sound.
- **Modulation** — changing one signal's parameter with another signal, continuously and automatically.
- **Control signal / control rate** — a signal routed to a parameter rather than to a speaker. Skald computes its control signals at audio rate (once per sample), so there is no separate control-rate tier.
- **Audio rate** — one value computed per output sample; in Skald, 44.1 or 48 kHz.
- **Bipolar** — a signal that swings symmetrically above and below zero (−1 … +1). Every Skald LFO waveform is bipolar. Contrast **unipolar**, 0 … 1, which is what an envelope produces.
- **Vibrato** — periodic modulation of *pitch*. Musical depths are small: roughly 20–35 cents.
- **Tremolo** — periodic modulation of *loudness*.
- **Wah / filter modulation** — periodic modulation of a filter's cutoff frequency.
- **Wobble bass** — a resonant lowpass cutoff driven by a tempo-synced LFO, usually at 1/4, 1/8 or 1/16.
- **Growl** — the rough, buzzing character a filter takes on when modulated in the ~10–20 Hz region, just under the hearing threshold.
- **Depth / amount / amplitude** — how far the modulator moves its target. In Skald this is expressed in the *target's* units.
- **Rate** — how fast the modulator cycles, in Hz or as a note division.
- **Tempo sync / note division** — locking the modulator's rate to the project tempo so one cycle spans a musical value (1/4, 1/8, 1/8t…).
- **Triplet** — a note division squeezed to 2/3 of its normal length, giving three in the space of two.
- **Cent** — 1/1200 of an octave; the standard unit for small pitch deviations.
- **V/Oct (volt per octave)** — an *exponential* pitch-control convention where each unit of modulation means one octave. Skald's oscillator Freq port works this way.
- **Free-running** — a modulator whose phase is never reset by note events; it keeps cycling regardless of what you play.
- **Retrigger** — resetting a modulator's phase to the start on each new note. Skald's LFO does **not** retrigger.
- **Phase** — how far through its cycle an oscillator currently is, measured 0 … 2π radians.
- **Duty cycle / pulse width** — the fraction of a square wave's period spent in the high state.
- **Aliasing** — frequencies above half the sample rate folding back down into the audible band as inharmonic, non-pitch-tracking tones. Sharp waveform discontinuities cause it.
- **Nyquist frequency** — half the sample rate; the highest frequency a digital system can represent.
- **Voice** — one instance of the instrument's whole signal chain, allocated per sounding note. Skald gives each voice its own LFO.
- **Bus domain** — the part of the graph that runs once per sample on the summed output of all voices, downstream of a Delay or Reverb.

## Known issues

Defects that touch this chapter are tracked centrally in the **Known issues** chapter (`KNOWN-ISSUES.md`): KI-001, KI-013, KI-025, KI-026. Deliberate design limits — things Skald does not do on purpose — are collected in **What Skald deliberately does not do**.
