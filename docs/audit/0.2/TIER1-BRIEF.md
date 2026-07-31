# Tier 1 brief — node-level manual-vs-code audit (Skald 0.1 → 0.2)

You are auditing **Skald**, a visual audio node-graph editor: Electron + React + TypeScript
UI, with an Odin backend that generates DSP source code from the graph.

**Repo root:** `C:\Users\ryanp\Documents\dev\Skald-main\Skald`

**READ-ONLY.** Do not edit, create, move or delete anything in the repo. The only file you
write is your findings file, in the scratchpad, at the exact path you were given.

**Ignore `C:\Users\ryanp\Documents\dev\Skald-main\skald-health-review` entirely.** It is a
stale snapshot of an older, much smaller version of the codebase. Findings against it are
worthless.

---

## The job

Your scope is a small set of manual chapters and the nodes they document. For each, you
cross-read the chapter against the code and report every place they disagree, plus every
gap you notice while you're in there.

The manual is **dense and heavily cited** — chapters quote exact ranges, defaults and clamps,
and cite `file:line` for each. That makes it testable. Treat it as a **hypothesis to test**,
not as truth and not as fiction.

## Code to cross-read

| File | What it holds |
| --- | --- |
| `skald-backend\core\codegen.odin` | the DSP each node emits (~31k lines total backend) |
| `skald-backend\core\param_ranges.odin` | min/max/default per parameter |
| `skald-backend\core\param_utils.odin` | exposure, struct fields, typed + string-keyed setters, modulation summing |
| `skald-backend\core\graph_validate.odin` | legal destination port names per node type |
| `skald-backend\core\types.odin` | backend node/param types |
| `skald-ui\src\definitions\node-definitions.ts` | UI defaults, palette entries, `exposedParameters` |
| `skald-ui\src\definitions\types.ts` | TypeScript parameter contracts |
| `skald-ui\src\components\Nodes\<X>Node.tsx` | node-body fields (via `makeParamNode`) |
| `skald-ui\src\components\Nodes\ParamNode.tsx` | the `makeParamNode` factory, `showIf` semantics |
| `skald-ui\src\components\NodeParameterControls.tsx` | the right-hand sidebar controls |
| `skald-ui\src\components\controls\` | slider / number-input / select widgets |

Search widely — those are starting points, not a closed list.

## The seven checks, for every node in your scope

1. **Parameter inventory parity.** Does every parameter exist everywhere it should —
   `types.ts`, the defaults in `node-definitions.ts`, `param_ranges.odin`, and the DSP in
   `codegen.odin`? Anything present in one layer and missing from another?

2. **Range / default / step / clamp parity.** Do the UI slider bounds match
   `param_ranges.odin`? Can the UI produce a value the backend will silently clamp? That
   divergence means what you see is not what you hear — always a finding.

3. **Exposure.** Is `exposedParameters` right? Does an exposed parameter actually get a
   struct field, a typed setter with the clamp compiled in, and a string-keyed setter? Is
   anything exposed that has no UI control, or adjustable in the UI but never exposed?

4. **UI editability.** Is every parameter reachable and actually adjustable? Compare the
   **node-body field list** against the **sidebar control list** — do they agree? Is anything
   editable-but-inert (the control moves, nothing changes in the audio or the generated code)?

5. **Conditional visibility.** Where a parameter only makes sense in one mode, is it gated in
   **both** the node body (`showIf`) and the sidebar? Is the matching modulation input port
   gated the same way?

6. **Modulation ports.** Does every `input_<param>` port offered in the UI appear in
   `graph_validate.odin`'s legal-destination list, and does `codegen.odin` actually apply it?
   Check the maths: pitch-like destinations are **exponential** (octaves, `math.pow(2, mod)`),
   most others are **linear addition**. Does the chapter describe the one the code does?

7. **Manual accuracy.** Every `file:line` citation in your chapters — does the cited line
   still say what the chapter claims? Every stated number — range, default, clamp, cent/octave
   conversion — does it match the code? Line numbers drift; a citation off by a few lines that
   still points at the right code is *not* a finding, a citation pointing at unrelated code is.

## Calibration — the standard expected

The Oscillator chapter says:

> Pulse width — what you hear. Only visible when the waveform is Square
> (`OscillatorNode.tsx:18`, `NodeParameterControls.tsx:226`).

**Verified TRUE.** `OscillatorNode.tsx:18` has `showIf: (d) => d.waveform === 'Square'`;
`NodeParameterControls.tsx:226` gates on `data.waveform === 'Square' &&`. Both surfaces hide it.

**But the adjacent facts are the real findings:**

- `OscillatorNode.tsx:12` declares the `input_pulseWidth` modulation port with **no gating**,
  so the PW handle is offered on Sine / Sawtooth / Triangle, where the parameter itself is
  hidden. You can wire modulation to a control you cannot see.
- `phase` has a sidebar control (`NodeParameterControls.tsx:227`) but **no node-body field**
  (`OscillatorNode.tsx:16-19`), so the two control surfaces expose different parameter sets.

That is the depth expected: confirm the claim, then check what sits next to it. A chapter
claim that checks out is worth one line in your summary, not a finding.

## Eyes open — the seven checks are a floor, not a ceiling

The checklist is there so nothing systematic gets missed. It is **not** the boundary of what
to report. The most valuable findings are usually the ones no checklist predicted, so stay
alert for anything that simply does not make sense, especially:

- **Competing or duplicated controls.** The same concept settable in two places that do not
  talk to each other — e.g. a BPM in one panel and a BPM in another, where changing one leaves
  the other stale, or a free-run rate and a sync division that silently disagree. Which one
  actually reaches the audio? If you cannot tell in under a minute, neither can a user.
- **Inconsistency across nodes of the same class.** One node's release behaves differently
  from every other node's, one instrument runs longer than the rest for no stated reason, one
  node clamps where its siblings wrap, one uses 0–1 where its siblings use 0–100.
- **Features that do not compose.** Two things that each work alone but interact badly, or not
  at all, when used together — and nothing warns you.
- **Order-of-operations surprises.** Where the result depends on which control you touched
  first, or on node evaluation order.
- **Dead ends.** A control, port, mode or menu entry that leads nowhere, or that exists in the
  UI with no backend behind it (or the reverse).

If something looks off but you cannot prove it in the time you have, report it anyway with
`confidence: low` and say exactly what you would need to check to settle it. A later pass
verifies. Missing a real problem is far worse than logging one that turns out fine.

## When manual and code disagree

**Do not presume which is right.** Report both sides with citations, then recommend
"the code should change" or "the doc should change" and say why in one sentence. Tag it
`code-bug` or `doc-bug` accordingly. The manual has its own `Code-vs-intent notes` section
per chapter recording known divergences — check whether your finding is already logged there
and say so if it is (that's still worth reporting, tagged `already-known`).

## Also collect — be generous

A later pass filters and verifies, so err toward including things:

- **Missing parameters** a node of this class should plausibly have.
- **Missing nodes or features** the chapter's *Going further* section implies but that don't exist.
- **Quality-of-life gaps**: no tooltip, poor default, awkward range or step, no keyboard entry,
  unclear label, missing unit, no reset-to-default, bad ordering.

Speculative suggestions are welcome — tag them `confidence: low` and say what you didn't verify.

## Output

Write markdown to **exactly** the path you were given. Nothing else.

Start with `## Summary` — 3 to 6 bullets, including which chapter claims you verified as
correct — then `## Findings`, one block each:

```
### F-<AGENT>-<n>: <one-line title>
- **kind**: code-bug | doc-bug | missing-param | missing-feature | qol | inconsistency
- **node**: <node name>
- **severity**: high | medium | low
- **confidence**: high | medium | low
- **evidence**: <file:line citations — both sides if it is a discrepancy>
- **detail**: <2-4 sentences: what is wrong, and what a user would actually experience>
- **suggested fix**: <one sentence>
```

Severity means user impact: `high` = wrong audio, data loss, or a control that lies about
what it does; `medium` = confusing or inconsistent but recoverable; `low` = cosmetic or polish.

Then, as your **final message** (this is a return value consumed by another program, not a
note to a person), return a compact plain-text digest: the path you wrote, counts by kind,
and the titles of your three highest-severity findings. Do not paste the file contents.
