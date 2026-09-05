# Delay

> A Delay records the sound going into it, waits a set amount of time, and plays it back — so you hear the same sound again, slightly later, like an echo off a canyon wall.

## What it is

Sound takes time to travel. If you clap in front of a cliff 40 metres away, the sound goes out, bounces, and comes back about a quarter of a second later. You hear your clap twice: once directly, once from the cliff. That is all a delay effect is. Everything else — feedback, tempo sync, dub, slapback — is just what happens when you control that one gap precisely.

In DSP terms this is a **delay line**: a block that "introduces a time delay between its input and output", written `y(n) = x(n − M)` where `M` is the delay in samples [Source: https://ccrma.stanford.edu/~jos/pasp/Delay_Lines.html]. In software you build it as a **ring buffer** (also called a circular buffer): a fixed strip of memory with a write position that marches forward one sample at a time and wraps around at the end. To hear the sound from `M` samples ago you just read `M` slots behind the write head. Nothing is "stored and retrieved" in any clever sense — you are reading an older part of the same tape loop.

The interesting part is **feedback**. If you take the delayed sound and mix a fraction of it back into the buffer, the echo echoes. Each pass round the loop is multiplied by the feedback gain `g`, so the repeats decay as `g`, `g²`, `g³`, … — an exponential fade. This structure has a name: the **feedback comb filter**, `y(n) = x(n) + g·y(n − M)`, which is literally "a computational physical model of a series of echoes, exponentially decaying and uniformly spaced in time" [Source: https://ccrma.stanford.edu/~jos/pasp/Feedback_Comb_Filters.html]. The stability condition is `|g| < 1`. Above 1, each echo is louder than the last and the thing runs away: Sound On Sound puts it plainly — the feedback gain "must be less than unity, otherwise the echoes will build up in level rather than decaying, resulting in an uncontrollable howl" [Source: https://www.soundonsound.com/techniques/creating-using-custom-delay-effects]. Skald clamps `g` for you; we will come back to exactly where.

Here is the part that matters musically, and it is a fact about your ears rather than about DSP. **How long the gap is completely changes what the delay is for.** Below roughly 30 ms, your hearing does not report a second event at all — it fuses the two arrivals into one sound and takes the direction from the first one. That is the **precedence effect** (or **Haas effect**): a reflection arriving inside a fusion window of roughly 10–30 ms for speech can be up to 10 dB louder than the direct sound and still not be heard as an echo [Source: https://en.wikipedia.org/wiki/Precedence_effect]. A short delay does not sound like a repeat; it sounds like *the source got bigger*. Somewhere past 50 ms for impulsive material and past 100 ms or so for music, fusion breaks and you hear a distinct echo.

So there are two jobs, and one control decides which one you get:

- **Delay as depth.** Times under about 30 ms thicken and widen. Times of 80–120 ms give you **slapback** — one fast, hard repeat, the sound of 1950s rockabilly vocals and Elvis records; practitioners generally quote 60–140 ms with little or no feedback [Source: https://unison.audio/delay-types/]. You do not consciously count these repeats. They read as body and room.
- **Delay as rhythm.** Set the gap to a note value at the track's tempo and the repeats land on the grid. Now the delay is a second performer. A quarter-note delay reinforces the pulse; a dotted-eighth delay is the famous "shimmering cross-rhythm" trick because its repeats fall between the eighths; triplet divisions add swing [Source: https://www.attackmagazine.com/technique/tutorials/the-ultimate-delay-guide/]. Push feedback high and stop playing and you get **dub delay** — 1970s Jamaican producers ran vocals and drum hits into tape echo with heavy feedback until the repeats became the arrangement.

Two more named flavours worth knowing, because Skald handles them differently from a typical plugin. **Ping-pong** delay alternates repeats left, right, left, right, which animates arpeggios and percussion across the stereo field. **Multi-tap** delay reads the same buffer at several distances at once for irregular rhythmic patterns. Skald's Delay node is mono and single-tap, so you build both of those by patching, not by flipping a switch — see [Going further](#going-further).

## What it looks like in Skald

Delay lives in the sidebar palette between **Filter** and **Reverb**, described there as "Echo with feedback and wet/dry mix. Can sync to BPM." (`skald-ui/src/components/Sidebar.tsx::paletteNodes`). Drag it onto the canvas like any other node.

It has exactly two handles, both audio:

| Handle | Side | Handle id | Label on the card |
|---|---|---|---|
| Input | left | `input` | `In` |
| Output | right | `output` | `Out` |

Both are declared in `skald-ui/src/components/Nodes/DelayNode.tsx::DelayNode`. There are **no modulation input ports** — no `input_time`, no `input_feedback`, no `input_mix`. The codegen confirms this: every parameter is fetched with an empty modulation-port name, which explicitly means "this param has no modulation port" (`skald-backend/core/codegen_nodes.odin::generate_delay_code`, and the reasoning at `skald-backend/core/param_utils.odin::get_f32_param`). You therefore **cannot** wire an LFO into the delay time to make a chorus, flanger or tape-warble effect. If you have used a delay plugin before, this is the biggest surprise in the node; the only ways to change a Delay parameter while the patch is running are exposed runtime parameters and sequencer P-locks, both covered below.

If several wires arrive at `In`, they are summed, not fought over (`skald-backend/core/codegen_nodes.odin::generate_delay_code`, using `sum_port_inputs` at `skald-backend/core/param_utils.odin::sum_port_inputs`). One `Out` can feed several destinations.

**The Delay runs at audio rate, once per sample — but on the bus, not per voice.** This is the single most important structural fact about the node. Skald splits an instrument's graph into a *voice domain* (everything before the first Delay or Reverb, run once per sounding note) and a *bus domain* (the Delay/Reverb and everything downstream, run once per sample on the summed voices). The domain is seeded by the Delay or Reverb node itself (`skald-backend/core/codegen_analysis.odin::seed_bus_domain`): a delay buffer inside the per-voice loop would advance its write pointer once per voice per sample, which would divide the effective delay time by the number of active voices, bleed voices into each other's feedback, and cut the tail dead the instant the last note released. Instead the bus block runs regardless of whether any voice is active, so echo and reverb tails keep ringing after the last voice dies (`skald-backend/core/codegen_processor.odin::generate_processor_code`). There is an acceptance test that exists purely to guard this: `delay_tail` plays a 0.25 s note into a 0.5 s / 0.5-feedback delay and asserts that audio is still present between 1.05 s and 1.30 s, long after every voice is idle (`skald-backend/acceptance/main.odin::delay_tail`).

The consequence for patching: **you cannot put a per-note node after a Delay.** Oscillator, ADSR, FM Operator, Wavetable and MIDI Input are voice-coupled and wiring any of them downstream of a Delay is a hard export error with an explanatory message, not a silent drop (`skald-backend/core/codegen_processor.odin::generate_processor_code`). What *is* allowed downstream: Filter, VCA (Gain), Distortion, Mixer, Mapper, Panner, LFO, Noise, S&H and Reverb (same proc).

Also: **feedback wires in the graph are illegal.** You cannot loop a Delay's `Out` back to its own `In` (or into an earlier node) to build feedback by hand — a cycle is a hard error listing the offending nodes (`skald-backend/core/codegen_processor.odin::generate_processor_code`). The `Feedback` control is the only feedback path, and it is internal.

## The controls

The Delay card shows five fields (`skald-ui/src/components/Nodes/DelayNode.tsx::DelayNode`); the parameter panel on the right shows the same values with sliders (`skald-ui/src/components/NodeParameterControls.tsx::NodeParameterControls`).

| Parameter | Range (node card) | Range (panel slider) | Range enforced on export | Default | Unit | What it does to the sound |
|---|---|---|---|---|---|---|
| `bpmSync` | on / off | on / off | — | `false` | — | When on, the delay time comes from the musical division instead of the seconds value |
| `syncRate` | `1/1` … `1/64t` | same list | parsed as `1/N` or `1/Nt` | `'1/8'` | note division | Length of one repeat expressed as a note value at the project tempo |
| `delayTime` | 0 – 2, step 0.01 | 0 – 2 | clamped to 0.0 – 2.0 (and to the buffer) | `0.5` | s | Gap between the source and its first repeat |
| `feedback` | 0 – 0.95, step 0.01 | **0 – 1** | runtime setter and DSP both clamp 0 – 0.95 | `0.5` | — | How much of each repeat is fed back, i.e. how many repeats you get |
| `mix` | 0 – 1, step 0.05 | 0 – 1 | 0.0 – 1.0 | `0.5` | — | Balance between the untouched (dry) signal and the echoes (wet) |

The node card, the exported setter and the DSP itself all agree now (packets P2/B3 and C2 closed two of the three original mismatches). Only the parameter panel's Feedback slider is still out of step: it offers 0–1 while every other surface stops at 0.95, so the last stretch of that particular drag does nothing (KI-001).

Sources for each column: node-card ranges `skald-ui/src/components/Nodes/DelayNode.tsx::DelayNode`; panel slider ranges `skald-ui/src/components/NodeParameterControls.tsx::NodeParameterControls`; defaults `skald-ui/src/definitions/node-definitions.ts::defaultDelayParams`; the exported clamp table `schema/nodes.json::delayTime`, `schema/nodes.json::feedback` (rendered into `skald-backend/core/param_ranges.generated.odin`); the hard DSP feedback clamp `skald-backend/core/codegen_nodes.odin::generate_delay_code`; the sync-rate list `skald-ui/src/definitions/bpm.ts::SYNC_RATE_OPTIONS`. The parameter shapes are typed in `skald-ui/src/definitions/types.ts::DelayParams`, which extends `BpmSynchronizable` (`skald-ui/src/definitions/types.ts::BpmSynchronizable`).

### What you hear as you sweep each one

**`delayTime` (0 – 2 s).** This is the control that decides whether you are adding depth or adding rhythm, so sweep it slowly and listen for the moment your ear changes its mind.

- **1–30 ms.** No echo at all. The sound gets thicker, slightly hollow, and a bit "phasey" — you are hearing comb filtering, because a delay this short has notches every `1/delayTime` Hz across the spectrum. At 10 ms the notches are 100 Hz apart and you hear it as a tone colour, not as a repeat. Below about 5 ms with feedback up, the delay stops being an effect and becomes a resonator with a pitch of `1/delayTime` Hz.
- **60–140 ms.** Slapback. One clear, fast repeat that reads as attitude and room rather than as an echo. This is the classic rockabilly vocal setting; keep feedback at or near zero here [Source: https://unison.audio/delay-types/].
- **200–600 ms.** The musical zone for rhythmic work. At typical tempos this is where eighth and quarter notes land. Repeats are clearly separate events and start interacting with the groove.
- **0.8–2 s.** Ambient, dub, "answering phrase" territory. Long enough that the repeat is a musical event in its own right. Above about 1.5 s the repeats stop feeling connected to what you played.
- **The ceiling is a hard wall at 2 s** — actually at 95999 samples, which is 2 s only if your audio device runs at 48 kHz; at 44.1 kHz it is 2.176 s, at 96 kHz it is 1.0 s (KI-043).

**`syncRate` + `bpmSync`.** Tick BPM Sync and the seconds value is ignored entirely; the delay time becomes `(60 / bpm) × beats`, where a whole note is 4 beats and a trailing `t` means triplet (× 2/3). That math lives in `skald-backend/core/codegen_analysis.odin::bpm_sync_seconds_expr` and is mirrored exactly in the UI at `skald-ui/src/definitions/bpm.ts::syncRateToSeconds`, with a test pinning the two together (`skald-ui/src/tests/bpm/BpmConsistency.test.tsx::syncRateToSeconds`). Because the expression uses the runtime `p.bpm`, a synced delay follows tempo changes at runtime rather than baking in one number. The panel prints the resolved value under the dropdown — "1/8 at 128 BPM = 0.234 s" (`skald-ui/src/components/NodeParameterControls.tsx::NodeParameterControls`, via `skald-ui/src/definitions/bpm.ts::formatSyncTime`) — which is the fastest way to learn the tempo/time relationship: change the division, watch the milliseconds.

Useful divisions: `1/4` for a solid, obvious pulse; `1/8` for movement that stays out of the way; `1/8t` and `1/4t` for swing and for a slapback that still sits on the grid; `1/16` for a shimmer that borders on reverb. Note that Skald's list has no dotted values — only straight and triplet (`skald-ui/src/definitions/bpm.ts::SYNC_RATE_OPTIONS`). The dotted-eighth trick that most delay plugins offer is not available; the closest thing you can do is turn BPM Sync off and type the seconds by hand (dotted eighth = `(60 / bpm) × 0.75`).

**`feedback` (0 – 0.95).** This is the `g` in the comb filter, and it controls *how many* repeats, not how loud the first one is.

- **0.** Exactly one repeat. This is slapback, and it is also the safest setting when you are using delay purely for thickness.
- **0.2–0.4.** Three to seven audible repeats, dying away naturally. This is the everyday musical zone and it is where every stock Skald example sits: 0.35 in `splitter-echo-stab` and `gold-midas-bells`, 0.3 in `disruptor-alarm`, 0.4 in `ambient-clean`.
- **0.5–0.7.** Ten to twenty repeats. The tail now overlaps the next thing you play. Great for dub and for sparse leads; a fast way to turn a busy part into mud.
- **0.9–0.95.** Effectively endless. The tail rings for tens of seconds and each new note piles onto the last. At 0.95 with a 0.234 s delay you get about 135 repeats before the signal drops 60 dB — roughly a 31-second tail. This is the dub/self-oscillation setting, and it is deliberately capped: `math.clamp(f32(...), 0.0, 0.95)` at the point of use (`skald-backend/core/codegen_nodes.odin::generate_delay_code`), because a literal or modulated feedback at or above 1 diverges geometrically and would NaN-latch the whole processor, not just one voice. You cannot make Skald howl to infinity. You can absolutely make it unlistenable.

A rule of thumb you can compute: the number of repeats before the echo has faded 60 dB is `ln(0.001) / ln(feedback)`, so the tail lasts `delayTime × ln(0.001) / ln(feedback)` seconds. At 0.5 that is ten repeats; at 0.35, about seven; at 0.9, sixty-six.

**`mix` (0 – 1).** A straight linear crossfade: `out = dry × (1 − mix) + wet × mix` (`skald-backend/core/codegen_nodes.odin::generate_delay_code`). At 0 you hear only the dry signal and the delay is inaudible (though the buffer is still running and still accumulating feedback — turn mix up later and the tail is already there). At 0.5, dry and wet are equal, which almost always sounds like too much: the repeat competes with the note that caused it. The examples that ship with Skald use 0.25–0.3, and that is a good instinct — a delay you can hear as a *separate effect* is usually louder than a delay that makes the part sound good. At 1.0 the dry signal disappears entirely and you hear only the echoes; because the buffer is read *before* the current sample is written, mix = 1 means the whole part is shifted late by `delayTime`. That is a legitimate sound-design move (100% wet delays on a send), but it is a mistake if this Delay is an insert on your only signal path.

Because the crossfade is linear rather than equal-power, the total loudness dips slightly around mix ≈ 0.5 when dry and wet are uncorrelated. It is subtle; just know that the mix knob is not perceptually flat.

### What "expose" does, and why you would use it

Every parameter row in the right-hand panel has a small link icon. Clicking it adds or removes that parameter name from the node's `exposedParameters` array (`skald-ui/src/components/ParameterPanel.tsx::toggleParameterExposure`). The Delay's default exposure set is `['delayTime', 'feedback', 'mix']` (`skald-ui/src/definitions/node-definitions.ts::defaultDelayParams`).

Exposing a parameter changes what the generated Odin looks like. An un-exposed parameter is **baked in as a literal** — you can see it in the golden test output, where feedback 0.5 emits as the local `fdbk_3` initialised to the constant `f32(0.500000000)` (`skald-backend/tests/golden/delay_tail.odin.golden`). An exposed parameter instead becomes a **real field on the processor struct** with three things attached:

1. A typed setter that clamps to the range from the generated table — for the Delay that is `delayTime` ∈ [0, 2] s, `feedback` ∈ [0, 0.95], `mix` ∈ [0, 1] (`schema/nodes.json::delayTime`, `schema/nodes.json::feedback`, applied and emitted in `skald-backend/core/codegen_processor.odin::generate_processor_code`).
2. An entry in the introspectable `<Instrument>_PARAMS` table, so a game's debug overlay or save system can enumerate what is tweakable, complete with min, max, default and unit (same proc).
3. A string-keyed `<Instrument>_set_param` case reachable by two names: the field name and a `"<node id>::<param>"` alias (same proc).

Two practical reasons to care. **In the game:** exposed parameters are what your runtime can move. Raise `feedback` and `mix` as the player enters a cave; drop them in the open. Nothing else about the instrument can change at runtime. **In the editor:** exposed parameters apply instantly during preview via `skald_set_param`, with no rebuild, while any other edit triggers a debounced re-codegen and recompile (`skald-ui/src/hooks/nodeEditor/useWasmAudioEngine.ts::useWasmAudioEngine`; the masking logic is at `skald-ui/src/utils/projectSerializer.ts::topologySignature`). Exposed knobs feel live. Un-exposed knobs stutter and re-trigger. When you are auditioning a delay by ear, expose the thing you are sweeping.

One trap, now surfaced rather than silent: **exposing `delayTime` does nothing while BPM Sync is on**, because the codegen reads `delayTime` and then unconditionally overwrites it with the sync expression (`skald-backend/core/codegen_nodes.odin::generate_delay_code`). Packet B2 taught both the node card and the panel to say so instead of pretending the control is live: `skald-ui/src/utils/plockTargets.ts::paramIsReachable` returns `false` for `delayTime` on a synced Delay, and its `::paramDeadReason` supplies the string `"bpmSync is on, so its time base comes from syncRate instead"`, which the panel renders next to the field (`skald-ui/src/components/NodeParameterControls.tsx::renderControlWrapper`). The node card goes further and hides the field outright when synced (`skald-ui/src/components/Nodes/DelayNode.tsx::DelayNode`'s `showIf: (d) => !d.bpmSync`), rather than showing a control with zero audible effect. Change the project tempo instead of the delayTime setter. Every shipped Skald example that syncs its delay exposes only `feedback` and `mix`, which is the right call.

## Try it (hands-on)

Open `examples/songs/loops/geowars/splitter-echo-stab.skald.json`. It is a five-node instrument — Square oscillator → Lowpass filter → pluck ADSR → **Split Echo** (Delay) → Output — with a 16-step sequencer pattern at **128 BPM**, and the delay already BPM-synced to `1/8` with feedback 0.35 and mix 0.3.

1. **Hear the patch as written.** Press play and let the 16-step loop go round twice. The pattern has notes on steps 0, 3, 6, 10, 12 and 15. Listen past the notes: between step 6 and step 10 there is a gap where nothing is played, and you can hear the echoes filling it in. That filling-in is the entire point of the node.

2. **Find the delay.** Click the **GW Splitter Echo Stab** instrument node once. The right-hand panel lists the instrument's own controls, then a heading **Internal Nodes**, then each child node by label (`skald-ui/src/components/ParameterPanel.tsx::ParameterPanel`). Scroll to **Split Echo**. You should see a Sync Rate dropdown reading `1/8`, a grey hint underneath saying **"1/8 at 128 BPM = 0.234 s"**, Feedback at 0.35, Wet/Dry Mix at 0.3, and a ticked BPM Sync box.

3. **Mute the effect, then unmute it.** Drag **Wet/Dry Mix** to 0 while the loop plays. The part becomes a dry, dead stab — you will notice how much of the "size" of this sound was the echo, not the oscillator. Now bring mix back up slowly. Somewhere around 0.15 it starts to feel like a room; at 0.3 (the stock value) it feels like an arrangement; past 0.5 the repeats start competing with the notes for the same rhythmic slot. Leave it at 0.3.

4. **Change what the delay is *for*, without touching anything else.** Set Sync Rate to `1/4`. The hint should read **0.469 s**. The echoes now land squarely on the beat and the part sounds slower and more deliberate — the delay is doubling the pulse. Set it to `1/16` (hint: **0.117 s**). The echoes now land between the sequencer's steps and the whole thing turns into a stuttering machine-gun texture. Set it to `1/8t` (hint: **0.156 s**) and listen to the lurch: triplet repeats against a straight pattern is a swing you cannot play by hand. Put it back to `1/8`.

5. **Cross the fusion threshold.** Untick **BPM Sync**. A Delay Time slider appears in its place. Drag it down to about **0.09 s** (90 ms). The echo stops being a rhythmic event and becomes slapback — one hard snap on the back of each stab, 1950s-style. Now drag it to **0.02 s** (20 ms). The repeat vanishes as a separate event entirely; the stab just sounds *wider and hollower*. You just heard the precedence effect: below roughly 30 ms your hearing fuses the two arrivals into one [Source: https://en.wikipedia.org/wiki/Precedence_effect].

6. **Count the repeats.** Set Delay Time back to **0.5 s** so individual repeats are easy to count, and drop Feedback to **0**. You get exactly one echo per note. Raise it to **0.5** and count: you should manage about eight or nine before they disappear under the noise floor, which matches `ln(0.001) / ln(0.5) ≈ 10`. Feedback controls the *number* of repeats, not their volume — that is what mix does.

7. **Break it, part one: dub runaway.** With Delay Time still 0.5 s, drag **Feedback** all the way up (the panel slider goes to 1.0) and **Wet/Dry Mix** to 1.0. Let the loop run for thirty seconds. Every note stays in the buffer essentially forever, the repeats stack on top of each other, and the master output's `tanh` soft-clipper (`skald-backend/core/codegen_project.odin::skald_soft_limit`) starts squashing the peaks — you will hear the whole thing flatten out and go grainy as the transients stop poking through. That grainy flattening *is* clipping. Notice too that it never becomes a screaming, infinitely-rising howl: even though the slider reached 1.0, the DSP clamps at 0.95 (`skald-backend/core/codegen_nodes.odin::generate_delay_code`). The last 0.05 of that slider does nothing at all.

8. **Break it, part two: the delay stops being a delay.** Keep Feedback high, set Wet/Dry Mix to about 0.7, and drag **Delay Time** down to **0.01 s** (10 ms). The echoes are gone and in their place is a hard, buzzy **pitch** — roughly 100 Hz, plus its harmonics — that rings after every stab. Sweep the slider between 0.005 and 0.05 and you will hear it play a glissando. You have not changed the effect; you have just made the loop short enough that its repetition rate is an audible frequency. This is the comb filter revealing itself, and it is the same mechanism that makes a plucked-string physical model work.

9. **Reset.** Set Delay Time back to 0.5, Feedback to 0.35, Mix to 0.3, and re-tick BPM Sync (it will resume at `1/8`). Play once more so your ears re-calibrate to what "tasteful" sounded like.

## Why you patch it this way

The standard order is **source → shaping → envelope → Delay → output**, exactly as `splitter-echo-stab` wires it: oscillator, filter, ADSR, delay, output (`examples/songs/loops/geowars/splitter-echo-stab.skald.json`, connections block).

**Delay goes after the amplitude envelope, not before.** If you put the Delay before the ADSR, the envelope would chop the echoes: every repeat would be re-shaped by the current note's envelope, and when the note released, the tail would be gated to silence. Putting it after means the ADSR produces a clean, decayed pluck and the Delay repeats *that* shape. It is also why the codegen forces the issue — an ADSR downstream of a Delay is a hard error, since envelopes are per-voice and the delay bus is not (`skald-backend/core/codegen_processor.odin::generate_processor_code`).

**Delay goes after the filter, usually.** Filter-then-delay means every echo is a copy of the already-filtered tone, so the repeats have the same character as the source. Delay-then-filter (which *is* legal — Filter runs happily in the bus domain, `skald-backend/core/codegen_processor.odin::generate_processor_code`) darkens the repeats progressively relative to the source, which is the closest thing Skald has to a tape-echo emulation. Note the important limitation: the filter sits *outside* the feedback loop, so it darkens the wet signal once, not once per repeat. Real tape and analogue delays lose top end on every pass. Skald's repeats are spectrally identical copies, just quieter. If you want progressively duller echoes you will have to fake it with two Delays in series at different times, each followed by its own Filter.

**Delay goes before Reverb.** Both are bus-domain, so either order compiles, but delay-into-reverb puts each echo in the same room, which is what your ear expects. Reverb-into-delay repeats the reverb tail itself and smears very quickly.

**Get the order wrong and Skald tells you.** Any Oscillator, ADSR, FM Operator, Wavetable or MIDI Input downstream of a Delay stops the export with a message naming the node and telling you to move it (`skald-backend/core/codegen_processor.odin::generate_processor_code`). This is deliberate — those nodes used to be silently dropped from the patch.

**One Delay per instrument is the norm, and it is shared.** Because the Delay is bus-domain, all eight (or five, in this patch) voices feed one buffer. That is what you want — it is how a real send effect behaves — but it means you cannot give one note a different echo from another. Per-note delay variation is not something this architecture offers.

## Going further

**Sequencer P-locks are your modulation.** Since there is no modulation port, the way to make a delay move over time is per-step parameter overrides in the sequencer. A P-lock on a Delay parameter automatically exposes it, because a P-lock can only work through `set_param` on a real processor field — the codegen unions P-lock targets into the exposure set for exactly this reason (`skald-backend/core/codegen_analysis.odin::effective_exposed_params`). P-lock `feedback` to 0.8 on the last step of a bar and you get the classic dub "throw": one phrase spins off into the distance while the rest stays dry.

**Fake ping-pong with two Delays and two Panners.** Skald's Delay is mono and cycles are illegal, so true cross-fed ping-pong is out. What works: wire your source into two Delay nodes in parallel, set one to `1/8` and the other to `1/4` (or set one to `1/8` and offset the other by hand in seconds), then send each through its own Panner to hard left and hard right before summing at a Mixer. You get alternating left/right repeats and most of the perceived movement. Panner and Mixer are both legal in the bus domain (`skald-backend/core/codegen_processor.odin::generate_processor_code`).

**Fake multi-tap the same way.** Three Delays in parallel at `1/16`, `1/8` and `1/4`, all with feedback 0, mixed at different levels, gives you a fixed rhythmic pattern of taps rather than an even train of echoes. Feedback 0 is important here — with feedback on each tap you get three overlapping trains and it turns to mush fast.

**Layer short and long.** A common professional move is a short slapback (75–100 ms, no feedback) *plus* a longer synced delay (quarter note, low feedback): the slapback adds body, the synced delay adds rhythm and space, and neither is doing the other's job [Source: https://unison.audio/delay-types/]. Two Delay nodes in parallel into a Mixer.

**Duller repeats.** Delay → Filter (lowpass around 2–4 kHz) → Output makes the echoes sit behind the source instead of competing with it. This is the single most effective thing you can do to stop a delay muddying a busy mix.

**Dirtier repeats.** Delay → Distortion is legal (`skald-backend/core/codegen_processor.odin::generate_processor_code`) and gives you a grimier, more aggressive tail. Keep the Distortion's own mix low or the dry signal gets dragged along.

**Runtime control from the game.** Expose `feedback` and `mix`, then drive them from gameplay: dry and tight in combat, long and wet in an empty corridor. Since a synced delay reads `p.bpm` live (`skald-backend/core/codegen_analysis.odin::bpm_sync_seconds_expr`), changing the project tempo at runtime re-times the echoes automatically — a music system that ramps tempo keeps every synced delay locked without touching a single parameter.

**Delay as a pitched resonator.** Deliberately abuse step 8 of the exercise: a very short delay time with high feedback is a tuned comb filter at `1/delayTime` Hz. Feed it Noise and you have a crude plucked-string. This is not what the node was designed for, but it is real synthesis and it costs one node.

## Under the hood

Every Delay (and every Reverb) gets a fixed `[96000]f32` ring buffer and an integer write index on the processor struct — not on the voice (`skald-backend/core/codegen_processor.odin::generate_processor_code`; you can see the emitted field at `skald-backend/tests/golden/delay_tail.odin.golden::delay_3_buffer`). 96000 samples is 2 seconds at 48 kHz, and the constant `MAX_DELAY_SAMPLES` names it in one place so the struct field and both clamps stay in sync (`skald-backend/core/codegen_analysis.odin::MAX_DELAY_SAMPLES`) — a genuinely sample-rate-dependent ceiling, not a seconds one: 2 s at 48 kHz, 2.176 s at 44.1 kHz, 1.0 s at 96 kHz (KI-043).

Per sample, in the bus block, the generated code does four things (`skald-backend/core/codegen_nodes.odin::generate_delay_code`):

```odin
delay_samples := int(math.clamp(delayTime * sample_rate, 1, 96000-1))
read_index    := (write_index - delay_samples + len(buffer)) % len(buffer)
delayed       := buffer[read_index]
buffer[write_index] = input + delayed * math.clamp(feedback, 0.0, 0.95)
write_index = (write_index + 1) % len(buffer)
out = input * (1.0 - mix) + delayed * mix
```

Three details worth pulling out.

The read happens **before** the write, so the buffer slot you read is genuinely `delay_samples` old and the first repeat arrives at exactly `delayTime`. The `+ len(buffer)` before the modulo is there because Odin's `%` keeps the sign of the left operand — without it, a write index near the start of the buffer would produce a negative index and crash.

The minimum of **1 sample** in the clamp is not cosmetic. With `delayTime = 0` the read index would equal the write index, which reads the slot from one full buffer wrap ago — a 2-second delay, not a 0 ms one (`skald-backend/core/codegen_nodes.odin::generate_delay_code`). A zero delay time used to give you the longest possible delay.

The feedback clamp is applied **at the point of use**, on the value itself, every sample. That is what makes it safe against a runtime `set_param` as well as against a bad literal in the JSON. The buffer line is the feedback comb filter `b[n] = x[n] + g·b[n−M]` in one statement, and the output line is a linear dry/wet crossfade of `x[n]` against `b[n−M]`. Expanding the recursion, the wet signal is `Σ gᵏ·x[n − (k+1)M]` — the exponentially decaying, evenly spaced echo train from the theory section, exactly.

BPM sync replaces `delayTime` with the expression `((60.0 / p.bpm) * beats)` before any of this, where `beats = 4/denominator`, halved by two-thirds for triplets (`skald-backend/core/codegen_analysis.odin::bpm_sync_seconds_expr`), and the substituted expression then runs through the very same buffer clamp shown above. Because `p.bpm` is a runtime field rather than a constant, the delay re-times itself whenever the tempo changes — but that also means a synced time that resolves past the buffer (a whole-note `1/1` below 120 BPM, say) is silently clamped to the buffer length with no warning, so the audible repeat rate quietly stops matching the division shown in the panel's hint (KI-044).

## Terms introduced

- **Delay line** — a block that outputs its input a fixed time later: `y(n) = x(n − M)`.
- **Ring buffer / circular buffer** — a fixed-length block of memory with a write pointer that wraps at the end; reading `M` slots behind the writer gives you the signal from `M` samples ago.
- **Feedback** — the fraction of the delayed output fed back into the delay's input, producing repeated echoes rather than one.
- **Feedback comb filter** — the structure `y(n) = x(n) + g·y(n−M)`; a delay line with feedback, equivalent to a series of exponentially decaying, evenly spaced echoes, and equivalently a filter with regularly spaced peaks in its frequency response.
- **Feedback gain (`g`)** — the multiplier applied on each pass round the loop. Must be below 1 for stability.
- **Comb filtering** — the notched frequency response produced by mixing a signal with a short copy of itself; heard as hollowness or "phasiness" rather than as an echo.
- **Wet / dry** — the processed signal (wet) versus the untouched original (dry). "Mix" sets the balance.
- **Precedence effect / Haas effect** — the perceptual rule that two arrivals of the same sound separated by less than roughly 30 ms fuse into one event, located at the first arrival.
- **Echo threshold** — the delay time above which a repeat is heard as a distinct second event; roughly 50 ms for impulsive sounds, longer for sustained ones.
- **Slapback** — a single fast repeat, roughly 60–140 ms, no feedback; adds body and attitude rather than rhythm.
- **Ping-pong delay** — repeats that alternate between the left and right channels.
- **Multi-tap delay** — several taps read from one delay buffer at different distances, giving an irregular rhythmic pattern.
- **Dub delay** — long, heavily fed-back repeats used as an arrangement element, originating in 1970s Jamaican production.
- **Tempo sync / note division** — expressing delay time as a musical fraction (1/4, 1/8, 1/8t) of the bar so repeats land on the grid.
- **Triplet** — a division two-thirds the length of the straight one; three fit in the space of two.
- **T60 / 60 dB decay** — the time for a decaying signal to fall to one thousandth of its starting amplitude; a standard way of quoting tail length.
- **Bus domain (Skald-specific)** — the part of the graph that runs once per sample on the summed voices, starting at the first Delay or Reverb. The opposite is the voice domain, which runs once per sounding note.
- **Exposed parameter (Skald-specific)** — a parameter promoted from a baked-in constant to a real processor field with a clamped runtime setter, so a game (or the live preview) can change it without recompiling.
- **P-lock** — a per-step parameter override in the sequencer; automatically exposes the parameter it targets.

## Known issues

Defects that touch this chapter are tracked centrally in the **Known issues** chapter (`KNOWN-ISSUES.md`): KI-001, KI-002, KI-043, KI-044. Deliberate design limits — things Skald does not do on purpose — are collected in **What Skald deliberately does not do**.
