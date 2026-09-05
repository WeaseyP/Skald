# Building "Space Funk" From Nothing

> One song, six instruments, ninety minutes: you will build every patch in `space-funk.skald.json` by hand, and by the end you will know why each of its numbers is the number it is.

This chapter assumes you have read *Foundations* and nothing else. You do not
need to read a node chapter first — every node is introduced here as you reach
it, with a pointer to its chapter if you want the full reference afterwards.
You do not need to be able to read music. You need Skald open and about ninety
minutes, and you can stop after any exercise.

**What you are building:** a four-bar loop that sounds like the soundtrack to a
level set in orbit. A slow chord pad that never quite settles, a tight dry drum
kit, a bass line that plays sixteenth-note funk underneath, and a glassy arp on
top whose tone changes randomly on every sixteenth.

**The finished file:** `examples/snes-kit/songs/space-funk.skald.json` — 6
instruments, 6 sequencer tracks, 214 notes, 64 steps, 104 BPM.

**The patches on their own:** `examples/snes-kit/instruments/` and
`examples/snes-kit/drums/`. Each is the same instrument as in the song, saved
with a one-bar demo line so you can audition it alone.

Work in this order: listen, then build the drums, then the bass, then the pad,
then the arp, then write the parts, then mix. That order is deliberate — it is
cheapest to hear a mistake when there are two instruments playing, and
impossible when there are six.

---

## What it is

### The vibe, decomposed into three jobs

"Spacey" and "cerebral" are not settings. They are what you perceive when three
layers are doing three different jobs at three different speeds, and the gaps
between them are audible.

| Layer | Speed — Job | In this song |
|---|---|---|---|
| **Bed** | Slower than the music — Fills the space between notes so silence is never empty. Has no rhythm of its own. | Space Pad — one chord per bar, 0.9 s attack, 6 s reverb |
| **Pulse** | Exactly the music — Tells you where the beat is. Must be dry and short or it fights the bed. | Kick, Snare, Hat, Slap Bass |
| **Sparkle** | Faster than the music — Gives your ear detail to follow. Should never repeat exactly. | Starfield Arp — sixteenth notes, random filter per note |

Remove the bed and it becomes a funk loop. Remove the pulse and it becomes
ambient. Remove the sparkle and it becomes a backing track. The
three-at-once is the whole effect, and every design decision below serves one
of those three jobs.

### The six instruments in one sentence each

- **SNES Kick** — a 52 Hz sine whose pitch falls two octaves in 50 ms.
- **SNES Snare** — band-passed noise plus a 190 Hz triangle, in a small room.
- **SNES Hat** — noise through a highpass, open for 45 milliseconds.
- **SNES Slap Bass** — a saw whose filter snaps open and shut on every note.
- **SNES Space Pad** — six detuned saws, a very slow filter sweep, a long reverb.
- **SNES Starfield Arp** — a triangle ping through a resonant filter that a
  random-number generator re-tunes every sixteenth note.

Three of those six are the *same idea* — a source, an amplitude envelope, a
filter, and a second modulator on the filter. Once you have built the kick you
have built 60% of the snare, the bass and the pad. That repetition is not
laziness; it is what a synthesiser is.

---

## What it looks like in Skald

### The signal chains

Read these left to right. `──▶` is a wire into the main `input` handle (audio).
`╌╌▶` is a wire into an `input_<param>` handle (modulation). Node ids are the
ones in the saved files, so you can find them in the JSON.

```
KICK  (drums/kick.skald.json)
  kick-osc (Sine 52 Hz, fixed) ──▶ kick-amp (ADSR) ──▶ kick-punch (Distortion) ──▶ kick-output
                    ▲
                    ╎ input_freq
  kick-pitch (ADSR) ──▶ kick-pitch-map (Mapper 0…1 → 0…2.2 octaves) ╌╌╯

SNARE  (drums/snare.skald.json)
  snare-noise (White) ──▶ snare-band (Bandpass 2200) ──▶ snare-noise-env (ADSR) ──▶ ┐
  snare-tone-osc (Tri 190 Hz, fixed) ──▶ snare-tone-env (ADSR) ─────────────────────┤
                                                        snare-mix (Mixer ×2) ◀──────┘
                                                             │
                                        snare-room (Reverb) ◀─┘ ──▶ snare-output

HAT  (drums/hat.skald.json)
  hat-noise (White) ──▶ hat-hp (Highpass 7000) ──▶ hat-env (ADSR) ──▶ hat-output

SLAP BASS  (instruments/slap-bass.skald.json)
  bass-osc (Saw) ──▶ bass-amp (ADSR) ──▶ bass-filter (Lowpass 420, Q 3.5) ──▶ bass-grit (Distortion) ──▶ bass-output
                                                  ▲
                                                  ╎ input_cutoff
  bass-fenv (ADSR) ──▶ bass-fmap (Mapper 0…1 → 200…3600 Hz) ╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╌╯

SPACE PAD  (instruments/space-pad.skald.json)
  pad-osc (Saw) ──▶ pad-amp (ADSR) ──▶ pad-filter (Lowpass 900) ──▶ pad-space (Reverb) ──▶ pad-output
                                              ▲
                                              ╎ input_cutoff
  pad-drift-lfo (LFO 0.12 Hz) ──▶ pad-drift-map (Mapper −1…1 → −450…450 Hz) ╌╌╌╯

STARFIELD ARP  (instruments/starfield-arp.skald.json)
  arp-osc (Tri) ──▶ arp-amp (ADSR) ──▶ arp-filter (Lowpass 1200, Q 6) ──▶ arp-echo (Delay 1/8) ──▶ arp-output
                                                ▲
                                                ╎ input_cutoff
  arp-sh (S&H 1/16) ──▶ arp-sh-map (Mapper −1…1 → −700…1800 Hz) ╌╌╌╌╌╌╌╌╌╯
```

Four things to notice before you build anything.

**Every chain ends in Output.** Nothing reaches your speakers otherwise.

**The ADSR is doing two different jobs in the same patch.** In the audio chain
it is a volume control — the generated code multiplies whatever arrives at its
`input` by the envelope (`skald-backend/core/codegen_nodes.odin::generate_adsr_code`). In the
modulation chain (`kick-pitch`, `bass-fenv`) nothing is wired into its `input`,
so the code substitutes the literal `1.0`
(same proc) and the output is the bare envelope
shape, 0 to 1. Same node, two jobs, decided entirely by whether you plugged
anything into it.

**Every modulation wire goes through a Mapper.** Four of the six patches have
one. This is not decoration — see *The Mapper is not optional*, below.

**Reverb and Delay are always last.** They must be. Skald splits the graph into
a *voice domain* (runs once per held note) and a *bus domain* (runs once per
sample, after all the notes are summed), and Oscillator, ADSR, FM Operator,
Wavetable and MIDI Input can only exist in the voice domain
(`skald-backend/core/codegen_analysis.odin::is_voice_coupled_type`). Put an ADSR after a Reverb and code
generation stops with an error telling you to move it
(`skald-backend/core/codegen_analysis.odin::compute_bus_domain`). The reason is physical: a delay line
holds one shared buffer of the recent past, and there is no per-note "recent
past".

### The clock, in milliseconds

Everything below is easier to reason about once you know how long a step is.
The generated engine computes `samples_per_step = sample_rate × 60 / (bpm × 4)`
(`skald-backend/core/codegen_project.odin::generate_sequencer_logic`) — one step is a sixteenth note.

| At 104 BPM | Duration |
|---|---|
| One step (1/16) | **144 ms** |
| One beat (4 steps) | 577 ms |
| One bar (16 steps) | 2.31 s |
| The whole loop (64 steps) | **9.23 s** |

Hold that 144 ms in your head. It is the number every envelope in this song is
measured against, and several of them are tuned to land just inside it.

---

## The controls

### Every number in the song, and what it does

Cited to the standalone patch files, which are the files you will open.

#### Kick — `drums/kick.skald.json`

| Node | Setting | Why |
|---|---|---|
| `kick-osc` | Waveform — Sine | A kick is one low tone. A saw here would put harmonics all through the bass guitar's range. |
| ↳ | Frequency — 52 Hz | The pitch you are left with after the drop. Roughly G#1. |
| ↳ | **Fixed Pitch** — true | Ignore the played note. Every sequencer note produces the same drum. Without this, a kick on MIDI 36 and one on MIDI 48 would be different drums. |
| `kick-amp` | A / D / S / R — 0.001 / 0.22 / 0 / 0.04 | Sustain **0** is what makes it a hit rather than a note: it decays to silence whether or not you hold the step. 0.22 s is 1.5 steps. |
| `kick-pitch` | A / D / S / R — 0.001 / 0.05 / 0 / 0.01 | The click. 50 ms is a third of a step — you hear it as attack, not as pitch. |
| `kick-pitch-map` | in 0→1, out 0→2.2 | **Octaves**, not hertz. 52 × 2^2.2 = 239 Hz, so the drum starts at ~240 Hz and falls to 52 Hz in 50 ms. |
| `kick-punch` | Drive 14, Shape soft, Tone 2400, Mix 0.4 | `soft` is `tanh` (`skald-backend/core/codegen_nodes.odin::generate_distortion_code`). Mix 0.4 means 60% of the signal is untouched, so the weight survives and only the attack gains bite. |

#### Snare — `drums/snare.skald.json`

| Node | Setting | Why |
|---|---|---|
| `snare-noise` | White, amp 0.8 | The rattle. Noise is every frequency at once, which is why every snare on earth has noise in it. |
| `snare-band` | **Bandpass** 2200 Hz, Q 1.8 | Bandpass keeps a band and discards both ends. Full-range noise sounds like static; 2.2 kHz-ish noise sounds like a snare. |
| `snare-noise-env` | 0.001 / 0.16 / 0 / 0.05 | 160 ms — just over one step. |
| `snare-tone-osc` | Triangle 190 Hz, fixed, amp 0.35 | The shell. A drum has a pitch even though you do not think of it as pitched. |
| `snare-tone-env` | 0.001 / **0.09** / 0 / 0.03 | Deliberately *shorter* than the rattle: the body thumps and the rattle keeps going. Real snares behave that way. |
| `snare-mix` | 2 inputs, levels 0.85 / 0.6 | Rattle louder than shell. Swap them and you get a tom. |
| `snare-room` | Decay 1.1 s, Pre-delay 0.008 s, Mix 0.22 | 8 ms pre-delay puts the room *behind* the hit instead of on top of it. Mix 0.22 keeps the transient in front. |

#### Hat — `drums/hat.skald.json`

| Node | Setting | Why |
|---|---|---|
| `hat-hp` | **Highpass** 7000 Hz | Highpass keeps what is above the cutoff. All sizzle, no body — so it never collides with the snare. 7000 Hz is deliberately near the real ceiling this filter can reach at all (KI-037 in **Known issues**), not a quarter of the way up an advertised 20 kHz slider. |
| `hat-env` | 0.001 / **0.045** / 0 / 0.02 | 45 ms. A third of a step. Short is the entire sound. |
| ↳ | Velocity Sens. **0.8** | High, because the hat plays every step and the only thing separating the beat from the off-beat is velocity. |

#### Slap Bass — `instruments/slap-bass.skald.json`

| Node | Setting | Why |
|---|---|---|
| Instrument | voiceCount **1**, glide 0.02 | Monophonic on purpose. One voice means every new note *steals* the only voice, and glide only fires on a steal (`skald-backend/core/codegen_processor.odin::generate_processor_code`), so every note gets a 20 ms slide into pitch. That smear is what makes a bass line sound fingered rather than typed. |
| `bass-osc` | Sawtooth, amp 0.6 | Bright and harmonically full, because the filter is about to remove most of it. You cannot filter harmonics that are not there. |
| `bass-amp` | 0.002 / 0.18 / **0.35** / 0.08 | Sustain 0.35: the note drops to a third of its peak and stays there for as long as the step lasts. Percussive but not gated. |
| `bass-filter` | Lowpass **420 Hz**, Q **3.5** | 420 Hz on its own is a dull thud. That is the point — the envelope supplies the brightness. Q 3.5 emphasises whatever the cutoff is passing over, which is what makes the sweep *audible* rather than merely present. |
| `bass-fenv` | 0.001 / **0.09** / 0.1 / 0.05 | 90 ms: shorter than the amp envelope, so the brightness is gone long before the note is. That gap is the slap. |
| `bass-fmap` | in **0→1**, out **200→3600 Hz** | Unipolar in, because an envelope never goes negative. |
| `bass-grit` | Drive 8, soft, Tone 2600, Mix 0.3 | Presence without losing the fundamental — 70% of the signal is still clean. |

The bass filter is worth doing the arithmetic on, because it shows how
modulation actually combines. Modulation is **added** to the knob
(`skald-backend/core/param_utils.odin::get_f32_param`), and the Mapper interpolates
between its output bounds (`skald-backend/core/codegen_nodes.odin::generate_mapper_code`):

| Envelope value | Mapper output | Actual cutoff |
|---|---|---|
| 1.0 (note-on peak) | 3600 Hz | 420 + 3600 = **4020 Hz** |
| 0.1 (sustain) | 540 Hz | 420 + 540 = **960 Hz** |
| 0.0 (fully released) | 200 Hz | 420 + 200 = **620 Hz** |

So each note snaps to 4 kHz and shuts to 960 Hz in 90 milliseconds. Note the
third row: because `outMin` is 200 rather than 0, the cutoff never returns to
the 420 Hz on the knob. `outMin` is an offset that is always added. This trips
up everyone once.

#### Space Pad — `instruments/space-pad.skald.json`

| Node | Setting | Why |
|---|---|---|
| Instrument | voiceCount **8** | The chords are five notes and the release is 1.8 s, so held notes plus dying notes can easily need seven or eight voices at once. A voice is not free again until its release finishes. |
| Instrument | **unison 6, detune 22** | Six copies of the oscillator per voice, spread over 22 cents. This is the width. It costs nothing in level: the generator averages the copies rather than summing them (`skald-backend/core/codegen_nodes.odin::generate_oscillator_code`). |
| `pad-amp` | **0.9** / 1.2 / 0.7 / **1.8** | A 0.9 s attack is 6 steps — the chord arrives late, on purpose. The 1.8 s release (12 steps) means each chord is still fading while the next one starts. That overlap is most of the "space". |
| `pad-filter` | Lowpass 900 Hz, Q 1.2 | Dark. A pad that is as bright as the arp competes with it. |
| `pad-drift-lfo` | Sine **0.12 Hz**, amp 1 | One cycle every 8.3 seconds — 3.6 bars, so it never lines up with the music and never sounds like a rhythm. |
| `pad-drift-map` | in **−1→1**, out **−450→450** | Bipolar in, because an LFO swings both sides of zero. Cutoff travels 450 → 1350 Hz. |
| `pad-space` | Decay **6 s**, Pre-delay 0.06, Mix 0.55 | A 6-second tail is 2.6 bars: the reverb never fully clears, which is exactly why the track sounds like it is happening somewhere enormous. 60 ms of pre-delay keeps the chord's own attack readable in front of it. |

#### Starfield Arp — `instruments/starfield-arp.skald.json`

| Node | Setting | Why |
|---|---|---|
| `arp-osc` | **Triangle**, amp 0.45 | Triangle has a few quiet harmonics — glassy rather than buzzy. A saw here would be harsh at this pitch. |
| `arp-amp` | 0.001 / **0.14** / 0 / 0.1 | 140 ms against a 144 ms step. Each ping finishes about 4 ms before the next one starts, which is why sixteen notes a bar sound like sparkle instead of mush. |
| `arp-filter` | Lowpass 1200, Q **6** | High resonance so the random cutoff is *audible as pitch colour*, not just as brightness. |
| `arp-sh` | Sample & Hold, **bpmSync 1/16** | Latches a new random value every sixteenth. At 104 BPM a 1/16 sync is 144 ms — exactly one step, so the colour changes on the note, not across it. |
| `arp-sh-map` | in −1→1, out **−700→1800** | Cutoff wanders 500–3000 Hz, randomly, forever. |
| `arp-echo` | Delay, **bpmSync 1/8**, Feedback 0.5, Mix 0.4 | 1/8 at 104 BPM = 288 ms, so echoes land on the following off-beat. Feedback 0.5 halves each repeat — four or five audible tails. |

### Two numbers in these files do nothing, and you should know why

`arp-sh` stores `"rate": 8` (`examples/snes-kit/instruments/starfield-arp.skald.json::rate`) and `arp-echo` stores `"delayTime": 0.28`
(`examples/snes-kit/instruments/starfield-arp.skald.json::delayTime`). Both are ignored, because both nodes have `bpmSync: true`, and while
sync is on the time base comes from the musical division instead
(`skald-backend/core/codegen_analysis.odin::bpm_sync_seconds_expr`). That an
unsynced free-run field sits inert behind a synced one is deliberate — see
*What Skald deliberately does not do* for why. They stay in the file so that
turning sync off gives you something sensible rather than zero.

---

## Try it (hands-on)

Nine exercises. Do them in order. **Press Play in the sidebar first** and leave
it playing — Skald recompiles and hot-swaps as you edit, so you hear changes
without stopping. To fire a note on a patch with no sequencer line yet, select
the Output node and press **Test Audio** (`skald-ui/src/components/ParameterPanel.tsx::ParameterPanel`), which plays
middle C at full velocity for 200 ms (`skald-ui/src/hooks/nodeEditor/useWasmAudioEngine.ts::useWasmAudioEngine`).

### Exercise 0 — Hear the finished thing, then take it apart (10 minutes)

1. **Open File...** `examples/snes-kit/songs/space-funk.skald.json` (Sidebar → Load).
   Six instrument cards, six tracks in the dock at the bottom.
2. **Play.** Let it loop twice.
3. **Solo each track in turn** with the **S** button in the track list. Listen
   for the three jobs from the table above: which tracks are the bed, which are
   the pulse, which is the sparkle.
4. **Mute the pad** (**M**). Notice how much less "space" there is — and that
   nothing about the groove changed. The bed contributes no rhythm at all.
5. **Mute the arp instead.** Now it is a competent funk loop with no personality.
   That is what the sparkle layer is for.
6. **Mute both.** This is the pulse layer alone: kick, snare, hat, bass. It
   should still feel good. If a loop does not work at this stage, no amount of
   pad and arp will save it.

Now start a new empty canvas. You are going to rebuild all of it.

### Exercise 1 — Build the kick (15 minutes)

The kick teaches the single most useful trick in the whole chapter: an envelope
on something that is not volume.

1. Drag an **Oscillator** onto the canvas. Set Waveform **Sine**. Tick **Fixed
   Pitch (ignore note)** — the Frequency box appears once you do — and set
   Frequency **52**.
2. Drag an **Output**. Wire Oscillator `Out` → Output `In`. Press Test Audio.
   You get a low hum that clicks off. There is no envelope, so the voice is just
   switched off when the note ends.
3. Drag an **ADSR**. Delete the wire you just made. Wire Oscillator `Out` → ADSR
   `Gate`, ADSR `Env` → Output `In`. Set **A 0.001 / D 0.22 / S 0 / R 0.04**.
   Test Audio: a soft thud. The click is gone. *The ADSR is your volume control.*
4. **Hear why sustain 0 matters.** Set Sustain to 0.8 and Test Audio. It is now
   a bass note that lasts as long as the step. Put it back to 0.
5. Now the drop. Drag a **second ADSR** and place it below the first. Set **A
   0.001 / D 0.05 / S 0 / R 0.01**. Wire *nothing* into its input. Its output is
   now the bare envelope: 0 → 1 → 0 in 50 ms.
6. Drag a **Mapper**. Wire ADSR-2 `Env` → Mapper `In`. Set **In Min 0, In Max 1,
   Out Min 0, Out Max 2.2**.
7. Wire Mapper `Out` → Oscillator **`Freq`** (`input_freq`). Test Audio.
   **That** is a kick drum.
8. **Understand what just happened.** `input_freq` is measured in **octaves**,
   exponentially: the code computes `base × 2^mod`
   (`skald-backend/core/codegen_nodes.odin::generate_oscillator_code`). Out Max 2.2 means "up to 2.2 octaves
   above 52 Hz", i.e. 239 Hz. **Try this:** set Out Max to 0.3 — a soft
   floor-tom thump. Set it to 6 — a laser. Set it back to 2.2.
9. **Break it on purpose.** Delete the Mapper and wire ADSR-2 straight into
   `Freq`. Test Audio. Still a kick, but a weaker one: the envelope's raw 0…1
   output is now 0…1 *octaves*, so the drum only starts at 104 Hz. Now do the
   same experiment on a cutoff instead — that is where the raw range is useless,
   and it is Exercise 3.
10. Drag a **Distortion** between the amp ADSR and the Output. Shape **soft**,
    Drive **14**, Tone **2400**, Mix **0.4**. Test Audio: same weight, harder
    attack. **Try this:** push Mix to 1.0 and listen to the bottom end
    disappear — a waveshaper converts fundamental energy into harmonics. Back
    to 0.4.
11. Select all six nodes (drag a box), press **Create Instrument**
    (`skald-ui/src/components/Sidebar.tsx::Sidebar`), name it `SNES Kick`. It collapses to one card and a
    sequencer track appears. Click the Instrument and set **Voice Count 2**.
12. In the dock, click steps **0, 7, 10 and 14** on the kick track. Set the
    project **BPM to 104** and **Steps to 16** in the sequencer toolbar. Press
    the sequencer's Play. You have a groove.

*Why voiceCount 2 and not 1:* at step 14 the previous kick's 220 ms tail is
still sounding. With one voice the new hit would steal it and cut the tail
short.

### Exercise 2 — Build the snare and the hat (15 minutes)

Both are noise plus a filter plus a very short envelope. Building them
back-to-back teaches what a filter *type* actually decides.

**Hat first, because it is four nodes.**

1. **Noise** (leave it White, set Amplitude 0.7) → **Filter** → **ADSR** →
   **Output**.
2. On the Filter set Type **Highpass**, Cutoff **7000**, Res 1.2.
3. On the ADSR set **A 0.001 / D 0.045 / S 0 / R 0.02**, and Velocity Sens.
   **0.8**.
4. Test Audio. A hat.
5. **Hear the type decide the instrument.** Change the filter Type to
   **Lowpass**, same cutoff. It becomes a burst of static — everything below
   7 kHz is now passing. Change it to **Bandpass**: a thin tick. Back to
   Highpass.
6. **Hear the ceiling.** Drag Cutoff up to 20000. Nothing gets thinner past
   about 7.7 kHz, because the generated filter clamps to `sample_rate × 0.16`
   (`skald-backend/core/codegen_nodes.odin::generate_filter_code`, KI-037). The slider lies; the code wins.
7. Wrap it in an Instrument named `SNES Hat`, Voice Count 4. Paint all 16 steps.
   Then **Ctrl+drag vertically** on the steps that fall on beats (0, 4, 8, 12)
   to push their velocity up to about 0.7, and leave the rest near 0.3
   (`skald-ui/src/components/Sequencer/StepGrid.tsx::StepGrid`). Play. That velocity difference *is* the groove —
   the notes are identical.

**Now the snare, which is the same idea twice, mixed.**

1. **Noise** (amp 0.8) → **Filter** (**Bandpass**, 2200, Q 1.8) → **ADSR**
   (0.001 / 0.16 / 0 / 0.05).
2. **Oscillator** (Triangle, **Fixed Pitch**, 190 Hz, amp 0.35) → **ADSR**
   (0.001 / **0.09** / 0 / 0.03).
3. Drag a **Mixer**, set **Inputs 2**. Wire the noise ADSR → `input_1` and the
   tone ADSR → `input_2`. Set channel levels **0.85** and **0.6**.
4. Drag a **Reverb** after the Mixer, then the **Output**. Set Decay **1.1**,
   Pre-delay **0.008**, Mix **0.22**.
5. Test Audio. **Try this:** set reverb Mix to 0.8. It stops being a snare in a
   room and becomes a snare in a swimming pool, and the transient vanishes. Back
   to 0.22.
6. **Try this:** set Pre-delay to 0 and then to 0.25 (its maximum,
   `schema/nodes.json::generic`). At 0 the room smears the hit; at 0.25 you hear
   the hit and *then*, a quarter-second later, a separate room. 8 ms is the
   "same room as the drum" setting.
7. **Break it usefully:** swap the two mixer levels — shell 0.85, rattle 0.6.
   You now have a tom. Two numbers.
8. Wrap it as `SNES Snare`, Voice Count 3. Paint steps **4 and 12**.

### Exercise 3 — Build the funk bass (20 minutes)

This is the most important exercise in the chapter. Everything here is the
two-envelope pattern from the kick, applied to a filter instead of a pitch.

1. **Oscillator** (Sawtooth, amp 0.6, Fixed Pitch **off**) → **ADSR** (A 0.002 /
   D 0.18 / S 0.35 / R 0.08) → **Filter** (Lowpass, **420**, Res **3.5**) →
   **Distortion** (soft, drive 8, tone 2600, mix 0.3) → **Output**.
2. Wrap it in an Instrument called `SNES Slap Bass`. Set **Voice Count 1**,
   **Glide 0.02**.
3. Paint a few notes low on the bass track and play. It sounds like a dull,
   muffled buzz. Correct so far — the filter is doing what you told it.
4. Now, **the mistake everyone makes first.** Explode the Instrument, drag in a
   second **ADSR**, set it to A 0.001 / D 0.09 / S 0.1 / R 0.05, and wire its
   `Env` **straight** into the Filter's **`Cut`** handle. Rebuild, play.
   *Nothing changes.* Not subtly — audibly nothing.
5. **Why:** modulation is added to the parameter, not scaled to it
   (`skald-backend/core/param_utils.odin::get_f32_param`). Your envelope swings from 0
   to 1, so the cutoff is travelling from 420 Hz to 421 Hz. One hertz.
6. **Fix it.** Drag in a **Mapper**. Rewire: ADSR-2 `Env` → Mapper `In`, Mapper
   `Out` → Filter `Cut`. Set **In Min 0, In Max 1, Out Min 200, Out Max 3600**.
   Rebuild and play.

   That is the slap. It appeared the moment you scaled the modulation into the
   units the destination speaks.
7. **Feel the range.** Drag `outMax` to 800: a soft fingered bass. To 8000: a
   synth lead. Land back at 3600.
8. **Feel the speed.** Set the filter envelope's Decay to 0.4 — the brightness
   now outlasts the note and it sounds like a pad. Set it to 0.02 — a click with
   no body. 0.09 is the slap.
9. **Feel the resonance.** Drop the Filter's Res from 3.5 to 1.0: the sweep is
   still there but you stop *hearing it travel*. Push it to 15: the filter
   starts to whistle at whatever frequency it is passing. Resonance is what
   makes a filter sweep a musical event. Back to 3.5.
10. **Feel the monophony.** Set Voice Count to 4 and play a line with notes
    close together. The slides disappear, because glide only fires when a note
    has to steal a voice and with four voices it rarely does. Back to 1.
11. **Get the In Min wrong on purpose.** Set the Mapper's `inMin` to −1. Now the
    envelope's 0…1 only covers the *top half* of the input range, so the cutoff
    never drops below about 2300 Hz and the note stops closing. Unipolar sources
    (envelopes) want `inMin 0`; bipolar sources (LFOs, S&H) want `inMin −1`.
    Getting this backwards is the second most common Mapper error. Put it back
    to 0.

### Exercise 4 — Build the space pad (20 minutes)

1. **Oscillator** (Sawtooth, amp 0.35) → **ADSR** → **Filter** (Lowpass 900,
   Q 1.2) → **Output**. Set the ADSR to **A 0.9 / D 1.2 / S 0.7 / R 1.8**.
2. Wrap it as `SNES Space Pad`. Voice Count **8**. Paint a five-note chord all
   on step 0 of one track — MIDI **50, 53, 57, 60, 64** — each with duration 16
   (select a note, set Duration in the panel). Play.

   It should sound thin and slightly cheap. Everything from here is what turns
   that into a bed.
3. **Width.** Select the Instrument, set **Unison 6** and **Detune 22**. Play
   again. The same chord is now wide and moving. What you are hearing is
   **beating**: six copies a few cents apart drift in and out of phase, and
   their sum swells and thins.
   **Try this:** Detune 0 — it collapses to one flat saw. Detune 60 — it sounds
   out of tune rather than wide. The musical zone is roughly 10–35 cents.
   Note that it does not get louder as you add copies: the generator divides by
   the unison count (`skald-backend/core/codegen_nodes.odin::generate_oscillator_code`).
4. **Slowness.** Drag in an **LFO** and a **Mapper**. LFO: Waveform Sine,
   Frequency **0.12**, Amplitude 1, BPM Sync **off**. Mapper: **In −1, In Max 1,
   Out −450, Out 450**. Wire LFO → Mapper → Filter `Cut`. Play and wait.

   Note the Mapper's In Min is **−1** here, not 0. An LFO is bipolar. If you
   leave it at 0 you throw away the entire negative half of the sweep.
   **Try this:** set the LFO frequency to 3 Hz. It stops being drift and becomes
   a wobble — you can now *count* it, so it reads as rhythm and fights the
   drums. The rule for a bed is: slower than the bar. 0.12 Hz is one cycle every
   8.3 s, which is 3.6 bars at this tempo.
5. **Depth.** Drag a **Reverb** in between the Filter and the Output. Decay
   **6**, Pre-delay **0.06**, Mix **0.55**. Play.
   That is the space.
   **Try this:** Pre-delay 0 — the chord's attack gets swallowed and the whole
   thing sounds distant and vague. 0.06 keeps the chord in front of its own
   room. **Try this:** Decay 1.0 — a room. 6.0 — a canyon. The reverb tail is
   longer than the bar, so it never clears; that is intentional and it is why
   the loop point does not sound like a seam.
6. **Prove the domain rule.** Try to drag the Reverb *before* the ADSR (delete
   two wires, make two). Press **Download Code**. Code generation refuses, with
   a message naming the ADSR and telling you to move it before the effect
   (`skald-backend/core/codegen_analysis.odin::compute_bus_domain`). Undo. This is the rule from *Foundations* biting in
   practice: effects with memory go last.
7. **Voice arithmetic.** Set Voice Count to 4 and play the five-note chord. One
   note is missing — and which one changes, because voices get stolen. With a
   1.8 s release, a chord of five needs five voices held *plus* however many are
   still releasing. 8 is the smallest comfortable number here.

### Exercise 5 — Build the starfield arp (15 minutes)

1. **Oscillator** (Triangle, amp 0.45) → **ADSR** (0.001 / **0.14** / 0 / 0.1)
   → **Filter** (Lowpass **1200**, Res **6**) → **Output**.
2. Wrap it as `SNES Starfield Arp`, Voice Count 4. Paint sixteen sixteenth notes
   climbing and falling through **74, 77, 81, 84** and play. Pleasant, static,
   boring after two bars.
3. Drag in a **Sample & Hold** and a **Mapper**. On the S&H turn **BPM Sync
   on** and set the rate to **1/16**. Mapper: **In −1, In Max 1, Out −700, Out
   1800**. Wire S&H → Mapper → Filter `Cut`. Play.

   Every sixteenth now has a different colour, and the pattern never repeats.
   That is the cerebral part, and it is one node.
4. **Understand the difference from an LFO.** An LFO glides continuously; S&H
   latches a random value and holds it flat until the next tick
   (`skald-backend/core/codegen_nodes.odin::generate_sample_hold_code`). Stepped versus smooth. **Try this:** switch the S&H
   sync to 1/4 — the colour now changes once per beat, which sounds
   deliberate, almost like chord changes. Switch to 1/32: it starts to sound
   like distortion, because the changes are approaching audio rate.
5. **Resonance is what makes it audible.** Drop the Filter's Res from 6 to 1.
   The randomness is still happening and you can barely hear it. Back to 6.
6. Drag a **Delay** between the Filter and the Output. **BPM Sync on**,
   **1/8**, Feedback **0.5**, Mix **0.4**. Play. The arp now leaves trails that
   land on the off-beats.
   **Try this:** Feedback 0.9 — the echoes pile up into a wash and never clear
   (0.95 is the clamp, on every surface — `schema/nodes.json::generic`, `skald-backend/core/codegen_nodes.odin::generate_delay_code`). Feedback 0.2 — one slap-back
   repeat. **Try this:** turn BPM Sync **off** and watch the Delay Time box
   reappear at 0.28 s — close to the synced value at this tempo, but it stops
   tracking the moment you change BPM.
7. **Notice the envelope/step relationship.** Set the amp Decay to 0.4 and play.
   Each ping now outlives the next two, and the sparkle turns to porridge. The
   140 ms decay against a 144 ms step is not an accident — for any part that
   plays every sixteenth, the note has to get out of the way of the next one.

### Exercise 6 — Write the parts (25 minutes)

You now have six instruments. This is where they become a song. Set **BPM
104** and **Steps 64** in the sequencer toolbar (four bars of sixteenths).

**The harmony, for people who do not read music.** A chord is just a few notes
played at once. This song uses four, one per bar, and it repeats. You do not
need to know their names to use them — paint these MIDI numbers on the pad
track, all on the first step of each bar, each with duration 16:

| Bar | Step — Name | MIDI notes |
|---|---|---|---|
| 1 | 0 — D minor 9 | 50, 53, 57, 60, 64 |
| 2 | 16 — B♭ major 7 | 46, 50, 53, 57 |
| 3 | 32 — G minor 9 | 43, 46, 50, 53, 57 |
| 4 | 48 — A 7 | 45, 49, 52, 55 |

The two things worth understanding about that table: the top note of each chord
(the "9" and the "7") is the one that makes it sound thoughtful rather than
plain — drop it and the progression becomes a rock song. And the last chord is
the odd one out. Bars 1–3 use only the seven notes of D minor (D E F G A B♭ C);
the A 7 in bar 4 contains a **C♯** (MIDI 49), the one note in the whole song that
is outside that set. That single foreign note is what makes the loop feel like it
wants to start again rather than stop. The arp follows it — bar 4's tones include
73, the same C♯ an octave up.

In the finished file the chord notes have descending velocities — 0.6, 0.57,
0.54, 0.51, 0.48 — so the top of the chord sits behind the bottom. Chords voiced
with equal velocity sound top-heavy.

**The bass, which is where the funk lives.** The bass plays the *root* of each
chord: **38** in bar 1, **34** in bar 2, **31** in bar 3, **33** in bar 4. The
pattern is the same in every bar, transposed. Per bar, with `r` = that bar's
root:

| Step | Note — Velocity | What it is |
|---|---|---|---|
| 0 | `r` — 1.00 | The downbeat. Loudest thing in the bar. |
| 3 | `r + 12` — 0.70 | Octave pop. |
| 4 | `r` — 0.50 | **Ghost note** — quiet, felt more than heard. |
| 6 | `r + 10` — 0.80 | The flat seventh. This one interval is most of what makes it "funk" rather than "rock". |
| 7 | `r` — 0.60 | Ghost. |
| 10 | `r + 12` — 0.85 | Octave pop. |
| 11 | `r` — 0.50 | Ghost. |
| 13 | `r + 7` — 0.80 | The fifth. |
| 14 | `r` — 0.65 | Pickup into the next bar. |

Every duration is **1**. That matters as much as the notes: at 144 ms per step
these are all short stabs with air between them, and the air is the groove.

**Try this, and then undo it:** set every velocity to 1.0. The line goes
completely flat and mechanical — same notes, no music. Velocity is not
loudness here, it is *articulation*, and the generated scale is
`(1 − sens) + sens × velocity` (`skald-backend/core/codegen_nodes.odin::generate_adsr_code`), so the bass's 0.5
sensitivity turns a 0.5 velocity into 75% amplitude, not 50%.

**Try this:** delete the ghost notes at steps 4, 7 and 11. The line still
works but it stops breathing. Ghost notes are the difference between a bass
part and a bass pattern.

**The drums.** Per bar: kick on **0, 7, 10, 14**; snare on **4 and 12**; hat on
every step, accented on 0, 4, 8, 12. In bars 2 and 4 add quiet snare ghosts on
steps 6 and 11 (velocity ~0.4). In bar 4 add snare on 13, 14, 15 with rising
velocity and a fifth kick on step 15 — that is the fill that resets the loop.

Note where the kick is *not*: there is nothing on step 8, the "3" of the bar,
where a rock beat would put one. Leaving it out is what makes the pattern feel
like it is leaning forward.

**The arp.** Sixteen notes per bar, cycling up and down through the chord tones
two octaves above the pad, accented every fourth note:

| Bar | Tones (MIDI) |
|---|---|
| 1 | 74, 77, 81, 84 |
| 2 | 70, 74, 77, 81 |
| 3 | 67, 70, 74, 77 |
| 4 | 69, 73, 76, 79 |

The step order in the finished file is `0 1 2 3 2 1 0 1 2 3 2 1 0 1 2 3` — up,
down, up, and deliberately *not* symmetrical, so it does not sound like a
machine counting.

The Piano Roll now draws the full MIDI 0–127, so every tone in this song has a
row to land on (`skald-ui/src/components/Sequencer/stepMetrics.ts::MIDI_NOTE_MIN`, `::MIDI_NOTE_MAX`; see KI-005 for the one related surprise, in the Step Grid rather than here).

### Exercise 7 — Mix it so the limiter does not eat it (10 minutes)

Play the whole thing. If you built the patches with the values above, it will
sound loud, slightly dull, and squashed — as though everything is behind a
blanket.

That is the soft limiter — really two of them, stacked. Each instrument's own
`_process` already runs its stereo pair through `skald_soft_limit` before
returning it (`skald-backend/core/codegen_processor.odin::generate_processor_code`),
and the project mix runs the summed result through the same function again
after the master fader (`skald-backend/core/codegen_project.odin::generate_project_code`,
`skald-backend/core/codegen_project.odin::emit_soft_limit_proc`). `tanh` cannot exceed ±1 at either stage, so nothing
ever clips — but as a sum gets hot it progressively squashes, and transients
are the first thing to go. See *Foundations*, "Under the hood", for the full
two-stage picture.

The fix is per-instrument volume. Select each Instrument card and set (values
verified against `examples/snes-kit/songs/space-funk.skald.json`):

| Instrument | Volume in the song | Volume in the solo patch file |
|---|---|---|
| SNES Kick | **0.8** | 0.9 |
| SNES Snare | **0.55** | 0.7 |
| SNES Hat | **0.35** | 0.45 |
| SNES Slap Bass | **0.7** | 0.8 |
| SNES Space Pad | **0.4** | 0.4 |
| SNES Starfield Arp | **0.45** | 0.45 |

Then set the dock's **Master Volume to 0.7**. Play again: same balance, quieter,
but the kick has its attack back and the hats are crisp.

Two general rules fall out of this. **A patch balanced for solo audition is
always too loud in a mix** — every file in the kit ships at its solo level, and
the song turns them down. And **the parts you can hear least are the ones to
turn down**, not up: the hat at 0.35 is audible because nothing else lives at
7 kHz, not because it is loud.

### Exercise 8 — Break it on purpose (10 minutes)

Each of these teaches something and all are one control.

1. **Kill the space.** Set the pad's reverb Mix to 0. The track collapses into a
   flat funk loop. Reverb is not "polish" here, it is a structural layer.
2. **Kill the contrast.** Set the pad's amp Attack to 0.005. Now the pad has a
   sharp attack and starts competing with the drums for the downbeat. Slow
   attack is what keeps the bed out of the way of the pulse.
3. **Kill the randomness.** Delete the wire from the arp's Mapper to the filter.
   Two bars in, the arp becomes wallpaper.
4. **Make the bass fight the kick.** Set the bass filter's cutoff from 420 to
   90. It now sits entirely underneath the kick, and both turn to mud. Bass and
   kick have to occupy different frequencies; this is the cheapest way to hear
   why.
5. **Overrun the voices.** Set the pad's Voice Count to 2 and play. The chords
   come out as random two-note fragments, because a five-note chord over two
   voices means constant stealing.
6. **Push the filter to its most resonant setting.** Set the arp filter's Res
   to 20 while it is playing. It rings hard enough at its cutoff to sound like
   an almost self-contained whistling tone under the arp. It will not truly
   self-oscillate — resonance 20 already pins the internal damping term at its
   floor of 0.05, one clamp step short of the zero damping that would let the
   filter ring with no input at all (`skald-backend/core/codegen_nodes.odin::generate_filter_code`;
   see *What Skald deliberately does not do*). Turn your monitors down first.
7. **Lose the groove.** Set every bass note's duration from 1 to 4. The gaps
   fill in and the funk is gone. Silence was doing the work.

### Exercise 9 — Make it yours (open-ended)

Ordered from safest to boldest.

- **Change the tempo.** 88 BPM makes it heavier; 120 makes it urgent. Everything
  BPM-synced follows automatically — that is the payoff for syncing the delay
  and the S&H instead of typing times in seconds.
- **Change the last chord** from A 7 (45, 49, 52, 55) to A minor 7 (45, 48, 52,
  55). One note lower and the loop stops straining to restart.
- **Swap the sparkle.** Import `instruments/echo-bell.skald.json` and give it
  the arp's part. Bell instead of glass, same function.
- **Make it darker.** Pad filter 900 → 500, arp Mapper `outMax` 1800 → 900, hat
  velocity down 0.1 across the board.
- **Make it eight bars.** Set Steps to 128 and write a second four-bar half
  where the pad drops out and comes back. The grid shrinks its columns to fit
  and scrolls once it hits the minimum width, and the pattern ceiling is 1024
  steps — 64 bars (`skald-ui/src/components/Sequencer/stepMetrics.ts::MAX_PATTERN_STEPS`).
- **Make the hat human.** Alt+drag on hat steps to set probability below 1.0
  (`skald-ui/src/components/Sequencer/StepGrid.tsx::StepGrid`). At 0.7 the pattern varies every bar, decided by the
  processor's PRNG at runtime rather than by you.
- **Use per-track lengths.** Set the hat track's **Len** to 12 while the others
  stay at 64. Each track's notes are dispatched by `current_step % its own
  length` (`skald-backend/core/codegen_project.odin::generate_sequencer_logic`), so the hat now repeats every 12 steps
  against a 16-step bar: its accents land somewhere different in every bar and
  only line up with the bar again after 48 steps. Then the global 64-step loop
  resets the step counter, so bar 1 always starts clean. That is free
  polyrhythm, and it is one number.
- **Ship it.** Expose the pad's reverb `mix` and the arp filter's `cutoff`, then
  press **Download Code**. You get typed setters your game can call to open the
  space up as the player enters a room and to brighten the arp as tension rises.

---

## Why you patch it this way

**Contrast, not quantity.** The reason this loop sounds like more than its six
parts is that no two parts are doing the same job at the same speed. Whenever a
mix sounds crowded, the question is not "what should I remove" but "which two
things are doing the same job".

**Two envelopes per voice, minimum.** One on volume, one on something else —
cutoff, pitch, FM index. A single envelope gives you a note that is loud then
quiet. A second gives you a note that *changes character* as it decays, which is
what every acoustic instrument does and what your ear uses to identify one.

**The Mapper is not optional.** Modulation is added to the parameter with no
scaling (`skald-backend/core/param_utils.odin::get_f32_param`), so a source that swings ±1 moves a
hertz-valued parameter by one hertz. Every modulation wire into a cutoff, a
delay time or an FM ratio needs a Mapper. The exceptions are destinations that
already live in ±1 or 0…1: `input_amp`, `input_gain`, `input_pan`. And
`input_freq` is the trap in the middle — it takes **octaves**, so ±1 raw is a
two-octave siren.

**Match `inMin` to the source's polarity.** Envelopes are unipolar: `inMin 0`.
LFOs and Sample & Hold are bipolar: `inMin −1`. Get it wrong and you silently
lose half your modulation range, because the Mapper clamps its normalised input
to 0…1 (`skald-backend/core/codegen_nodes.odin::generate_mapper_code`).

**Voice count is a musical decision, not a performance one.** 1 for the bass
because monophony *is* the sound. 8 for the pad because five held notes plus
long releases need it. 2–4 for drums so tails are not cut off. Voices are not
freed until release finishes.

**Effects with memory go last.** Reverb and Delay hold one shared buffer, so
Skald runs them after the voices are summed and refuses to put voice-coupled
nodes downstream (`skald-backend/core/codegen_analysis.odin::compute_bus_domain`). In practice: source → envelope →
filter → drive → space → output, every time.

**Sync anything rhythmic.** The arp's delay and S&H are BPM-synced, so the
whole song survives a tempo change. Free-running times are for things that
should *not* line up with the music — like the pad's 0.12 Hz drift, which is
deliberately unsynced so it never falls into step.

**Leave the low end alone.** One instrument below ~120 Hz at a time. The kick
owns the bottom, the bass sits above it at 420 Hz and up, the pad is filtered at
900 Hz, the hat lives above 7 kHz. Nothing overlaps by accident.

---

## Going further

**Add a fifth job: an answer.** The three-layer model has no call-and-response
in it. Import `instruments/echo-bell.skald.json`, give it four notes in bars 2
and 4 only, and the loop starts to feel like it is having a conversation with
itself.

**Try the same six patches at half tempo.** Set BPM to 52 and listen to how much
of the "funk" was tempo rather than notes. This is a fast way to learn which of
your decisions were structural.

**Build the pad's opposite.** Same nodes, inverted values: attack 0.005,
release 0.1, reverb mix 0.1, unison 1. You get a stab. The pad and the stab are
the same graph, which is the point of the *Making instruments more complex*
chapter.

**Read the generated Odin.** Press Generate Code and open the file. Find
`Space_Pad_process` and look for the unison loop, the six `detuned_freq`
calculations, and the reverb code sitting *outside* the voice loop. Reading your
own patch as code is the fastest way to make the voice/bus split stop being
abstract.

**Then go back through the node chapters.** You have now used Oscillator, Noise,
ADSR, LFO, Sample & Hold, Mapper, Filter, Distortion, Delay, Reverb, Mixer and
Instrument. Their chapters will read very differently now that you have a reason
to care about each parameter.

---

## Under the hood

Generating this project emits **six** processor structs and six
`<Asset>_process` procedures, one per Instrument, plus a project-level mix.

Each `_process` call computes one stereo sample pair and has the same shape:

```odin
Space_Pad_process :: proc(p: ^Space_Pad_Processor) -> (f32, f32) {
    sample_rate := p.sample_rate
    Space_Pad_process_sequence(p)        // step clock: fire this step's notes
    p.total_samples += 1

    for v_idx in 0..<8 {                 // <- voiceCount
        voice := &p.voices[v_idx]
        if !voice.active do continue
        // pad-osc: 6 unison copies, averaged
        // pad-amp: envelope multiply
        // pad-filter: cutoff = 900 + mapper output
        // output_left += ...
    }

    // --- Bus effects, once per sample, after the voice sum ---
    // pad-space: reverb pre-delay buffer + tail

    return skald_soft_limit(output_left * 0.4, output_right * 0.4)   // <- Instrument volume, then this asset's own limiter
}
```

Three details specific to this song.

**The step clock is shared, the wrap is per-track.** One counter drives
everything (`samples_per_step = sample_rate × 60 / (bpm × 4)`,
`skald-backend/core/codegen_project.odin::generate_sequencer_logic`), and each track's notes are dispatched by a `switch`
on `current_step % track_length` (same proc). That is why
different tracks can have different lengths and produce polyrhythm for free.

**The pad's reverb has a fixed pre-delay ceiling.** The pre-delay buffer is
`MAX_REVERB_PREDELAY_SAMPLES` = 48000 samples (`skald-backend/core/codegen_analysis.odin::MAX_REVERB_PREDELAY_SAMPLES`), and the tap
is clamped to it (`skald-backend/core/codegen_nodes.odin::generate_reverb_code`) — one second at 48 kHz. The parameter
itself stops at 0.25 s (`schema/nodes.json::generic`), so you cannot reach the
ceiling from the UI.

**Sixteen of the arp's random values per bar come from a per-voice PRNG.** Each
voice holds its own Sample & Hold state (`skald-backend/core/codegen_nodes.odin::generate_sample_hold_code`), so if two arp
notes overlap they get *different* random cutoffs. With `voiceCount 4` and a
140 ms decay against a 144 ms step they barely overlap, which keeps the
sparkle coherent. Raise the decay and you will hear the randomness smear across
voices.

---

## Terms introduced

- **Bed / pulse / sparkle** — not Skald terms; a working division of labour for
  the three speeds a mix needs. Slower than the music, exactly the music, faster
  than the music.
- **Ghost note** — a deliberately quiet note between the accented ones. Felt as
  groove rather than heard as pitch.
- **Beating** — the slow swelling you hear when two nearly-identical pitches
  drift in and out of phase. The mechanism behind unison/detune width.
- **Pre-delay** — the gap between a sound and the start of its reverb. Keeps a
  long tail from swallowing the attack.
- **Stepped modulation** — a modulator that jumps to a new value and holds it
  (Sample & Hold), as opposed to gliding continuously (LFO).
- **Ghost of a voice** — informally, a note still in its release stage. It still
  occupies a voice, which is why release length and voice count are linked.
- **Fill** — a short variation at the end of a repeating pattern (here: bar 4's
  extra snares) that stops a loop from sounding like a loop.
- **Voicing** — which notes of a chord you play and how loud each one is. The
  pad's descending velocities are a voicing decision.
- **Gain staging** — setting levels at every stage so the sum arrives at the
  master limiter below full scale instead of being squashed by it.

---

## Known issues

Defects that touch this chapter are tracked centrally in the **Known issues** chapter (`KNOWN-ISSUES.md`): KI-037. Deliberate design limits — things Skald does not do on purpose — are collected in **What Skald deliberately does not do**.
