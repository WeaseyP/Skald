# ADSR Envelope

> A shape that says how loud (or how bright, or how anything) a note should be at every instant from the moment you press the key to the moment the sound finally dies.

## What it is

Play a note on a piano and a note on a church organ. Same pitch, same room, same loudness — and you would never confuse them, even over a bad phone line. A big part of that difference is not *what* frequencies are in the sound but *when* they arrive and how they leave. The piano explodes in a few milliseconds and then bleeds away for seconds. The organ takes a moment to speak, sits at a flat level for as long as you hold the key, and stops almost the instant you let go. That "loudness over time" contour is called the **amplitude envelope**, and it is one of the strongest identity cues your ear has.

This is not folklore. Attack time — how long a partial takes to climb from inaudible to full — is treated in the timbre-perception literature as a primary acoustic dimension, on the same footing as spectral brightness: shorter attacks are perceived as more "acute", and percussion sits at the short end while bowed strings sit at the long end [Source: https://pmc.ncbi.nlm.nih.gov/articles/PMC9001888/]. The classic demonstration is subtractive: excise the attack transient from a recorded instrument and listeners' ability to name the instrument drops sharply — the steady part of the tone alone is a surprisingly weak clue [Source: https://www.mcgill.ca/mpcl/files/mpcl/mcadams_2019_foundmuspsychol.pdf]. Your ear spends most of its identification budget on the first few dozen milliseconds.

Synthesizers formalise the contour with four numbers, the **ADSR**. **Attack** is the time to rise from silence to full level. **Decay** is the time to fall from full level down to the **Sustain** level. Sustain is not a time — it is a *level*, the plateau the sound holds for as long as you keep the key down. **Release** is the time to fall from wherever the envelope currently is back to silence, once you let go [Source: https://thewolfsound.com/envelopes/]. Four numbers, and you can be a pluck (fast attack, fast decay, low sustain), a pad (slow attack, high sustain, long release), or an organ (instant attack, sustain at 1.0, instant release).

Two words that get used loosely and matter here: a **trigger** is a momentary "go!" pulse, while a **gate** is a signal that stays on for the whole time the key is held. The trigger starts the attack; the gate is what tells the envelope to keep sitting at Sustain instead of moving on to Release. Sound on Sound's Synth Secrets makes the point sharply — an envelope without proper retriggering makes fast overlapping lines sound "dull and uninteresting", because each new note inherits the previous note's dying contour instead of getting its own punch [Source: https://www.soundonsound.com/techniques/envelopes-gates-triggers]. In Skald you never patch a gate by hand: playing a note *is* the gate, and it is handled for you by the voice system.

The second big idea is that an envelope is not inherently about volume. It is a **modulation source** — a control signal that happens to be shaped like a note. Feed it to an amplifier and you get loudness shaping. Feed it to a filter's cutoff and you get a "wow" that opens bright and closes dark, which is what most people actually mean when they say "pluck" or "acid". Feed it to pitch and you get a click or a laser [Source: https://thewolfsound.com/envelopes/]. Skald's ADSR node does both jobs with the same code, and which one it is doing depends entirely on what you plug it into.

Last thing, and it is a limitation worth knowing before you get frustrated: a four-stage envelope cannot draw every shape. Synth Secrets uses "spit brass" as the example — a sharp initial blat, a drop back, then a slow swell to full — which ADSR simply cannot express, because the attack always peaks at maximum and the decay always ends exactly at the sustain level [Source: https://www.soundonsound.com/techniques/more-about-envelopes]. When you hit that wall in Skald, the answer is a second envelope on a second destination, or an LFO, not a cleverer ADSR.

## What it looks like in Skald

It lives in the **Nodes** palette in the left sidebar, listed as **ADSR** with the tooltip "Envelope: shapes a note over attack/decay/sustain/release. Scales with velocity." (`skald-ui/src/components/Sidebar.tsx:270`). Drag it onto the canvas like any other node.

The node has exactly two handles (`skald-ui/src/components/Nodes/ADSRNode.tsx:6-7`):

- **Gate** (input, handle id `input`) — on the left.
- **Env** (output, handle id `output`) — on the right.

The "Gate" label is a bit of a trap, and it is worth being blunt about it: this input is **not** a gate. It is the signal the envelope multiplies. If you patch an oscillator or filter into it, the node behaves as a **VCA** (voltage-controlled amplifier — a volume control driven by a signal instead of a knob) and the output is that audio with the envelope's shape applied. If you patch **nothing** into it, the codegen substitutes a constant `1.0` (`skald-backend/core/codegen.odin:217`), and the output becomes the bare envelope, a control signal that ramps 0 → 1 → sustain → 0. That is the mode you use when you want to drive a filter. Several sources into one `input` handle are summed (`skald-backend/core/codegen.odin:222-231`). The real gate — the thing that decides when Attack starts and Release starts — comes from the voice system: `note_on`, `note_off`, or a sequencer note's duration. You never wire it.

The **Env** output can go to any audio input, or to any modulation input in the patch: a Filter's `Cut` or `Res` handle, an Oscillator's `Amp`, `Freq` or `PW`, a VCA's `Gain`, a Panner's `Pan`, a Wavetable's `Pos` (`skald-ui/src/components/Nodes/FilterNode.tsx:6-10`, `OscillatorNode.tsx:10-12`, `GainNode.tsx:7-8`, `PannerNode.tsx:7-8`, `WavetableNode.tsx:10-12`). Modulation inputs *add* to the node's own knob value rather than replacing it, so a filter parked at 220 Hz with an envelope arriving at its `Cut` input sweeps upward *from* 220 Hz.

**Rate:** audio rate, per voice. The ADSR is emitted inside the per-sample voice loop (`skald-backend/core/codegen.odin:1806-1807`), and every voice carries its own independent copy of the envelope's state — its stage, its release anchor, its attack start level (`skald-backend/core/codegen.odin:1065-1074`). Six voices means six envelopes running at once, all at different points in their lives.

**What it cannot connect to:** anything downstream of a Delay or Reverb. Those two nodes run *after* all the voices are summed together, where "which voice am I?" has no answer, so the ADSR (along with Oscillator, FM Operator, Wavetable and MIDI Input) is flagged voice-coupled and the code generator refuses the patch with an explicit error rather than generating something broken (`skald-backend/core/codegen.odin:56-62` and `90-97`). Envelope first, echo afterwards — always.

## The controls

The node card gives you six number boxes (`skald-ui/src/components/Nodes/ADSRNode.tsx:9-14`). Selecting the node also opens a draggable envelope graph plus exact-entry boxes in the right-hand Parameter Panel (`skald-ui/src/components/NodeParameterControls.tsx:116-137`). The two are deliberately complementary — drag the graph to explore a shape by ear, type in the boxes to land on an exact musical timing. The project's tests pin this down: all six parameters must appear as individually exposable controls, in that order, and typing `0.008` into Attack must write exactly `0.008` (`skald-ui/src/tests/nodes/NodeParameterControls.test.tsx:35-52`).

| Parameter | Range | Default | Unit | What it does to the sound |
|---|---|---|---|---|
| **Attack** (`attack`) | 0.001 – 10 (`skald-backend/core/param_ranges.odin:60-61`); the node box allows 0 – 10 (`ADSRNode.tsx:9`) | 0.1 (`skald-ui/src/definitions/node-definitions.ts:105`) | seconds | Time from silence to full level. Owns the sound's "hardness". |
| **Decay** (`decay`) | 0.001 – 10 (`param_ranges.odin:62-63`) | 0.2 (`node-definitions.ts:106`) | seconds | Time from full level down to the sustain level. Owns the "body" after the hit. |
| **Sustain** (`sustain`) | 0 – 1 (`param_ranges.odin:64-65`) | 0.5 (`node-definitions.ts:107`) | level (0–1) | The plateau held while the note is held. A *level*, not a time. |
| **Release** (`release`) | 0.001 – 10 (`param_ranges.odin:66-67`) | 1.0 (`node-definitions.ts:108`) | seconds | Time from the current level to silence after note-off. Owns the "tail". |
| **Depth** (`depth`) | 0 – 1 (`param_ranges.odin:68-69`) | 1.0 (`node-definitions.ts:109`) | multiplier | Scales the whole output. On a modulation envelope this is "how much". |
| **Vel Sens** (`velocitySensitivity`) | 0 – 1 (`param_ranges.odin:70-71`) | 0.5 (`node-definitions.ts:110`) | blend (0–1) | How much note velocity scales the envelope. 0 = ignore velocity entirely. |

### What you actually hear

**Attack.** At the very bottom (0 to about 0.002 s) you get a click on top of the note — the signal goes from nothing to full in a couple of samples and that step edge is broadband energy your ear reads as a tick. That click is often *desirable*: it is what makes a kick drum or a pluck feel like it was hit. Around 1–5 ms you are in classic pluck/percussion territory; Native Instruments' worked example of moving attack from 1 ms to 3.5 ms to "smooth off a sharp transient" is exactly the resolution you are working at down here [Source: https://blog.native-instruments.com/adsr-explained/]. From roughly 10 to 80 ms you lose the percussive edge and get a "bowed" or "blown" onset. Past about 300 ms you are into pads, where notes fade in behind whatever else is playing; 500 ms is a standard pad attack [Source: https://emastered.com/blog/synth-pad]. At the top of Skald's range (10 s) the note arrives long after you have stopped caring — and if the note is shorter than the attack, you will barely hear it at all, because the envelope never gets high before Release fires.

**Decay.** Only audible if sustain is below 1.0 — with sustain at 1.0 the decay segment is a flat line and the knob does nothing. At 20–50 ms with a low sustain you get a hard "tick-body" that reads as percussive. At 100–200 ms (the house-pluck patch uses 0.12) you get the round, springy pluck that dance music is built out of. Past a second it stops sounding like a decay and starts sounding like a slow fade during the held note.

**Sustain.** This is the single fastest way to change the *category* of an instrument. At 0 you have a pure percussive envelope: the note hits and dies whether or not you keep holding it. At 0.1–0.3 you get plucks and picked basses — a hit with a quiet ringing remainder. At 0.6–0.8 you get "instruments that keep speaking": brass, strings, pads. At 1.0 the decay disappears entirely and you have an organ: on, flat, off. The useful musical zone is wide, but the interesting decisions all happen below 0.4, because that is where the ratio of transient to body is set. **One trap that is specific to Skald:** setting sustain to exactly 0 (or below 0.0001) does not just make a percussive note — it *ends the voice* the moment the decay finishes, and the Release stage never runs (`skald-backend/core/codegen.odin:275` and `1859-1864`). Your release time will be silently ignored. Use 0.01 rather than 0 if you want a percussive shape that still fades out on note-off.

**Release.** At 1–10 ms notes stop dead when you let go — tight, dry, good for staccato basses and anything that has to stay out of the way rhythmically. 50–150 ms is the sweet spot for most plucked and picked sounds: enough tail to sound like a real body resonating, short enough that consecutive notes stay separated. Past about 500 ms notes start to overlap each other, and this is where release interacts with polyphony: your instrument only has so many voices, and each ringing tail occupies one. Set release to 8 s on a six-voice instrument playing sixteenths and you will hear voices being stolen mid-tail. That overlap is also where mud comes from — six copies of a low bass note summing at once is a lot of energy in one octave.

**Depth.** Read this one carefully, because Skald's depth is simpler than the "envelope amount" knob on a hardware synth. It is a plain output multiplier applied at the very end (`skald-backend/core/codegen.odin:285`). On an *amplitude* envelope that just makes the whole thing quieter, which is rarely what you want — use the Instrument volume or a VCA instead. On a *modulation* envelope it is genuinely the amount control: with a Mapper scaling 0–1 to 0–2100 Hz, depth 1.0 gives you a 2100 Hz sweep and depth 0.5 gives you 1050 Hz. Note that it is unipolar: you cannot get a *negative* envelope amount (a filter that closes on the attack) by turning depth down. For that, invert with a Mapper by setting its `outMin` above its `outMax`.

**Vel Sens.** Velocity is how hard the note was struck, 0–1, and it arrives with every note from the sequencer or your MIDI keyboard. Skald blends linearly: `(1 - sens) + sens * velocity` (`skald-backend/core/codegen.odin:284`). At 0 every note is full strength no matter how you play — correct for organs, and for game SFX that must be consistent. At 0.5 (the default) a velocity-0.5 note comes out at 0.75 — half-sensitive, which flatters sloppy sequencing. At 1.0 the envelope is scaled by velocity directly, so a velocity-0.2 ghost note is genuinely five times quieter. Anything above about 0.7 makes velocity the dominant expressive control, which is what you want on drums, plucks and anything meant to feel played. This linear mapping is a defensible choice, incidentally — the assumption that MIDI velocity "should" be logarithmic turns out not to match how real commercial synths behave [Source: https://www.cs.cmu.edu/~rbd/papers/velocity-icmc2006.pdf]. What Skald cannot do is route velocity to anything *other* than the envelope's output level; there is no velocity-to-attack-time or velocity-to-cutoff routing.

### What "expose" does, and why you would use it

Next to each parameter in the Parameter Panel is a small link icon. Clicking it toggles that parameter's name in the node's `exposedParameters` list (`skald-ui/src/components/ParameterPanel.tsx:197-211, 228-236`). By default an ADSR ships with `attack`, `decay`, `sustain`, `release` and `depth` exposed, but **not** `velocitySensitivity` (`skald-ui/src/definitions/node-definitions.ts:111`).

Exposing changes what the generated Odin looks like. An un-exposed parameter is compiled in as a **literal constant** — `0.003` appears directly in the arithmetic. An exposed parameter becomes a **field on the processor struct** and the arithmetic reads `p.attack` instead (`skald-backend/core/param_utils.odin:79-85`). That buys you three things:

1. **Runtime control from game code.** You get a typed setter, `<Asset>_set_<field>(p, value)`, which clamps to the range from `param_ranges.odin` before storing (`skald-backend/core/codegen.odin:1612-1624`), plus string-keyed `set_param` / `get_param` (`codegen.odin:1677-1712`). So your game can shorten a weapon's release as the player levels up, or open a synth pad's attack as tension rises, without regenerating anything.
2. **Discoverability for tools.** Every exposed parameter lands in a static `<Asset>_PARAMS` table carrying name, min, max, default and unit (`skald-backend/core/codegen.odin:1631-1643`) so a debug overlay or save system can enumerate what is tweakable.
3. **Instant feedback while you design.** This one matters even if you never write a line of game code. While the editor is playing, changing an exposed parameter is pushed straight into the running audio as a `set_param` message; changing an un-exposed one changes the topology signature and forces a full re-codegen and recompile (`skald-ui/src/utils/projectSerializer.ts:230-248`, `skald-ui/src/hooks/nodeEditor/useWasmAudioEngine.ts:320-333`). Exposed knobs move the sound *as you drag*. Un-exposed knobs wait for a rebuild.

The cost of exposing is the clamp. An exposed `attack` can never be less than 0.001 s or more than 10 s, because the setter enforces it (`param_ranges.odin:60-61`).

## Try it (hands-on)

**Patch:** `examples/instruments/bass/house-pluck-bass.skald.json`

This one is chosen deliberately: it contains **two** ADSR nodes doing the two different jobs. `pluck-amp` ("Punch Amp") is wired between the filter and the distortion, so it is the VCA. `pluck-fenv` ("Filter Env") has nothing in its Gate input, so it emits a bare control signal, which goes through a Mapper scaling 0–1 to 0–2100 Hz and lands on the filter's `Cut` handle (`house-pluck-bass.skald.json:126-134`). Ten minutes, headphones on.

1. **Load and listen.** Sidebar → **Load**, pick `house-pluck-bass.skald.json`. Turn **Loop** on, then hit **Play**. You should hear a short, round, slightly gritty bass riff at 125 BPM — seven notes over sixteen steps. Listen specifically to the *shape* of one note: a soft thump, a quick bloom of brightness, gone in about a fifth of a second. Every part of that is envelopes.

2. **Find the controls.** Click the **House Pluck Bass** instrument node on the canvas. In the right-hand Parameter Panel, scroll past the instrument's own settings to **Internal Nodes**. You will find a section per sub-node; the two you want are **Punch Amp** and **Filter Env**, each showing a draggable envelope graph and A / D / S / R / Depth / Vel Sens boxes.

3. **Kill the transient.** On **Punch Amp**, change **Attack (s)** from `0.003` to `0.25`. Keep it playing. The riff does not just get softer — it stops being a bass line. The notes here last 120 ms each (a one-step note at 125 BPM is `1 × 60/125/4` = 0.12 s, `skald-backend/core/codegen.odin:2139-2148`), so a 250 ms attack means the envelope only ever climbs to about half before release starts. You have removed the attack transient, and with it most of the instrument's identity — the same manipulation that wrecks instrument identification in the perception experiments. Put it back to `0.003`.

4. **Hear decay and sustain trade off.** On **Punch Amp**, drag **Sustain** from `0.2` up to `1.0`. The pluck becomes an organ-ish blat: with sustain at 1.0 the decay segment is flat, so there is no "hit then body", just a rectangle of sound. Now bring it back down through `0.5`, `0.3`, `0.1`. Somewhere around 0.2–0.3 the sound snaps back into "pluck". Leave it at `0.2`.

5. **Watch a modulation envelope work.** On **Filter Env**, change **Decay (s)** from `0.09` to `1.2`. The notes go bright and stay bright — you have turned a pluck into a saw-bass, without touching a single volume control. The filter sits at 220 Hz on its own (`house-pluck-bass.skald.json:58`), the Mapper adds up to 2100 Hz on top of it, so the cutoff is sweeping roughly 220 Hz → 2200 Hz; a 90 ms decay makes that sweep read as an attack transient, a 1.2 s decay makes it read as a filter opening. Now set **Depth** on Filter Env to `0.2`: the sweep only reaches about 640 Hz and the sound goes muffled and dull. Put decay back to `0.09` and depth back to `1`.

6. **Feel velocity.** On **Punch Amp**, set **Vel Sens.** to `0`. The riff flattens out — the sequencer's velocities run from 0.8 to 0.9 (`house-pluck-bass.skald.json:148-156`) and you have just told the envelope to ignore all of it. Now set it to `1`. The accents come back, more strongly than before. Leave it at `0.6`.

7. **Break it: the release that isn't.** On **Punch Amp**, set **Decay (s)** to `0.01`, **Sustain** to `0`, and **Release (s)** to `2.0`. Everything you know about synths says you should now hear a 13 ms tick followed by a two-second tail. You will hear the tick and *nothing else*. This is the sustain-zero trap: when the envelope reaches the Sustain stage at a level of zero, Skald marks it Idle and the voice is deactivated on that same sample (`skald-backend/core/codegen.odin:275`, `1859-1864`), so the Release stage never executes. Change **Sustain** to `0.01` — same shape, one hundredth of the level — and the two-second tail appears. That is the lesson: in Skald, sustain 0 means "this note ends when the decay ends", full stop.

8. **Break it harder: release vs. polyphony.** Undo step 7 (decay `0.12`, sustain `0.2`), then set **Release (s)** to `6.0`. The riff turns into a swampy drone. Two things are happening at once. First, seven overlapping bass notes summing in the same octave is textbook **mud** — low frequencies mask each other far more aggressively than high ones. Second, the instrument only has six voices (`house-pluck-bass.skald.json:11`), so from the seventh note onward Skald steals the oldest one; you can hear tails being cut short and repitched mid-decay. Sweep release slowly from `6.0` down through `1.0`, `0.4`, `0.2` and listen for the moment the riff becomes rhythmically legible again. It happens right about where the tail gets shorter than the gap between notes — around 0.1–0.2 s at this tempo. Set it back to `0.08`.

9. **Optional — the audition button lies to you about long envelopes.** Select the Output node and press **Test Audio**. That fires a fixed note: C4, velocity 1.0, duration 0.2 s (`skald-ui/src/hooks/nodeEditor/useWasmAudioEngine.ts:350`). It is perfect for auditioning plucks and useless for auditioning pads, because any note you design longer than 200 ms is force-released before it finishes. For slow envelopes, use the sequencer with a long note instead.

## Why you patch it this way

**The amplitude envelope is the last thing before the effects.** The canonical chain is sources → filter → ADSR → (distortion / drive) → output, which is exactly what the house-pluck patch does (`house-pluck-bass.skald.json:127-131`). The ADSR goes after the filter because the filter is a resonant circuit with memory: put the envelope first and you hand the filter a signal that is already silent between notes, and its ringing tail gets truncated by the next note's attack. Put it after and the filter rings freely while the envelope decides what you hear of it.

**Distortion goes after the envelope, not before.** This trips people up. Distortion is a non-linear shaper — how much it distorts depends on how loud the input is. If you drive it with a raw oscillator and *then* apply the envelope, the grit is constant across the whole note and only the volume changes; it sounds like a fuzz pedal with someone turning a fader. If you envelope first and drive second, the loud part of the note distorts hard and the tail cleans up as it fades, which is how a real overdriven amp behaves. The house-pluck patch is deliberately in the second order.

**Every ADSR without a Gate input connection is a modulation source.** That is the `pluck-fenv` idiom: bare envelope → Mapper → some modulation handle. The Mapper is not optional decoration. The envelope emits 0–1; a filter cutoff wants hertz. Without a Mapper you would be adding at most 1 Hz to the cutoff, which is inaudible. Mapper `inMin`/`inMax` describe what is coming in (0 to 1), `outMin`/`outMax` describe what should come out (`skald-backend/core/codegen.odin:684-705`), and the result is *added* to the filter's own cutoff knob (`skald-backend/core/codegen.odin:323`) — so the knob becomes the floor of the sweep and the Mapper's `outMax` becomes its range.

**Two envelopes is the normal number, not an extravagance.** One for amplitude, one for the filter, with the filter envelope faster than the amplitude envelope. That single relationship — brightness dying before loudness does — is what your ear reads as a physical object being struck and then resonating. In the house-pluck patch the filter env decays in 90 ms while the amp env decays in 120 ms, and that 30 ms difference is doing most of the work.

**All envelopes in a voice share one gate.** Note-off releases every ADSR in the instrument at the same instant (`skald-backend/core/codegen.odin:1471-1479`), and the auto-release when a sequencer note's duration expires does the same (`codegen.odin:1759-1769`). You cannot hold one envelope open longer than another by gating them separately; if you want the filter to close before the volume does, do it with different release *times*, not different gates.

**Order mistakes and what they sound like.** ADSR after a Delay or Reverb is not a bad sound, it is a hard error — the generator prints an explanation and exits (`skald-backend/core/codegen.odin:90-97`). ADSR before the filter: soft, smeared, filter tails clipped. No ADSR at all in the patch: the voice never becomes idle on its own, so Skald falls back to deactivating it when the note's duration expires (`codegen.odin:1865-1869`) — the sound stops abruptly with a click, and a `_trigger` call with no duration gets an arbitrary 1-second one-shot instead of a musically-derived one (`codegen.odin:1532-1534`).

## Going further

**Add a third envelope on pitch.** Patch a bare ADSR through a Mapper set to `outMin` 0, `outMax` 40 into an Oscillator's `Freq` handle (`OscillatorNode.tsx:10`), with attack 0.001 and decay 0.03 and sustain 0. You get a 40 Hz upward pitch blip on every note onset — the standard trick for making a kick drum out of a sine, and for adding "mallet" to a bell.

**Invert the filter envelope.** Set the Mapper's `outMin` to `2000` and `outMax` to `0`. Now the envelope's peak produces the *lowest* cutoff, so notes start dark and open as they decay. This is the "reverse pluck" sound and it is worth hearing once, because it makes vividly clear that the envelope is just a number and the destination decides its meaning.

**Layer two amplitude envelopes in parallel.** Duplicate the source chain, give one copy a percussive envelope (attack 0.001, decay 0.04, sustain 0) and the other a sustained one (attack 0.02, sustain 0.7), and sum them with a Mixer. This is how you build a sound whose transient and body have genuinely independent timbres — a clicky noise burst on top of a smooth sine, for instance. Four-stage envelopes cannot draw that contour on their own; two of them in parallel can [Source: https://www.soundonsound.com/techniques/more-about-envelopes].

**Combine an envelope with an LFO on the same destination.** Both an LFO and an ADSR can feed the same `Cut` handle; multiple connections into one input are summed (`skald-backend/core/param_utils.odin:138-156`). Envelope gives per-note motion, LFO gives continuous motion, and the two together stop a repeated riff from sounding like a copy-paste.

**Use velocity as a design dimension, not an afterthought.** Set the amp envelope's Vel Sens to 0.8 and the filter envelope's to 0.3, then program a sequence with real dynamics. Hard notes now get both louder *and* proportionally brighter; soft notes get quiet and dull. That correlation between loudness and brightness is one of the most reliable cues that a sound is being physically played rather than triggered.

**Expose the parameters your game will want to change.** A footstep asset with exposed `decay` can be shortened on stone and lengthened in a cave. A UI blip with exposed `attack` can be softened when the player enables "reduce harsh sounds". These are one-line `set_param` calls at runtime, and they cost nothing at build time.

## Under the hood

Each ADSR node adds three fields to the per-voice state struct: the current stage (an `ADSR_Stage` enum of `Idle`, `Attack`, `Decay`, `Sustain`, `Release`), a `release_level` that continuously tracks the live envelope value, and an `attack_start` that the attack ramps *from* (`skald-backend/core/codegen.odin:1065-1074`, enum at `2301`). All four segments are **linear** — straight lines, not the exponential RC curves of analogue hardware. This is a real difference: exponential segments are usually described as sounding more natural, because we perceive amplitude logarithmically and an exponential decay is what a physically resonating object actually does [Source: https://thewolfsound.com/envelopes/]. Skald's linear decay will sound very slightly more "digital" and abrupt at the tail end than a hardware ADSR set to the same numbers. Nudge decay and release a little longer than the value you would dial on hardware to compensate.

The per-sample maths, from `generate_adsr_code` (`skald-backend/core/codegen.odin:216-287`):

```
Attack   env = attack_start + (1 - attack_start) * (age / attack)      [:257]
Decay    env = 1 - (age - attack)/decay * (1 - sustain)                [:264]
Sustain  env = sustain                                                 [:270]
Release  env = release_level * (1 - (age - time_released)/release)     [:278]

out = input * env * depth * ((1 - velSens) + velSens * velocity)       [:284-285]
```

Three details in there are worth understanding. First, Attack and Decay are computed from `voice.age` — absolute time since the note started — not from a per-stage timer, so decay always begins at exactly `t = attack` regardless of what happened in between. Second, `release_level` is written every sample during Attack, Decay and Sustain (`:258`, `:265`, `:271`), so when note-off arrives the Release segment starts from wherever the envelope genuinely was, even mid-attack. Third, `attack_start` is normally 0, but when a voice is **stolen** to play a new note Skald captures the dying voice's live envelope level first and starts the new attack from there (`codegen.odin:1364-1381`, `1404-1410`) — a retrigger ramps continuously from the old level instead of snapping to zero, which is the difference between a musical retrigger and an audible click. This is Skald's answer to the retriggering problem Synth Secrets describes on vintage hardware [Source: https://www.soundonsound.com/techniques/envelopes-gates-triggers].

Zero-length segments are handled by a branch, not a division: `if attack > 0 do env = ...; else do env = 1.0` (`:257`), with `math.max(attack, 0.000001)` in the denominator so an all-literal patch with attack `0` still compiles (`:252-257`).

Finally, the envelope is what defines a note's *lifetime*. A voice stays allocated while any of its envelopes is not Idle (`codegen.odin:1855-1864`), and the public `_trigger` call with no duration computes a "natural one-shot" as the longest `attack + decay` across every envelope in the patch, then releases (`codegen.odin:1519-1531`). So when you lengthen an attack you are not only changing a sound, you are changing how long that asset occupies a voice slot at runtime.

## Terms introduced

- **Amplitude envelope** — the contour of a sound's loudness over time, from onset to silence.
- **ADSR** — the four-parameter envelope model: Attack, Decay, Sustain, Release.
- **Attack** — time taken to rise from silence to full level.
- **Decay** — time taken to fall from full level to the sustain level.
- **Sustain** — the *level* (not a time) held for as long as the note is held.
- **Release** — time taken to fall from the current level to silence after note-off.
- **Transient** — the brief, spectrally rich burst at the very start of a sound; a primary cue for identifying what made it.
- **Gate** — a signal that stays on for as long as a note is held; it is what keeps an envelope at Sustain.
- **Trigger** — a momentary pulse that starts an envelope, with no information about how long the note lasts.
- **Note-off / release point** — the moment the gate closes and the envelope enters its Release segment.
- **Retrigger** — restarting an envelope for a new note while the previous one is still sounding.
- **Voice** — one independently-running copy of the whole instrument, playing one note.
- **Polyphony / voice stealing** — the number of simultaneous voices, and what happens when you ask for more than exist: the oldest is reassigned.
- **VCA (voltage-controlled amplifier)** — a gain stage whose level is set by a control signal rather than a knob; an ADSR feeding a VCA is the standard amplitude shaper.
- **Modulation source** — any signal used to control a parameter rather than be heard directly.
- **Envelope depth / amount** — how far a modulation envelope moves its destination.
- **Velocity** — how hard a note was played, 0–1, delivered with each note event.
- **Velocity sensitivity** — how strongly velocity scales the result.
- **Linear vs. exponential segments** — straight-line versus curved envelope ramps; exponential is closer to how physical decays and human loudness perception behave.
- **Mud** — the loss of clarity when too much simultaneous energy piles up in the low frequencies.
- **Voice domain vs. bus domain** — in Skald, code that runs once per voice per sample versus once per sample on the summed mix; envelopes are voice-domain only.
- **Exposed parameter** — a parameter promoted from a compile-time constant to a runtime-settable field on the generated processor.

## Code-vs-intent notes

**1. The input handle is labelled "Gate" but is not a gate. (confusing)**
`skald-ui/src/components/Nodes/ADSRNode.tsx:6` declares `inputs: [{ id: 'input', label: 'Gate' }]`. The codegen treats that same port as the *signal to be multiplied by the envelope*, defaulting to the constant `1.0` when nothing is connected (`skald-backend/core/codegen.odin:217`) and summing all connected sources into it (`codegen.odin:222-231`), before emitting `node_out = input * envelope * depth * vel_scale` (`codegen.odin:285`). The actual gating is done entirely by the voice lifecycle (`codegen.odin:1404-1410` for note-on, `1471-1479` for note-off) and is not patchable. A reader coming from modular synthesis will patch an LFO or MIDI Gate into "Gate" expecting to trigger the envelope, and will instead ring-modulate their audio path. "In" or "Signal" would match the behaviour.

**2. Four modulation input ports exist in the codegen but have no handles in the UI. (confusing)**
`skald-backend/core/codegen.odin:237-240` looks up modulation sources on ports `input_attack`, `input_decay`, `input_sustain` and `input_release`, and `get_f32_param` will happily sum any connections it finds there into the corresponding parameter (`skald-backend/core/param_utils.odin:138-156`). `ADSRNode.tsx:6` declares only the single `input` handle, so no user can create those connections from the editor. The capability is reachable only by hand-editing the project JSON.

**3. Three different "defaults" exist for the same parameters. (confusing)**
The UI's new-node defaults are attack 0.1 / decay 0.2 / sustain 0.5 / release 1.0 (`skald-ui/src/definitions/node-definitions.ts:105-108`). `skald-backend/core/param_ranges.odin:60-67` declares defaults of attack 0.1 / decay 0.1 / sustain 0.7 / release 0.2. The codegen's own fallbacks, used when a parameter is missing from the JSON entirely, are attack 0.01 / decay 0.1 / sustain 0.7 / release 0.1 (`skald-backend/core/codegen.odin:237-240`). The `param_ranges` numbers are not inert: they are written into the generated `<Asset>_PARAMS` introspection table as the published default (`codegen.odin:1631-1643`), so a game tool offering a "reset to default" button would reset a patch to values the sound designer never chose and the editor would never create.

**4. Minimum time is 0 in the UI, 0.001 through the runtime setter, and 0.001 in the envelope graph. (confusing)**
The node card allows 0 (`ADSRNode.tsx:9-12`, `min: 0`) and so do the Parameter Panel's exact-entry boxes (`skald-ui/src/components/NodeParameterControls.tsx:131-134`, `{ min: 0, ... }`), and a literal 0 is handled deliberately by the codegen (`codegen.odin:257`: `if attack > 0 ... else env = 1.0`). But the draggable envelope graph floors every drag at 0.001 (`skald-ui/src/components/controls/AdsrEnvelopeEditor.tsx:129, 138, 144`), and an exposed parameter's generated setter clamps to the `param_ranges` minimum of 0.001 (`param_ranges.odin:60-67` via `codegen.odin:1620-1623`). So a patch authored with attack 0 behaves as a true instantaneous jump, but calling `set_param("...attack", 0.0)` at runtime silently yields 0.001 — the same parameter has two different floors depending on how it is set.

**5. Sustain 0 silently discards the Release stage, while the UI draws it. (confusing)**
`skald-backend/core/codegen.odin:272-275` sends the envelope to `Idle` as soon as the Sustain stage is reached with a level at or below 0.0001, and `codegen.odin:1859-1864` then deactivates the voice, so Release never runs. The envelope graph, meanwhile, always draws a release segment down from the sustain point, including when sustain is 0 (`AdsrEnvelopeEditor.tsx:97-105`), and the Release number box remains editable. The picture and the control both promise a tail that the generated code will not produce. The comment at `codegen.odin:272-274` shows this is an intentional fix for stuck voices, not an accident — but nothing in the UI communicates it.

**6. The envelope graph cannot represent more than 4 seconds of a 10-second range. (confusing)**
`AdsrEnvelopeEditor.tsx:74` fixes `maxTime = 4.0`, and drag coordinates are clamped to the widget width (`:122`), so no drag can ever produce a time beyond 4 s. Attack, decay and release all range to 10 s (`param_ranges.odin:60-67`; `ADSRNode.tsx:9-12`). A pad with a 6-second release — a completely ordinary setting — has its release handle positioned off the right edge of the graph and can only be edited through the number box.

**7. `new_docs/ADSRNode.md` is stale. (cosmetic)**
`skald-ui/new_docs/ADSRNode.md:10-11` states "Emitted Events / Outputs: None" and documents only a `data` prop with an optional `label`. The component has one input handle, one output handle and six editable fields (`ADSRNode.tsx:6-15`). It also lists `reactflow` as a dependency, whereas the component is built on `makeParamNode` and the project uses `@xyflow/react` (`skald-ui/src/components/Nodes/ParamNode.tsx:14`).

**8. `AdsrParams.lastTrigger` is never read for ADSR nodes. (cosmetic)**
`skald-ui/src/definitions/types.ts:101` declares `lastTrigger?: number` on the ADSR parameter interface. The only writer stamps it on Output-type nodes (`skald-ui/src/components/ParameterPanel.tsx:328`) and the only reader scans exclusively for `output` / `InstrumentOutput` / `GraphOutput` node types (`skald-ui/src/hooks/nodeEditor/useWasmAudioEngine.ts:344-350`). Nothing sets or reads it on an ADSR; the field implies a manual per-envelope trigger capability that does not exist.
