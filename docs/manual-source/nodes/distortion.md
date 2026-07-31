# Distortion

> Distortion deliberately bends a sound's waveform out of shape, and that bending manufactures new frequencies that were never in the original — which is why a distorted sound is brighter, fatter and more aggressive than the clean one.

## What it is

Every effect you have met so far is **linear**: a filter removes frequencies, a gain stage scales them, a delay repeats them, but none of them *invents* a frequency that was not already present. Distortion is the first **nonlinear** effect in the palette, and nonlinear is exactly the technical word for "makes new frequencies."

Here is the mechanism. Take a pure sine wave — one single frequency, a smooth up-and-down curve. Now flatten its peaks, as if you pressed the top and bottom of the wave against a ceiling and a floor. The wave is no longer a sine; it is on its way to becoming a square. And a square wave, mathematically, is a sine plus a quieter sine at 3× the frequency, plus a quieter one at 5×, and so on forever. You did not add an oscillator. You changed the *shape* of the wave, and the new shape simply *is* a stack of harmonics. This is why the technique is called **waveshaping**: you apply a fixed input→output curve to every sample independently — a memoryless nonlinearity, in DSP terms — and the harmonics fall out of the geometry [Source: https://juce.com/tutorials/tutorial_dsp_convolution/].

The analogy that actually helps: think of a photocopier with the contrast turned all the way up. A photograph fed through it comes back as harsh black-and-white shapes. You did not draw anything new — you crushed the greys, and crushing the greys created hard edges that were not in the original. Hard edges in a picture are high spatial detail; hard edges in a waveform are high-frequency harmonics. Turn the contrast down and you get a gentle tonal squash that just looks a bit richer. That gentle setting is **saturation**; the extreme setting is **distortion**. They are the same process at different intensities.

*Which* harmonics you get depends on the **symmetry** of the curve. If the curve treats the positive half of the wave exactly like the negative half, you get only **odd** harmonics (3rd, 5th, 7th…). Odd harmonics sit an octave-plus-a-fifth, two-octaves-plus-a-third and so on above the note; they read as hollow, angry, "solid state" [Source: https://blackstoneappliances.com/dist101.html]. If the curve treats the two halves *differently*, you also get **even** harmonics (2nd, 4th…) — the 2nd harmonic is exactly one octave up, so even harmonics read as warm, thick, "tube-like." The price of asymmetry is a **DC offset**: the waveform's average value stops being zero, because you removed more of one half than the other [Source: https://www.kvraudio.com/forum/viewtopic.php?t=123354].

There is a distinctly digital hazard here that analogue gear does not have. Waveshaping generates harmonics *forever* upward — a hard-clipped 200 Hz note theoretically contains energy at 200 kHz. In a digital system running at 44,100 samples per second, anything above 22,050 Hz cannot be represented, so it **folds back** down into the audible range as inharmonic junk. This is **aliasing**, and it sounds like a metallic ring or fizz that does not track the pitch of the note — play higher, and the alias partials slide *down* [Source: https://theproaudiofiles.com/oversampling/]. The standard cure is oversampling: run the nonlinearity at 4× or 8× the sample rate, lowpass, and come back down. **Skald does not oversample** — there is no oversampling anywhere in the code generator. That is a real constraint, and the "Try it" exercise below makes you hear exactly where it bites.

Finally: because a distorted signal is full of brand-new top end, essentially every real distortion device puts a lowpass filter *after* the clipping stage. Guitar amps call it the tone stack; pedal builders describe stacking "gain stage, filter, pad, gain stage, filter" specifically to knock down the harsh fizz that clipping produces [Source: https://gearspace.com/board/so-many-guitars-so-little-time/1016501-guitar-distortion-more-than-clipping.html]. Skald's Distortion node has that filter built in, and it is called Tone.

## What it looks like in Skald

Distortion lives in the flat **Nodes** list in the left sidebar, eleventh in the list, between Reverb and Mixer (`skald-ui/src/components/Sidebar.tsx:274`). It draws in a salmon red (`skald-ui/src/components/Nodes/NodeStyles.ts:97`) — the "drive" colour family. Drag it onto the canvas like any other node.

It has exactly **two handles**:

- `input` — labelled **In**, on the left (`skald-ui/src/components/Nodes/DistortionNode.tsx:6`)
- `output` — labelled **Out**, on the right (`skald-ui/src/components/Nodes/DistortionNode.tsx:7`)

That is the whole port list, and the backend enforces it. Distortion is classified as a "through" node: the only input port name the validator accepts is `input` (`skald-backend/core/graph_validate.odin:32,51-52`), and the only output port name is the default `output` (`skald-backend/core/graph_validate.odin:65-74`). **There are no modulation inputs.** You cannot wire an LFO into Drive the way you can wire one into a Filter's `input_cutoff`. If you want Drive to move, you either expose it and drive it from game code, or you modulate the *level going in* with a VCA (Gain) node placed before the Distortion — which is what a real overdrive pedal responds to anyway.

Multiple wires *into* `input` are summed, not dropped: the generator uses `sum_port_inputs` (`skald-backend/core/codegen.odin:569`), so three oscillators landing on one Distortion get mixed and then shaped together. That matters, and we come back to it under "Why you patch it this way."

**Rate and domain.** Distortion is an audio-rate, per-sample process — the shaping maths runs on every single sample. Which *loop* it runs in depends on where you put it. By default it is emitted inside the per-voice loop, once per active voice (`skald-backend/core/codegen.odin:1812-1813`), with its tone-filter memory stored on the voice (`skald-backend/core/codegen.odin:1095-1097`) and cleared at each new note-on unless the voice was stolen mid-tail (`skald-backend/core/codegen.odin:1432-1433,1437`). But if the Distortion sits downstream of a Delay, a Reverb, or an instrument's external audio input, it is promoted to the **bus domain** and runs once per sample on the summed output of all voices instead (`skald-backend/core/codegen.odin:70-90`, dispatch at `:1915-1916`, state at `:1155-1157`). This single fact changes the sound more than any knob on the node, and it is the subject of "Why you patch it this way."

## The controls

Four controls. Three are numbers you can automate; one is a mode switch baked in at build time.

| Parameter | Range | Default | Unit | What it does to the sound |
|---|---|---|---|---|
| **Drive** | 1 – 100 | 20 | × (gain multiplier) | How hard the signal is pushed into the shaping curve. This is the "amount of distortion" knob. |
| **Shape** | `classic`, `soft`, `hard`, `asymmetric` | `classic` | — | Which curve does the bending. Changes the *character* of the harmonics, not the quantity. |
| **Tone** | 100 – 20000 | 4000 | Hz | A one-pole lowpass on the distorted signal only. Tames the fizz that drive creates. |
| **Mix** | 0 – 1 | 0.5 | — | Crossfade between the untouched input (0) and the shaped, tone-filtered signal (1). |

Sources for those numbers: the UI defaults are `defaultDistortionParams` in `skald-ui/src/definitions/node-definitions.ts:130-135`; the ranges the code generator actually clamps to are `drive {1, 100, 20, "x"}` at `skald-backend/core/param_ranges.odin:80-81`, `mix {0, 1, 0.5}` at `:78-79`, and a Distortion-specific override `tone {100, 20000, 4000, "Hz"}` at `:36-37`. That tone override exists because the generic name-keyed table has no `tone` entry at all, so without it an exposed Tone would have fallen through to the wide-open `{-1e6, 1e6, 0}` fallback at `:118` — a runtime setter that could hand the filter a negative cutoff.

### Drive — what you hear as you sweep it

Drive is input gain into the curve, nothing more. It does not have a matching output-level knob, and that asymmetry is the single most important practical fact about this node. In the generated code, drive becomes `dist_k` (`skald-backend/core/codegen.odin:583`) and multiplies the input before the curve is applied. Because all three symmetric curves are bounded near ±1, pushing drive up makes the output *louder* until it hits the ceiling and then makes it *squarer* — it is a loudness knob and a timbre knob welded together.

- **Drive 1–3 (the bottom).** Barely anything. On `soft`, drive 1 is `tanh(x)`, which for a signal peaking at 0.3 is within about 1% of a straight line — you will hear a whisper of thickening and nothing else. On `hard`, drive 1 is literally `clamp(x, -1, 1)`, which is a perfect bypass for any signal that never exceeds full scale. On `classic`, drive 1 is *not* neutral: its small-signal gain is `(π+1)/π ≈ 1.32`, so you get about +2.4 dB and a touch of curve. This surprises people.
- **Drive 5–20 (the musical zone).** This is where saturation lives. A signal peaking around 0.3–0.7 starts flattening its loudest moments and passing its quiet moments almost untouched. Because the loud parts distort more than the quiet parts, the effect breathes with your playing — that is *dynamic* saturation, and it is the reason placing Distortion after an ADSR sounds like an amplifier rather than a fuzz box. Skald's default of 20 already sits at the aggressive end of this zone: on `classic`, drive 20 has a small-signal gain of `1 + 20/π ≈ 7.4×`, or +17 dB.
- **Drive 40–100 (the top).** Everything becomes a square wave. On `soft` at drive 40, a signal peaking at 0.1 already produces `tanh(4) = 0.999` — pinned to the rail. Once the whole waveform is pinned, raising drive further changes almost nothing except how sharply the zero-crossings snap, which mostly means *more aliasing*. Musically useful for industrial/chiptune textures, and for turning a filtered sine into a buzzy square without a second oscillator; useless as a subtlety control.

The **useful musical zone is roughly drive 3 to 25**, with anything above 40 treated as a sound-design choice rather than a mixing choice.

**There is no output level or makeup gain on this node.** Real overdrive pedals have Level for exactly this reason: you turn drive up, the output gets louder, and you pull Level down so you can A/B the effect honestly. In Skald you have two substitutes: pull **Mix** down (which reduces the wet contribution but also reduces the distortion you hear), or put a **VCA (Gain)** node immediately after the Distortion and set its gain below 1. The second is the correct answer, and you should build the habit — otherwise every drive tweak is also a volume tweak and you will always prefer the louder one.

### Shape — what you hear as you switch it

Shape is a `select`, not a slider, and it is compiled into the Odin source (`skald-backend/core/codegen.odin:573,584-593`). Switching it in the editor triggers a full regenerate-and-rebuild rather than a live parameter write, so expect a short pause and a hot-swap rather than an instant change (`skald-ui/src/hooks/nodeEditor/useWasmAudioEngine.ts:8-14,31`). You cannot change Shape from game code at runtime; if you need two characters, build two Distortion nodes and crossfade them.

- **`classic`** — `y = (π + k)·x / (π + k·|x|)`. A rational soft-clip curve descended from the widely copied Web Audio "makeDistortionCurve" snippet. Its defining property is that `f(±1) = ±1` for *every* drive value, so full-scale input always maps to full-scale output and only the shape in between changes. It thickens the midrange without ever going brittle. Good general-purpose "warm and loud" setting, and the sensible default.
- **`soft`** — `y = tanh(x·k)`. The textbook soft clipper: rounds the peaks off with a smooth, gradually tightening curve, so harmonics come in gently rather than all at once [Source: https://www.kvraudio.com/forum/viewtopic.php?t=122309]. Symmetric, so odd harmonics only. Compared to `classic` it compresses harder for the same drive number and never exceeds ±1 no matter what you feed it. This is the one to reach for on bass and on anything you want to sound "pushed" rather than "broken."
- **`hard`** — `y = clamp(x·k, -1, 1)`. Amplify, then chop flat at the rails. The corners are mathematically instantaneous, which is the harshest thing you can do to a waveform: it produces a slowly decaying series of strong harmonics reaching far past Nyquist, which is exactly the recipe for aliasing [Source: https://theproaudiofiles.com/oversampling/]. It sounds crushed, buzzy and electronic. Genuinely useful; just know what you are trading.
- **`asymmetric`** — `y = x` when `x > 0`, and `y = x / (1 + |x·k|)` when `x ≤ 0`. Read that carefully: **the positive half is passed through completely untouched**, and only the negative half is squashed toward zero. The two halves are treated differently, so you get even harmonics — the warm, octave-up thickness that people associate with valves [Source: https://uveffects.com/tonelab/clipping-diodes-guide/]. It also produces a **DC offset**, because you have removed energy from one side only and the waveform's average is no longer zero. Real gear puts a DC-blocking highpass after an asymmetric stage; **Skald does not** — there is no highpass or DC blocker anywhere in the generated signal path. At moderate drive (3–10) this is a lovely, characterful setting. At drive 60+ the negative half essentially vanishes (at drive 20 an input of −0.5 comes out at −0.045) and you are left with a half-wave-rectified signal riding on a large positive DC step. See the "break it" step.

### Tone — what you hear as you sweep it

Tone is a one-pole lowpass applied to the **wet path only**, after shaping and before the mix (`skald-backend/core/codegen.odin:595-596`). The dry side of the crossfade never touches it. One pole means a gentle 6 dB/octave slope — a tilt, not a wall.

- **Tone 100–500 Hz (the bottom).** The distorted path becomes a dull thud with all its new harmonics stripped away. At mix 1 the sound is muffled and lifeless. At mix 0.3–0.5 this is genuinely useful: you get the *weight* of the saturation with none of the grit, which is a classic way to thicken a kick or a sub without adding brightness.
- **Tone 1–4 kHz (the middle).** The working range. This is where you shave the fizz off a hard-clipped signal while keeping the bite that makes it audible in a mix. Skald's default of 4000 Hz leaves plenty of edge. The example patch uses 3200 Hz.
- **Tone 7 kHz and above (the top).** Effectively wide open — and here is a real quirk. The filter coefficient is `k = clamp(2π·f / sample_rate, 0.001, 1.0)` (`skald-backend/core/codegen.odin:595`). At 44,100 Hz that expression reaches 1.0 when `f = 44100 / 2π ≈ 7020 Hz`, and a one-pole with `k = 1` computes `y += 1·(x − y)`, i.e. `y = x`: perfect bypass. **So every Tone setting from about 7 kHz to 20 kHz sounds identical**, because the filter has been switched off. At 48 kHz the threshold moves to about 7640 Hz.

Two more things about Tone worth knowing. First, the Hz label is approximate at the top end. The code uses the linear approximation `2π·f/fs` for the one-pole coefficient rather than the exact `1 − e^(−2π·f/fs)`; the two agree closely at low settings and diverge badly at high ones. At 44.1 kHz, a Tone of 1000 Hz gives a real −3 dB point near 1080 Hz (about 8% high), but a Tone of 4000 Hz gives a real −3 dB point near **6300 Hz** — over half an octave above the label. Trust your ears over the number above about 2 kHz. Second, the Tone value written in the patch is clamped inline to 100–20000 Hz (`skald-backend/core/codegen.odin:595`), so a hand-edited file with `"tone": -100` cannot break the filter.

### Mix — what you hear as you sweep it

Mix is a linear crossfade: `out = dry·(1 − mix) + wet·mix`, where `dry` is the raw input captured *before* any shaping (`skald-backend/core/codegen.odin:598`). At mix 0 the node is a bit-exact bypass. At mix 1 you hear only the shaped, tone-filtered signal.

Because the dry side is the pre-shaping input and both sides are computed from the same sample, the two paths are perfectly time-aligned — there is no latency to compensate, and therefore no phase cancellation between them. That makes this control a proper **parallel saturation** blend, the technique where you keep the clean signal's transients and detail intact and layer harmonic grit on top rather than replacing the sound with it [Source: https://babyaud.io/blog/parallel-processing].

- **Mix 0–0.2.** "Is it even on?" territory — until you bypass it and realise the sound got noticeably smaller. This is where most mix-bus saturation should sit.
- **Mix 0.3–0.6.** The sweet spot for instruments. On bass in particular this is *the* technique: the clean path holds the fundamental and the low end, while the saturated path supplies midrange harmonics that let the bass be heard on small speakers [Source: https://deathcloud.com/blogs/info/how-does-parallel-distortion-work-for-bass]. The example patch ships at 0.4.
- **Mix 0.7–1.0.** Full replacement. Correct for fuzz, for lo-fi textures, and any time the distorted sound *is* the sound rather than a seasoning. Note that at mix 1 the Tone filter is now the only thing controlling your high end, since the unfiltered dry path is gone.

Practitioner tip that transfers directly here: judge the distorted path by how the *blend* sounds, not by how the wet path sounds solo'd. A wet path that sounds ugly and thin on its own is very often the one that makes the blend work [Source: https://www.soundonsound.com/techniques/saturation-strategies].

### What "expose" does, and why you would use it

Every numeric control in the parameter panel has a small link button beside it (`skald-ui/src/components/ParameterPanel.tsx:281-291`). Clicking it adds that parameter's name to the node's `exposedParameters` list. Distortion ships with **Drive, Tone and Mix all exposed by default** (`skald-ui/src/definitions/node-definitions.ts:134`). Shape is deliberately marked non-exposable (`skald-ui/src/components/NodeParameterControls.tsx:243`) — it is a string, and the exposure machinery only produces `f32` setters.

Exposing a parameter changes two things.

**In the generated Odin**, an exposed parameter stops being a baked-in literal and becomes a field on the processor struct. The code generator emits `p.drive` in the DSP expression instead of `7.0` (`skald-backend/core/param_utils.odin:73-85`), plus:

- a typed setter with codegen-time clamping — `Foo_set_drive(p, value)` refuses anything outside 1–100 (`skald-backend/core/codegen.odin:1610-1625`);
- an entry in the introspectable `Foo_PARAMS` table carrying name, min, max, default and unit, so a debug overlay or a level editor can build a slider for it without knowing anything about your patch (`skald-backend/core/codegen.odin:1631-1643`). The *default* in that table is the value you authored in the editor, not the table default (`skald-backend/core/codegen.odin:1192-1198`);
- string-keyed `set_param` / `get_param` dispatch for tooling.

**In the editor**, exposed parameters apply to the running preview *instantly* via `skald_set_param`, while any non-exposed edit forces a 250 ms debounced regenerate-and-recompile of the whole wasm module (`skald-ui/src/hooks/nodeEditor/useWasmAudioEngine.ts:8-14,31`). This is not a small difference when you are auditioning: dragging an exposed Drive is smooth and continuous; dragging a non-exposed one stutters through rebuilds.

Why you would expose Distortion's parameters for a game specifically:

- **Drive** as a damage/stress signal. Engine sounds that grind harder as the vehicle redlines; a weapon that gets nastier as it overheats; a radio voice that degrades as the player walks out of range. One `set_drive` call per frame.
- **Mix** as a distance or state fade. Keep the clean signal and dial the grit in as the player enters combat, then back off. Because mix 0 is a true bypass, mix is also the cheapest possible "turn this effect off" switch — no branch, no recompile.
- **Tone** as an environment cue. Roll Tone down to move a distorted source behind a wall or underwater; roll it up as it comes into the open.

## Try it (hands-on)

Open `examples/instruments/bass/fm-growl-bass.skald.json`. This is an FM bass patch built as a single Instrument called **FM Growl Bass**, with a 16-step sequencer track at 140 BPM playing E1 / A1 / G1 / B1. Inside the instrument the chain is:

`Modulator (sine) → FM Carrier (modIndex 190) → Lowpass (480 Hz, Q 1.1) → Amp (ADSR) → Grit (Distortion) → Output`

with a BPM-synced LFO at 1/8 running through a Mapper (−1..1 → 0.3..1.0) into the Modulator's amplitude, which is what makes it growl.

The Distortion node is labelled **Grit** and ships at `shape: soft`, `drive: 7`, `tone: 3200`, `mix: 0.4`, with drive, tone and mix all exposed. Because there is no Delay or Reverb upstream of it, Grit runs **per voice**.

Watch the little oscilloscope on the Output node (`skald-ui/src/components/Nodes/GraphOutputNode.tsx:21-27`) as you work — you will see the waveshaping as clearly as you hear it.

1. **Press play and loop the pattern.** Let it run for a few bars. This is your reference sound: a low, snarling bass with a rhythmic wobble.

2. **Select the Grit node and pull Mix to 0.** The Distortion is now a true bypass. Listen carefully to what left: the bass gets rounder, quieter and noticeably politer. The growl is still there — that is the LFO on the modulator, not the distortion — but the *edge* is gone, and on small speakers the note gets harder to locate. Put Mix back to 0.4. This A/B is the whole point of parallel saturation; do it twice more before moving on.

3. **Push Mix to 1.0 and leave it there for the next three steps.** Now you are hearing the wet path alone, which makes every change obvious.

4. **Sweep Drive from 1 up to 100, slowly.** At 1 you have `tanh(x)` — a barely-there thickening. Between about 4 and 15 the note develops a hard, reedy midrange and the attack starts to *bite* while the decay stays smoother; that difference is dynamic saturation, and it is happening because Grit sits after the Amp envelope, so the loud part of each note drives the curve harder than the tail. Past 30 the notes stop getting dirtier and simply get *flatter* — the scope shows a squared-off block — and past 60 nothing much changes at all. Note also that the whole patch got a lot louder on the way up: that is the missing output-level control.

5. **Set Drive back to 7 and sweep Tone from 100 Hz to 20000 Hz.** At 100 the distorted path is a dull muffled thump. Around 800–1500 it sounds like a bass amp with the tone rolled back. At 3200 (the shipped value) the harmonics are present but controlled. Now go from 8000 to 20000 and listen: **nothing changes.** That is the coefficient clamp at `codegen.odin:595` — above about 7 kHz at 44.1 kHz the one-pole is fully open and the setting is inert. Knowing this saves you from hunting for a difference that does not exist.

6. **Set Tone to 10000 and Drive to 100, then switch Shape from `soft` to `hard`.** There will be a short pause while the module rebuilds — Shape is compiled in, not live. Now listen to the character of the harshness. `soft` at drive 100 is a loud, fat square; `hard` at drive 100 adds a distinct metallic *sizzle* on top of it. **Break it further: keep hard/100/10000 and change the Lowpass node's cutoff from 480 Hz to 12000 Hz.** The sizzle explodes. That layer is not harmonics — it is aliasing. Listen while the sequencer walks E1 → A1 → G1 → B1: the musical part of the sound moves up and down with the notes, but a shimmering component sits at fixed, unrelated pitches and moves the *wrong way*. Skald does not oversample, so every harmonic that clipping pushes past 22.05 kHz folds back into the audible band [Source: https://theproaudiofiles.com/oversampling/]. This is not a bug you can dial out; it is the cost of hard clipping at 1× rate, and the two ways to manage it are lowering Drive and using `soft` or `classic` instead of `hard`.

7. **Break it again, differently.** Set the Lowpass cutoff back to 480, Drive to 60, Tone to 3200, Mix to 1.0, and Shape to `asymmetric`. Rebuild, then play. Two things happen. First, the sound gets *thinner and quieter*, not louder — because `asymmetric` only squashes the negative half of the wave and leaves the positive half alone, so at high drive you have thrown away nearly half your signal. Second, look at the oscilloscope: the waveform is no longer centred. It sits above the middle line. That is **DC offset**, the unavoidable by-product of an asymmetric curve, and there is no DC blocker in Skald's signal path to remove it. You may hear a soft thump at the start and end of each note as the signal steps to and from that offset. Now bring Drive down to 6 and listen again — the same curve at sane drive gives you a pleasant, slightly hollow, valve-ish thickness with a DC offset small enough to ignore. That is why `asymmetric` is a low-drive-only setting in practice.

8. **Restore and refine.** Set Shape back to `soft`, Drive to 7, Tone to 3200. Now sweep Mix slowly from 0 to 1 and find where *you* think the bass sounds biggest. Most people land somewhere between 0.3 and 0.5, which is why the patch ships at 0.4. Notice that this is not the loudest setting — the loudest setting is 1.0 — it is the setting where the clean fundamental and the harmonic grit coexist.

## Why you patch it this way

**Distortion goes after the envelope, not before it.** In the example patch the chain is Filter → Amp (ADSR) → Grit. This is deliberate. A real amplifier distorts more when you hit the strings harder, and it distorts less as the note dies away. Putting Distortion downstream of the ADSR reproduces that exactly, because the envelope has already scaled the signal by the time it reaches the curve: loud attack → deep into the nonlinearity; quiet tail → nearly linear. If you invert the order (Grit → Amp) the distortion sees a constant-amplitude signal and clips identically for the whole note, and then the envelope merely fades the already-crushed result. The result sounds static and synthetic. Both patches compile; only one sounds like an instrument.

**Distortion goes after the filter, not before it — usually.** Filter → Distortion is the synth convention and the one the example uses. The filter decides *what* gets distorted (here, a 480 Hz lowpass keeps the FM sidebands from being screechy before they hit the curve), and the Distortion's own Tone control cleans up afterwards. The reverse order — Distortion → Filter — is the guitar-amp convention, and it is also valid: you clip everything and then carve. It generally sounds more aggressive and harder to control, because a resonant filter placed after a clipper will emphasise whatever harmonics happen to sit at its cutoff. Try both; they are genuinely different instruments.

**Distortion goes before reverb and delay, never after — unless you mean it.** Distorting a reverb tail smears every echo into a wall of noise, and worse, the distortion's harmonics get fed into the reverb's own feedback. The practitioner default is saturate first, then add space [Source: https://www.soundonsound.com/techniques/saturation-strategies]. But in Skald this ordering also has a structural consequence, which is the next point and the most important one on this page.

**Per-voice versus bus is the biggest decision you make with this node.** Skald splits every instrument graph into a voice domain and a bus domain (`skald-backend/core/codegen.odin:64-111`). Anything downstream of a Delay, a Reverb, or an instrument's external audio input runs in the bus domain, once per sample on the summed output of all voices. Everything else runs in the voice domain, once per sample *per active voice*.

- **Voice-domain Distortion** (the default, and what the example patch does) shapes each note in complete isolation. Play a three-note chord and you get three independently saturated notes added together afterwards. It stays clean and articulate; nothing intermodulates. This is correct for basslines, leads, and drums — anything monophonic or near-monophonic — and it is what you want when polyphony must not change the character of a single note. It is also more expensive: with 6 voices (`voiceCount: 6` in the example) the shaping maths runs six times per sample.
- **Bus-domain Distortion** shapes the *sum*. This is what a guitar amplifier does, and it produces something voice-domain distortion physically cannot: **intermodulation**. Two notes at 100 Hz and 150 Hz pushed through one nonlinearity together produce not just their own harmonics but sum and difference tones at 50 Hz, 250 Hz, 350 Hz and so on. That is the growl and the "wall" of a distorted power chord — and it is also why distorted chords sound muddy and dissonant if the interval is wrong. To get it in Skald you put the Distortion after a Reverb or Delay in the instrument graph, or build a dedicated effect instrument fed by an instrument input.

Get this backwards and the patch still works, it just does not sound like the reference you had in your head. If you are chasing "amp," you need the bus domain. If you are chasing "clean and thick," you want the voice domain.

**A Mixer feeding a Distortion is a legitimate way to force intermodulation *within* a voice.** Since multiple wires into `input` are summed anyway (`skald-backend/core/codegen.odin:569`), two oscillators landing on one Distortion node get shaped together and will intermodulate with each other — just not with the other voices.

## Going further

**Put a VCA after it and treat that as your output level.** Add a Gain node between the Distortion and whatever comes next, and expose its `gain` (range 0–4, default 1, `skald-backend/core/param_ranges.odin:84-85`). Now you can A/B drive settings at matched loudness, which is the only honest way to judge distortion. Do this before you do anything else on this list.

**Drive the input, not the drive knob.** Because there are no modulation inputs on Distortion, the way to make the saturation move is to move the level going in. Put a Gain node *before* the Distortion and wire an LFO or a second ADSR into its `input_gain` port (`skald-backend/core/graph_validate.odin:34`). Now you have a tremolo that also modulates grit — quiet moments come out clean, loud moments come out crushed. This is a far more musical animation than modulating drive would be, and it is exactly how a real pedal behaves.

**Add a second, faster envelope for a "bite" transient.** Feed the Distortion's input through a Gain whose gain is driven by a short ADSR (attack 0.001, decay 0.04, sustain 0.2). The first 40 ms of each note slams the curve; the rest of the note passes nearly clean. On a bass this reads as a pick attack; on a kick it reads as a beater click.

**Stack two Distortions in series with a filter between them.** This is literally how multi-stage pedals and amps are built — clip, filter, clip again — and it is why they sound smoother than one hard stage [Source: https://gearspace.com/board/so-many-guitars-so-little-time/1016501-guitar-distortion-more-than-clipping.html]. Try `soft` at drive 5 → Filter lowpass at 2000 Hz → `soft` at drive 5. Compare against a single `soft` at drive 25. The two-stage version has the same amount of distortion with far less harshness, because the second stage never sees the first stage's fizz.

**Build a parallel rig with a Mixer instead of using Mix.** Split your source into two wires: one straight to a Mixer channel, one through a Distortion (Mix at 1.0) and then a Filter, and then into a second Mixer channel. Now you can EQ the saturated path independently — highpass it at 200 Hz so the saturation never muddies your low end, or bandpass it around 1.5 kHz so it only adds presence. This is the standard professional move and it is strictly more powerful than the built-in Mix knob, which offers no filtering of the wet path beyond a single lowpass [Source: https://www.soundonsound.com/techniques/saturation-strategies].

**Layer shapes rather than pushing one harder.** Two Distortions in parallel — one `asymmetric` at drive 6 for the even harmonics, one `soft` at drive 15 for the odd — blended in a Mixer, gives you a harmonic spectrum you cannot reach with any single curve. Keep the asymmetric one's level modest so its DC offset stays small.

**Expose Drive and automate it from the sequencer.** Distortion's parameters can be P-locked per step like any exposed parameter (`skald-backend/core/codegen.odin:1168-1174` — P-lock targets count as exposure). A bassline where two steps out of sixteen have drive 40 and the rest have drive 6 has an accent structure that no envelope can give you.

## Under the hood

Every Distortion node emits one self-contained block inside the sample loop, written by `generate_distortion_code` at `skald-backend/core/codegen.odin:568-600`. The whole thing is four lines of maths.

First it sums the input and forms the drive coefficient, with a floor of 1 so a corrupt or hand-edited patch cannot invert or zero the curve:

```odin
dist_in := (summed input)
dist_k  := math.max(f32(drive), 1.0)          // codegen.odin:583
```

Then one of four curves runs (`codegen.odin:584-593`). `classic`, the default, is the interesting one:

```
wet = (π + k)·x / (π + k·|x|)
```

The `π` is inherited from a well-known Web Audio waveshaper curve; the `(π + k)` numerator normalises it so that `f(±1) = ±1` at any drive. Small-signal gain is therefore `1 + k/π`, and full-scale input always comes out at full scale. `soft` is `tanh(x·k)`, `hard` is `clamp(x·k, -1, 1)`, and `asymmetric` is `x` for positive samples and `x / (1 + |x·k|)` for negative ones.

Next, a one-pole lowpass runs on the wet signal only. The state variable lives on the voice or on the processor depending on domain (`codegen.odin:1096` / `:1156`):

```odin
tone_k := clamp(2π · clamp(tone, 100, 20000) / sample_rate, 0.001, 1.0)   // :595
tone_state += tone_k * (wet - tone_state)                                 // :596
```

That second line is the entire filter: each sample, move the stored value a fraction `tone_k` of the way toward the new input. Small `tone_k` means slow movement means only low frequencies get through. `tone_k = 1` means "jump all the way there," which is no filtering at all — and that is why every Tone setting above `sample_rate / 2π` behaves identically.

Finally the crossfade, using the *pre-shaping* input as the dry side (`codegen.odin:597-598`):

```odin
mix := clamp(f32(mix), 0.0, 1.0)
out = dist_in * (1.0 - mix) + tone_state * mix
```

Two things worth noticing about the generated code as a whole. Every parameter-derived local is declared with an explicit `: f32` via `emit_f32_local` rather than `:=`, because with literal parameters Odin constant-folds the initialiser into an untyped constant that would default to `f64` and break every downstream use — the comment at `codegen.odin:577-581` documents the bug this fixed. And whatever this node produces still passes through the project's master stage, which is itself a `tanh` soft limiter: `mixed_left = math.tanh(mixed_left * master_volume)` (`codegen.odin:2417-2418`, and the same in the wasm preview path at `:2623-2624`). So you can never actually clip the output file — but you can absolutely squash it flat against that limiter, which is a different and less pleasant kind of ugly.

## Terms introduced

- **Nonlinear / nonlinearity** — a process whose output is not a simple scaled copy of its input, and which therefore creates frequencies that were not present in the input. Distortion is the only nonlinear node in Skald besides the master limiter.
- **Waveshaping** — applying a fixed input→output transfer curve to each sample independently, with no memory of previous samples. The mechanism behind every setting on this node except Tone.
- **Memoryless** — a process whose output for a given sample depends only on that sample's value, not on any past ones. The four Shape curves are memoryless; the Tone filter is not.
- **Harmonic** — a frequency component at an integer multiple of the fundamental. The 2nd harmonic is one octave up, the 3rd is an octave plus a fifth.
- **Odd harmonics** — the 3rd, 5th, 7th… produced by symmetric distortion. Perceived as hollow, hard, aggressive.
- **Even harmonics** — the 2nd, 4th, 6th… produced only by asymmetric distortion. Perceived as warm, thick, "valve-like."
- **Saturation** — gentle distortion; the low-drive end of the same process. Adds harmonics without obviously breaking the sound.
- **Clipping** — flattening a waveform against a ceiling and floor.
- **Soft clipping** — clipping with rounded corners, so harmonics arrive gradually as level rises. `soft` and `classic`.
- **Hard clipping** — clipping with instantaneous corners. Maximally harsh, maximally alias-prone. `hard`.
- **Asymmetric clipping** — treating the positive and negative halves of the wave differently. Source of even harmonics, and of DC offset.
- **DC offset** — a constant value added to a signal so its average is no longer zero. Wastes headroom, causes thumps at note boundaries, and is inaudible on its own.
- **Drive** — input gain into a nonlinearity; the "how much distortion" control.
- **Makeup / output level** — the compensating gain after a nonlinearity that lets you compare distorted and clean at the same loudness. Skald's Distortion has none; use a VCA.
- **Tone stack** — the post-clipping filter found in essentially every distortion device, there to remove the harsh top end that clipping creates.
- **One-pole lowpass** — the simplest possible lowpass filter, a 6 dB/octave gentle tilt, implemented as `y += k·(x − y)`.
- **Wet / dry** — the processed signal and the untouched signal.
- **Parallel saturation** — blending a distorted copy back against the clean original rather than replacing it, keeping the original's transients and clarity.
- **Aliasing** — frequencies generated above half the sample rate folding back into the audible range as inharmonic tones. The characteristic failure mode of digital distortion.
- **Nyquist frequency** — half the sample rate (22,050 Hz at 44.1 kHz); the highest frequency a digital system can represent.
- **Oversampling** — running a nonlinearity at a multiple of the sample rate to push aliasing products out of the way. Skald does not do this.
- **Intermodulation** — sum and difference tones created when two or more frequencies pass through the same nonlinearity together. Only happens with bus-domain distortion.
- **Voice domain / bus domain** — Skald's split between DSP that runs once per active voice and DSP that runs once on the summed output of all voices.
- **Expose** — marking a parameter so it becomes a settable field with a clamped setter in the generated Odin, and applies live in the editor preview without a rebuild.

## Code-vs-intent notes

**1. `shape` is a compile-time choice, not a parameter.** The field is now part of the contract everywhere: `DistortionParams` declares `shape: 'classic' | 'soft' | 'hard' | 'asymmetric'` (`skald-ui/src/definitions/types.ts:116-120`) and `defaultDistortionParams` ships `classic` (`skald-ui/src/definitions/node-definitions.ts:130-135`), matching the node's select (`skald-ui/src/components/Nodes/DistortionNode.tsx:10`), the parameter panel's (`skald-ui/src/components/NodeParameterControls.tsx:243`), the palette tooltip (`skald-ui/src/components/Sidebar.tsx:274`), the generator (`skald-backend/core/codegen.odin:573`) and every shipped example (`examples/instruments/bass/fm-growl-bass.skald.json:81`). A freshly dropped node therefore has a defined `shape` from the moment it lands. What you still cannot do is change it from game code: like the Filter's type and the Noise colour, it is a string, exposure only handles numbers, and the generator reads it once to decide which curve to emit — which is why the *Try it* steps above pause to rebuild whenever you switch it. **Cosmetic.**

**2. Tone is a one-pole coefficient, not a corner frequency, and the "Hz" label oversells it.** The parameter panel's slider, the on-canvas field and the range table now agree on 100–20,000 Hz (`skald-ui/src/components/NodeParameterControls.tsx:244`, `skald-ui/src/components/Nodes/DistortionNode.tsx:11`, `skald-backend/core/param_ranges.odin:37`), so nothing is lost between the surfaces. What the number *means* is a different matter: see the next item. **Cosmetic.**

**3. Every Tone value above ~7 kHz is inert, though all three range definitions go to 20 kHz.** The filter coefficient is `clamp(2π·f/sample_rate, 0.001, 1.0)` (`skald-backend/core/codegen.odin:595`); at 44.1 kHz that saturates at `f = 7020 Hz` and the one-pole degenerates to `y = x`. So roughly the top two-thirds of the advertised Tone range (7020–20000 Hz per `param_ranges.odin:37`) produces bit-identical output, and the sample-rate dependence means the same patch has a different usable Tone range at 48 kHz. Relatedly, the linear coefficient approximation makes the "Hz" unit label increasingly wrong above about 2 kHz — a Tone of 4000 Hz has a real −3 dB corner near 6.3 kHz at 44.1 kHz. **Confusing:** a user sweeping Tone in the documented range will conclude the control is broken.

**4. Drive has a floor in the emitted code but no ceiling.** `dist_k := math.max(f32(drive), 1.0)` (`skald-backend/core/codegen.odin:583`) clamps only the low side, whereas Tone (`:595`) and Mix (`:597`) are both clamped on both sides inline. A drive value baked in as a literal — i.e. any Distortion whose drive is *not* exposed — bypasses the 1–100 setter clamp entirely (`skald-backend/core/param_ranges.odin:80-81`; setter emission at `skald-backend/core/codegen.odin:1621-1622`). The repository's own edge-case graph `.claude/phase1-findings/failing-graphs/distortion_edge_big.json` sets `"drive": 1000000000`, which compiles and runs as `k = 1e9`. Output stays bounded for all four shapes, so nothing explodes — the signal simply becomes a square wave — but the UI's stated 1–100 range is not enforced for non-exposed nodes. **Confusing.**

**5. `asymmetric` produces DC offset and nothing in the signal path removes it.** The curve leaves positive samples untouched and attenuates negative ones (`skald-backend/core/codegen.odin:590`), which by construction shifts the mean of the signal away from zero. Standard practice for asymmetric clipping stages is a DC-blocking highpass immediately after [Source: https://www.kvraudio.com/forum/viewtopic.php?t=123354]; there is no highpass or DC blocker anywhere in the generated chain — the only filter the node applies is a lowpass (`:595-596`), and the only downstream processing is the master `tanh` (`:2417-2418`), which does not remove DC and will itself behave asymmetrically in the presence of an offset. At high drive this is audible as level loss plus thumps at note boundaries. **Confusing** — the mode is usable and worth having, but only at low drive, and nothing in the UI communicates that.

**6. No output/makeup gain control, which every comparable device has.** The node offers Drive with no compensating level (`skald-ui/src/components/Nodes/DistortionNode.tsx:8-13`), so `classic` at drive 20 applies roughly +17 dB of small-signal gain (`skald-backend/core/codegen.odin:592`) with no way to take it back inside the node. Standard practitioner guidance treats gain-matched comparison as the basis for judging saturation at all [Source: https://www.soundonsound.com/techniques/saturation-strategies]. The workaround — a Gain node after the Distortion — is fine, but it is undiscoverable from the node itself. **Cosmetic** (a design gap, not a defect).

**7. `new_docs/DistortionNode.md` is stale to the point of being misleading.** It documents the node as having a single `data` prop with an optional `label`, "Emitted Events / Outputs: None", and a dependency on `reactflow` (`skald-ui/new_docs/DistortionNode.md:1-15`). In reality the node exposes an `input` and an `output` handle and four parameters (`skald-ui/src/components/Nodes/DistortionNode.tsx:6-13`), and imports from `@xyflow/react` via `makeParamNode` (`skald-ui/src/components/Nodes/ParamNode.tsx:14`). **Cosmetic**, but it should not be used as a reference.

**8. There is no test coverage for Distortion anywhere.** No fixture in `skald-backend/tests/fixtures/` and no golden file in `skald-backend/tests/golden/` mentions distortion, and no test under `skald-ui/src/tests/` references it. The four distortion graphs that do exist (`.claude/phase1-findings/failing-graphs/distortion_edge_{big,neg,zero}.json`, `distortion_no_input.json`) are investigation artefacts, not part of any suite. Given that the header comment at `skald-backend/core/codegen.odin:564-567` records a previous total failure of this node — the generator matched shape strings the UI never sent, dropped Tone and Mix entirely, and shipped 100% wet — the absence of a golden test for the emitted Distortion block is the most consequential gap on this list. **Blocker** (for the codebase's regression safety, not for a user's patch).
