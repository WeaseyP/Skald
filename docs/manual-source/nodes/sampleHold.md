# Sample and Hold

> A dice-roller on a metronome: at a steady tick it picks a new random number, holds it perfectly still until the next tick, and you point that staircase of numbers at anything you want to jump around.

## What it is

Almost every modulator you have met so far moves *smoothly*. An envelope glides from silence up to full and back down. An LFO traces a continuous curve. Sample and hold does the opposite: it produces a **staircase**. Its output is flat, then it jumps, then it is flat again. Nothing in between.

The original hardware is almost embarrassingly simple — a switch and a capacitor. A clock sends a pulse; the switch closes for an instant; the capacitor charges up to whatever voltage is sitting on the input at that exact moment; the switch opens and the capacitor holds that voltage, because the charge has nowhere to go. The output stays frozen there until the next clock pulse re-opens the switch and a new snapshot replaces it [Source: https://www.soundonsound.com/techniques/sample-hold-sample-rate-converters-1]. Two words, two jobs: **sample** (take a snapshot) and **hold** (keep it steady).

What makes it musically interesting is *what you feed the input*. If you sample a slow sine wave you get a staircase that climbs and falls in an orderly way. But the classic patch — the one everyone means when they say "S&H" — is sampling **white noise**. Noise is a signal whose value at any instant is unpredictable, so each snapshot is an independent random number, and the output becomes a stream of random steps arriving at a perfectly regular rate. That combination is the whole trick: *random in value, rigid in time*. It sounds deliberate and mechanical and unpredictable all at once, which is why it is the sound of every 1970s sci-fi computer, every bubbling analogue sequence, and the filter jumps in Emerson, Lake & Palmer's *Karn Evil 9* [Source: https://github.com/micjamking/synth-secrets/blob/master/part-16.md].

Skald's S&H node has that noise source **built in**. There is no signal input to patch — the node *is* a clock plus a noise source plus the hold, welded together (`skald-backend/core/graph_validate.odin:57-58` lists `SampleHold` among the types that are "sources only — no modulation inputs"). You get one knob for how fast the dice are rolled, and one for how big the numbers are.

Two things follow from the staircase shape, and they matter more than they sound like they should.

**First: a held step is a rectangle, and rectangles are full of high frequencies.** In DSP terms this is a *zero-order hold* — holding the last value until a new one arrives is mathematically the same as convolving the samples with a rectangular pulse one hold-period wide. The sharp vertical discontinuity at each step edge contains energy far above the step rate, and in the frequency domain the whole spectrum gets shaped by a `sin(πx)/(πx)` (sinc) curve with nulls at multiples of the hold rate [Source: https://www.dspguide.com/ch3/3.htm]. At slow rates you never notice — the corners are far below hearing. At fast rates you very much do: the steps stop reading as rhythm and start reading as *timbre*, a gritty, gravelly, bit-crushed quality. This is exactly the mechanism behind sample-rate-reduction ("bitcrush") effects, and Skald's S&H will do it to you if you push the Rate up.

**Second: real S&H modules almost always sit next to a slew limiter.** A slew limiter is a one-pole lowpass filter for control voltages — it slows down how fast the signal is allowed to change, so the corners get rounded and the staircase turns into a lumpy, organic wander. Hardware makers pair the two deliberately: S&H plus slew "can produce excellent fluctuating, smooth random voltages, ideal for adding in small amounts... to 'humanise' VCO pitch, PWM or wavetable selection" [Source: https://ajhsynth.com/SampleHold.html]. **Skald's S&H node has no slew, no glide, and no smoothing parameter.** Every transition is instantaneous. Know that going in: if you want smooth random motion in Skald you get it a different way (see *Going further*), and if you want *hard* stepped motion, this node gives you exactly that with no fighting.

## What it looks like in Skald

**Where it lives.** Drag it in from the sidebar palette, listed as **S & H** with the tooltip "Sample & hold — stepped random modulation. Can sync to BPM." (`skald-ui/src/components/Sidebar.tsx:267`). On the canvas it wears a deep purple accent — the colour Skald reserves for stepped modulators (`skald-ui/src/components/Nodes/NodeStyles.ts:92`).

**Handles.** One output, no inputs:

| Handle | Direction | Id | Label on the card |
| --- | --- | --- | --- |
| Out | output | `output` | `Out` |

That is the entire port list (`skald-ui/src/components/Nodes/SampleHoldNode.tsx:9`). The backend agrees and enforces it: `valid_input_ports` returns `nil` for `SampleHold`, and the validator will refuse to generate a patch if you somehow hand-edit a wire *into* one (`skald-backend/core/graph_validate.odin:57-58`, `skald-backend/core/graph_validate.odin:131-152`). So you cannot clock it from another node, you cannot feed it your own signal to sample, and you cannot modulate its rate with an LFO. Its clock and its noise are internal.

**What it can connect to.** The `output` handle is an ordinary mono signal, so it can be wired anywhere a signal is accepted: an Oscillator's `input_freq`, a Filter's `input_cutoff` or `input_res`, a Gain's `input_gain`, a Panner's `input_pan`, a Mapper's `input`, an FM Operator's `input_mod`, or straight into the Output if you want to hear the staircase itself as audio. Every one of those ports *sums* its incoming wires with the node's own knob value — `get_f32_param` emits `(base) + (wire1) + (wire2)` (`skald-backend/core/param_utils.odin:138-156`). That is the single most important thing to internalise: **S&H modulation is added on top of the knob, never instead of it.** A filter with cutoff 160 Hz and an S&H-driven Mapper producing 150–1900 Hz ends up sweeping 310–2060 Hz, not 150–1900 Hz.

**Rate domain.** The node itself runs at *audio rate* — the counter in the generated code ticks once per sample, every sample (`skald-backend/core/codegen.odin:396`). What it *outputs* only changes at the step rate, so functionally it behaves as a control-rate modulator, but there is no block-rate approximation anywhere: a step boundary lands on an exact sample. That is why cranking the Rate into the hundreds of Hz produces genuine audio-rate steps and genuine audible grit, rather than smearing into nothing.

**Voice domain vs bus domain.** By default S&H lives in the **voice domain**: every voice of a polyphonic instrument gets its own counter, its own held value, and its own random-number generator, each seeded differently (`skald-backend/core/codegen.odin:1281-1284` for the per-voice state, `skald-backend/core/codegen.odin:1298-1312` for the per-voice seeding). Play a four-note chord and you get four *independent* staircases — the notes scatter, they do not step in lockstep. If instead you wire the S&H downstream of a Delay or Reverb, it moves to the bus domain, gets a single shared instance on the processor, and every voice hears the same steps (`skald-backend/core/codegen.odin:1319-1322`, `skald-backend/core/codegen.odin:1931-1932`). Both are legal. Choose deliberately.

One more behaviour worth knowing now, because it will surprise you later: **the S&H is not reset when a note starts.** The `note_on` reset block clears oscillator phase, filter state and distortion tone for fresh voices, but `SampleHold` is not in that list (`skald-backend/core/codegen.odin:1411-1435`). And the voice loop skips inactive voices entirely (`skald-backend/core/codegen.odin:1740`), so the counter only advances while that voice is *sounding*. The practical result: the step pattern is never phase-locked to your notes or your bar line. Every pass through a loop gives you different numbers. That is usually the point — but if you were expecting a repeatable pattern, this is why you are not getting one.

## The controls

| Parameter | Range | Default | Unit | What it does to the sound |
| --- | --- | --- | --- | --- |
| `rate` | 0.1 – 1000 | 10 | Hz | How often a new random number is drawn. Low = slow lurching changes; high = audio-rate grit. Ignored entirely when BPM Sync is on. |
| `amplitude` ("Amount") | 0 – 10 on the node card; **0 – 1 once exposed** | 1.0 | — (bipolar multiplier) | How far each step swings either side of zero. The raw step is in [-1, +1); Amount scales it. |
| `bpmSync` | on / off | off | — | Replaces the Hz rate with a musical division locked to project tempo. |
| `syncRate` | `1/1`, `1/2`, `1/2t`, `1/4`, `1/4t`, `1/8`, `1/8t`, `1/16`, `1/16t`, `1/32`, `1/32t`, `1/64`, `1/64t` | `1/8` | note value | The musical division used when BPM Sync is on. Trailing `t` = triplet. |

Sources for those numbers: defaults at `skald-ui/src/definitions/node-definitions.ts:65-71`; the type at `skald-ui/src/definitions/types.ts:56-59`; the node-card control bounds at `skald-ui/src/components/Nodes/SampleHoldNode.tsx:13-14`; the codegen-enforced clamp for `rate` at `skald-backend/core/param_ranges.odin:32-33`; the clamp for `amplitude` at `skald-backend/core/param_ranges.odin:86-87` (S&H has no override, so it inherits the generic amplitude range); the sync-rate list at `skald-ui/src/definitions/bpm.ts:33-42`.

### Rate — what you actually hear as you sweep it

At **0.1 Hz** a new number arrives once every ten seconds. Pointed at a filter cutoff this is not modulation at all, it is *variation*: each phrase you play sits at a slightly different brightness than the last, and nothing moves inside a phrase. Genuinely useful for making a repeated pad or a repeated gunshot SFX stop sounding like a copy-paste. Nobody hears a modulator; they hear "this take is alive".

From about **0.5 to 8 Hz** is the classic zone and where you will spend most of your time. Here the steps read as *rhythm*. Around 2–5 Hz you get the bubbling, burbling analogue-computer sound. Push toward 8–15 Hz and the individual steps start to blur into a texture — you can still count them but only just.

From roughly **20 to 60 Hz** you cross the rhythm/pitch boundary. The steps are now arriving faster than your ear resolves as separate events, and instead of hearing "jumps" you hear a *buzz* whose fundamental is the step rate. Modulating a filter cutoff up here generates sidebands around the harmonics of whatever you are filtering — it is very close to ring modulation and it sounds electronic and aggressive.

Above about **100 Hz** you are firmly in bit-crush territory. Remember the zero-order-hold sinc argument from *What it is*: each step edge is a rectangular discontinuity, and at these rates its harmonics are all over the audible band. The modulation stops sounding like modulation and starts sounding like *distortion of the thing being modulated*. There is a real musical use for this (grimy, digital, broken-hardware textures) but it is a texture, not a movement.

Two things to know about the top of the range. First, the useful ceiling is lower than the control suggests: the step interval is computed as `u64(sample_rate / rate)` — an integer number of samples (`skald-backend/core/codegen.odin:399`) — so the actual rate quantises. Ask for 700 Hz at 48 kHz and you get `u64(68.57) = 68` samples, i.e. 705.9 Hz. Below ~100 Hz the error is negligible; above it, the number you type is a request, not a promise. Second, the Rate box only appears on the node card when BPM Sync is **off** (`skald-ui/src/components/Nodes/SampleHoldNode.tsx:13`) — Skald hides controls that would be inert, because an editable control that does nothing is a lie.

### Amount — what you actually hear as you sweep it

`amplitude` is a plain multiplier on a bipolar value. Each held step is drawn uniformly from **[-1, +1)** (`skald-backend/core/codegen.odin:401`) and then multiplied by Amount (`skald-backend/core/codegen.odin:404`). It is *not* a 0-to-1 "wet" control — it is a ± depth.

At **0** the node outputs a constant zero. Note what that means downstream: zero is not "no effect", it is "the middle of the range". Feeding zero into a Mapper set to 150–1900 Hz produces a rock-steady 1025 Hz, not 150 Hz.

At small values (**0.05 – 0.2**) you get the humanising use — detune each note by a few cents, nudge pulse width, jiggle a wavetable position. The listener does not perceive randomness; they perceive that the instrument is not a machine. This is where S&H does its quietest and best work.

At **1.0** (the default) you get the full ±1 swing, which is exactly the range every Mapper in the stock examples is calibrated for (`inMin: -1, inMax: 1`). Unless you have a reason, leave it at 1 and shape the depth at the Mapper instead — the Mapper's output range is in the *real* units of the destination (Hz, cents, whatever), so it is far easier to reason about.

Above **1.0** the node card will happily let you go to 10, and this is where things get subtle. If Amount is **not** exposed, the codegen emits the literal you typed with no clamp (`skald-backend/core/param_utils.odin:105-112`) and you really do get ±10. Downstream Mappers then clamp the out-of-range excursions (`skald-backend/core/codegen.odin:703`), which collapses your smooth spread of random steps into a mostly-two-state coin flip between the extremes. If Amount **is** exposed, it is clamped to 1.0 at runtime and anything above 1 does nothing at all. See *Code-vs-intent notes*.

### BPM Sync

Flip the toggle and the Rate box is replaced by a note-division dropdown. The generated code stops using your Hz value entirely and computes the interval from project tempo: `bpm_sync_seconds_expr` returns `((60.0 / p.bpm) * beats)` where a whole note is 4 beats and a trailing `t` multiplies by 2/3 (`skald-backend/core/codegen.odin:28-51`), and `generate_sample_hold_code` inverts it into a rate (`skald-backend/core/codegen.odin:391-393`). At 140 BPM, `1/8` gives `(60/140) × 0.5 = 0.214 s` per step — about 4.67 steps a second.

Because it reads `p.bpm` at runtime rather than baking a number, a synced S&H follows tempo changes in the exported asset. That is the reason to prefer it over typing Hz whenever the steps are meant to be musical.

The caveat from earlier applies with force here: **synced means the step *period* matches the grid, not the step *phase*.** There is no transport reset, so your 1/8-note steps will be 1/8 notes long but they will not necessarily land on the 1/8-note boundaries. If you need steps locked to the bar, use the Sequencer with per-step parameter locks instead.

### What "expose" does, and when to use it

In the Parameter Panel, every parameter row has a small link icon beside its label; clicking it toggles exposure, with the tooltip *"Expose `<name>` to public API"* (`skald-ui/src/components/ParameterPanel.tsx:216-241, 281-291`). By default the S&H exposes both `rate` and `amplitude` (`skald-ui/src/definitions/node-definitions.ts:70`).

Exposing a parameter changes it from a *compile-time constant* into a *runtime field*, and that has three concrete consequences:

1. **The value stops being a literal in the generated DSP.** Un-exposed, `generate_sample_hold_code` bakes `10.000000000` straight into the arithmetic. Exposed, it emits `p.rate` — a field on the processor struct (`skald-backend/core/param_utils.odin:73-90`).
2. **Your game gets an API for it.** The codegen emits a clamped typed setter `<Asset>_set_rate(p, value)` (`skald-backend/core/codegen.odin:1614-1624`), a string-keyed `<Asset>_set_param` / `get_param` pair (`skald-backend/core/codegen.odin:1677-1711`), and an introspection row in the static `<Asset>_PARAMS` table carrying the name, min, max, default and unit so a debug overlay or save system can enumerate it (`skald-backend/core/codegen.odin:1631-1642`).
3. **The Skald preview stops recompiling when you drag it.** The live preview plays the real generated Odin compiled to WASM (`skald-ui/src/hooks/nodeEditor/useWasmAudioEngine.ts:1-15`). Exposed parameter *values* are masked out of the topology fingerprint, so editing them sends `skald_set_param` instantly instead of triggering a ~250 ms rebuild (`skald-ui/src/utils/projectSerializer.ts:230-248`). Exposed knobs feel live; un-exposed knobs feel laggy.

Why expose an S&H parameter for game runtime? Because *rate is a pacing control*. A dashboard warning light that flickers randomly can flicker faster as the damage gets worse — one `set_rate` call per frame. A magic effect can go from a lazy 1 Hz shimmer while charging to a frantic 20 Hz while discharging. Amount is a *chaos* control: drive it from an enemy's aggression level, a vehicle's damage state, or a corruption meter, and the same instrument reads as calm or unstable without you authoring two assets.

Two exposure gotchas specific to this node, both covered with evidence in *Code-vs-intent notes*: exposing `rate` while BPM Sync is **on** produces a setter that compiles, runs, and changes nothing; and exposing `amplitude` clamps it to a maximum of 1.0 even though the node card offers 10.

## Try it (hands-on)

Open **`examples/instruments/bass/wobble-samplehold-bass.skald.json`**. It is a 140 BPM dubstep-ish bass built specifically to contrast a stepped modulator against a smooth one.

Here is the patch, so you know what you are looking at. Two modulation branches meet at one filter:

```
Saw ──► Wobble LP ──► Amp (ADSR) ──► Dubstep Grit ──► Output
            ▲  ▲
            │  └── Steps 150-1900 Hz (Mapper) ◄── "Stepped 1/8"  (S & H, 1/8 sync)
            └───── Sweep 0-900 Hz     (Mapper) ◄── "Smooth 1/4"  (LFO, triangle, 1/4 sync)
```

The filter's own cutoff knob is 160 Hz, and both Mapper outputs are *added* to it, so the cutoff actually roams from about 310 Hz to about 2960 Hz.

1. **Press play and just listen for two loops.** You should hear a low sawtooth bass on a four-note pattern (E1, A1, G1, E1), with the brightness doing two things at once: a smooth swell underneath, and a hard jump on top that changes about five times a second. Confirm you can hear both. Now listen to the *second* loop — the jumps are in different places than the first loop. That is the free-running S&H described above; the pattern never repeats.

2. **Isolate the steps.** Click the wire from **Smooth 1/4 → Sweep 0-900 Hz → Wobble LP** and delete it (select the edge into the filter's `Cut` handle from `wob-lfo-map` and press Delete). Play again. The swell is gone and you are hearing the S&H alone: flat, then jump, flat, then jump. This is the staircase, naked. Notice there is no glide between steps whatsoever — that is Skald's no-slew design, not a setting you have missed.

3. **Change the step rate musically.** Click the **Stepped 1/8** node. In its Rate dropdown pick **`1/4`**. The jumps halve in speed — one per beat, two sequencer steps apart — and the pattern instantly sounds more deliberate and less nervous. Now pick **`1/16`**. Twice as fast; it starts to bubble. Now **`1/16t`** — triplet sixteenths, `2/3` the length (`skald-backend/core/codegen.odin:49`) — and the steps now sit *against* the sequencer's straight grid, which is where the classic lopsided acid feel comes from. Put it back to `1/8`.

4. **Change the step size, and watch it not work.** With **Stepped 1/8** selected, set its **Amount** box to 5.0. (Node cards use typed number boxes; the Parameter Panel gives you sliders over the same values.) Listen carefully: **nothing changes.** This is not a bug in your ears. `amplitude` is exposed on this node (look at `"exposedParameters": ["amplitude"]` in the JSON), so the preview applies it through the clamped runtime setter, which caps it at 1.0. Now open the Parameter Panel for this node and click the **link icon** next to Amplitude to *un-expose* it. Wait about a quarter of a second for the rebuild. **Now** the 5.0 takes effect — and what you hear is that the middle disappeared. Instead of a spread of different cutoffs you get a coin flip between "very dark" and "very bright", with only occasional values in between. Why: the Mapper is calibrated for input −1…+1 and clamps anything outside it (`skald-backend/core/codegen.odin:703`), so 90% of your ±5 steps land on one extreme or the other. **Lesson: set depth at the Mapper, in real units, not at the source.** Set Amount back to 1.0 and re-expose it.

5. **Now break it properly — cross the rhythm/pitch line.** On the **Stepped 1/8** node, switch **BPM Sync off**. A Rate (Hz) box appears where the sync dropdown was. Walk it up: 12, then 20, then 30, then 60, then 120. Around 15 Hz the steps stop being countable. Around 30–40 Hz the bass acquires a hard buzzy edge — you are hearing the step rate itself as a pitch, and the sidebands it creates around the saw's harmonics. Around 100 Hz it is no longer modulation at all; it is a grainy, digital destruction of the tone. Take it all the way to **1000 Hz** (the node card accepts it; the Parameter Panel's Rate slider stops at 50, so you must use the card — see *Code-vs-intent notes*). What you now hear is sample-rate-reduction: the filter cutoff is being kicked to a new random value roughly every 48 samples (at a 48 kHz sample rate), and every one of those step edges is a rectangular discontinuity radiating harmonics across the whole spectrum, exactly as the zero-order-hold argument predicts [Source: https://www.dspguide.com/ch3/3.htm]. That grit *is* the aliasing.

6. **And break it the other way.** Set Rate to **0.1 Hz**. Now a new number arrives once every ten seconds, which is far longer than any note in the pattern. The wobble vanishes completely and the bass sits at one fixed brightness — but leave it running for half a minute and you will hear the whole loop lurch to a different tone, twice. This is the "variation, not modulation" use, and it is the setting you would reach for on a repeated SFX.

7. **Restore and compare.** Turn BPM Sync back on, set `1/8`, and re-draw the LFO wire you deleted in step 2 (from `Sweep 0-900 Hz` out to the filter's `Cut` input). Play once more. With both branches back you can now clearly separate what each one contributes: the LFO gives the *shape*, the S&H gives the *event*. That division of labour is the whole reason the patch has two modulators.

## Why you patch it this way

**S&H almost never connects directly to its destination — it goes through a Mapper first.** Look at the example: `Stepped 1/8 → Steps 150-1900 Hz → Wobble LP.Cut`. The reason is unit mismatch. The S&H speaks in ±1; a filter cutoff speaks in hundreds or thousands of Hz. The Mapper rescales −1…+1 into 150…1900 Hz with a clamp (`skald-backend/core/codegen.odin:684-705`), which does three jobs at once: it converts units, it gives you two knobs (`outMin`, `outMax`) that mean something physical, and it guarantees the destination never receives a value outside a range you chose. Wiring an S&H straight into `input_cutoff` at Amount 1 would move the cutoff by ±1 Hz — completely inaudible — which is the single most common "my modulation does nothing" mistake.

The exceptions are destinations whose natural range already *is* about ±1: a Panner's `input_pan` (−1…+1, `skald-backend/core/param_ranges.odin:88-89`) and, at small Amounts, an Oscillator's `input_freq`, which is exponential — the generated code computes `base × 2^(sum of incoming signals)`, clamped to ±10 octaves (`skald-backend/core/codegen.odin:152-156`), so ±1 is ±1 octave and ±0.02 is a pleasant ±24 cents of random detune.

**The order that matters most is S&H → Mapper → destination, and S&H before the filter, not after.** The S&H is a *control* signal. If you accidentally sum it into a filter's audio `input` port instead of its `input_cutoff` port, you have added a stepped DC-ish signal to your audio path: the result is thumps, offset, and a very unhappy output stage. Skald will not stop you — both ports accept a signal — so check which handle you landed on.

**Pair it with a smooth modulator rather than replacing one.** The example patch is the canonical shape: one LFO on a long division for the arc, one S&H on a short division for the incident, both summed into the same destination. Because Skald sums all wires into a modulation port (`skald-backend/core/param_utils.odin:138-156`), you get this for free simply by drawing two wires to the same handle. Two S&H nodes at different rates into one destination works too and gives you a compound, quasi-random pattern that takes a long time to repeat.

**Put it before the distortion, not after.** In the example the S&H drives the filter, and the filter's output then hits `Dubstep Grit`. That ordering matters: distortion is amplitude-sensitive, so a filter opening up under S&H control feeds the distortion a hotter, brighter signal on the high steps and a duller one on the low ones. The grit therefore *changes character* with each step instead of sitting there uniformly. Reverse the order — distort first, filter second — and every step gets the same distortion, which sounds noticeably flatter.

**Get the domain right.** Because S&H is per-voice by default, a chord gets one independent staircase per note (`skald-backend/core/codegen.odin:1281-1284`). For a pad, that scattering is beautiful. For a rhythmic stab where every note in the chord must jump *together*, it is wrong — and the only way to force a single shared staircase today is to place the S&H downstream of a Delay or Reverb so it lands in the bus domain (`skald-backend/core/codegen.odin:1931-1932`).

## Going further

**Add slew you do not have.** Skald's S&H cannot glide between steps, but you can approximate the classic S&H+slew smooth-random voltage by summing a second, much slower S&H into the same destination at low Amount — you get a coarse random walk on top of the fast steps. Alternatively, for pitch destinations, raise the instrument's `glide` setting: pitch modulation arriving at an Oscillator's `input_freq` will still jump, but the voice-level glide smooths the *note* transitions around it, softening the overall effect.

**Random pitch, done properly.** Wire S&H → Mapper (out −0.08 … +0.08) → Oscillator `input_freq` and set Amount to 1. Because `input_freq` is exponential, that is roughly ±1 semitone of random detune per step. Set the sync rate to `1/16` and you have the bubbling arpeggio-that-isn't-an-arpeggio sound. Widen the Mapper to ±1.0 and you get full random-octave jumps — the sci-fi-computer patch.

**Random pulse width.** Wire S&H → Mapper (out −0.3 … +0.3) → an Oscillator set to Square, into its `input_pulseWidth` port (`skald-backend/core/graph_validate.odin:26`). Remember the sum rule: this *adds* to the oscillator's own `pulseWidth` knob, so with the knob at 0.5 you get a random width between 0.2 and 0.8 per step, and each step is a different hollowness. Very effective at slow rates on a sustained chord.

**Random wavetable position.** S&H → Mapper (0 … 3) → Wavetable `input_pos`. The Wavetable morphs sine → triangle → saw → square across 0–3 (`skald-backend/core/param_ranges.odin:34-35`), so each step lands on a different waveform. At 1/16 this is a genuinely novel texture that no LFO can produce, because an LFO would sweep *through* the intermediate shapes rather than jumping between them.

**Random panning for width.** S&H → Panner `input_pan` directly (no Mapper needed — the ranges already match) at Amount 0.6, synced to `1/8`. Because the S&H is per-voice, each note of a chord scatters to a different spot in the stereo field and re-scatters on every retrigger. Use a modest Amount; at 1.0 the hard L/R flips are exhausting.

**Layer two S&Hs at coprime rates.** One at `1/8`, one at `1/8t`, both into the same Mapper-fed destination at Amount 0.5 each. Their steps land at different times, so instead of a plain staircase you get a compound pattern with occasional double-jumps. This is the cheapest way to make randomness sound *composed*.

**Modulate the S&H's own rate at runtime.** You cannot do it with a wire (no inputs), but you can do it from game code: expose `rate`, turn BPM Sync **off** (or the setter is inert), and call `<Asset>_set_rate` from your gameplay logic. Rate as a tension parameter — 2 Hz idle, 25 Hz panicking — is one of the highest-value things S&H offers a game, and it costs one float per frame.

**Escalate with a secondary envelope.** Route an ADSR into the same Mapper-fed cutoff alongside the S&H. The envelope decides the overall trajectory of a note; the S&H roughens it. A short-decay envelope plus a fast S&H on a filter is, in essence, the entire acid-bass vocabulary.

## Under the hood

The generated Odin is about six lines, and it is worth reading because it explains every quirk in this chapter. For the example patch's S&H node (id `wob-sh`, sanitised to `wob_sh` by `skald-backend/core/json.odin:174`) Skald emits roughly:

```odin
// --- Sample & Hold Node wob_sh ---
voice.sh_wob_sh_counter += 1;
update_interval_wob_sh := u64(sample_rate / math.max(f32((1.0 / ((60.0 / p.bpm) * 0.500000000))), 0.1));
if voice.sh_wob_sh_counter >= update_interval_wob_sh {
    voice.sh_wob_sh_current_value = next_float32(&voice.sh_wob_sh_rng) * 2.0 - 1.0;
    voice.sh_wob_sh_counter = 0;
}
node_wob_sh_out = voice.sh_wob_sh_current_value * (p.amplitude);
```

(`skald-backend/core/codegen.odin:389-405`.) The key formula is the interval:

**`update_interval = u64(sample_rate / max(rate, 0.1))`**

— the number of samples between dice rolls, truncated to a whole number. The `max(…, 0.1)` guard exists because a rate of zero used to emit a literal division by zero (a *compile* error) and a negative rate cast to a nonsense `u64` (`skald-backend/core/codegen.odin:397-399`). The truncation to `u64` is what quantises high rates, as described under *Rate*.

The randomness comes from `next_float32`, a 32-bit xorshift PRNG with a stuck-at-zero guard, returning a float in [0, 1) (`skald-backend/core/codegen.odin:2291-2299`). The `* 2.0 - 1.0` converts that to a bipolar [-1, +1). Each voice's generator is seeded as `0xC0FFEExx ~ u32(i+1) * 2654435761` so no two voices produce the same sequence (`skald-backend/core/codegen.odin:1298-1312`) — a genuinely necessary detail, since an unseeded xorshift starting at zero returns zero forever.

When BPM Sync is on, the rate expression is *replaced* rather than combined: `rate_str = (1.0 / seconds_per_division)` where the division is computed live from `p.bpm` (`skald-backend/core/codegen.odin:391-393`, `skald-backend/core/codegen.odin:28-51`). That replacement is why an exposed `rate` field silently stops mattering under sync.

Finally, note what is *absent*: there is no interpolation, no filtering, and no smoothing anywhere in those six lines. `current_value` is a single `f32` that changes in one sample and is otherwise perfectly flat. The staircase in Skald is mathematically exact — which is both why it is so punchy and why it grits up so readily at high rates.

## Terms introduced

- **Sample and hold (S&H)** — a module that takes a snapshot of a signal on each clock tick and holds that value perfectly steady until the next tick, producing a staircase output.
- **Clock** — the regular stream of pulses that decides *when* a sample is taken. In Skald the clock is internal and set by the Rate parameter or a BPM division.
- **Stepped random modulation** — the classic S&H patch: sampling noise, so the output is random in value but perfectly regular in time.
- **White noise** — a signal whose value at each instant is random and uncorrelated with the last, containing equal energy at all frequencies. Skald's S&H has one built in.
- **Bipolar** — a signal that swings both above and below zero (here, −1 to +1), as opposed to unipolar (0 to 1). Bipolar modulation adds *and* subtracts from its destination.
- **Depth / amount** — how far a modulator moves its destination. In S&H this is a multiplier on the ±1 step.
- **Zero-order hold** — the mathematical name for "keep the last value until a new one arrives". Equivalent to convolving samples with a rectangular pulse, which shapes the spectrum by a sinc curve and injects high-frequency energy at every step edge.
- **Sinc function** — `sin(πx)/(πx)`, the frequency-domain footprint of a rectangular pulse; the reason held steps roll off high frequencies while also generating them at the edges.
- **Aliasing** — high-frequency content generated above half the sample rate folding back down into the audible band as inharmonic tones. What you hear as "grit" or "digital crunch" when an S&H is run very fast.
- **Bit-crush / sample-rate reduction** — deliberately re-sampling a signal at a low rate for a lo-fi, gritty character; mechanically the same operation as a very fast S&H.
- **Slew limiter** — a lowpass filter for control signals that rounds off sharp transitions, turning a staircase into a smooth wander. Standard on hardware S&H modules; **not present in Skald's**.
- **Control rate vs audio rate** — whether a signal is intended to move parameters (slow, inaudible on its own) or to be heard directly. S&H is computed at audio rate but usually used at control rate; crossing that line is what makes fast rates sound gritty.
- **Voice domain vs bus domain** — whether a node runs once per sounding note (independent per voice) or once per sample on the summed output (shared by all voices).
- **Free-running** — a modulator whose phase is never reset by note-on, so it is not synchronised to the notes you play.
- **Exposed parameter** — a parameter promoted from a compile-time constant to a runtime field with a clamped setter, an entry in the asset's `_PARAMS` table, and instant (no-rebuild) editing in the Skald preview.
- **Parameter clamp** — the min/max a runtime setter enforces, defined per parameter name in `param_ranges.odin`.
- **Mapper** — Skald's rescaling node: converts a modulator's native range into the real units the destination needs, with clamping.

## Known issues

Defects that touch this chapter are tracked centrally in the **Known issues** chapter (`KNOWN-ISSUES.md`): KI-001, KI-006, KI-027. Deliberate design limits — things Skald does not do on purpose — are collected in **What Skald deliberately does not do**.
