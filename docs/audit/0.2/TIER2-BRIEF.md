# Tier 2 brief — systems and design review (Skald 0.1 → 0.2)

You are auditing **Skald**, a visual audio node-graph editor: Electron + React + TypeScript
UI, with an Odin backend that generates DSP source code from the graph.

**Repo root:** `C:\Users\ryanp\Documents\dev\Skald-main\Skald`

**READ-ONLY.** Do not edit, create, move or delete anything in the repo. The only file you
write is your findings file, in the scratchpad, at the exact path you were given.

**Ignore `C:\Users\ryanp\Documents\dev\Skald-main\skald-health-review`** unless your scope
explicitly names it. It is a stale snapshot of a much older, smaller codebase.

---

## Context: what Tier 1 already did

Ten agents have already audited every node chapter of the manual against the code, checking
parameter parity, ranges and clamps, exposure, UI editability, conditional visibility and
modulation ports. Their findings are in:

`C:\Users\ryanp\AppData\Local\Temp\claude\C--Users-ryanp-Documents-dev-Skald-main\2fc1cf0b-ae38-4a6e-a931-a303fca7f67f\scratchpad\review\tier1\`

**Read the Tier 1 files relevant to your scope before you start.** Do not re-report what they
already found. Your job is the layer above: systems that span nodes, and judgement about
whether the design is right — not just whether it is consistent.

## The manual is your shared reference

`docs\manual-source\` holds 21 chapters, densely cited with `file:line` references. It is the
best description of intended behaviour that exists. Use it, but treat it as a hypothesis:
where it and the code disagree, report both sides and recommend which should change, tagged
`code-bug` or `doc-bug`. Do not presume the manual is right.

A compiled, searchable build of it exists at `docs\manual\skald-manual.html` if that is easier
to read than the source chapters.

---

## The design lens — read this even if your scope is not a design scope

Tier 1 asked "does this match?". You also ask **"is this the right thing to have built?"**

Worked example, from the Oscillator. The manual says:

> By default the oscillator ignores its own frequency value entirely and tracks the played note
> (`codegen.odin:126-132`). Tick **Fixed Pitch** and the frequency slider appears and takes over
> … The UI hides the frequency box unless Fixed Pitch is on, deliberately — "an
> editable-but-inert control is a lie" (`OscillatorNode.tsx:3-5`).

That description is **accurate**, and the reasoning is sound. But the design is narrower than
it should be:

- Fixed Pitch is a **boolean** where the near-universal synth idiom is a continuous **key-track
  amount** (0–100%), plus a separate tune/transpose in cents or semitones. The boolean is just
  the two endpoints of that dial and discards the musically useful middle — partial tracking
  for sub layers, detuned stacks, percussive sounds that track a little but not fully.
- It also *manufactures* the problem the code comment apologises for. With a keytrack amount,
  `frequency` becomes "base pitch / tune" and is meaningful at every setting, so it never needs
  hiding — and the `showIf` special-casing goes away with it.

That is the standard: identify where a design is *correct but narrow*, *correct but
special-cased*, or *correct but diverges from the idiom users arrive with*. Say what the
better design is and what it would cost. Tag these `design`.

Be generous and be concrete. "Could be better" is worthless; "should be a 0–100% keytrack
amount plus a cents offset, which also removes the need for the showIf" is a finding.

**The manual is not a constraint on design.** It documents the code as it stands today, and it
will be rewritten to match whatever 0.2 becomes. So never soften or drop a design
recommendation because a chapter currently describes the old behaviour. "The manual says X" is
a fact about the manual, not an argument against changing X.

Because of that, every `design` finding must carry two extra lines:

- **manual impact**: which chapters and which named sections would need rewriting if this
  change lands (e.g. `nodes/oscillator.md` — *The controls*, *Try it*, *Code-vs-intent notes*).
  Chapters cite `file:line` throughout, so a design change invalidates specific passages, not
  just a chapter heading. Being precise here is what makes the change schedulable.
- **migration**: whether the change breaks patches already saved on disk, and if so what a
  migration would have to do. Example: turning `fixedPitch: boolean` into `keyTrack: number`
  breaks every example JSON under `examples\` that stores the old key, and those files back the
  manual's *Try it* exercises. Say whether an automatic upgrade on load is feasible.

A design change that is right but whose cost is not written down will not get scheduled. Write
the cost down.

## Eyes open — anything incoherent

The most valuable findings are the ones no checklist predicted. Stay alert for:

- **Competing or duplicated controls.** The same concept settable in two places that do not
  talk to each other — a BPM here and a BPM there, where changing one leaves the other stale;
  a free-run rate and a sync division that silently disagree. Which one reaches the audio? If
  you cannot tell in a minute, neither can a user.
- **Inconsistency across siblings.** One node clamps where its siblings wrap; one uses 0–1
  where its siblings use 0–100; one instrument runs longer than the rest for no stated reason.
- **Features that do not compose.** Two things that each work alone but interact badly, or not
  at all, with nothing warning you.
- **Order-of-operations surprises.** Results that depend on which control you touched first, or
  on node evaluation order.
- **Dead ends.** A control, port, mode or menu entry with no backend behind it, or the reverse.

If something looks wrong but you cannot prove it in the time you have, report it anyway at
`confidence: low` and state exactly what would settle it. A later pass verifies. Missing a real
problem is much worse than logging one that turns out fine.

## Also collect

- **Missing features and missing nodes** — including ones the manual's *Going further* sections
  imply but that do not exist.
- **Quality-of-life gaps** — the small frictions that make a tool feel unfinished: no tooltips,
  poor defaults, awkward ranges, no keyboard entry, no undo for some action, no confirmation on
  a destructive one, unclear labels, missing units.
- **What is missing for a 0.2 release specifically** — this audit exists to scope 0.2.

---

## Output

Write markdown to **exactly** the path you were given. Nothing else.

Start with `## Summary` — 3 to 6 bullets — then `## Findings`, one block each:

```
### F-<AGENT>-<n>: <one-line title>
- **kind**: code-bug | doc-bug | design | missing-feature | missing-node | qol | inconsistency | perf | risk
- **area**: <subsystem or node>
- **severity**: high | medium | low
- **confidence**: high | medium | low
- **evidence**: <file:line citations — both sides if it is a discrepancy>
- **detail**: <2-4 sentences: what is wrong, and what a user would actually experience>
- **suggested fix**: <one or two sentences — concrete, not "improve this">
```

Severity is user impact: `high` = wrong audio, data loss, or a control that lies about what it
does; `medium` = confusing or inconsistent but recoverable; `low` = cosmetic or polish.

If a finding overlaps one from Tier 1, reference its ID (e.g. `extends F-A03-2`) rather than
restating it.

Then, as your **final message** (a return value consumed by another program, not a note to a
person), return a compact plain-text digest: the path you wrote, counts by kind, and the titles
of your three highest-severity findings. Do not paste the file contents.
