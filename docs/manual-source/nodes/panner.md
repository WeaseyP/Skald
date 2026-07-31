# Panner

> The Panner decides where a sound sits between your left and right speaker — and it does it in a way that keeps the sound the same *loudness* wherever you put it.

## What it is

Close your eyes in a room and someone speaks. You know roughly where they are without looking. Your brain works that out from two clues: the sound reaches the near ear a fraction of a millisecond earlier, and it reaches the near ear slightly *louder*, because your head shadows the far ear. Those two clues — arrival-time difference and level difference — are most of what "direction" means to your ears.

A panner is a cheat that uses only the second clue. It takes one mono signal and sends more of it to one speaker than the other. Your brain, presented with the same waveform in both ears at unequal levels, invents a source somewhere on the line between the two speakers. There is no actual sound object out there in space; there is a **phantom image**, and the pan control slides it left and right. Sound On Sound is blunt that this is a simplification of real spatial hearing — real directionality also involves inter-channel timing and tonal shading from the shape of your outer ear, which a level-only pan pot never reproduces [Source: https://www.soundonsound.com/techniques/making-most-stereo-panorama].

Now the interesting part, and the reason "pan law" is a phrase people argue about. Suppose you naively pan by taking level away from one side: hard left is `L = 1, R = 0`; centre is `L = 0.5, R = 0.5`. The centre sounds *quieter* than either extreme. Why? Because two loudspeakers playing the same signal combine **acoustically**, in the air, not by simple voltage addition. Two speakers each at half amplitude do not give you back the loudness of one speaker at full amplitude — they give you roughly 3 dB less than you would expect from naive addition. Your ears respond to acoustic *power*, and power is amplitude squared. Sound On Sound puts it exactly this way: your ears are sensitive to acoustic power, so a centrally panned sound is produced by two speakers rather than one, and a 3 dB centre attenuation is what keeps perceived loudness constant as you sweep the knob [Source: https://www.soundonsound.com/sound-advice/q-what-pan-law-setting-should-use].

So a **constant-power** (or **equal-power**) pan law sets the two channel gains so that `L² + R² = 1` at every pan position. The elegant way to do that is with a sine and a cosine: sweep an angle θ from 0 to 90°, set `L = cos θ` and `R = sin θ`, and the Pythagorean identity `cos²θ + sin²θ = 1` guarantees constant power for free. At the centre, θ = 45°, and both channels get `cos 45° = 0.7071` — which is exactly −3.01 dB. That is where the phrase "the −3 dB centre" comes from [Source: https://www.kvraudio.com/forum/viewtopic.php?t=347151].

The alternative, a **linear** or **constant-voltage** law, keeps `L + R` constant instead of `L² + R²`, which needs a 6 dB centre dip. That law sounds like it has a hole in the middle over speakers, but it is the one that survives being folded down to mono, because mono folding *is* voltage addition. Most consoles split the difference at −4.5 dB [Source: https://www.soundonsound.com/sound-advice/q-what-pan-law-setting-should-use]. **Skald does not offer a choice.** Skald's Panner is a pure sine/cosine constant-power panner with a −3 dB centre, hard-coded (`skald-backend/core/codegen.odin:674-676`), and the sidebar tooltip says so outright: "Equal-power stereo panner" (`skald-ui/src/components/Sidebar.tsx:277`).

One last piece of physics you need before you start panning things. Low frequencies are *bad* at carrying direction. A 40 Hz wave is roughly 8.5 metres long; your head is about 20 cm across, so the wave barely notices your head is there — almost no level difference, almost no shadowing. Practitioners state this as a rule: keep bass centred, because panning sub-200 Hz content buys you no perceived width and costs you low-end power the moment anything sums to mono [Source: https://www.soundonsound.com/techniques/making-most-stereo-panorama]. Live venues frequently sum the low end to mono deliberately for exactly this reason. So the Panner is a tool for the things *above* the bass: pads, plucks, hats, delays, reverb returns.

## What it looks like in Skald

The Panner lives in the node palette in the left sidebar, listed between **Mapper** and **VCA**, with the tooltip "Equal-power stereo panner" (`skald-ui/src/components/Sidebar.tsx:277`). Its card is cyan — the colour Skald reserves for stereo utility nodes (`skald-ui/src/components/Nodes/NodeStyles.ts:100`).

It is built from Skald's shared parameter-node template, so its whole surface is four lines of config (`skald-ui/src/components/Nodes/PannerNode.tsx:3-14`):

| Handle | Side | Handle id | What goes here |
|---|---|---|---|
| **In** | input (left) | `input` | The mono audio you want to place. |
| **Pan** | input (left) | `input_pan` | A modulation signal that moves the pan position. |
| **Out** | output (right) | `output` | The panned result. |

Both input handles accept **any number of wires**. Everything wired into **In** is summed before panning (`codegen.odin:668`, via `sum_port_inputs` at `skald-backend/core/param_utils.odin:164-177`), and everything wired into **Pan** is *added on top of* the Pan slider value (`codegen.odin:669`, via `get_f32_param` at `param_utils.odin:138-156`). The backend validator enforces that these are the only two input ports a Panner will accept — wire to anything else and codegen refuses to build (`skald-backend/core/graph_validate.odin:33, 53-54`).

The Panner runs at **audio rate**: it recomputes `cos θ` and `sin θ` every single sample, so you can modulate the Pan input as fast as you like and it will track. It is also **domain-agnostic** — Skald emits it both inside the per-voice loop (`codegen.odin:1822-1823`) and in the once-per-sample bus block that runs after Delay and Reverb (`codegen.odin:1927-1928`), depending on where you wire it.

**The one rule that matters, and the app will not warn you about it.** The Panner is the only node in Skald that writes a stereo pair (`codegen.odin:1791-1794`). Its stereo output survives *only* if the **Out** handle goes straight into the **Output** node. In that case the generated code routes left to left and right to right (`codegen.odin:1978-1980`). If you wire **Out** into anything else — a Filter, a VCA, a Mixer, a Delay — that node reads the Panner's **mono downmix** instead (`codegen.odin:680`), and your stereo image is gone. Silently. There is a regression test that exists precisely because this path used to produce total silence rather than a mono downmix (`skald-backend/acceptance/main.odin:412-421`), and you can see the collapse in the golden output: the Gain node reads `node_3_out`, the mono variable, not the L/R pair (`skald-backend/tests/golden/panner_mono.odin.golden:328-332`).

So: **the Panner goes last.**

## The controls

| Parameter | Range | Default | Unit | What it does to the sound |
|---|---|---|---|---|
| `pan` | −1.0 … +1.0 | 0.0 | none (position) | Slides the phantom image from hard left (−1) through centre (0) to hard right (+1). |

Every layer of the stack agrees on that range, which is reassuringly rare:

- Node card number box: `min: -1, max: 1, step: 0.05` (`skald-ui/src/components/Nodes/PannerNode.tsx:12`)
- Parameter-panel slider: `slider('pan', -1, 1, 0)` (`skald-ui/src/components/NodeParameterControls.tsx:299`)
- Default parameters: `pan: 0` (`skald-ui/src/definitions/node-definitions.ts:148-151`), typed as a plain number (`skald-ui/src/definitions/types.ts:133-135`)
- Codegen clamp table: `case "pan": return {-1.0, 1.0, 0.0, ""}` (`skald-backend/core/param_ranges.odin:88-89`)

### What you hear as you sweep Pan

At **−1.0** the sound is entirely in your left speaker: `θ = 0`, so `L = cos 0 = 1.0` and `R = sin 0 = 0.0`. On headphones this is uncomfortable and unnatural — nothing in the real world reaches only one ear. On speakers it is dramatic and usable.

Moving toward **−0.5**, the image lifts off the speaker and floats between left and centre. The maths: θ = 22.5°, `L = 0.924`, `R = 0.383`. The left channel is about 7.7 dB louder than the right, which is a *big* level difference and yet the image sits only halfway out. That non-linearity is normal — the last 20% of pan travel does much less to the perceived position than the first 20%. This is the value used in Skald's own routing fixture (`skald-backend/tests/fixtures/panner_mono.json:43`).

At **0.0**, both channels get 0.7071 — the −3 dB centre. Over two properly placed speakers this sounds like a single source directly in front of you, and crucially it sounds *the same loudness* as it did at hard left. That is the whole point of the equal-power law. On headphones it sounds like it is inside your skull.

Between **+0.5 and +1.0** you get the mirror image on the right. The musically useful zone for most material is roughly **−0.7 to +0.7**: wide enough to hear separation, narrow enough that the sound still exists for a listener sitting off-axis or on a single speaker. Reserve the hard extremes for doubled parts (one take hard left, its twin hard right) and for deliberate ping-pong delay effects.

**Push it past ±1 and nothing new happens** — the value is clamped before the angle is computed (`codegen.odin:674`). This clamp is deliberate and the comment explains why: without it, an angle outside `[0, π/2]` makes one of `cos θ` or `sin θ` go negative, which leaks a **polarity-inverted** copy of the signal into the opposite channel. That is not "extra wide"; it is a mix that partially cancels itself the instant anyone listens in mono. Skald refuses to let you do it.

### What "expose" does

Every parameter row in the right-hand parameter panel has a small link icon next to it. Clicking it toggles the parameter's name into the node's `exposedParameters` array (`skald-ui/src/components/ParameterPanel.tsx:197-211`). **The Panner ships with `pan` already exposed** (`skald-ui/src/definitions/node-definitions.ts:150`).

Exposing changes what the generated Odin looks like. An un-exposed `pan` is baked in as a compile-time constant — you can see it in the golden file as `f32(-0.500000000)` (`skald-backend/tests/golden/panner_mono.odin.golden:325`). An exposed `pan` becomes a real field on the processor struct, read as `p.pan` every sample (`param_utils.odin:78-84`), plus:

- a typed setter that **clamps to the `param_ranges` bounds** before writing (`codegen.odin:1620-1624`) — so a game passing `pan = 7.0` gets `1.0`, not garbage;
- a row in the `<Instrument>_PARAMS` introspection table carrying name, min, max, default and unit, so a debug overlay or save system can discover the knob without being told about it (`codegen.odin:1631-1643`);
- a string-keyed `<Instrument>_set_param(p, "pan", v)` entry, reachable both by field name and by a `"<node id>::pan"` alias (`codegen.odin:1677-1693`).

Why expose `pan` in particular? Because pan is the parameter a *game* most wants to drive. An enemy walks from the left of the screen to the right; you compute a −1…+1 screen position and push it into the instrument every frame. A UI blip should come from the side of the menu the cursor is on. None of that can be baked into the patch — it only exists at runtime. Exposing `pan` is what turns a static sound into a positioned one.

## Try it (hands-on)

**The patch.** The suggested `examples/instruments/pads` folder does not contain a Panner — none of its five patches use one. The one example project in the repository that does is `examples/instruments/keys/glassy-fm-pluck.skald.json`, and it happens to be the ideal teaching patch, because it already has an LFO wired into the Pan input. Use that.

The signal chain inside the "Glassy FM Pluck" instrument is (`glassy-fm-pluck.skald.json:115-123`):

```
Glass Mod (FM op) → Carrier (FM op) → Pluck Env (ADSR) → Glass Top (Filter)
    → Sparkle Delay (Delay) → Stereo (Panner) → Output
                                  ↑
                          Auto Pan (LFO, 0.3 Hz, amp 0.7)
```

Budget 5–10 minutes. **Wear headphones or sit centred between two speakers** — you cannot do this exercise on a laptop's built-in speakers or a single monitor.

1. **Load it.** Click **Load** in the sidebar (`skald-ui/src/components/Sidebar.tsx:206`) and open `examples/instruments/keys/glassy-fm-pluck.skald.json`. Double-click the **Glassy FM Pluck** instrument node to go inside the subgraph.

2. **Hear the reference.** Press **Play** in the sequencer toolbar. The track is a 12-note pattern at 120 BPM (`glassy-fm-pluck.skald.json:130-153`). Listen for about 15 seconds. The plucks should drift slowly left and right — that is the 0.3 Hz Auto Pan LFO, one full round trip every 3.3 seconds.

3. **Prove the LFO is doing the drifting.** Click the **Auto Pan** node. In the parameter panel, drag **Amplitude** down to `0`. The drift stops dead and everything collapses to the centre. Drag it back to `0.7`. This is your first concrete result: the Pan input adds to the Pan slider, it does not replace it (`codegen.odin:669`).

4. **Hear the −3 dB centre — or rather, hear that you can't.** With Amplitude still at `0`, click the **Stereo** (Panner) node and slowly drag the **Pan** slider from `0` to `-1`. The sound walks to your left ear. Now here is the thing to notice: **it does not get louder or quieter.** It only moves. Try it again while paying attention to loudness rather than position. That constancy is the equal-power law working — at centre each channel carries 0.707 of the signal, at hard left one channel carries 1.0, and `0.707² + 0.707² = 1.0² + 0.0²`.

5. **Find the useful zone.** Set Pan to `-0.5`, then `-0.7`, then `-0.9`, then `-1.0`. Notice how much distance you gain between `0` and `-0.5` versus how little you gain between `-0.7` and `-1.0`. Now set it back to `0` and re-enable the LFO Amplitude at `0.7` — that 0.7 is a deliberate choice by whoever built the patch: wide movement that never quite slams into a speaker.

6. **Break it #1 — over-modulate into a square flip.** Click **Auto Pan** and set **Amplitude** to `4.0`. Press Play. The gentle drift becomes a hard, ugly left-right *flapping*: the sine wave now spends almost all its time beyond ±1, and the clamp at `codegen.odin:674` flattens it into what is effectively a square wave. You have accidentally built a stereo tremolo. This is the failure mode the clamp protects you from — without it, the angle would leave `[0, π/2]`, `cos θ` would go negative, and you would be printing polarity-inverted signal into the opposite speaker. Set Amplitude back to `0.7`.

7. **Break it #2 — collapse the stereo field.** Delete the wire from **Stereo → Output**. Drag a **VCA** node out of the sidebar, wire **Stereo → VCA → Output**, and set the VCA's Gain to `1.0`. Press Play. The auto-pan is **completely gone** — dead centre, no movement, and about 3 dB quieter at the moments the LFO would have swung it wide. Nothing in the UI told you this would happen. What you are hearing is `codegen.odin:680`: the VCA reads the Panner's mono downmix `(L + R) × 0.7071`, because the stereo pair is only routed when a Panner connects directly to Output (`codegen.odin:1978-1980`). Delete the VCA and restore **Stereo → Output**.

8. **Break it #3 — polyphony inflates the modulation.** Restore everything, then set the Panner's own **Pan** slider to `-0.6` while the LFO runs at Amplitude `0.7`. The two add: the position now swings between `-1.3` (clamped to `-1.0`) and `+0.1`. You will hear the sound *stick* against the left speaker for a long moment at each cycle, then flick across. That sticking is the clamp again, and it is a good thing to be able to recognise by ear — it means your modulation depth plus your offset exceed the available range. This same effect happens on its own when several notes overlap; see the Code-vs-intent notes below for why.

9. **Optional — the bass lesson.** Click **Glass Top** (the Filter) and change its **Cutoff** from `6000` down to `120` Hz. Press Play with the auto-pan running. The sound is now almost pure low end, and the panning becomes nearly inaudible as *position* — you can tell something is changing, but not *where* it is. That is the physics from the first section: your ears cannot localise wavelengths much longer than your head. Restore Cutoff to `6000`.

## Why you patch it this way

The Panner is a **terminal** node. In practice its shape is always:

```
[everything that makes the sound] → [Panner] → [Output]
```

**What feeds it.** Whatever is last in your tone chain. Usually a Filter, a VCA, a Distortion, or — as in the glassy pluck — a Delay or Reverb. Putting the Panner after time-based effects is the idiomatic choice, because it means the echoes and the tail travel with the source instead of staying nailed to the centre while the dry signal wanders. Note that this decision also changes *where the Panner runs*: Delay and Reverb seed Skald's "bus domain", and everything downstream of them inherits it (`codegen.odin:70-88`), so a post-Delay Panner is computed once per sample on the summed voices rather than once per voice.

**What it feeds.** The **Output** node, and only the Output node. Everything above about the mono downmix applies. If you want a Filter *and* a Panner, the Filter goes first.

**Getting the order wrong.** Three common mistakes, in increasing order of subtlety:

- *Panner → Filter → Output.* Stereo silently lost. This one is invisible in the editor and obvious the moment you listen with your eyes closed.
- *Panner → Delay → Output.* Same loss, and worse: the Delay is a mono bus effect with a single shared buffer (`codegen.odin:64-69`), so it could not have preserved a stereo image even if you asked nicely.
- *Two Panners → one Output.* This one is **correct** and is the standard way to build a wide patch: two sources, hard left and hard right, both wired into Output. Skald sums every connection into the Output's input port and routes each Panner's L/R pair independently (`codegen.odin:1972-1986`). There is an acceptance test for exactly this shape, added because the second connection used to be silently dropped (`skald-backend/acceptance/main.odin:423-431`, fixture `skald-backend/tests/fixtures/dual_panner.json`).

**Where the Panner is the wrong tool.** For a sub-bass, a kick, or anything whose energy lives below roughly 150–200 Hz, leave it out entirely or leave Pan at `0`. You gain nothing perceptual and you lose power in any mono playback situation [Source: https://www.soundonsound.com/techniques/making-most-stereo-panorama]. Also note that Skald's Mixer has *no* per-channel pan control, so a Panner per source before the Mixer is not an option either — the Panner has to be the last node, and each source that needs its own position needs its own Panner wired straight to Output.

## Going further

**Tempo-flavoured auto-pan.** The LFO node has a BPM Sync toggle. Sync the Auto Pan LFO to `1/1` or `1/2` and the movement locks to your groove instead of drifting against it. A fast synced pan (`1/16`) on a hat or a pluck reads as rhythmic bounce rather than movement; a slow free-running pan (0.05–0.3 Hz) on a pad reads as space. Practitioner LFO rates for this effect span roughly 0.05 Hz to 10 Hz [Source: https://www.iconcollective.edu/ableton-live-auto-pan-tips]. Skald's exposed LFO frequency setter clamps to 0.01–100 Hz (`param_ranges.odin:30`), so the whole practical range and then some is available.

**Pan the effect, not the source.** A classic trick: keep the dry signal dead centre and auto-pan only a reverb or delay return. The focus stays put while the space around it moves, which is far less fatiguing than swinging the whole instrument [Source: https://www.soundonsound.com/techniques/making-most-stereo-panorama]. In Skald: split your source with two wires, send one straight to a Panner at `pan = 0` → Output, and the other through a Reverb into a second Panner with the LFO on its Pan input → Output. Both Panners feed the Output; both stereo pairs are summed.

**Static width by layering.** Two Oscillators detuned by a few cents, each through its own ADSR and its own Panner at `-0.6` and `+0.6`, both into Output. This is the cheapest convincing "wide" pad in the toolkit, and it costs you two nodes. Because each voice's detune is different, the two sides decorrelate over time and the image breathes.

**Velocity- or pitch-dependent placement.** Feed a MIDI Input's `velocity` port through a **Mapper** (set `inMin/inMax` to `0/1` and `outMin/outMax` to `-0.8/0.8`) into the Panner's Pan input. Now hard-hit notes sit right and soft notes sit left, which is how a real drum kit or a real keyboard behaves under a stereo pair. The Mapper is the right node here rather than a raw wire, because it clamps and rescales (`codegen.odin:684-705`) — the Panner would otherwise just add a raw 0…1 velocity to your pan position and shove everything rightward.

**Sample & Hold for randomised placement.** Wire a Sample & Hold node (rate ~4 Hz, amplitude 0.6) into the Pan input instead of an LFO. Each new random value teleports the sound to a new position and holds it there, which is great for granular textures and terrible for anything melodic.

**Runtime positional audio.** Expose `pan`, then in your game call `<Instrument>_set_param(p, "pan", screen_x_normalised)` each frame. The clamp is already generated for you (`codegen.odin:1620-1624`), so you can pass raw world coordinates through a divide and stop worrying.

## Under the hood

The whole node is 15 lines of generator (`skald-backend/core/codegen.odin:667-682`). It emits four statements per sample.

First, the pan position is turned into an angle:

```odin
pan_angle_<id>: f32 = (math.clamp(f32(pan), -1.0, 1.0) * 0.5 + 0.5) * f32(math.PI) / 2.0
```
(`codegen.odin:674`)

`pan × 0.5 + 0.5` maps −1…+1 onto 0…1, and multiplying by π/2 turns that into 0…90° in radians. The `clamp` runs *before* the mapping so the angle can never escape the first quadrant.

Then the two channel gains:

```odin
node_<id>_out_left  = input * math.cos(pan_angle_<id>)
node_<id>_out_right = input * math.sin(pan_angle_<id>)
```
(`codegen.odin:675-676`)

That is the entire pan law. Because `cos²θ + sin²θ = 1` for every θ, the total power `L² + R²` equals the input power at every pan position — that identity *is* the constant-power guarantee, not an approximation of it. At θ = 45° both gains are `√2/2 = 0.7071`, i.e. −3.01 dB, which is the −3 dB centre the whole first section was about.

Finally, the mono downmix:

```odin
node_<id>_out = (node_<id>_out_left + node_<id>_out_right) * 0.7071068
```
(`codegen.odin:680`)

This exists so that a Panner feeding a mono-input node produces *something* rather than silence — the comment records that this path used to emit total silence, because downstream nodes read `node_<id>_out` and the Panner never wrote it. The `0.7071068` factor is chosen so the downmix is exactly unity gain at centre pan (`0.7071 + 0.7071 = 1.4142`, times `0.7071` = `1.0`). Note the consequence: in that internal mono path a **hard-panned** source comes out 3 dB *quieter* than a centred one. That is the opposite bias from an external mono fold-down of the stereo bus, where the centred source would be 3 dB *louder* — which is precisely the mono-compatibility trade-off that motivates the −6 dB constant-voltage law in the first place [Source: https://www.soundonsound.com/sound-advice/q-what-pan-law-setting-should-use].

Finally, the values reach the speakers. The Output node adds each Panner's pair into the running `output_left` / `output_right` accumulators (`codegen.odin:1978-1980`), the instrument's own volume scales both (`codegen.odin:1952`), and the master stage soft-limits each side independently with `tanh` (`codegen.odin:2417-2418`, and the identical WASM preview path at `codegen.odin:2623-2624`). Because the two channels are limited *separately*, a very hot hard-panned signal can be saturated on one side while the other side stays clean — another reason to leave a little headroom rather than living at the extremes. The editor's preview runs this same generated code compiled to WebAssembly and reads the left and right buffers straight out of WASM memory (`skald-ui/src/hooks/nodeEditor/audioWorklets/skaldWasm.worklet.ts:88-89, 152-153`), so what you hear in the app is what you export.

## Terms introduced

- **Stereo field (stereo image / panorama)** — the apparent space between your two speakers in which sounds can be placed.
- **Phantom image** — a sound that appears to come from a point between the speakers, created by feeding the same signal to both at different levels. Nothing is actually there.
- **Panning** — placing a mono signal in the stereo field by adjusting its level in each channel.
- **Localisation** — your brain's ability to work out where a sound came from, using arrival-time and level differences between your ears.
- **Interaural level difference** — the loudness difference between your two ears caused by your head shadowing the far one; the only localisation cue an amplitude panner reproduces.
- **Pan law** — the rule that decides how the two channel gains change as you sweep the pan control.
- **Constant-power (equal-power) pan law** — a pan law where `L² + R² = 1` at every position, so perceived loudness stays constant over speakers. Skald's law.
- **−3 dB centre** — the consequence of the constant-power law: at centre both channels carry 0.7071 of the signal, which is 3.01 dB below full.
- **Constant-voltage (linear) pan law** — the alternative where `L + R` is constant, needing a 6 dB centre dip; better for mono fold-down, worse over speakers.
- **Acoustic power** — amplitude squared; what your ears actually respond to, and the reason two half-amplitude speakers do not equal one full-amplitude speaker.
- **Mono compatibility** — whether a mix still sounds right when left and right are summed into one channel.
- **Mono fold-down (mono summing)** — the act of adding left and right into a single channel, as club PAs, phone speakers and many broadcast paths do.
- **Polarity inversion** — flipping a signal's sign. Add a signal to its inverted self and you get silence; do it partially and you get thin, hollow cancellation.
- **Auto-pan** — driving the pan position from an LFO so the sound moves on its own.
- **Modulation depth** — how far a modulator swings its target; here, the LFO's Amplitude.
- **Audio rate vs control rate** — whether a value is recomputed every sample (audio rate, as the Panner does) or only occasionally. Audio-rate modulation can go arbitrarily fast without stepping.
- **Clamping** — forcing a value back inside a legal range. Audible as the sound "sticking" at an extreme instead of continuing to move.
- **Headroom** — the gap between your loudest signal and the point where the output stage starts distorting.

## Code-vs-intent notes

**1. A voice-domain LFO feeding a bus-domain Panner gets summed across active voices, so auto-pan depth scales with polyphony.** *(confusing)*

In `glassy-fm-pluck.skald.json`, the Auto Pan LFO has no inputs, so it stays in the voice domain, while the Panner sits downstream of the Delay and is therefore in the bus domain (`codegen.odin:70-88`). Skald bridges that gap by accumulating the LFO's per-voice output into a `_vsum` variable (`codegen.odin:1016-1035`, `1846-1848`) and handing the *sum* to the bus block (`codegen.odin:1889-1891`). Each voice carries its own LFO phase (`codegen.odin:1079`), so with N notes ringing you get N sine waves added together. The instrument allows 12 voices (`glassy-fm-pluck.skald.json:11`), and with a 0.4 s release against 0.125 s steps (`:52`, plus 120 BPM / 16 steps at `:155-156`) two to four voices routinely overlap. Amplitude 0.7 (`:92`) becomes 1.4–2.8 at the Panner's Pan input, which the clamp at `codegen.odin:674` flattens into a hard left-right flip. The audible result is that the auto-pan is smooth when the pattern is sparse and square when it is dense — modulation depth that depends on how many notes you are playing. This is a consequence of correct domain bridging, not a bug in the Panner, but nothing in the UI hints at it.

**2. A Panner wired into anything other than the Output node silently loses its stereo image.** *(confusing)*

The UI presents a single `output` handle with no indication that it carries two different things depending on destination (`skald-ui/src/components/Nodes/PannerNode.tsx:10`). The codegen routes the stereo pair only when the source node is a Panner connecting directly to a GraphOutput (`codegen.odin:1978-1980`); every other consumer reads the mono downmix (`codegen.odin:680`), as the golden output shows at `skald-backend/tests/golden/panner_mono.odin.golden:328-332` where the Gain node reads `node_3_out`. The mono downmix was itself a fix for total silence (`skald-backend/acceptance/main.odin:412-414`), so the current behaviour is a deliberate improvement — but the editor still lets you build a chain whose stereo work is discarded without a warning, an error, or a visual cue.

**3. The Mixer stores a per-channel `pan` value that no control edits and no code reads.** *(confusing)*

`MixerChannelParams` declares `pan: number` with the comment "Added pan for more realistic mixing" (`skald-ui/src/definitions/types.ts:123-126`), the default mixer seeds `pan: 0` on all four channels (`skald-ui/src/definitions/node-definitions.ts:137-146`), and the parameter panel preserves it when rebuilding the levels array (`skald-ui/src/components/NodeParameterControls.tsx:260`). But the panel renders only a level slider per channel (`NodeParameterControls.tsx:280-292`), and `generate_mixer_code` reads only the `level` key (`codegen.odin:626-663`). The field is dead in both directions. Practically this means there is no way to place individual sources inside a Mixer; each source that needs its own position needs its own Panner wired straight to Output.

**4. The backend accepts `output_left` and `output_right` as Panner output ports, but the UI offers no handles for them.** *(cosmetic)*

`valid_output_port` explicitly permits `output_left` / `output_right` for a Panner (`skald-backend/core/graph_validate.odin:70-71`), the error message advertises them (`graph_validate.odin:111`), and `get_output_var` maps them to the real variables (`skald-backend/core/param_utils.odin:68-69`). The node component declares one output handle, `output` (`skald-ui/src/components/Nodes/PannerNode.tsx:10`), so these ports are reachable only by hand-editing project JSON. That capability — tapping one leg of the stereo pair to process it separately — is currently invisible to users.

**5. The exposed LFO `amplitude` range is calibrated for filter modulation and is meaningless as a pan depth.** *(cosmetic)*

`lookup_param_range` overrides LFO amplitude to `{0.0, 20000.0, 1.0}` (`skald-backend/core/param_ranges.odin:31`) — a range that exists so an LFO can sweep a cutoff across the audible spectrum. When that same LFO drives a Panner's Pan input, useful values live in 0.0–1.0 and everything above 1.0 is clamped away by `codegen.odin:674`. A game calling `set_param` on an exposed auto-pan amplitude gets a knob whose top 99.995% of travel does nothing. The range is also non-negative, so an exposed amplitude cannot be used to invert the pan direction.

**6. `skald-ui/new_docs/PannerNode.md` is stale.** *(cosmetic)*

It documents only a `data` prop and claims "Emitted Events / Outputs: None" (`skald-ui/new_docs/PannerNode.md:5-11`). It does not mention the `pan` parameter, the `input` / `input_pan` / `output` handles, or the equal-power law — all of which are in `skald-ui/src/components/Nodes/PannerNode.tsx:3-14`.

**7. Skald offers no pan-law choice, and standard practice expects one.** *(cosmetic)*

The law is hard-coded sine/cosine constant-power with a −3 dB centre (`codegen.odin:674-676`), and the UI documents it as such (`skald-ui/src/components/Sidebar.tsx:277`). Most DAWs and consoles let you pick between −3 dB (constant power, correct over speakers), −6 dB (constant voltage, correct for mono fold-down) and a −4.5 dB compromise [Source: https://www.soundonsound.com/sound-advice/q-what-pan-law-setting-should-use]. For game audio delivered through a stereo bus this is a defensible default, but it means a Skald mix folded to mono by a phone speaker or a club PA will show centred material about 3 dB hotter than hard-panned material, and there is no control to compensate.
