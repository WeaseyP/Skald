# Tier 1 audit — LFO & Sample and Hold (agent A03)

## Summary

- Verified TRUE and precisely cited: LFO and S&H both have zero modulation inputs
  end-to-end — UI (`LFONode.tsx:12`, `SampleHoldNode.tsx:9`), validator
  (`graph_validate.odin:57-58`, matches exactly), and codegen (no port lookups in
  `generate_lfo_code`/`generate_sample_hold_code`). No "port offered, param hidden"
  bug of the Oscillator-pulseWidth kind is possible on either node because there is
  no modulation port to gate in the first place.
- Verified TRUE: neither node's phase/counter is reset on `note_on`. Read the reset
  switch directly (`codegen.odin:1482-1494` in current code, cites drifted a little
  from the manual's `1420-1435`/`1411-1435` but point at the same switch) — cases
  exist for Filter, Oscillator, FmOperator, Wavetable, Distortion; none for LFO or
  SampleHold. Both free-run across retriggers exactly as documented.
- Verified TRUE, the central "two clocks" claim: `generate_lfo_code` (`codegen.odin:370-393`)
  and `generate_sample_hold_code` (`codegen.odin:396-411`) both resolve the
  free-run parameter first, then unconditionally overwrite it with the BPM-derived
  expression when `bpmSync` is true. The overwrite is silent — exposure, the typed
  setter, the string-keyed setter and the `_PARAMS` row for `frequency`/`rate` are
  all still emitted regardless of sync state. This is exactly what the LFO
  chapter's Code-vs-intent note 2 and the S&H chapter's note 3 describe, and both
  are still accurate today (see F-A03-1/2, tagged `already-known`).
- Confirmed accurate against the live example: `examples/instruments/bass/wobble-samplehold-bass.skald.json`
  stores `wob-sh.rate = 4.6666667` (exactly `1/8` at 140 BPM) and `wob-lfo.frequency = 2`,
  `wob-lfo.syncRate = "1/4"`, both exposing `frequency`/`amplitude` — matches every
  number the manual's hands-on walkthroughs and Code-vs-intent notes cite. But the
  two sibling modulators in that one file are internally inconsistent with each
  other (F-A03-5, new).
- Verified TRUE: all three range surfaces disagree for both nodes exactly as the
  manuals' own notes claim — LFO amplitude 0-10 (card) / 0-1 (panel) / 0-20000
  (backend, `param_ranges.odin:31`); LFO frequency 0.01-100 (card, matches backend
  `param_ranges.odin:30`) / 0.1-50 (panel); S&H rate 0.1-1000 (card, matches backend
  `param_ranges.odin:33`) / 0.1-50 (panel); S&H amplitude 0-10 (card) / 0-1 (panel,
  matches backend generic fallback `param_ranges.odin:88-89` since S&H has no
  node-specific amplitude override). All already-known, all still true.
- New: a UI affordance the LFO chapter's own citation implies exists — clicking a
  link icon to expose `bpmSync` — is dead code. `renderBpmSyncToggle` in
  `ParameterPanel.tsx` is defined but never called from anywhere in the file; both
  `lfo` and `sampleHold` node types fall through to the generic
  `NodeParameterControls` branch, which renders `bpmSync` as a bare checkbox with
  no expose button at all (F-A03-4).

## Findings

### F-A03-1: LFO free-run `frequency` stays exposed, setter-able, and API-advertised while silently dead under BPM sync
- **kind**: code-bug
- **node**: LFO
- **severity**: high
- **confidence**: high
- **evidence**: `skald-backend/core/codegen.odin:371-374` (resolve `frequency`, then unconditionally overwrite with the sync expression if `bpmSync`); exposure/setter/PARAMS emission for `frequency` is independent of `bpmSync` (`codegen.odin:1246-1283` resolution pass, `:1672-1685` typed setter, `:1691-1703` PARAMS table); shipped example `examples/instruments/bass/wobble-samplehold-bass.skald.json:111-113` has `bpmSync: true` and `exposedParameters: ["frequency","amplitude"]` together.
- **detail**: A game calling `<Asset>_set_frequency(p, x)` on this asset gets `true`-shaped success (no return-code signal at all — the setter is `void`) and the LFO's rate never changes, because `bpmSync` is true and the codegen already replaced the frequency expression at compile time. The UI at least hides the frequency control when sync is on; the exported public API has no equivalent gate and cannot express "this setter is currently inert."
- **suggested fix**: either don't emit the `frequency`/`amplitude`-adjacent setter+PARAMS row for the free-run parameter when `bpmSync` is baked in as true, or fold `bpmSync` itself into the exposed contract so calling `set_frequency` implicitly disables sync (see F-A03-7, design).
- **already-known**: yes — this is LFO chapter Code-vs-intent note 2, confirmed still accurate at current line numbers (chapter cites `codegen.odin:364-367`, actual is `370-374`; drift only).

### F-A03-2: S&H free-run `rate` has the identical dead-setter-under-sync bug
- **kind**: code-bug
- **node**: Sample and Hold
- **severity**: high
- **confidence**: high
- **evidence**: `skald-backend/core/codegen.odin:397-400` (same resolve-then-overwrite pattern as F-A03-1); `rate` is exposed by default (`node-definitions.ts:70`), so this is the *default* configuration the moment a user ticks BPM Sync on a fresh S&H node.
- **detail**: Same mechanism and same consequence as F-A03-1, on the sibling node. Because `rate` is exposed out of the box (unlike `frequency`, which a user must exposed deliberately though it also is by default per `node-definitions.ts:79`), essentially every S&H node a user drags in and syncs ships this trap without any extra action.
- **suggested fix**: same as F-A03-1; a single shared fix in the exposure-resolution pass (keyed on `bpmSync`) would close this for LFO, S&H, and Delay at once (Delay has the identical `delayTime`/`bpmSync`/`syncRate` shape, `NodeParameterControls.tsx:169-181`).
- **already-known**: yes — S&H chapter Code-vs-intent note 3, confirmed still accurate (chapter cites `codegen.odin:391-393`, actual overwrite is `398-400`; drift only).

### F-A03-3: S&H chapter has no equivalent of the LFO chapter's "exposing bpmSync/syncRate produces a dead float field" note
- **kind**: doc-bug
- **node**: Sample and Hold
- **severity**: medium
- **confidence**: high
- **evidence**: `param_ranges.odin:32-33` — `SampleHold`'s node-type override only covers `"rate"`; there is no case for `"bpmSync"` or `"syncRate"`, so `lookup_param_range` falls through to the generic name-keyed table, which also has no `bpmSync`/`syncRate` case, landing on the unknown-parameter fallback `{-1.0e6, 1.0e6, 0.0, ""}` (`param_ranges.odin:121-123`). `exposed_param_default` (`codegen.odin:656-673`) only reads `json.Float`/`json.Integer` values, so a stored `bpmSync` (`json.Boolean`) or `syncRate` (`json.String`) both silently resolve to the fallback default `0.0`. This is exactly the mechanism the LFO chapter documents in its Code-vs-intent note 3 — but for LFO only.
- **detail**: The bug is structurally identical on both nodes (same `lookup_param_range` shape, same `exposed_param_default` type-narrowing), yet the S&H chapter's five Code-vs-intent notes never mention it, so a reader of that chapter alone would not know exposing `syncRate` on an S&H node produces a meaningless `f32` field, setter, and `_PARAMS` row with a `{-1e6, 1e6, 0.0}` clamp advertised to game code.
- **suggested fix**: add a note to `sampleHold.md`'s Code-vs-intent section mirroring the LFO chapter's note 3, or (better) fix it once in the shared exposure-resolution code path so neither chapter needs the caveat.

### F-A03-4: The "expose bpmSync" UI affordance the LFO chapter cites is dead code — not reachable by clicking, for either node
- **kind**: doc-bug
- **node**: LFO, Sample and Hold
- **severity**: low
- **confidence**: high
- **evidence**: `skald-ui/src/components/ParameterPanel.tsx:243-272` defines `renderBpmSyncToggle` (with a `LinkIcon`/expose button at lines 262-268, exactly what the LFO chapter's note 3 cites). Grepping the whole file for a call site (`renderBpmSyncToggle(`) turns up only the definition — it is never invoked. `lfo` and `sampleHold` both fall through to the generic branch at `ParameterPanel.tsx:381-388` ("Default: Use Shared Component"), which renders `NodeParameterControls`; that component draws `bpmSync` as a bare, unwrapped checkbox with no expose button at all (`NodeParameterControls.tsx:164-167` for lfo, `:189-192` for sampleHold). `syncRate`, by contrast, *is* reachable to expose, because it goes through the shared `renderControlWrapper`/`wrapper` helper which defaults `isExposable = true` (`NodeParameterControls.tsx:159`/`185`, `ParameterPanel.tsx:281`).
- **detail**: A user cannot currently click a link icon to expose `bpmSync` on an LFO or S&H node in the running app — the code path that would do that is unreachable. The underlying backend danger described in F-A03-3/LFO-note-3 (a dead float field if `bpmSync` gets into `exposedParameters`) is therefore currently only reachable via hand-edited JSON or a P-locked sequencer step targeting `bpmSync`, not via the documented click. The manual's citation points at real code that is simply never executed, which makes the described workflow slightly misleading about how a user would actually get there.
- **suggested fix**: either wire `renderBpmSyncToggle` into the render path (so the described affordance actually exists) or delete the dead function and adjust the chapter's evidence to point at how `bpmSync` really ends up exposed (hand-edited save file / P-lock), not a clickable icon.

### F-A03-5: The one saved example that pairs an LFO and an S&H on the same clock has inconsistent free-run/sync coherence between the two siblings
- **kind**: inconsistency
- **node**: LFO, Sample and Hold
- **severity**: low
- **confidence**: high
- **evidence**: `examples/instruments/bass/wobble-samplehold-bass.skald.json` — `wob-sh` stores `rate: 4.6666667`, `syncRate: "1/8"` at session `bpm: 140` (`:82-85,169`); `1/8` at 140 BPM = `(60/140)×0.5 = 0.214286s → 4.6667 Hz` — matches to 7 significant figures. `wob-lfo` stores `frequency: 2`, `syncRate: "1/4"` at the same 140 BPM (`:109-112`); `1/4` at 140 BPM = `(60/140)×1 = 0.428571s → 2.3333 Hz` — the stored value is off by ~14%. `docs/manual-source/FIXED.md:12` documents a P12 fix that specifically re-authored stored free-run rates to match "their actual project tempo and sync division: 4.6666667 Hz for both 140 BPM `1/8` nodes" — i.e. the fix that produced `wob-sh`'s exact value did not touch `wob-lfo` in the same file.
- **detail**: The LFO chapter's own hands-on walkthrough (step 6, "Break the sync") describes the LFO's stored value as "very close to the 2.33 Hz the 1/4 division was giving you" rather than exact — the chapter is honest about the mismatch, but nothing in the code enforces or even flags this coherence, and the sibling S&H right next to it in the same instrument *is* exact. This is a small, concrete instance of the class of bug the two-clocks design invites: two authors (or one author at two different times) can leave a patch's free-run number arbitrarily stale relative to its sync division, and there is no lint, warning, or "recalculate from sync" affordance to catch it.
- **suggested fix**: either correct `wob-lfo.frequency` to `2.3333333` for internal consistency with its sibling, or — better — implement the "sync now" UI affordance recommended in F-A03-7 so this class of drift cannot occur by construction.

### F-A03-6: The node card never shows the resolved sync time/rate, only the side panel does
- **kind**: qol
- **node**: LFO, Sample and Hold
- **severity**: low
- **confidence**: high
- **evidence**: `NodeParameterControls.tsx:49-51` (`syncTimeHint`) renders the "`1/4` at 140 BPM = 0.429 s" annotation only inside the parameter-panel render path. `LFONode.tsx`'s and `SampleHoldNode.tsx`'s `fields` arrays (both built via `makeParamNode`) only support `ParamField.kind` of `'number' | 'select' | 'toggle'` (`ParamNode.tsx:31`) — there is no read-only/computed display kind, so the on-canvas card cannot show this hint at all.
- **detail**: A user who only glances at the canvas card (as opposed to opening the right-hand panel) sees a note-division dropdown with no indication of what it currently resolves to in Hz/seconds at the project's tempo. Given that the whole point of tempo sync is "know what beat this lands on," this is a real usability gap on the most compact, most-often-visible surface.
- **suggested fix**: extend `ParamField` with a lightweight read-only display kind (or a per-node custom footer) and add the sync-time hint to the LFO/S&H/Delay node cards, reusing `formatSyncTime` from `bpm.ts`.

### F-A03-7: [design] LFO's free-run rate and BPM-sync division should not be two independently-stored, independently-exposed truths
- **kind**: design
- **node**: LFO
- **severity**: medium
- **confidence**: high
- **evidence**: `types.ts:61-66` (`LfoParams extends BaseNodeParams, BpmSynchronizable` — `frequency`, `amplitude`, plus `bpmSync`/`syncRate` from the mixin, four independent fields); `codegen.odin:371-374` (silent overwrite, no reconciliation); `ParamNode.tsx:88-96` (`toggle` field kind writes only the boolean, no side effect on `frequency`); F-A03-1 and F-A03-5 above are direct symptoms.
- **detail**: Unlike Fixed Pitch (a true 0/100 endpoint of a meaningful continuous keytrack dial), `bpmSync` is a legitimate discrete mode — a rate genuinely cannot be "60% synced." The real design flaw is narrower: `frequency` is persisted and independently exposed as if it were always live, when it is only ever live in one of the two modes, and nothing keeps it current with the sync-derived value while sync is on or when the project BPM changes. The result is exactly what F-A03-1 and F-A03-5 show — a public setter that silently no-ops, and a saved value that quietly drifts out of step with its own sync division. Concretely: (1) whenever `bpmSync` is true, the *stored* `frequency` should be kept live-equal to the sync-derived Hz (recomputed on every BPM or syncRate change, not just displayed), so the instant a user unticks sync they get the number they were just hearing, not a stale typed-in one; (2) the generated public API should not expose two setters that can race — either don't emit `set_frequency` (or have it return failure) while `bpmSync` is compiled in as true, or make touching `set_frequency` from game code implicitly clear `bpmSync`, mirroring the "grab the knob, you leave sync" idiom every hardware/DAW LFO uses. Either change collapses "two clocks that can silently disagree" into "one authoritative rate with a mode flag," which is the same shape of fix the Oscillator's keytrack-amount proposal uses to make `frequency` meaningful at every setting instead of needing to hide/ignore it.
- **manual impact**: `nodes/lfo.md` — the entire "Frequency and syncRate — the same control, two clocks" section (`frequency`/`syncRate` table row, the paragraph starting "When `bpmSync` is off..."); Code-vs-intent note 2 ("An exposed `frequency` is silently dead whenever BPM sync is on") would be resolved/rewritten rather than merely noted; the "Try it" step 6 ("Break the sync") would need rewriting since unticking sync would no longer reveal a possibly-stale number; the "Under the hood" `FREQ` resolution paragraph and code excerpt (currently showing the unconditional overwrite) would change.
- **migration**: Existing saved patches store an independent `frequency` that may already disagree with `syncRate`+session BPM (F-A03-5 is a live example: `wob-lfo.frequency: 2` vs true `2.3333`). An upgrade-on-load for any node with `bpmSync: true` would need to recompute `frequency = 1/seconds_per_cycle(session.bpm, syncRate)` and overwrite the stored value before the new "always-live" semantics take over; patches with no `session.bpm` (most bare/unwrapped example graphs, e.g. `lfo-filter-wobble-bass.skald.json`) have nothing to recompute against and should be left as-authored with a load-time warning. If `set_frequency` is changed to implicitly clear `bpmSync`, any exported game code that currently calls `set_frequency` on a synced asset expecting a no-op (there may be none, since today's behavior is silently inert — nobody could have depended on it) would start actually changing the rate; that is a public-API behavior change worth flagging in a changelog even though nothing could reasonably have relied on the old no-op.

### F-A03-8: [design] Same fix applies to Sample & Hold, and should be implemented once, shared across LFO/S&H/Delay
- **kind**: design
- **node**: Sample and Hold
- **severity**: medium
- **confidence**: high
- **evidence**: `codegen.odin:397-400` (identical resolve-then-overwrite shape to the LFO); `types.ts:56-59` (`SampleHoldParams extends BaseNodeParams, BpmSynchronizable` — same four-field shape as LFO); `NodeParameterControls.tsx:169-181` shows Delay has the exact same `bpmSync`/`syncRate`/`delayTime` shape, confirming this is a systemic pattern, not an S&H peculiarity.
- **detail**: Everything in F-A03-7 applies verbatim to `rate`/`amplitude`/`bpmSync`/`syncRate` on Sample & Hold — same silent-overwrite setter (F-A03-2), same class of stale-free-run-value risk (no live example currently shows it drifting, but nothing prevents it), same fix shape (keep `rate` live-equal to the sync-derived value while synced; don't expose a setter that races the sync engine). Because the underlying `BpmSynchronizable` mixin and `bpm_sync_seconds_expr` machinery are already shared across LFO, S&H, and Delay, the recommended fix is best implemented once — e.g. a single "resolve effective free-run value for a bpm-synced field" helper called from all three generators and from the editor's parameter-change handler — rather than three parallel one-off patches that could drift from each other the same way the two example-patch modulators already have (F-A03-5).
- **manual impact**: `nodes/sampleHold.md` — the "BPM Sync" section (paragraph on `rate_str` being replaced rather than combined), Code-vs-intent note 3 ("Exposing `rate` on a BPM-synced S&H generates a setter that does nothing" — resolved rather than merely noted), and "Try it" step 4/5's framing of what changing Rate/BPM Sync actually does live.
- **migration**: No currently-shipped example patch has S&H `rate` visibly stale relative to its `syncRate` (unlike the LFO instance in F-A03-5), so a load-time recompute pass would be a no-op for existing files in practice, but should still run unconditionally for any `SampleHold` node with `bpmSync: true` for the same reason given in F-A03-7 — correctness shouldn't depend on every existing file happening to already be coherent.

---
**Digest for coordinator**: written to `C:\Users\ryanp\AppData\Local\Temp\claude\C--Users-ryanp-Documents-dev-Skald-main\2fc1cf0b-ae38-4a6e-a931-a303fca7f67f\scratchpad\review\tier1\03-lfo-samplehold.md`.
