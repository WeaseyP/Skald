# Skald Manual - Editorial Report

*Handoff document for the assembly workflow. Written 2026-07-30. Synthesises four independent
audits: node-chapter code claims (verified), spine-chapter code claims (verified), pedagogy /
order / gaps / glossary, and a fact-check of every number in the chapters.*

*Paths in this document are relative to `C:/Users/ryanp/Documents/dev/Skald-main/Skald/` unless
they begin with `docs/`. Chapter files live in `docs/manual-source/`.*

---

## Status

**What exists.** 21 chapters, 5,564 lines, at `C:/Users/ryanp/Documents/dev/Skald-main/Skald/docs/manual-source/`:
18 node chapters under `nodes/` (oscillator, noise, wavetable, fmOperator, midiInput, lfo,
sampleHold, adsr, mapper, filter, distortion, delay, reverb, mixer, gain, panner, output,
instrument) and three spine chapters (`00-foundations.md`, `50-bass-teardown.md`,
`60-complexity-ladder.md`). Every chapter carries the same skeleton: `## What it is`,
`## What it looks like in Skald`, `## The controls`, `## Try it`, `## Why you patch it this way`,
`## Under the hood`, `## Terms introduced`, `## Code-vs-intent notes`.

**Assessment: this is a strong base and should be assembled, not rewritten.** The technical
accuracy is unusual. Two independent verification passes opened every cited file behind roughly
130 code claims and ~70 range/default assertions; all twelve "Under the hood" DSP formula blocks
are correct, including the subtle ones (`q = clamp(1/max(res,0.1), 0.05, 1.9 - f)`,
`decay_gain = clamp(pow(0.001, 0.075/max(decay,0.01)), 0, 0.95)`, the Kellett pink filter, the
`(π+k)x/(π+k|x|)` distortion curve); all 14 node/connection counts in the bass ladder match the
JSON exactly; all BPM-to-seconds arithmetic across five chapters is right. Only four substantive
claims out of ~200 are wrong, and roughly a dozen line citations have drifted by one to three
lines.

**What has to happen before assembly.** Three things, in order.
(1) **Fix the unperformable exercises.** `50-bass-teardown.md`'s entire hands-on section — Exercise 1,
Exercise 2 Rungs 0 and X, Exercise 3 steps 1-8 — instructs the reader to press Play on graphs the
preview engine refuses to play, and three other chapters instruct control values the parameter
panel physically cannot reach. These are defects in the *manual*, not in Skald, and they are the
only findings that make the book unusable rather than merely imperfect.
(2) **Reorder.** The manual's own declared order (`00-foundations.md:17`) is source-first and does
not survive contact with the chapters: every source chapter's exercise needs a Filter, an ADSR
and an Instrument, all of which come later. The Instrument chapter is currently 18th and is a
prerequisite for chapter 4 onward. See the TOC below.
(3) **De-duplicate.** "What expose does" is re-explained in all 21 chapters, gain staging in 13,
voice/bus domain in 14. Assigning owners and cutting the rest to cross-references removes an
estimated 700-900 lines with no loss of content.

Four new chapters are also required — the manual never tells the reader how to install or run
Skald (the word "install" appears zero times in 5,564 lines), never teaches the sequencer
(1,461 lines of UI that 18 chapters reference), and never shows the Odin export that "expose"
exists to serve.

---

## Proposed table of contents

Reading order. `[written]` = an existing file needing only correction and de-duplication.
`[needs writing]` = no source text exists. `[needs merging]` = content exists but is scattered
across chapters and must be consolidated into one owner.

| # | Chapter | Source | State |
|---|---|---|---|
| 1 | **Getting started and the editor tour** | — | **[needs writing]** |
| 2 | **Foundations: signals, pitch, modulation, the graph** | `00-foundations.md` | [written] |
| 3 | **Instruments and Groups: the box your patch lives in** | `nodes/instrument.md` | [written] *(moved from 18th)* |
| 4 | **The sequencer, tempo and the transport** | — | **[needs writing]** |
| 5 | **Oscillator** | `nodes/oscillator.md` | [written] |
| 6 | **ADSR envelope** | `nodes/adsr.md` | [written] |
| 7 | **Output, gain staging and the master bus** | `nodes/output.md` | **[needs merging]** |
| 8 | **Filter** | `nodes/filter.md` | [written] |
| 9 | **Mapper: making a modulator fit its destination** | `nodes/mapper.md` | [written] |
| 10 | **LFO** | `nodes/lfo.md` | [written] |
| 11 | **Sample and Hold** | `nodes/sampleHold.md` | [written] |
| 12 | **VCA (Gain)** | `nodes/gain.md` | [written] |
| 13 | **Noise** | `nodes/noise.md` | [written] |
| 14 | **Mixer: summing and layering** | `nodes/mixer.md` | **[needs merging]** |
| 15 | **Wavetable** | `nodes/wavetable.md` | [written] |
| 16 | **FM Operator** | `nodes/fmOperator.md` | [written] |
| 17 | **Distortion** | `nodes/distortion.md` | [written] |
| 18 | **Delay** | `nodes/delay.md` | [written] |
| 19 | **Reverb** | `nodes/reverb.md` | [written] |
| 20 | **Panner and the stereo field** | `nodes/panner.md` | [written] |
| 21 | **MIDI Input and playing from hardware** | `nodes/midiInput.md` | [written] |
| 22 | **Bass, taken apart** | `50-bass-teardown.md` | [written] |
| 23 | **Making instruments more complex: the ladder** | `60-complexity-ladder.md` | [written] |
| 24 | **What Skald deliberately does not do** | — | **[needs merging]** |
| 25 | **Exporting Odin and wiring it into a game** | — | **[needs writing]** |
| A1 | *Appendix: node port matrix* | from `00-foundations.md:143-165` | [needs merging] |
| A2 | *Appendix: the number you see is not the number you get* | new table, sources listed below | **[needs writing]** |
| A3 | *Appendix: troubleshooting — what the error messages mean* | scattered across 5 chapters | **[needs merging]** |
| A4 | *Master glossary* | this document, §Master glossary | [written] |

### Notes on the four new chapters

**1. Getting started and the editor tour** — *the most damaging omission in the manual.*
"install", "npm" and "shortcut" appear zero times across 5,564 lines, yet every chapter opens
with "Have the app open". Must cover: installation and first launch (`README.md:13-46` documents
the Setup executable, the portable ZIP, `scripts/setup-dev.ps1`, `npm start`,
`npm run start:rebuild`); the five surfaces (lift from `00-foundations.md:131-141`); the node
palette's 17 entries and the colour system (`Nodes/NodeStyles.ts:85-107`); Save / Load / Import
Patch and what the `session` block restores — tempo, pattern length, master volume
(`useFileIO.ts:118-133`), currently one paragraph at `50-bass-teardown.md:31`; and the eleven
keyboard shortcuts in `ShortcutLegend.tsx:8-19` (undo/redo, copy/paste, `[`/`]` node cycling,
double-click-slider reset, the four note-drag modifiers) — **none of which appear anywhere in
the manual**. It must also state the "wrap it in an Instrument before you can press Play" rule,
because that single omission breaks three exercises downstream.

**4. The sequencer, tempo and the transport** — *the largest undocumented subsystem.*
1,461 lines of UI (`Sequencer/PianoRoll.tsx`, `SequencerDock.tsx`, `SequencerToolbar.tsx`,
`StepGrid.tsx`, `StepPropertiesEditor.tsx`, `TrackList.tsx`, `ScaleContext.tsx`,
`hooks/sequencer/`). Referenced by 18 of 21 chapters, taught in exactly one exercise
(`50-bass-teardown.md:307-341`), 19 chapters too late. Must own: the transport (Play/Stop/Loop,
`SequencerToolbar.tsx:87-93`, `:159`); BPM as the one field shared by preview, sequencer and
export; Steps / global pattern length (`:109-116`); **Key + Scale** and `nearestInScale`
quantisation — 8 scales in `ScaleContext.tsx`, a Key selector at `SequencerToolbar.tsx:121`, and
**zero mentions in the manual**, so a beginner will paint notes and watch them silently move; the
track-per-Instrument model (`useInstrumentRegistry.ts:13-25`); the step grid versus the piano
roll and the piano roll's MIDI 36-84 window; Step Properties (Note 0-127, Duration, Velocity,
Probability); **P-locks**; and the drag modifiers. It also becomes the single owner of the
BPM-sync derivation currently repeated in full three times.

**24. What Skald deliberately does not do** — *stops the reader concluding the tool is broken.*
Currently scattered as "Skald does not…" asides across at least ten chapters: no oversampling
(Distortion), no band-limiting (Oscillator, Wavetable), no slew limiter (S&H), no compressor and
no EQ (bass teardown), no MPE implementation (MIDI Input), no working pre-delay (Reverb), no
dotted note divisions (Delay), no modulation inputs on Delay/Reverb/Distortion/Mixer, no LFO
phase reset, no bus-domain LFO, no per-channel pan in the Mixer, mono everywhere except the
Panner, no self-oscillation. Every one of these is verified true. Collected honestly in one
chapter they read as a design position; scattered they read as a bug list.

**25. Exporting Odin and wiring it into a game** — *the reason the tool exists.* Currently one-sentence
asides in ten chapters. `README.md:70` and `examples/integration_demo/` (`main.odin`,
`build_and_run.bat`, `generated_audio/`) supply everything needed. Must cover: the Generate Code
button and the package-name / output-path fields (`Sidebar.tsx:173-190`); the shape of the
emitted file; the per-asset public API (`_init`, `_process`, `_trigger`, `_set_param`,
`_get_param`, `_PARAMS`, `_feed_input`); SFX versus Music Layer (the term "Asset" is
glossary-defined twice and explained nowhere); the master mix and `tanh` limiting at
`codegen.odin:2417-2418`; and building and running the demo. **Without this chapter the word
"expose", repeated in all 21 existing chapters, has no destination.**

### Chapters recommended but not required for v1

Lower priority; list them as planned rather than blocking assembly.

- **The code preview panel** — `CodePreviewPanel.tsx` gets one sentence (`00-foundations.md:141`).
  Watching `node_3_out = …` change as you drag a slider is the fastest way to make "modulation is
  additive", "an unexposed parameter is a baked-in constant" and "voice domain vs bus domain"
  concrete. `lfo.md:88` already hand-quotes generated code to do this.
- **Direct-manipulation controls** — the XY pad (`controls/XYPad.tsx`, 169 lines, one sentence in
  `filter.md:45`), the ADSR editor (`controls/AdsrEnvelopeEditor.tsx`, 197 lines, one sentence in
  `adsr.md:38`), double-click-to-default (`CustomSlider.tsx:202-207`), `BpmSyncControl.tsx` and
  `NumberInput.tsx` (never mentioned).
- **Drums and percussion teardown** — `examples/instruments/drums/` exists; `noise.md:233` says
  "percussion, in particular, is mostly envelope" and never builds one.
- **Sound effects for games** — `examples/sound-effects/{cosmic,geowars,impacts,synth}`, four
  folders, never taught as a discipline. This is the target reader's actual job.
- **Building a song from several instruments** — `examples/songs/full/four-bar-song.skald.json` is
  cited five times as *evidence* and never as a *subject*.
- **MIDI hardware setup** — attaching a controller, Web MIDI permissions, what "All" in the device
  dropdown listens to.

---

## Reading order and concept dependencies

### Why the declared order fails

`00-foundations.md:17` declares: sources → modulation → shaping → space → routing → Instrument.
That is source-first, and it breaks immediately. All four source chapters' exercises require a
Filter (declared position 10), an ADSR (7) and an Instrument (18). `gain.md:102` literally
instructs "Create Instrument" before its first listening step. `sampleHold.md` lists **Mapper** in
its own "Terms introduced". `noise.md` defines highpass, bandpass, notch and cutoff frequency —
four concepts the Filter chapter owns — in its own glossary.

### Per-chapter placement rationale (new order)

| # | Chapter | Why it sits here |
|---|---|---|
| 1 | Getting started | A reader cannot perform a single "Try it" without installing, running and loading a file. |
| 2 | Foundations | Owns the vocabulary every other chapter uses in its first paragraph. |
| 3 | Instrument / Group | Foundations already asserts "an Instrument is mandatory for preview" (`00-foundations.md:203`); every later exercise begins by wrapping nodes. Voice, polyphony, unison, detune and glide are assumed from chapter 5 onward. |
| 4 | Sequencer | Notes must come from somewhere before "press Play" means anything. Only place P-lock, step, bar, duration, probability and key/scale quantisation can be defined. Establishes the tempo model BPM sync depends on. |
| 5 | Oscillator | First sound. Owns Nyquist and aliasing for the whole book; six later chapters currently redefine them. |
| 6 | ADSR | Smallest addition that turns a drone into a note; 14 later exercises use one. Owns "Skald's ADSR is also a VCA", which `00-foundations.md:120` already flags as pre-first-patch knowledge. |
| 7 | Output | Closes the first complete chain (Osc → ADSR → Output). Must own full scale, headroom, clipping, decibel, dBFS and the master `tanh` **before** Mixer, Noise, Distortion and Reverb start warning about them. Its Instrument-ports section is now legal because Instrument is at 3. |
| 8 | Filter | Delivers the subtractive synthesis Foundations promises. Noise, LFO, Mapper, S&H, MIDI Input and both spine chapters use a filter as their worked destination. |
| 9 | Mapper | Must precede the first modulator. `00-foundations.md:78` already says "when a later chapter tells you 'put a Mapper between them', this is why". Rewrite its exercise to demonstrate with an **envelope** (available at 6) rather than an LFO. |
| 10 | LFO | First modulator. Its entire premise is filter-cutoff-shaped (wah, wobble, growl), so it needs 8; its exercise uses Mapper six times, so it needs 9. |
| 11 | Sample and Hold | Same dependencies as LFO, plus the LFO itself as the smooth-vs-stepped contrast it opens with. |
| 12 | VCA (Gain) | Needs an envelope (6) and an LFO (10) to have anything to plug into its Gain port. Owns tremolo, ring modulation, unity gain. |
| 13 | Noise | Thesis is "raw noise is almost never the sound you want" — needs filter (8) and envelope (6). Its exercise mentions Mixer ten times, so it sits directly before Mixer. |
| 14 | Mixer | Noise's exercise already needs it. Owns layering and sub/body/air, which both spine chapters lean on. |
| 15 | Wavetable | "Position is a destination, not a setting" — worthless without LFO (10) and ADSR (6). Its exercise mentions LFO twelve times. |
| 16 | FM Operator | Hardest source. Needs Nyquist (5), Mapper (9) and an envelope (6) for the time-varying index that ladder rung 8 calls the whole point. |
| 17 | Distortion | Needs harmonics (5), the one-pole lowpass (8), headroom (7) and the VCA (12) for the makeup gain it explicitly lacks. |
| 18 | Delay | First bus-domain node. Owns wet/dry and the feedback comb filter Reverb is built on. P-lock available from 4. |
| 19 | Reverb | Explicitly "the first half of that idea and stops there" — a comb filter with no diffusers. Cannot precede Delay. |
| 20 | Panner | Last in the chain. Needs LFO (10) for auto-pan and Output (7) for the "stereo survives only into Output" rule. |
| 21 | MIDI Input | Alternative note source; everything it feeds is already taught. Only chapter requiring external hardware, so it must gate nothing. |
| 22 | Bass teardown | First whole-instrument teardown. Assumes all 21. |
| 23 | Complexity ladder | Assumes all 22. |
| 24 | What Skald cannot do | Reads as a design position only after the reader has met the tool. |
| 25 | Exporting Odin | The payoff. |

### Forward references to fix

**Blocking — the reader cannot do the exercise.** All of these disappear under the new order, but
each chapter's prose still needs a pass to remove the now-redundant inline definition it was
carrying as a workaround.

| Chapter | Forward-referenced term or node | Evidence |
|---|---|---|
| Oscillator | Filter, ADSR, Instrument | Try-it inventory: `filter` ×5, `ADSR` ×2, `instrument` ×8 |
| Noise | **Highpass, bandpass, notch, cutoff frequency — all four defined in Noise's own glossary** | Filter owns all four |
| Noise | Mixer, ADSR, Distortion | Try-it: `Mixer` ×10, `ADSR` ×4, `distortion` ×1 |
| Wavetable | LFO, envelope, Reverb | "Scanning — moving position over time, usually driven by an LFO or an envelope"; Try-it: `LFO` ×12, `Reverb` ×2 |
| FM Operator | Mapper, Filter, Distortion | Try-it: `Mapper` ×2, `filter` ×6, `distortion` ×1 |
| LFO | **Filter cutoff — the chapter's entire premise** | `lfo.md:124`; Try-it: `filter` ×11, `Mapper` ×6 |
| LFO | Tremolo | Defined in `lfo.md` Terms and again in `gain.md` Terms |
| Sample and Hold | **Mapper — listed inside S&H's own glossary as a dependency** | `sampleHold.md` Terms |
| ADSR | **VCA** | `adsr.md:28` defines VCA inline in a parenthesis |
| ADSR | Filter cutoff, Mapper | Try-it: `Filter` ×8, `Mapper` ×2 |
| Mapper | Filter cutoff as the worked destination | `mapper.md:145` |
| MIDI Input | Keyboard tracking (filter cutoff), VCA | `midiInput.md` Terms; Try-it: `VCA` ×2 |
| Delay | **P-lock** | `delay.md:136` "Sequencer P-locks are your modulation" — defined nowhere |
| Output | Instrument, InstrumentInput, InstrumentOutput, Create Instrument, subgraph | whole section `output.md:39-46` |

**Non-blocking — a term used before its definition.** Fix by moving the definition to the owner
named in the glossary and leaving a cross-reference.

| Chapters using it early | Term | Should be owned by |
|---|---|---|
| Noise, Filter, Distortion, Delay, Reverb | decibel / dB / **dBFS** ("3 dB per octave", "12 dB/octave", "60 dB decay", "−12 to −18 dBFS") | Output (7). **dBFS is currently defined nowhere.** |
| Oscillator | subtractive synthesis "with filters" | Filter (8) |
| Noise | one-pole lowpass (used for pink noise) | Filter (8) |
| Filter | soft clipping / `tanh` | Output (7) |
| Distortion | makeup gain "use a VCA"; parallel saturation | VCA (12); Mixer (14) |
| Distortion, Wavetable, Delay, Instrument, bass teardown | **P-lock** | Sequencer (4) — currently unowned |
| Reverb | insert vs send | Mixer (14) |
| Mixer | mud | Mixer (14); Noise and ladder both also define it |
| Bass teardown | step, bar, duration-in-steps, probability, piano roll | Sequencer (4) — currently taught inline in Exercise 4 |
| Bass teardown | **sidechain, ducking, compressor** — three undefined terms in two sentences at `50-bass-teardown.md:371` | "What Skald cannot do" (24) |
| Filter | EQ ("a static filter is just an EQ") | Filter — one sentence |
| Wavetable | **spectral centroid**, RMS | Filter (brightness) / Output (level) |
| Delay | chorus, flanger, tape-warble | Delay names them; chorus is defined 6 chapters later in Instrument, flanger nowhere |
| Delay | impulsive vs sustained material | Delay — needs one sentence |
| All Mix controls | **crossfade** — used for Reverb, Delay, Distortion, Wavetable, Panner; defined nowhere | Delay (owner of wet/dry) |
| Panner, Mixer | "Skald's signal path is mono end to end except for one node" — stated locally twice, owned nowhere | Output (7) |
| Output | reading a scope and a spectrum — `output.md:31` documents the oscilloscope's existence but nothing teaches its use | Output (7) |

---

## Duplication to resolve

Sixteen concepts are explained in full in three or more places. Ranked by cost. Estimated saving
across all sixteen: 700-900 lines.

| Concept | Owning chapter | Chapters that should cross-reference instead |
|---|---|---|
| **D1. What "expose" does** (~350-450 lines) | **Foundations** (`:254-275`) — fullest version, and the only one that explains *why* (`param_ranges.odin` node-type overrides, constant-folding cost) | **All 20 others.** `lfo.md:86-94`, `sampleHold.md:84-96`, `mixer.md:144-166`, `adsr.md:63-73`, `reverb.md:67-75`, `60-complexity-ladder.md:162-171` are near-verbatim. Each keeps exactly three things: which parameters this node exposes by default (with the `node-definitions.ts` line), any node-specific clamp override or dead-setter gotcha, one sentence of game-runtime use case. |
| **D2. Gain staging / headroom / clipping / master `tanh`** | **Output** for the master stage (full scale, dB, **dBFS**, hard vs soft clipping, the `tanh` limiter, the three-controls table: VCA gain / Instrument volume / master volume); **Mixer** for the *arithmetic* of summing (+6 dB correlated, +3 dB uncorrelated, why four safe layers arrive 6-12 dB hot) | Foundations (keep two paragraphs — needed at ch. 2), Noise, Distortion, Filter, Instrument, Panner, Wavetable, LFO, Mapper, Oscillator, ladder. Headroom appears in 13 chapters, `tanh` in 13, gain staging in 6, soft clipping in 5. Competing analogies: `mixer.md:187-201` (bucket), `output.md:262-266` (funnel with a soft rubber rim). Keep both — they are owned by different chapters and describe different stages. |
| **D3. BPM sync / note division / tempo conversion** | **Sequencer chapter (new)**. Owns the BPM field, the division list (`definitions/bpm.ts:33-41`), the triplet rule, the absence of dotted values, the "rate not phase" limitation, and the dead-setter bug as one shared warning. *Interim owner if the new chapter slips: LFO.* | Delay and S&H keep only their own division table at their own example's tempo plus their node-specific consequence. The identical derivation is worked through in full three times (`delay.md:67`, `lfo.md:78`, `sampleHold.md:76`); the "rate not phase" caveat twice; the dead-setter gotcha three times. |
| **D4. Bipolar vs unipolar** | **Foundations** for the definition (`:63-79`, section literally titled "Unipolar and bipolar, and why the Mapper has to exist"); **Mapper** for what to do about it (`mapper.md:143` has the best practitioner framing) | LFO, S&H, Noise, VCA and bass teardown drop the Terms entry, keeping one clause: "the LFO is bipolar (Foundations §Unipolar and bipolar) — which is why it needs a Mapper." |
| **D5. Additive modulation** | **Foundations** (`:76`, the 799-801 Hz worked example plus the attenuator/offset hardware justification) | Bass teardown "Rule 2" and ladder cut to one cross-referencing sentence. **Keep `gain.md:68` in full** — it is node-specific and severe: `gain: 0.75` by default means the standard ADSR→VCA patch never reaches silence, and `gain.md:213` documents that every shipped example overrides it to 0. |
| **D6. The envelope-into-VCA idiom** | **ADSR** for "the `input` port is not a gate, it is the signal the envelope multiplies"; **VCA** for the standalone amplifier, static vs modulated gain, and the set-the-knob-to-zero rule | Foundations keeps only the four-box diagram and a two-sentence preview; Filter, bass teardown and ladder cross-reference. |
| **D7. Voice domain / bus domain** | **Foundations** (`:182-196`) — best version, including the codegen war story about a per-voice delay buffer dividing delay time by the active-voice count | Terms entry cut from 14 chapters (ADSR, Filter, Gain, Instrument, LFO, Mixer, Noise, Panner, S&H, Wavetable, Distortion, Reverb, bass, ladder). **Keep the consequence only** in Delay (where it first bites; keep the `delay_tail` acceptance-test detail) and Output (GraphOutput is the only node living in both domains). |
| **D8. Unison / detune / beating / supersaw** | **Instrument** — `unison` and `detune` are Instrument parameters | Oscillator keeps only "two oscillators a few cents apart beat"; Foundations cuts to a cross-ref. **Move, do not duplicate:** ladder Try-it steps 2-4 ("Prove that detune, not count, does the work") are the best hands-on demonstration in the manual — either relocate them into `instrument.md` or frame them explicitly as a recap with a back-reference. |
| **D9. Aliasing and Nyquist** | **Oscillator** — first source, and where Skald's naive oscillator makes it audible first | Distortion, FM, S&H, Wavetable and LFO each drop the definition and keep one sentence of node-specific mechanism (Distortion: "waveshaping generates harmonics forever upward and Skald does not oversample"; FM: "index widens the spectrum past Nyquist"; S&H: "step edges"). Nyquist is Terms-defined in 6 chapters, aliasing in 8. |
| **D10. Voice / polyphony / voice stealing** | **Instrument** (`voiceCount` is an Instrument parameter; the chapter has the Oberheim Four-Voice history) | Nine chapters cut to "each voice gets its own copy of this node's state" plus a cross-ref. Keep Foundations' one-paragraph version — it is needed before chapter 5. Terms-defined in 11 chapters today. |
| **D11. Wet / dry** | **Delay** (first effect with a Mix control in the corrected order) | Distortion and Reverb keep only their own formula line and node-specific advice (Distortion: mix 0.2-0.4 *is* parallel processing; Reverb: mix 1.0 turns an insert into a send). |
| **D12. Parallel processing / send routing** | **Mixer** for the routing pattern (branch, process one copy, recombine); **Distortion** for the specific case — its `mix` slider *is* the parallel control | Bass teardown, ladder and Reverb cross-reference. Note `60-complexity-ladder.md:160` currently states the Distortion case better than Distortion does — move that sentence into Distortion. |
| **D13. Harmonic / fundamental / timbre / harmonic series** | **Foundations** for the definitions; **Oscillator** for the four waveform recipes | Filter's opening (`filter.md:52`) and Wavetable's (`wavetable.md:320`) both re-teach sine/saw/square from scratch; both open with one sentence and a cross-ref. Seven chapters currently Terms-define these; four re-derive the sawtooth's 1/n recipe. |
| **D14. Phase cancellation / mono compatibility** | **Mixer** for phase cancellation (a property of summing); **Panner** for mono compatibility, fold-down and keep-bass-centred | Foundations, Oscillator, bass teardown and ladder cross-reference. |
| **D15. Transient** | **ADSR** (`adsr.md:6` has the strongest evidence, with the McGill/PMC attack-perception citations) | Foundations, Noise, bass teardown and ladder cross-reference. Keep the split only: **Mixer** owns "transient vs body" as the layering axis. |
| **D16. Velocity and velocity sensitivity** | **ADSR** for the parameter and the `(1 − vs) + vs × velocity` formula; **MIDI Input** for MIDI velocity 1-127 and "velocity is not volume" | Foundations and bass teardown cross-reference. Cut `60-complexity-ladder.md:156` to its genuinely new claim only: "put more velocity sensitivity on the filter envelope than the amp envelope." |

---

## Corrections required before publication

Edits to the **chapters**. Ordered by severity: exercises that cannot be performed, then wrong
numbers, then wrong citations, then incomplete tables.

### Severity 1 — the exercise cannot be performed as written

| Chapter | Claim | Truth | Citation |
|---|---|---|---|
| `50-bass-teardown.md:161-181` (Ex. 1) | "Load `examples/instruments/bass/sine-sub-bass.skald.json` … Press Play in the sidebar … then click the Output node and press its Test Audio button." All of steps 2-7 depend on it. | The file is a loose graph — `osc_1`/`adsr_1`/`output_1` with no `instrument` node. Play throws "No instruments on the canvas. Wrap nodes in an Instrument before playing." and renders a red *Preview failed* banner; `isPlaying` never becomes true, so Test Audio is dead too. **Insert a "wrap it in an Instrument" step before step 2.** `00-foundations.md:288-290` already contains the exact wording to copy. | `sine-sub-bass.skald.json:2-7`; `projectSerializer.ts:91-92`, `:119-121`; `useWasmAudioEngine.ts:96-98`, `:344`; `app.tsx:415-437`; `useFileIO.ts:113-114` |
| `50-bass-teardown.md:191` (Ex. 2, Rung 0) and `:284-285` (Rung X) | "Load each patch, press Play" / "Load it and listen" | Rung 0 is `sine-sub-bass` and Rung X is `lfo-filter-wobble-bass`; both are loose graphs and both refuse to play. Same fix. | as above; `lfo-filter-wobble-bass.skald.json:2-8` |
| `50-bass-teardown.md:292` (Ex. 3) | "Start with a blank canvas. Press Play in the sidebar first so you can hear each step as you build" | The Instrument is not created until step 9 (`:302`), so steps 1-8 are silent behind an error banner. **Move Create Instrument to step 1**, or move the "press Play" instruction to step 9. | as above |
| `50-bass-teardown.md:167` | Calls the loose `sine-sub-bass` graph "the smallest thing in Skald that counts as an instrument" | It is precisely the thing the preview refuses as *not* an instrument. Reword. | `useWasmAudioEngine.ts:96-98` |
| `nodes/panner.md` step 3 and step 6 | "In the parameter panel, drag **Amplitude** down to 0" / "set **Amplitude** to `4.0`" | The panel's LFO amplitude slider is `slider('amplitude', 0, 1, 1)` and clamps typed commits. 4.0 is unreachable there. Only the **node card's Amount box** goes to 10. Reword to "on the node card's Amount box (the panel slider stops at 1)". `mapper.md` step 9 and `sampleHold.md` step 5 already use exactly this pattern — copy it. | `NodeParameterControls.tsx:162`; `LFONode.tsx:18`; `NumberInput.tsx:83-84`; `CustomSlider.tsx:170-172` |
| `nodes/wavetable.md` step 6 | "set … the LFO Amplitude to **2.0**" | Same. Unreachable in the panel. | as above |
| `nodes/distortion.md` step 5 | "sweep **Tone** from 100 Hz to 20000 Hz" while working in the panel | The panel's Tone slider stops at 10000 (`slider('tone', 100, 10000, 4000, 'log')`). Also note the DSP saturates the one-pole coefficient at 7018 Hz, above which the filter is `y = x` — so the whole top of the sweep is silent anyway. Say both. | `NodeParameterControls.tsx:244`; `DistortionNode.tsx:11`; `codegen.odin:595` |
| `60-complexity-ladder.md:113` | "Now push the Mapper's Output Max to **12000** as well." | `ParameterPanel.tsx` intercepts `type === 'mapper'` and renders `outMin`/`outMax` as `CustomSlider min={-10000} max={10000}`; 12000 commits as 10000. The lesson still lands (the filter clamp bites at ~7.7 kHz), but the reader cannot tell whether the snap or the clamp is what they hear — which sabotages the step's whole point. **Change the instruction to 10000.** | `ParameterPanel.tsx:349-358`, `:354-355`; `CustomSlider.tsx:170-172` |
| `00-foundations.md:327` (step 10) | "Set the Filter's **resonance** to **30** … The filter now rings so hard at its cutoff that it produces a loud sine tone of its own … a screaming siren." | **Skald's filter cannot self-oscillate.** Damping is floored at 0.05, and the source comment says the floor "keeps high resonance ringing but bounded". `filter.md` states this correctly four separate times (`:76`, `:204`, `:225`). Two chapters currently give opposite answers to "can this filter self-oscillate?". Secondly, **resonance 30 is audibly identical to 20** — damping saturates at exactly `res = 20`. Retitle the step "Break it: near-self-oscillation", use 20, and add the "it always decays" caveat. | `codegen.odin:336-341`; `param_ranges.odin:53` |
| `nodes/noise.md:112` (step 7) | "You'll hear a nasty crackling fizz … That's hard clipping: the summed signal exceeds ±1.0 and the generated processor does not limit it." | There **is** a master soft limiter: `mixed_left = math.tanh(mixed_left * master_vol)`. The reader will hear smooth `tanh` saturation and flattening, not crackle. `gain.md` step 9 says the opposite for the identical mechanism ("nothing crackles, because `tanh` is a smooth curve"), and seven other chapters describe the limiter correctly. **Rewrite the audible result as saturation.** | `codegen.odin:2417-2418`, `:2623-2624`; also present in the chapter's own cited golden at `generated_audio.odin:3870-3871` |
| `nodes/noise.md:221` (Code-vs-intent 5) | "No output limiting anywhere in the chain … the generated `process` returns the raw accumulated sum with no clamp or saturator." | False as headline; true only of the per-asset proc. Line `:647` of the golden is `Snare_process`'s return, which is correctly unlimited — but that is not "the chain". **Rewrite to the narrower true claim:** "the per-asset `<Foo>_process` proc has no limiter; the project wrapper and the WASM preview both apply `tanh` — and the generated header explicitly recommends your game call the per-asset procs rather than the project wrapper, so a game gets no limiting." | `codegen.odin:2417-2418`, `:2623`, `:2279-2280`; `generated_audio.odin:647` |
| `nodes/fmOperator.md` (Code-vs-intent 4) | "Oscillator, Noise, LFO and Wavetable all have an amplitude param with an `input_amp` port." | **Wrong about the LFO.** The LFO has an `amplitude` parameter but no `input_amp` port — `graph_validate.odin:57-58` puts it in the "sources only — no modulation inputs" group and `codegen.odin:368` passes an empty input port. The cited lines 26/28/31 (Oscillator, Noise, Wavetable) are correct. **Drop "LFO" from the list**, or a reader will hunt for a handle that does not exist. The finding's substance — the FM Operator is the only source with no level control and two of them summed will clip — stands and should be kept. | `graph_validate.odin:30`, `:57-58`; `codegen.odin:368`, `:466`; `types.ts:43-46` |

### Severity 2 — wrong numbers

| Chapter | Claim | Truth | Citation |
|---|---|---|---|
| `nodes/reverb.md:79` | "each eight steps long — so **a chord change every 2.67 seconds**" | A step is a 16th: `samples_per_step_f := p.sample_rate * 60.0 / (p.bpm * 4.0)`. At 90 BPM that is 0.1667 s/step, so 8 steps = **1.33 s**. 2.67 s is the whole 16-step loop. | `codegen.odin:2054`; `pad-sequenced.skald.json` session |
| `nodes/mapper.md` (Try-it, line 1) | "double-click it to see the **eight** nodes inside" | **Nine**: `wob-osc`, `wob-filter`, `wob-amp`, `wob-drive`, `wob-sh`, `wob-sh-map`, `wob-lfo`, `wob-lfo-map`, `wob-output`. `50-bass-teardown.md` Rung 10 gets it right ("9 nodes, 8 connections"). | `wobble-samplehold-bass.skald.json` |
| `nodes/instrument.md` step 8 | "Push **Detune (cents)** to the maximum `100` … a full semitone of spread" | `detune_amount = (i/(n-1) − 0.5) * 2.0 * detune`, so copies span −100…+100 cents = **200 cents = two semitones**. The chapter's own controls table says it correctly ("±this many cents around the true pitch"). | `codegen.odin:182` |
| `nodes/instrument.md` step 9 | "`supersaw-hypersaw-lead.skald.json`: `unison: 7, detune: 30` at **MIDI 64-72**" | Notes are `[69, 64, 67, 69, 72, 71, 64, 74, 69]` — range **64-74**. Unison and detune are correct. | `supersaw-hypersaw-lead.skald.json` |
| `nodes/oscillator.md` (Try-it preamble) | "a 16-step pattern at 172 BPM playing **low F and C** notes" | Notes are 29 (F1), 29, 36 (C2), **34 (B♭1)**, **32 (A♭1)**. Two of the five are neither F nor C. | `synth-reese-bass.skald.json` |
| `50-bass-teardown.md` finding 10 | "`syncRate: \"1/8\"` … which is **3.5 Hz** at 140 BPM" | `beats = 4/denom = 0.5`; `seconds = (60/140) × 0.5 = 0.2143 s` → **4.67 Hz**. The app itself renders the effective time (`NodeParameterControls.tsx:47-52`), so a reader will catch this. | `codegen.odin:39-49`; `fm-growl-bass.skald.json:155` (140 BPM) |
| `50-bass-teardown.md` Ex. 4 step 3 | "Now the same notes are **2.7 dB** down." | At `vs = 1.0` the step-3 ghost (0.72) against the step-0 accent (0.95) is **2.4 dB**. 2.7 dB holds only for the 0.70/0.92 pair at a different step. | `20·log10(0.72/0.95) = −2.42` |
| `50-bass-teardown.md` finding 1 / `00-foundations.md` finding 5 | If either quotes the wobble LFO's rate as **8 Hz** | `bpmSync: true` with no `syncRate` overrides the stored `frequency: 8`; the default division is `1/4`, which at the default 120 BPM (the file has no `session` block) is 0.5 s per cycle = **2 Hz**. *(One audit reported 0.5 Hz; that is the period in seconds, not the frequency. Verified against `bpm_sync_seconds_expr`: `beats = 4/4 = 1`, `seconds = 60/120 = 0.5`.)* | `codegen.odin:28-51`; `bpm.ts:20`; `lfo-filter-wobble-bass.skald.json:3` |
| `00-foundations.md:498` / `50-bass-teardown.md:473` | The cutoff clamp makes "roughly the top **60% of the slider's travel**" inert | 62% is right as a fraction of the **numeric range** (7,680 of 20,000 Hz), but the XY pad is `xScale="log"`, so it is only ~14% of the pad's horizontal travel. **Reword to "60% of the frequency range".** | `codegen.odin:339`; `NodeParameterControls.tsx:149` |
| `60-complexity-ladder.md:320` (finding 8) | "**Ten** of the fifty example files are unplayable as shipped" | **Fourteen** of the fifty instrument examples are loose graphs (26 of the 85 JSON files under `examples/`): the seven named plus Cowbell, CyberCymbal, HiHat, KickDrum, SnareDrum, MellowElectricPiano, PianoChord. The finding's own enumerated list already contains 14 items. | scripted scan of `examples/instruments/**/*.json` |
| `60-complexity-ladder.md:320` (finding 8) | "Four of them additionally use pre-rename modulation handles … which the port validator rejects outright" | **REFUTED.** `normalize_port` maps `frequency`→`input_freq`, `pulseWidth`→`input_pulseWidth`, `cutoff`→`input_cutoff` on every edge *before* `validate_connections` runs. The validator never sees the legacy names. `examples/AUDIT.md:67` independently records exit 0 and a compiling `.odin` output for all four. **Delete this sentence.** | `json.odin:36-49`, `:105-107`, `:117-120`; `codegen.odin:1012` |
| `60-complexity-ladder.md:320` (finding 8) | "a beginner who loads one and presses Play hears nothing and has no way to know why" | **REFUTED.** The app throws a named error and renders a red *Preview failed* banner telling the reader exactly what to do. The correct statement is: "fourteen of the fifty instrument examples are loose graphs; the codegen CLI wraps them as a mono asset named `Asset`, but the editor's Play button refuses them with a named error." | `useWasmAudioEngine.ts:96-98`; `app.tsx:415-437`; `json.odin:309-326` |
| `60-complexity-ladder.md:310` (finding 3) | "Mixer channel levels cannot be exposed from the UI … the panel passes `isExposable = false` for every mixer level row" | **REFUTED.** `ParameterPanel.tsx:338-348` intercepts `type === 'mixer'` and renders its own branch with `wrapper(\`level${channel.id}\`, …, true)` — explicit `isExposable = true` — before `NodeParameterControls` is ever reached. The `false` rows at `NodeParameterControls.tsx:278-293` are dead code from the panel's perspective. **Mixer levels are exposable with one click, and doing so is destructive — see the Code-vs-intent section.** | `ParameterPanel.tsx:338-348`; `NodeParameterControls.tsx:278-293`; `StepPropertiesEditor.tsx:174` |
| `50-bass-teardown.md:485` (finding 13) | Exposing a mixer channel level is "**cosmetic** — only the `<Asset>_PARAMS` default entry is affected; the emitted gain comes from the levels array" | **Wrong, and it is audible.** `get_f32_param` switches the per-sample expression to `p.level1` the moment the parameter is exposed, so the `levels` array is dropped from the audio path in preview *and* export. Severity is **blocker**. | `param_utils.odin:79-85`; `codegen.odin:1191-1198`, `:1327-1328`, `:643-658`; `useWasmAudioEngine.ts:250-252` |
| `00-foundations.md:516` (finding 7) | "an exposed `voiceCount` set to 48 by a game would be accepted by the clamp but has no effect at runtime" | **Stronger and simpler than stated: no instrument-level parameter can be exposed at all.** Exposure resolution iterates only `all_nodes` inside the subgraph, and `buildProjectData` never carries the Instrument's `exposedParameters`. No setter and no PARAMS row is ever generated; the link icon on Voice Count does literally nothing. The range half of the finding (table 1-64, slider 1-32, serializer clamp 1-32) is correct. | `codegen.odin:1173`, `:1188`, `:983-984`, `:1105`, `:1738`; `projectSerializer.ts:189-210`, `:204` |
| `00-foundations.md:525` (finding 10) | Exposed Reverb decay has "a published default of **0.1 s**" | Only the **bounds and unit** are borrowed from the ADSR `decay` entry. `codegen.odin:1191-1197` overrides the default with `node.parameters["decay"]` when present, and a Reverb node always stores its own decay — so the emitted default is the patch's 3.0. The finding overstates how misleading the introspection table is. | `param_ranges.odin:62-63`; `codegen.odin:1191-1197`; `node-definitions.ts:124` |
| `00-foundations.md:507` (finding 4) | "The parameter panel's amplitude slider spans 0-1 and the node's own box the same." | **There are three ceilings, not two.** Panel 0-1, node card **0-10**, backend 0-20000. Same for Sample & Hold amplitude (card 0-10, panel 0-1). A reader told "the card says 0-1" will trust it and then find it goes to 10. | `NodeParameterControls.tsx:162`, `:188`; `LFONode.tsx:18`; `SampleHoldNode.tsx:14`; `param_ranges.odin:31` |
| `50-bass-teardown.md:465` (finding 3) | "`useSequencerState.ts:97-102` creates **every new note** at MIDI 60" | Only every note painted in the **Step Grid**. The signature is `note: note || 60`; `PianoRoll.tsx:122,152,154` passes the clicked row's pitch correctly. Reword to name the Step Grid. The conclusion (you cannot easily paint a bass note) survives, because the piano roll's rows only span 36-84. | `useSequencerState.ts:96-101`; `StepGrid.tsx:125,139,148,151`; `PianoRoll.tsx:20-21`, `:122` |
| `nodes/instrument.md` finding 1 | "all **40-odd** shipped examples carry `voiceStealing`" | 62 occurrences across 58 files, all `"oldest"`. Also: only the Instrument-wrapped examples carry it — the loose graphs do not. | grep over `examples/` |
| `nodes/gain.md` finding 5 | `skald-ui/new_docs/` has "one for every other node type" | `MapperNode.md` and `MidiInputNode.md` are also missing, not just `GainNode.md`. | directory listing (24 files) |
| `nodes/distortion.md` finding 8 | "four graphs in `.claude/phase1-findings/failing-graphs/`" | Five — `drive_eq1.json` is the fifth. | directory listing |

### Severity 3 — wrong line citations (code is there; the line drifted)

| Chapter | Cited | Correct |
|---|---|---|
| `00-foundations.md` controls table | `voiceCount` default → `node-definitions.ts:167` | `:165` (`:167` is `glide: 0.05`) |
| `00-foundations.md` controls table | `volume` default → `node-definitions.ts:165` | `:164` |
| `00-foundations.md` finding 4 | LFO amplitude default → `node-definitions.ts:78` | `:76` |
| `00-foundations.md` finding 10 | decay range → `param_ranges.odin:66-67` | `:62-63` (`:66-67` is `release`) |
| `00-foundations.md` finding 7 | serializer clamp → `projectSerializer.ts:203` | `:204` (`:203` is the comment) |
| `00-foundations.md` finding 6 / `50-bass-teardown.md` finding 11 | `showIf` guard → `OscillatorNode.tsx:20` | `:21` (`:20` is the `fixedPitch` toggle) |
| `50-bass-teardown.md` "Rule 2" | reese cutoff 300 → `synth-reese-bass.skald.json:44` | `:43` (`:44` is `"resonance": 1.3`) |
| `50-bass-teardown.md` Instrument controls | `voiceCount:1` + `glide:0.09` → `sub-808-glide-bass:12-13` | `:11` and `:13` (`:12` is `voiceStealing`) |
| `50-bass-teardown.md` Instrument controls | volume-zero rule → `json.odin:340` | `:342` |
| `50-bass-teardown.md` Rung 10 | `unison:2, detune:12` → `:16-17` | `:14-15` |
| `50-bass-teardown.md` Rung 10 | `"rate": 8` → `:83` | `:82` |
| `50-bass-teardown.md` / `nodes/instrument.md` step 10 | instrument volume → `codegen.odin:1952` | `:1951` (`:1952` is `}`) |
| `nodes/fmOperator.md` Try-it preamble | Modulator `fixedPitch: false` → `:30` | `:29` (`:30` is `"amplitude": 1`) |
| `nodes/fmOperator.md` finding 3 | modulator amplitude 1 → `fm-growl-bass.skald.json:31` | `:30` |
| `nodes/midiInput.md` "The controls" and finding 3 | unknown-param fallback → `param_ranges.odin:153-157` | `:116-118` — **the file is 119 lines long.** Every other chapter cites it correctly. |
| `nodes/output.md` step 4 and findings 2/7 | Test Audio `postMessage` → `useWasmAudioEngine.ts:352` | `:350` (`adsr.md` cites it correctly) |
| `nodes/output.md` "The controls" | output params `{}` → `projectSerializer.ts:54-56` | `:53-55` |
| `nodes/output.md` finding 1 | volume-slider GainNode write → `SequencerDock.tsx:117`, `:125` | `:105` (the drag handler; `:117` is the on-mount sync) |
| `nodes/oscillator.md` "What expose does" | `renderParameterControl` → `ParameterPanel.tsx:215-241` | `:216-241` |
| `nodes/delay.md` finding 6 | `SYNC_RATE_OPTIONS` → `bpm.ts:34-46` | `:33-41` |
| `nodes/mixer.md` finding 1 | `get_f32_param` switch → `param_utils.odin:78-85` | `:79-85` |
| `nodes/gain.md` finding 1 / `nodes/instrument.md` finding 3 | "match the ranges sliders use" comment → `param_ranges.odin:9-10` | `:8-9` |
| `nodes/lfo.md` finding 1 | amplitude 30000 → `hostile_modulation.json:55` | `:45` (`:55` is 40) |
| `nodes/reverb.md` finding 1 (as quoted by `60-complexity-ladder.md:306`) | `generate_reverb_code` → `codegen.odin:544-551` | `:543-546` |

### Severity 4 — incomplete or misleading range tables

| Chapter | Problem | Fix |
|---|---|---|
| `60-complexity-ladder.md` controls table | Three rows cite `NodeParameterControls.tsx` for controls the panel **intercepts before reaching that component**. `level1…N` cited as "0-2 (`:281`)" — the user actually sees `ParameterPanel.tsx:343`, `min={0} max={1}`. `outMin`/`outMax` cited as "±1e6" — the panel sliders are ±10000 (out) and ±100 (in), `ParameterPanel.tsx:352-355`. | Restate both rows in the honest two-value format the LFO amplitude row already uses ("0-1 panel; 0-20000 backend"). |
| `50-bass-teardown.md` "Per-node parameters" table | Lists Distortion tone 100-20000, LFO amplitude 0-20000, S&H rate 0.1-1000, Filter resonance 0.1-20, Mapper ±1e6 as flat single ranges. Every one is unreachable from the parameter panel (tone caps 10000, LFO amp caps 1, S&H rate caps 50, mapper caps ±10000). | Add a **panel / card / export** column, as `delay.md` already does — or replace with a cross-reference to the new Appendix A2. |
| `nodes/delay.md` controls table | Seven columns, three of them ranges (`Range (node card)` / `Range (panel slider)` / `Range enforced on export`). Correct, but it is a QA artefact in the middle of a lesson. | Keep one authoritative range in the table; push the three-way disagreement into Code-vs-intent notes, where the chapter already handles it well (`:209`). |
| **All chapters** | Ten parameters have three or more independent, disagreeing range declarations. Ten separate appendix bullets is ten times the reader's attention this deserves. | **Build Appendix A2, "The number you see is not the number you get"** — one table, columns: parameter / node card / parameter panel / `param_ranges.odin` / effective DSP clamp / what happens if you touch the narrow control. Covers cutoff, resonance, LFO amplitude, S&H amplitude, S&H rate, distortion tone, gain, delay time, delay feedback, mixer level, mapper outMin/outMax, voiceCount, glide, reverb decay minimum. Every chapter cross-references it. |

---

## Code-vs-intent findings

**These are defects in Skald itself, not in the chapters.** They feed a later triage pass. Two
independent verification passes opened every cited file on both sides.

**Tally: 30 confirmed** — 7 blockers, 15 confusing, 8 cosmetic. **4 refuted or corrected**
(listed at the end; these must be removed from the chapters, not softened).

---

### BLOCKERS

#### B1. Shipped example patches cannot be played from the editor
**Severity: blocker.** *Lead item — this is what breaks the reader's ability to follow an exercise.*

**What the reader experiences.** They load a file the manual told them to load, press Play, and get
a red *Preview failed* banner. Fourteen of the fifty instrument examples do this, including
`sine-sub-bass` and `lfo-filter-wobble-bass`, which the bass chapter's first two exercises depend
on. Test Audio is dead too, because it is gated on `isPlaying`.

**Evidence.** Fourteen of fifty `examples/instruments/**/*.json` contain no node of type
`instrument` (26 of the 85 JSON files under `examples/`): `sine-sub-bass`,
`lfo-filter-wobble-bass`, `complex-drone-machine`, `pwm-pad`, `fm-bell-tone`, plus Cowbell,
CyberCymbal, HiHat, KickDrum, SnareDrum, MellowElectricPiano, PianoChord and two others.
`getInstrumentNodes = nodes.filter(n => n.type === 'instrument')` (`projectSerializer.ts:91-92`)
and `instruments` is built only from that list (`:119-121`), so a loose graph serialises to
`instruments: []`. `buildModule` then throws (`useWasmAudioEngine.ts:96-98`), the catch sets
`previewError` (`:209-217`), and `app.tsx:415-437` renders the banner. `useFileIO.ts:113-114`
loads verbatim with no auto-wrapping. Test Audio is gated at `useWasmAudioEngine.ts:344`.
The CLI is unaffected: `json.odin:309-326` wraps any Instrument-less graph as a single mono asset
named `Asset`.

**Manual should:** document current behaviour **and fix the exercises now** — this is the one
finding where the manual, not Skald, is the thing that has to change first. Add the wrap step to
`50-bass-teardown.md` in three places. Separately, note in the front matter which examples are
loose graphs.

**Skald fix, if triaged:** auto-wrap on load, or wrap on Play with a toast.

---

#### B2. The wobble-bass example neither plays nor wobbles
**Severity: blocker.**

**What the reader experiences.** The file whose name promises a wobble errors on Play. If they wrap
it in an Instrument to get past that, they hear a static tone.

**Evidence.** `lfo-filter-wobble-bass.skald.json` is 16 lines. No `instrument` node (`:2-8`). The
LFO at `:3` is `{"frequency": 8, "waveform": "Sine", "bpmSync": true}` — **no `amplitude`, no
`syncRate`**. Filter cutoff is 150 (`:5`); the edge at `:10` targets `cutoff`. Missing amplitude
falls back to 1.0 (`codegen.odin:368`) and modulation is additive (`param_utils.odin:149-153`), so
the cutoff swings **149-151 Hz**. Missing `syncRate` defaults to `"1/4"` (`codegen.odin:35`), which
at the default 120 BPM (the file has no `session` block) is `beats = 1`, `seconds = 0.5` = **2 Hz**
— so the stored `frequency: 8` is inert. The contrast the chapter draws is real:
`synth-reese-bass.skald.json:110-113` and `wobble-samplehold-bass.skald.json:122-125` both use a
Mapper ("Sweep 0-500 Hz", "Sweep 0-900 Hz").

**Manual should:** keep this as a diagnostic exercise — it is one of the best in the book — but the
reader must be able to *hear* the non-wobble, which requires B1's fix first.

---

#### B3. The Parameter Panel and the node card use different ranges for the same parameter, so opening the panel destroys the value
**Severity: blocker.** *The single most damaging thing in the app for someone learning by doing.*

**What the reader experiences.** The manual repeatedly says "set this on the node card, then open the
panel and sweep it". The act of opening and nudging silently rewrites the value, with no undo cue
and no warning. Worst case: load the shipped `evolving-motion-pad`, touch the LFO Amount control,
and a 380 Hz filter sweep collapses to 1 Hz. There is no way to get 380 back from the panel.

**Evidence (every pair verified).**

| Parameter | Node card | Parameter panel | `param_ranges.odin` |
|---|---|---|---|
| LFO amplitude | 0-10 (`LFONode.tsx:18`) | 0-1 (`NodeParameterControls.tsx:162`) | 0-20000 (`:31`) — and `evolving-motion-pad.skald.json:89` ships 380 |
| LFO frequency | 0.01-100 (`LFONode.tsx:17`) | 0.1-50 (`:160`) | 0.01-100 (`:29`) |
| S&H amplitude | 0-10 (`SampleHoldNode.tsx:14`) | 0-1 (`:188`) | 0-1 (generic, `:86-87`) |
| S&H rate | 0.1-1000 (`SampleHoldNode.tsx:13`) | 0.1-50 (`:186`) | 0.1-1000 (`:33`) |
| Gain | 0-4 (`GainNode.tsx:12`) | 0-1 (`:304`) | 0-4 (`:84-85`) |
| Mixer level | 0-2 (`MixerNode.tsx:59`) | 0-1 (`ParameterPanel.tsx:343`) | 0-2 (`:43-45`) |
| Filter resonance | 0-20 (`FilterNode.tsx:15`) | 0-30 (`:144`, `:153`) | 0-20 (`:53`) |
| Distortion tone | 100-20000 (`DistortionNode.tsx:11`) | 100-10000 (`:244`) | 100-20000 (`:37`) |
| Delay time | 0-2 (`DelayNode.tsx:14`) | 0.001-5 (`:173`) | 0-2 (`:74-75`) |
| Delay feedback | 0.95 (`DelayNode.tsx:15`) | 1.0 (`:175`) | 0.99 (`:76-77`) — and clamped to 0.95 at use (`codegen.odin:532`) |
| Mapper outMax | unbounded (`MapperNode.tsx:15`) | ±10000 (`ParameterPanel.tsx:355`) | ±1e6 (`:100-101`) |
| Reverb decay min | 0.1 (`ReverbNode.tsx:9`) | 0.1 (`:236`) | 0.001 (`:63`) |
| voiceCount | — | 1-32 (`:319`) | 1-64 (`:106-107`); serializer clamps 1-32 (`projectSerializer.ts:204`) |
| glide | — | 0-2 (`:320`) | 0-5 (`:112-113`); no serializer clamp (`:205`) |

Clobbering mechanism: `NumberInput.commitValue` clamps to min/max (`NumberInput.tsx:83-84`) and
`CustomSlider` clamps typed commits with `Math.max(min, Math.min(max, parsed))`
(`CustomSlider.tsx:172`). The header comment at `param_ranges.odin:8-9` claiming these ranges
"match the ranges sliders use in the UI's parameter panel" is **false** for gain, amplitude, tone,
delayTime, feedback, rate, voiceCount and glide.

**Root cause worth recording for triage.** Three UI surfaces (the node card via `makeParamNode`,
`ParameterPanel`'s own hand-rolled branches, and `NodeParameterControls`) plus `param_ranges.odin`
plus the point-of-use clamp in `codegen.odin` each carry an independent copy of every parameter's
range. This one duplication is behind at least eight separate findings.

**Manual should:** document current behaviour loudly, in Appendix A2 plus a warning in every
affected chapter's Try-it, and never instruct a panel gesture on a value the panel cannot hold.

---

#### B4. Exposing a Mixer channel level pins the channel to unity and kills the fader
**Severity: blocker.**

**What the reader experiences.** They follow the manual's advice to expose a channel level for
runtime control. The channel jumps from 0.75 to 1.0, the fader stops responding, and the balance
they just built stops working — in preview as well as export. It looks like they broke the mixer.

**Evidence.** The exposed key is `level<i>` (`codegen.odin:657`, `ParameterPanel.tsx:342`), but the
UI stores channel gains in a `levels` array of `{id, level, pan}` (`node-definitions.ts:139-144`,
`ParameterPanel.tsx:177-182`, `MixerNode.tsx:26-33`) — there is no `level1` key at the node's top
level. The exposure resolver reads `node.parameters[p_name]` and falls back to
`lookup_param_range(p_name, node.type).default` (`codegen.odin:1191-1198`), which for any
`level`-prefixed name returns `{0.0, 2.0, 1.0, "x"}` (`param_ranges.odin:43-45`). Init emits
`p.level1 = 1.0` with no clamp (`codegen.odin:1327-1328`). `get_f32_param` then switches the
per-sample expression to `p.level1` for any exposed name (`param_utils.odin:79-85`), so the
`levels` entry is dropped from the audio path too. The editor cannot correct it:
`useWasmAudioEngine.ts:250` reads `Number(sn.data?.['level1'])` → `NaN`, so the live set-param path
skips it (`:252`), and every rebuild re-emits `1.0`.

**Manual should:** **document as a hazard and tell the reader not to expose mixer levels** until it
is fixed. Do not wait — this is one click away in the panel.

---

#### B5. Reverb Pre-Delay is a fully wired control with no implementation
**Severity: blocker.**

**What the reader experiences.** Pre-delay is one of the three controls every reverb tutorial
teaches. They move the slider, hear nothing, and either doubt their ears or conclude pre-delay is
a subtle effect. Both conclusions are wrong.

**Evidence.** `preDelay` is declared (`types.ts:112`), defaulted to 0.01
(`node-definitions.ts:125`), rendered as `slider('preDelay', 0, 1, 0.01)` labelled "Pre-Delay (s)"
(`NodeParameterControls.tsx:237`), advertised in the palette tooltip "Room tail with decay time,
pre-delay and wet/dry mix" (`Sidebar.tsx:273`), shipped in patches
(`pad-sequenced.skald.json:96`), **and exposable** (Reverb falls through to the default panel
branch whose `wrapper` defaults `isExposable = true`, `ParameterPanel.tsx:281`), so a shipped
runtime parameter that does nothing is genuinely reachable. `generate_reverb_code` reads only
`decay` and `mix` (`codegen.odin:543-546`) and emits a single comb with a fixed 0.075 s tap
(`:547`, `:551-560`). `grep -rn 'preDelay\|pre_delay' skald-backend/` returns **zero hits**.

**Manual should:** **document the current behaviour prominently in the body of the Reverb chapter
and in ladder §5**, not in an appendix. `60-complexity-ladder.md` §5 currently teaches pre-delay as
a real spatial control.

---

#### B6. The shipped MIDI example transposes two semitones per key and multiplies its release by zero
**Severity: blocker.**

**What the reader experiences.** The one bundled patch demonstrating live MIDI plays every interval
doubled and cuts every note dead on key-release. A reader learning what V/Oct and gate mean from
this patch learns the wrong lesson twice.

**Evidence.** `sax3.json:231-236` wires MIDI `pitch` (node 6, `:150-151`) into the Oscillator's
`input_freq` (node 2, `:47-48`). The oscillator's base pitch is *already* the played note
(`codegen.odin:129`) and `input_freq` is applied exponentially on top (`:156`), while the Pitch port
emits `(note−69)/12` (`:723`) — so `f = 440·2^((n−69)/6)`. The chapter's worked figures are right:
C4 → 155.6 Hz, C5 → 622.3 Hz. Separately, `sax3.json:237-242` wires MIDI Gate into node 7's `input`
port; node 7 is the ADSR (`:176-177`), whose `input` is a **multiplicand** defaulting to 1.0
(`codegen.odin:217`), emitted as `node_<id>_out = (input) * envelope * (depth) * vel_scale`
(`:285`). Gate goes to 0.0 the instant `voice.time_released > 0.0` (`:726-727`), stamped at note-off
(`:1470`) exactly when the stage becomes `.Release` (`:1477`). The patch's release is 0.213 s
(`sax3.json:186`) and is multiplied by zero throughout.

**Manual should:** document current behaviour and use it as the worked example of B7 (the "Gate"
port is not a gate). Consider shipping a corrected `sax3` alongside.

---

#### B7. Exposure emits a setter, a PARAMS row and a working `set_param` for parameters the DSP never reads
**Severity: blocker.**

**What the reader experiences.** The manual teaches exposure as the bridge from patch to game code.
A reader who exposes the *default* parameter set on a BPM-synced LFO, S&H or Delay ships an asset
whose documented API contains dead knobs — and `set_param` returns `true`, so nothing at runtime
tells them. The UI hides these controls when they are inert; the generated API does not, which
makes the export the least honest surface in the system.

**Evidence — root cause.** Exposure resolution walks `effective_exposed_params` unconditionally,
with no check that the node's generator reads the parameter: `codegen.odin:1187-1231` (resolve),
`:1262-1263` (struct field), `:1327-1328` (init), `:1612-1625` (typed clamped setter),
`:1631-1643` (PARAMS row), `:1683-1691` (`set_param` returns `true`).

**Instances.** (a) Oscillator `frequency` — exposed by default (`node-definitions.ts:88`) but
`base_freq_str` stays `"voice.current_freq"` unless `fixedPitch` (`codegen.odin:129-132`);
`dual_osc.odin.golden` emits the field (`:108`), init (`:128`), a 20-20000 clamped setter
(`:264-268`), a PARAMS row (`:350`) and dispatch (`:369-370`) while the DSP at `:478` reads
`voice.current_freq`. (b) Oscillator `pulseWidth` on a non-Square oscillator — read only inside the
Square branch (`codegen.odin:196-204`), yet the golden emits it for two *Sine* oscillators
(`:110`, `:278-282`, `:352`). (c) Wavetable `frequency` — same `fixedPitch` gate
(`codegen.odin:476-478`), exposed by default (`node-definitions.ts:62`). (d) LFO `frequency` under
BPM sync — `freq_str` is computed and then unconditionally overwritten
(`codegen.odin:364-367`); `wobble-samplehold-bass.skald.json:111-113` ships `bpmSync: true` with
`exposedParameters: ["frequency","amplitude"]`. (e) S&H `rate` under BPM sync — identical
overwrite at `:390-393`, exposed by default (`node-definitions.ts:70`). (f) Delay `delayTime` under
BPM sync — overwrite at `:509-512`, exposed by default (`node-definitions.ts:120`). (g) LFO
`bpmSync`/`syncRate` and Reverb `preDelay` — read at codegen time only (`codegen.odin:30-35`) or
never. (h) MidiInput `device`/`useMpe` — exposed by default (`node-definitions.ts:184`) and shipped
exposed (`sax3.json:159-162`); both are non-numeric and the resolver reads only
`json.Float`/`json.Integer` (`codegen.odin:1194-1197`), so both resolve to 0.0 with a ±1e6 range.

**Manual should:** document current behaviour. The Export chapter must carry a table of "exposable
but inert" combinations.

---

### CONFUSING

#### C1. Advertised ranges the DSP silently clamps away
**Severity: confusing.**

**What the reader experiences.** The "sweep it and listen" exercises hit an invisible wall: the top
1.4 octaves of every cutoff control, the top two-thirds of Tone, the top 5% of Feedback, and
between a third and a half of the Resonance range do nothing. The resonance dead zone *changes size
as you move cutoff*, so the control feels erratic rather than limited. Nothing in the app says so.

**Evidence.** Filter cutoff: UI and table say 20-20000 Hz (`FilterNode.tsx:14`,
`NodeParameterControls.tsx:152`, `param_ranges.odin:51`); DSP clamps to `sample_rate * 0.16`
(`codegen.odin:339`) = **7,680 Hz @ 48 kHz, 7,056 Hz @ 44.1 kHz**, with the divergence rationale
commented at `:331-338`. For a highpass this means the corner cannot be placed above ~7.7 kHz at
all. Filter resonance dead zone: `q = clamp(1.0/max(res,0.1), 0.05, 1.9 − f)` (`:341`) — at 200 Hz /
44.1 kHz, `f = 0.0285`, so minimum effective resonance is `1/1.8715 = 0.534`; at maximum cutoff
`f = 0.9635`, so it is `1/0.9365 = 1.068`. The UI minimum is 0.1. Distortion tone: the coefficient
`clamp(2π·f/sample_rate, 0.001, 1.0)` (`:595`) saturates at `f = 44100/2π = 7,018 Hz`, above which
the one-pole is `y = x`. Delay feedback: clamped to 0.95 at use (`:532`) against a 0.99 setter clamp
and a 1.0 panel slider. Delay length: `MAX_DELAY_SAMPLES :: 96000` (`:19`) and
`clamp(time*sample_rate, 1, 96000−1)` (`:526`) — the "2 second" ceiling is **2.177 s at 44.1 kHz and
1.0 s at 96 kHz**, with the source comment acknowledging it at `:12-18`. A BPM-synced `1/1` at
`BPM_MIN = 20`… at 60 BPM resolves to `(60/60)*4 = 4 s` (`:48-50`), overflowing the buffer. Panner:
an exposed LFO amplitude has range `{0, 20000, 1}` while pan is clamped to ±1 at use (`:674`).

**Manual should:** document current behaviour — this is genuinely educational material about why
digital filters need guard rails, and `00-foundations.md:309-311` and `60-complexity-ladder.md:113`
already make it audible in an exercise, which is exactly right.

---

#### C2. Modulation is additive, not multiplicative or substitutive
**Severity: confusing.** *Editorially, this belongs in chapter bodies, not in notes.*

**What the reader experiences.** "Patch the envelope into the amp input" is the first thing anyone
learns in modular synthesis. In Skald it produces a note that never stops, or a ring-modulated buzz.

**Evidence.** `get_f32_param` builds `(base) + (mod)` for every modulatable parameter
(`param_utils.odin:138-155`, accumulation at `:149-153`). Consequences: the Noise "Amp" input
(`NoiseNode.tsx:6`) is summed into a default amplitude of 1.0 (`node-definitions.ts:98-102`,
`codegen.odin:298`, `:314`), so an envelope can only make it *louder*. The Gain default is 0.75
(`node-definitions.ts:154`), so ADSR→VCA never reaches zero — and **every shipped example that uses
the idiom overrides it to 0**: `four-bar-song.skald.json:18,49,82,112,142` and
`fm-rhodes-electric-piano.skald.json:66`. The growl-bass Mapper labelled "Mod Depth 0.3-1.0"
(`fm-growl-bass.skald.json:107,110-111`) sums onto a modulator amplitude of 1 (`:30`), giving
**1.3-2.0** — and against `modIndex: 190` (`:43`) an effective index of **247-380**. The sax3
ADSR→`input_cutoff` wire adds a 0-1 envelope to an 857 Hz cutoff (`sax3.json:249-254`, `:86`) —
sub-hertz, inaudible. The Gain palette tooltip promising tremolo is at `Sidebar.tsx:278`, and the
LFO is bipolar around zero (`codegen.odin:379-385`) with default amplitude 1.0.

**Manual should:** document as a *convention*, prominently, early. It is consistent and defensible,
but undocumented in the app, and the manual is the only place a beginner learns it before wasting
an hour. The `fm-growl-bass` Mapper label — a shipped patch whose own label is off by 4× because of
this rule — is the best worked example in the manual and should be lifted out of the bass appendix
into the modulation section.

---

#### C3. The ADSR's input handle is labelled "Gate" but is a VCA signal input
**Severity: confusing.**

**What the reader experiences.** Anyone with modular experience — the manual's likely reader — patches
an LFO or MIDI Gate into a port labelled "Gate" and gets ring modulation instead of a triggered
envelope. `sax3.json` does exactly this and silences its own release (B6).

**Evidence.** `ADSRNode.tsx:6` declares `inputs: [{ id: 'input', label: 'Gate' }]`.
`generate_adsr_code` initialises `input_str := "1.0"` (`codegen.odin:217`), sums all connections
into it (`:219-232`), and emits `node_<id>_out = (input) * envelope * (depth) * vel_scale` (`:285`).
Actual gating comes from `note_on` (`:1404-1410`) and `note_off` (`:1470-1479`), neither of which
reads any port, and the auto-release at `:1758-1768`. There is no patchable gate anywhere.

**Manual should:** document — and it already does, well, at `adsr.md:28`, `50-bass-teardown.md:173`
and `60-complexity-ladder.md:159`. Keep the warning early; the exercises route audio into a port
called "Gate" repeatedly.

---

#### C4. An exposed parameter initialises unclamped, so the first setter call causes an audible jump
**Severity: confusing.**

**What the reader experiences.** A patch runs correctly and then jumps the instant a game — or the
editor's own live-param path — touches the knob for the first time. For Sample & Hold this is the
exact workflow the chapter recommends.

**Evidence.** Init writes `p.<field> = <default>` where `default` came from
`node.parameters[p_name]` **unclamped** (`codegen.odin:1193-1198` → `:1327-1328`), while the typed
setter clamps (`:1620-1623`) and the PARAMS row prints `{min, max, default}` from the same unclamped
default (`:1631-1642`) — so PARAMS can advertise a default outside its own declared range. S&H has
no `amplitude` override, so `lookup_param_range` falls through to `{0.0, 1.0, 0.5, ""}`
(`param_ranges.odin:86-87`) while the node card offers 0-10 (`SampleHoldNode.tsx:14`). Filter
resonance has a table max of 20 against a panel/XY-pad max of 30. The live-preview path goes through
the same clamp: exposed values are masked from the rebuild fingerprint
(`projectSerializer.ts:236-247`) and applied via the generated `set_param` (`codegen.odin:1677-1693`).

**Manual should:** document current behaviour.

---

#### C5. A Panner feeding anything but Output silently loses its stereo image
**Severity: confusing.**

**What the reader experiences.** They build Panner → Filter → Output, hear it work, and never learn
their panning was thrown away. No error, no warning, no visual cue.

**Evidence.** `generate_graph_output_adds` is the only place that routes L/R, and only when
`src_node.type == "Panner"` (`codegen.odin:1978-1980`); it is called exclusively for GraphOutput
nodes (`:1833`, `:1934`). Every other consumer reads `node_<id>_out`, the `0.7071068 * (L+R)`
mono downmix (`:680`). The golden confirms it: `panner_mono.odin.golden:328` writes the downmix and
`:332` shows the Gain node reading `node_3_out`. The acceptance comment recording that the downmix
fixed total silence is at `acceptance/main.odin:412-414`. The node declares one `output` handle
(`PannerNode.tsx:10`).

**Manual should:** document — and **promote it**. "A Panner only produces stereo if it feeds Output
directly" is a patching rule the reader needs *before* ladder §5's spatial exercises, not as an
aside inside a cosmetic bullet.

---

#### C6. The LFO can never run on the bus, and a voice-domain LFO feeding a bus-domain node is summed across voices
**Severity: confusing.**

**What the reader experiences.** There is no way to get one shared LFO across a polyphonic
instrument — what every hardware synth gives you by default. And the shipped `glassy-fm-pluck`'s
auto-pan gets squarer as more notes are played, which is baffling without this explanation.

**Evidence.** `compute_bus_domain` marks a node bus-domain only if it is a Delay/Reverb/GraphInput or
has an incoming connection from one (`codegen.odin:70-88`), and `valid_input_ports` returns
`nil, true` for LFO — "sources only — no modulation inputs" (`graph_validate.odin:57-58`) — with
`validate_connections` rejecting any wire into it (`:131-151`), run before the domain split
(`codegen.odin:1012` then `:1014`). So the processor-side LFO phase field (`:1142-1143`) and the bus
dispatch (`:1929-1930`) are both dead code. Cross-domain: `<var>_vsum` is accumulated per voice
(`:1846-1848`) and handed to the bus block (`:1889-1890`), with per-voice LFO phase (`:1079`).
`glassy-fm-pluck.skald.json`: `glass-autopan` has no inputs, `glass-panner` sits downstream of
`glass-delay` (`:119-121`), voiceCount 12 (`:11`), release 0.4 s (`:52`), amplitude 0.7 (`:92`).

**Manual should:** document as a stated limitation.

---

#### C7. The preview is not the export below master volume 1.0
**Severity: confusing.**

**What the reader experiences.** The manual's core promise — audition it, then export it and it
sounds the same — is false below slider 1.0. A reader who auditions at half volume ships something
more saturated than what they heard, and the code comment they might check says the opposite.

**Evidence.** The comment asserting "identical … so the preview IS the export" is at
`codegen.odin:2598-2599`, and the emitted line is
`skald_left[i] = math.tanh(mixed_left * <master_vol>)` (`:2623`). But `buildModule` passes a literal
1.0, with the recompile-avoidance comment at `useWasmAudioEngine.ts:92-95` (repeated at `:328`), and
the slider drives a Web Audio GainNode via `masterGainNode.gain.setTargetAtTime`
(`SequencerDock.tsx:105`) that sits **after** the worklet (`useWasmAudioEngine.ts:191-196`). So the
preview computes `0.5·tanh(x)` where the export computes `tanh(0.5·x)`.

**Manual should:** document current behaviour in the Output chapter and the Export chapter.

---

#### C8. Uncontrolled `<select>` when the key is absent
**Severity: confusing.** *The worst kind of teaching artefact: the app disagrees with itself about
what the patch is.*

**What the reader experiences.** They open the highpass example, the panel says "Lowpass", and the
exported code is a highpass. Touching any other control can re-save the file with the displayed lie.

**Evidence.** `NodeParameterControls.tsx:65` is `<select name={paramKey} value={data[paramKey]} …>`
with **no fallback**. `DistortionParams` declares only drive/tone/mix (`types.ts:116-120`) and
`defaultDistortionParams` sets only those three (`node-definitions.ts:130-135`), while the select is
rendered at `:243` and the codegen reads `shape` defaulting to `classic` (`codegen.odin:573`,
switch at `:584-597`). For Filter: `percussive-high-pass-hit.skald.json:5` stores
`"filterType": "Highpass"` with no `type` key; `get_string_param` falls back to `filterType` for
Filter nodes (`param_utils.odin:192-199`) and the generator emits a genuine highpass
(`codegen.odin:350-352`), while the panel reads `data.type` → `undefined`. The canvas node has the
same problem via `String(value ?? field.options?.[0] ?? '')` (`ParamNode.tsx:79`), which explicitly
shows `Lowpass`.

**Manual should:** document. Note also that `saw-lead.skald.json:5` — the file `00-foundations.md`
makes its starting patch — carries the same legacy `filterType` key, and `00-foundations.md:280`
describes it as "Filter, Lowpass" without noting the dropdown is rendering an undefined value and
only coincidentally showing the right thing.

---

#### C9. Shipped examples use legacy or nonexistent parameter keys the backend honours and the editor does not
**Severity: confusing.**

**What the reader experiences.** The manual points them at an example to see a technique. They open
the file and the editor shows a delay time of 0, a pad with a "size" control that does not exist, or
a PWM patch whose headline modulation wire is not drawn on the canvas. Touching the control can
permanently retire the legacy key and change the sound.

**Evidence.** `classic-delay-puck.skald.json:5` has `"time": 400, "wetDryMix": 0.5` and no
`delayTime`/`mix`. The backend honours both (`param_utils.odin:113-121` for `wetDryMix`, `:122-131`
for `time`/1000, `codegen.odin:517-520`) while the UI reads only `delayTime`/`mix` — the card shows
0 (`ParamNode.tsx:105`) and the panel shows its own default of 0.5 against an exported 0.4 s.
`pwm-pad.skald.json:10` wires `"targetHandle": "pulseWidth"`; the React Flow handle id is
`input_pulseWidth` (`OscillatorNode.tsx:12`), the backend rewrites it on load (`json.odin:40`), and
the serializer passes `targetHandle` straight through (`projectSerializer.ts:84`).
`ambient-reverb-pad.skald.json:6` sets `"size": 0.9`, which appears in no type, no control and no
read.

**Manual should:** document, and add a front-matter note listing the affected examples.

---

#### C10. The Output node's oscilloscope and Test Audio are project-wide, not per-node
**Severity: confusing.**

**What the reader experiences.** In a two-instrument project both scopes draw the same wave and
Test Audio plays both instruments — so neither can answer "which one is hot?", the exact diagnostic
question the chapter poses. Test Audio also always fires MIDI 60 for 200 ms, which is the wrong
octave for a bass patch and shorter than most bass envelopes.

**Evidence.** `app.tsx:279-287` maps the one `analyserNode.current` into every node of type
`output`/`GraphOutput`/`InstrumentOutput`, and that analyser is chained *after* `masterGain`
(`useWasmAudioEngine.ts:191-196`), while `GraphOutputNode.tsx:21-27` renders it as if per-node. Test
Audio stamps `lastTrigger` (`ParameterPanel.tsx:327-332`) and the handler posts
`{ type: 'trigger', asset: -1, note: 60, velocity: 1.0, duration: 0.2 }`
(`useWasmAudioEngine.ts:350`), which the worklet expands with
`if (m.asset < 0) this.forEachAsset(…)` (`skaldWasm.worklet.ts:125-127`). It is also gated on
`isPlaying` (`:343`), which is why it is dead on loose graphs (B1).

**Manual should:** document. `50-bass-teardown.md:171` and `:292` already warn about the octave.

---

#### C11. A patch with no Output node builds clean and returns silence
**Severity: confusing.**

**What the reader experiences.** They forget or disconnect the Output node, get a green "generated
OK", and ship a silent asset — with the generator's own loud-failure convention working against them
everywhere else.

**Evidence.** The refusal convention is at `codegen.odin:1836-1841` (unknown node type →
`os.exit(1)`) and `validate_connections` hard-fails on unknown ports
(`graph_validate.odin:90-152`). But `graph_validate.odin`'s only mention of `GraphOutput` is `:51`,
listing it as a node type with an `input` port — **no existence check**. `output_left`/`output_right`
are declared 0.0 (`codegen.odin:1722-1723`) and written only by `generate_graph_output_adds`
(`:1965-1987`). The preview has a different, correct error (`useWasmAudioEngine.ts:96-97`).

**Manual should:** document as a checklist item.

---

#### C12. Instrument ports collapse into one stereo pair, and instrument-to-instrument wires are never serialised
**Severity: confusing.**

**What the reader experiences.** The canvas looks like a routable patch bay; the export is a set of
independent assets. A reader who builds a two-instrument chain and exports it gets something
structurally different from what they see, with no warning.

**Evidence.** `useNodeComposition.ts:113-127` documents the (node, handle) port keying and the
cross-wiring bug it fixed; ports are created at `:134-150` and `:157-173`, the edge carries the name
at `:152`/`:175`, and the list is advertised at `:191-192`. On the backend, `InstrumentOutput`
normalises to `GraphOutput` (`node-definitions.ts:219`, `json.odin:29`) and
`generate_graph_output_adds` reads no `name` parameter — every GraphOutput adds into the same
`output_left`/`output_right` (`codegen.odin:1965-1987`). In `buildProjectData` the only use of
`edges` is `edges.find(e => e.target === instNode.id)` to locate a midiInput
(`projectSerializer.ts:130-143`); no inter-instrument audio connection is emitted, and
`project_process` just sums assets side by side (`codegen.odin:2398-2414`). The `<Foo>_feed_input`
guidance in the generated header is at `:2273-2275`.

**Manual should:** document in the Output and Export chapters.

---

#### C13. Mixer per-channel pan is dead in both directions
**Severity: confusing.**

**What the reader experiences.** There is no way to place individual sources inside a Mixer. Each
source needing its own stereo position needs its own Panner wired straight to Output — a real
structural constraint the saved JSON contradicts.

**Evidence.** `types.ts:122-126` declares `pan: number; // Added pan for more realistic mixing`;
`node-definitions.ts:139-144` seeds `pan: 0` on all four channels; both edit paths preserve it
(`MixerNode.tsx:23`, `NodeParameterControls.tsx:260`); `slap-bass.skald.json:85-87` serialises it.
Neither the panel branch (`ParameterPanel.tsx:338-348`) nor the shared branch
(`NodeParameterControls.tsx:277-294`) renders a pan control, and `generate_mixer_code` reads only
`inputCount` and each entry's `level` (`codegen.odin:602-665`, key read at `:649`).

**Manual should:** document as a stated limitation, alongside C5.

---

#### C14. Sustain at or below 0.0001 discards the Release stage the UI draws
**Severity: confusing.**

**What the reader experiences.** Percussive envelopes — the most common thing a beginner builds —
quietly lose their release tail while the picture in front of them shows one. The reader spends time
adjusting a control that provably cannot matter.

**Evidence.** `codegen.odin:275` emits `if envelope <= 0.0001 do voice.adsr_<id>_stage = .Idle`, with
the intentional-fix comment at `:272-274`; the voice then deactivates via
`if !voice_busy do voice.active = false` (`:1859-1864`). `AdsrEnvelopeEditor.tsx:97-105` always
builds p4/p5 including the release ramp regardless of sustain, and the Release box stays editable.

**Manual should:** document in the ADSR chapter body.

---

#### C15. Other confusing items, in brief

| Finding | Severity | Reader experience | Evidence |
|---|---|---|---|
| **Wavetable morph is not level-normalised** — sweeping Table Position changes level by ~10.8 dB with no compensation | confusing | The manual asks the reader to sweep Position and listen to the *timbre*. A large volume change rides on top, making the timbre lesson impossible to isolate. **Belongs in the chapter body, not the notes.** | `skald_wavetable_sample` returns `s1 + (s2−s1)*frac` with no compensation (`codegen.odin:2315-2323`) over `sin`, `abs(4ph−2)−1`, `2ph−1`, `ph<0.5?1:−1` (`:2307-2314`). Independently recomputed: at position 2.5 RMS² = 1/24 + 1/24 = 0.08333, RMS = 0.2887; `20·log10(1.0/0.2887) = 10.8 dB`. The acceptance test only asserts `Change_Expect{centroid = .Raise}` (`acceptance/main.odin:470-483`). |
| **A fresh Wavetable shows "Amp: 0" while producing full-level audio** | confusing | Their first Wavetable displays level 0 and is loud; typing a number into the Amp box makes it jump. Reads as a broken control on the very first node the chapter places. | `defaultWavetableParams` has no `amplitude` key (`node-definitions.ts:58-63`); the canvas renders an Amp field (`WavetableNode.tsx:17`) and `FieldControl` computes `Number(value ?? 0)` → 0 (`ParamNode.tsx:105`); `generate_wavetable_code` falls back to **1.0** (`codegen.odin:499`). |
| **FM default Mod Index is 100 while the node's own comment says 1-8** | confusing | The chapter's first FM exercise — two operators, one into the other's Mod input — produces aliased noise at the defaults, 12-65× past the node's own stated musical window. | `node-definitions.ts:54` sets `modIndex: 100`; `param_ranges.odin:94-95` returns `{0, 1000, 100}`; `FMOperatorNode.tsx:4-5` reads "the musical range is roughly 1-8; large values are noise". Shipped values: 1.5, 3.5, 4, 6. |
| **Distortion `asymmetric` produces DC with no blocker anywhere** | confusing | Safe at low drive; at high drive the reader gets level loss plus thumps at note boundaries and no idea what is wrong. | `codegen.odin:590`: `dist_in > 0.0 ? dist_in : dist_in / (1.0 + abs(dist_in * dist_k))` — positive branch untouched, negative attenuated, so the mean shifts. The only filter in the node is the one-pole lowpass (`:595-596`); the only downstream processing is the master `tanh` (`:2417-2418`), which does not remove DC. |
| **Glide only arms when a note steals a busy voice** | confusing | `fretless-bass` (glide 0.08, voiceCount 4) and `fingered-electric-bass` (glide 0.015, voiceCount 6) rarely glide. **"Set voiceCount to 1 or glide will not happen" is a real audio-engineering rule (monophonic legato) that the app never states — promote it into the chapter body next to Exercise 3 step 10.** | `codegen.odin:1341-1355` sets `stolen` only when no free voice exists; `:1392-1398` emits `if stolen && v.glide_time > 0.0 && prev_freq > 0.0 { … }` with the comment "Fresh voices start exactly on pitch"; the per-sample slide at `:1745-1753` only runs while `current_freq != target_freq`. `sub-808-glide-bass:11` and `random-acid-bass:11` both use voiceCount 1. |
| **The Piano Roll's visible range starts at MIDI 36, above the notes twelve of the fourteen bass patches use** | confusing | A reader opens the Piano Roll to study the riff they were just told to study, and the notes are simply not there. **Route bass note editing through Step Properties from the start.** | `PianoRoll.tsx:20-21`: `MIN_NOTE = 36`, `MAX_NOTE = 84`. Twelve of the fourteen bass examples contain notes; all twelve contain at least one below 36 (minima: 24, 28×5, 29, 31×3, 33, 35). `StepPropertiesEditor.tsx:191-194` allows 0-127. |
| **The delay-time panel slider offers 5 s; the ring buffer holds 2 s at 48 kHz** | confusing | A reader building the ladder's long-tail dub delay sets 3-4 s, hears 2, and gets no explanation. | `NodeParameterControls.tsx:173` `slider('delayTime', 0.001, 5, 0.5)`; `param_ranges.odin:74-75` `{0, 2, 0.5, "s"}`; `MAX_DELAY_SAMPLES :: 96000` (`codegen.odin:19`) with the consequence spelled out at `:12-18`; truncation at point of use, `:524`. The serializer does not clamp it, so the value survives export intact and is truncated when used. |
| **MIDI device selection and MPE are unimplemented** | confusing | A reader with an MPE controller ticks the box, sees an "MPE Active" badge, and gets nothing. A reader with two keyboards selects one and hears both. Neither failure produces a diagnostic. | MPE checkbox `ParameterPanel.tsx:371-374`, badge `MidiInputNode.tsx:27-31`; `grep -ril mpe skald-backend/core/` matches only the substring inside "clamped". The preview handles only 0x90/0x80 (`useWasmAudioEngine.ts:369-379`), attaches to every input port (`:385-387`), posts `asset: -1` (`:373`); `voice.velocity` is written once at note-on (`codegen.odin:1384`) and never updated. Device options are "All Devices" / "Device A (Mock)" / "Device B (Mock)" (`ParameterPanel.tsx:365-367`). The whole `midi_config` contract is consumer-less: serialised (`projectSerializer.ts:128-143`), parsed and stored (`json.odin:280`, `types.odin:118, 164`), read by nothing. |
| **The Instrument's own expose buttons do nothing** | confusing | Volume, Voice Count, Glide, Unison and Detune each draw a link button titled "Expose … to public API". Clicking it lights the icon and grants no capability. | `ParameterPanel`'s `wrapper` defaults `isExposable = true` (`:281`, button at `:228-236`) and the instrument branch passes it straight through (`NodeParameterControls.tsx:318-322`). `toggleParameterExposure` writes to the node's `exposedParameters` (`ParameterPanel.tsx:197-211`), but the serializer emits a fixed object (`projectSerializer.ts:189-210`) and the exposure walk iterates only `all_nodes` inside the subgraph (`codegen.odin:1173-1190`). Structurally unfixable without redesign: unison sizes the phase array (`:1064`), voiceCount sizes the voices array (`:1105`), glide decides whether the block is emitted at all (`:1746`), volume (`:1951`) and detune (`:182`) are baked literals. |
| **The ADSR envelope graph caps at 4 s and floors every drag at 0.001 s** | confusing | A pad with a 6-second release — the manual's own pad exercise — has its release handle off the right edge, with no explanation. | `AdsrEnvelopeEditor.tsx:74` sets `maxTime = 4.0`; `:122` clamps x to `[0, width]`; `:129`, `:138`, `:144` all apply `Math.max(0.001, …)`. The number boxes allow 0 (`ADSRNode.tsx:9-12`, `NodeParameterControls.tsx:131-134`), the codegen handles a literal 0 deliberately (`codegen.odin:257`), and the exposed setter clamps to the table minimum of 0.001. |
| **Three layers disagree about a parameter's default when the key is absent** | confusing | Mostly invisible to a reader who only builds in the editor, but it makes the manual's own numbers unreliable — "the default" depends on which layer you ask. It bites when a game tool offers "reset to default" from the PARAMS table. | Noise amplitude: UI 1.0 / codegen fallback 1.0 / `lookup_param_range` **0.5** (`param_ranges.odin:86-87`), and 0.5 is what init and PARAMS use. Filter cutoff: codegen 1000.0 (`:323`) vs 800 in both other layers. Reverb decay: codegen 0.5 (`:544`) vs UI 3.0 vs table 0.1. Mixer level: UI 0.75 vs codegen 1.0 vs table 1.0 (**2.5 dB hotter**). Mixer inputCount: UI 4 vs backend 8 (`codegen.odin:606`, `graph_validate.odin:78`). ADSR: UI 0.1/0.2/0.5/1.0 vs table 0.1/0.1/0.7/0.2 vs codegen 0.01/0.1/0.7/0.1. FM ratio: UI 2 vs panel default and double-click reset 1 vs table 1.0. |
| **The Parameter Panel shadows three branches of the shared control component** | confusing | The manual tells the reader to change the Mixer's input count, and they can only do it on the canvas node, never from the panel where every other parameter lives. | `ParameterPanel.renderNodeParameters` returns for `mixer` at `:338-348` and `mapper` at `:349-358` **before** the fall-through to `<NodeParameterControls>` at `:381-388`. The unreachable Mixer branch — with its 0-2 sliders and its editable Inputs field (`NodeParameterControls.tsx:254-296`) — never renders. The Mapper branch passes `false` for `isExposable` on all four params (`:249-252`) while the panel branch uses the default `true`. Both `60-complexity-ladder.md` finding 3 and `50-bass-teardown.md` finding 9's framing were written against the dead copy. |

---

### COSMETIC

| Finding | Reader experience | Evidence |
|---|---|---|
| **Four ADSR modulation ports exist only in codegen** — `input_attack`, `input_decay`, `input_sustain`, `input_release` are read by the generator and the validator but have no handles in the editor | A capability the manual could teach (envelope-time modulation) is invisible and reachable only by hand-editing JSON | `codegen.odin:237-240`; `graph_validate.odin:27`; `ADSRNode.tsx:6` declares only `{ id: 'input', label: 'Gate' }` |
| **Master volume is compile-time only** | Changing overall level at runtime requires a re-export or an exposed VCA gain; neither is signposted | `codegen.odin:2417-2418` emits a literal; per-instrument volume is a literal at `:1951`. `grep 'project_set_volume\|set_volume' codegen.odin` → zero hits. The dock fader (`SequencerDock.tsx:208-218`) is persisted with the session (`useFileIO.ts:129-130`) |
| **`voiceStealing` is declared, defaulted, written and carried by every example, and read by nothing** | Low today — behaviour matches the value every example carries — but the chapter cannot teach voice-stealing strategy from a control with one implementation | `types.ts:194`; `node-definitions.ts:166`; `useNodeComposition.ts:187`; no control, not serialised (`projectSerializer.ts:189-210`), no backend field (`types.odin:150-166`), and `note_on` compares only `age` (`codegen.odin:1344-1354`). 62 occurrences across 58 files, all `"oldest"` |
| **Wavetable `tableName` is a required type field nothing reads, and Wavetable amplitude cannot be exposed from any UI surface** | A reader inspecting a saved file sees a meaningless `tableName`, and cannot expose Wavetable level for runtime control without hand-editing JSON — an inconsistency with the Oscillator | `types.ts:51` non-optional; `node-definitions.ts:59`; `pad-sequenced.skald.json:33`; `fixtures/wavetable_morph.json:22`; never looked up (`codegen.odin:470-505`); dropdown-removal comment at `NodeParameterControls.tsx:205-207`. The panel's `case 'wavetable'` renders only Fixed Pitch / Frequency / Position (`:203-214`), the expose button attaches only to `renderControlWrapper` (`ParameterPanel.tsx:228-236`), and `makeParamNode` renders no expose affordance (`ParamNode.tsx:111-129`) — while the codegen would honour it (`codegen.odin:499`) |
| **Distortion drive is unclamped at the top for non-exposed nodes** | Minor — nothing explodes, the signal just squares up — but the stated 1-100 range is a UI convention, not an enforced contract | `codegen.odin:583` is `math.max(f32(<drive>), 1.0)`; tone is `math.clamp(…, 100, 20000)` (`:595`) and mix `math.clamp(…, 0, 1)` (`:597`). `.claude/phase1-findings/failing-graphs/distortion_edge_big.json` sets `"drive": 1000000000` |
| **Distortion `shape` is read by codegen and offered in both UIs but absent from `DistortionParams` and the defaults** | Only readers of the TypeScript contract are misled — the select writes the key even though the default omits it, so `50-bass-teardown` Exercise 3 step 8 works | `codegen.odin:573`, `:584-597`; `NodeParameterControls.tsx:243`; `DistortionNode.tsx:10`; `types.ts:116-120`; `node-definitions.ts:130-135` |
| **Three palette tooltips misstate node behaviour** | A reader browsing the palette will not discover pink noise, and will be told a patch produces tremolo when it produces ring modulation. The palette cannot be trusted as a first-pass reference | `Sidebar.tsx:265` reads `tip: 'White noise source.'` while the node has offered White/Pink since `NoiseNode.tsx:9` (type at `types.ts:88`, Kellett pink at `codegen.odin:292-310`, used in `wind`, `normal-sax`, `growly-sax`, `boss-war-tuba`, `tuba-breath-ballad`) — and `README.md:73` repeats the error. `Sidebar.tsx:278` promises tremolo from the Gain input, which with a bipolar LFO at the recommended knob setting of 0 gives ring modulation. `Sidebar.tsx:280` carries the correct V/Oct explanation that the node itself does not show |
| **Small dead fields and inert affordances** | Negligible individually. The one a reader will hit is **Create Group**: select one node, the button is lit, click, nothing happens | `AdsrParams.lastTrigger` (`types.ts:101`) is only ever written on Output-type nodes; Mapper's `defaultParameters` omits `exposedParameters` where every other node seeds it; `codegen.odin:643` reads `levels[i-1]` positionally while both UI paths match by id; `app.tsx:379` sets `canCreateInstrument={selectedNodesForGrouping.length > 0}` and that one flag drives both buttons (`Sidebar.tsx:213`, `:221`) with tooltips reading "Select 2 or more nodes", while `handleCreateGroup` returns early on `<= 1` (`useNodeComposition.ts:214-216`); LFO waveform option order differs between card (`LFONode.tsx:14`) and panel (`NodeParameterControls.tsx:157`) |
| **No test coverage for Distortion or Sample & Hold** | No direct reader impact, but worth stating: the numbers those two chapters cite are not pinned by any executable expectation, so they are likelier than others to go stale | No fixture, golden (28 files) or UI test references either node. The header comment recording the Distortion generator's previous total failure — matching shape strings the UI never sent, dropping tone and mix, shipping 100% wet — is at `codegen.odin:564-567` |
| **`skald-ui/new_docs/` is uniformly stale** | **Zero** reader impact — the manual never sends anyone there | All fifteen cited files end with "Emitted Events / Outputs: None" and "Dependencies: React, reactflow", and document only `data`. `NoiseNode.md:3` says "has no inputs" while `graph_validate.odin:28` lists `input_amp`; `WavetableNode.md:3` describes "cycling through a table of waveform samples" (there is no table). `GainNode.md`, `MapperNode.md` and `MidiInputNode.md` do not exist. **Handle with one sentence in the front matter — "ignore `skald-ui/new_docs/`, it predates every node" — not sixteen separate chapter notes.** |
| **Eleven acknowledged design gaps against standard practice** | None is a bug and most are correct for a game-audio tool, but they are where the manual's promise breaks down: the reader reads about self-oscillation, dotted-eighth delay, tape wobble and supersaw phase spread and finds no control for any of them. **These belong in the new "What Skald deliberately does not do" chapter, not in notes** | No band-limiting: naive saw (`codegen.odin:195`), pulse (`:200-204`), triangle (`:206`), no BLEP/BLIT/DPW anywhere. No self-oscillation: damping floor 0.05 (`:341`). No resonance level compensation: `high = input − low − q*band` with no scale term (`:344`). No makeup gain on Distortion (`DistortionNode.tsx:8-13`); classic at drive 20 is `(π+20)/π = 7.36×` = **+17.3 dB** small-signal (`:592`). No dotted divisions (`bpm.ts:33-41`). No delay-time modulation (all Delay params use an empty input port, `:509-520`). "Simple FDN" overstates one comb with a fixed 0.075 s tap (`:547`, `:551-559`) = 13.3 echoes/s. No reverb wet-gain compensation — no `1/(1−g)` correction at `:560`, against Delay's explicitly commented feedback clamp at `:529-532`. No pan-law choice (hard-coded sin/cos, `:674-676`). Unison copies start at phase zero (`:1427`) |

---

### REFUTED / CORRECTED

**Do not soften these. They must be removed or rewritten in the chapters.**

| # | Chapter claim | Verdict | Why |
|---|---|---|---|
| R1 | `nodes/noise.md` finding 5: "**No output limiting anywhere in the chain.**" | **REFUTED** | There is a master soft limiter at `codegen.odin:2417-2418` (`project_process`) and `:2623` (the WASM preview shim), with the ceiling comment at `:2415-2416`. Four other chapters (`filter.md` 8, `reverb.md` 7 and `:89`, `distortion.md` 5, `gain.md` 3) correctly cite exactly this limiter. The narrow true claim: the per-asset `<Foo>_process` returns `output_left * volume, output_right * volume` with no saturation (`codegen.odin:1951`) — and the generated header recommends games call the per-asset procs rather than the project wrapper (`:2279-2280`), so a game gets no limiting. Rewrite to that. |
| R2 | `60-complexity-ladder.md` finding 3: "**Mixer channel levels cannot be exposed from the UI.**" | **REFUTED** | `ParameterPanel.tsx:338-348` intercepts `type === 'mixer'` with `isExposable = true` before `NodeParameterControls` is reached. The `false` rows at `NodeParameterControls.tsx:278-293` are dead code (only `StepPropertiesEditor.tsx:174` reaches them). Mixer levels are exposable with one click — and doing so is destructive (B4). The chapter states the exact opposite of a blocker-severity bug. |
| R3 | `60-complexity-ladder.md` finding 8: four examples "use pre-rename modulation handles … which the port validator rejects outright" and "a beginner … hears nothing and has no way to know why" | **REFUTED (both halves)** | `normalize_port` (`json.odin:36-49`) rewrites `frequency`/`pulseWidth`/`cutoff` on every edge at `:105-107` and `:117-120`, before `validate_connections` runs (`codegen.odin:1012`). The validator never sees the legacy names; `examples/AUDIT.md:67` independently records exit 0 and a compiling `.odin` output for all four. And the editor reports the real failure by name in a red banner (`useWasmAudioEngine.ts:96-98`, `app.tsx:415-437`). The count is also wrong: 14, not 10. |
| R4 | `nodes/fmOperator.md` finding 4 (parenthetical): "Oscillator, Noise, **LFO** and Wavetable all have an amplitude param with an `input_amp` port" | **PARTLY REFUTED** | The LFO has an `amplitude` parameter but **no `input_amp` port** — `graph_validate.odin:57-58` puts it in the source-only group and `codegen.odin:368` passes an empty input port. The cited lines 26/28/31 (Oscillator, Noise, Wavetable) are correct. Drop "LFO". The finding's substance stands. |
| R5 | `50-bass-teardown.md` finding 13: exposing a mixer level is "**cosmetic**" | **SEVERITY REFUTED** | It is a blocker. See B4. |
| R6 | `00-foundations.md` finding 7: "an exposed `voiceCount` set to 48 would be accepted by the clamp but has no effect" | **CORRECTED — the truth is stronger** | No instrument-level parameter can be exposed at all. See the Corrections table. |
| R7 | `00-foundations.md` finding 10: exposed Reverb decay has "a published default of 0.1 s" | **CORRECTED** | Only the bounds and unit are borrowed from the ADSR entry; the published default is the patch's own value. See the Corrections table. |

**Nothing was UNVERIFIABLE.** Every cited file on both sides was opened.

---

## Master glossary

*Merged, deduplicated, alphabetised. Ready to paste. **Owner** is the chapter that should carry the
full explanation under the reordering above; entries marked* (NEW) *depend on a chapter that does
not exist yet, and entries marked* (unowned) *are used in the manual today and defined nowhere.*

| Term | Definition | Owner |
|---|---|---|
| **−3 dB centre** | The consequence of the constant-power pan law: at centre both channels carry 0.7071 of the signal, 3.01 dB below full. | Panner |
| **Acoustic power** | Amplitude squared. What your ears actually respond to, and the reason two half-amplitude speakers do not equal one full-amplitude speaker. | Panner |
| **Additive modulation** | Modulation that is summed onto the knob's value rather than replacing it. Skald's rule for every destination except pitch. | Foundations |
| **ADSR** | The four-stage envelope model: Attack, Decay, Sustain, Release. Sustain is a level, not a time. | ADSR |
| **Aftertouch (channel pressure)** | Continuous pressure applied to a key *after* it is already down. Not represented in Skald. | MIDI Input |
| **Aliasing** | Frequencies above the Nyquist limit folding back down into the audible range as false, out-of-tune tones that slide *downward* as you play upward. | Oscillator |
| **Allpass diffuser** | A filter that passes every frequency at equal level but delays each by a different amount, used to smear echoes into density without adding tonal colour. | Reverb |
| **Amplitude** | How far a signal swings from zero. Perceived as loudness. | Foundations |
| **Amplitude envelope** | The contour of a sound's loudness from onset to silence. One of the strongest cues your ear uses to identify an instrument. | ADSR |
| **Amplitude modulation (AM)** | A gain that is being changed continuously by another signal. Mathematically identical to a static gain; only the multiplier moves. | VCA |
| **Asset** | One exported Instrument, with its own namespaced public API. Either an SFX (one-shot) or a Music Layer (has sequenced notes). | Instrument |
| **Asymmetric clipping** | Treating the positive and negative halves of a waveform differently. The source of even harmonics, and of DC offset. | Distortion |
| **Attack** | The time an envelope takes to rise from silence to full level. | ADSR |
| **Attenuator (scalar)** | A control that multiplies a modulation signal down so it moves its destination less. In Skald, the Mapper's `outMax − outMin` span. | Mapper |
| **Attenuverter** | An attenuator that can also invert polarity, turning a rise into a fall. In Skald, a Mapper with `outMin > outMax`. | Mapper |
| **Audio rate** | One value computed per output sample — 44,100 or 48,000 times a second. Everything in Skald runs at audio rate; there is no separate control-rate tier. | Foundations |
| **Audio-rate signal** | A signal changing fast enough (roughly 20 Hz to 20 kHz) that you hear the changing itself as a tone. | Foundations |
| **Auto-pan** | Driving a Panner's position from an LFO so the sound moves across the stereo field on its own. | Panner |
| **Band-limiting (BLIT, BLEP, PolyBLEP, DPW)** | Techniques for generating sawtooth and square waveforms without aliasing, by rounding off the discontinuities. Skald does not use them. | Oscillator |
| **Bandpass** | A filter that passes a band of frequencies around the cutoff and attenuates everything above and below. The telephone/walkie-talkie sound. | Filter |
| **Band-splitting (multiband)** | Dividing a signal into frequency bands and processing each separately — for example distorting only the upper band of a bass. | Bass teardown |
| **Bar** | Sixteen sequencer steps. At 120 BPM, one step is 125 ms and a bar is 2 seconds. | Sequencer (NEW) |
| **Bass** | Roughly 60-250 Hz, where the fundamentals of most rhythm-section instruments live. | Bass teardown |
| **Beating** | The slow pulsing in loudness heard when two tones close in frequency sound together. The pulse rate equals the difference between them. | Instrument |
| **Bipolar signal** | A signal that swings both sides of zero. Skald's convention is −1.0 to +1.0. LFOs and Sample & Hold are bipolar. | Foundations |
| **Bit-crush (sample-rate reduction)** | Deliberately re-sampling a signal at a low rate for a gritty, lo-fi character. Mechanically the same operation as a very fast sample and hold. | Sample and Hold |
| **Bus** | A shared signal path that several sources feed into. A Mixer is a small bus; the Output is the master bus. | Mixer |
| **Bus domain** | In Skald, the part of the graph that runs once per sample on the summed output of all voices. Seeded by Delay, Reverb and Instrument audio inputs; everything downstream joins it automatically. | Foundations |
| **Carrier** | In FM, the oscillator whose pitch is being modulated — the one you actually hear. | FM Operator |
| **Carrier-to-modulator ratio (C:M)** | The frequency relationship between the two FM operators. Whole-number ratios give harmonic, clearly pitched tones; non-integer ratios give inharmonic, bell-like ones. | FM Operator |
| **Carson's rule** | An estimate of FM bandwidth: about `2 × modulator frequency × (index + 1)`. | FM Operator |
| **Cent** | One hundredth of a semitone; 1200 cents to an octave. A ratio, not a fixed number of hertz. | Foundations |
| **Chorus (celeste)** | The pleasant shimmer produced by beating at roughly 1-5 pulses per second. | Instrument |
| **Clamping** | Hard-limiting a value at a boundary instead of letting it continue past. Audible as a control "sticking" at an extreme. | Mapper |
| **Clipping** | What happens when a signal exceeds the maximum representable level and its peaks get sliced flat. Sounds like harsh buzzing grit welded onto the note. | Output |
| **Clock** | The regular stream of pulses that decides *when* a sample and hold takes a snapshot. | Sample and Hold |
| **Comb colouration (flutter)** | The hollow, ringing timbre a single comb filter imposes, caused by regularly spaced resonant peaks in its frequency response. | Reverb |
| **Comb filtering** | The notched frequency response produced by mixing a signal with a very short copy of itself. Heard as hollowness or phasiness rather than as an echo. | Delay |
| **Constant-power (equal-power) pan law** | A pan law where `L² + R² = 1` at every position, so perceived loudness stays constant across the sweep. Skald's law, hard-coded. | Panner |
| **Constant-voltage (linear) pan law** | The alternative law where `L + R` is constant, needing a 6 dB centre dip. Better for mono fold-down, worse over speakers. Skald does not offer it. | Panner |
| **Control rate** | A description of *intent* in Skald, not of machinery: a signal designed to move a parameter slowly rather than be heard. Skald computes it at audio rate anyway. | Foundations |
| **Control signal (control voltage, CV)** | A signal routed to a parameter rather than to a speaker. Same numbers as audio; different job. | Foundations |
| **Correlated / uncorrelated** | Identical-and-time-aligned versus unrelated. Correlated pairs sum to +6 dB; uncorrelated pairs average +3 dB. | Mixer |
| **Crossfade** | Blending smoothly between two signals with complementary gains, so that as one rises the other falls. Every Mix control in Skald is one. | Delay (unowned today) |
| **Cutoff frequency** | The frequency at which a filter's attenuation reaches 3 dB — conventionally "where the filter is set". The filter has already begun working below it. | Filter |
| **Damping (filter)** | The inverse of resonance: how strongly the resonant feedback loop is braked. Skald computes `q = 1/resonance` internally. | Filter |
| **Damping (reverb)** | Frequency-dependent decay, so high frequencies die away faster than low ones, as they do in real rooms. | Reverb |
| **DC offset** | A constant value added to a signal so its average is no longer zero. Inaudible on its own; wastes headroom and causes thumps at note boundaries. | Foundations |
| **Decay** | The time an envelope takes to fall from full level down to the sustain level. | ADSR |
| **Decibel (dB)** | A logarithmic loudness unit: `dB = 20 × log₁₀(gain)`. A gain of 2.0 is about +6 dB; 0.5 is about −6 dB. | Output |
| **dBFS (decibels full scale)** | Level measured against digital full scale, where 0 dBFS is ±1.0 and everything usable is negative. Studio practice keeps channels around −12 to −18 dBFS. | Output (unowned today) |
| **Degenerate range** | An input range of zero width, where the mapping is undefined. Skald substitutes 1.0 and outputs `outMin`. | Mapper |
| **Depth (modulation amount)** | How far a modulator moves its destination, expressed in the *destination's* units. | Mapper |
| **Detune** | A deliberate small pitch offset between copies of a sound, measured in cents. | Instrument |
| **Diffuse tail** | The later, uncountable mass of reflections-of-reflections in a reverb, decaying smoothly and carrying the room's character. | Reverb |
| **Direct sound** | The sound that reaches the listener in a straight line, before any reflection. | Reverb |
| **Directed acyclic graph (DAG)** | A graph with no loops — no wire path that leads back to where it started. What Skald requires your patch to be. | Foundations |
| **Drive** | Input gain into a nonlinearity. The "how much distortion" control. | Distortion |
| **Dub delay** | Long, heavily fed-back repeats used as an arrangement element rather than an effect. From 1970s Jamaican production. | Delay |
| **Duty cycle (pulse width)** | The fraction of each cycle a pulse wave spends in its "up" state. 0.5 gives a square. | Oscillator |
| **Early reflections** | The first few individually distinct bounces off nearby surfaces. They encode the room's size and shape and anchor a sound in space. | Reverb |
| **Echo density** | How many discrete reflections arrive per second. Below roughly a thousand per second the ear hears separate events instead of a room. | Reverb |
| **Echo threshold** | The delay time above which a repeat is heard as a distinct second event — roughly 50 ms for impulsive sounds, longer for sustained ones. | Delay |
| **Envelope** | A control signal shaped over the life of a note. Not inherently about volume; it is a shape you can point anywhere. | ADSR |
| **Envelope amount (depth)** | How far a modulation envelope moves its destination. In Skald, usually the Mapper's `outMax`. | Mapper |
| **Equal temperament** | The tuning system dividing the octave into twelve identical semitones, so music can change key freely. | Foundations |
| **Even harmonics** | The 2nd, 4th, 6th… Produced only by asymmetric distortion. Perceived as warm, thick, "valve-like". | Distortion |
| **Exposed parameter (expose)** | A parameter promoted from a baked-in constant to a runtime-settable field on the generated processor, with a clamped setter, a `_PARAMS` entry, and instant no-rebuild editing in the preview. | Foundations |
| **Exponential frequency control** | Control where a change in the value *multiplies* the frequency, so equal steps sound like equal musical intervals. Skald's oscillator pitch works this way; the value is in octaves. | Mapper |
| **Feedback** | Routing a signal back into its own input. In Skald you cannot build it with wires — only the Delay node has an internal feedback path. | Delay |
| **Feedback comb filter** | `y(n) = x(n) + g·y(n−M)`: a delay line with feedback. Equivalent to a series of exponentially decaying, evenly spaced echoes, and equivalently a filter with regularly spaced spectral peaks. | Delay |
| **Feedback delay network (FDN)** | A reverb built from several delay lines cross-coupled through a mixing matrix. Denser and less coloured than a single comb. Skald does not use one. | Reverb |
| **Feedback gain (g)** | The multiplier applied on each pass round a delay loop. Must be below 1 for stability; Skald clamps it at 0.95. | Delay |
| **Filter** | A processor that attenuates part of the frequency spectrum and passes the rest. The chisel of subtractive synthesis. | Filter |
| **Filter envelope** | A second envelope wired to the filter's cutoff, so brightness changes over the life of a note independently of loudness. | Filter |
| **Formant** | A fixed resonant peak in a spectrum, independent of pitch. What makes vowels distinguishable and bodies sound like bodies. | Filter |
| **Free-running** | A modulator whose phase is never reset by note events; it keeps cycling regardless of what you play. Skald's LFO and S&H are free-running. | LFO |
| **Frequency** | How many times per second a waveform repeats, in hertz (Hz). | Foundations |
| **Full scale (±1.0)** | The maximum sample value a digital audio system can represent. In Skald, enforced by the master soft clipper. | Output |
| **Fundamental** | The lowest frequency component of a periodic tone. It sets the pitch you hear. | Foundations |
| **Gain** | A multiplier applied to a signal. 1.0 leaves it unchanged, 0.5 halves the amplitude, 0.0 is silence, negative flips the waveform upside down. | VCA |
| **Gain staging** | Choosing sensible levels at every point in a chain rather than fixing everything at the end. | Output |
| **Gate** | A signal that stays on for as long as a note is held and off when released. It is what keeps an envelope at Sustain. In Skald you never patch it — playing a note *is* the gate. | ADSR |
| **Glide (portamento, slide)** | Continuous pitch travel from one note to the next instead of a jump. In Skald it engages only when a voice is *stolen*, so it needs `voiceCount: 1` to be reliable. | Instrument |
| **Growl** | The rough, buzzing character a filter takes on when modulated in the roughly 10-20 Hz region, just below the fusion threshold. | LFO |
| **Hard clipping** | Clipping with instantaneous corners — the waveform is truncated flat. Maximally harsh, maximally alias-prone. | Distortion |
| **Harmonic** | A frequency component at a whole-number multiple of the fundamental. The 2nd is an octave up, the 3rd an octave and a fifth. | Foundations |
| **Harmonic null** | A harmonic whose amplitude falls to zero at a given duty cycle. The nulls sit at multiples of 1/duty. | Oscillator |
| **Harmonic series** | The whole set of whole-number multiples of a fundamental. Partials that land on it fuse into one perceived pitch. | Foundations |
| **Headroom** | The margin between where your signal normally sits and the point where distortion begins. | Output |
| **Highpass** | A filter that passes frequencies above the cutoff and attenuates below. Makes sound thinner and removes weight. | Filter |
| **Inharmonic** | Partials that do not fall on a harmonic series. Heard as metallic, clangorous, pitch-ambiguous. | FM Operator |
| **Insert vs send (aux)** | An insert sits in a track's signal path and needs a wet/dry control; a send routes a *copy* to a shared 100%-wet effect that several sources feed. | Reverb |
| **Interaural level difference** | The loudness difference between your two ears caused by your head shadowing the far one. The only localisation cue an amplitude panner reproduces. | Panner |
| **Intermodulation** | Sum and difference tones created when two or more frequencies pass through the same nonlinearity together. In Skald, only with bus-domain distortion. | Distortion |
| **Interpolation (morphing)** | Blending between two adjacent waveforms rather than switching abruptly, so a position sweep sounds continuous. | Wavetable |
| **Keyboard tracking** | Raising filter cutoff with played pitch, so high notes do not sound duller than low ones. | MIDI Input |
| **Layering** | Building one perceived sound from several simpler ones, each doing a job the others cannot — usually split by frequency and by time. | Mixer |
| **Legato** | Playing a new note before releasing the previous one. On many synths this is the condition that enables glide. | Instrument |
| **Linear frequency control** | Control where a change in the value *adds* a fixed number of hertz. Skald's filter cutoff modulation works this way. | Mapper |
| **Linear interpolation (lerp)** | Moving proportionally between two endpoints: `lerp(a, b, t) = a + t(b − a)`. | Mapper |
| **Localisation** | Your brain's ability to work out where a sound came from, using arrival-time and level differences between your ears. | Panner |
| **Low mids** | Roughly 250-500 Hz. Where "mud" accumulates. | Bass teardown |
| **Lowpass** | A filter that passes frequencies below the cutoff and attenuates above. Makes sound darker, warmer, further away. | Filter |
| **Makeup (output) level** | The compensating gain *after* a nonlinearity that lets you compare distorted and clean at the same loudness. Skald's Distortion has none; use a VCA. | Distortion |
| **Masking** | When one sound makes another inaudible. Noise is an aggressive masker because it occupies every band at once. | Noise |
| **Master bus (mix bus, stereo bus)** | The single stereo pair every channel is summed into before it leaves the system. | Output |
| **Memoryless** | A process whose output for a given sample depends only on that sample's value, not on any past one. Waveshaping curves are memoryless; filters are not. | Distortion |
| **MIDI note number** | An integer naming a pitch. 60 = middle C, 69 = A4 = 440 Hz. | MIDI Input |
| **Missing fundamental** | The brain's reconstruction of a low note from its harmonics alone, on a speaker that cannot reproduce the fundamental. The reason a bass patch is nearly always two layers. | Bass teardown |
| **Modulation** | Using one signal to move another signal's parameter over time, continuously and automatically. | Foundations |
| **Modulation destination** | The parameter being moved. In Skald, only where a node draws an `input_<param>` handle for it. | Foundations |
| **Modulation index** | How hard an FM modulator bends the carrier. Controls how many sidebands there are and how loud — roughly `index + 1` significant pairs. | FM Operator |
| **Modulation source** | Any signal used to control a parameter rather than be heard directly. | Foundations |
| **Mono** | A single channel of audio, one number per sample. Skald's entire signal path except the Panner. | Mixer |
| **Mono compatibility** | Whether a sound survives having its left and right channels summed into one. The reason bass stays centred. | Panner |
| **Mono fold-down (mono summing)** | The act of adding left and right into a single channel, as club PAs, phone speakers and many broadcast paths do. | Panner |
| **Monophonic** | A polyphony of one. Each new note takes over the single voice. | Instrument |
| **Movement** | How much a sound changes over the life of a note and across bars. One of the two ingredients of a patch that sounds alive. | Complexity ladder |
| **MPE (MIDI Polyphonic Expression)** | An extension giving each sounding note its own MIDI channel, so bend, pressure and timbre can be controlled per finger. Skald has a checkbox for it and no implementation. | MIDI Input |
| **Mud** | Excess accumulated energy around 200-500 Hz that makes a mix sound blanketed and vague. A buildup problem: each layer sounds fine alone. | Mixer |
| **Multi-tap delay** | Several taps read from one delay buffer at different distances, giving an irregular rhythmic pattern. Skald's Delay is single-tap; you build this by patching. | Delay |
| **Naive (trivial) oscillator** | One that computes the ideal waveform directly, accepting the aliasing. Skald's Oscillator is one. | Oscillator |
| **Negative-frequency reflection** | FM sidebands computed below 0 Hz reappear as positive frequencies with their phase flipped 180°, adding to or cancelling what is already there. Why FM spectra look notched. | FM Operator |
| **Nonlinear (nonlinearity)** | A process whose output is not a simple scaled copy of its input, and which therefore *creates* frequencies that were not present. | Distortion |
| **Normalised value** | A value expressed as a fraction of a range, 0 meaning the bottom and 1 the top. | Mapper |
| **Normalling** | On a hardware patchbay, the default connection between a socket pair that a patch cable overrides. Skald has no equivalent — every connection is explicit. | Output |
| **Notch (band-reject)** | A filter that attenuates a narrow band around the cutoff and passes everything else. | Filter |
| **Note division** | A rate expressed as a musical fraction of a bar — 1/4, 1/8, 1/8t — rather than in hertz or seconds. | Sequencer (NEW) |
| **Note-off (release point)** | The moment the gate closes and the envelope enters its Release segment. | ADSR |
| **Note-on / note-off** | The two events that bracket a played note. A MIDI note-on with velocity 0 means note-off. | MIDI Input |
| **Note priority** | The rule for choosing which voice to steal: oldest, newest, lowest, highest, or release-phase first. Skald always steals the oldest. | Instrument |
| **Note-to-frequency conversion** | `f = 440 × 2^((n − 69)/12)` — the formula turning a MIDI note number into hertz. | MIDI Input |
| **Nyquist frequency** | Half the sample rate. The highest frequency a digital system can represent — about 22 kHz at 44.1 kHz. | Oscillator |
| **Octave** | A doubling of frequency; twelve semitones; 1200 cents. | Foundations |
| **Odd harmonics** | The 3rd, 5th, 7th… Produced by symmetric distortion and by square and triangle waves. Perceived as hollow, hard, aggressive. | Distortion |
| **Offset** | Adding a constant to a signal, moving where its movement is centred without changing how far it travels. The Mapper's `outMin`. | Mapper |
| **One-pole lowpass** | The simplest possible lowpass filter — a running weighted average, `y += k(x − y)`, giving a gentle 6 dB/octave tilt. | Filter |
| **Operator** | The FM term for one carrier-or-modulator unit. Skald's FM Operator node can play either role. | FM Operator |
| **Oscillator** | A source that produces a repeating waveform. The origin of all sound in a patch. | Oscillator |
| **Output stage** | The point where a signal chain hands off to the outside world. Nothing downstream of it exists inside the patch. | Output |
| **Oversampling** | Running a nonlinearity at a multiple of the sample rate to push aliasing products out of the way. Skald does not do this. | Distortion |
| **Pan law** | The rule deciding how the two channel gains change as you sweep the pan control. | Panner |
| **Panning** | Placing a mono signal in the stereo field by adjusting its level in each channel. | Panner |
| **Parallel** | Several branches taken from one source and recombined later. | Foundations |
| **Parallel distortion (parallel saturation)** | Blending a heavily shaped copy under the dry signal so harmonics are added without losing the transient. In Skald, the Distortion's `mix` control at 0.2-0.4. | Distortion |
| **Parallel processing** | Processing a copy of a signal and blending it back, rather than processing the signal itself. | Mixer |
| **Parameter clamp** | The min/max a runtime setter enforces, defined per parameter name in `param_ranges.odin`. | Foundations |
| **Patchbay** | A studio panel of labelled sockets bringing every device's ins and outs to one place. Skald's Instrument ports are the same idea. | Output |
| **Phantom image** | A sound that appears to come from a point between the speakers, created by feeding the same signal to both at different levels. Nothing is actually there. | Panner |
| **Phase** | How far through its cycle an oscillator currently is, 0°-360°. Inaudible alone; audible the instant you have two of something. | Oscillator |
| **Phase accumulator** | A counter that ramps 0→1 at the note frequency and wraps. The standard way a digital oscillator tracks where it is in a cycle. | Wavetable |
| **Phase cancellation** | Two copies of a signal partially or wholly nulling each other when summed. Add a layer, get *less* sound. | Mixer |
| **Phase coherence** | Copies of a signal aligned in time, which sum to a louder copy of the same shape rather than something new. Why seven undetuned unison saws sound like one saw. | Instrument |
| **Phase modulation** | Adding the modulator to the carrier's *phase* rather than its frequency. Spectrally equivalent to FM for sine modulators, and what Skald (and the DX7) actually compute. | FM Operator |
| **Pink noise** | Noise whose spectrum falls at 3 dB per octave, so each octave carries equal energy. Sounds like a waterfall; close to the average spectrum of music. | Noise |
| **Ping-pong delay** | Repeats that alternate between the left and right channels. Built by patching in Skald, not by a switch. | Delay |
| **Pitch** | The perceived highness of a tone. Perceived *proportionally*, so doublings are equal steps. | Foundations |
| **P-lock (parameter lock)** | A per-step parameter override in the sequencer. It automatically exposes the parameter it targets, because it can only work through a runtime setter. | Sequencer (NEW) |
| **Pluck** | The perceptual result of a fast filter-envelope attack and a short decay: a note that begins bright and immediately darkens. | Filter |
| **Polarity inversion** | Flipping a signal's sign. Add a signal to its inverted self and you get silence; do it partially and you get thin, hollow cancellation. | Panner |
| **Pole** | One filter stage, contributing 6 dB/octave. A "2-pole" filter is 12 dB/oct; Skald's filter is 2-pole. | Filter |
| **Polyphony** | How many voices an instrument has — how many notes it can sound at once. Skald's `voiceCount`. | Instrument |
| **Power spectral density (PSD)** | How a signal's energy is distributed across frequency. "Flat PSD" means every frequency slice holds the same amount. | Noise |
| **Precedence effect (Haas effect)** | Two arrivals of the same sound separated by less than roughly 30 ms fuse into one event, located at the first arrival. A short delay sounds like *the source got bigger*. | Delay |
| **Pre-delay** | The gap between the direct sound and the onset of reverb. Preserves clarity and implies distance. Skald's Reverb has the control and ignores it. | Reverb |
| **PRNG / xorshift** | A pseudo-random number generator; xorshift is a very cheap one built from shifts and XORs, deterministic and therefore reproducible. | Noise |
| **Probability (step)** | A per-step chance that a sequencer note fires at all, gated by the processor's PRNG at runtime. | Sequencer (NEW) |
| **Pulse wave** | A two-level waveform whose up and down halves need not be equal. A square is the 50% case. | Oscillator |
| **PWM (pulse-width modulation)** | Continuously varying a pulse's duty cycle, usually with an LFO, producing chorus-like thickening from a single oscillator. | Oscillator |
| **Range scaling** | Multiplying a modulation signal so it spans the values a particular destination actually responds to. | Mapper |
| **Rate** | How fast a modulator cycles, in hertz or as a note division. | LFO |
| **Reese bass** | A bass sound built from detuned sawtooths whose beating produces the characteristic growl. | Oscillator |
| **Relative phase** | The phase difference between two signals. 0° reinforces; 180° cancels. | Oscillator |
| **Release** | The time an envelope takes to fall from wherever it currently is back to silence, once the note is let go. | ADSR |
| **Resonance (Q, emphasis)** | Feedback that creates a boosted peak right at the cutoff frequency, making the cutoff *audible* as a whistle. | Filter |
| **Retrigger** | Restarting an envelope (or resetting a modulator's phase) for a new note. Skald's LFO does **not** retrigger. | ADSR |
| **Reverberation (reverb)** | The dense wash of reflections a space adds after the direct sound arrives. The strongest cue for "what kind of space am I in". | Reverb |
| **Ring buffer (circular buffer)** | A fixed strip of memory with a write pointer that wraps at the end. Reading `M` slots behind the writer gives you the signal from `M` samples ago. | Delay |
| **Ring modulation** | Amplitude modulation by a bipolar modulator that passes through zero and inverts the signal. Harsh, metallic, inharmonic. | VCA |
| **RMS (root mean square)** | A measure of average level, closer to perceived loudness than peak. | Output (currently in Wavetable) |
| **RT60 (T60, reverberation time)** | The time for the reverberant level to fall by 60 dB — a thousandfold drop in amplitude — after the source stops. Skald's Decay knob is an RT60 in seconds. | Reverb |
| **Sample** | One snapshot of a signal's value at one instant. | Foundations |
| **Sample and hold (S&H)** | A module that takes a snapshot of a signal on each clock tick and holds it perfectly steady until the next, producing a staircase. | Sample and Hold |
| **Sample playback (sampling synthesis)** | Playing back a long recording, as distinct from looping one cycle of a waveform. | Wavetable |
| **Sample rate** | How many samples per second the engine computes — 44,100 or 48,000 in practice. | Foundations |
| **Saturation** | Gentle distortion: the low-drive end of the same process. Adds harmonics without obviously breaking the sound. | Distortion |
| **Sawtooth** | A waveform containing *every* harmonic, the nth at 1/n amplitude. The brightest and most useful raw material for subtractive synthesis. | Oscillator |
| **Scanning** | Moving a wavetable's position over time, usually driven by an LFO or an envelope. | Wavetable |
| **Self-oscillation** | A resonant filter ringing loudly enough to produce its own sine tone with no input. Skald's filter is clamped just short of it and cannot do this. | Filter |
| **Semitone** | The smallest interval in Western tuning; one twelfth of an octave. Multiplies frequency by 2^(1/12) ≈ 1.0595. | Foundations |
| **Send** | A routing that takes a *copy* of a signal to a shared effect, leaving the original untouched. | Mixer |
| **Series** | Nodes chained one after another, each processing the previous one's output. | Foundations |
| **Sideband** | A frequency component created by modulation, sitting at `carrier ± k × modulator`. | FM Operator |
| **Signal** | A stream of numbers, one per sample, describing how far a waveform has swung from rest. | Foundations |
| **Sinc function** | `sin(πx)/(πx)`, the frequency-domain footprint of a rectangular pulse. Why held steps roll off high frequencies while also generating them at the edges. | Sample and Hold |
| **Sine** | The waveform with exactly one harmonic — the fundamental and nothing else. Pure, hollow, and impossible to brighten with a filter. | Oscillator |
| **Single-cycle waveform** | One complete period of a wave, a few milliseconds long, intended to be looped rather than played once. | Wavetable |
| **Slapback** | A single fast repeat, roughly 60-140 ms, with little or no feedback. Adds body and attitude rather than rhythm. | Delay |
| **Slew limiter** | A lowpass filter for control signals that rounds off sharp transitions, turning a staircase into a smooth wander. Standard on hardware S&H; **absent from Skald's**. | Sample and Hold |
| **Slope (roll-off)** | How fast a filter attenuates past cutoff, in decibels per octave. Skald's filter is 12 dB/oct. | Filter |
| **Soft clipping (soft limiting, saturation)** | Bending peaks smoothly toward the ceiling instead of slicing them flat. Skald's master stage uses `tanh`. | Output |
| **Source** | A node that generates signal from nothing: Oscillator, Noise, LFO, Wavetable, FM Operator, Sample & Hold. | Foundations |
| **Spectral centroid** | The energy-weighted average frequency of a spectrum — the standard quantitative stand-in for "brightness". | Filter (unowned today) |
| **Spectrum (spectral shape)** | The frequency-domain fingerprint of a sound. With noise, the filter's frequency response *becomes* the spectrum. | Noise |
| **Square** | A waveform containing only the odd harmonics, falling off at 1/n. Hollow and clarinet-ish. | Oscillator |
| **State-variable filter (SVF)** | A filter topology producing lowpass, highpass, bandpass and notch outputs simultaneously from the same two integrators. Skald's filter. | Filter |
| **Static gain** | A gain that is set once and does not change over time. | VCA |
| **Step** | One cell of the sequencer grid. At 16 steps per bar, a step is a sixteenth note. | Sequencer (NEW) |
| **Stepped random modulation** | The classic S&H patch: sampling noise, so the output is random in value but perfectly regular in time. | Sample and Hold |
| **Stereo field (stereo image, panorama)** | The apparent space between your two speakers in which sounds can be placed. | Panner |
| **Sub / body / air** | The conventional three-way frequency split of a layered sound: below 250 Hz, 250 Hz-5 kHz, above 5 kHz. | Mixer |
| **Sub-bass** | Roughly 20-60 Hz. Felt in the chest and the floor more than heard as pitch. | Bass teardown |
| **Sub-graph port** | A named Input or Output node inside an Instrument, representing a connection point on its outside edge. | Instrument |
| **Subtractive synthesis** | Starting with a harmonically rich source and removing harmonics with a filter. Sculpting from marble, not building from bricks. | Filter |
| **Summing** | Adding two or more signals together sample by sample. Not averaging — two signals at 0.5 sum to 1.0. | Mixer |
| **Supersaw** | A stack of around seven detuned sawtooths, popularised by the Roland JP-8000. | Instrument |
| **Sustain** | The *level* — not a time — an envelope holds for as long as the note is held. | ADSR |
| **Table position** | The index into a wavetable's stack of shapes. Skald's runs 0-3. | Wavetable |
| **Tempo sync** | Locking a rate to the project tempo so one cycle spans a musical value. In Skald it syncs the *rate*, not the *phase*. | Sequencer (NEW) |
| **Timbre** | Tone colour: what distinguishes a trumpet from a flute at the same pitch and volume. Determined by which harmonics are present and how loud each is. | Foundations |
| **Tone stack** | The lowpass filter placed *after* a clipping stage in essentially every distortion device, there to remove the harsh top end clipping creates. | Distortion |
| **Topological order** | An ordering in which every node comes after the nodes feeding it. What Skald sorts your graph into before generating code. | Foundations |
| **Transient (attack transient)** | The first few tens of milliseconds of a note — the pick, the breath, the hammer. The main cue your ear uses to identify what made the sound. | ADSR |
| **Tremolo** | Periodic variation in loudness, slow enough (roughly 1-8 Hz) to hear as rhythmic pulsing rather than as tone colour. | VCA |
| **Triangle** | A waveform with the same odd harmonics as a square, but dying away as 1/n² instead of 1/n. A slightly gritty sine. | Oscillator |
| **Trigger** | A momentary "go!" pulse that starts an envelope, carrying no information about how long the note lasts. | ADSR |
| **Triplet** | A division two-thirds the length of the straight one; three fit in the space of two. Written with a trailing `t`. | Sequencer (NEW) |
| **Unipolar signal** | A signal that only goes one way. Skald's convention is 0.0 to 1.0. Envelopes are unipolar. | Foundations |
| **Unison** | Running several slightly detuned copies of each oscillator inside one voice, to thicken the tone. | Instrument |
| **Unity gain** | A gain of exactly 1.0: the signal passes through numerically unchanged. | VCA |
| **V/Oct (volt per octave)** | The convention where each unit of a pitch-control signal means one octave, implemented as `2^x`. Skald's pitch inputs work this way. | Foundations |
| **VCA (voltage-controlled amplifier)** | An amplifier whose gain is set by an incoming control signal rather than a knob. The last stage of the canonical voice; what turns a drone into a note. | VCA |
| **Velocity** | How hard a note was struck. MIDI 1-127, normalised to 0.0-1.0 in Skald. | MIDI Input |
| **Velocity sensitivity** | How strongly velocity scales an envelope. Skald blends linearly: `(1 − vs) + vs × velocity`. | ADSR |
| **Vibrato** | Periodic modulation of *pitch*. Musical depths are small — roughly 20-35 cents at 5-6 Hz. | LFO |
| **Voice** | One note's worth of independent state: phase, envelope stage, filter memory. One complete copy of the instrument's signal chain. | Instrument |
| **Voice allocation** | The logic deciding which voice plays an incoming note. | Instrument |
| **Voice-coupled node** | A node that reads per-voice state (pitch, envelope stage, velocity) and therefore cannot run after the voices are summed. | Foundations |
| **Voice domain** | The part of the graph computed once per active voice per sample. | Foundations |
| **Voice stealing** | Cutting off a currently sounding voice so a new note can use it, because all voices are busy. Skald always steals the oldest. | Instrument |
| **Wah (filter modulation)** | Periodic modulation of a filter's cutoff frequency, around 1-2 Hz. | LFO |
| **Waveform** | The repeating shape of one cycle — equivalently, a specific harmonic recipe. | Foundations |
| **Waveshaping (waveshaper)** | Applying a fixed input→output transfer curve to each sample independently, with no memory of previous samples. The mechanism behind distortion. | Distortion |
| **Wavetable** | A stack of single-cycle waveforms an oscillator can read from, plus an index into that stack. | Wavetable |
| **Wet / dry** | The processed signal versus the untouched original. A Mix control crossfades between them. | Delay |
| **White noise** | A random signal whose samples are uncorrelated, giving a flat power spectral density — equal energy in every hertz. Sounds bright and hissy. | Noise |
| **Wobble bass** | A resonant lowpass cutoff driven by a tempo-synced LFO, usually at 1/4, 1/8 or 1/16. | LFO |
| **Zero-order hold** | The mathematical name for "keep the last value until a new one arrives". Shapes the spectrum by a sinc curve and injects high-frequency energy at every step edge. | Sample and Hold |

---

## Voice and tone notes

The manual's target voice is set by its own charter (`00-foundations.md:21`): *"Every audio term is
defined the first time it appears, in plain language, and then made audible by something you do."*
Six chapters drift off it. In every case the drift is the same: reference material — port names,
validator errors, refactor history — appearing in a teaching section instead of an appendix or the
Code-vs-intent notes.

**`nodes/mixer.md` — the worst offender. Needs a full rewrite pass.**
443 lines, more than twice the median node chapter (218). The excess is almost entirely port
documentation. `## What it looks like in Skald` opens with a spec ("the exporter is strict about
those port names… anything else aborts the export with an explicit error…
`graph_validate.odin:115-128`"), and the `### Inputs` control section is a changelog note
("Changing **Inputs** rewrites the channel list, preserving the levels of channels that survive and
giving new ones 0.75, `MixerNode.tsx:35-41`"). Nothing in either passage is something the reader can
*hear*. Both belong in an appendix. The chapter's genuinely excellent teaching — the +6 dB / +3 dB
arithmetic and the bucket analogy at `:197` — is buried behind them and should lead.

**`nodes/output.md` — a parameter table for a node with no parameters.**
`## The controls` opens with `| *(none)* | — | — | — | The Output node has no parameters at all. |`
followed by four consecutive sentences of source citations *proving that absence*
(`node-definitions.ts:158-160`, `types.ts:141-143`, `projectSerializer.ts:53-55`,
`param_ranges.odin:22-115`). A beginner has just been served an empty table and a proof. The
chapter's best writing — "the Output node is a **funnel with a soft rubber rim**" (`:266`) — is 100
lines earlier and should be what the controls section leads with, followed immediately by the
genuinely useful three-controls table (VCA gain / Instrument volume / master volume).

**`nodes/midiInput.md` — reference prose where teaching should be.**
`## The controls` opens with a table of the node's two parameters, *both of which do nothing*, then
four sentences of file:line with no audible consequence whatsoever (including the one wrong citation
in the manual, `param_ranges.odin:153-157`, in a 119-line file). The chapter then writes "**The real
'controls' of this node are its three output ports**" — which is correct, and should have been the
first line of the section.

**`nodes/instrument.md` — a refactor postmortem inside a lesson.**
`### What "Create Instrument" actually does` reads like a commit message: *"Those ports are keyed by
(internal node, handle) rather than by handle name, because keying by name alone used to merge two
unrelated wires that both happened to be called `input` into one port and silently cross-wire the
patch."* Accurate, well-sourced, and of no use to someone learning audio engineering. Same for the
four-row `### Handles` table enumerating fallback handle behaviour. Both move to Code-vs-intent.

**`00-foundations.md` — an appendix parked mid-chapter.**
`### Which outputs are audio, and which are control` (`:143-165`) is a 15-row port matrix with a
"Modulation inputs it accepts" column citing ten source files, sitting between two teaching
sections. It forces a reader who has not yet made a sound to meet all 17 node types and their handle
names. The three *behavioural* questions immediately above it — "How fast does it change? What range
does it live in? Where is it plugged in?" — are the teaching. **Move the matrix to Appendix A1.**

**`nodes/delay.md` — a three-column compatibility matrix in the controls table.**
Seven columns, three of them ranges (`Range (node card)` / `Range (panel slider)` /
`Range enforced on export`). That is a QA artefact. Keep one authoritative range; push the
disagreement to Appendix A2, which the chapter already anticipates well at `:209`.

**Seven chapters open `## The controls` with a bare table.**
`oscillator.md`, `noise.md`, `wavetable.md`, `fmOperator.md`, `lfo.md`, `sampleHold.md` and
`panner.md` all jump from the heading straight into markdown with no bridging sentence. Contrast the
chapters that get it right — `mapper.md`: *"Four numbers. Two describe the signal coming in, two
describe the signal going out."*; `distortion.md`: *"Four controls. Three are numbers you can
automate; one is a mode switch baked in at build time."*; `gain.md`: *"There is one parameter."*
One sentence of framing costs nothing and moves the register from datasheet to lesson. **Adopt the
`mapper`/`distortion` pattern in all seven.**

### The style reference

Five chapters never lose the voice. Point rewrites at these:

- `gain.md:92` — "the gain number is a **multiplier**, not a percentage and not decibels… And a
  *negative* multiplier is not 'less than silence' — it flips the waveform upside down."
- `reverb.md:298` — "Skald's Reverb node implements the *first half* of that idea and stops there:
  one feedback comb, no diffusers. That is a real limitation, and it is also the best possible
  teaching tool, because it lets you hear each ingredient of a reverb by its absence."
- `adsr.md:28` — "The 'Gate' label is a bit of a trap, and it is worth being blunt about it: this
  input is **not** a gate."
- `distortion.md:41` — the photocopier-contrast analogy.
- `60-complexity-ladder.md:93` — "a static patch is a **photograph of a sound**… Adding modulation
  is what turns it into **film**."

### Two findings to promote out of the notes and into chapter bodies

Both are audible enough that leaving them in an appendix is a disservice:

1. **Wavetable position/level coupling** (`wavetable.md`) — 10.8 dB of unlabelled gain change on the
   one control the chapter asks the reader to sweep and listen to. The timbre lesson is impossible
   to isolate without saying so.
2. **Additive modulation** (Foundations, and every chapter with a modulation input) — it defeats
   ADSR→VCA, the single most standard patch in synthesis, and every shipped example silently works
   around it by setting gain to 0. `fm-growl-bass`'s Mapper, whose own label reads "Mod Depth
   0.3-1.0" for a range that is actually 1.3-2.0, is the best worked example in the manual and
   should sit in the modulation section, not the bass appendix.
