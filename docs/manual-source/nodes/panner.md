# Panner

> The Panner decides where a sound sits between your left and right speaker — and it does it in a way that keeps the sound the same *loudness* wherever you put it.

## What it is

Close your eyes in a room and someone speaks. You know roughly where they are without looking. Your brain works that out from two clues: the sound reaches the near ear a fraction of a millisecond earlier, and it reaches the near ear slightly *louder*, because your head shadows the far ear. Those two clues — arrival-time difference and level difference — are most of what "direction" means to your ears.

A panner is a cheat that uses only the second clue. It takes one mono signal and sends more of it to one speaker than the other. Your brain, presented with the same waveform in both ears at unequal levels, invents a source somewhere on the line between the two speakers. There is no actual sound object out there in space; there is a **phantom image**, and the pan control slides it left and right. Sound On Sound is blunt that this is a simplification of real spatial hearing — real directionality also involves inter-channel timing and tonal shading from the shape of your outer ear, which a level-only pan pot never reproduces [Source: https://www.soundonsound.com/techniques/making-most-stereo-panorama].

Now the interesting part, and the reason "pan law" is a phrase people argue about. Suppose you naively pan by taking level away from one side: hard left is `L = 1, R = 0`; centre is `L = 0.5, R = 0.5`. The centre sounds *quieter* than either extreme. Why? Because two loudspeakers playing the same signal combine **acoustically**, in the air, not by simple voltage addition. Two speakers each at half amplitude do not give you back the loudness of one speaker at full amplitude — they give you roughly 3 dB less than you would expect from naive addition. Your ears respond to acoustic *power*, and power is amplitude squared. Sound On Sound puts it exactly this way: your ears are sensitive to acoustic power, so a centrally panned sound is produced by two speakers rather than one, and a 3 dB centre attenuation is what keeps perceived loudness constant as you sweep the knob [Source: https://www.soundonsound.com/sound-advice/q-what-pan-law-setting-should-use].

So a **constant-power** (or **equal-power**) pan law sets the two channel gains so that `L² + R²` is constant at every pan position. The elegant way to do that is with a sine and a cosine: sweep an angle θ from 0 to 90°, set `L = cos θ` and `R = sin θ`, and the Pythagorean identity `cos²θ + sin²θ = 1` guarantees constant power for free. That is the shape of the law; what it does not settle is *where the 1.0 goes* — whether the pair sums to unity at the centre (a −3 dB dip relative to either extreme) or at the extremes (a +3 dB peak relative to the centre). Both are "constant-power"; they only disagree about which position is the reference [Source: https://www.kvraudio.com/forum/viewtopic.php?t=347151].

The alternative, a **linear** or **constant-voltage** law, keeps `L + R` constant instead of `L² + R²`, which needs a 6 dB centre dip relative to a unity-centred constant-power law. That law sounds like it has a hole in the middle over speakers, but it is the one that survives being folded down to mono, because mono folding *is* voltage addition. Most consoles split the difference at −4.5 dB [Source: https://www.soundonsound.com/sound-advice/q-what-pan-law-setting-should-use]. **Skald does not offer a choice.** Skald's Panner is a sine/cosine constant-power panner, normalised by √2 so that the *centre* is unity gain in both channels and a hard pan peaks at +3 dB (`skald-backend/core/codegen_nodes.odin::generate_panner_code`), and the sidebar tooltip says so outright: "Equal-power stereo panner" (`skald-ui/src/components/Sidebar.tsx::paletteNodes`). That normalisation is a deliberate correction (SKB-013): the bare cos/sin law this chapter used to describe put the *centre* 3 dB down, which meant dropping a Panner into a chain and leaving it centred — the most common position of all — quietly cost you 3 dB you never asked to give up. A neutral-sounding control should have a neutral resting position; Skald's does.

One last piece of physics you need before you start panning things. Low frequencies are *bad* at carrying direction. A 40 Hz wave is roughly 8.5 metres long; your head is about 20 cm across, so the wave barely notices your head is there — almost no level difference, almost no shadowing. Practitioners state this as a rule: keep bass centred, because panning sub-200 Hz content buys you no perceived width and costs you low-end power the moment anything sums to mono [Source: https://www.soundonsound.com/techniques/making-most-stereo-panorama]. Live venues frequently sum the low end to mono deliberately for exactly this reason. So the Panner is a tool for the things *above* the bass: pads, plucks, hats, delays, reverb returns.

## What it looks like in Skald

The Panner lives in the node palette in the left sidebar, listed between **Mapper** and **VCA**, with the tooltip "Equal-power stereo panner" (`skald-ui/src/components/Sidebar.tsx::paletteNodes`). Its card is cyan — the colour Skald reserves for stereo utility nodes (`skald-ui/src/components/Nodes/NodeStyles.ts::NODE_ACCENTS`).

It is built from Skald's shared parameter-node template, so its whole surface is four lines of config (`skald-ui/src/components/Nodes/PannerNode.tsx::PannerNode`):

| Handle | Side | Handle id | What goes here |
|---|---|---|---|
| **In** | input (left) | `input` | The mono audio you want to place. |
| **Pan** | input (left) | `input_pan` | A modulation signal that moves the pan position. |
| **Out** | output (right) | `output` | The panned result. |

Both input handles accept **any number of wires**. Everything wired into **In** is summed before panning (`skald-backend/core/codegen_nodes.odin::generate_panner_code`, via `sum_port_inputs` at `skald-backend/core/param_utils.odin::sum_port_inputs`), and everything wired into **Pan** is *added on top of* the Pan slider value (the same generator, via `get_f32_param` at `skald-backend/core/param_utils.odin::get_f32_param`). The backend validator enforces that these are the only two input ports a Panner will accept — wire to anything else and codegen refuses to build (`skald-backend/core/graph_validate.odin::valid_input_ports`).

The Panner runs at **audio rate**: it recomputes `cos θ` and `sin θ` every single sample, so you can modulate the Pan input as fast as you like and it will track. It is also **domain-agnostic** — Skald emits it both inside the per-voice loop and in the once-per-sample bus block that runs after Delay and Reverb (`skald-backend/core/codegen_processor.odin::generate_processor_code`), depending on where you wire it.

**The one rule that matters, and the canvas gives you no visual cue about it.** The Panner is the only node in Skald that writes a stereo pair (`node_<id>_out_left` / `node_<id>_out_right`, emitted alongside the ordinary mono `node_<id>_out` in `skald-backend/core/codegen_nodes.odin::generate_panner_code`). Its stereo output survives *only* if the **Out** handle goes straight into the **Output** node: the Output generator special-cases a Panner source and routes left to left and right to right (`skald-backend/core/codegen_nodes.odin::generate_graph_output_adds`). If you wire **Out** into anything else — a Filter, a VCA, a Mixer, a Delay — that node reads the Panner's **mono fallback** instead, and your stereo image is gone. Silently, on the canvas — but not entirely silently in the generator: `warn_panner_mono_consumers` (`skald-backend/core/codegen_analysis.odin::warn_panner_mono_consumers`) now prints a warning naming the offending Panner whenever it feeds only mono consumers, on the same stderr channel every other codegen warning uses. There is a regression test that exists precisely because this path used to produce total silence rather than a mono pass-through (`skald-backend/acceptance/main.odin::panner_mono`), and you can see the current, correct behaviour in the golden output: the Gain node downstream of a non-terminal Panner reads `node_3_out`, the mono fallback variable, not the L/R pair (`skald-backend/tests/golden/panner_mono.odin.golden::Asset_process`).

So: **the Panner goes last.**

## The controls

| Parameter | Range | Default | Unit | What it does to the sound |
|---|---|---|---|---|
| `pan` | −1.0 … +1.0 | 0.0 | none (position) | Slides the phantom image from hard left (−1) through centre (0) to hard right (+1). |

Every layer of the stack agrees on that range, which is reassuringly rare:

- Node card number box: `min: -1, max: 1, step: 0.05` (`skald-ui/src/components/Nodes/PannerNode.tsx::PannerNode`)
- Parameter-panel slider: `slider('pan', -1, 1, 0)` (`skald-ui/src/components/NodeParameterControls.tsx::NodeParameterControls`)
- Default parameters: `pan: 0`, sourced from the schema's generic row rather than a node-specific override (`skald-ui/src/definitions/node-definitions.ts::defaultPannerParams`, `schema/nodes.json::generic`)
- Codegen clamp table: the same generic `{-1, 1, 0, ""}` row, authored once and rendered into both the editor and the generator (`schema/nodes.json::generic`, `skald-backend/core/param_ranges.generated.odin`)

### What you hear as you sweep Pan

At **−1.0** the sound is entirely in your left speaker: `θ = 0`, so `L = cos 0 = 1.0` and `R = sin 0 = 0.0`, and the √2 normalisation scales that up to `L = 1.4142` (+3 dB) with `R` still silent. On headphones this is uncomfortable and unnatural — nothing in the real world reaches only one ear. On speakers it is dramatic and usable, and it is the loudest either channel ever gets from this node.

Moving toward **−0.5**, the image lifts off the speaker and floats between left and centre. The maths: θ = 22.5°, `L = 0.924 × 1.4142 = 1.307`, `R = 0.383 × 1.4142 = 0.541`. The *ratio* between the channels is unchanged by the √2 factor — the left channel is still about 7.7 dB louder than the right, which is a *big* level difference and yet the image sits only halfway out. That non-linearity is normal — the last 20% of pan travel does much less to the perceived position than the first 20%. This is the value used in Skald's own routing fixture (`skald-backend/tests/fixtures/panner_mono.json`).

At **0.0**, both channels get `0.7071 × 1.4142 = 1.0` — unity gain, not a dip. Over two properly placed speakers this sounds like a single source directly in front of you, and crucially it sounds *the same loudness* as it did at hard left, because the constant-power identity `cos²θ + sin²θ = 1` holds at every θ regardless of where you put the reference point. That is the whole point of the equal-power law; Skald's particular choice of reference just means the *centre* is the position where nothing is boosted or cut, and the two hard-pan extremes are where you gain 3 dB. On headphones centre sounds like it is inside your skull.

Between **+0.5 and +1.0** you get the mirror image on the right. The musically useful zone for most material is roughly **−0.7 to +0.7**: wide enough to hear separation, narrow enough that the sound still exists for a listener sitting off-axis or on a single speaker. Reserve the hard extremes for doubled parts (one take hard left, its twin hard right) and for deliberate ping-pong delay effects — and remember that a hard pan is now the loud end of the control, not a place level quietly drops away.

**Push it past ±1 and nothing new happens** — the value is clamped before the angle is computed (`generate_panner_code`). This clamp is deliberate and the code's own comment explains why: without it, an angle outside `[0, π/2]` makes one of `cos θ` or `sin θ` go negative, which leaks a **polarity-inverted** copy of the signal into the opposite channel. That is not "extra wide"; it is a mix that partially cancels itself the instant anyone listens in mono. Skald refuses to let you do it.

### What "expose" does

Every parameter row in the right-hand parameter panel has a small link icon next to it. Clicking it toggles the parameter's name into the node's `exposedParameters` array (`skald-ui/src/components/ParameterPanel.tsx::ParameterPanel`). **The Panner ships with `pan` already exposed** (`skald-ui/src/definitions/node-definitions.ts::defaultPannerParams`).

Exposing changes what the generated Odin looks like. An un-exposed `pan` is baked in as a compile-time constant — you can see it in the golden file as `f32(-0.500000000)` (`skald-backend/tests/golden/panner_mono.odin.golden::Asset_process`). An exposed `pan` becomes a real field on the processor struct, read as `p.pan` every sample (`skald-backend/core/param_utils.odin::get_f32_param`), plus:

- a typed setter that **clamps to the `param_ranges` bounds** before writing (`skald-backend/core/codegen_processor.odin::generate_processor_code`) — so a game passing `pan = 7.0` gets `1.0`, not garbage;
- a row in the `<Instrument>_PARAMS` introspection table carrying name, min, max, default and unit, so a debug overlay or save system can discover the knob without being told about it (`skald-backend/core/codegen_processor.odin::generate_processor_code`);
- a string-keyed `<Instrument>_set_param(p, "pan", v)` entry, reachable both by field name and by a `"<node id>::pan"` alias (`skald-backend/core/codegen_project.odin::emit_exposed_param_contract`).

Why expose `pan` in particular? Because pan is the parameter a *game* most wants to drive. An enemy walks from the left of the screen to the right; you compute a −1…+1 screen position and push it into the instrument every frame. A UI blip should come from the side of the menu the cursor is on. None of that can be baked into the patch — it only exists at runtime. Exposing `pan` is what turns a static sound into a positioned one.

## Try it (hands-on)

**The patch.** The suggested `examples/instruments/pads` folder does not contain a Panner — none of its five patches use one. The one example project in the repository that does is `examples/instruments/keys/glassy-fm-pluck.skald.json`, and it happens to be the ideal teaching patch, because it already has an LFO wired into the Pan input. Use that.

The signal chain inside the "Glassy FM Pluck" instrument is (`examples/instruments/keys/glassy-fm-pluck.skald.json::edges`):

```
Glass Mod (FM op) → Carrier (FM op) → Pluck Env (ADSR) → Glass Top (Filter)
    → Sparkle Delay (Delay) → Stereo (Panner) → Output
                                  ↑
                          Auto Pan (LFO, 0.3 Hz, amp 0.7)
```

Budget 5–10 minutes. **Wear headphones or sit centred between two speakers** — you cannot do this exercise on a laptop's built-in speakers or a single monitor.

1. **Load it.** Click **Open File...** in the sidebar's Graph Actions section and open `examples/instruments/keys/glassy-fm-pluck.skald.json` (`skald-ui/src/components/Sidebar.tsx::Sidebar`). Double-click the **Glassy FM Pluck** instrument node to go inside the subgraph.

2. **Hear the reference.** Press **Play** in the sequencer toolbar. The track is a 12-note pattern at 120 BPM. Listen for about 15 seconds. The plucks should drift slowly left and right — that is the 0.3 Hz Auto Pan LFO, one full round trip every 3.3 seconds.

3. **Prove the LFO is doing the drifting.** Click the **Auto Pan** node. In the parameter panel, drag **Amplitude** down to `0`. The drift stops dead and everything collapses to the centre. Drag it back to `0.7`. This is your first concrete result: the Pan input adds to the Pan slider, it does not replace it.

4. **Hear the unity centre — and that hard pan is now the loud end.** With Amplitude still at `0`, click the **Stereo** (Panner) node and slowly drag the **Pan** slider from `0` to `-1`. The sound walks to your left ear, and this time **it does get a little louder as it arrives** — about 3 dB, from unity at centre to +3 dB hard left. Sweep back to `0` and notice the loudness settles back to the reference level rather than rising further. That is the √2-normalised law: `1.0² + 0.0² = 1.4142²` is not the identity that holds here — what holds is that at *every* pan position the ratio `(L/1.4142)² + (R/1.4142)²` equals 1, i.e. the shape of the law is unchanged; only where its 0 dB reference sits has moved, from the centre to the extremes.

5. **Find the useful zone.** Set Pan to `-0.5`, then `-0.7`, then `-0.9`, then `-1.0`. Notice how much distance you gain between `0` and `-0.5` versus how little you gain between `-0.7` and `-1.0`. Now set it back to `0` and re-enable the LFO Amplitude at `0.7` — that 0.7 is a deliberate choice by whoever built the patch: wide movement that never quite slams into a speaker.

6. **Break it #1 — over-modulate into a square flip.** Click **Auto Pan** and set **Amplitude** to `4.0`. Press Play. The gentle drift becomes a hard, ugly left-right *flapping*: the sine wave now spends almost all its time beyond ±1, and the clamp inside `generate_panner_code` flattens it into what is effectively a square wave. You have accidentally built a stereo tremolo. This is the failure mode the clamp protects you from — without it, the angle would leave `[0, π/2]`, `cos θ` would go negative, and you would be printing polarity-inverted signal into the opposite speaker. Set Amplitude back to `0.7`.

7. **Break it #2 — collapse the stereo field.** Delete the wire from **Stereo → Output**. Drag a **VCA** node out of the sidebar, wire **Stereo → VCA → Output**, and set the VCA's Gain to `1.0`. Press Play. The auto-pan is **completely gone** — dead centre, no movement, and no longer any *louder* at the moments the LFO would have swung it wide, either. Nothing in the UI told you this would happen (though the generator itself now would, on its own stderr — see `warn_panner_mono_consumers` above). What you are hearing is the mono fallback in `generate_panner_code`: the VCA reads the Panner's mono pass-through, `node_<id>_out`, which since SKB-013 carries the *unpanned* input at unity gain rather than a level that dipped and swelled with pan position. The pan *position* is lost exactly as before; what is different from the old law is that the level is not — pan is not a level, and the mono path no longer pretends otherwise. Delete the VCA and restore **Stereo → Output**.

8. **Break it #3 — polyphony no longer inflates the modulation.** Restore everything, then set the Panner's own **Pan** slider to `-0.6` while the LFO runs at Amplitude `0.7`. The two add: the position now swings between `-1.3` (clamped to `-1.0`) and `+0.1`. You will hear the sound *stick* against the left speaker for a long moment at each cycle, then flick across. That sticking is the clamp again, and it is a good thing to be able to recognise by ear — it means your modulation depth plus your offset exceed the available range. Unlike some other modulation paths in Skald, this one does **not** get worse the more notes you hold down: because the Panner sits downstream of the Sparkle Delay, it lives in the once-per-sample bus domain, and the Auto Pan LFO — whose only consumer is that bus-domain Panner — is hoisted into the bus domain right alongside it (`skald-backend/core/codegen_analysis.odin::hoist_bus_modulators`, packet B7-3). The LFO runs once per sample either way, so the sticking you just heard comes purely from the Pan slider plus the LFO amplitude summing past the `[-1, 1]` clamp, not from how many voices happen to be playing.

9. **Optional — the bass lesson.** Click **Glass Top** (the Filter) and change its **Cutoff** from `6000` down to `120` Hz. Press Play with the auto-pan running. The sound is now almost pure low end, and the panning becomes nearly inaudible as *position* — you can tell something is changing, but not *where* it is. That is the physics from the first section: your ears cannot localise wavelengths much longer than your head. Restore Cutoff to `6000`.

## Why you patch it this way

The Panner is a **terminal** node. In practice its shape is always:

```
[everything that makes the sound] → [Panner] → [Output]
```

**What feeds it.** Whatever is last in your tone chain. Usually a Filter, a VCA, a Distortion, or — as in the glassy pluck — a Delay or Reverb. Putting the Panner after time-based effects is the idiomatic choice, because it means the echoes and the tail travel with the source instead of staying nailed to the centre while the dry signal wanders. Note that this decision also changes *where the Panner runs*: Delay and Reverb seed Skald's bus domain, and everything downstream of them inherits it (`skald-backend/core/codegen_analysis.odin::seed_bus_domain`), so a post-Delay Panner is computed once per sample on the summed voices rather than once per voice.

**What it feeds.** The **Output** node, and only the Output node. Everything above about the mono fallback applies. If you want a Filter *and* a Panner, the Filter goes first.

**Getting the order wrong.** Three common mistakes, in increasing order of subtlety:

- *Panner → Filter → Output.* Stereo silently lost. This one is invisible in the editor and obvious the moment you listen with your eyes closed.
- *Panner → Delay → Output.* Same loss, and worse: the Delay is a mono bus effect with a single shared buffer, so it could not have preserved a stereo image even if you asked nicely.
- *Two Panners → one Output.* This one is **correct** and is the standard way to build a wide patch: two sources, hard left and hard right, both wired into Output. Skald sums every connection into the Output's input port and routes each Panner's L/R pair independently (`skald-backend/core/codegen_nodes.odin::generate_graph_output_adds`). There is an acceptance test for exactly this shape, added because the second connection used to be silently dropped (`skald-backend/acceptance/main.odin::dual_panner`, fixture `skald-backend/tests/fixtures/dual_panner.json`).

**Where the Panner is the wrong tool.** For a sub-bass, a kick, or anything whose energy lives below roughly 150–200 Hz, leave it out entirely or leave Pan at `0`. You gain nothing perceptual and you lose power in any mono playback situation [Source: https://www.soundonsound.com/techniques/making-most-stereo-panorama]. Also note that Skald's Mixer has *no* per-channel pan control, so a Panner per source before the Mixer is not an option either — the Panner has to be the last node, and each source that needs its own position needs its own Panner wired straight to Output. See **What Skald deliberately does not do** for why per-node stereo is out of scope, and KI-045 for the Mixer's dead `pan` field specifically.

## Going further

**Tempo-flavoured auto-pan.** The LFO node has a BPM Sync toggle. Sync the Auto Pan LFO to `1/1` or `1/2` and the movement locks to your groove instead of drifting against it. A fast synced pan (`1/16`) on a hat or a pluck reads as rhythmic bounce rather than movement; a slow free-running pan (0.05–0.3 Hz) on a pad reads as space. Practitioner LFO rates for this effect span roughly 0.05 Hz to 10 Hz [Source: https://www.iconcollective.edu/ableton-live-auto-pan-tips]. Skald's exposed LFO frequency setter clamps to 0.01–100 Hz (`schema/nodes.json::overrides`), so the whole practical range and then some is available.

**Pan the effect, not the source.** A classic trick: keep the dry signal dead centre and auto-pan only a reverb or delay return. The focus stays put while the space around it moves, which is far less fatiguing than swinging the whole instrument [Source: https://www.soundonsound.com/techniques/making-most-stereo-panorama]. In Skald: split your source with two wires, send one straight to a Panner at `pan = 0` → Output, and the other through a Reverb into a second Panner with the LFO on its Pan input → Output. Both Panners feed the Output; both stereo pairs are summed.

**Static width by layering.** Two Oscillators detuned by a few cents, each through its own ADSR and its own Panner at `-0.6` and `+0.6`, both into Output. This is the cheapest convincing "wide" pad in the toolkit, and it costs you two nodes. Because each voice's detune is different, the two sides decorrelate over time and the image breathes.

**Velocity- or pitch-dependent placement.** Feed a MIDI Input's `velocity` port through a **Mapper** (set `inMin/inMax` to `0/1` and `outMin/outMax` to `-0.8/0.8`) into the Panner's Pan input. Now hard-hit notes sit right and soft notes sit left, which is how a real drum kit or a real keyboard behaves under a stereo pair. The Mapper is the right node here rather than a raw wire, because it clamps and rescales (`skald-backend/core/codegen_nodes.odin::generate_mapper_code`) — the Panner would otherwise just add a raw 0…1 velocity to your pan position and shove everything rightward.

**Sample & Hold for randomised placement.** Wire a Sample & Hold node (rate ~4 Hz, amplitude 0.6) into the Pan input instead of an LFO. Each new random value teleports the sound to a new position and holds it there, which is great for granular textures and terrible for anything melodic.

**Runtime positional audio.** Expose `pan`, then in your game call `<Instrument>_set_param(p, "pan", screen_x_normalised)` each frame. The clamp is already generated for you (`skald-backend/core/codegen_processor.odin::generate_processor_code`), so you can pass raw world coordinates through a divide and stop worrying.

## Under the hood

The whole node is a handful of lines of generator (`skald-backend/core/codegen_nodes.odin::generate_panner_code`). It emits four statements per sample.

First, the pan position is turned into an angle — unchanged by SKB-013, since the fix is entirely in what happens to the gains, not the angle:

```odin
pan_angle_<id>: f32 = (math.clamp(f32(pan), -1.0, 1.0) * 0.5 + 0.5) * f32(math.PI) / 2.0
```

`pan × 0.5 + 0.5` maps −1…+1 onto 0…1, and multiplying by π/2 turns that into 0…90° in radians. The `clamp` runs *before* the mapping so the angle can never escape the first quadrant.

Then the two channel gains, each carrying the new √2 factor:

```odin
node_<id>_out_left  = input * math.cos(pan_angle_<id>) * 1.4142136
node_<id>_out_right = input * math.sin(pan_angle_<id>) * 1.4142136
```

Because `cos²θ + sin²θ = 1` for every θ, the *shape* of the law is exactly the constant-power identity the first section derives — that has not changed. What SKB-013 changed is the constant out front: without it, at θ = 45° (pan 0) both gains would be `√2/2 = 0.7071`, the −3 dB centre the old chapter used to describe. Multiplying through by `√2` moves that 0.7071 up to exactly `1.0` at centre, and pushes the θ = 0 / θ = 90° extremes — previously unity — up to `√2 = 1.4142`, i.e. +3.01 dB. The comment on the generator spells out why this is the right trade: a control whose neutral position is not neutral is the defect, and nobody expects a pan knob to double as a trim.

Finally, the mono fallback:

```odin
// Mono consumers get the input untouched: pan is not a level.
node_<id>_out = input
```

This exists so that a Panner feeding a mono-input node produces *something* rather than silence — the original bug this line fixes predates SKB-013 and is unrelated to the law change. What SKB-013 *did* change here is the formula: the mono fallback used to be `(L + R) × 0.7071068`, which is pan-dependent — unity at centre, 0.7071 at either extreme, so sweeping the pan made a mono consumer's level dip. That was itself a defect (pan is a position, not a fader), so the fallback is now a bare pass-through of the unpanned input at unity gain, always. A mono consumer downstream of a Panner hears the source exactly as if the Panner were not there at all; it just cannot hear *where* the Panner put it.

Finally, the values reach the speakers. The Output node adds each Panner's pair into the running `output_left` / `output_right` accumulators (`skald-backend/core/codegen_nodes.odin::generate_graph_output_adds`), the instrument's own volume scales both, and the per-asset soft limiter clamps each side independently with `tanh` before the master stage does the same again (`skald-backend/core/codegen_processor.odin::generate_processor_code`, `skald-backend/core/codegen_project.odin::emit_soft_limit_proc`). Because the two channels are limited *separately* at both stages, a very hot hard-panned signal (remember, now peaking at +3 dB rather than staying at unity) can be saturated on one side while the other side stays clean — another reason to leave a little headroom rather than living at the extremes. The editor's preview runs this same generated code compiled to WebAssembly and reads the left and right buffers straight out of WASM memory, so what you hear in the app is what you export.

## Terms introduced

- **Stereo field (stereo image / panorama)** — the apparent space between your two speakers in which sounds can be placed.
- **Phantom image** — a sound that appears to come from a point between the speakers, created by feeding the same signal to both at different levels. Nothing is actually there.
- **Panning** — placing a mono signal in the stereo field by adjusting its level in each channel.
- **Localisation** — your brain's ability to work out where a sound came from, using arrival-time and level differences between your ears.
- **Interaural level difference** — the loudness difference between your two ears caused by your head shadowing the far one; the only localisation cue an amplitude panner reproduces.
- **Pan law** — the rule that decides how the two channel gains change as you sweep the pan control, including where its 0 dB reference point sits.
- **Constant-power (equal-power) pan law** — a pan law where `L² + R²` is constant at every position, so perceived loudness stays constant over speakers as you sweep. Skald's law is this shape, referenced to unity at *centre* rather than at the extremes.
- **Unity-centred normalisation** — Skald's specific choice of reference for its constant-power law: pan 0 passes the signal through unchanged in both channels, and a hard pan is +3 dB louder, the opposite of a law referenced at the extremes.
- **Constant-voltage (linear) pan law** — the alternative where `L + R` is constant, needing a 6 dB dip relative to a unity-centred constant-power law; better for mono fold-down, worse over speakers.
- **Acoustic power** — amplitude squared; what your ears actually respond to, and the reason two half-amplitude speakers do not equal one full-amplitude speaker.
- **Mono compatibility** — whether a mix still sounds right when left and right are summed into one channel.
- **Mono fold-down (mono summing)** — the act of adding left and right into a single channel, as club PAs, phone speakers and many broadcast paths do.
- **Polarity inversion** — flipping a signal's sign. Add a signal to its inverted self and you get silence; do it partially and you get thin, hollow cancellation.
- **Auto-pan** — driving the pan position from an LFO so the sound moves on its own.
- **Modulation depth** — how far a modulator swings its target; here, the LFO's Amplitude.
- **Audio rate vs control rate** — whether a value is recomputed every sample (audio rate, as the Panner does) or only occasionally. Audio-rate modulation can go arbitrarily fast without stepping.
- **Clamping** — forcing a value back inside a legal range. Audible as the sound "sticking" at an extreme instead of continuing to move.
- **Headroom** — the gap between your loudest signal and the point where the output stage starts distorting.

## Known issues

Defects that touch this chapter are tracked centrally in the **Known issues** chapter (`KNOWN-ISSUES.md`): KI-004, KI-045, KI-049, KI-050, KI-051. Deliberate design limits — things Skald does not do on purpose — are collected in **What Skald deliberately does not do**.
