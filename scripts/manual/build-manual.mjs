#!/usr/bin/env node
// Compiles docs/manual-source/*.md into a single searchable HTML manual and a print PDF.
//
//   node build-manual.mjs [--src <dir>] [--out <dir>] [--no-pdf] [--check] [--skip-citations]
//
// --check validates the chapter registry and exits without rendering anything;
// it is what CI runs.
// --skip-citations skips the D3 citation gate (check-citations.mjs) for
// emergencies — a build that must ship while citations are mid-conversion.
// Document any use of it; it exists to unblock, not to become the default.
//
// Requires: marked, puppeteer-core, and a local Chrome install (for the PDF).

import { readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync, rmSync, statSync } from 'node:fs'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { Marked } from 'marked'
import puppeteer from 'puppeteer-core'
import { run as runCitationCheck } from './check-citations.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))

// ---------------------------------------------------------------- arguments

const argv = process.argv.slice(2)
const flag = (name, fallback) => {
  const i = argv.indexOf(name)
  return i === -1 ? fallback : argv[i + 1]
}
const SRC = resolve(flag('--src', join(HERE, '..', '..', 'docs', 'manual-source')))
const OUT = resolve(flag('--out', join(HERE, '..', '..', 'docs', 'manual')))
const MAKE_PDF = !argv.includes('--no-pdf')
const CHECK_ONLY = argv.includes('--check')
const SKIP_CITATIONS = argv.includes('--skip-citations')

const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].filter(Boolean)

// ------------------------------------------------------------------ content
//
// Ordered the way 00-foundations.md tells the reader to work through it:
// sources, then modulation, then shaping, then space, then routing, then the
// container, then the two worked examples. EDITORIAL-REPORT.md and FIXED.md
// are editorial working notes, not chapters, so they are deliberately absent.

const PARTS = [
  { part: 'Foundations', files: ['00-foundations.md'] },
  { part: 'Sources', files: ['nodes/oscillator.md', 'nodes/noise.md', 'nodes/wavetable.md', 'nodes/fmOperator.md'] },
  { part: 'Modulation', files: ['nodes/lfo.md', 'nodes/sampleHold.md', 'nodes/adsr.md', 'nodes/mapper.md', 'nodes/midiInput.md'] },
  { part: 'Shaping', files: ['nodes/filter.md', 'nodes/distortion.md'] },
  { part: 'Space', files: ['nodes/delay.md', 'nodes/reverb.md'] },
  { part: 'Routing', files: ['nodes/mixer.md', 'nodes/gain.md', 'nodes/panner.md', 'nodes/output.md'] },
  { part: 'Packaging', files: ['nodes/instrument.md'] },
  { part: 'Worked examples', files: ['50-bass-teardown.md', '60-complexity-ladder.md', '70-space-funk-build.md'] },
]

// Markdown under SRC that is deliberately not a chapter. Anything else found
// there and absent from PARTS is a build failure — see reconcileRegistry.
const NOT_CHAPTERS = new Set(['EDITORIAL-REPORT.md', 'FIXED.md'])

// ---------------------------------------------------------------- registry
//
// PARTS is hand-maintained, and for most of this project's life an
// unregistered chapter was skipped in silence: 70-space-funk-build.md was
// written, left out of PARTS, and shipped absent from the compiled manual with
// no warning and a zero exit code. Two representations of one thing with
// nothing reconciling them — the same class of defect as the code findings in
// docs/0.2-ROADMAP.md §3. So the build now refuses to run on any mismatch, in
// either direction.

const sourceMarkdown = (dir) =>
  readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile() && e.name.endsWith('.md'))
    .map((e) => join(e.parentPath ?? e.path, e.name).slice(dir.length + 1).replace(/\\/g, '/'))

const reconcileRegistry = () => {
  const registered = PARTS.flatMap((p) => p.files)
  const onDisk = sourceMarkdown(SRC)

  const duplicated = registered.filter((f, i) => registered.indexOf(f) !== i)
  const missing = registered.filter((f) => !existsSync(join(SRC, f)))
  const unregistered = onDisk.filter((f) => !registered.includes(f) && !NOT_CHAPTERS.has(f))

  for (const f of duplicated) console.error(`  ! registered twice: ${f}`)
  for (const f of missing) console.error(`  ! registered but not on disk: ${f}`)
  for (const f of unregistered) {
    console.error(`  ! chapter file not registered in PARTS: ${f}`)
  }

  if (duplicated.length || missing.length || unregistered.length) {
    console.error('')
    console.error('The chapter registry and docs/manual-source/ disagree. Add the file to PARTS')
    console.error(`in the right part, or to NOT_CHAPTERS if it is an editorial note. Refusing to`)
    console.error('build a manual that silently omits a chapter.')
    process.exit(1)
  }

  console.log(`  registry ok: ${registered.length} chapters, ${NOT_CHAPTERS.size} non-chapter files`)
}

reconcileRegistry()

// D3: the manual convention is `path::identifier` citations, not `path:NNN`
// line numbers — those drifted by the hundreds within one release cycle (see
// docs/manual-source/FIXED.md). Gate the build on it the same way the
// registry is gated, right after the registry check and before CHECK_ONLY
// exits, so `--check` in CI catches both kinds of drift in one pass.
if (SKIP_CITATIONS) {
  console.log('  ! --skip-citations: citation gate skipped (emergency use only)')
} else {
  const citationExit = runCitationCheck([])
  if (citationExit !== 0) {
    console.error('')
    console.error('Citation check failed (see above). Fix the citations, or pass --skip-citations')
    console.error('for an emergency build (document why in the commit message).')
    process.exit(1)
  }
}

if (CHECK_ONLY) process.exit(0)

// -------------------------------------------------------------------- utils

const slugify = (s) =>
  s.toLowerCase()
    .replace(/[`*_~]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'section'

const escapeHtml = (s) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
   .replace(/"/g, '&quot;').replace(/'/g, '&#39;')

// Strips tags for the search index, keeping the words a reader would search.
const textOf = (html) =>
  html.replace(/<pre[\s\S]*?<\/pre>/g, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()

// ------------------------------------------------------------------- render

/** Renders one chapter, returning its HTML plus the headings found in it. */
function renderChapter(md, chapterSlug) {
  const headings = []
  const used = new Set()
  const uniqueId = (base) => {
    let id = base, n = 2
    while (used.has(id)) id = `${base}-${n++}`
    used.add(id)
    return id
  }

  const renderer = {
    heading({ tokens, depth }) {
      const text = this.parser.parseInline(tokens)
      const plain = textOf(text)
      // h1 anchors to the chapter itself so TOC links and PDF bookmarks agree.
      const id = depth === 1 ? chapterSlug : uniqueId(`${chapterSlug}--${slugify(plain)}`)
      headings.push({ depth, text: plain, id })
      const tag = `h${Math.min(depth, 6)}`
      return `<${tag} id="${id}" class="hd hd-${depth}">` +
             `<a class="anchor" href="#${id}" aria-label="Link to this section">#</a>${text}</${tag}>\n`
    },
    code({ text, lang }) {
      const cls = lang ? ` class="language-${escapeHtml(lang)}"` : ''
      const label = lang ? `<span class="code-lang">${escapeHtml(lang)}</span>` : ''
      return `<div class="codeblock">${label}<pre><code${cls}>${escapeHtml(text)}\n</code></pre></div>\n`
    },
    link({ href, title, tokens }) {
      const text = this.parser.parseInline(tokens)
      const external = /^https?:/i.test(href)
      const attrs = external ? ' target="_blank" rel="noopener noreferrer"' : ''
      const t = title ? ` title="${escapeHtml(title)}"` : ''
      return `<a href="${escapeHtml(href)}"${t}${attrs}>${text}</a>`
    },
  }

  const md2html = new Marked({ gfm: true, breaks: false })
  md2html.use({ renderer })
  // Wide tables get a scroll container rather than blowing out the column.
  const html = md2html.parse(md).replace(
    /<table>[\s\S]*?<\/table>/g,
    (t) => `<div class="tablewrap">${t}</div>`,
  )
  return { html, headings }
}

/** Splits chapter HTML into h2 sections so search can point at a real subsection. */
function sectionise(html, chapter) {
  const parts = html.split(/(?=<h2 id=")/)
  const sections = []
  for (const chunk of parts) {
    const m = chunk.match(/^<h2 id="([^"]+)"[^>]*>(?:<a[^>]*>#<\/a>)?([\s\S]*?)<\/h2>/)
    if (m) {
      sections.push({ id: m[1], title: textOf(m[2]), body: textOf(chunk.slice(m[0].length)) })
    } else if (textOf(chunk)) {
      sections.push({ id: chapter.slug, title: 'Overview', body: textOf(chunk) })
    }
  }
  return sections
}

// ------------------------------------------------------------------ compile

const chapters = []
let n = 0
for (const { part, files } of PARTS) {
  for (const file of files) {
    const path = join(SRC, file)
    if (!existsSync(path)) {
      // reconcileRegistry already refused this case; belt and braces, because a
      // skipped chapter must never be a warning.
      console.error(`  ! missing chapter: ${file}`)
      process.exit(1)
    }
    const md = readFileSync(path, 'utf8')
    const title = (md.match(/^#\s+(.+)$/m) || [, file])[1].trim()
    const slug = slugify(title)
    const num = ++n
    const { html, headings } = renderChapter(md, slug)
    const chapter = { num, part, file, title, slug, html, headings }
    chapter.sections = sectionise(html, chapter)
    chapters.push(chapter)
    console.log(`  ${String(num).padStart(2)}. ${title}  (${headings.length} headings)`)
  }
}

if (!chapters.length) {
  console.error(`No chapters found under ${SRC}`)
  process.exit(1)
}

const buildDate = new Date().toISOString().slice(0, 10)

// Flat search index: one record per h2 section.
const index = []
for (const c of chapters) {
  for (const s of c.sections) {
    index.push({ c: c.num, ct: c.title, p: c.part, t: s.title, id: s.id, b: s.b || s.body })
  }
}

// Grouped table of contents.
const toc = []
for (const c of chapters) {
  const last = toc[toc.length - 1]
  if (!last || last.part !== c.part) toc.push({ part: c.part, chapters: [] })
  toc[toc.length - 1].chapters.push({
    num: c.num, title: c.title, slug: c.slug,
    sections: c.headings.filter((h) => h.depth === 2).map((h) => ({ t: h.text, id: h.id })),
  })
}

// -------------------------------------------------------------------- styles

const BASE_CSS = `
:root{
  --bg:#fbfaf8; --bg-soft:#f2efea; --panel:#ffffff; --ink:#1c1e22; --ink-soft:#5a6069;
  --rule:#e2ddd4; --rule-soft:#eeeae3; --accent:#a2600b; --accent-soft:#fdf3e2;
  --code-bg:#f6f3ee; --code-ink:#3a3128; --mark:#ffe9a8;
  --serif:"Iowan Old Style","Charter",Georgia,"Times New Roman",serif;
  --sans:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;
  --mono:"Cascadia Mono",Consolas,"SF Mono",Menlo,monospace;
}
@media (prefers-color-scheme:dark){
  :root{
    --bg:#14161a; --bg-soft:#191c22; --panel:#1b1f26; --ink:#e4e7ec; --ink-soft:#98a1af;
    --rule:#2a2f38; --rule-soft:#22262e; --accent:#e8a33d; --accent-soft:#2a2115;
    --code-bg:#12151a; --code-ink:#cfd6e0; --mark:#6b5417;
  }
}
:root[data-theme=light]{
  --bg:#fbfaf8; --bg-soft:#f2efea; --panel:#ffffff; --ink:#1c1e22; --ink-soft:#5a6069;
  --rule:#e2ddd4; --rule-soft:#eeeae3; --accent:#a2600b; --accent-soft:#fdf3e2;
  --code-bg:#f6f3ee; --code-ink:#3a3128; --mark:#ffe9a8;
}
:root[data-theme=dark]{
  --bg:#14161a; --bg-soft:#191c22; --panel:#1b1f26; --ink:#e4e7ec; --ink-soft:#98a1af;
  --rule:#2a2f38; --rule-soft:#22262e; --accent:#e8a33d; --accent-soft:#2a2115;
  --code-bg:#12151a; --code-ink:#cfd6e0; --mark:#6b5417;
}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);font-family:var(--serif);
  font-size:17px;line-height:1.65;-webkit-font-smoothing:antialiased}

/* ---- prose ---- */
.prose h1,.prose h2,.prose h3,.prose h4,.prose h5,.prose h6{
  font-family:var(--sans);font-weight:650;line-height:1.25;letter-spacing:-.01em;position:relative}
.prose h1{font-size:2.05rem;margin:0 0 .6em;letter-spacing:-.02em}
.prose h2{font-size:1.42rem;margin:2.4em 0 .7em;padding-top:.7em;border-top:1px solid var(--rule)}
.prose h3{font-size:1.13rem;margin:1.9em 0 .5em}
.prose h4{font-size:1rem;margin:1.5em 0 .4em;color:var(--ink-soft);text-transform:uppercase;
  letter-spacing:.06em;font-size:.82rem}
.prose p{margin:0 0 1.05em}
.prose a{color:var(--accent);text-decoration:none;border-bottom:1px solid color-mix(in srgb,var(--accent) 35%,transparent)}
.prose a:hover{border-bottom-color:var(--accent)}
.prose strong{font-weight:650}
.prose ul,.prose ol{margin:0 0 1.05em;padding-left:1.4em}
.prose li{margin:.3em 0}
.prose li>p{margin:.3em 0}
.prose blockquote{margin:1.4em 0;padding:.9em 1.2em;border-left:3px solid var(--accent);
  background:var(--accent-soft);border-radius:0 6px 6px 0;color:var(--ink)}
.prose blockquote p:last-child{margin:0}
.prose hr{border:0;border-top:1px solid var(--rule);margin:2.2em 0}
.prose code{font-family:var(--mono);font-size:.855em;background:var(--code-bg);color:var(--code-ink);
  padding:.12em .38em;border-radius:4px;border:1px solid var(--rule-soft);word-break:break-word}
.codeblock{position:relative;margin:1.3em 0}
.codeblock pre{margin:0;overflow-x:auto;background:var(--code-bg);border:1px solid var(--rule);
  border-radius:8px;padding:1em 1.1em;font-size:.86rem;line-height:1.55}
.codeblock code{background:none;border:0;padding:0;font-size:inherit;color:var(--code-ink);white-space:pre}
.code-lang{position:absolute;top:.55em;right:.8em;font-family:var(--sans);font-size:.66rem;
  letter-spacing:.09em;text-transform:uppercase;color:var(--ink-soft);opacity:.75;pointer-events:none}
.tablewrap{overflow-x:auto;margin:1.4em 0;border:1px solid var(--rule);border-radius:8px}
.prose table{border-collapse:collapse;width:100%;font-family:var(--sans);font-size:.87rem}
.prose th,.prose td{text-align:left;padding:.6em .85em;border-bottom:1px solid var(--rule-soft);
  vertical-align:top}
.prose thead th{background:var(--bg-soft);font-weight:640;border-bottom:1px solid var(--rule);
  white-space:nowrap}
.prose tbody tr:last-child td{border-bottom:0}
.prose td code,.prose th code{font-size:.85em}
`

const SCREEN_CSS = `
.layout{display:grid;grid-template-columns:320px minmax(0,1fr);min-height:100vh}
/* ---- sidebar ---- */
.side{position:sticky;top:0;height:100vh;overflow:hidden;background:var(--bg-soft);
  border-right:1px solid var(--rule);display:flex;flex-direction:column}
.brand{padding:1.15rem 1.25rem .9rem;border-bottom:1px solid var(--rule)}
.brand h1{font-family:var(--sans);font-size:1.02rem;font-weight:680;margin:0;letter-spacing:-.01em}
.brand .sub{font-family:var(--sans);font-size:.72rem;color:var(--ink-soft);margin-top:.2rem;
  letter-spacing:.02em}
.searchbtn{margin:.85rem 1.25rem;padding:.55rem .7rem;display:flex;align-items:center;gap:.5rem;
  background:var(--panel);border:1px solid var(--rule);border-radius:8px;cursor:pointer;
  font-family:var(--sans);font-size:.82rem;color:var(--ink-soft);text-align:left;width:calc(100% - 2.5rem)}
.searchbtn:hover{border-color:var(--accent);color:var(--ink)}
.searchbtn kbd{margin-left:auto}
kbd{font-family:var(--sans);font-size:.68rem;background:var(--bg-soft);border:1px solid var(--rule);
  border-bottom-width:2px;border-radius:4px;padding:.1em .4em;color:var(--ink-soft)}
.toc{overflow-y:auto;padding:0 .6rem 3rem;flex:1;font-family:var(--sans);font-size:.83rem;
  scrollbar-width:thin}
.toc .part{font-size:.66rem;text-transform:uppercase;letter-spacing:.12em;color:var(--ink-soft);
  padding:1.1rem .65rem .35rem;font-weight:640}
.toc a{display:block;color:var(--ink-soft);text-decoration:none;padding:.3rem .65rem;border-radius:6px;
  line-height:1.35}
.toc a:hover{background:var(--panel);color:var(--ink)}
.toc a.chap{color:var(--ink);font-weight:560;display:flex;gap:.55rem}
.toc a.chap .n{color:var(--ink-soft);font-variant-numeric:tabular-nums;font-size:.78rem;
  min-width:1.1rem;text-align:right;flex:none}
.toc a.sec{padding-left:2.2rem;font-size:.79rem}
.toc a.active{background:var(--accent-soft);color:var(--accent);font-weight:600}
.toc .secs{display:none}
.toc .grp.open .secs{display:block}
.sidefoot{border-top:1px solid var(--rule);padding:.6rem 1.25rem;display:flex;align-items:center;
  gap:.6rem;font-family:var(--sans);font-size:.72rem;color:var(--ink-soft)}
.iconbtn{background:none;border:1px solid var(--rule);border-radius:6px;color:var(--ink-soft);
  cursor:pointer;padding:.25rem .5rem;font-family:var(--sans);font-size:.72rem}
.iconbtn:hover{border-color:var(--accent);color:var(--accent)}
/* ---- main ---- */
main{min-width:0}
.doc{max-width:47rem;margin:0 auto;padding:3.5rem 2rem 8rem}
.titlecard{padding:0 0 2rem;margin-bottom:1rem;border-bottom:1px solid var(--rule)}
.titlecard h1{font-family:var(--sans);font-size:2.6rem;font-weight:700;letter-spacing:-.025em;margin:0}
.titlecard p{color:var(--ink-soft);margin:.5rem 0 0;font-size:1.02rem}
.chapter{scroll-margin-top:1rem}
.chapter+.chapter{margin-top:5rem;padding-top:3rem;border-top:2px solid var(--rule)}
.chapmeta{font-family:var(--sans);font-size:.7rem;text-transform:uppercase;letter-spacing:.13em;
  color:var(--accent);font-weight:650;margin-bottom:.5rem}
.hd{scroll-margin-top:1.2rem}
.anchor{position:absolute;left:-1.1em;color:var(--rule);text-decoration:none;border:0;opacity:0;
  font-weight:400;transition:opacity .12s}
.hd:hover .anchor{opacity:1}
.anchor:hover{color:var(--accent)}
:target{animation:flash 1.6s ease-out}
@keyframes flash{0%,35%{background:var(--mark)}100%{background:transparent}}
/* ---- search overlay ---- */
.scrim{position:fixed;inset:0;background:rgba(0,0,0,.45);backdrop-filter:blur(2px);z-index:40;
  display:none}
.scrim.on{display:block}
.palette{position:fixed;z-index:50;top:9vh;left:50%;transform:translateX(-50%);width:min(660px,92vw);
  background:var(--panel);border:1px solid var(--rule);border-radius:12px;
  box-shadow:0 24px 70px rgba(0,0,0,.32);display:none;overflow:hidden}
.palette.on{display:block}
.palette input{width:100%;border:0;border-bottom:1px solid var(--rule);background:none;color:var(--ink);
  font-family:var(--sans);font-size:1.02rem;padding:1rem 1.15rem;outline:none}
.palette input::placeholder{color:var(--ink-soft)}
.results{max-height:58vh;overflow-y:auto;padding:.4rem}
.result{display:block;padding:.6rem .75rem;border-radius:8px;text-decoration:none;color:inherit;
  cursor:pointer;border:0;background:none;width:100%;text-align:left;font:inherit}
.result:hover,.result.sel{background:var(--bg-soft)}
.result.sel{box-shadow:inset 2px 0 0 var(--accent)}
.result .crumb{font-family:var(--sans);font-size:.68rem;text-transform:uppercase;letter-spacing:.09em;
  color:var(--ink-soft);margin-bottom:.12rem}
.result .rt{font-family:var(--sans);font-size:.92rem;font-weight:600;line-height:1.3}
.result .snip{font-family:var(--sans);font-size:.79rem;color:var(--ink-soft);line-height:1.45;
  margin-top:.18rem;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.result mark,.snip mark{background:var(--mark);color:inherit;border-radius:2px;padding:0 .1em}
.pfoot{display:flex;gap:1rem;padding:.5rem .9rem;border-top:1px solid var(--rule);
  font-family:var(--sans);font-size:.7rem;color:var(--ink-soft)}
.empty{padding:2rem 1rem;text-align:center;color:var(--ink-soft);font-family:var(--sans);font-size:.86rem}
.topbar{display:none}
@media (max-width:900px){
  .layout{grid-template-columns:1fr}
  .side{position:fixed;inset:0 auto 0 0;width:300px;z-index:60;transform:translateX(-100%);
    transition:transform .18s ease}
  .side.on{transform:none}
  .topbar{display:flex;position:sticky;top:0;z-index:30;gap:.7rem;align-items:center;
    padding:.6rem .9rem;background:var(--bg);border-bottom:1px solid var(--rule)}
  .topbar .t{font-family:var(--sans);font-weight:650;font-size:.9rem}
  .doc{padding:2rem 1.15rem 6rem}
  .titlecard h1{font-size:1.9rem}
  body{font-size:16px}
}
@media print{.side,.topbar,.palette,.scrim{display:none!important}.layout{display:block}}
`

// -------------------------------------------------------------- search code

const SEARCH_JS = String.raw`
// Fuzzy subsequence scorer, fzf-flavoured: rewards consecutive runs and
// matches that land on a word boundary, penalises long gaps.
function fuzzy(needle, hay){
  const n = needle.length, h = hay.length;
  if(!n) return 0;
  if(n > h) return -1;
  const H = hay.toLowerCase();
  let score = 0, hi = 0, run = 0, first = -1;
  for(let i=0;i<n;i++){
    const c = needle[i];
    let at = H.indexOf(c, hi);
    if(at === -1) return -1;
    if(first === -1) first = at;
    const prev = at > 0 ? hay[at-1] : ' ';
    const boundary = /[^A-Za-z0-9]/.test(prev) || (/[a-z]/.test(prev) && /[A-Z]/.test(hay[at]));
    if(at === hi && i > 0){ run++; score += 8 + run*3; }
    else { run = 0; score += boundary ? 9 : 2; score -= Math.min(at - hi, 12) * 0.4; }
    hi = at + 1;
  }
  score -= first * 0.25;          // earlier matches read as better
  score += (n / h) * 12;          // prefer tight targets over sprawling ones
  return score;
}

// Picks the window of body text with the most query terms in it, so the
// snippet shows the passage that actually answers the query.
function snippet(body, terms){
  const low = body.toLowerCase();
  const spots = [];
  for(const t of terms){
    let i = low.indexOf(t);
    while(i !== -1 && spots.length < 400){ spots.push(i); i = low.indexOf(t, i + t.length); }
  }
  if(!spots.length) return body.slice(0, 190);
  spots.sort((a,b) => a - b);
  const W = 200;
  let best = spots[0], bestN = 0;
  for(const s of spots){
    const n = spots.filter(o => o >= s && o < s + W).length;
    if(n > bestN){ bestN = n; best = s; }
  }
  const start = Math.max(0, best - 55);
  return (start ? '…' : '') + body.slice(start, start + W + 55) + (start + W + 55 < body.length ? '…' : '');
}

function highlight(text, terms){
  let out = text.replace(/[&<>]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));
  for(const t of terms.filter(t => t.length > 1).sort((a,b)=>b.length-a.length)){
    const re = new RegExp('(' + t.replace(/[^\w\s]/g, c => '\\' + c) + ')', 'ig');
    out = out.replace(re, '<mark>$1</mark>');
  }
  return out;
}

function countOf(hay, needle){
  let n = 0, i = hay.indexOf(needle);
  while(i !== -1){ n++; i = hay.indexOf(needle, i + needle.length); }
  return n;
}

// Question words and filler. Dropped so "why does my filter self-oscillate"
// searches for filter/self/oscillate instead of failing on "does" and "my".
const STOP = new Set(('a an and are as at be but by can do does for from get has have how i if in into is ' +
  'it its me my not of on or should so than that the their them then there these they this to use used ' +
  'using was what when where which who why will with would you your').split(' '));

// Two tiers. Literal matches — terms found in the chapter title, the section
// title or the body — come first, ranked by where and how often the terms
// appear. Fuzzy heading matches are the fallback for typos and half-remembered
// names, and only fill in when literal hits are thin.
function search(q){
  const raw = q.trim().toLowerCase();
  if(!raw) return [];
  const all = [...new Set(raw.split(/[\s,.?!]+/).filter(Boolean))];
  const kept = all.filter(t => !STOP.has(t));
  const terms = kept.length ? kept : all;
  const compact = terms.join('');
  // With several terms, accept sections that cover most of them — a section
  // rarely contains every word of a sentence-shaped question.
  const need = terms.length <= 2 ? terms.length : Math.ceil(terms.length * 0.6);
  const literal = [], loose = [];

  for(const rec of INDEX){
    const title = rec.t.toLowerCase();
    const chap = rec.ct.toLowerCase();
    const body = rec.b.toLowerCase();
    let score = 0, matched = 0;

    for(const t of terms){
      const inTitle = title.includes(t);
      const inChap = chap.includes(t);
      const n = countOf(body, t);
      if(!inTitle && !inChap && !n) continue;
      matched++;
      let w = 0;
      if(inTitle) w += 34;
      if(inChap) w += 26;
      if(n) w += 12 + Math.min(n, 6) * 5;
      score += t.length <= 2 ? w * 0.4 : w;         // "hz", "db" carry little signal
    }

    if(matched >= need){
      score *= matched / terms.length;              // full coverage outranks partial
      if(matched === terms.length && terms.length > 1) score += 18;
      if(terms.length > 1){
        if(title.includes(raw) || chap.includes(raw)) score += 70;
        else if(body.includes(raw)) score += 45;    // exact phrase beats scattered terms
      }
      literal.push({ rec, s: score, terms });
      continue;
    }
    const f = fuzzy(compact, rec.t + ' ' + rec.ct);
    if(f > 0) loose.push({ rec, s: f, terms });
  }

  literal.sort((a,b) => b.s - a.s);
  loose.sort((a,b) => b.s - a.s);
  const out = literal.slice(0, 40);
  if(out.length < 8) out.push(...loose.slice(0, 8 - out.length));
  return out;
}
`

// ------------------------------------------------------------- screen build

const chapterHtml = chapters.map((c) => `
<article class="chapter" id="ch-${c.slug}" data-slug="${c.slug}">
  <div class="chapmeta">${escapeHtml(c.part)} &middot; Chapter ${c.num}</div>
  ${c.html}
</article>`).join('\n')

const tocHtml = toc.map((g) => `
  <div class="part">${escapeHtml(g.part)}</div>
  ${g.chapters.map((c) => `
  <div class="grp" data-slug="${c.slug}">
    <a class="chap" href="#${c.slug}" data-target="${c.slug}"><span class="n">${c.num}</span><span>${escapeHtml(c.title)}</span></a>
    <div class="secs">${c.sections.map((s) => `<a class="sec" href="#${s.id}" data-target="${s.id}">${escapeHtml(s.t)}</a>`).join('')}</div>
  </div>`).join('')}`).join('\n')

const screenHtml = `<!doctype html>
<html lang="en" data-theme="">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Skald Manual</title>
<style>${BASE_CSS}${SCREEN_CSS}</style>
</head>
<body>
<div class="layout">
  <aside class="side" id="side">
    <div class="brand">
      <h1>Skald Manual</h1>
      <div class="sub">${chapters.length} chapters &middot; built ${buildDate}</div>
    </div>
    <button class="searchbtn" id="openSearch">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>
      Search the manual <kbd>Ctrl K</kbd>
    </button>
    <nav class="toc" id="toc">${tocHtml}</nav>
    <div class="sidefoot">
      <button class="iconbtn" id="themeBtn">Theme</button>
      <button class="iconbtn" id="expandBtn">Expand all</button>
    </div>
  </aside>
  <main>
    <div class="topbar">
      <button class="iconbtn" id="menuBtn">☰</button>
      <span class="t">Skald Manual</span>
      <button class="iconbtn" id="openSearch2" style="margin-left:auto">Search</button>
    </div>
    <div class="doc prose">
      <header class="titlecard">
        <h1>Skald Manual</h1>
        <p>Signals, nodes and patches — the complete reference, compiled from
           <code>docs/manual-source</code> on ${buildDate}.</p>
      </header>
      ${chapterHtml}
    </div>
  </main>
</div>

<div class="scrim" id="scrim"></div>
<div class="palette" id="palette" role="dialog" aria-label="Search">
  <input id="q" type="text" placeholder="Search sections and body text — try &quot;aliasing&quot; or &quot;why patch filter&quot;" autocomplete="off" spellcheck="false">
  <div class="results" id="results"></div>
  <div class="pfoot"><span><kbd>↑</kbd><kbd>↓</kbd> navigate</span><span><kbd>↵</kbd> open</span><span><kbd>esc</kbd> close</span></div>
</div>

<script>
const INDEX = ${JSON.stringify(index)};
${SEARCH_JS}

const $ = (s) => document.querySelector(s);
const palette = $('#palette'), scrim = $('#scrim'), qEl = $('#q'), resEl = $('#results');
let hits = [], sel = 0;

function openSearch(){
  palette.classList.add('on'); scrim.classList.add('on');
  qEl.focus(); qEl.select(); render();
}
function closeSearch(){ palette.classList.remove('on'); scrim.classList.remove('on'); }

function render(){
  hits = search(qEl.value); sel = 0;
  if(!qEl.value.trim()){
    resEl.innerHTML = '<div class="empty">Type to search ' + INDEX.length + ' sections across ' +
      ${chapters.length} + ' chapters.</div>';
    return;
  }
  if(!hits.length){ resEl.innerHTML = '<div class="empty">No matches.</div>'; return; }
  resEl.innerHTML = hits.map((h, i) =>
    '<button class="result' + (i === 0 ? ' sel' : '') + '" data-id="' + h.rec.id + '">' +
      '<div class="crumb">' + h.rec.p + ' &middot; ' + h.rec.ct + '</div>' +
      '<div class="rt">' + highlight(h.rec.t, h.terms) + '</div>' +
      '<div class="snip">' + highlight(snippet(h.rec.b, h.terms), h.terms) + '</div>' +
    '</button>').join('');
}

function move(d){
  const nodes = resEl.querySelectorAll('.result');
  if(!nodes.length) return;
  nodes[sel]?.classList.remove('sel');
  sel = (sel + d + nodes.length) % nodes.length;
  nodes[sel].classList.add('sel');
  nodes[sel].scrollIntoView({ block: 'nearest' });
}

function go(id){
  closeSearch();
  const el = document.getElementById(id);
  if(!el) return;
  history.replaceState(null, '', '#' + id);
  el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  el.style.animation = 'none'; void el.offsetWidth; el.style.animation = '';
}

qEl.addEventListener('input', render);
resEl.addEventListener('click', (e) => {
  const b = e.target.closest('.result'); if(b) go(b.dataset.id);
});
document.addEventListener('keydown', (e) => {
  const open = palette.classList.contains('on');
  if((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k'){ e.preventDefault(); open ? closeSearch() : openSearch(); return; }
  if(!open && e.key === '/' && !/^(INPUT|TEXTAREA)$/.test(document.activeElement.tagName)){ e.preventDefault(); openSearch(); return; }
  if(!open) return;
  if(e.key === 'Escape'){ closeSearch(); }
  else if(e.key === 'ArrowDown'){ e.preventDefault(); move(1); }
  else if(e.key === 'ArrowUp'){ e.preventDefault(); move(-1); }
  else if(e.key === 'Enter'){ e.preventDefault(); if(hits[sel]) go(hits[sel].rec.id); }
});
$('#openSearch').onclick = openSearch;
$('#openSearch2').onclick = openSearch;
scrim.onclick = closeSearch;

// ---- table of contents: expand the chapter you are reading, track position
const groups = [...document.querySelectorAll('.grp')];
const links = new Map([...document.querySelectorAll('.toc a')].map(a => [a.dataset.target, a]));
let forced = false;

function setActive(id, chapSlug){
  document.querySelectorAll('.toc a.active').forEach(a => a.classList.remove('active'));
  links.get(id)?.classList.add('active');
  if(forced) return;
  groups.forEach(g => g.classList.toggle('open', g.dataset.slug === chapSlug));
}

const headings = [...document.querySelectorAll('.hd-1,.hd-2')];
const spy = new IntersectionObserver((entries) => {
  const visible = entries.filter(e => e.isIntersecting)
    .sort((a,b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
  if(!visible) return;
  const el = visible.target;
  setActive(el.id, el.closest('.chapter').dataset.slug);
}, { rootMargin: '-8% 0px -72% 0px', threshold: 0 });
headings.forEach(h => spy.observe(h));

$('#expandBtn').onclick = (e) => {
  forced = !forced;
  groups.forEach(g => g.classList.toggle('open', forced));
  e.target.textContent = forced ? 'Collapse all' : 'Expand all';
};

// ---- theme
const root = document.documentElement;
const saved = localStorage.getItem('skald-manual-theme');
if(saved) root.dataset.theme = saved;
$('#themeBtn').onclick = () => {
  const dark = matchMedia('(prefers-color-scheme: dark)').matches;
  const now = root.dataset.theme || (dark ? 'dark' : 'light');
  const next = now === 'dark' ? 'light' : 'dark';
  root.dataset.theme = next;
  localStorage.setItem('skald-manual-theme', next);
};

// ---- mobile drawer
$('#menuBtn').onclick = () => $('#side').classList.toggle('on');
$('#toc').addEventListener('click', () => { if(innerWidth <= 900) $('#side').classList.remove('on'); });

if(location.hash) setTimeout(() => document.getElementById(location.hash.slice(1))?.scrollIntoView(), 60);
</script>
</body>
</html>`

// -------------------------------------------------------------- print build

const PRINT_CSS = `
body{font-size:10.5pt;line-height:1.5;background:#fff;color:#111}
:root{--bg:#fff;--bg-soft:#f6f4f0;--panel:#fff;--ink:#111;--ink-soft:#555;--rule:#c9c4bb;
  --rule-soft:#e4e0d8;--accent:#8a5209;--accent-soft:#f7f1e6;--code-bg:#f6f4f0;--code-ink:#222;--mark:#ffe9a8}
@page{size:A4;margin:19mm 17mm 20mm}
.doc{max-width:none;padding:0}
.chapter{break-before:page}
.prose h1{font-size:22pt;margin:0 0 .35em;break-after:avoid}
.prose h2{font-size:13.5pt;margin:1.5em 0 .5em;padding-top:.5em;break-after:avoid}
.prose h3{font-size:11pt;margin:1.2em 0 .35em;break-after:avoid}
.prose h4{margin:1em 0 .3em;break-after:avoid}
.prose p,.prose li{orphans:3;widows:3}
.prose blockquote,.codeblock,.tablewrap,.prose table{break-inside:avoid}
.codeblock pre{font-size:8.2pt;line-height:1.42;padding:.7em .85em}
.prose table{font-size:8.6pt}
.prose th,.prose td{padding:.35em .55em}
.prose a{color:#8a5209;border:0;text-decoration:none}
.anchor{display:none}
.chapmeta{font-family:var(--sans);font-size:7.5pt;letter-spacing:.14em;text-transform:uppercase;
  color:#8a5209;font-weight:700;margin-bottom:.4em}
/* cover */
.cover{height:245mm;display:flex;flex-direction:column;justify-content:center;break-after:page;
  text-align:left}
.cover .k{font-family:var(--sans);font-size:9pt;letter-spacing:.28em;text-transform:uppercase;
  color:#8a5209;font-weight:700}
.cover h1{font-family:var(--sans);font-size:42pt;font-weight:750;letter-spacing:-.03em;
  margin:.25em 0 .1em;line-height:1}
.cover .tag{font-size:13pt;color:#444;max-width:120mm;margin:.4em 0 0}
.cover .meta{margin-top:auto;font-family:var(--sans);font-size:8.5pt;color:#666;
  border-top:1px solid #c9c4bb;padding-top:.7em}
/* contents */
.contents{break-after:page}
.contents h2{border:0;padding:0;margin:0 0 1em;font-size:18pt}
.contents .part{font-family:var(--sans);font-size:8pt;letter-spacing:.14em;text-transform:uppercase;
  color:#8a5209;font-weight:700;margin:1.2em 0 .35em}
.contents ol{list-style:none;margin:0;padding:0}
.contents li{margin:.18em 0;font-family:var(--sans);font-size:9.5pt}
.contents li a{color:#111;text-decoration:none;display:flex;gap:.6em}
.contents .n{color:#8a5209;font-variant-numeric:tabular-nums;min-width:1.4em;font-weight:650}
.contents .subs{font-size:8.4pt;color:#666;padding-left:2em;margin:.1em 0 .5em}
.contents .subs span:not(:last-child):after{content:" · "}
`

const printToc = toc.map((g) => `
  <div class="part">${escapeHtml(g.part)}</div>
  <ol>${g.chapters.map((c) => `
    <li><a href="#${c.slug}"><span class="n">${c.num}</span><span>${escapeHtml(c.title)}</span></a></li>`).join('')}
  </ol>`).join('')

const printHtml = `<!doctype html>
<html lang="en" data-theme="light">
<head><meta charset="utf-8"><title>Skald Manual</title>
<style>${BASE_CSS}${PRINT_CSS}</style></head>
<body>
<div class="doc prose">
  <section class="cover">
    <div class="k">Skald</div>
    <h1>The Manual</h1>
    <p class="tag">Signals, nodes and patches — a complete, hands-on reference for building
       synthesisers in Skald and shipping them as Odin code.</p>
    <div class="meta">${chapters.length} chapters &middot; ${index.length} sections &middot; compiled ${buildDate}</div>
  </section>
  <section class="contents">
    <h2>Contents</h2>
    ${printToc}
  </section>
  ${chapters.map((c) => `<article class="chapter" id="ch-${c.slug}">
    <div class="chapmeta">${escapeHtml(c.part)} &middot; Chapter ${c.num}</div>
    ${c.html}
  </article>`).join('\n')}
</div>
</body>
</html>`

// ------------------------------------------------------------------- output

mkdirSync(OUT, { recursive: true })
const htmlPath = join(OUT, 'skald-manual.html')
const printPath = join(OUT, '.skald-manual-print.html')
const pdfPath = join(OUT, 'skald-manual.pdf')

writeFileSync(htmlPath, screenHtml, 'utf8')
writeFileSync(printPath, printHtml, 'utf8')
console.log(`\n  HTML  ${htmlPath}  (${(screenHtml.length / 1024).toFixed(0)} KB)`)

if (!MAKE_PDF) process.exit(0)

const chrome = CHROME_CANDIDATES.find((p) => existsSync(p))
if (!chrome) {
  console.error('  ! No Chrome/Edge found — skipping PDF. Set CHROME_PATH and re-run.')
  process.exit(0)
}

const browser = await puppeteer.launch({
  executablePath: chrome,
  headless: true,
  args: ['--no-sandbox', '--disable-gpu', '--font-render-hinting=none'],
})
try {
  const page = await browser.newPage()
  await page.goto(pathToFileURL(printPath).href, { waitUntil: 'networkidle0' })
  const opts = {
    path: pdfPath,
    format: 'A4',
    printBackground: true,
    displayHeaderFooter: true,
    headerTemplate: '<div></div>',
    footerTemplate:
      '<div style="width:100%;font:8pt system-ui,sans-serif;color:#888;padding:0 17mm;' +
      'display:flex;justify-content:space-between;">' +
      '<span>Skald Manual</span><span class="pageNumber"></span></div>',
    margin: { top: '19mm', right: '17mm', bottom: '20mm', left: '17mm' },
    preferCSSPageSize: false,
  }
  try {
    // `tagged` roughly doubles the file size; the outline is what makes the
    // PDF navigable, so keep that and skip the accessibility tree.
    await page.pdf({ ...opts, outline: true, tagged: false })
  } catch {
    await page.pdf(opts)
    console.log('  !     Chrome too old for PDF bookmarks — outline omitted')
  }
} finally {
  await browser.close()
}

rmSync(printPath, { force: true })
const kb = statSync(pdfPath).size / 1024
console.log(`  PDF   ${pdfPath}  (${(kb / 1024).toFixed(1)} MB)`)
