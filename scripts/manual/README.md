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

Options: `--src <dir>`, `--out <dir>`, `--no-pdf`.

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
