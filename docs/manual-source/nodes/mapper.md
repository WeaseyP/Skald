# Mapper (Scale)

> A translator for modulation signals: it takes a wobble that swings between one pair of numbers and re-issues it swinging between a different pair of numbers, so the thing you are wobbling actually notices.

## What it is

Almost every source of movement in a synthesizer speaks in small numbers. An LFO cycles between -1 and +1. An envelope rises from 0 to 1 and falls back. A sample-and-hold spits out a fresh random number between -1 and +1 a few times a second. These are not measurements of anything — they are *shapes*, normalised so that one shape generator can be pointed at any destination.

The destinations, on the other hand, speak in real physical units. A filter cutoff lives in hertz, somewhere between about 20 Hz and 20,000 Hz. A delay time lives in seconds. A pitch offset lives in octaves. So when you take a shape that swings between -1 and +1 and wire it straight into a cutoff frequency that sits at 800 Hz, what you have asked for is a cutoff that wobbles between 799 Hz and 801 Hz. Mathematically that is exactly what you said. Musically it is silence. Nothing moved.

This is the oldest chore in synthesis, and analogue modular systems built hardware just for it. A modular patch cable carries a control voltage, and a *scalar* or *attenuator* multiplies that voltage — turn it down and the modulation gets shallower. An *offset* adds a fixed voltage, shifting where the movement is centred. An *attenuverter* does both and can flip the polarity, turning a rise into a fall [Source: https://noiseengineering.us/blogs/loquelic-literitas-the-blog/what-does-this-knob-do-attenuators-scalars-offsets-and-attenuverters/]. Every classic synth voice has these somewhere, usually hidden inside a knob labelled "env amount" or "LFO depth". Skald pulls that knob out into a node you can see and wire: the Mapper.

Think of it as a currency exchange with a hard credit limit. You hand it money in one currency (say, "anything between -1 and +1") and tell it what currency you want back ("hertz, between 150 and 1900"). It converts proportionally: the bottom of the input range buys the bottom of the output range, the top buys the top, the middle buys the middle. And because it is a *limit*, anything you hand it outside the declared input range is capped at the nearest edge rather than converted into something absurd.

That capping matters more than it sounds, because of a second distinction: **unipolar** versus **bipolar**. A bipolar signal swings both sides of zero — an LFO at -1 to +1, a pan control at -1 to +1. A unipolar signal only goes one way — an envelope at 0 to 1, an amplitude at 0 to 1. Point a bipolar source at a destination that expects unipolar and the negative half gets clipped away; point a unipolar source at a bipolar destination and you only ever use one side of the knob. Practitioners feel this constantly: a bipolar LFO on filter cutoff spends half its cycle *below* the resting cutoff, so if the cutoff is already low you hear nothing for half of every cycle, while a unipolar LFO opens the filter from the resting point upward and gives a much more satisfying sweep [Source: https://support.spectrasonics.net/manual/Omnisphere/edit_page/lfos/page09.html]. The Mapper is where you decide which of those two things you are building, by declaring the input range you are willing to accept.

There is a third thing going on, and Skald handles it in a way that will bite you if you do not know about it. Human pitch perception is *proportional*, not additive: 220 Hz to 440 Hz sounds like exactly the same distance as 440 Hz to 880 Hz, or 55 Hz to 110 Hz — each is one octave. Which is why analogue synths control frequency exponentially, at one volt per octave: each extra volt doubles the frequency, so equal voltage steps sound like equal musical steps [Source: https://northcoastsynthesis.com/news/exponential-converters-and-how-they-work/]. Linear control moves a parameter "an equal number of Hz up or down", exponential control moves it "an equal musical interval" [Source: https://cmtext.com/synthesis/chapter4_synthesis_concepts2.php]. Skald has **both**, and which one you get depends on where you plug the Mapper in. Oscillator pitch is exponential — the number you send is in **octaves** (`skald-backend/core/codegen_nodes.odin::generate_oscillator_code`). Filter cutoff is linear — the number you send is in **hertz**, added straight onto the knob value (`skald-backend/core/codegen_nodes.odin::generate_filter_code`, `skald-backend/core/param_utils.odin::get_f32_param`). Same Mapper, same numbers in the boxes, two completely different meanings. Learning to feel that difference is most of what this chapter is for.

## What it looks like in Skald

The Mapper lives in the node palette in the left sidebar, listed as **Mapper** with the tooltip "Rescales a modulation signal from one range to another (clamped)" (`skald-ui/src/components/Sidebar.tsx::paletteNodes`). Its full label in the node manifest is "Mapper (Scale)" (`skald-ui/src/definitions/node-definitions.ts::NODE_DEFINITIONS`). On canvas it is a pale-yellow card — yellow is Skald's colour for maths utilities, as opposed to purple for modulators and blue for filters (`skald-ui/src/components/Nodes/NodeStyles.ts::NODE_ACCENTS`).

It has exactly two handles:

| Handle | Side | Handle id | Label on canvas |
|---|---|---|---|
| Input | left | `input` | **In** |
| Output | right | `output` | **Out** |

Both are declared in `skald-ui/src/components/Nodes/MapperNode.tsx::MapperNode`, and the ids are the contract the code generator reads.

**One input port, and only one.** The backend validator lists the Mapper alongside Delay, Reverb, Distortion and the graph output as a "through" node whose only legal destination port is `input` (`skald-backend/core/graph_validate.odin::valid_input_ports`). That has a consequence people trip over: **you cannot modulate a Mapper's own range with a wire.** There is no `input_outMax` handle. If you want the output range to move at runtime you have to expose the parameter (see below) and drive it from your game code, not from another node.

Everything that produces a signal can feed it — LFO, Sample & Hold, ADSR, an oscillator, a filter, another Mapper. Everything that accepts a signal can receive from it. In practice you will almost always wire it into a modulation port: a Filter's `input_cutoff` or `input_res` (`skald-ui/src/components/Nodes/FilterNode.tsx::FilterNode`), an Oscillator's `input_freq`, a VCA's `input_gain`, a Panner's `input_pan`.

Multiple wires into the same `In` handle are **summed** before the Mapper sees them (`skald-backend/core/param_utils.odin::sum_port_inputs`), so two LFOs into one Mapper give you one combined shape that is then rescaled as a unit. And multiple Mappers can target the same destination port — they add together there too. The wobble bass in the exercise below does exactly that: two Mappers, both into one filter cutoff.

**Rate.** The Mapper is not a control-rate node. Its generated code runs once per output sample, inside whichever processing loop it lands in: the per-voice loop when it is part of an instrument, or the bus loop when it sits downstream of a Delay or Reverb — the same emission dispatch places it in either loop depending on which domain the graph analysis puts it in (`skald-backend/core/codegen_processor.odin::generate_processor_code` dispatching to `skald-backend/core/codegen_nodes.odin::generate_mapper_code`). It is a full audio-rate arithmetic node, which is why you can legally push an oscillator through it — see the "break it" step in the exercise for what that sounds like.

## The controls

Four numbers. Two describe the signal coming in, two describe the signal going out.

| Parameter | Range | Default | Unit | What it does to the sound |
|---|---|---|---|---|
| `inMin` (In Min) | -1,000,000 to 1,000,000 | 0 | none | The incoming value that should map to `outMin`. Anything at or below this is clamped to the floor of your output range. |
| `inMax` (In Max) | -1,000,000 to 1,000,000 | 1 | none | The incoming value that should map to `outMax`. Anything at or above this is clamped to the ceiling. |
| `outMin` (Out Min) | -1,000,000 to 1,000,000 | 0 | none | The value sent out when the input sits at `inMin`. In the destination's units — Hz for a cutoff, octaves for a pitch. |
| `outMax` (Out Max) | -1,000,000 to 1,000,000 | 20000 | none | The value sent out when the input sits at `inMax`. |

Ranges and defaults are authored once, in `schema/nodes.json` (`inMin`/`inMax`/`outMin`/`outMax` sit in its generic "Mapper / range nodes" group; `outMax` gets a Mapper-specific override), and rendered from there into both the exported clamp table the generator checks setters against (`skald-backend/core/param_ranges.generated.odin`) and the editor's stored defaults (`skald-ui/src/definitions/node-definitions.ts`, whose Mapper entry reads each value through `skald-ui/src/definitions/nodeSchema.generated.ts::schemaDefault` rather than a literal) — those are the values a Mapper gets when you drag one out of the sidebar. A staleness gate (`skald-ui/src/tests/contracts/NodeSchema.test.ts`) regenerates both rendered files from the schema and fails the moment a committed copy disagrees with it. Note that the generic row's own fallback defaults (`inMin`/`outMin` → 0, `inMax`/`outMax` → 1) are only used when a parameter is exposed but missing from the saved JSON (`skald-backend/core/codegen_nodes.odin::exposed_param_default`); they do not override what the UI writes.

A freshly placed Mapper's `outMax` of 20,000 aims at sweeping a filter cutoff across the whole audible range, but most of that travel is spent past the point where a Filter node stops responding — see **Known issues**, KI-032.

The unit column really is empty (`schema/nodes.json`, both the generic rows and the `outMax` override), and that is correct rather than sloppy: the Mapper has no idea what its output is going to mean. The same node outputs hertz in one patch and octaves in the next. **You** are the one who knows the unit, which is why naming your Mapper nodes descriptively pays off — the shipped examples do it, e.g. `"Steps 150-1900 Hz"` and `"Sweep 0-900 Hz"` (`examples/instruments/bass/wobble-samplehold-bass.skald.json`, its Mapper nodes).

### Where you edit them

Two surfaces, and — since packet B11 — they agree:

- **On the node itself**, four small number boxes: In Min and In Max step by 0.1, Out Min and Out Max step by 1 (`skald-ui/src/components/Nodes/MapperNode.tsx::MapperNode`). No `min` or `max` is passed, so these boxes accept anything you type (`skald-ui/src/components/common/NumberInput.tsx::NumberInput` only clamps when bounds are supplied).
- **In the Parameter Panel** (select the node, look right) and **in the sequencer's step editor**, both routed through the one shared component (`skald-ui/src/components/NodeParameterControls.tsx::NodeParameterControls`, the `'mapper'` case): four plain, unbounded number fields, one per parameter.

Before B11, the Parameter Panel rendered its own inline branch with four sliders whose Out Min/Out Max span was clamped to ±10,000 — narrower than the node's own 20,000 default, so opening a fresh Mapper in the panel and touching Out Max silently halved it on first contact. That branch, and the Mixer and MIDI Input branches beside it, are gone; `ParameterPanel.tsx`'s `renderNodeParameters` says so directly in a comment where the bypasses used to live. `NodeParameterControls` is the single path for every node type now, so the node card and the panel show the same unbounded range.

Use the on-node boxes when you want to stay on the canvas; use the panel when the node you are editing is buried inside an Instrument's "Internal Nodes" list. Either surface will happily take you to 20,000 and beyond — whether that number does anything once it reaches a destination is a separate question; see **Known issues**, KI-032.

### What you hear as you sweep each one

**Out Max** is the depth control, and it is the one you will touch most. Wired into a filter cutoff, dragging it up from `outMin` does nothing at first — a modulation range of a few tens of hertz on a bass sound is below the threshold at which the ear registers a filter as "moving". Somewhere past a few hundred hertz of span it stops being a wobble in timbre and becomes a wobble in *pitch content*: you start hearing individual harmonics of the sawtooth swim past the cutoff. Between roughly 1 kHz and 3 kHz of span you are in the classic aggressive-bass zone, where the sweep crosses the region the ear is most sensitive to. Push it past 4 or 5 kHz and the top of the sweep opens far enough that the filter effectively disappears at the peak — the wobble turns into a rhythmic *on/off* rather than a shape, and with resonance up it gets whistly and thin. Past about 7 kHz the filter's own stability clamp catches it and the top of your sweep silently stops moving (`skald-backend/core/codegen_nodes.odin::generate_filter_code`).

**Out Min** is the offset — the resting floor. Raising it lifts the whole modulation up without changing how far it travels: the bass gets brighter and more open overall but the wobble keeps the same *width*. This is the difference between "dark bass that occasionally opens up" and "bright bass with a bit of movement". Note that on a Filter, `outMin` is **added to** the cutoff you set on the filter node, not substituted for it (`skald-backend/core/param_utils.odin::get_f32_param`) — a filter at 160 Hz with a Mapper `outMin` of 150 rests at 310 Hz.

Setting **`outMin` higher than `outMax`** is legal and useful: it inverts the modulation. The shape now falls where it used to rise. On a triangle or sine LFO that mostly just shifts the timing; on a sawtooth LFO or an envelope it is night and day, turning a slow ramp with a hard snap-back into a hard attack with a slow decay. Skald ships this pattern — the growly sax patches map an envelope to `outMin`-high, `outMax`-zero to make a downward scoop, a Mapper node labelled "Scoop -0.12 to 0" with `outMin: -0.12, outMax: 0` (`examples/instruments/winds/growly-sax.skald.json::nodes`, and identically in `examples/instruments/winds/normal-sax.skald.json::nodes`).

**In Min and In Max** are where you declare what you are willing to accept, and they are the unipolar/bipolar decision. If your source is an LFO or a Sample & Hold, its output is bipolar, `-amplitude` to `+amplitude` (`skald-backend/core/codegen_nodes.odin::generate_lfo_code`, `skald-backend/core/codegen_nodes.odin::generate_sample_hold_code`) — so set `inMin` to -1 and `inMax` to 1 and you use the whole shape. If your source is an ADSR with nothing plugged into its own input, it outputs a clean unipolar 0-to-1 envelope scaled by note velocity (`skald-backend/core/codegen_nodes.odin::generate_adsr_code`) — so `inMin` 0, `inMax` 1.

Get this wrong and you hear it immediately, in a very specific way: with a bipolar source and `inMin` left at 0, the entire negative half of the source flattens onto `outMin`. On an LFO that means the sweep rises, hits bottom, and then just *sits there* for half of every cycle. On a Sample & Hold it means about half your random steps land on the identical value. This is exactly the clipping the modular world warns about when a bipolar source hits a unipolar input, and Skald reproduces it faithfully because of the clamp at `skald-backend/core/codegen_nodes.odin::generate_mapper_code`.

Narrowing the input window (say, `inMin` -0.5, `inMax` 0.5 on a full-swing LFO) is a legitimate creative move: it makes the shape *steeper*, because now the middle half of the source covers the entire output range and the outer quarters are pinned flat at the extremes. On a sine LFO this turns a smooth swell into something closer to a square with soft corners.

### What "expose" does, and why you would use it

Click the small link icon next to a parameter's label in the Parameter Panel and that parameter becomes part of the instrument's public API (`skald-ui/src/components/ParameterPanel.tsx::renderParameterControl`; the toggle itself is `skald-ui/src/components/ParameterPanel.tsx::toggleParameterExposure`). It is stored as a string in the node's `exposedParameters` array.

Concretely, at code-generation time this changes three things:

1. The value stops being baked in as a constant. Instead of pasting a literal into the DSP line, the generator emits a read from the processor struct — `p.<field>` (`skald-backend/core/param_utils.odin::get_f32_param`). Generate `examples/instruments/bass/wobble-samplehold-bass.skald.json` yourself to see both forms side by side in one line: its Mapper nodes expose `outMin`/`outMax` but not `inMin`/`inMax`, so the emitted lerp reads `math.lerp(f32(p.Sweep_0_900_Hz_outMin), f32(p.Sweep_0_900_Hz_outMax), math.clamp((f32(node_wob_lfo_out) - f32(f32(-1.000000000))) / in_range_wob_lfo_map, 0.0, 1.0))` — a struct field for the exposed pair, a literal for the unexposed one, in the same statement.
2. You get a typed setter with the clamp compiled in: `<Instrument>_set_outMax(p, value)`, which pins the value to the range from the table before storing it (`skald-backend/core/codegen_processor.odin::generate_processor_code`). For Mapper parameters that clamp is ±1,000,000 — wide enough that it will essentially never bite, which is deliberate: the range table cannot know what unit your Mapper is producing.
3. You get a row in the instrument's introspection table, `<Instrument>_PARAMS`, carrying the field name, min, max, default and unit, plus a string key alias of the form `"<node id>::<param>"` so tooling can address it without guessing the field name (both emitted by the same `skald-backend/core/codegen_processor.odin::generate_processor_code`).

**Why bother.** The Mapper is one of the highest-value things to expose, because a Mapper parameter is almost always a *musical intensity* control in disguise. Expose one filter Mapper's `outMax` and your game now has a single float that takes the bass from sullen to screaming — perfect for driving off combat intensity, player health, engine RPM or depth underwater. You do not need to expose the filter's cutoff, the LFO rate and the resonance separately and coordinate them; you expose the one number that controls how far the movement travels. The shipped wobble bass exposes `outMin` and `outMax` on both of its Mappers for exactly this reason (`examples/instruments/bass/wobble-samplehold-bass.skald.json::nodes`), and the acid lead exposes just `outMax` on its envelope Mapper — one knob for "how squelchy" (`examples/instruments/leads/acid-303-squelch-lead.skald.json::nodes`).

If two nodes expose a parameter with the same name, the generator renames the fields using each node's label to keep them distinct (`skald-backend/core/codegen_analysis.odin::build_instrument_plan`). Give your Mappers meaningful labels *before* you expose anything, or you will be calling `set_Mapper_outMax_2`.

## Try it (hands-on)

**Patch:** `examples/instruments/bass/wobble-samplehold-bass.skald.json`. Open it in Skald. It is a single Instrument node called "S&H Wobble Bass"; double-click it to see the eight nodes inside.

What is in there: a sawtooth Oscillator into a Lowpass Filter (cutoff 160 Hz, resonance 3) into an amp ADSR into a Distortion, then out. Off to the side, two modulation chains, both landing on the filter's **Cut** handle:

- **Stepped 1/8** (Sample & Hold, BPM-synced to eighth notes) → **Steps 150-1900 Hz** (Mapper, in -1..1, out 150..1900)
- **Smooth 1/4** (Triangle LFO, BPM-synced to quarter notes) → **Sweep 0-900 Hz** (Mapper, in -1..1, out 0..900)

The session runs at 140 bpm with a four-note bass pattern (`examples/instruments/bass/wobble-samplehold-bass.skald.json::session`). Before you touch anything: **the filter's own cutoff of 160 Hz is not replaced by the Mappers — it is added to.** Modulation into a parameter port sums with the knob value (`skald-backend/core/param_utils.odin::get_f32_param`). So the real cutoff ranges from 160 + 150 + 0 = **310 Hz** at the bottom to 160 + 1900 + 900 = **2960 Hz** at the top.

Everything you hear in the editor is the actual exported code: Skald compiles the generated Odin to WebAssembly and plays *that* (`skald-ui/src/hooks/nodeEditor/useWasmAudioEngine.ts::useWasmAudioEngine`). There is no separate preview engine to disagree with your export.

1. **Play the pattern.** Hit play on the sequencer and let it loop. Listen for two layers of movement: a jittery eighth-note *step* in brightness (that is the Sample & Hold) riding on a slower quarter-note *swell* (that is the triangle LFO). Get them separated in your head before changing anything.

2. **Find the depth control.** Click the Mapper labelled **Steps 150-1900 Hz**. Its four boxes read In Min -1, In Max 1, Out Min 150, Out Max 1900.

3. **Collapse the range.** Change **Out Max** from 1900 to **200**. The stepped layer almost vanishes — the steps are still firing at exactly the same rate, but each one now shifts the cutoff by at most 50 Hz instead of 1750, which is far too little for the ear to read as movement. (The slow LFO swell is untouched and keeps going; listen past it.) This is the whole reason the Mapper exists: a modulation signal that isn't scaled to the destination's units is a modulation signal you cannot hear. See **Known issues**, KI-013, for a shipped patch — one with "wobble" right in its name — that this exact mistake happens to by accident.

4. **Overshoot it.** Now push **Out Max** to **6000**. The steps become violent: each eighth note jumps to a completely different timbre, from muffled thud to open buzz, with the resonance at 3 giving each step a distinct pitched ping. Somewhere around 2000-3000 was probably the musical sweet spot for this bass — put it back to **1900** and confirm.

5. **Move the floor.** Change **Out Min** from 150 to **900**. The steps still happen, but the whole layer has been lifted: the quietest step now sits at 1060 Hz instead of 310 Hz, the bass loses its weight and reads as a mid-range synth part. (The travel has narrowed too, from 1750 Hz to 1000 Hz — to move the floor while keeping the width, raise `outMax` by the same amount you raised `outMin`. Try Out Min 900 / Out Max 2650 and hear the difference between "lifted" and "lifted and still as wide".) Drop **Out Min** to **0** and it goes muddy and closed. Return it to **150** and Out Max to **1900**.

6. **Break it — bipolar into a unipolar window.** Change **In Min** from -1 to **0**, leaving In Max at 1. Listen carefully: roughly half the steps now land on the *same* dull value. What happened is that the Sample & Hold still outputs numbers across -1 to +1, but you told the Mapper that anything at or below 0 maps to `outMin`, and the clamp at `skald-backend/core/codegen_nodes.odin::generate_mapper_code` pins every negative sample to the floor. This is the bipolar-source-into-unipolar-input clipping the modular world warns about, and it is why the shipped patch declares In Min as -1. Set it back to **-1**.

7. **Break it harder — the degenerate range.** Set **In Min** to **1** so that In Min and In Max are both 1. The stepped layer freezes completely; only the slow LFO swell remains. Here is why, and it is worth understanding: the generator computes `in_range = inMax - inMin`, which is now zero, so it substitutes 1.0 rather than dividing by zero (`skald-backend/core/codegen_nodes.odin::generate_mapper_code`). The normalised position then becomes `clamp((input - 1) / 1, 0, 1)`, and since the Sample & Hold never exceeds 1, that is always 0 — so the output is stuck at `outMin` forever. A Mapper with a zero-width input range is a constant generator. Set In Min back to **-1**.

8. **Invert a shape.** Click the LFO labelled **Smooth 1/4** and change its **Wave** from Triangle to **Sawtooth**. You now hear a slow ramp up in brightness that snaps back hard once per beat. Now click the Mapper labelled **Sweep 0-900 Hz** and swap its output bounds: **Out Min 900**, **Out Max 0**. The ramp reverses — a hard bright attack that falls away. Same LFO, same rate, opposite gesture. This is what an attenuverter's negative half does in a modular rack, and it costs you nothing here but two typed numbers.

9. **Break it — hit the filter's ceiling.** Put Out Min/Out Max back to **0** and **900**, and set the LFO waveform back to **Triangle**. Now set that Mapper's **Out Max** to **12000**, on the node card or in the Parameter Panel — both are unbounded number fields now, so either works. The top of the sweep should reach 160 + 1900 + 12000 ≈ 14 kHz — but it does not. The filter clamps its cutoff to `sample_rate * 0.16` for stability, about 7 kHz at 44.1 kHz or 7.7 kHz at 48 kHz (`skald-backend/core/codegen_nodes.odin::generate_filter_code`), because a Chamberlin state-variable filter diverges to infinity above roughly a sixth of the sample rate. What you hear is the sweep rising and then *flat-topping* — a chunk of every cycle where the number in your Mapper is changing but the sound is not. The lesson: the number in the box is a request, and the destination gets the final say.

10. **Break it — put audio through it.** Undo back to a working state first. Now drag the wire from the Oscillator's Out into the **Steps** Mapper's In (replacing the Sample & Hold), and take the Mapper's Out into the Filter's **In** port. You will hear a loud, buzzy, badly distorted mess with an enormous DC offset. That is correct behaviour, not a bug: the Mapper is doing to a ±0.65 audio waveform exactly what it does to a modulation signal — squashing it into the 150-to-1900 range, which is 1750 units of gain and an offset a thousand times larger than the speaker cone can survive. Turn your monitors down before this step. Undo it. The Mapper *can* process audio at audio rate; it just has no business doing so at these numbers.

11. **Restore.** Undo everything back to In -1/1, Out 150/1900 on the Steps Mapper and In -1/1, Out 0/900 on the Sweep Mapper, and listen again. The original settings should now sound like a set of deliberate decisions rather than arbitrary numbers.

## Why you patch it this way

The Mapper always sits **between a shape source and a parameter port**, and that position is the whole idiom:

```
[LFO | S&H | ADSR]  -->  [Mapper]  -->  [Filter.Cut | Osc.Freq | VCA.Gain | Panner.Pan]
```

Skald's examples use it in three recurring shapes.

**Envelope → cutoff, the filter-envelope voice.** An ADSR with nothing wired into its input emits a unipolar 0-to-1 curve scaled by note velocity (`skald-backend/core/codegen_nodes.odin::generate_adsr_code`). A Mapper turns that into hertz. This is how the acid lead is built: a fast decay envelope (attack 4 ms, decay 160 ms, sustain 0.12) through a Mapper set to `in 0..1, out 0..2600`, into a filter resting at 180 Hz with resonance 2.6 (`examples/instruments/leads/acid-303-squelch-lead.skald.json::nodes`). Each note therefore opens the filter to about 2780 Hz and slams it shut again in a sixth of a second — that snap is the entire 303 squelch. The classic recipe practitioners describe for this sound is exactly that: cutoff low, resonance nearly maxed, and a high positive envelope amount [Source: https://articles.roland.com/beyond-acid-pushing-the-tb-303-into-new-sonic-territory/]. In Skald, "envelope amount" *is* the Mapper's `outMax`. Note the input range: `0..1`, not `-1..1`, because the source is unipolar. Getting that one number right is the difference between a working filter envelope and one that spends its life clamped.

**Envelope → pitch, the drum transient.** Here the exponential path matters. The shipped kick is a fixed-pitch 50 Hz sine with a very short second envelope (decay 60 ms) through a Mapper set to `in 0..1, out 0..2.5`, wired into the oscillator's `input_freq` (`examples/instruments/drums/kick-sequenced.skald.json::nodes`). Because oscillator frequency modulation is exponential — `freq = base * 2^input` (`skald-backend/core/codegen_nodes.odin::generate_oscillator_code`) — that "2.5" is **2.5 octaves**, not 2.5 Hz. The kick starts at 50 × 2^2.5 ≈ 283 Hz and drops to 50 Hz in 60 ms. That is the whole click-and-thump of a synthesized kick drum, produced by one Mapper with the number 2.5 in it. If you wire the same Mapper into a filter cutoff instead, 2.5 means 2.5 hertz and nothing happens. **Always ask what unit the destination speaks before you pick your output numbers.**

**Bipolar modulator → cutoff, the wobble.** LFO or Sample & Hold, `in -1..1`, out into a hertz range, as in the exercise patch. Two of these stacked on one cutoff give you a fast layer and a slow layer that phase against each other, which is why the shipped wobble bass sounds alive rather than mechanical.

**Order matters in two places.**

First, the Mapper's clamp only protects what passes *through* it. If you run two modulators into one Mapper (summing at its `In` port) and then rescale, you are rescaling the *sum*, and the two sources fight for the same output range — turn one up and the other loses headroom. If you give each source its own Mapper and let them add at the destination, each keeps its own independently-scaled contribution and their ranges *add*. The exercise patch does the second thing on purpose, which is why its total cutoff span is 310–2960 Hz rather than 310–2060 Hz.

Second, the Mapper's output is **added to** the destination knob, never substituted for it (`skald-backend/core/param_utils.odin::get_f32_param`). People forget this and end up with a filter that never gets dark because the filter node itself is still sitting at 2 kHz. If you want the Mapper to be in complete control of a parameter, set the destination node's own value near the bottom of your intended range — the shipped patches all set the filter cutoff low (160 Hz, 180 Hz) and let the Mapper supply the movement. Every modulation port in Skald works this way — there is no per-edge depth knob independent of this add — see **What Skald deliberately does not do**, "Modulation adds; there is no per-edge amount".

Third — a non-order rule, but the same class of mistake — do not put a Mapper on the audio path between two audio nodes. It will clamp your waveform to a range and add a DC offset. That is step 10 of the exercise, and it sounds like a broken speaker.

## Going further

**Modulate the Mapper's range from your game.** Expose `outMax` and drive it from a game variable. One float, sent from your engine to `<Instrument>_set_outMax`, turns intensity into timbre. This is the single most useful thing a Mapper can do for a game soundtrack, and it works because the setter is compiled into the exported Odin (`skald-backend/core/codegen_processor.odin::generate_processor_code`) rather than being an editor-only convenience.

**Chain Mappers.** A Mapper's output is a signal like any other, so a second Mapper can rescale it again. The useful pattern is *normalise then denormalise*: first Mapper takes some awkward source range down to a clean 0..1, second Mapper takes 0..1 up to whatever the destination needs. It costs one extra node and makes both stages readable six months later.

**Split one source into several destinations with different depths.** Wire one LFO's Out into three Mappers: one to filter cutoff (out 0..1200 Hz), one to the oscillator's Freq (out 0..0.04 — remember, octaves; 0.04 octaves is about 48 cents of vibrato), one to a Panner's Pan (out -0.6..0.6). Now one gesture moves brightness, pitch and stereo position together, each by a musically appropriate amount. That coordinated multi-destination movement is what makes a patch feel like an instrument rather than a stack of effects.

**Layer fast and slow.** Two modulation chains onto one destination, at different rates, is the cheapest way to defeat the mechanical feel of a single LFO. The exercise patch uses eighth-note steps plus a quarter-note swell. Try adding a third at a whole note with a small range (out 0..300) for a slow breathing motion underneath.

**Use an envelope Mapper and an LFO Mapper on the same filter.** The envelope gives per-note articulation; the LFO gives continuous motion. Because they add at the destination, the LFO rides on top of whatever the envelope is currently doing. Set the envelope's Mapper wider than the LFO's (say out 0..2000 versus out 0..400) so notes read as events and the LFO reads as texture.

**Invert one of a pair.** Two Mappers from the same source, one with `outMin < outMax` and one with `outMin > outMax`, pointed at two different destinations, give you a see-saw: as the filter opens the pitch falls, or as one oscillator's level rises the other's drops. That is a classic crossfade gesture and it is two nodes.

**Why not just turn up the LFO's Amount instead?** Two reasons. The LFO's on-canvas Amount field is capped at 10 (`skald-ui/src/components/Nodes/LFONode.tsx::LFONode`), which is nowhere near the thousands of hertz a cutoff sweep needs — though note the exposed-parameter range for LFO amplitude goes to 20,000 (`schema/nodes.json`'s LFO `amplitude` override, rendered into `skald-backend/core/param_ranges.generated.odin::PARAM_RANGE_OVERRIDES`). More importantly, amplitude scaling is symmetric around zero: it can make a shape bigger or smaller but it cannot *offset* it. A Mapper gives you scale and offset and inversion and clamping in one node. Use the LFO's Amount for the final trim, the Mapper for the range.

## Under the hood

The whole node is five lines of generated Odin. Here is what `generate_mapper_code` emits (`skald-backend/core/codegen_nodes.odin::generate_mapper_code`) — generate `examples/instruments/drums/kick-sequenced.skald.json` yourself to reproduce it (reformatted here for readability; the generator writes it as a single un-indented run with every literal at nine decimal places):

```odin
// --- Mapper Node kick_pitch_mapper ---
{
    in_range_kick_pitch_mapper: f32 = f32(f32(1.0)) - f32(f32(0.0));
    if in_range_kick_pitch_mapper == 0.0 do in_range_kick_pitch_mapper = 1.0;
    node_kick_pitch_mapper_out = math.lerp(
        f32(f32(0.0)), f32(f32(2.5)),
        math.clamp((f32(node_kick_pitch_envelope_out) - f32(f32(0.0))) / in_range_kick_pitch_mapper, 0.0, 1.0));
}
```

The doubled `f32(f32(...))` is real, not a transcription error: `get_f32_param` already wraps an unexposed literal in an `f32(...)` cast, and `generate_mapper_code` wraps it again before pasting it into the lerp call. Harmless — Odin allows a redundant cast — but a reader diffing generated output against this excerpt should expect it.

In ordinary algebra:

```
t   = clamp( (input - inMin) / (inMax - inMin), 0, 1 )
out = outMin + t * (outMax - outMin)
```

Two details are worth pulling out.

**The clamp is on `t`, not on the output.** The generator clamps the *normalised position* to 0..1 before interpolating (`skald-backend/core/codegen_nodes.odin::generate_mapper_code`). Because linear interpolation between `outMin` and `outMax` with `t` in 0..1 can never leave that interval, the output is guaranteed to stay inside your declared output range no matter what arrives at the input — including inverted ranges where `outMin > outMax`. That guarantee is why the sidebar calls it "clamped", and it is what makes the Mapper safe to put in front of a parameter that would misbehave at extreme values.

**The zero-range guard.** `inMax == inMin` is one keystroke away in the UI, and it would be a division by zero — a *compile* error when both are literals, and a NaN that silently poisons the rest of the voice when either is exposed. So the generator forces `in_range` to 1.0 in that case, which collapses the `clamp` to always read the input as sitting at its own floor, and the lerp then always resolves to `outMin` (`skald-backend/core/codegen_nodes.odin::generate_mapper_code`). You heard this in step 7 of the exercise.

There is a third detail that is pure Odin trivia but explains the odd-looking `f32(...)` wrappers everywhere: a bare numeric literal in Odin is an *untyped* constant, and a local declared with `:=` from an all-literal expression would default to `f64`, which then fails to compile against the `f32` signal path. The Mapper's `in_range` was one of three sites where this bit, which is why every parameter now goes through `emit_f32_local` and `f32_literal` (`skald-backend/core/param_utils.odin::emit_f32_local`, `skald-backend/core/param_utils.odin::f32_literal`, and the comment at `skald-backend/core/codegen_nodes.odin::generate_mapper_code`).

Finally: node evaluation order is solved for you. The generator topologically sorts the graph before emitting (`skald-backend/core/graph_utils.odin::topological_sort`), so a Mapper is always computed before whatever reads it, regardless of where you dropped it on the canvas. Feedback loops are rejected as a hard error rather than producing a one-sample delay.

## Terms introduced

- **Modulation signal** — a signal used to change a parameter rather than to be heard directly. LFOs, envelopes and sample-and-holds produce them.
- **Range scaling** — multiplying a signal so that it spans the values a particular destination actually responds to.
- **Offset** — adding a constant to a signal, moving where its movement is centred without changing how far it travels. The Mapper's `outMin` is an offset.
- **Attenuator / scalar** — a hardware control that multiplies a control voltage down. The Mapper's `outMax - outMin` span is the equivalent.
- **Attenuverter** — an attenuator that can also invert polarity. A Mapper with `outMin > outMax` is doing this.
- **Unipolar** — a signal that only moves one side of zero, typically 0 to 1. Envelopes are unipolar.
- **Bipolar** — a signal that swings both sides of zero, typically -1 to +1. LFOs and sample-and-holds are bipolar.
- **Clamping** — hard-limiting a value at a boundary instead of letting it continue. The Mapper clamps its input position to 0..1, so out-of-range inputs pin to the nearest output edge.
- **Normalised value** — a value expressed as a fraction of a range, 0 meaning the bottom and 1 the top. The Mapper's internal `t`.
- **Linear interpolation (lerp)** — moving proportionally between two endpoints. `lerp(a, b, t) = a + t*(b - a)`.
- **Linear frequency control** — a change in the control value adds a fixed number of hertz. Skald's filter cutoff modulation is linear.
- **Exponential frequency control / volt-per-octave** — a change in the control value multiplies the frequency, so equal steps sound like equal musical intervals. Skald's oscillator pitch modulation is exponential; the modulation value is measured in octaves.
- **Control rate vs audio rate** — control-rate signals update occasionally; audio-rate signals update every sample. Skald's Mapper runs at audio rate.
- **Degenerate range** — an input range of zero width, where the mapping is undefined. Skald substitutes 1.0 and outputs `outMin`.
- **DC offset** — a constant added to an audio waveform, pushing it off centre. Putting audio through a Mapper produces a large one.
- **Exposed parameter** — a parameter promoted into the generated instrument's public API so game code can set it at runtime.

## Known issues

Defects that touch this chapter are tracked centrally in the **Known issues** chapter (`KNOWN-ISSUES.md`): KI-013, KI-032, KI-033, KI-037. Deliberate design limits — things Skald does not do on purpose — are collected in **What Skald deliberately does not do**.
