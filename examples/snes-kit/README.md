# SNES Kit — 16-bit game music in Skald

A starting kit for writing music in the style of a 16-bit console soundtrack:
bright pulse leads with tempo-locked echo, plucked bells, a funk bass with a
slap filter envelope, brass stabs, and a drum kit with a ringing room snare —
plus the spacier end of that sound, a drifting pad and a random-stepped arp.

Everything here loads into Skald as-is, plays without editing, and generates
Odin. Eleven patches, three songs.

**Reference point:** *The Flintstones (SNES) — Unused Song 2* (Dean Evans /
Ocean). Worth being straight with you: I can't listen to audio, so nothing here
is a transcription of that track. What the kit reproduces is the *idiom* it
belongs to — the sound sources, envelope shapes, echo behaviour and voice
budget of SPC700-era console music — so you have working parts to move toward
whatever you actually hear. Where a choice was a judgement call (tempo, key,
which chords) it is called out below so you can change it.

---

## Start here

1. Sidebar → **Load** → `examples/snes-kit/songs/chase-loop.skald.json`
2. Sidebar → **Play**. Four bars, nine instruments, loops.
3. Mute tracks in the sequencer dock (**M**) to hear how each part contributes.

To pull single instruments into a song you are already writing, use Sidebar →
**Import Patch**. It opens on `examples/` and takes a multi-selection, so
browse into this folder, ctrl-click `kick`, `snare` and `hat`, and import the
lot in one go — each patch lands as its own instrument card with its own
sequencer track. (Point it straight at this kit — or anywhere else — with the
`SKALD_IMPORT_DIR` environment variable.)

Read `docs/manual-source/00-foundations.md` alongside this. Every patch below is
built out of the ideas in that chapter, and the manual explains *why* the
numbers are what they are.

**Want to build this rather than load it?** The manual's last chapter,
*Building "Space Funk" From Nothing* (`docs/manual-source/70-space-funk-build.md`,
or chapter 22 of `docs/manual/skald-manual.html`), walks through every patch in
`songs/space-funk.skald.json` node by node, from an empty canvas, with the
reasoning for each value and an exercise per instrument. Start there if you are
new to synthesis.

---

## What's in the box

### Songs — `songs/`

| File | Tempo | Key / harmony | What it is |
| --- | --- | --- | --- |
| `chase-loop.skald.json` | 148 | A minor: Am – F – G – E | The full nine-instrument arrangement. Drums, bass, chugging guitar, brass stabs, pulse lead, bell fills. |
| `groove-bed.skald.json` | 148 | A minor, same roots | Drums and bass only. Start here when you want to write your own melody over a groove that already works. |
| `space-funk.skald.json` | 104 | D minor: Dm9 – Bb maj7 – Gm9 – A7 | The cerebral one. Drums, sixteenth-note funk bass, drifting pad, random-stepped arp. |

All three are 64 steps — four bars of sixteenths.

### Melodic patches — `instruments/`

| File | Sound | The idea worth stealing |
| --- | --- | --- |
| `pulse-lead.skald.json` | Bright square lead | Two LFOs: one drifts pulse width (movement without vibrato), one adds ±14 cents of vibrato. Delay is BPM-synced to 1/8. |
| `echo-bell.skald.json` | FM bell / marimba | FM operator at ratio 3, long decay, no sustain. Feedback 0.45 on the echo makes it ring past the note. |
| `slap-bass.skald.json` | Funk bass | The whole character is a *second* envelope on filter cutoff: 90 ms decay from 3600 Hz down to 420 Hz. That snap is the slap. |
| `brass-stabs.skald.json` | Brass section | Saw + square layered in a Mixer, unison 2 / detune 8 for section width, fast filter envelope for the "blat". |
| `crunch-guitar.skald.json` | Rhythm guitar | Distortion **before** the amp envelope, so drive stays constant as the note decays. |
| `space-pad.skald.json` | Wide drifting pad | Unison 6 / detune 22 (the beating is the width), 0.12 Hz LFO on cutoff, 6 s reverb with 60 ms pre-delay. |
| `starfield-arp.skald.json` | Glassy random arp | Sample & Hold synced to 1/16 into a resonant cutoff — every sixteenth gets a different colour. |

### Drums — `drums/`

| File | Sound | The idea worth stealing |
| --- | --- | --- |
| `kick.skald.json` | Tight kick | Pitch envelope through a Mapper set to **0 → 2.2 octaves**: a 50 ms drop from ~240 Hz to 52 Hz. |
| `snare.skald.json` | Ringing snare | Band-passed noise + a 190 Hz triangle shell, mixed, then 1.1 s reverb at 22% — the console room sound. |
| `hat.skald.json` | Closed hat | Highpass at 7000 Hz, 45 ms decay, velocity sensitivity 0.8 so accents actually read. |
| `tom.skald.json` | Melodic tom | Pitch *tracks the note* (no fixed pitch), so a fill is just four descending notes in the sequencer. |

---

## Recipes

### "How do we get the space sounds going?"

Three things, and they stack. Load `songs/space-funk.skald.json` and mute your
way around it.

**1. Width comes from detuning, not effects.** `space-pad` runs unison 6 with
detune 22 cents. Six copies of the same saw a few cents apart drift in and out
of phase, and the sum swells and thins — beating. Push detune past 50 cents and
it stops sounding wide and starts sounding broken. Unison is level-safe here:
the generator averages the copies rather than summing them.

**2. Depth comes from pre-delay, and it has a ceiling.** The pad's reverb is
6 s decay, 55% mix, 60 ms pre-delay. Pre-delay is the gap before the reverb
starts, and it is what stops a long tail from swallowing the attack — the note
speaks first, the room answers. The parameter clamps at 0.25 s.

**3. "Cerebral" is slow movement plus random movement.** Two different
modulators doing two different jobs:

- A 0.12 Hz LFO (one cycle per eight seconds) through a Mapper set to ±450 Hz
  on the pad's cutoff. Slower than the music, so it never sounds rhythmic.
- Sample & Hold synced to 1/16 through a Mapper set to −700…+1800 Hz on the
  arp's cutoff, with resonance at 6. Each sixteenth picks a new random cutoff,
  so the arp glitters unpredictably over a fixed note pattern.

Then keep the drums dry and quiet (hats at 0.3 velocity on the off-sixteenths)
and put the funk bass **on top** — short, syncopated, with ghost notes at 0.5
velocity between the accents. The contrast is the whole trick: the pad is
formless and slow, the bass is tight and rhythmic, and the ear reads the gap
between them as space.

### The tempo-synced echo that says "16-bit console"

The SNES sound chip had a hardware echo unit, and composers leaned on it
constantly. Skald's equivalent: a Delay with `bpmSync: true` and
`syncRate: "1/8"`. Sync matters — a synced delay follows the project tempo, so
changing BPM keeps the echo locked instead of smearing. Feedback 0.3–0.5 is the
usable range; the parameter clamps at 0.99 so it decays rather than runs away.
`pulse-lead`, `echo-bell` and `starfield-arp` all use it.

### The two-envelope trick, which is most of what makes these sound like instruments

Every patch here that has character has a second ADSR feeding a filter cutoff
through a Mapper. Nothing wired into that ADSR's input, so its output is the
bare 0…1 envelope; the Mapper scales it into hertz. Fast attack, short decay,
low sustain gives you a bright transient that dies faster than the note — which
is what a pick, a hammer or a slap actually does.

You need the Mapper. A raw envelope swings 0…1, and the generator *adds*
modulation to the parameter, so an unmapped envelope moves a cutoff by one hertz.

---

## Things that will bite you

- **Filter cutoff maxes out around 7680 Hz**, not the 20 kHz the slider shows —
  the generated filter clamps to `sample_rate * 0.16` for stability. `hat` sits
  at 7000 Hz deliberately.
- **Pitch modulation is in octaves, exponentially.** Sending 1.0 to
  `input_freq` moves the note a whole octave. The kick's Mapper tops out at 2.2
  *octaves*; a vibrato Mapper wants about ±0.012.
- **Everything after a Delay or Reverb leaves the voice domain.** Oscillators,
  ADSRs, FM operators and Wavetables cannot go there — codegen refuses. That's
  why every patch here is `source → envelope → filter → space effect → output`.
- **Nothing clips until the master limiter**, which is a `tanh`. Nine
  instruments summing at their solo volumes squashes the transients, so the
  songs pull each instrument's volume down from what the patch files ship with.
  If a mix sounds dull rather than loud, that's this.
- **The piano roll shows MIDI notes 21–84** (A0–C6). Notes outside that range
  play but can't be edited there.
- **Patterns are 16th notes.** 16 steps = one bar. The songs use 64.

---

## Making it longer than four bars

The editor's pattern length now goes to **1024 steps** (64 bars) rather than
stopping at 64. Above roughly two bars the grid shrinks its columns to fit the
dock, and once the cells hit their minimum width the grid scrolls horizontally
while the instrument rows stay put on the left. Per-track length (**Len** in the
track list) has the same ceiling, so a 16-step drum loop can run under a 64-step
melody — each track loops on its own length inside the global pattern.

Two ways to build a real arrangement:

1. **One long pattern.** Set Steps to 256 (16 bars) and write sections along the
   timeline. Simplest, and what the generated Odin does natively.
2. **One file per section.** Save `intro`, `verse`, `chorus` as separate 64-step
   projects, expose the parameters your game needs to change, and switch layers
   at runtime. This is closer to how console soundtracks actually worked.

### Note numbers used here, for editing

| | Root | MIDI notes |
| --- | --- | --- |
| `chase-loop` bass | A1 F1 G1 E1 | 33 29 31 28 (+12 for the octave pops) |
| `chase-loop` lead | A minor pentatonic + G# over the E | 65–76 |
| `chase-loop` brass | Am / F / G / E triads | 57·60·64, 53·57·60, 55·59·62, 52·56·59 |
| `space-funk` bass | D2 Bb1 G1 A1 | 38 34 31 33 |
| `space-funk` pad | Dm9 / Bbmaj7 / Gm9 / A7 | 50·53·57·60·64, 46·50·53·57, 43·46·50·53·57, 45·49·52·55 |
| `space-funk` arp | Chord tones, two octaves up | 67–84 |

---

## Verification

The 11 patches and 3 songs listed above were checked with the code generator and
the Odin type checker:

```powershell
cd skald-backend
.\codegen.exe -in:..\examples\snes-kit\songs\chase-loop.skald.json -out:out.odin -package:generated_audio
```

All 14 files exit 0, and each generated file passes
`odin check <dir> -no-entry-point` as a standalone `generated_audio` package.
