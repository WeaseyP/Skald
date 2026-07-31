# Noise

> A generator that outputs a new random number every single sample — the raw hiss that becomes snares, hi-hats, breath, wind and impacts once you filter and envelope it.

## What it is

Every other sound source in Skald repeats. An Oscillator walks a sine or a saw around a cycle and comes back to where it started, and because that shape repeats at a steady rate your ear hears a **pitch**. Noise never repeats. Each sample is a fresh random number, unrelated to the one before it, so there is no cycle for your ear to lock onto and no pitch to hear. What you hear instead is a **hiss** — a texture rather than a note.

That "unrelated to the sample before it" property has a precise consequence in the frequency domain. A signal whose samples are uncorrelated has a flat expected **power spectral density** — the amount of energy sitting in each slice of the frequency axis is the same everywhere, from the deepest bass to just under the sample-rate ceiling. That is the definition of **white noise**, by analogy with white light containing every colour at once [Source: https://www.dsprelated.com/glossary/white-noise]. It is worth being clear about what "white" is and is not claiming: whiteness is a statement about correlation and spectrum, not about the shape of the random numbers themselves. Skald's noise draws each sample from a *uniform* distribution (every value between -1 and +1 equally likely) rather than a bell curve, and it is still white, because the samples are still uncorrelated [Source: https://ccrma.stanford.edu/~jos/sasp/Filtered_White_Noise.html].

Here is the part that surprises people. White noise has equal energy *per hertz*, but your ear does not hear in hertz — it hears in roughly logarithmic bands, in octaves. The octave from 20 Hz to 40 Hz is 20 Hz wide. The octave from 10 kHz to 20 kHz is 10,000 Hz wide, and so contains five hundred times as much energy. So white noise, spread perfectly evenly across the spectrum, sounds violently top-heavy: a bright, thin, hissy *tsssss*. Half of all its energy lives in the top octave alone. **Pink noise** fixes this by rolling the spectrum off at 3 dB per octave, which makes each octave carry equal energy [Source: https://www.epanorama.net/documents/audio/noisetypes.html]. Pink sounds like a waterfall or distant rain — fuller, darker, more natural. It is also, not coincidentally, close to the average long-term spectrum of speech and music [Source: https://en.wikipedia.org/wiki/Pink_noise].

Now the central idea of this chapter: **raw noise is almost never the sound you want**. It is a raw material, not a finished sound. On its own it is a fire hose of energy across the whole spectrum with no shape in time. Real noisy sounds — a snare's wire rattle, a hi-hat's shimmer, breath across a mouthpiece, a gunshot, wind past a window — are noise that has been *filtered* (given a spectral shape) and *enveloped* (given a shape in time). Take either away and it stops sounding like anything.

The theory behind the filtering half is unusually clean, and it is why noise is such a powerful source. Push white noise through any filter and the output spectrum is exactly the filter's squared magnitude response scaled by the noise's variance: `S(ω) = |H(ω)|² · σ²` [Source: https://ccrma.stanford.edu/~jos/sasp/Filtered_White_Noise.html]. In plain terms: **the filter's frequency response becomes the sound**. A resonant bandpass at 300 Hz on noise doesn't just tint it, it *is* a wind sound. A steep highpass at 8 kHz on noise *is* a hi-hat. You are not filtering a sound; you are drawing a spectrum, and using noise as the pencil.

The enveloping half is what turns a spectrum into an event. Sound On Sound's snare drum article makes the point directly: a snare is not "noise", it is noise passed through a VCA driven by an envelope, layered against a tuned shell tone, with the balance between the two changing with how hard you hit it [Source: https://www.soundonsound.com/techniques/synthesizing-drums-snare-drum]. Percussion, in particular, is mostly envelope. The difference between a closed hi-hat and an open one is a decay time, nothing else.

## What it looks like in Skald

Noise lives in the **Nodes** palette in the left sidebar, listed as "Noise" with the tooltip "White and pink noise source" (`skald-ui/src/components/Sidebar.tsx:265`). Drag it onto the canvas. It draws in near-white (`skald-ui/src/components/Nodes/NodeStyles.ts:90`), which is how you spot generators at a glance.

The node is tiny, which is honest — it has almost nothing to configure.

**Handles** (`skald-ui/src/components/Nodes/NoiseNode.tsx:6-7`):

| Side | Handle id | Label | What it takes / gives |
|---|---|---|---|
| Input (left) | `input_amp` | Amp | Modulation added to the amplitude setting |
| Output (right) | `output` | Out | The noise signal itself |

There is **no `input` port**. This is not an oversight — Noise is a source, so nothing flows *through* it. The Odin-side validator hard-codes exactly one legal input port for this node type and rejects the whole graph if you somehow save a wire into any other port name (`skald-backend/core/graph_validate.odin:28`, dispatched at `:43`). That strictness is deliberate: a mistyped port used to be silently dropped at codegen time, so an exported asset would ship missing a connection with no warning (`skald-backend/core/graph_validate.odin:12-19`).

Noise runs at **audio rate** — one fresh random sample per output sample, generated inside the per-voice loop (`skald-backend/core/codegen.odin:1814-1815`). That means each polyphonic voice gets its *own* independent noise stream, seeded differently per voice (`skald-backend/core/codegen.odin:1293-1299`). This matters more than it sounds: if all eight voices shared one stream, stacking eight notes would just be one noise signal eight times louder and no wider. Independent streams sum incoherently, which is what makes stacked noise layers feel thick and stereo-wide rather than merely loud.

There is a second placement. If a Noise node sits downstream of a Delay or Reverb, Skald moves it into the **bus domain** and runs it once per sample on the processor rather than per voice (`skald-backend/core/codegen.odin:1921-1922`, seeded at `:1316-1318`). A bus-domain Noise has no voice to gate it, so it hisses continuously for as long as the processor runs. That is occasionally what you want (tape hiss, room tone, a constant wind bed) and usually a mistake.

What it can feed: anything with an audio `input` — Filter, ADSR, Gain, Distortion, Mixer, Panner, Delay, Reverb, Output. What it can be fed by: anything whose output you want *added* to its amplitude — an LFO, an ADSR, a Mapper, a Sample & Hold.

## The controls

| Parameter | Range | Default | Unit | What it does to the sound |
|---|---|---|---|---|
| `type` | `White` \| `Pink` | `White` | — | Chooses the spectral tilt: flat, or -3 dB/octave |
| `amplitude` | 0.0 – 1.0 | 1.0 (UI) / 0.5 (codegen clamp table) | — | Output level, before anything else in the chain |

Sources for those rows: the type list is `NoiseType = 'White' | 'Pink'` (`skald-ui/src/definitions/types.ts:88`), offered in both the on-canvas dropdown (`skald-ui/src/components/Nodes/NoiseNode.tsx:9`) and the Parameter Panel (`skald-ui/src/components/NodeParameterControls.tsx:231`). The amplitude range 0–1 appears in three places that agree — the node card's inline field, `min: 0, max: 1, step: 0.05` (`skald-ui/src/components/Nodes/NoiseNode.tsx:10`), the panel slider `slider('amplitude', 0, 1, 1)` (`skald-ui/src/components/NodeParameterControls.tsx:232`), and the codegen clamp `{0.0, 1.0, 0.5, ""}` (`skald-backend/core/param_ranges.odin:86-87`). The *default* is where they disagree; see the Code-vs-intent notes at the end.

### Type — what you hear

Switch a bare Noise → Output patch between the two settings and the difference is unmistakable. **White** is a bright, papery, aggressive *tssss*, and it sits mostly "above" the music — it fights cymbals and sibilance and nothing else. **Pink** is the same hiss with the top pulled down and the bottom filled in: a *shhhh* that sounds like rain, a distant motorway, or a breath. Pink is noticeably duller and feels warmer and closer.

Practically: reach for **White** whenever you want the noise to be *transient and bright* — hi-hats, cymbals, snare rattle, pick attack, glass, sparks. Every percussion and attack-transient example in the repo uses White (`examples/instruments/drums/snare-sequenced.skald.json`, `examples/instruments/guitar/clean-electric.skald.json` "Pick Noise" at amplitude 0.35, `examples/sound-effects/geowars/kill-explosion.skald.json` "Crack" at 0.8). Reach for **Pink** whenever the noise is a *sustained body* the ear must live with for seconds — breath, wind, air. Both saxophone patches use Pink at amplitude 0.15 for the "Breath" layer (`examples/instruments/winds/normal-sax.skald.json`), and the wind patch uses Pink at 0.5 (`examples/instruments/winds/wind.skald.json`). Those low breath amplitudes are the point: sustained noise sitting *under* a tone needs far less level than you would guess, because noise occupies every frequency band at once and therefore masks everything.

One important limitation: `type` is a string, and Skald's exposed-parameter mechanism only handles numbers. The Parameter Panel explicitly marks it non-exposable (the `false` argument at `skald-ui/src/components/NodeParameterControls.tsx:231`), and the codegen reads it once, at generation time, to decide which block of DSP to emit (`skald-backend/core/codegen.odin:292-295, 300`). **You cannot switch White↔Pink at game runtime.** If you need both, build both and crossfade them with a Mixer.

### Amplitude — what you hear

Sweep it from 0 to 1 with the noise going straight to the Output.

At **0.0** the node emits digital silence — the multiply zeroes it (`skald-backend/core/codegen.odin:314`). At **0.05–0.2** you get the "air" zone: a hiss you notice only when it stops. This is where sustained noise layers belong, and where the sax patches sit. At **0.3–0.6** noise is an audible partner to a tone — pick attack, breath you're meant to hear, snare rattle mixed against a shell. At **0.8–1.0** the noise is the whole sound, which is right for a bare snare or an explosion crack and wrong for almost everything else. The snare example runs 0.8 (`examples/instruments/drums/snare-sequenced.skald.json`) and gets away with it because a highpass immediately throws away most of the spectrum.

The trap is that noise **sums** with everything else and Skald's generated processor has **no output limiter** — the final line just returns the accumulated left/right sum scaled by the instrument volume (`skald-backend/tests/generated_audio.odin:647`). Two layers at 0.8 apiece will exceed ±1.0 and clip hard. Noise is the worst offender here because, unlike a sine, it has no predictable peak — it is *statistically* likely to spike whenever a spike is possible.

### The Amp input, and the gotcha worth knowing

Wiring something into the **Amp** handle does *not* replace or scale the amplitude value. It is **added** to it. Skald's parameter resolver builds the expression `(base) + (modulator)` and hands that to the noise generator (`skald-backend/core/param_utils.odin:149-154`, consumed at `skald-backend/core/codegen.odin:298`).

So if you leave amplitude at its 1.0 default and patch an ADSR into Amp hoping to gate the noise, you get `noise × (1.0 + envelope)` — noise that is *never quieter than full scale* and gets louder during the envelope. This is the single most common way to be confused by this node.

Two correct patterns:

- **To gate noise**, put the envelope *after* the noise in the signal path — `Noise → ADSR` (feeding the ADSR's `input`), or `Noise → Gain` with the envelope on the Gain's `input_gain`. Every example patch in the repo does it this way.
- **To modulate noise level**, set the base amplitude to the *bottom* of the range you want and use the Amp input to add the rest. For a 0.1→0.5 swell, set amplitude to 0.1 and feed in a modulator whose output tops out at 0.4.

### What "expose" does

Click the chain-link icon beside a parameter in the Parameter Panel and it turns blue (`skald-ui/src/components/ParameterPanel.tsx:74-82, 202-209`). That adds the name to the node's `exposedParameters` list — for Noise, `amplitude` is exposed by default (`skald-ui/src/definitions/node-definitions.ts:98-102`).

Exposing promotes a baked-in constant into a **public, runtime-settable field on the generated Odin processor**. Compare the two emissions for the same node. Un-exposed, the amplitude is welded into the arithmetic as a literal. Exposed, the snare's noise node emits:

- a struct field `White_Noise_amplitude: f32` (`skald-backend/tests/generated_audio.odin:121`)
- an initialiser `p.White_Noise_amplitude = 0.800000012` — the value from your patch, not the table default (`:149`)
- a clamped setter `Snare_set_White_Noise_amplitude`, which pins the value to 0.0–1.0 exactly as `param_ranges.odin` specifies (`:337-341`)
- a row in the introspectable table: `{"White_Noise_amplitude", 0.0, 1.0, 0.8, ""}` (`:391`), so your game can enumerate parameters and build UI without hard-coding names
- string-keyed set/get dispatch (`:434-435`, `:480-481`)

Note the name. Two nodes in that patch expose `amplitude`, so the collision resolver prefixes each with its sanitised node **label** (`skald-backend/core/codegen.odin:1200-1207`). Label your nodes well — the label becomes your API.

Why you'd expose noise amplitude specifically: it is the most useful real-time handle on a percussion or texture patch. Drive it from surface material so footsteps on gravel get more noise than footsteps on wood. Drive it from vehicle speed for wind. Drive it from player exertion for breath. All of that is `Snare_set_param(p, "White_Noise_amplitude", x)` at runtime — no regeneration, no reload.

## Try it (hands-on)

Open `examples/instruments/drums/snare-sequenced.skald.json`. This is a textbook two-layer synthetic snare: a noise "rattle" layer standing in for the snare wires, and a tuned sine "thump" standing in for the shell — exactly the two-element structure Sound On Sound describes [Source: https://www.soundonsound.com/techniques/synthesizing-drums-snare-drum].

1. **Load and listen.** Click **Load** in the sidebar (`skald-ui/src/components/Sidebar.tsx:206`) and pick the file. Click **Play**. You'll hear a snare on the backbeat — the pattern is 16 steps at 120 BPM with hits on steps 4 and 12, at velocity 1.0 and 0.95. Turn **Loop** on so it keeps going while you work.

2. **Open it up.** The patch is a single **Snare** instrument node. Click it once to select it, then click **Explode Instrument** in the sidebar's Grouping section (`skald-ui/src/components/Sidebar.tsx:228-235`). The seven internal nodes spill onto the canvas:

   `White Noise` (White, amp 0.8) → `Rattle Highpass` (Highpass, 1800 Hz, Q 1.0) → `Rattle` ADSR (A 0.001 s, D 0.18 s, S 0, R 0.05 s) → Mixer ch 1 @ 0.8
   `Thump Oscillator` (Sine, 185 Hz, fixed pitch, amp 0.5) → `Thump` ADSR (A 0.001 s, D 0.09 s, S 0, R 0.02 s) → Mixer ch 2 @ 0.6
   Mixer → Output

3. **Hear the noise alone.** On the Mixer node, set **channel 2**'s level to `0` (the per-channel number fields live right on the node card, `skald-ui/src/components/Nodes/MixerNode.tsx:59`). The snare loses its body and becomes a pure *pfft* of filtered noise. It's recognisably a snare rattle and completely lacks weight. Put channel 2 back to `0.6` and notice how much the 185 Hz sine contributes — that's the shell, and it's carrying all the *pitch* information in a sound you'd swear had none.

4. **Hear why the filter matters.** Select `Rattle Highpass` and drag its **Cutoff** from 1800 Hz down to **20 Hz**. The highpass is now doing nothing, so the full white spectrum gets through. Listen: the snare turns into a burst of grey mush. All that added low-mid energy doesn't make it bigger, it makes it *vaguer*, and it swamps the 185 Hz thump — the one element that gave the drum a note. This is what "mud" means in practice. Now sweep the cutoff back up slowly. Around 400–800 Hz the thump reappears. Around 1500–2500 Hz the rattle snaps into focus and stops competing. Around 6 kHz it becomes a hi-hat and stops being a snare at all. **Everything the noise contributes is decided by this one control** — which is the `S(ω) = |H(ω)|² σ²` result made audible [Source: https://ccrma.stanford.edu/~jos/sasp/Filtered_White_Noise.html]. Return it to 1800 Hz.

5. **Hear why the envelope matters.** Select the `Rattle` ADSR and drag **Sustain** from 0 to **1.0**. The rattle stops decaying and becomes a flat rectangular block of hiss that runs the full note length (0.25 s here — two 16th-notes at 120 BPM) and then cuts off dead. It sounds like a broken sample player, not a drum. Now bring Sustain back to 0 and sweep **Decay** instead: at **0.02 s** you have a tight electro snap; at **0.18 s** (the patch value) a normal snare; at **1.5 s** the tail smears across the next beat and the groove disappears. **Decay time is the instrument.** Set Sustain back to 0 and Decay back to 0.18.

6. **Turn it into a hi-hat, without adding a node.** Set `Rattle Highpass` cutoff to **8000 Hz**, `Rattle` Decay to **0.05 s**, and Mixer channel 2 to **0**. That is a closed hi-hat — highpassed noise plus a very short decay, which is the standard recipe [Source: https://noiseengineering.us/blogs/loquelic-literitas-the-blog/hats-off-to-this-series-synthesizing-hats-in-the-final-percussion-synthesis-post/]. Raise Decay to **0.3 s** and you have an open hat. Nothing about the source changed. Undo back to the snare (Ctrl+Z, or reload).

7. **Break it deliberately — clipping.** Set the `White Noise` **Amp** to `1.0`, Mixer channel 1 to `2.0` (its maximum, `skald-ui/src/components/Nodes/MixerNode.tsx:59`), and channel 2 back to `0.6`. Play. You'll hear a nasty crackling fizz riding on top of the snare, and it will sound *dirtier at the start of each hit* than at the end. That's hard clipping: the summed signal exceeds ±1.0 and the generated processor does not limit it (`skald-backend/tests/generated_audio.odin:647`). Noise clips uglier than a tone because a sine's peak is predictable and noise's is not — its worst moments are random, so the distortion is random too. Now drop the noise Amp to `0.3` while leaving the mixer at 2.0. Same average loudness, no crackle. The lesson: **gain-stage noise early**, at the source, not at the mixer.

8. **Break it the other way — the additive Amp input.** Drag a wire from the `Rattle` ADSR's output to the `White Noise` node's **Amp** input. You might expect this to gate the noise. Instead the snare gets *louder and fizzier*, because the envelope is added to the existing 1.0 (or whatever you left it at) rather than multiplying it (`skald-backend/core/param_utils.odin:149-154`). Delete the wire, set the noise Amp back to `0.8`. Envelopes belong in the signal path, not on the Amp input.

## Why you patch it this way

The canonical noise chain is three nodes, always in this order:

**Noise → Filter → Envelope (ADSR or Gain) → Mixer/Output**

Every noise-using example in the repo follows it. Snare: Noise → Highpass 1800 → ADSR (`examples/instruments/drums/snare-sequenced.skald.json`). Hi-hat: Noise → Highpass 8000 Q 0.2 → ADSR with 0.05 s decay (`examples/instruments/drums/acoustic-electric/HiHat.json`). Wind: Pink Noise → Bandpass 600 Hz Q 1.2 → Gain → Reverb (`examples/instruments/winds/wind.skald.json`). Sax breath: Pink Noise at 0.15 → filter → mixed under the tone (`examples/instruments/winds/normal-sax.skald.json`).

**Why filter before envelope.** Both orders are technically legal and the filter is linear, so in a *static* patch the difference is small. The order matters the moment anything moves. If the envelope comes first, the filter sees a signal whose level swings from zero to full over a millisecond, and a resonant filter will ring on that transient — sometimes usefully, often as an audible chirp. If the filter comes first, it runs on a steady-state signal and settles into its response before the envelope ever opens, which is what you want for clean percussion. There is also a practical reason: filter cutoff is the parameter you most often want to modulate per-hit, and you want that modulation shaping the spectrum, not fighting an amplitude envelope for the same job.

**Why the envelope must exist at all.** In the per-voice domain a Noise node only runs while its voice is active — the generated loop skips inactive voices entirely (`skald-backend/tests/generated_audio.odin:505`) — and the voice deactivates when every ADSR in it reaches Idle (`:643-645`). So a voice chain containing *no* ADSR has nothing to keep it alive or shut it up, and you get a hard-edged rectangular burst rather than a drum hit. And a Noise node in the **bus** domain (downstream of a Delay or Reverb) has no gate at all and hisses forever (`skald-backend/core/codegen.odin:1921-1922`). If you put a Reverb between your Noise and your envelope, congratulations: you have built a permanent hiss generator with a reverb on it. Reverb goes *after* the envelope.

**Why noise gets layered with a tone.** A noise-only percussion hit has no pitch, so it cannot be tuned to the track and it disappears in a dense mix. The snare patch's 185 Hz sine is doing the job that the drum shell does acoustically — supplying a fundamental. The mixer balance between the two (0.8 rattle / 0.6 thump) is the "wire tension" control of the instrument. Sound On Sound's treatment goes further and makes that balance velocity-dependent, since harder hits push proportionally more energy into the noisy high end [Source: https://www.soundonsound.com/techniques/synthesizing-drums-snare-drum].

**Where it goes wrong.** Noise straight into Output: unshapen hiss. Noise into an over-open filter: mud that masks everything else in the mix, because unlike a tone, noise occupies *every* band simultaneously. Noise summed at full amplitude alongside other layers: clipping, with no limiter to save you. Envelope wired to the Amp input instead of the signal path: the additive-modulation trap from step 8.

## Going further

**Modulate the filter cutoff, not just the amplitude.** A single ADSR into the Filter's `input_cutoff` alongside the amplitude envelope is the biggest expressive upgrade available to any noise patch. Give the cutoff envelope a *shorter* decay than the amplitude envelope and every hit opens bright and closes dark, which is what a real cymbal does as its high partials die first. This is also the mechanism behind velocity-sensitive brightness: map velocity to cutoff so soft hits are dull and hard hits are bright.

**Use two noise layers with different filters.** One highpassed at 6–10 kHz with a 40 ms decay for the "sizzle", one bandpassed around 1–2 kHz with a 200 ms decay for the "body". Because each Noise node gets its own independently seeded random stream (`skald-backend/core/codegen.odin:1293-1299`), the two layers are genuinely decorrelated and sum to something wider than either alone — which is exactly the trick you cannot pull off by duplicating one layer.

**Notch the noise.** A Notch filter carves a hole in the spectrum rather than a slope. Sound On Sound specifically recommends band-reject filtering for snares, because real snare drums have spectral holes where the head's modes cancel [Source: https://www.soundonsound.com/techniques/synthesizing-drums-snare-drum]. Two notches in series produces a distinctly "metallic, real" character that a plain highpass never gets to.

**Add slow modulation for sustained textures.** The wind patch is the model: an LFO at 0.1 Hz, amplitude 0.25, wired into a Gain node's `input_gain` to make the wind swell and drop over ten-second cycles (`examples/instruments/winds/wind.skald.json`). Sustained noise with a *constant* level is instantly recognisable as fake; the fix is always slow, irregular level and cutoff movement. Stack a second LFO at a non-integer-related rate (say 0.037 Hz) so the pattern never audibly repeats.

**Try Sample & Hold on the filter cutoff.** Stepped random cutoff over noise gives you crackle, geiger counters, radio static and fire. This is noise modulating noise, and it produces textures no single generator can.

**Series vs parallel.** In *series* — Noise → Filter → Distortion — the distortion adds harmonics to already-shaped noise and thickens it into something almost tonal. In *parallel* — Noise and Oscillator into separate Mixer channels — the two stay independent and you control their balance, which is what you want for drums and plucked instruments where the noise is an *attack* on top of a tone. The guitar patches all take the parallel route: a "Pick Noise" layer at 0.35 sitting on the front of the string tone (`examples/instruments/guitar/clean-electric.skald.json`).

**Short noise bursts as attack transients.** This is the highest-value trick in the whole node. A 5–15 ms noise burst, highpassed and mixed quietly under the start of *any* sustained sound, makes it read as physically struck or plucked. Every guitar and bass example in the repo does this at amplitudes between 0.35 and 0.6 (`examples/instruments/bass/slap-bass.skald.json`, "Thumb Snap" at 0.6). Your ear uses the first few milliseconds of a sound to decide what kind of object made it, and noise in those milliseconds says "something hit something".

## Under the hood

**The random source.** Every Noise node gets its own `PRNG_State` — a single `u32` — and a 32-bit xorshift generator (`skald-backend/core/codegen.odin:2288-2299`):

```odin
x := rng.state
x ~= x << 13
x ~= x >> 17
x ~= x << 5
if x == 0 do x = 0xDEADBEEF   // xorshift32 stuck-state guard
rng.state = x
return f32(x) / 4294967296.0  // → [0, 1)
```

Three shift-and-XOR operations per sample. That's it — no multiplies, no table lookups, no branch except the zero guard. The sequence has a period of 2³² − 1, which at 48 kHz is about 24.8 hours before it repeats. It is deterministic, so the same patch produces byte-identical audio on every run and on every machine, which is what makes the golden-file tests possible.

**White.** One line (`skald-backend/core/codegen.odin:314`):

```odin
node_X_out = (next_float32(&voice.noise_X_rng) * 2.0 - 1.0) * (amplitude)
```

The `* 2.0 - 1.0` converts the generator's `[0, 1)` output into a **bipolar** `[-1, 1)` signal. The comment at `:312-313` records why this exists: the raw unipolar output put a constant `+0.5 × amp` DC offset on every voice — a silent bias that wastes headroom and thumps when voices start and stop. Any noise generator that isn't centred on zero is broken.

**Pink.** Pink noise is white noise through a filter with a -3 dB/octave slope, but a true -3 dB/octave response is not realisable with a small number of poles, so everyone approximates. Skald uses Paul Kellett's "economy" filter — three one-pole lowpasses at different corner frequencies, summed with a scaled copy of the raw white input to fill in the top end (`skald-backend/core/codegen.odin:304-309`):

```odin
white = next_float32(&rng) * 2.0 - 1.0
p0 = 0.99765 * p0 + white * 0.0990460
p1 = 0.96300 * p1 + white * 0.2965164
p2 = 0.57000 * p2 + white * 1.0526913
out = (p0 + p1 + p2 + white * 0.1848) * 0.25 * amplitude
```

Those coefficients are Kellett's published economy values verbatim, good to roughly ±0.5 dB against an ideal 1/f slope [Source: https://www.firstpr.com.au/dsp/pink-noise/]. Each `pN` line is a one-pole lowpass — a running weighted average whose "memory" is set by the leading coefficient. `p0` at 0.99765 has a very long memory and contributes the deep sub-bass; `p2` at 0.57 has almost none and contributes upper-mids; the bare `white * 0.1848` term fills the treble that no lowpass reaches. Stack the three staircase responses and you get a passable straight -3 dB/octave line. The trailing `0.25` is a normalisation: the filter's combined gain swings the output to roughly ±4, and 0.25 pulls it back **toward** ±1 (`:308`) — toward, not exactly to, so leave headroom when running pink at high amplitudes. The three `pN` values are persistent state, emitted as extra struct fields only when the node is actually set to Pink (`skald-backend/core/codegen.odin:1086-1090` for voices, `:1146-1150` for the bus).

**Seeding.** At init, each voice's noise state is set to `0xC0FFEE01 ~ u32(i + 1) * 2654435761`, with the constant incrementing per node (`skald-backend/core/codegen.odin:1293-1299`). The literal reason in the comment is that xorshift32 of 0 returns 0 forever, so an unseeded generator emits silence rather than noise (`:1275-1277`). The musical side effect is the one that matters to you: every voice of every noise node is a different random stream, so polyphonic noise sums incoherently and sounds genuinely wide.

## Terms introduced

- **White noise** — a random signal whose samples are uncorrelated, giving a flat power spectral density: equal energy in every hertz of bandwidth. Sounds bright and hissy.
- **Pink noise** — noise whose spectrum falls at 3 dB per octave, so each *octave* carries equal energy. Sounds fuller and darker; close to the average spectrum of music and many natural sounds. Also called 1/f noise.
- **Power spectral density (PSD)** — how a signal's energy is distributed across frequency. "Flat PSD" means every frequency slice holds the same amount.
- **Spectrum / spectral shape** — the frequency-domain fingerprint of a sound; with noise, the filter's frequency response *becomes* the spectrum.
- **Bipolar vs unipolar** — a bipolar signal swings symmetrically around zero (-1 to +1); a unipolar one sits entirely on one side (0 to 1) and carries a DC offset, which wastes headroom and causes clicks.
- **DC offset** — a constant, inaudible bias away from zero riding on an audio signal.
- **Uncorrelated / decorrelated** — two signals with no predictable relationship. Decorrelated noise streams sum to something wider and smoother than correlated copies, which just get louder.
- **Envelope** — a control signal that shapes a sound's level (or any parameter) over the lifetime of a note. For noise, the envelope is what turns a texture into an event.
- **Transient / attack transient** — the first few milliseconds of a sound. Your ear reads it to identify what physically produced the sound.
- **Highpass filter** — passes frequencies above the cutoff, removes those below. The default tool for making noise into percussion.
- **Bandpass filter** — passes a band around the cutoff and removes everything else. The default tool for making noise into wind, breath and air.
- **Notch (band-reject) filter** — removes a narrow band and keeps everything else; used to carve realistic spectral holes into synthetic drums.
- **Cutoff frequency** — the frequency at which a filter starts taking effect.
- **Mud** — the perceptual result of too much undifferentiated low-mid energy: a mix that sounds vague and where individual elements stop being distinguishable.
- **Clipping** — what happens when a signal exceeds the ±1.0 the output can represent and gets flattened, producing harsh crackle. Noise clips especially badly because its peaks are unpredictable.
- **Gain staging** — setting levels at each point in a chain so nothing overloads; with noise, do it at the source.
- **Audio rate vs control rate** — audio rate updates every sample (Noise does); control rate updates far more slowly, enough for modulation but not for generating sound.
- **Voice** — one simultaneously sounding note. Skald gives each voice independent copies of the per-voice node state, including its own noise stream.
- **Bus domain** — the once-per-sample processing stage after voices are summed, where Delay and Reverb live. Nodes here are not gated by any note.
- **PRNG / xorshift** — a pseudo-random number generator; xorshift is a very cheap one built from shifts and XORs, deterministic and therefore reproducible.
- **One-pole lowpass** — the simplest possible filter, a running weighted average of the input and its own previous output. Three of them stacked make Skald's pink noise.
- **Masking** — when one sound makes another inaudible. Noise is an aggressive masker because it occupies all frequency bands at once.

## Code-vs-intent notes

**1. Three different "default amplitude" values exist.** The UI's node default is `amplitude: 1.0` (`skald-ui/src/definitions/node-definitions.ts:98-102`), and the Parameter Panel slider agrees, passing `1` as its default (`skald-ui/src/components/NodeParameterControls.tsx:232`). The codegen's inline fallback, used when a node's JSON has no `amplitude` key, is also `1.0` (`skald-backend/core/codegen.odin:298`). But `lookup_param_range("amplitude")` returns default `0.5` (`skald-backend/core/param_ranges.odin:86-87`), and *that* is what gets written into `p.<field>` at init and into the `_PARAMS` table when the parameter is exposed and the JSON omits a value (`skald-backend/core/codegen.odin:1191-1197`). Repo patches that omit `amplitude` — `examples/instruments/drums/acoustic-electric/HiHat.json`, `CyberCymbal.json`, `SnareDrum.json` — currently dodge this because they also omit `exposedParameters`, so they take the 1.0 path. Expose amplitude on one of those nodes without setting a value and the node quietly halves in level. Severity: confusing, not a blocker; setting an explicit amplitude always wins. Note also that `param_ranges.odin` has node-type-specific overrides at the top of `lookup_param_range` (`:24-38`) for exactly this class of problem, and `Noise` is not among them.

**2. The palette advertises both colours; what it cannot tell you is that the choice is compiled in.** The entry now reads `tip: 'White and pink noise source.'` (`skald-ui/src/components/Sidebar.tsx:265`), matching the White/Pink selector in the UI (`skald-ui/src/components/Nodes/NoiseNode.tsx:9`), the type system (`skald-ui/src/definitions/types.ts:88`) and the codegen (`skald-backend/core/codegen.odin:292-295`), so the five repo patches that use Pink (`examples/instruments/winds/wind.skald.json`, `normal-sax.skald.json`, `growly-sax.skald.json`, `examples/songs/loops/geowars/boss-war-tuba.skald.json`, `tuba-breath-ballad.skald.json`) are no longer relying on an unadvertised feature. The remaining gap is the one described under *The controls*: `type` is a string read once at generation time, so a reader browsing the palette still has no hint that switching colour needs a rebuild. Severity: cosmetic.

**3. `new_docs/NoiseNode.md` is stale on two counts.** It states the node "has no inputs" (`skald-ui/new_docs/NoiseNode.md:3`), but the node has had an `input_amp` handle since it was migrated to `makeParamNode` (`skald-ui/src/components/Nodes/NoiseNode.tsx:6`), and the backend validator lists that port as the node's one legal input (`skald-backend/core/graph_validate.odin:28`). Its props table also lists only `data.label`, omitting `type` and `amplitude` (`skald-ui/new_docs/NoiseNode.md:6-8`). Severity: confusing for anyone using that file as a reference.

**4. The Amp input is additive, and nothing in the UI says so.** The handle is labelled simply "Amp" (`skald-ui/src/components/Nodes/NoiseNode.tsx:6`), which most synthesists will read as a VCA-style multiply — patching an envelope into a source's amplitude input is the single most standard gesture in modular synthesis. Skald sums instead: `get_f32_param` builds `(base) + (mod)` (`skald-backend/core/param_utils.odin:149-154`) and `generate_noise_code` multiplies the noise by that whole sum (`skald-backend/core/codegen.odin:298, 314`). With the default amplitude of 1.0, an envelope on Amp can only ever make the noise *louder*, never gate it. This is a consistent, documented convention across every modulatable parameter in Skald, not a Noise-specific bug — but it inverts the standard-practice expectation, and no example patch in the repo uses the Amp input, so there is no in-app demonstration of the correct idiom. Severity: confusing.

**5. No output limiting anywhere in the chain.** `param_ranges.odin` clamps individual exposed parameters (`:86-87`), and the Mixer's per-channel levels go to 2.0 (`skald-ui/src/components/Nodes/MixerNode.tsx:59`), but the generated `process` returns the raw accumulated sum with no clamp or saturator (`skald-backend/tests/generated_audio.odin:647`). Standard practice for a shipped audio asset is at least a `tanh` or hard clamp on the master, and the codegen already has `math.tanh` available — it uses it inside Distortion (`skald-backend/tests/generated_audio.odin:2090`). Noise makes this easy to trip over because its peaks are unpredictable. Severity: worth knowing; arguably a deliberate design choice to leave limiting to the host.
