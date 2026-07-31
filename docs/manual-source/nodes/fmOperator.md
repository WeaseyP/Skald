# FM Operator

> A sine wave whose pitch is being wobbled so violently by another sine wave that the wobble stops sounding like wobble and starts sounding like a new, richer tone.

## What it is

Take a sine wave. A sine wave is the plainest sound there is — one single frequency, no harmonics, the sound of a tuning fork or a test tone. Now start bending its pitch up and down, slowly. That's vibrato. Everybody recognises vibrato: a singer's held note, a guitarist rocking a string.

Now speed the wobble up. At two or three wobbles per second you hear vibrato. At ten per second you hear a nervous, seasick vibrato. Somewhere around twenty wobbles per second something strange happens: your ear stops being able to follow the individual up-and-down movements and gives up on hearing "a pitch that is moving". Instead it hears **one steady tone with a completely new timbre** — buzzy, hollow, brassy, or bell-like, depending on how fast you wobble and how far. That's the whole trick. John Chowning found it at Stanford in the mid-1960s while experimenting with extreme vibrato, and it became the basis of the first commercially successful digital synthesis method [Source: https://www.soundonsound.com/techniques/introduction-frequency-modulation].

Here is what physically happened. The wobbling sine wave — call it the **carrier** — no longer contains just its own frequency. It has sprouted a family of extra frequencies called **sidebands**, sitting at even intervals above and below the carrier. The spacing between them is exactly the frequency of the thing doing the wobbling — call that the **modulator**. So if the carrier is 400 Hz and the modulator runs at 100 Hz, you get energy at 400, and at 300 and 500, and at 200 and 600, and at 100 and 700, and so on outward in both directions [Source: https://www.soundonsound.com/techniques/introduction-frequency-modulation]. One oscillator modulating one other oscillator gives you a dozen or more partials for the cost of two sine waves. That efficiency is why FM took over digital synthesis in the 1980s while additive synthesis — which needs one oscillator per partial — stayed in the lab.

How *many* sidebands you get, and how loud each one is, is governed by a single number: the **modulation index**. Informally, it is "how hard you are wobbling". Formally, in classic FM it is the peak pitch deviation divided by the modulator's frequency. At an index near zero you get a bare sine with two faint sidebands, indistinguishable from tremolo. Around index 1 you get a small handful. Around index 5 you get a broad, complex spectrum, and the original carrier frequency itself can go faint or vanish entirely, its energy having been redistributed outwards [Source: https://www.soundonsound.com/techniques/introduction-frequency-modulation]. The precise amplitudes follow Bessel functions of the first kind, which is a mathematical way of saying they do not fall off smoothly — they wander up and down as you increase the index, which is exactly why sweeping the index sounds alive rather than like turning up a tone knob [Source: https://www.dsprelated.com/freebooks/sasp/Frequency_Modulation_FM_Synthesis.html]. A useful rule of thumb: there are roughly *index + 1* significant sideband pairs, so the total bandwidth is about 2 × modulator-frequency × (index + 1). This is Carson's rule.

The last and most musically important piece is the **carrier-to-modulator ratio**, written C:M. The sidebands land at `carrier ± k × modulator`. If the carrier and modulator frequencies are related by a simple whole-number ratio — 1:1, 2:1, 1:3 — every one of those sidebands lands exactly on a member of the harmonic series of some common fundamental, and your ear fuses the whole pile into a single, clearly pitched, musical note. That's how FM makes basses, brass and organs. If the ratio is *not* a simple whole number — 1:1.41, 1:2.7, 1:π — the sidebands land between the harmonics, your ear can't fuse them, and you get the clangorous, metallic, pitch-ambiguous sound of bells, gongs, mallets and electric pianos [Source: https://ccrma.stanford.edu/software/clm/compmus/clm-tutorials/fm2.html]. A ratio of 1:√2 ≈ 1:1.41 is a classic bell recipe. Chowning's own percussion example used a modulator ratio of 1.4 with an index of about 6.4.

One more detail that explains a lot of FM's character: some sidebands land at *negative* frequencies. A negative frequency isn't a thing you can hear, so it folds back into the positive range as a component of the same frequency with its phase flipped 180° [Source: https://www.sfu.ca/~truax/Frequency_Modulation.html]. When it lands on top of an existing partial, the two either reinforce or partially cancel. This is why FM spectra have those distinctive notched, uneven shapes rather than a smooth roll-off, and why a small ratio change can transform the tone rather than just tilt it.

## What it looks like in Skald

Drag **FM Operator** out of the sidebar palette — it is in the source group with Oscillator, Noise, LFO and S&H, tipped as "FM sine at a ratio of the played note. Feed input_mod for sidebands." (`skald-ui/src/components/Sidebar.tsx:268`). It draws as a pink card; pink is Skald's colour for FM sources (`skald-ui/src/components/Nodes/NodeStyles.ts:89`).

It has two input handles and one output handle (`skald-ui/src/components/Nodes/FMOperatorNode.tsx:9-13`):

| Handle | Id | Direction | What it takes |
|---|---|---|---|
| **Mod** | `input_mod` | in | The modulating signal. Whatever you wire here is multiplied by Mod Index and added to the carrier's phase. Multiple wires are summed (`skald-backend/core/codegen.odin:409-423`). |
| **Carrier** | `input_carrier` | in | Pitch modulation of the carrier itself, in volts-per-octave: the carrier frequency is multiplied by `2^(sum of inputs)`, so +1 is one octave up, −1 an octave down, clamped to ±10 octaves (`skald-backend/core/codegen.odin:433-450`). |
| **Out** | `output` | out | The finished FM sine, always full-scale ±1. |

Those are the only three ports that exist. The connection validator knows exactly this list — `input_mod`, `input_carrier`, and a legacy `input_freq` alias that behaves identically to `input_carrier` (`skald-backend/core/graph_validate.odin:30, 47-48`). Wire anything to a different port name and codegen refuses to build rather than silently dropping the wire.

**Pitch always tracks the played note.** Unlike Oscillator and Wavetable, the FM Operator has no `fixedPitch` switch (`skald-ui/src/definitions/types.ts:43-46`, compare `:49-50`). The carrier base frequency is hard-wired to `voice.current_freq` (`skald-backend/core/codegen.odin:426`), the frequency of the MIDI note currently sounding on that voice. The Ratio parameter multiplies it. This is deliberate and it is what makes FM instruments playable: because carrier and modulator both scale with the note, the *ratio* between them stays fixed, so the timbre stays consistent as you move up and down the keyboard.

**It runs at audio rate, once per sample, per voice.** It is classified as voice-coupled (`skald-backend/core/codegen.odin:58`), which has one hard consequence: an FM Operator cannot be placed downstream of a Delay or Reverb. Those two nodes run once per sample on the summed output of all voices, where no single voice's pitch exists, so codegen fails with an explicit error rather than dropping the node (`skald-backend/core/codegen.odin:1937-1944`). Its phase lives on the voice as `fm_<id>_phase` (`skald-backend/core/codegen.odin:1080-1081`) and is reset to zero when a fresh voice starts a note, but deliberately *not* reset when a voice is stolen mid-note, so retriggers don't click (`skald-backend/core/codegen.odin:1428-1429, 1437`).

**What it can feed:** anything with an audio input — a Filter's `input`, an ADSR's `input` (Skald's ADSR doubles as a VCA), a Distortion, a Mixer, the Output. It can also feed *another* FM Operator's `input_mod`, which is how you stack operators. And because its output is just a number in the range ±1, it can be used as a modulation source: the backend's own test fixture wires an FM Operator's output into an Oscillator's `input_freq` (`skald-backend/tests/fixtures/fm_patch.json`), which the acceptance harness renders and checks for audibility (`skald-backend/acceptance/main.odin:314-322`).

**What it cannot do:** it has no amplitude, gain or waveform parameter. The output is literally `sin(...)`, which swings the full ±1 no matter what (`skald-backend/core/codegen.odin:466`). Every FM Operator in your patch needs a VCA, an ADSR or a Mixer channel after it to control its level. Two of them summed straight into the Output will clip.

## The controls

| Parameter | Range | Default | Unit | What it does to the sound |
|---|---|---|---|---|
| `frequency` — shown as **Ratio (× note freq)** | 0.01 – 32 | 2 on a freshly dragged node; 1 everywhere else (see below) | ratio (multiple of the played note) | Sets the carrier frequency as a multiple of the note you played. Together with the modulator's frequency this is the C:M ratio, which decides harmonic vs metallic. |
| `modIndex` — shown as **Modulation Index** | 0 – 1000 | 100 | radians of peak phase deviation | How hard the modulator bends the carrier. Zero means no sidebands at all — a pure sine. Higher means more, and louder, sidebands: brighter, buzzier, eventually noise. |

Ranges are enforced in three places that agree with each other: the on-canvas number boxes (`skald-ui/src/components/Nodes/FMOperatorNode.tsx:15-16`), the parameter-panel sliders (`skald-ui/src/components/NodeParameterControls.tsx:200-201`), and the backend, which clamps the ratio to `[0.01, 32]` at the point of use in the generated DSP (`skald-backend/core/codegen.odin:462`) and again in the exported setter via the param-range table (`skald-backend/core/param_ranges.odin:27-28`). The default value of 2 for a new node comes from `skald-ui/src/definitions/node-definitions.ts:53`; the sliders and the backend both treat 1 as the default (`skald-ui/src/components/NodeParameterControls.tsx:200`, `skald-backend/core/param_ranges.odin:28`), which is why double-clicking the Ratio slider to reset it lands on 1, not 2. See Code-vs-intent notes.

### Ratio — what you hear as you sweep it

The Ratio slider is logarithmic, so the bottom half of its travel covers 0.01–1 and the top half covers 1–32 (`skald-ui/src/components/NodeParameterControls.tsx:200`).

- **Below 1** puts the carrier *under* the played note. At 0.5 you get a note an octave down with the played pitch showing up as a strong sideband — a good sub-bass trick. Very low values (0.01–0.1) put the carrier down at a few Hz, at which point the "note" you hear is entirely made of sidebands and the pitch reference gets slippery.
- **1.0** is the workhorse. Carrier and modulator at the same frequency gives sidebands at every integer multiple of the note: a full harmonic series, which as you raise the index morphs from sine towards something sawtooth-like. Every FM instrument shipped with Skald uses ratio 1 on its final carrier (`examples/instruments/keys/fm-bell-sequenced.skald.json:38`, `examples/instruments/keys/glassy-fm-pluck.skald.json:38`, `examples/instruments/bass/fm-growl-bass.skald.json:42`).
- **2, 3, 4 …** still give harmonic spectra, but with the energy centred higher up and the fundamental progressively weaker. 2 is hollow and clarinet-ish, 3 and 4 get reedy and nasal. These are the "brass and woodwind" region.
- **Fractions like 1.41, 2.5, 3.5, 4.2** are the metallic zone. The sidebands no longer line up with any harmonic series and the sound acquires that struck-metal ring. Skald's own bell and chime patches use 3.5 and 4.2 as *modulator* ratios (`examples/instruments/keys/fm-bell-sequenced.skald.json:27`, `examples/sound-effects/geowars/gold-chime.skald.json:27`), and the Rhodes patch uses 14 for its tine (`examples/instruments/keys/fm-rhodes-electric-piano.skald.json:27`).
- **Toward 32** the carrier is five octaves above the note. On a bass note that is still musical; on a high note the carrier alone is near the top of hearing and the sidebands go past it. Expect thin, whistly, and eventually aliased results.

### Mod Index — what you hear as you sweep it

- **0** — no modulation at all, regardless of what is wired to Mod. A pure sine at `note × Ratio`. This is not a wasted setting: it is the idiomatic way to use an FM Operator *as* a modulator. Every FM example patch does exactly this, setting `modIndex: 0` on the operator that feeds another operator's Mod input.
- **0.5 – 2** — a few quiet sidebands. Warms and thickens the sine without changing its identity. Good for adding body to a sub bass.
- **2 – 8** — the classic musical window, and the one the node's own source comment names (`skald-ui/src/components/Nodes/FMOperatorNode.tsx:4-5`). Skald's shipped instruments live here: 1.5 for the Rhodes carrier, 3.5 for the glassy pluck, 4 for the bell, 6 for the chime. Around 4–6 the tone is fully formed and bright; the carrier's own frequency has largely dissolved into the sideband family.
- **10 – 60** — aggressive. Bandwidth is now tens of harmonics wide. Musical on bass notes, harsh on high ones. This is where you start needing a lowpass filter after the operator to control it.
- **Above ~100** — you are past the point where the sidebands fit under the Nyquist limit for anything but low notes, and the ones that don't fit fold back down as inharmonic junk. Sometimes that is the sound you want (the growl bass leans on it deliberately at 190) but it is a texture, not a tone.

A practical note on units. Skald implements this as **phase modulation**: the modulator is added to the carrier's phase in radians, not to its frequency (`skald-backend/core/codegen.odin:466`). For a sine modulator, phase modulation and frequency modulation produce identical spectra, and the peak phase deviation *is* the modulation index [Source: https://www.dsprelated.com/freebooks/sasp/Frequency_Modulation_FM_Synthesis.html]. So Skald's Mod Index number, multiplied by the peak amplitude of whatever you wired into Mod, is the textbook index I. One consequence is worth knowing because it contradicts what most FM tutorials tell you: Sound On Sound correctly says the index is *inversely proportional to modulator frequency* in true FM [Source: https://www.soundonsound.com/techniques/introduction-frequency-modulation]. In Skald that is not true. Raising the modulator's ratio does not reduce the index — the phase deviation stays put and the spectrum simply spreads wider. This is the same choice Yamaha's DX7 made, and it is why FM Operator brightness stays stable when you change ratios.

The other consequence: **the amplitude of whatever you wire into Mod scales the index directly**. A modulator oscillator at amplitude 0.5 with Mod Index 8 gives an effective index of 4. This is the single most common source of "why is my FM patch quieter/duller than I expected".

### Exposing a parameter

Both parameters are exposed by default on a new node (`skald-ui/src/definitions/node-definitions.ts:55`). Click the link icon next to a parameter in the right-hand panel to toggle it (`skald-ui/src/components/ParameterPanel.tsx:228-235, 281-290`). Exposing does two things.

At edit time it makes the knob **live**. Exposed parameter values are masked out of the topology fingerprint the preview engine uses (`skald-ui/src/utils/projectSerializer.ts:236-248`), so dragging them sends a `skald_set_param` message straight into the running WASM module instead of triggering a recompile-and-hot-swap (`skald-ui/src/hooks/nodeEditor/useWasmAudioEngine.ts:8-13`). You hear the change while the note is still sounding. Non-exposed parameters are baked into the generated code as literals and need a rebuild, which lands at the next note.

At export time each exposed parameter becomes a field on the generated processor struct, a clamped typed setter, and a row in the introspectable `<Asset>_PARAMS` table (`skald-backend/core/codegen.odin:1262-1263, 1612-1624, 1630-1641`). The clamp bounds come from `lookup_param_range(name, node_type)` (`skald-backend/core/codegen.odin:1191`). That second argument matters here: the generic, name-keyed entry for `frequency` is a Hz-calibrated `[20, 20000]` (`skald-backend/core/param_ranges.odin:48-49`), which would be catastrophic for a ratio. The `FmOperator` override at the top of the table catches it and returns `{0.01, 32.0, 1.0, "ratio"}` instead (`skald-backend/core/param_ranges.odin:27-28`).

Why expose these two in a game? Mod Index is the single most expressive parameter FM has — it is a brightness knob with a shape no filter can imitate, because the harmonics appear and disappear individually rather than sliding under a cutoff curve. Drive it from engine RPM, weapon charge level, player health, alert state. Ratio is a timbre *switch* rather than a smooth control (crossing from 2.0 to 2.1 changes the character of the instrument, not its brightness), so expose it when you want discrete variants of one asset — the same chime asset at ratio 1, 3.5 and 7 gives you three distinct pickup sounds from one instrument.

## Try it (hands-on)

Open `examples/instruments/bass/fm-growl-bass.skald.json`. It is a six-voice bass with a 16-step riff on E1, A1, G1 and B1 at 140 BPM.

The signal path inside the instrument is: a sine **Modulator** oscillator → **FM Carrier** (`input_mod`) → **Lowpass** filter at 480 Hz → **Amp** ADSR → **Grit** distortion → Output. Separately, a BPM-synced **Growl LFO** at 1/8 notes runs through a **Mapper** into the Modulator's `input_amp`, so the modulation depth breathes in time with the music (`examples/instruments/bass/fm-growl-bass.skald.json:122-130`).

Two things about that patch are worth knowing before you touch anything. First, the Modulator oscillator has `fixedPitch: false` (`:30`), so its 440 Hz setting is ignored and it tracks the played note — the C:M ratio is 1:1. Second, the FM Carrier's Mod Index is **190** (`:43`), which is far outside the usual musical range. This patch is deliberately over-driven FM being tamed by a very low filter.

1. **Select the instrument.** Click the "FM Growl Bass" node once. The right-hand panel fills with the instrument's own settings followed by an **Internal Nodes** section listing every node inside it (`skald-ui/src/components/ParameterPanel.tsx:310-316`). Scroll to **FM Carrier**.
2. **Press play.** You should hear a snarling, buzzing bass line with a rhythmic wobble in its brightness. Everything interesting in that sound is coming from two sine waves.
3. **Open the filter so you can hear the raw operator.** Scroll to **Lowpass** and drag Cutoff from 480 up to about 6000 Hz. The bass turns from a growl into a bright, ugly, sizzling buzz. That is what index 190 actually sounds like unfiltered — a wall of sidebands.
4. **Kill the modulation.** Back at **FM Carrier**, drag Mod Index down to **0**. The sound collapses to a bare sine wave at the note pitch. This is the carrier alone: no modulator contribution means no sidebands, and modIndex is multiplied by the mod input in the generated code (`skald-backend/core/codegen.odin:466`), so zero index is zero modulation no matter what is wired in. Notice how *thin* a pure sine is.
5. **Bring the index back slowly.** Drag Mod Index up through 1, 2, 4, 8, stopping at each. At 1 you get a faint warmth. At 2 there is an audible second and third harmonic. By 4–8 you have a full, saw-like bass with real bite. Because the ratio is 1:1 every sideband lands on a harmonic of the note, so it stays cleanly pitched however bright it gets. Stop at **6** and leave it there for the next steps.
6. **Break the harmonic relationship.** Drag Ratio from 1 to **1.41**. The bass stops being a bass. The sidebands now sit at `1.41f ± k·f`, which lines up with no harmonic series at all, and your ear hears struck metal instead of a plucked string. This is the same ratio classic bell patches use. Try **2.0** — instantly musical again, hollow and reedy. Then **2.5** — metallic again. Whole numbers fuse, fractions don't. Return Ratio to **1**.
7. **Hear the LFO doing its job.** Scroll to **Mapper** ("Mod Depth 0.3-1.0") and drag `outMax` from 1.0 down to 0.0, then back up. You are changing how much the LFO adds to the modulator's amplitude, and since modulator amplitude scales the effective index, you are hearing a rhythmic brightness pulse. Be aware the mapper's output is *added* to the oscillator's own amplitude of 1, not substituted for it (`skald-backend/core/param_utils.odin:138-155`), so the real modulator amplitude swings between 1.3 and 2.0 — the effective index at the shipped settings is roughly 247 to 380, not 57 to 190.
8. **Break it: aliasing.** With the filter still open at 6000 Hz, drag Mod Index all the way to its maximum of **1000**. The sound turns into a metallic, gritty hiss with a pitch that no longer follows the riff properly, and it changes character in an ugly way between notes. Here is why. At index ~2000 (1000 × the modulator's peak amplitude of 2.0) and a modulator frequency of 41 Hz for E1, Carson's rule puts significant sidebands out to roughly 41 × 2001 ≈ 82 kHz. Your sound card runs at 44.1 or 48 kHz and can only represent frequencies below half that. Everything above the limit does not disappear — it **folds back** down into the audible range at wrong, inharmonic frequencies that do not move with the note. That is aliasing, and it is FM's characteristic failure mode. Now drag back to 190 and note that the same effect is present but mild, and mostly hidden: at the highest note in the riff (B1, 62 Hz) the sidebands already just cross the limit, and it is the 480 Hz filter that keeps the mess inaudible.
9. **Restore.** Mod Index back to 190, Ratio to 1, Lowpass cutoff back to 480. If you lost track, double-clicking any slider resets it to its default (`skald-ui/src/components/controls/CustomSlider.tsx:202-207`) — but note that resets Ratio to 1, which for this patch happens to be correct, and Mod Index to 100, which is not.

What you should take away: the carrier's pitch never changed in any of those steps, but the instrument went from a tuning fork to a bass guitar to a bell to a noise generator. In subtractive synthesis you *remove* harmonics from a rich waveform; in FM you *conjure* them, and the two numbers you conjure them with are ratio and index.

## Why you patch it this way

The canonical Skald FM voice is **two FM Operators in a row**, and every FM instrument in `examples/` is built this way:

```
FM Operator (modulator)  ->  FM Operator (carrier)  ->  ADSR  ->  Output
   Ratio = N               Ratio = 1
   Mod Index = 0           Mod Index = 1.5 - 6
     (nothing in Mod)          (modulator in Mod)
```

Look at `examples/instruments/keys/fm-bell-sequenced.skald.json:22-42`: "Mod" is an FM Operator with ratio 3.5 and index 0 — nothing wired to its Mod input, so it is a pure sine at 3.5× the note — feeding "Carrier", an FM Operator at ratio 1 with index 4. The chime (`examples/sound-effects/geowars/gold-chime.skald.json:22-42`) is identical with 4.2 and 6. The glassy pluck (`examples/instruments/keys/glassy-fm-pluck.skald.json:22-42`) uses 4 and 3.5.

Why an FM Operator with index 0 rather than a plain Oscillator as the modulator? Because the FM Operator's frequency parameter is a *ratio* that tracks the note, which is exactly what you want from a modulator, whereas an Oscillator's frequency is in Hz and only tracks the note when `fixedPitch` is off — at which point you cannot set a ratio at all. The growl bass takes the Oscillator route (`examples/instruments/bass/fm-growl-bass.skald.json:22-35`) and is therefore locked to a 1:1 ratio; that is fine for that patch but it is the less flexible pattern.

**Order matters, in specific ways:**

- **Modulator before carrier, always.** Wiring the carrier into the modulator's Mod input inverts the roles and gives you a completely different (and usually much duller) sound. Wiring both ways creates a cycle, which codegen rejects.
- **Filter and envelope go after, never between.** An ADSR or VCA between the modulator and the carrier's Mod input is not a volume control — it scales the *index*, and it is the most powerful thing you can do in FM (see Going further). But if you want to control loudness, that has to happen downstream of the carrier.
- **Something must control level.** The FM Operator has no amplitude parameter and outputs full-scale (`skald-backend/core/codegen.odin:466`). If it goes straight to Output you get an instrument that is on at full volume the moment a note starts and cuts off dead when it ends, plus clipping the moment two voices overlap. Every example patch puts an ADSR (which acts as a VCA on its `input` port, `skald-backend/core/codegen.odin:285`) directly after the carrier.
- **Nothing downstream of a Delay or Reverb.** Codegen will refuse to build (`skald-backend/core/codegen.odin:1937-1944`). Put reverb after the whole voice, which is where it belongs anyway.
- **The Carrier input is a pitch input, not an audio input.** It is exponential V/Oct (`skald-backend/core/codegen.odin:448`), so feeding it an audio-rate signal gives you exponential FM on top of the linear phase modulation — chaotic, occasionally great for sound effects, never what you want for a playable instrument. Feeding it an LFO at amplitude 0.02 gives you gentle vibrato; the backend has a dedicated acceptance test for exactly that patch (`skald-backend/acceptance/main.odin:579-589`).

## Going further

**Envelope the index, not just the volume.** This is the single biggest step up in expressiveness FM offers, and it is how Chowning's original brass sounds worked: he made the index track the amplitude envelope, so notes get brighter as they get louder, the way real instruments do [Source: https://ccrma.stanford.edu/sites/default/files/user/jc/fm_synthesis_paper.pdf]. In Skald you cannot modulate `modIndex` with a wire — there is no `input_index` port (`skald-backend/core/graph_validate.odin:30`) — but you get the same result by putting a **VCA (Gain)** between the modulator and the carrier's Mod input and driving the VCA's gain from a second ADSR. A fast-decaying envelope on the index gives you the percussive "ping" of a plucked or struck sound: bright attack, mellow tail. This is exactly what the Rhodes patch does with its "Tine Mod → Tine VCA" pair, whose gain starts at 0 and is driven by a dedicated tine envelope (`examples/instruments/keys/fm-rhodes-electric-piano.skald.json:22-68`).

**Stack a third operator.** Two operators give one sideband family. Three in series (mod → mod → carrier) means the middle operator arrives at the carrier already spectrally rich, and each of *its* partials generates its own sideband family around the carrier — the density multiplies. Keep the indices low (1–3) when chaining or it goes to noise immediately.

**Or put them in parallel.** Two modulators at different ratios, both wired into the same carrier's Mod input, are summed (`skald-backend/core/codegen.odin:409-423`). Ratio 1 for body plus ratio 7 for a metallic edge is the Rhodes recipe: a body modulator at ratio 1 and a tine modulator at ratio 14, both landing on one carrier (`examples/instruments/keys/fm-rhodes-electric-piano.skald.json:22-91`). Parallel modulation adds two independent harmonic families; series modulation multiplies them together. Parallel is more controllable, series is wilder.

**Layer two carriers.** Two FM Operators at ratios 1 and 2, each with its own modulator and index, summed in a Mixer, gives you a fundamental layer and an upper-octave layer you can balance independently — and expose the mixer levels for runtime morphing between "dark" and "bright" versions of the instrument.

**Detune for movement.** Set a carrier's ratio to 1.005 instead of 1. The carrier now drifts slowly against the note, and the whole sideband family beats against a second, in-tune layer. This is the FM equivalent of an analogue detune and it costs you one digit.

**Follow it with a filter anyway.** FM and subtractive are not rivals. An index sweep changes *which* harmonics exist; a filter sweep changes which of them get through. The growl bass uses both, and a resonant lowpass on top of a rich FM tone gives you a sound neither technique produces alone.

**Reach for non-integer ratios for anything that should sound struck or hit.** Bells, chimes, mallets, glass, metal impacts, sci-fi UI beeps. The available literature's recommended starting points are 1:1.41 and 1:2.7 [Source: https://ccrma.stanford.edu/software/clm/compmus/clm-tutorials/fm2.html]; Skald's shipped patches use 3.5, 4.2 and 14. Pair a non-integer ratio with a short, hard attack envelope and a long release and you have a bell.

## Under the hood

The generated Odin for one FM Operator is about five lines inside the per-voice sample loop (`skald-backend/core/codegen.odin:458-467`).

First it computes the carrier frequency for this sample:

```odin
carrier_freq_<id>: f32 = voice.current_freq
                       * math.clamp(f32(<ratio>), 0.01, 32.0)
                       * math.pow(2.0, math.clamp(f32(<carrier_mod>), -10.0, 10.0))
```

The base is the voice's current note frequency (`skald-backend/core/codegen.odin:426`) — which is itself glide-smoothed, so FM tracks portamento. The ratio is clamped to `[0.01, 32]` at the point of use, not just at the setter, because legacy project files carry the old default of 440 in that field, which as a raw ratio put the carrier at roughly 190 kHz — pure ultrasonic aliasing (`skald-backend/core/codegen.odin:460-462`, and the same story is told in `skald-ui/src/definitions/node-definitions.ts:50-52`). The exponential term is only emitted if something is wired to `input_carrier` or the legacy `input_freq`.

Then it advances the phase and reads out the sine:

```odin
voice.fm_<id>_phase = math.mod(
    voice.fm_<id>_phase + (2 * PI * carrier_freq_<id> / sample_rate), 2 * PI)

node_<id>_out = math.sin(voice.fm_<id>_phase + (<mod_sum>) * (<mod_index>))
```

That last line is the whole node. `mod_sum` is the sum of everything wired to `input_mod`, or the literal `0.0` if nothing is (`skald-backend/core/codegen.odin:409-423`). The modulator is added to the *phase*, in radians — this is phase modulation, and the reason it is spectrally equivalent to frequency modulation is that instantaneous frequency is just the time-derivative of instantaneous phase [Source: https://www.dsprelated.com/freebooks/sasp/Frequency_Modulation_FM_Synthesis.html]. Compare it to the textbook equation `x(t) = A·sin(ω_c·t + β·sin(ω_m·t))` and the mapping is exact: `β` is your Mod Index times the modulator's amplitude.

Notice what is *not* there: no bandlimiting, no oversampling, no anti-aliasing. `math.sin` of a very large phase argument produces exactly the sidebands the maths says it should, including the ones above Nyquist, which the sampling process folds back. This is not a bug — it is what every classic FM synth did, and it is why the practitioner's rule "keep the index modest at high pitches" exists.

The parameter values themselves are either baked in as float literals or, when exposed, emitted as `p.<field>` reads (`skald-backend/core/param_utils.odin:73-103`), so an exposed index changes on the very next sample with no branch and no recompile.

## Terms introduced

- **Carrier** — the oscillator whose pitch is being modulated; the one you actually hear. In Skald, the FM Operator itself.
- **Modulator** — the oscillator doing the modulating. It is never heard directly; its only effect is on the carrier.
- **Sideband** — an extra frequency component created by modulation, sitting at `carrier ± k × modulator` for integer k. FM produces a whole series of them.
- **Modulation index** — how hard the modulator bends the carrier. Controls how many sidebands there are and how loud. Roughly `index + 1` significant sideband pairs.
- **Carrier-to-modulator ratio (C:M)** — the frequency relationship between the two operators. Whole-number ratios give harmonic, clearly pitched tones; non-integer ratios give inharmonic, metallic, bell-like tones.
- **Harmonic series** — the set of frequencies at integer multiples of a fundamental. Sounds whose partials fall on it are heard as one pitched note.
- **Inharmonic** — partials that do not fall on a harmonic series. Heard as metallic, clangorous, pitch-ambiguous.
- **Phase modulation** — adding the modulator to the carrier's phase rather than its frequency. Spectrally equivalent to FM for sinusoidal modulators, and what Skald (and the DX7) actually compute.
- **Carson's rule** — an estimate of how wide an FM spectrum is: about `2 × modulator frequency × (index + 1)`.
- **Nyquist limit** — half the sample rate; the highest frequency a digital system can represent. Around 22 kHz at 44.1 kHz sampling.
- **Aliasing** — what happens to frequencies above the Nyquist limit: they fold back down into the audible range at wrong, inharmonic frequencies. FM's characteristic failure mode at high index or high pitch.
- **Negative-frequency reflection** — sidebands computed below 0 Hz reappear as positive frequencies with their phase flipped 180°, adding to or cancelling whatever is already there. The reason FM spectra look and sound notched rather than smooth.
- **Operator** — the FM term for one carrier-or-modulator unit. Skald's FM Operator node is exactly this; it can play either role.
- **V/Oct (volts per octave)** — the exponential pitch-modulation convention Skald uses on pitch inputs: +1 means one octave up.
- **Voice-coupled** — a node whose DSP depends on which note is playing, so it must run inside the per-voice loop and cannot run on the summed bus.

## Code-vs-intent notes

**1. The default Mod Index is 100; the node's own comment says the musical range is 1–8.** `skald-ui/src/definitions/node-definitions.ts:54` sets `modIndex: 100` for a freshly dragged node, and `skald-backend/core/param_ranges.odin:94-95` returns the same value as the exported default. The component's header comment says "modIndex is radians of phase deviation — the musical range is roughly 1–8; large values are noise" (`skald-ui/src/components/Nodes/FMOperatorNode.tsx:4-5`), and every shipped instrument agrees with the comment, not the default: 1.5 (`examples/instruments/keys/fm-rhodes-electric-piano.skald.json:88`), 3.5 (`examples/instruments/keys/glassy-fm-pluck.skald.json:39`), 4 (`examples/instruments/keys/fm-bell-sequenced.skald.json:39`), 6 (`examples/sound-effects/geowars/gold-chime.skald.json:39`). A user who drags out two FM Operators and wires one into the other's Mod input hears aliased noise at the default settings, roughly 12–65× past the documented musical window. *Severity: confusing.* Nothing is broken; the first-run experience just doesn't match the node's own advice.

**2. The Ratio default is 2 in one place and 1 in three others.** `skald-ui/src/definitions/node-definitions.ts:53` creates new nodes with `frequency: 2`. The parameter-panel slider passes `1` as its default and its double-click reset target (`skald-ui/src/components/NodeParameterControls.tsx:200`, reset behaviour at `skald-ui/src/components/controls/CustomSlider.tsx:202-207`), and `skald-backend/core/param_ranges.odin:28` returns `1.0` as the exported default for the `PARAMS` table and `_init`. Visible effects: double-clicking Ratio on a new node moves it from 2 to 1, and a project JSON that omits `frequency` exports an asset that initialises to 1 rather than 2. *Severity: cosmetic.*

**3. The growl bass's Mapper is labelled "Mod Depth 0.3-1.0" but produces 1.3–2.0 at the destination.** The Mapper outputs 0.3–1.0 (`examples/instruments/bass/fm-growl-bass.skald.json:110-111`) into the Modulator oscillator's `input_amp`. `get_f32_param` *sums* a modulation input with the parameter's own value rather than replacing it (`skald-backend/core/param_utils.odin:138-155`), and the Modulator's `amplitude` is 1 (`examples/instruments/bass/fm-growl-bass.skald.json:31`), so the effective amplitude is 1.3–2.0 and the effective modulation index is about 247–380 rather than the 57–190 the node label implies. The patch sounds the way it sounds because of this, so it is not a defect in the patch, but the label misleads anyone reading it to learn from. *Severity: confusing.*

**4. The FM Operator has no output-level control, unlike every other source node and unlike standard FM practice.** `skald-ui/src/definitions/types.ts:43-46` gives it only `frequency` and `modIndex`, and the generated code emits a bare `math.sin(...)` at full scale (`skald-backend/core/codegen.odin:466`). Oscillator, Noise, LFO and Wavetable all have an `amplitude` param with an `input_amp` port (`skald-backend/core/graph_validate.odin:26, 28, 31`); the FM Operator has neither (`:30`). On a real FM synth, every operator has an output level, and that level is precisely how you set the modulation depth of a modulator operator. In Skald the only ways to scale a modulator are the receiving operator's Mod Index or an intervening VCA. It also means two FM Operators summed into a Mixer or an Output will clip unless something attenuates them first. *Severity: confusing.*

**5. `skald-ui/new_docs/FMOperatorNode.md` is stale and thin.** It states "Emitted Events / Outputs: None" (`skald-ui/new_docs/FMOperatorNode.md:10-11`) while the component renders an output handle (`skald-ui/src/components/Nodes/FMOperatorNode.tsx:13`); it names neither `input_mod` nor `input_carrier`, and does not mention that `frequency` is a ratio rather than Hz — the single most important fact about this node, and the one that caused a real ~190 kHz-carrier bug in legacy saves (`skald-ui/src/definitions/node-definitions.ts:50-52`). *Severity: cosmetic.*
