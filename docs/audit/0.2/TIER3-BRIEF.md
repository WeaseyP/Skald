# Tier 3 brief — whole-system teardown (Skald 0.1 → 0.2)

You are auditing **Skald**: an Electron + React + TypeScript visual audio node-graph editor with
an Odin backend that generates DSP source code from the graph. The goal is a complete, honest
picture of what stands between 0.1 and a 0.2 worth releasing.

**Repo root:** `C:\Users\ryanp\Documents\dev\Skald-main\Skald`

**READ-ONLY.** Do not edit, create, move or delete anything in the repo. The only file you write
is your findings file, at the exact scratchpad path you were given.

**Ignore `skald-health-review\`** — a stale snapshot of a much older codebase.

---

## The mandate, in the project owner's words

> "The Opus agents should be reviewing everything more as a whole of the sections, validating what
> the Sonnet agents said, looking at how the nodes interact, and then also thinking about
> improvements, just a full teardown, **be ruthless I am not going to be upset**."

Take that literally. You are not here to be encouraging, to praise what works, or to soften a
conclusion because someone put effort into the thing you are criticising. If a subsystem is the
wrong shape, say it is the wrong shape and say what the right shape is. If the honest answer is
"this needs rewriting before 0.2", write that.

Ruthless does **not** mean speculative. Every claim you make must be grounded in code you have
read and cited. Contempt without evidence is worthless; evidence without a verdict is a wasted
opportunity. Give both.

## What has already happened

**Tier 1 — ten Sonnet agents, 93 findings.** Every node chapter of the manual cross-read against
the code: parameter parity, ranges and clamps, exposure, UI editability, conditional visibility,
modulation ports, and per-node design.
→ `..\review\tier1\` (10 files)

**Tier 2 — eleven Sonnet agents.** Systems that span nodes: sequencer, tempo/sync, voices,
codegen, generated API, serialization, UI state, audio engine, prior-findings triage, systemic
design, tests/CI.
→ `..\review\tier2\` (11 files)

**Read every file in both directories before you start.** That is roughly 100+ findings and it is
your input, not your output. Do not re-derive what is already established; build on it.

### What Tier 1 and 2 established (verify, do not assume)

Six cross-cutting patterns emerged. Treat these as claims to test, not facts:

1. **Mode-boolean → dead exposed parameter.** Codegen resolves sync-vs-free branches from raw JSON
   at *build* time, so an exposed parameter survives into the generated API but is never read.
   Found on LFO, S&H and Delay.
2. **Boolean-mode-plus-shadow-parameter anti-pattern.** The design-level form of (1) — Oscillator
   Fixed Pitch, Delay time, LFO/S&H rate. Found independently by four agents.
3. **The manual is stale pessimistically** — it warns users off features that have since been
   fixed (Reverb pre-delay, Mixer channel-level exposure, Piano Roll bass floor, resonance ceiling).
4. **Citation drift** — a ~55–90 line insertion into `codegen.odin` broke many backend `file:line`
   citations. All UI-side citations verified accurate.
5. **Gain staging is inconsistent** — a centred Panner is quieter than no Panner; master volume of
   exactly 0 exports as full volume; FM Operator has no output level; no runtime volume setters.
6. **The editor accepts what codegen rejects** — nested Instruments build, save and reload, then
   hard-crash at Generate Code.

Counts were: 37 design, 35 doc-bug, 8 code-bug, 5 qol, 4 missing-feature, 3 inconsistency,
1 missing-param. 16 high-severity.

## The manual

`docs\manual-source\` — 21 densely cited chapters, the best statement of intended behaviour that
exists. A compiled searchable build is at `docs\manual\skald-manual.html`.

**The manual is not a constraint on design.** It documents today's code and will be rewritten to
match whatever 0.2 becomes. Never soften a recommendation because a chapter describes the old
behaviour. But when you propose a change, say which chapters and which named sections it
invalidates — chapters cite `file:line`, so be precise about passages.

---

## Standards for your findings

**Validate before you build on it.** Tier 1 and 2 were Sonnet agents working in isolation with
partial context. Some of their findings are wrong, some are duplicates wearing different names,
some are stated with more confidence than the evidence supports. Where a prior finding is load-
bearing for a conclusion of yours, re-check it against the code yourself and say you did. If you
find a prior finding is wrong, **say so explicitly with its ID** — that is one of the most useful
things you can produce.

**Interactions over inventories.** Tier 1 looked at nodes one at a time. Almost every interesting
remaining defect lives *between* things: gain accumulating down a chain, modulation that composes
badly, state that outlives the voice that made it, an editor invariant the generator does not
share. Trace signal and state across whole paths.

**Judgement, not survey.** "There are three options" is not a finding. "Do X, because Y, at a cost
of Z" is. Where you are genuinely uncertain, give your best recommendation and label the
uncertainty rather than declining to choose.

**Sizing.** For anything you propose, give a rough effort band — `S` (hours), `M` (a day or two),
`L` (a week+), `XL` (architectural, multi-week) — and say whether it is a 0.2 blocker, 0.2
desirable, or later. The owner needs to scope a release, not just read a critique.

## Output

Write markdown to **exactly** the path you were given.

Start with `## Verdict` — 5–10 blunt sentences on the state of your area and whether it is fit to
ship at 0.2. Then `## Corrections to prior tiers` (prior finding IDs you are overturning,
downgrading or merging, with reasons — empty section if none). Then `## Findings`:

```
### F-<AGENT>-<n>: <one-line title>
- **kind**: code-bug | design | architecture | missing-feature | qol | risk | doc-bug | correction
- **area**: <subsystem>
- **severity**: critical | high | medium | low
- **confidence**: high | medium | low
- **effort**: S | M | L | XL
- **when**: 0.2-blocker | 0.2-desirable | later
- **supersedes**: <prior finding IDs, if any>
- **evidence**: <file:line citations you personally verified>
- **detail**: <what is wrong, what a user or integrator experiences, why it matters>
- **recommendation**: <what to do — concrete and decided>
- **manual impact**: <chapters and named sections invalidated, or "none">
- **migration**: <does this break saved patches under examples\, and can it auto-upgrade>
```

`critical` is reserved for: silent wrong audio, data loss, a crash on a normal workflow, or
anything that would ship broken into a customer's game.

Then, as your **final message** (a return value consumed by another program, not a note to a
person), return a compact digest: the path you wrote, your one-paragraph verdict, counts by
severity, the count of prior findings you overturned, and your three most important titles.
Do not paste the file.
