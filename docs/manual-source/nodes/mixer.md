# Mixer

> A Mixer adds several signals together into one, with a volume control on each incoming line.

## What it is

Sound is pressure. When two things make noise in the same room at the same time, the air does not
pick a winner — the two pressure waves land on your eardrum simultaneously and their displacements
add. If one wave is pushing your eardrum in by 3 units and another is pulling it out by 1, the
eardrum moves in by 2. That is the whole of it. **Summing** — plain arithmetic addition, sample by
sample — is the most fundamental operation in audio, and a mixer is a machine that does nothing
else. Everything a mixer offers beyond addition (faders, pan, mute) is a convenience wrapped around
`a + b + c`.

The interesting part is what happens to *level* when you add. Two signals that are identical and
lined up in time (**correlated**) add straight up: amplitude 1 plus amplitude 1 gives amplitude 2,
which is 20·log₁₀(2) = **+6 dB**. Two signals that are unrelated (**uncorrelated** — a saw and a
noise burst, or two takes of the same guitar part) do not reliably reinforce; on average their
*powers* add rather than their amplitudes, which comes out at √(1²+1²) = 1.414, or **+3 dB**
[Source: https://sengpielaudio.com/calculator-leveladding.htm ,
https://sengpielaudio.com/calculator-coherentsources.htm]. So four layers, each individually
perfectly safe, can arrive at the output 6–12 dB hotter than any one of them. Nobody turned anything
up. Addition did it.

That is why **headroom** matters. Headroom is the empty space between how loud your signal usually
is and the ceiling where the system runs out of numbers. In digital audio that ceiling is ±1.0
(0 dBFS), and going past it is **clipping** — the tops of the waveform get sliced flat, which does
not sound like "loud", it sounds like buzzing grit welded onto your note. Studio practice is to keep
individual channels peaking around −12 to −18 dBFS and leave roughly 20 dB of room above them,
precisely so that the sum of everything still fits [Source:
https://www.soundonsound.com/techniques/gain-staging-your-daw-software]. The discipline of choosing
sensible levels at every point in the chain, rather than fixing it at the end, is called **gain
staging**.

Think of it as pouring streams into a bucket. Each stream is a layer; the fader on each channel is
the tap. The bucket has a rim, and the rim does not move. You cannot fix an overflowing bucket by
turning the last tap down a bit — you have to decide, up front, how much of the bucket each stream
is allowed to occupy. If you want the bass to be the loudest thing, everything else gets a smaller
share. A mixer is where you make that decision explicit.

The reason you sum things in the first place is **layering** — building one perceived sound out of
several simple ones, each doing a job the others cannot. The standard division of labour is by
frequency and by time: a low layer for weight (roughly 20–250 Hz), a mid layer for body and
recognisable tone (250 Hz–5 kHz), and a high layer for air, click and detail (above 5 kHz)
[Source: https://getthatprosound.com/sound-design-techniques-tools-series-10-key-ways-and-best-plugins-part-3-layering-plugins/].
In time, you split the **transient** (the first few milliseconds — the pick, the thump, the breath)
from the **body** (the sustained part). A synth bass built this way is a sine for the sub, a saw for
the growl, and a 15-millisecond noise blip for the finger noise. Individually all three sound like
nothing. Summed at the right proportions, your ear fuses them into one instrument.

One warning that only shows up when you sum: **phase cancellation**. If two layers are the same
waveform at the same pitch but shifted half a cycle apart, every positive sample meets an equal
negative sample and the sum is silence. Add a layer, get *less* sound. This is not a bug in the
mixer; it is what addition does, and it is why layering two near-identical oscillators is either
gorgeous (slightly detuned, they drift in and out of alignment and you hear slow **beating**) or
catastrophic (exactly detuned, exactly opposed, and they vanish).

## What it looks like in Skald

The Mixer lives in the **Nodes** section of the left sidebar (`skald-ui/src/components/Sidebar.tsx:239`),
listed between Distortion and Mapper with the tooltip "Sums several inputs with per-channel level
sliders" (`Sidebar.tsx:275`). It is drawn in the grey utility accent colour rather than a source or
effect colour (`skald-ui/src/components/Nodes/NodeStyles.ts:98`) — a nudge that it is plumbing, not
tone.

Its handles are generated from the channel count:

- **Inputs** — one target handle per channel on the left edge, with ids `input_1`, `input_2`, …
  `input_N` (`skald-ui/src/components/Nodes/MixerNode.tsx:55`). Each sits on its own row next to an
  "In *n*" label and that channel's level box (`MixerNode.tsx:53-62`).
- **Output** — a single source handle on the right edge with the id `output`
  (`MixerNode.tsx:66`).

The exporter is strict about those port names. Any wire landing on a Mixer must use
`input_1`…`input_inputCount`; anything else aborts the export with an explicit error rather than
silently dropping the cable (`skald-backend/core/graph_validate.odin:115-128`). The practical
consequence: if you wire channel 5 and *then* reduce **Inputs** to 4, the patch stops exporting until
you remove that wire.

The output is **mono** — one number per sample, written to `node_<id>_out`
(`skald-backend/core/codegen.odin:663`). There is no stereo pair. You can legally wire a Panner's
`output_left` and `output_right` into two Mixer channels (`graph_validate.odin:70-71`), and the Mixer
will happily sum them (`codegen.odin:659-661`), but the result is a mono collapse of that stereo
image, not a stereo bus. Panning belongs *after* the Mixer, not inside it (see the controls table).

You can plug **more than one wire into the same channel**. The generator loops over every source
found on that port and multiplies each by that channel's level (`codegen.odin:659-661`), so two
oscillators into `input_1` share one fader. That is occasionally exactly what you want.

Rate: the Mixer is emitted inside the per-sample loop, in the voice domain
(`codegen.odin:1816-1817`) or, if it sits downstream of a Delay or Reverb, the bus domain
(`codegen.odin:1923-1924`). But because it is pure addition with no memory and no assumption about
what the numbers mean, it works identically on audio signals and on control signals. Summing an LFO
and an envelope into a single modulation stream is a completely legitimate use of this node.

## The controls

| Parameter | Range | Default | Unit | What it does to the sound |
|---|---|---|---|---|
| **Inputs** (`inputCount`) | 1 – 32 | 4 | channels | How many input handles the node grows. Purely structural — changing it adds or removes ports and level entries, it does not alter the mix of existing channels. |
| **Level *n*** (`level1`…`levelN`) | 0.0 – 2.0 | 0.75 | × (linear gain) | Multiplies that channel before it joins the sum. 0 mutes it, 1.0 passes it untouched, 2.0 doubles it (+6 dB). |
| **Pan *n*** | — | 0 | — | Stored in the patch file but has **no control and no effect**. See Code-vs-intent notes. |

Where those numbers come from: `inputCount` defaults to 4 and the four channels default to `level:
0.75` in `skald-ui/src/definitions/node-definitions.ts:137-146`; the 1–32 clamp is enforced in the
node UI (`MixerNode.tsx:19`, `MixerNode.tsx:36`) and again in the exporter
(`codegen.odin:615-620`). The 0–2 level range is the on-canvas number box
(`MixerNode.tsx:59`) and, decisively, the range the code generator clamps exported setters to:
`param_ranges.odin:43-45` returns `{0.0, 2.0, 1.0, "x"}` for any parameter whose name starts with
`level`. The parameter-panel slider for the same value is capped at 1.0
(`skald-ui/src/components/ParameterPanel.tsx:343`), which is a genuine inconsistency — noted below.

### What you hear as you sweep Level

Level is a **linear gain multiplier**, not decibels. The conversion is dB = 20·log₁₀(level), which is
worth internalising because the useful range is squashed into the bottom of the knob:

- **0.0** — silence. The channel is muted; the wire is still connected and the source is still being
  computed, you just multiply it by nothing.
- **0.05 – 0.25** (−26 to −12 dB) — the "seasoning" zone. A layer down here is not heard as a
  separate sound. It is heard as a property of the main layer: a bit of air, a bit of grit, a hint of
  a click on the attack. If you can point at it and name it, it is too loud.
- **0.4 – 0.8** (−8 to −2 dB) — the working zone for two to four co-equal layers. The default 0.75 is
  −2.5 dB, deliberately just under unity so that four channels at default do not immediately overrun
  the output.
- **1.0** (0 dB) — **unity gain**: the signal comes out exactly as it went in. This is the reference
  point, not the target.
- **1.0 – 2.0** (0 to +6 dB) — boost. Legitimate when a source is genuinely quiet (a noise burst
  behind a filter, an envelope-scaled transient). Dangerous when used to make something "louder" that
  was already fine, because you are spending headroom you will want back at the output stage.

The failure you will actually meet is not a single channel too loud — it is *three channels each
slightly too loud*. Push the whole mixer up and you do not get a bigger sound; you get the master
saturator squashing everything into a flat, honking version of itself. When something is too quiet,
the correct move is almost always to pull the *other* channels down.

### Inputs

Changing **Inputs** rewrites the channel list, preserving the levels of channels that survive and
giving new ones 0.75 (`MixerNode.tsx:35-41`). Two or three channels covers most instruments. Reach
for eight or more only for drum kits and layered impacts, and remember that every added channel is
another few dB of potential sum.

### What "expose" does

Clicking the link icon beside "Input *n* Level" in the parameter panel adds `level<n>` to the node's
`exposedParameters` list (`ParameterPanel.tsx:197-211`, `ParameterPanel.tsx:338-347`). At export
time, every exposed parameter becomes a real field on the generated processor struct
(`codegen.odin:1262-1264`), a typed setter with the clamp baked in
(`codegen.odin:1612-1625` — for a level, that clamp is 0.0 to 2.0), an entry in the introspectable
`<Instrument>_PARAMS` table (`codegen.odin:1631-1643`), and a string-keyed setter for tooling
(`codegen.odin:1645+`). Inside the audio loop the constant is replaced by a read of that field
(`skald-backend/core/param_utils.odin:81-84`), so the game can change it every frame.

That is the point of exposing a Mixer channel: **your game gets a fader**. Duck the bright layer of a
weapon sound as the player goes underwater. Crossfade a calm pad layer against an aggressive one on a
single "threat level" float. Pull the noise layer out of an engine loop when the camera is far away.
These are exactly the jobs a per-channel level is for, and they are much cheaper than swapping
instruments.

One thing worth knowing before you rely on it: exposing a channel changes *how* the fader keeps
working, not whether it works. The exporter does not look for a flat parameter named `level1` — it
resolves the value out of the same `levels` array the UI already stores it in, so a channel exposed
at 0.4 exports with its field initialized to 0.4, not a generic default. What does change is the path
an edit takes while you are playing: because that value lives inside a nested array rather than a
bare field, dragging an exposed channel's fader does not take the same instant, same-sample path an
exposed Filter cutoff gets — it goes through the ordinary debounced rebuild instead. The fader still
drives the sound; it just arrives a rebuild later rather than on the next sample. Full detail in
Code-vs-intent notes.

## Try it (hands-on)

The suggested supersaw patch has no Mixer in it, so this exercise uses a patch that is built around
one: **`examples/instruments/bass/slap-bass.skald.json`**. Its subgraph is three sources feeding a
three-channel Mixer labelled **"String + Sub + Snap"** — a textbook frequency-and-transient layering
split.

Before you start, here is what is inside (all from the patch file):

- **String** — sawtooth oscillator, amplitude 0.4, into `input_1` at level **0.55** (lines 22-34, 155)
- **Sub** — sine oscillator, amplitude 0.4, into `input_2` at level **0.55** (lines 36-49, 156)
- **Thumb Snap** — white noise at 0.6 through a 0.5 ms attack / 15 ms decay / 0 sustain envelope, into
  `input_3` at level **0.45** (lines 51-76, 157-158)
- Mixer output → **Quack** lowpass, cutoff 240 Hz with resonance 2.6, swept to 4 kHz by its own
  envelope → **Amp** ADSR → Output (lines 93-163)
- Sequence: 9 notes over 16 steps at 100 BPM; instrument volume 0.78; project master 0.78 (lines
  171-193)

Do this with the app open:

1. **Open the patch and press play.** Let the 16-step loop go round twice. Listen for three things at
   once: the low weight, the buzzy midrange, and the little click on every note. Your ear hears one
   bass guitar. It is three sounds.

2. **Double-click the "Slap Bass" instrument node** to enter its subgraph, and find the grey node
   labelled **"String + Sub + Snap"**. You should see three rows: In 1 (0.55), In 2 (0.55), In 3
   (0.45).

3. **Solo the saw.** With the loop still running, type `0` into the In 2 and In 3 boxes. What is left
   is the String layer alone: buzzy, nasal, weirdly thin for a bass — all growl, no foundation. This
   is the layer that makes the note *recognisable* but it cannot carry the low end on its own.

4. **Solo the sub.** Set In 1 to `0` and In 2 back to `0.55`. Now you get pure weight and no
   information — you can feel the pitch but you can barely tell where each note starts. A sine has no
   harmonics for the ear to latch onto.

5. **Solo the snap.** In 2 to `0`, In 3 to `0.45`. A tiny percussive tick, nine times per loop, with
   no pitch at all. On its own it sounds like a fault. In context it is the entire reason the patch
   reads as "slap".

6. **Bring all three back** (0.55 / 0.55 / 0.45) and listen again. Notice that you can no longer pick
   the layers apart. That fusion is the goal of layering.

7. **Move one fader and hear the character change.** Set In 3 to `0.05`. Same notes, same pitch, but
   the bass suddenly feels soft and slightly late — you have taken away the transient and the ear
   uses transients to judge timing. Now push In 3 to `1.2`: the click jumps into the foreground and
   the patch sounds like a woodblock playing over a bass. Walk it back down and find the point where
   it stops being a separate sound and becomes "attack". For this patch that is around 0.4–0.5.

8. **Break it — bad gain staging.** Set In 1, In 2 and In 3 all to `2.0`. Every layer is now doubled,
   so the mixer output is roughly four times what the patch was designed around, and up to six voices
   of that sum at the output before the master soft limiter
   (`codegen.odin:2417`). What you hear is the lesson: it does *not* get four times louder. The low
   end stops growing, the transients flatten out, the whole thing takes on a fuzzy, compressed honk,
   and quiet notes get dragged up to the same loudness as loud ones. Turning everything up made the
   patch smaller and dirtier. Now pull all three down to `0.2` — the balance between the layers is
   identical to step 6, the sound is just quieter and clean. **Balance is ratios; loudness is the
   output stage.** Restore 0.55 / 0.55 / 0.45.

9. **Break it again — phase cancellation.** Click the **String** oscillator and change its waveform
   from Sawtooth to **Sine**. You now have two identical sine layers at the same pitch in channels 1
   and 2, and because a fresh voice resets both oscillators' phase to zero
   (`codegen.odin:1426-1427`) they are perfectly correlated: the bass gets noticeably louder and
   duller, roughly +6 dB on that pair. Now, with String still selected, set its **Phase** to `180`
   degrees. The two sines are exactly opposed, every sample cancels, and the pitched part of the bass
   **disappears entirely** — all that survives is the snap. You added no mute and turned down no
   fader. Addition ate the sound. Set Phase back to `0`, then set String's waveform back to
   Sawtooth; a saw and a sine are uncorrelated enough that this never happens between them.

10. **Optional:** set In 2 (Sub) to `0` and instead raise the instrument's overall **volume** to
    compensate. You will hear that no amount of output gain restores the missing octave. Level
    controls balance; they cannot create a layer that is not there.

## Why you patch it this way

The canonical shape is **sources → Mixer → one shared filter → one shared amp envelope → Output**,
exactly as slap-bass is wired (`slap-bass.skald.json:155-163`). Three reasons this order and not
another:

**Mixer before the filter.** Running the summed layers through a single filter is what glues them
into one instrument. Each layer arrives with its own harmonic content, and a shared lowpass imposes a
common spectral envelope on all of them — the same cutoff sweep bends the saw and the noise together,
so they move as one object. If you filter each layer separately you need N filters, N cutoff
modulations, and they will drift into sounding like three instruments playing in unison.

**Mixer before the amp envelope.** One ADSR on the sum means one attack, one release, one note. Put
the amp envelope on each layer *before* the mixer and you are now hand-syncing three envelopes. The
exception proves the rule: slap-bass deliberately puts a separate 15 ms envelope on the noise layer
*before* the mixer (`slap-bass.skald.json:157-158`), because that layer's job is to exist only during
the transient. Per-layer envelopes go before the mixer when the layers need *different* time
behaviour; the shared envelope goes after.

**Do not use a Mixer just to merge wires.** Skald already sums every connection landing on the same
input port — the Output node sums all its sources (`codegen.odin:1958-1974`), and so does the Mixer
itself within one channel. If two oscillators simply need to both reach a filter, wire them both
straight to the filter's `input`. Add a Mixer when you want *independent, adjustable, exposable* level
per source. That is the only thing it buys you, and it is a good thing to buy.

**Order relative to Distortion is a real tonal decision.** Distortion on each layer before the mixer
gives you three separately-shaped sounds. Distortion after the mixer means the layers intermodulate —
their frequencies beat against each other inside the waveshaper and generate sum-and-difference
tones that were in neither layer. The second is dirtier and more "one instrument"; the first is
cleaner and more controllable. Neither is wrong; know which one you chose.

**Watch the domain boundary.** If your Mixer is downstream of a Delay or Reverb it moves into the bus
domain and runs once per sample for the whole instrument, not once per voice
(`codegen.odin:1923-1924`). Voice-only node types cannot follow it there — the exporter will refuse
with an explicit error rather than silently drop them (`codegen.odin:1935-1944`).

## Going further

Concrete ways to make a mixer-based instrument more expressive:

- **Give each channel its own envelope.** A slow-attack pad layer, a medium-attack body layer, and a
  1 ms transient layer, all summed, produces a sound that *evolves* — the timbre at 5 ms is not the
  timbre at 500 ms. This is the single highest-value upgrade to any layered patch.
- **Put a VCA (Gain) with a modulated `input_gain` in front of one channel.** An LFO into that gain
  gives you tremolo on one layer only — the sub stays rock solid while the top layer shimmers. Much
  more interesting than tremolo on everything.
- **Parallel processing.** Split one source into two mixer channels, distort or heavily filter one of
  them, and use the fader to blend. You keep the original transient and dynamics intact while adding
  as much saturation as you like. This is a genuinely different sound from series distortion, where
  the whole signal goes through the waveshaper.
- **Detune for width.** Two saws into channels 1 and 2 with a few cents of difference (or the
  instrument's `unison`/`detune` settings) beat slowly against each other. Set both faders equal for
  maximum beating; unbalance them and the beating becomes subtler.
- **Split the spectrum deliberately.** Assign each channel a frequency job — sub below 250 Hz, body
  250 Hz–5 kHz, air above 5 kHz — and use a filter on each layer to enforce it before summing. Layers
  that overlap heavily fight and produce mud; layers that occupy different bands stack cleanly
  [Source: https://getthatprosound.com/sound-design-techniques-tools-series-10-key-ways-and-best-plugins-part-3-layering-plugins/].
- **Nest mixers.** A Mixer's output is an ordinary mono signal, so a three-oscillator sub-mix can feed
  a single channel of a master Mixer. This gives you a group fader over the whole stack — pull the
  entire oscillator section down against the noise section with one control.
- **Expose two or three levels and crossfade from the game.** A single "intensity" float that drives
  `set_level1` up while driving `set_level3` down turns one instrument into a continuum. Cheaper than
  loading two instruments and far smoother than switching between them.
- **Fake per-channel pan.** Because Mixer pan does nothing, build two Mixers (a left sub-mix and a
  right sub-mix), put each source in both at different levels, and feed a Panner. Crude, but it is
  the only way to get a per-layer stereo image in Skald today.

## Under the hood

The generated Odin is about as small as DSP gets. `generate_mixer_code`
(`skald-backend/core/codegen.odin:602-665`) opens a scoped block, declares an accumulator, and emits
one `+=` line per connection:

```odin
mix_sum_<id>: f32 = 0.0;
mix_sum_<id> += node_<src>_out * (0.550000000);
mix_sum_<id> += node_<src2>_out * (0.550000000);
node_<id>_out = mix_sum_<id>;
```

which is the formula

> `out = Σᵢ (sourceᵢ × levelᵢ)`

emitted at `codegen.odin:635-663`. You can see this verbatim in the golden test output at
`skald-backend/tests/golden/.gen/dual_osc.odin:505-508`.

Three things are notably *absent*, and each is a design decision you inherit:

- **No clamping and no normalisation.** The Mixer will happily hand you a value of 8.0. Nothing
  divides by the channel count. Headroom is entirely your responsibility.
- **No pan.** The per-channel `pan` value is parsed into the node's data and never read.
- **No smoothing.** The level is substituted as a compile-time constant when the channel is not
  exposed, so there is nothing to smooth; when it *is* exposed it becomes a struct-field read
  (`param_utils.odin:81-84`) and a large jump written from game code lands as a step. Ramp it in your
  game loop if you are moving it fast.

The safety net is downstream and global, not per-mixer. Each instrument's output is scaled by its
`volume` at the asset boundary (`codegen.odin:1952`), all instruments sum into the project mix, and
the final stage applies master volume followed by a `tanh` soft limiter whose ceiling is exactly 1.0
(`codegen.odin:2415-2418`). `tanh` squashes gracefully instead of slicing, which is why over-driving
a mixer sounds like compression and glue rather than digital crackle — but it is a last resort, not a
mixing tool. The preview player runs the same code path (`codegen.odin:2599-2624`), so what you hear
in the app is what the exported instrument does.

## Terms introduced

- **Summing** — adding two or more signals together sample by sample. What a mixer does.
- **Gain** — a multiplier applied to a signal. Gain 1.0 changes nothing; 0.5 halves the amplitude.
- **Unity gain** — a gain of exactly 1.0: the signal passes through unchanged.
- **Linear gain vs decibels** — Skald's faders are linear multipliers; dB = 20·log₁₀(gain). A fader
  at 0.5 is −6 dB, at 0.75 is −2.5 dB, at 2.0 is +6 dB.
- **Correlated / uncorrelated signals** — identical-and-aligned versus unrelated. Correlated pairs sum
  to +6 dB, uncorrelated pairs average +3 dB.
- **Headroom** — the unused space between your usual signal level and the clipping ceiling.
- **Clipping** — what happens when a signal exceeds the maximum representable level and the waveform
  peaks get sliced flat. Sounds like harsh buzzing grit.
- **Soft clipping / saturation** — a smooth, curved approach to the ceiling (Skald uses `tanh`), which
  compresses peaks instead of slicing them.
- **Gain staging** — choosing sensible levels at every point in the signal chain so that nothing runs
  out of headroom downstream.
- **Layering** — building one perceived sound from several simpler ones with complementary jobs.
- **Transient / body** — the first few milliseconds of a note (attack, click, thump) versus the
  sustained part that follows.
- **Sub / body / air** — the conventional three-way frequency split of a layered sound: below 250 Hz,
  250 Hz–5 kHz, above 5 kHz.
- **Phase cancellation** — two signals of opposite polarity summing to silence.
- **Beating** — the slow pulsing you hear when two nearly-identical pitches drift in and out of phase.
- **Mono** — a single channel of audio, one number per sample. The Mixer's output.
- **Bus** — a shared signal path that several sources feed into. A Mixer is a small bus.
- **Voice domain / bus domain** — in Skald, code that runs once per playing note versus code that runs
  once for the whole instrument.
- **Audio rate vs control rate** — signals meant to be heard versus signals meant to move a parameter.
  The Mixer treats them identically.
- **Expose** — marking a parameter so the exported Odin gets a typed setter for it, letting game code
  change it at runtime.

## Known issues

Defects that touch this chapter are tracked centrally in the **Known issues** chapter (`KNOWN-ISSUES.md`): KI-045, KI-046. Deliberate design limits — things Skald does not do on purpose — are collected in **What Skald deliberately does not do**.
