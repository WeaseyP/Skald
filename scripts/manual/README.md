# Manual build

Compiles the chapters in `docs/manual-source/` into two artefacts in `docs/manual/`:

| File | What it is |
| --- | --- |
| `skald-manual.html` | Single self-contained page — sidebar contents, scroll tracking, light/dark, and a `Ctrl K` fuzzy search over every section. No network, no assets; open it straight off disk or drop it on a static host. |
| `skald-manual.pdf` | A4, ~275 pages, cover and contents, PDF bookmarks for every heading. |

## Running it

```sh
cd scripts/manual
npm install          # marked + puppeteer-core, once
npm run build        # both artefacts
npm run build:html   # skip the PDF (no Chrome needed)
```

The PDF is produced by driving an already-installed Chrome or Edge — nothing is
downloaded. The script checks the usual Windows/macOS/Linux install paths; set
`CHROME_PATH` if yours lives somewhere else.

Options: `--src <dir>`, `--out <dir>`, `--no-pdf`, `--skip-citations`.

`--skip-citations` bypasses the citation gate below for an emergency build —
document why in the commit message if you use it. It is not meant to become
routine.

## Chapter order

The order lives in the `PARTS` array at the top of `build-manual.mjs`, and
follows the reading order that `00-foundations.md` prescribes: foundations,
sources, modulation, shaping, space, routing, packaging, worked examples.
**Adding a chapter to `docs/manual-source/` does not add it to the manual** —
add it to `PARTS` too, or the build will silently leave it out.

`EDITORIAL-REPORT.md` and `FIXED.md` are editorial working notes rather than
chapters, so they are deliberately excluded.

## Search

The index is built at compile time: one record per `##` section, holding the
section title, its chapter, and the section's plain body text. Ranking is two
tiers — literal term matches first (weighted by whether the term hits a title,
a chapter name or the body, and how often), then a fuzzy subsequence match on
headings as a fallback for typos. Question words are stripped, so
"why does my filter self oscillate" searches for filter/self/oscillate.

## Citations

Chapters cite code in backticks, and there are exactly two forms.

**The convention (use this in anything new):**
`relative/path/from/repo/root.ext::identifier`, e.g.
`` `skald-backend/core/codegen_nodes.odin::generate_filter_code` `` or
`` `skald-ui/src/components/Sequencer/SequencerToolbar.tsx::SequencerToolbar` ``.
`identifier` must be a name that literally appears in that file — a proc,
function, const, component, type, or a JSON key. It survives the file moving
within reason (a basename fallback still resolves it, with a warning), but it
never silently drifts the way a line number does: if the name stops existing,
the check fails loudly instead of quietly pointing at the wrong code.

**The retired convention:** `path:NNN` or `path:NNN-MMM` — a raw line-number
citation. 828 of these drifted within one release cycle (see
`docs/manual-source/FIXED.md`), because nothing gated them. **Never write a
new one.** A legacy citation into any source file (`.odin .ts .tsx .mjs .json
.bat .ps1 .py .md` — `.md` included, so a stale `00-foundations.md:17` counts)
is a hard failure in the strict check below; convert it to `path::identifier`,
or for a citation into another manual chapter, `path::Heading text` or plain
prose instead.

Odin's own `pkg::proc` call syntax appears constantly in quoted prose and code
excerpts — `` `word::word` `` is only treated as a citation when the left side
contains a `/` or ends in one of the extensions above, so ordinary Odin syntax
in running text is left alone. Anything inside a fenced code block is never
scanned at all, since emitted-code excerpts are full of `foo::bar`.

### The gate

```sh
cd scripts/manual
npm run check:citations          # strict: every PARTS chapter + KNOWN-ISSUES.md, exits 1 on any mismatch
node check-citations.mjs --all   # also walks every .md under docs/, advisory, always exits 0
node check-citations.mjs --json <path>   # additionally writes the findings as JSON
```

`build-manual.mjs` runs the strict check right after it reconciles the chapter
registry, before `--check` would otherwise exit — a citation mismatch fails
the build the same way an unregistered chapter does. Pass `--skip-citations`
to the build for an emergency (see above).

The strict scope is read from `build-manual.mjs`'s `PARTS` array itself (by
extracting its source text, not by importing and running the whole build), so
there is one chapter registry, not two that can disagree.

Replaces `scripts/check_citations.py` (deleted in D3): that script printed
non-ASCII output straight to a cp1252 console and crashed, and always
`sys.exit(0)`, so a checker that can never fail was gating nothing.

### Re-pinning a legacy citation

`repin-citations.mjs` does not rewrite chapters — picking the right identifier
needs a human or an agent to read the surrounding sentence — but it does the
file-finding and grepping for you:

```sh
node repin-citations.mjs --file ../../docs/manual-source/nodes/filter.md
node repin-citations.mjs --out report.txt --json   # every PARTS chapter, written to disk
```

For each legacy citation it resolves the cited file — `codegen.odin` (any
prefix) searches all four post-split files
(`codegen_analysis.odin`/`codegen_nodes.odin`/`codegen_processor.odin`/`codegen_project.odin`),
`param_ranges.odin` also searches `param_ranges.generated.odin` and
`schema/nodes.json`, anything else falls back to a basename search — then, for
every other quoted fragment on the same markdown line, greps the candidate
file(s) for it and names the definition the hit falls inside (an Odin
proc/struct/const, a TS/TSX function/class/const/method, a JSON top-level key,
or a chapter heading). No fragment on the line at all falls back to the
definition enclosing the *original* cited line number, marked
"by line, unverified" — a line number is exactly what drifted, so that fallback
is a last resort, not a first choice. It reports `(no candidates)` honestly
when nothing matches rather than guessing.
