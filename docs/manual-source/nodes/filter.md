# Filter

> A tone control with a knife: it throws away part of the sound's frequency content and lets the rest through, and you decide where the cut happens.

## What it is

Every sound you have ever heard is a stack of simple tones ringing at once. A single sine wave is one tone and nothing else — it sounds hollow and flute-like, and it is almost useless on its own. A sawtooth wave is the opposite: it contains a fundamental pitch plus *every* whole-number multiple above it (1×, 2×, 3×, 4×…), which is why a raw saw sounds harsh, buzzy and slightly painful. A square wave contains only the odd multiples (1×, 3×, 5×…) and sounds hollow and clarinet-ish by comparison. Those multiples are called **harmonics**, and the recipe of which harmonics are present and how loud each one is *is* the sound's character — its **timbre** [Source: https://www.angelfire.com/in2/yala/2ansynth.htm].

**Subtractive synthesis** is the oldest and still the most common way to build a synthesiser sound, and it is built on one idea: start with a waveform that has far too many harmonics, then carve away the ones you do not want. You are not adding character, you are *removing* everything that is not the character. Sculpting from a block of marble, not building from bricks [Source: https://support.inmusicstore.com/en/support/solutions/articles/69000866774-synthesis-101-an-introduction-to-subtractive-synthesis]. The chisel is the filter, and it is the single most important tone-shaping tool a synth has.

A filter is defined by its **cutoff frequency** — the frequency where it starts doing its job — and its **shape**, which says what happens on either side of that point. A **lowpass** filter lets everything below the cutoff pass and progressively silences what is above, making the sound duller, warmer, further away. A **highpass** does the reverse, removing weight and body and leaving something thin and papery. A **bandpass** does both at once, keeping a narrow window of frequencies around the cutoff and discarding everything else — this is the telephone/walkie-talkie sound. A **notch** (or band-reject) is the inverse of a bandpass: it lets everything through *except* a narrow band around the cutoff, which is useful for surgically removing a resonance you do not like [Source: https://www.fabfilter.com/learn/synthesis-and-sound-design/basics-filters].

Two details trip up every beginner. The first: a filter is a slope, not a wall. Cutoff is conventionally the point where the signal is *already* 3 dB down — the filter has begun working *before* the cutoff frequency, and it keeps getting stronger above it [Source: https://www.soundonsound.com/techniques/further-filters]. How fast it gets stronger is the **slope**, measured in decibels per octave. A gentle 6 dB/oct filter halves the energy each octave and sounds like a tone knob; a 12 dB/oct ("2-pole") filter is the classic synth workhorse; 24 dB/oct ("4-pole") is the aggressive Moog-style sound. **Skald's filter is 12 dB/octave** — more on why, below.

The second detail is **resonance**, sometimes labelled Q or emphasis. Resonance feeds a little of the filter's output back into itself, which creates a boosted peak right at the cutoff frequency instead of a smooth roll-off. Perceptually this is enormous: it makes the cutoff *audible*. Without resonance, sweeping the cutoff sounds like someone slowly closing a door. With resonance, you hear a distinct whistling formant sliding up and down the harmonic series, and that whistle is the sound of essentially every acid bassline, filter riser and wah-guitar ever recorded [Source: https://www.soundonsound.com/techniques/responses-resonance]. Push resonance far enough on an analogue filter and the feedback loop sustains itself with no input at all: the filter **self-oscillates** and becomes a sine wave generator tuned to its own cutoff. Skald deliberately stops just short of this — see "The controls".

The last piece is movement. A static filter is just an EQ. What makes a filter sound like an *instrument* is modulating the cutoff over time: a fast envelope that snaps the cutoff open on each note attack and lets it fall back gives you a pluck; a slow LFO gives you a wobble; a slow envelope gives you a swell [Source: https://www.fabfilter.com/learn/synthesis-and-sound-design/basics-filters]. The Roland TB-303 — the machine that accidentally invented acid house — is little more than one oscillator, one resonant lowpass filter, and a fast decay envelope wired to the cutoff [Source: https://articles.roland.com/beyond-acid-pushing-the-tb-303-into-new-sonic-territory/]. That is the patch you will build in this chapter, and Skald ships it as an example.

## What it looks like in Skald

The Filter lives in the sidebar's **Nodes** palette, described there as "Lowpass/Highpass/Bandpass/Notch filter with cutoff + resonance (XY pad)" (`skald-ui/src/components/Sidebar.tsx::paletteNodes`). Drag it onto the canvas like any other node.

It has three inputs and one output (`skald-ui/src/components/Nodes/FilterNode.tsx::FilterNode`):

| Handle id | Label on the node | What you feed it |
|---|---|---|
| `input` | **In** | The audio you want to filter. Multiple wires into this port are **summed**, not replaced (`skald-backend/core/param_utils.odin::sum_port_inputs`). |
| `input_cutoff` | **Cut** | A control signal that is **added to** the cutoff knob value, in Hz (`skald-backend/core/param_utils.odin::get_f32_param`). |
| `input_res` | **Res** | A control signal added to the resonance knob value. |
| `output` (source) | **Out** | The filtered audio, tapped from whichever filter shape you selected. |

Those four port names are the only ones the backend will accept (`skald-backend/core/graph_validate.odin::valid_input_ports`). If you hand-edit a project's JSON and mistype `input_cutof`, codegen refuses to build rather than silently dropping the wire (`skald-backend/core/graph_validate.odin::validate_connections`) — a deliberate choice, because a dropped modulation wire produces an asset that compiles fine and sounds wrong.

The Filter runs at **audio rate**: its process block executes once per sample, inside the per-voice loop by default (`skald-backend/core/codegen_processor.odin::generate_processor_code`). It re-reads cutoff and resonance every single sample, so anything you wire into **Cut** or **Res** is followed continuously — there is no control-rate smoothing or block-size staircase. That is why an envelope into **Cut** produces a genuinely smooth sweep.

Two structural facts matter when you patch:

- **It is polyphonic by default.** Each voice gets its own private filter state (`skald-backend/core/codegen_processor.odin::generate_processor_code`), and that state is zeroed when a voice is stolen or retriggered. Ten notes held down means ten independent filters, each following its own envelope. This is what you want almost always.
- **Placed after a Delay or Reverb it becomes a bus effect.** Skald splits the graph into a per-voice domain and a single post-mix "bus" domain, seeded by `skald-backend/core/codegen_analysis.odin::seed_bus_domain`. The Filter is one of the few nodes that can legally run in either (`skald-backend/core/codegen_processor.odin::generate_processor_code`); wire it downstream of a Reverb and you get one shared filter across the whole mix, which is how you filter a reverb tail. Try that with an Oscillator or ADSR and codegen stops with an explicit error naming the node.

**What it cannot do:** it has no stereo awareness (it is a mono processor — put it before the Panner), and it cannot be modulated by anything that does not produce a numeric output, which in practice means everything except the Panner's split L/R outputs is fair game.

## The controls

Select the Filter node and its controls appear both on the node itself and in the right-hand parameter panel. The panel version adds an **XY pad**: drag horizontally for cutoff, vertically for resonance, both on a logarithmic scale, and the value commits live while you drag so you can tune by ear (`skald-ui/src/components/NodeParameterControls.tsx::NodeParameterControls`, `skald-ui/src/components/controls/XYPad.tsx::XYPad`).

| Parameter | Range | Default | Unit | What it does to the sound |
|---|---|---|---|---|
| `type` | `Lowpass` / `Highpass` / `Bandpass` / `Notch` | `Lowpass` | — | Which side of the cutoff survives. |
| `cutoff` | 20 – 20000 (see caveat) | 800 | Hz | Where the filter starts working. |
| `resonance` | 0.1 – 20 | 1.0 | Q | How much the cutoff frequency itself is emphasised. |

Sources: the type union is `skald-ui/src/definitions/types.ts::FilterParams`; the defaults are `skald-ui/src/definitions/node-definitions.ts::defaultFilterParams`; the authoritative ranges the code generator clamps to are `schema/nodes.json::cutoff` (`{20, 20000, 800, "Hz"}`) and `schema/nodes.json::resonance` (`{0.1, 20, 1.0, "Q"}`), rendered into `skald-backend/core/param_ranges.generated.odin` — the one authored copy since packet C2. A Filter node saved with no `cutoff` key at all (hand-authored or externally generated JSON) generates at 1000 Hz, not 800: `skald-backend/core/codegen_nodes.odin::generate_filter_code`'s missing-key fallback was not among the nine defaults C2 unified (KI-007).

### Cutoff — what you hear as you sweep it

Start with the default Lowpass on a sawtooth playing A2 (110 Hz), whose harmonics sit at 110, 220, 330, 440 Hz and so on.

- **20–100 Hz.** Below the fundamental. The note essentially disappears; what is left is a soft thud. Useful as a starting point for an envelope sweep, useless as a destination.
- **150–400 Hz.** Only the fundamental and one or two harmonics survive. Dark, round, sub-bass territory. This is where the acid patch's knob sits at rest.
- **400–2000 Hz.** The musical zone for most bass and lead sounds. You can hear the note's pitch clearly and enough harmonics to give it body, but the buzz is tamed. Vowel-like when resonance is up.
- **2000–7000 Hz.** Bright and present. Above about 4 kHz on a lowpass you are mostly hearing "the saw, slightly softened".
- **Above ~7 kHz.** Nothing further happens, and this is important. **The runtime clamps cutoff to `sample_rate * 0.16`** (`skald-backend/core/codegen_nodes.odin::generate_filter_code`), which is 7680 Hz at a 48 kHz sample rate and 7056 Hz at 44.1 kHz. The UI will happily let you type 20000, the exposed-parameter setter will happily store 20000, and the filter will still behave as if you asked for 7680. This is not a bug — the algorithm mathematically diverges to infinity above roughly one sixth of the sample rate [Source: https://www.earlevel.com/main/2003/03/02/the-digital-state-variable-filter/] — but it does mean a Skald Lowpass is *never* fully open, and a Skald Highpass can never be pushed above ~7.7 kHz to silence a signal (KI-037). Plan for it.

There is also a hard floor of 10 Hz on the same line, so a modulator that drives the cutoff negative parks the filter at 10 Hz (near-silence) rather than exploding.

### Resonance — what you hear as you sweep it

Skald's resonance is converted to a **damping** value internally: `q = 1 / resonance` (`skald-backend/core/codegen_nodes.odin::generate_filter_code`). Low damping means a tall peak. That inversion produces two dead zones you should know about, because otherwise you will drag the slider and hear nothing.

- **0.1 – roughly 0.55.** Silent range. `q` is clamped to a ceiling of `1.9 − f`, where `f` is the cutoff coefficient. At a 200 Hz cutoff that ceiling is about 1.88, meaning any resonance below `1/1.88 ≈ 0.53` behaves identically to 0.53. The exact floor rises with cutoff — at the maximum 7.68 kHz cutoff it is about 1.07. **In practice: resonance below ~1.0 is "as flat as this filter gets", regardless of the number** (KI-038).
- **1.0 – 2.0.** Gentle emphasis. The filter still sounds like a filter, but a sweep now has a discernible focal point. This is the default and a good place for pads and anything that must sit in a mix.
- **2.0 – 6.0.** The musical sweet spot for leads and basses. A sweep sings. The acid example ships at 2.6.
- **6.0 – 15.0.** Aggressive. The resonant peak is now louder than the source material and you can hear a definite pitch in the whistle itself. Percussive plucks live here.
- **15 – 20.** Screaming. At resonance 20 the damping hits its floor of 0.05, which corresponds to roughly a 20× (+26 dB) boost at the cutoff frequency. **Above 20 nothing further happens** — `math.clamp(..., 0.05, ...)` saturates exactly at `1/20`, which is why `schema/nodes.json::resonance` stops at 20. One asymmetry survives for hand-edited files only: an exposed parameter's *starting* value is not run through this clamp (`skald-backend/core/codegen_nodes.odin::exposed_param_default` returns the stored JSON value verbatim), so a file saved with `"resonance": 30` starts above the ceiling that no `_set_resonance` call can ever bring back down (KI-006). The editor itself never writes an out-of-range value, so you will not hit this from a fresh drag.
- **Self-oscillation: Skald will not do it.** The damping floor of 0.05 is deliberate: it bounds the resonant peak to a loud, long ring that always decays rather than a sine generator that sustains with no input (`skald-backend/core/codegen_nodes.odin::generate_filter_code`). If you want a pure self-oscillating sine, use an Oscillator; if you want the *sound* of near-self-oscillation, resonance 18–20 with a fast envelope gets you most of the way.

One consequence worth internalising: **resonance in Skald adds level.** The reference implementation of this algorithm attenuates its input as resonance rises, precisely to stop it clipping [Source: https://github.com/bdejong/musicdsp/blob/master/source/Filters/23-state-variable.rst]; Skald's version does not (`skald-backend/core/codegen_nodes.odin::generate_filter_code` has no scale term on the input). So turning resonance up makes the patch louder as well as sharper, and at high settings you will drive the master soft-clipper (`skald-backend/core/codegen_project.odin::skald_soft_limit`). Compensate with the Instrument's volume or a VCA.

### Filter type — what you hear

- **Lowpass** — default, and 90% of what you will use. Removes brightness. Feels like distance, warmth, muffling.
- **Highpass** — removes weight. Instantly makes a pad thin and airy, or cleans mud out of a layer so it can sit under a bass without fighting it [Source: https://www.fabfilter.com/learn/synthesis-and-sound-design/basics-filters]. Remember the 7.7 kHz ceiling: you cannot use it as a total mute.
- **Bandpass** — keeps a window. With resonance around 2–4 and cutoff around 1–2 kHz you get a nasal, lo-fi, "coming through a speaker in another room" character. Two bandpasses in parallel at different frequencies imitate vowel formants — Skald's `funk-chop.skald.json` guitar uses exactly this, a "Quack" bandpass at 1400 Hz and a "Scratch Band" bandpass at 4500 Hz.
- **Notch** — the odd one out. It removes a narrow band and leaves everything else. On its own it is subtle; sweep its cutoff with an LFO and you get a phaser-adjacent whoosh, because a moving spectral hole reads to the ear as movement. No shipped example uses Notch yet, which makes it a good thing to experiment with.

### What "expose" does, and why you want it

Next to each parameter in the right-hand panel is a small chain-link icon. Click it and the link turns blue; hover it and the tooltip reads *"Expose <name> to public API"* (`skald-ui/src/components/ParameterPanel.tsx::LinkIcon`). All it does in the editor is add the parameter's name to that node's `exposedParameters` list (`skald-ui/src/components/ParameterPanel.tsx::toggleParameterExposure`).

What it does in the generated Odin is much bigger. An **un-exposed** parameter is baked into the DSP as a literal constant — the golden test output shows `f32(2000.000000000)` sitting directly in the cutoff expression, next to the struct field `filter_3_low` (`skald-backend/tests/golden/filter_sweep.odin.golden`). It is fast, and it is frozen: changing it means regenerating and recompiling.

An **exposed** parameter becomes a real field on the processor struct that the DSP reads every sample (`skald-backend/core/param_utils.odin::get_f32_param`), plus:

- a typed setter with the min/max from the generated range table compiled in — `Foo_set_cutoff(p, value)` silently clamps to 20…20000 (`skald-backend/core/codegen_processor.odin::generate_processor_code`);
- a row in the introspectable `Foo_PARAMS` table listing name, min, max, default and unit, so a game's debug overlay or save system can enumerate what is tweakable without knowing anything about the patch (same proc);
- string-keyed `Foo_set_param` / `Foo_get_param`, reachable both by field name and by a `"<nodeId>::<param>"` alias (same proc) — the alias exists so that three filters all exposing `cutoff` remain individually addressable;
- a WASM export, `skald_set_param` (`skald-backend/core/codegen_project.odin::generate_wasm_shim_code`).

**Why you would expose a filter cutoff for game runtime:** it is the cheapest, most convincing "the world changed" effect there is. Drive `cutoff` from the player's depth underwater, or from a low-health state, or duck it when dialogue plays — one float per frame and the whole instrument goes muffled without touching the mix.

**Why you should expose it even if you never ship it:** in the editor, an edit to an *exposed* parameter is applied to the running preview instantly via `set_param`, with no rebuild. An edit to an un-exposed one goes through a debounced regenerate-and-recompile, so the change only lands a moment later. This is pinned down by test, including a multi-filter case (`skald-ui/src/tests/hooks/WasmEngineContract.test.tsx::useWasmAudioEngine`). Practically: **expose cutoff and resonance before you start tuning by ear**, or the XY pad will feel laggy. Skald's defaults already expose both (`skald-ui/src/definitions/node-definitions.ts::defaultFilterParams`).

## Try it (hands-on)

You will need about 8 minutes and the example patch `examples/instruments/leads/acid-303-squelch-lead.skald.json`.

This patch is a textbook 303: a sawtooth oscillator into a resonant lowpass, a fast envelope driving the cutoff through a Mapper, an amp envelope, and a light overdrive. It ships with a 16-step sequence at 130 BPM rooted on MIDI note 45 (A2, 110 Hz).

1. **Load it.** Sidebar → **Graph Actions** → **Open File...**, and pick `examples/instruments/leads/acid-303-squelch-lead.skald.json`. You should see one node on the canvas, an Instrument called **Acid Squelch**.

2. **Open its guts.** Click the Acid Squelch node once. The right-hand panel fills with the instrument's own settings, then a heading **Internal Nodes**, then a section for each node inside it (`skald-ui/src/components/ParameterPanel.tsx::ParameterPanel`). Scroll to the one labelled **Squelch LP** — that is the Filter. You should see Filter Type = `Lowpass`, an XY pad, Cutoff = **180** Hz and Resonance = **2.6**.

3. **Play it.** Sidebar → **Loop**, then **Play**. You should hear the classic acid sequence: each note starts bright and immediately collapses into a dark, rubbery thud. That collapse is the filter, not the volume.

4. **Prove the filter is doing the work.** With the sequence still running, drag the XY pad handle all the way to the **right** (cutoff → 20000). The squelch vanishes and you are left with a flat, buzzy sawtooth. Drag it all the way **left** (cutoff → 20). Almost nothing survives — a faint low thump. Now put it back to roughly one fifth from the left edge, around 180–200 Hz. *That* difference — buzz versus thud versus squelch — is the whole of subtractive synthesis in one gesture.

5. **Hear resonance.** Drag the pad handle straight **up** to the top (resonance → 20, the pad's ceiling). The whistle at the cutoff becomes a dominant screaming tone that swoops with every note, and the patch gets noticeably louder. Drag straight **down** to the bottom. The squelch turns into a dull "wub" with no pitch to it. Leave it around 3–4.

6. **Find the sweep, then take it away.** In the same panel, find the node labelled **Env 0-2600 Hz** — this is a Mapper that converts the 0…1 filter envelope into 0…2600 Hz and adds it to the filter's cutoff (`examples/instruments/leads/acid-303-squelch-lead.skald.json::outMax`). Set its **outMax** to **0**. The sequence goes completely static and lifeless: same notes, same volume envelope, zero character. Set it back to 2600, then try 800 (tame, dubby) and 5000 (extreme, whistling). This one number is the "envelope amount" knob every hardware synth has.

7. **Reshape the sweep.** Find the ADSR labelled **Squelch Env**. Its Decay is 0.16 s. Set Decay to **0.6** — the sweep now takes longer than a step at 130 BPM (a 1/16 note is 115 ms), so notes bleed into each other and the sequence becomes a slow rolling wash. Set it to **0.03** — a sharp click on every note. Put it back to around 0.16.

8. **Break it deliberately, part one: the resonance dead zone.** Set the filter's Cutoff to **180** exactly and its Resonance to **0.5** using the number box under the pad. Now type **0.1** (the documented minimum). Listen carefully: *nothing changes*. Then try **0.55**, then **0.9** — the change from 0.55 upward is audible, but everything at or below ~0.53 sounds identical. You have just found the internal damping ceiling of `1.9 − f` (`skald-backend/core/codegen_nodes.odin::generate_filter_code`). The takeaway: on this filter, "no resonance" and "a little resonance" are the same setting, and the slider's bottom third is decorative.

9. **Break it deliberately, part two: the cutoff ceiling.** Set the Mapper's **outMax** to **20000** and the filter Cutoff to **20000**. Naively, the filter should now be wide open and the sweep should be enormous. Instead the sound barely changes from where it was at 7 kHz, and the sweep loses most of its expression at the top end. That is the `sample_rate * 0.16` clamp (`skald-backend/core/codegen_nodes.odin::generate_filter_code`): at 48 kHz your cutoff never exceeds 7680 Hz no matter what you ask for. Now switch Filter Type to **Highpass** and leave cutoff at 20000. You would expect silence — a highpass above the entire audio band should pass nothing. You still hear plenty of the sawtooth's upper harmonics, because the filter is actually running a highpass at 7.68 kHz. **Skald's filter cannot mute a signal from either end.** Set the type back to `Lowpass`, cutoff back to 180, outMax back to 2600.

10. **Break it deliberately, part three: overload.** Set Resonance to **20** and drag the cutoff slowly across the middle of the pad while the loop runs. The resonant peak now boosts the signal by roughly 26 dB, and the master output soft-clips it with a `tanh` saturator (`skald-backend/core/codegen_project.odin::skald_soft_limit`). You will hear the sweep turn gritty and start to "square up" rather than getting cleanly louder. That grit is not the filter distorting — the filter is fine — it is the master stage protecting your speakers from what the filter handed it. Fix it the way you would on hardware: drop the Instrument's **volume** from 0.8 to about 0.4 and the sweep cleans up while staying just as sharp.

11. **See what you built.** Sidebar → **Select Output File**, then **Download Code**. Open the generated `.odin` and search for `Filter Node`. Everything you just heard is those nine lines.

## Why you patch it this way

The canonical subtractive chain is **Oscillator → Filter → ADSR (as VCA) → output**, and the acid example follows it exactly (`examples/instruments/leads/acid-303-squelch-lead.skald.json::connections`).

**Filter before the amp envelope, not after.** This is the ordering people get wrong most often. Put the amp envelope first and the filter second, and the filter is now processing an already-shaped signal — every note's decay is filtered identically and the filter's own resonant ring can outlast the note it belongs to, so you get ghost tails after the amp has closed. Filtering first means the amp envelope always has the last word on whether a voice is silent. Skald reinforces this: a voice stays alive as long as any ADSR is running (`skald-backend/core/codegen_processor.odin::generate_processor_code`), so an ADSR at the end of the chain is what defines the note's lifetime.

**Distortion after the filter, not before.** The acid patch puts the Overdrive last. Distortion generates new high harmonics; anything you distort after filtering gets brightness *added back*, which is what gives an acid line its bite. Distort first and the filter simply removes the harmonics you just paid for. Both orders are legal and both are used in real records — but "filter then drive" is aggressive, "drive then filter" is warm. Know which you asked for.

**Modulation reaches the filter through a Mapper.** An ADSR outputs 0…1; the filter's **Cut** port wants Hz. Wire them directly and you add at most 1 Hz to the cutoff, which is inaudible. That is what the `Env 0-2600 Hz` Mapper is for — it rescales 0…1 into 0…2600 Hz. The same applies to LFOs: an LFO's amplitude is specifically allowed to range up to 20000 for exactly this reason (`schema/nodes.json::amplitude`), so an LFO can drive a cutoff directly if you set its amplitude in Hz, but a Mapper is clearer and clamps at both ends (`skald-backend/core/codegen_nodes.odin::generate_mapper_code`).

**Cutoff modulation is additive, not absolute.** The knob is the floor and the modulator stacks on top: the generated expression is literally `(180.0) + (node_mapper_out)` (`skald-backend/core/param_utils.odin::get_f32_param`). So the knob sets where the sweep *starts* and the Mapper's `outMax` sets how far it travels. Several wires into **Cut** all sum, which is how `wobble-samplehold-bass.skald.json` gets both an LFO wobble and a stepped S&H jump on the same filter.

**One filter per voice is the default and usually right.** Because filter state is per-voice (`skald-backend/core/codegen_processor.odin::generate_processor_code`), a chord gets one independent sweep per note — which is what makes polyphonic filter plucks sound alive rather than pumping. Move the filter after a Delay or Reverb and you deliberately give that up in exchange for one shared filter on the summed mix, appropriate for filtering an effect tail but wrong for note-per-note expression.

## Going further

Concrete things to add, roughly in order of how much they buy you:

- **A second envelope with different timings.** You already have an amp ADSR and a filter ADSR in the acid patch. Give the filter envelope a much shorter decay than the amp's and you get a percussive attack transient on a sustaining note — the single most effective trick for making a synth sound "played" rather than "triggered".
- **Velocity to brightness.** The filter envelope in the example has `velocitySensitivity: 0.7` (`examples/instruments/leads/acid-303-squelch-lead.skald.json::velocitySensitivity`), which scales the envelope's output by note velocity (`skald-backend/core/codegen_nodes.odin::generate_adsr_code`). Because that envelope feeds the cutoff, harder notes are automatically brighter — exactly how a real instrument behaves. Raise it to 1.0 for a dramatic, dynamic patch; drop it to 0 for a machine-flat one.
- **An LFO into Cut, summed with the envelope.** Both wires land on the same port and add (`skald-backend/core/param_utils.odin::get_f32_param`). An LFO at 0.2 Hz with a Mapper range of ±300 Hz on top of an envelope sweep gives a slowly breathing pad that still has per-note articulation. BPM-sync the LFO for a rhythmic dubstep wobble.
- **Sample & Hold into Cut** for stepped random filtering — a different timbre on every step, with no sequencing work. `wobble-samplehold-bass.skald.json` is the reference.
- **Series filters for a steeper slope.** Skald's filter is 12 dB/oct. Chain two Lowpass filters at the same cutoff and you approximate a 24 dB/oct response — much more decisive, much more "Moog". Expose both cutoffs and drive them from the same Mapper so they track.
- **Parallel filters for formants.** Split one oscillator into two or three Bandpass filters at different cutoffs, sum them in a Mixer, and you have synthesised vowel formants. Skald's guitar patches (`funk-chop.skald.json`) do a two-band version of this. Fixed cutoffs give you a fixed vowel; modulating one of them gives you a talk-box.
- **Highpass in parallel with lowpass** to carve a hole without a Notch: send the same source into a Lowpass at 300 Hz and a Highpass at 3 kHz, mix them, and the midrange is scooped.
- **Filter after Reverb.** Put a Lowpass at ~2 kHz downstream of a Reverb (legal — `skald-backend/core/codegen_processor.odin::generate_processor_code`) and the tail becomes darker than the direct sound, which is how real rooms behave and instantly makes reverb sit better.
- **Modulate resonance too.** The `input_res` port is rarely used and it is a missed opportunity: an envelope that raises resonance briefly on each attack gives a "zap" that a cutoff sweep alone cannot.

## Under the hood

Skald generates a **Chamberlin state-variable filter** (SVF), an algorithm from Hal Chamberlin's *Musical Applications of Microprocessors* that is popular in synthesisers because all four responses fall out of the same two integrators simultaneously, and because cutoff and Q are independent and cheap to compute [Source: https://www.earlevel.com/main/2003/03/02/the-digital-state-variable-filter/].

The whole thing is nine lines, emitted by `skald-backend/core/codegen_nodes.odin::generate_filter_code`. Per sample:

```
cutoff_c = clamp(cutoff, 10.0, sample_rate * 0.16)      // :339
f        = 2 * sin(PI * cutoff_c / sample_rate)          // :340
q        = clamp(1.0 / max(resonance, 0.1), 0.05, 1.9-f) // :341

low  += f * band                                          // :343
high  = input - low - q * band                            // :344
band += f * high                                          // :345
```

`low` and `band` are the two persistent state variables — the filter's memory — stored per voice (`skald-backend/core/codegen_processor.odin::generate_processor_code`). Read them in different combinations and you get different filter shapes for free (`skald-backend/core/codegen_nodes.odin::generate_filter_code`):

- Lowpass = `low`
- Highpass = `high`
- Bandpass = `band`
- Notch = `high + low`

Intuitively: `f` is how far the filter "leans" toward the input each sample, and it is proportional to the cutoff frequency — a small `f` means the state changes slowly, so only slow (low-frequency) content gets through. `q` is **damping**, the amount of the band-pass state that gets subtracted back out; the smaller it is, the less the resonant loop is braked and the taller the peak at cutoff. That is why Skald's user-facing "resonance" is `1/q`.

The two clamps are the interesting part, and both were added after the naive version misbehaved (`skald-backend/core/codegen_nodes.odin::generate_filter_code`). The cutoff clamp of `sample_rate * 0.16` exists because this algorithm's stability boundary is where `f` reaches 1, at roughly one sixth of the sample rate — beyond it the integrator pair diverges to infinity, which was reproduced at cutoff 20000 on both 44.1 and 48 kHz. The `1.9 - f` ceiling on `q` exists because resonance values below 1 (perfectly legal in the UI) blew the filter up at cutoffs as low as 1.5 kHz. The `0.05` floor is a design decision rather than a stability one: it bounds the resonance so the filter rings hard but never runs away into self-oscillation.

The response is **12 dB per octave** — two poles, two integrators [Source: https://www.earlevel.com/main/2003/03/02/the-digital-state-variable-filter/]. There is no input attenuation term, unlike the reference implementation which multiplies the input by `q` to keep the level constant as resonance rises [Source: https://github.com/bdejong/musicdsp/blob/master/source/Filters/23-state-variable.rst], so in Skald resonance costs you headroom.

## Terms introduced

- **Harmonic** — a frequency component at a whole-number multiple of a sound's fundamental pitch. The mix of harmonics defines timbre.
- **Timbre** — the tonal colour of a sound; what distinguishes a trumpet from a flute at the same pitch and volume.
- **Subtractive synthesis** — building sounds by starting with a harmonically rich waveform and filtering harmonics away.
- **Filter** — a processor that attenuates part of the frequency spectrum and passes the rest.
- **Cutoff frequency** — the frequency at which a filter's attenuation reaches 3 dB; conventionally "where the filter is set".
- **Lowpass** — passes frequencies below cutoff, attenuates above. Makes sound darker.
- **Highpass** — passes frequencies above cutoff, attenuates below. Makes sound thinner.
- **Bandpass** — passes a band around cutoff, attenuates both above and below.
- **Notch / band-reject** — attenuates a band around cutoff, passes everything else.
- **Slope / roll-off** — how fast a filter attenuates past cutoff, in decibels per octave. Skald's filter is 12 dB/oct.
- **Pole** — one filter stage, contributing 6 dB/octave. A "2-pole" filter is 12 dB/oct.
- **Resonance (Q, emphasis)** — feedback that creates a boosted peak at the cutoff frequency, making the cutoff audible as a whistle.
- **Damping** — the inverse of resonance; how strongly the resonant feedback loop is braked. Skald computes `q = 1/resonance` internally.
- **Self-oscillation** — a filter with enough resonance to sustain a sine wave with no input. Skald's filter is deliberately clamped just short of this.
- **Filter envelope** — an envelope generator wired to cutoff, so brightness changes over the life of a note.
- **Envelope amount** — how far the filter envelope moves the cutoff, in Hz. In Skald this is the Mapper's `outMax`.
- **Formant** — a fixed resonant peak in a sound's spectrum, independent of pitch; what makes vowels distinguishable.
- **State-variable filter (SVF)** — a filter topology producing lowpass, highpass, bandpass and notch outputs simultaneously from the same two integrators.
- **Voice** — one independently-sounding note. Skald gives each voice its own copy of the filter's state.
- **Bus / bus domain** — the post-mix stage where a single shared copy of an effect processes the summed output of all voices.
- **Soft clipping** — limiting a too-loud signal with a smooth curve (`tanh`) rather than a hard cut, producing warm distortion instead of harsh crackle.

## Known issues

Defects that touch this chapter are tracked centrally in the **Known issues** chapter (`KNOWN-ISSUES.md`): KI-002, KI-006, KI-007, KI-037, KI-038. Deliberate design limits — things Skald does not do on purpose — are collected in **What Skald deliberately does not do**.
