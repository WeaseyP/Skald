# Skald — Remediation Brief for Codex

**Version 2** — supersedes v1 in full. v1 was written before verification and contained two
wrong packets; see §2.
**Branch:** `review-fixes`
**Authoritative findings list:** `docs/manual-source/EDITORIAL-REPORT.md` §"Code-vs-intent
findings" (findings **B1–B7**, **C1–C15**, plus a cosmetic table).

---

## 1. What this is

Skald's node manual was written by 21 agents, one per node. To state a parameter's range
accurately each had to open the four layers that are supposed to agree — editor slider, type
default, export clamp, emitted DSP — and they frequently do not. That produced 154 raw
findings. A second pass of four agents then re-opened **every cited file on both sides** and
returned verdicts. Nothing was left unverifiable.

**Result: 30 confirmed defects — 7 blockers, 15 confusing, 8 cosmetic.** Seven claims were
refuted or corrected.

**Division of labour between the two documents:**

- `EDITORIAL-REPORT.md` is the **evidence**. Every finding has what the reader experiences,
  file:line on both sides, and whether the manual should document current behaviour or wait
  for a fix. Do not restate it here; go read the finding.
- **This brief is the execution plan** — sequencing, conflict avoidance, verification, git.

The manual chapters at `docs/manual-source/` are the **specification** for correct behaviour.
Each explains the audio engineering in full with external references. Read the relevant chapter
before implementing; a fix that satisfies a finding's letter but contradicts its chapter is wrong.

The verification pass also assessed the manual itself: all 12 DSP formula blocks, all 14
bass-ladder node counts and all BPM arithmetic checked out, with only 4 substantive claims wrong
out of ~200. Treat chapter statements as reliable, but not infallible.

---

## 2. Corrections to v1 — read before assigning anything

If you were given v1 of this brief, three things in it were wrong:

**v1 P3 was half wrong.** It claimed mixer channel levels "cannot be exposed from the UI,
reachable only by hand-editing JSON." **Refuted (R2).** `ParameterPanel.tsx:338-348` intercepts
`type === 'mixer'` with `isExposable = true` before `NodeParameterControls` is reached; the
`false` rows at `NodeParameterControls.tsx:278-293` are dead code. Levels are exposable in one
click. The *destructive* half stands and is blocker **B4**.

**v1 P5 cause #2 was entirely wrong.** It claimed four examples use pre-rename handles "which
the port validator rejects outright." **Refuted (R3).** `normalize_port` (`json.odin:36-49`)
rewrites `frequency`/`pulseWidth`/`cutoff` on every edge before `validate_connections` runs;
the validator never sees the legacy names, and `examples/AUDIT.md:67` records exit 0 with
compiling output for all four. v1 also said the reader "has no way to know why" — wrong, a
named red banner appears (`app.tsx:415-437`). **And the count is 14, not 10.** The real defect
is **B1**, and its cause is solely the missing Instrument wrapper.

**v1 P2 understated the problem.** It framed slider-vs-backend-clamp as a tidy-up. The verified
defect (**B3**) is worse and is the highest-impact item in the app: the node card and the
parameter panel carry *different* ranges for the same parameter, so opening the panel and
nudging a control **silently rewrites the stored value**. 14 parameters affected. See §6, W1.

Both v1 errors came from relaying a chapter's claim I had not opened the files for. That is
exactly the failure mode §7 tells your agents to guard against.

---

## 3. How to run this

You can spawn agents but not fan out widely, so this is written as **sequential waves**, one
agent per packet.

1. **One agent per packet.** Never two.
2. **Finish a wave before starting the next.** Waves are ordered by dependency, not severity —
   W1 must land before W2, because W2's examples are edited through UI surfaces W1 repairs.
3. **Never run two agents against the same file.** The conflict surfaces are
   `NodeParameterControls.tsx`, `ParameterPanel.tsx` and `codegen.odin`. Packets are grouped so
   each file has one owner per wave. **Do not split a packet to parallelise it.**
4. **Each agent reads its finding in `EDITORIAL-REPORT.md` and its manual chapter first.**
5. **Each agent reports:** files changed, verification commands run, and their **actual output**
   — not "tests pass".

---

## 4. Verification

```powershell
# UI (from skald-ui/)
npm run lint
npm run typecheck
npm test                      # vitest, 19 suites

# Backend (from skald-backend/)
.\run_acceptance.bat          # FFT behavioural suite — the real gate
.\run_golden.bat check        # byte-compares emitted Odin against checked-in snapshots
```

### The golden-file trap — brief every codegen agent on this

`run_golden.bat` snapshots the **emitted Odin source text** (28 files) to make generator changes
provably output-preserving. **Any change to `codegen.odin` therefore fails
`run_golden.bat check` by design. That failure is the harness working, not a regression.**

Correct sequence:

1. Make the change
2. `.\run_acceptance.bat` — **must pass**, this is the behavioural gate
3. `.\run_golden.bat check` — read the diff; confirm every changed line was intended and that no
   unrelated fixture moved
4. Only then `.\run_golden.bat update`, committing regenerated goldens **in the same commit as
   the codegen change**

An agent that runs `update` before reading the diff has destroyed the evidence. An agent that
reports "golden tests fail" and stops has misread the harness. Both sentences go in the agent's
instructions.

**Coverage gap worth knowing:** no fixture, golden or UI test references Distortion or Sample &
Hold (report, cosmetic table). Changes there are unpinned — add a fixture rather than trusting
a green run.

---

## 5. Git hygiene

Baseline verified: clean tree, **zero source modifications** from the documentation sweep, one
untracked dir (`docs/manual-source/`, 871 KB, all markdown, no binaries, no credentials).
`.gitignore` is comprehensive and needs no change.

- **Never `git add -A`.** Run `git status --short` and `git diff --stat` before each commit and
  state what is being staged and why.
- One commit per packet, referencing the packet ID and the finding ID (e.g. `P-W1 / B3`).
- `*.exe` is ignored, **but `skald-ui/skald_codegen.exe` is a deliberate tracked exception.**
  If a build rebuilds it that is a real diff — flag it for review, never commit it silently.
- `skald-backend/tester/generated_audio/` is **not** ignored; only the two root-level
  `generated_audio.odin` paths are. Check before staging after any harness run.
- `git diff examples/` before every commit. W2 legitimately edits example patches; test
  fiddling does not.

---

## 6. The waves

### W0 — Warm-up: contract and metadata fixes `cosmetic`

No codegen, no risk, exercises your agent loop end to end before anything important.

- **Distortion `shape` missing from the TS contract.** Read by codegen
  (`codegen.odin:573`, `:584-597`), offered in both UIs, absent from `DistortionParams`
  (`types.ts:116-120`) and the defaults (`node-definitions.ts:130-135`). Note the verification
  pass **downgraded this**: the select writes the key even though the default omits it, so the
  bass chapter's Exercise 3 step 8 works. Contract tidiness, not a live bug. Fold in **C8**
  (uncontrolled `<select>` when the key is absent) — same root cause.
- **Three palette tooltips misstate behaviour** (`Sidebar.tsx:265`, `:278`, `:280`) and
  `README.md:73` repeats the pink-noise error. Pink noise has existed since `NoiseNode.tsx:9`
  with a real Kellett filter (`codegen.odin:292-310`) and is used by five shipped patches.
  `Sidebar.tsx:278` promises tremolo where the recommended setting gives ring modulation.
- **Create Group is lit for one selected node and does nothing.** `app.tsx:379` drives both
  buttons from `canCreateInstrument={selectedNodesForGrouping.length > 0}` while
  `handleCreateGroup` returns early on `<= 1` (`useNodeComposition.ts:214-216`) and the tooltip
  says "Select 2 or more". A reader *will* hit this.

---

### W1 — Unify parameter ranges `blocker` (B3, C1)

**The highest-leverage packet in this document. Do it before anything else substantive.**

**Root cause, recorded by the verification pass:** five independent copies of every parameter's
range — the node card via `makeParamNode`, `ParameterPanel`'s hand-rolled branches,
`NodeParameterControls`, `param_ranges.odin`, and the point-of-use clamp in `codegen.odin`.
**That one duplication sits behind at least eight separate findings.**

Consequence (B3): the node card and panel disagree on 14 parameters, and
`NumberInput.commitValue` (`NumberInput.tsx:83-84`) plus `CustomSlider`'s typed-commit clamp
(`CustomSlider.tsx:172`) mean **opening the panel and nudging silently rewrites the patch.**
Worst case: load `evolving-motion-pad`, touch LFO Amount, and a 380 Hz filter sweep collapses to
1 Hz with no undo cue and no way to recover 380 from the panel.

Also fix **C1** here (advertised ranges the DSP clamps away — the top 1.4 octaves of every
cutoff, top two-thirds of Tone, top 5% of Feedback, and a resonance dead zone whose size shifts
with cutoff). Same architecture, same file surface.

**Do not fix this by editing 14 numbers.** Establish one source of truth for ranges that all UI
surfaces read, and reconcile it with `param_ranges.odin` and the codegen clamps. Where the DSP
imposes a hard limit, the UI must not advertise past it.

Also correct the false comment at `param_ranges.odin:8-9` claiming these ranges "match the
ranges sliders use in the UI's parameter panel" — verified false for gain, amplitude, tone,
delayTime, feedback, rate, voiceCount and glide.

**Full evidence table: report lines 435–463.** Every pair verified.

**Decide direction per parameter, don't just make numbers match.** Delay time is the one to
think about: editor allows 5 s, ring buffer is 96000 samples = 2 s @ 48 kHz
(`codegen.odin:12-19`), so a 3 s delay silently truncates on export. Widen the buffer or narrow
the control — silent truncation is the worst of the three options.

---

### W2 — Make the shipped examples playable `blocker` (B1, B2, B6, C9)

**B1 first.** Fourteen of fifty instrument examples (26 of 85 JSON files under `examples/`)
contain no `instrument` node. `getInstrumentNodes` filters on `type === 'instrument'`
(`projectSerializer.ts:91-92`), so a loose graph serialises to `instruments: []`, `buildModule`
throws (`useWasmAudioEngine.ts:96-98`) and the reader gets a red *Preview failed* banner. Test
Audio is dead too, gated on `isPlaying` (`:344`). The CLI is unaffected — `json.odin:309-326`
wraps Instrument-less graphs as a single mono `Asset`, which is why this never showed up in the
backend suite.

Named: `sine-sub-bass`, `lfo-filter-wobble-bass`, `complex-drone-machine`, `pwm-pad`,
`fm-bell-tone`, Cowbell, CyberCymbal, HiHat, KickDrum, SnareDrum, MellowElectricPiano,
PianoChord and two others.

**Recommended fix:** auto-wrap on load, or wrap on Play with a toast — one change instead of 14
file edits, and it protects every user-authored loose graph too.

**B2** (`lfo-filter-wobble-bass` neither plays nor wobbles) — the file is 16 lines with no
`amplitude` and no `syncRate` on its LFO, so cutoff swings 149–151 Hz and the LFO runs at 2 Hz,
not the stored 8. The manual keeps this as a *diagnostic* exercise, so **fix the file's
playability, keep its non-wobble** — the reader is meant to hear it fail and diagnose why. Read
the chapter before touching it.

**B6** — `sax3.json`, the only bundled MIDI patch, double-transposes and multiplies its release
by zero. Related to C2/C3 semantics; see W4 before choosing between patching the file and fixing
the port semantics.

**C9** — shipped examples using legacy or nonexistent parameter keys the backend honours and the
editor does not. Harmless at runtime, misleading to anyone reading the JSON.

---

### W3 — Honesty of the exported API `blocker` (B4, B5, B7)

**B4 — exposing a Mixer level pins the channel to unity and kills the fader.** Destructive in
preview *and* export. The reader follows the manual's advice, watches the channel jump to 1.0,
and concludes they broke the mixer. (Levels *are* exposable — that part of v1 was wrong.)

**B5 — Reverb Pre-Delay is fully wired and unimplemented.** Typed (`types.ts:112`), defaulted
(`node-definitions.ts:125`), sliders rendered (`NodeParameterControls.tsx:237`), advertised in
the tooltip (`Sidebar.tsx:273`), written into shipped patches — and `generate_reverb_code` reads
only `decay` and `mix` (`codegen.odin:544-545`) with no pre-delay stage anywhere (`:549-561`).
The codebase already has an opinion about this class of bug: *"a dropdown that changes nothing
is a lie"* (`NodeParameterControls.tsx:205-207`).
Implement as a short delay line ahead of the tail, and add a `preDelay` entry to
`lookup_param_range` (it has none, so an exposed pre-delay takes the wide-open fallback).
Suggested `{0.0, 0.25, 0.02, "s"}`. **If the DSP work is out of scope, hide the control — do not
leave it visible — and tell me, because the chapter must match.**

**B7 — exposure emits a setter, a PARAMS row and a working `set_param` for parameters the DSP
never reads** (8 parameter/state combinations, e.g. BPM-synced LFO / S&H / Delay rate). The UI
correctly hides these when inert; the generated API does not, and `set_param` returns `true`.
The verification pass called the export **"the least honest surface in the system."** A game
ships an asset whose documented API contains dead knobs.

---

### W4 — Modulation semantics `confusing` (C2, C3, C4, C5, C6)

Treat as one design conversation, not five patches. **Read the findings before proposing a fix.**

- **C2 — modulation is additive**, not multiplicative or substitutive, inverting the standard
  modular idiom. "Patch the envelope into the amp input" — the first thing anyone learns —
  produces a note that never stops, or a ring-modulated buzz. It is a *consistent, defensible*
  convention, but it is undocumented in the app.
- **C3 — the ADSR's input handle is labelled "Gate" but is the signal to be multiplied.**
  Anyone with modular experience patches a gate in and gets ring modulation. `sax3.json` does
  exactly this and silences its own release. **Relabelling the port may fix more than
  rewiring the examples** — decide here, then revisit B6.
- **C4** — exposed parameters initialise unclamped, so the first setter call jumps audibly. For
  S&H this is the exact workflow the chapter recommends.
- **C5** — a Panner feeding anything but Output silently loses its stereo image.
- **C6** — the LFO can never run on the bus; a voice-domain LFO feeding a bus-domain node is
  summed across voices.

If C2/C3 are resolved at the port-semantics level, several W2 example edits become unnecessary.
**That is why W2 fixes playability only and leaves patch semantics alone.**

---

### W5 — Remaining confirmed items `confusing` / `cosmetic`

Batch freely; low risk, no interdependencies. C7, C10–C15 plus the cosmetic table (report lines
896–910). Highlights: the preview is not the export below master volume 1.0 (**C7**); a patch
with no Output node builds clean and returns silence (**C11**); mixer per-channel pan is dead in
both directions (**C13**); sustain ≤ 0.0001 discards the Release stage the UI draws (**C14**);
`voiceStealing` is declared, defaulted, written by 58 files and read by nothing.

**Front matter, one line, not sixteen chapter notes:** `skald-ui/new_docs/` is uniformly stale
and predates every node — three of its files document components that no longer exist. The
manual never sends anyone there.

**Do not "fix" the eleven acknowledged design gaps** (no band-limiting, no self-oscillation, no
dotted delay divisions, no reverb wet-gain compensation, no pan-law choice, unison copies
starting at phase zero). The verification pass judged none of them bugs and most correct for a
game-audio tool. They belong in a *"What Skald deliberately does not do"* manual chapter. If you
think one is worth implementing, raise it separately.

---

## 7. Stop conditions — report, don't improvise

- **A citation doesn't hold.** Every citation in the report was verified by an agent that opened
  both files, so a mismatch most likely means the line drifted — the report has a whole section
  on that (lines 325–353). But if the code says something *substantively* different, **stop and
  report.** Do not fix around it. Two v1 packets were wrong for exactly this reason.
- **A fix needs a design decision.** W4 is flagged as design, not repair. If a packet turns out
  to be a symptom of something structural, say so rather than treating symptoms.
- **`run_acceptance.bat` fails.** Never update goldens to make a failure go away.

---

## 8. Feeding fixes back into the manual

Chapters document **current** behaviour, bugs included. When a packet lands, that section is stale.

Append to `docs/manual-source/FIXED.md`: packet ID, finding ID, what changed, which chapter
sections need rewriting. **Do not let agents rewrite chapters as a side effect of a code fix** —
the manual has an editorial pass with an established teaching order and voice, and twelve agents
editing independently will wreck it.

One exception, called out by the verification pass: **`50-bass-teardown.md`'s hands-on section is
unperformable as written** — Exercise 1, Exercise 2 rungs 0 and X, and Exercise 3 steps 1–8 all
say "press Play" on loose graphs the preview refuses. That is the one place the *manual*, not
Skald, must change first. It is manual work, not a Codex packet; leave it to the manual pass
unless W2 lands an auto-wrap fix, which resolves it outright.

---

## 9. What was NOT audited

These are the defects visible from outside while documenting parameters. Untouched:

- **DSP correctness** — filter coefficient derivation and stability at extremes, envelope
  stage-transition maths, delay-line interpolation and buffer wraparound, denormals
- **The voice allocator under stress** — stealing, overlapping releases, `voiceCount` bounds
- **BPM-sync rounding** across tempos and divisions
- **Save/load round-trip fidelity** and schema migration for older `.skald.json`
- **Whether generated Odin compiles for every node combination** — goldens cover checked-in
  fixtures only
- **Electron main/renderer IPC boundary** — `src/tests/main/ipcGuards.test.ts` exists; nobody
  reviewed its coverage
- **The WASM preview bridge** (`useWasmAudioEngine.ts`, `skaldWasm.worklet.ts`) — where a
  divergence from generated Odin means the editor lies about the sound. **C7 is already one
  confirmed instance of exactly that.** This is the most likely place for something serious to
  be hiding.

Worth a dedicated sweep once these waves land.
