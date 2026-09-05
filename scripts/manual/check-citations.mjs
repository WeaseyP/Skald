#!/usr/bin/env node
// Gates the manual's citation convention (roadmap D3).
//
// Two forms may appear inside backticks in a chapter:
//   NEW    `path/from/repo/root.ext::identifier`  — the only form new prose
//          should use. `identifier` must be a name that literally appears in
//          that file.
//   LEGACY `path:NNN` / `path:NNN-MMM`            — the retired line-number
//          convention. 828 of these drifted within one release cycle (see
//          docs/manual-source/FIXED.md), so in strict mode a legacy citation
//          into a source file is a mismatch in its own right, not just a
//          drift candidate.
//
// This replaces scripts/check_citations.py, which (a) crashed on non-ASCII
// output on cp1252 consoles and (b) always exited 0, so it never gated
// anything — a checker nobody can fail is not a checker.
//
//   node check-citations.mjs [--all] [--json <path>]
//
// Default scope: every chapter registered in build-manual.mjs's PARTS array,
// plus docs/manual-source/KNOWN-ISSUES.md if present. Exits 1 on any mismatch.
// --all additionally walks every .md under docs/ and reports it too, but never
// affects the exit code — it is there so the historical audit documents can be
// inspected without gating the build on prose nobody is fixing.

import { readFileSync, readdirSync, existsSync, writeFileSync } from 'node:fs'
import { join, dirname, relative, extname, basename } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = join(HERE, '..', '..')
const SRC = join(REPO_ROOT, 'docs', 'manual-source')
const BUILD_MANUAL = join(HERE, 'build-manual.mjs')

// Extensions the manual convention treats as "source" — a legacy `path:NNN`
// into any of these is itself a mismatch in strict mode, docs/**.md included
// (a stale `00-foundations.md:17` is exactly the drift this convention
// exists to stop).
const SOURCE_EXTS = new Set(['.odin', '.ts', '.tsx', '.mjs', '.json', '.bat', '.ps1', '.py', '.md'])

// Directories a basename fallback search (and the --all walk) must not
// wander into.
const EXCLUDE_DIRS = new Set(['.git', 'node_modules', '.tools', 'dist', 'out'])

// ------------------------------------------------------------------ registry
//
// PARTS is hand-maintained JS, not JSON, and importing build-manual.mjs would
// execute the whole build (it reconciles the registry and, without --check,
// renders the manual). So the array is extracted textually by brace-balancing
// from its source rather than imported — one registry, read two ways, instead
// of two registries.

function extractPartsSource(src) {
  const start = src.indexOf('const PARTS = [')
  if (start === -1) throw new Error('check-citations: could not find "const PARTS = [" in build-manual.mjs')
  const open = src.indexOf('[', start)
  let depth = 0
  for (let i = open; i < src.length; i++) {
    if (src[i] === '[') depth++
    else if (src[i] === ']') {
      depth--
      if (depth === 0) return src.slice(open, i + 1)
    }
  }
  throw new Error('check-citations: unbalanced PARTS array in build-manual.mjs')
}

// Just the chapters PARTS registers, no KNOWN-ISSUES.md — what repin-citations
// means by "all PARTS chapters" (it is not a chapter, so re-pinning suggestions
// for it would be noise).
function partsChapterFiles() {
  const buildSrc = readFileSync(BUILD_MANUAL, 'utf8')
  const partsSrc = extractPartsSource(buildSrc)
  const files = [...partsSrc.matchAll(/'([^']+\.md)'/g)].map((m) => m[1])
  return files.map((f) => join(SRC, f))
}

function registeredChapters() {
  const paths = partsChapterFiles()
  const knownIssues = join(SRC, 'KNOWN-ISSUES.md')
  if (existsSync(knownIssues)) paths.push(knownIssues)
  return paths
}

// -------------------------------------------------------------------- walk

function walkMarkdown(dir) {
  const out = []
  const entries = readdirSync(dir, { withFileTypes: true })
  for (const e of entries) {
    if (e.isDirectory()) {
      if (EXCLUDE_DIRS.has(e.name)) continue
      out.push(...walkMarkdown(join(dir, e.name)))
    } else if (e.isFile() && e.name.endsWith('.md')) {
      out.push(join(dir, e.name))
    }
  }
  return out
}

function findByBasename(name) {
  const hits = []
  const walk = (dir) => {
    let entries
    try {
      entries = readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const e of entries) {
      if (e.isDirectory()) {
        if (EXCLUDE_DIRS.has(e.name)) continue
        walk(join(dir, e.name))
      } else if (e.isFile() && e.name === name) {
        hits.push(join(dir, e.name))
      }
    }
  }
  walk(REPO_ROOT)
  return hits
}

// ------------------------------------------------------------------ source

const fileCache = new Map()
function readSource(path) {
  if (!fileCache.has(path)) {
    try {
      fileCache.set(path, readFileSync(path, 'utf8'))
    } catch {
      fileCache.set(path, null)
    }
  }
  return fileCache.get(path)
}

// Whole-word match, honouring the identifier's own dotted structure: for
// `Foo.bar` the file must contain `Foo` as a word AND `bar` as a word (not
// necessarily adjacent — a member path is routinely spelled out across a
// declaration and a use site).
function identifierFoundIn(content, identifier) {
  const segments = identifier.split('.')
  const first = segments[0]
  const last = segments[segments.length - 1]
  const wordRe = (seg) => new RegExp(`\\b${seg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`)
  if (!wordRe(first).test(content)) return false
  if (last !== first && !wordRe(last).test(content)) return false
  return true
}

const IDENTIFIER_RE = /^[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*$/

// -------------------------------------------------------------- classify

// A `word::word` span is Odin's own `pkg::proc` syntax unless the left side
// looks like a path — this repo's manual prose quotes real Odin snippets
// (`fmt::println`-shaped) that must not be misread as citations.
function classify(raw) {
  const dbl = raw.indexOf('::')
  if (dbl !== -1) {
    const left = raw.slice(0, dbl)
    const right = raw.slice(dbl + 2)
    const looksLikePath = left.includes('/') || SOURCE_EXTS.has(extname(left))
    if (!looksLikePath) return null
    if (!IDENTIFIER_RE.test(right)) return null
    return { kind: 'new', path: left, identifier: right }
  }
  const m = raw.match(/^([a-zA-Z0-9_/.\-]+):(\d+)(?:-(\d+))?$/)
  if (m) {
    return { kind: 'legacy', path: m[1], startLine: Number(m[2]), endLine: m[3] ? Number(m[3]) : Number(m[2]) }
  }
  return null
}

// ------------------------------------------------------------- extraction

// Pulls (line, citation-text, all-backtick-spans-on-that-line) triples out of
// one markdown file, skipping anything inside a fenced code block — emitted
// Odin excerpts are full of `foo::bar` syntax that is prose, not a citation.
function extractCandidates(text) {
  const lines = text.split(/\r\n|\r|\n/)
  const results = []
  let inFence = false
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (/^\s*```/.test(line)) {
      inFence = !inFence
      continue
    }
    if (inFence) continue
    const spans = [...line.matchAll(/`([^`]+)`/g)].map((m) => m[1])
    if (!spans.length) continue
    for (const span of spans) {
      results.push({ line: i + 1, text: span, spansOnLine: spans })
    }
  }
  return results
}

// --------------------------------------------------------------- checking

// One finding per candidate: { file, line, citation, kind, status, reason }
// status is 'pass' | 'warning' | 'mismatch'.
function checkFile(mdPath) {
  const text = readFileSync(mdPath, 'utf8')
  const candidates = extractCandidates(text)
  const findings = []

  for (const { line, text: raw, spansOnLine } of candidates) {
    const c = classify(raw)
    if (!c) continue

    if (c.kind === 'new') {
      const fullPath = join(REPO_ROOT, c.path)
      let sourcePath = fullPath
      let warningNote = null

      if (!existsSync(fullPath)) {
        const hits = findByBasename(basename(c.path))
        if (hits.length === 1) {
          sourcePath = hits[0]
          warningNote = `path not found at ${c.path}; matched by basename to ${relative(REPO_ROOT, hits[0]).replace(/\\/g, '/')}`
        } else if (hits.length === 0) {
          findings.push({ file: mdPath, line, citation: raw, kind: 'new', status: 'mismatch', reason: `file not found: ${c.path}` })
          continue
        } else {
          findings.push({ file: mdPath, line, citation: raw, kind: 'new', status: 'mismatch', reason: `file not found at ${c.path}, and basename "${basename(c.path)}" is ambiguous (${hits.length} matches)` })
          continue
        }
      }

      const content = readSource(sourcePath)
      if (content == null) {
        findings.push({ file: mdPath, line, citation: raw, kind: 'new', status: 'mismatch', reason: `could not read ${c.path}` })
        continue
      }
      if (!identifierFoundIn(content, c.identifier)) {
        findings.push({ file: mdPath, line, citation: raw, kind: 'new', status: 'mismatch', reason: `identifier "${c.identifier}" not found in ${warningNote ? relative(REPO_ROOT, sourcePath).replace(/\\/g, '/') : c.path}` })
        continue
      }
      if (warningNote) {
        findings.push({ file: mdPath, line, citation: raw, kind: 'new', status: 'warning', reason: warningNote })
        continue
      }
      findings.push({ file: mdPath, line, citation: raw, kind: 'new', status: 'pass', reason: 'ok' })
      continue
    }

    // Legacy citation.
    const ext = extname(c.path)
    if (SOURCE_EXTS.has(ext)) {
      findings.push({
        file: mdPath,
        line,
        citation: raw,
        kind: 'legacy',
        status: 'mismatch',
        reason: `legacy line-number citation into a source file — convert to path::identifier (retired convention, see D3)`,
      })
      continue
    }

    // Not a recognised source extension: fall back to the old drift-only
    // heuristic, advisory in shape (a plain warning, since we cannot say the
    // convention itself is wrong here).
    const fullPath = join(REPO_ROOT, c.path)
    const content = existsSync(fullPath) ? readSource(fullPath) : null
    if (content == null) {
      findings.push({ file: mdPath, line, citation: raw, kind: 'legacy', status: 'warning', reason: `cited file not found: ${c.path}` })
      continue
    }
    const srcLines = content.split(/\r\n|\r|\n/)
    const quotes = spansOnLine.filter((s) => s !== raw && s.trim().length > 3 && !classify(s))
    let drifted = false
    for (const q of quotes) {
      let bestDiff = Infinity
      for (let i = 0; i < srcLines.length; i++) {
        if (srcLines[i].includes(q)) {
          const diff = Math.abs(i + 1 - c.startLine)
          if (diff < bestDiff) bestDiff = diff
        }
      }
      if (bestDiff !== Infinity && bestDiff > 15) {
        findings.push({ file: mdPath, line, citation: raw, kind: 'legacy', status: 'mismatch', reason: `citation drift: quote "${q}" now ${bestDiff} lines from ${c.path}:${c.startLine}` })
        drifted = true
      }
    }
    if (!drifted) findings.push({ file: mdPath, line, citation: raw, kind: 'legacy', status: 'pass', reason: 'ok' })
  }

  return findings
}

// ------------------------------------------------------------------- main

function report(findings, { gating }) {
  const problems = findings.filter((f) => f.status === 'mismatch' || f.status === 'warning')
  for (const f of problems) {
    const rel = relative(REPO_ROOT, f.file).replace(/\\/g, '/')
    process.stdout.write(`${rel}:${f.line}  \`${f.citation}\`  [${f.status}] ${f.reason}\n`)
  }
  const mismatches = findings.filter((f) => f.status === 'mismatch').length
  const warnings = findings.filter((f) => f.status === 'warning').length
  process.stdout.write(`${gating ? 'strict' : 'advisory'}: ${findings.length} citations checked, ${mismatches} mismatch(es), ${warnings} warning(s)\n`)
  return mismatches
}

function run(argv) {
  const ALL = argv.includes('--all')
  const jsonFlagIdx = argv.indexOf('--json')
  const JSON_OUT = jsonFlagIdx === -1 ? null : argv[jsonFlagIdx + 1]

  const strictFiles = registeredChapters()
  process.stdout.write(`Citation check — strict scope: ${strictFiles.length} file(s)\n`)
  const strictFindings = strictFiles.filter(existsSync).flatMap(checkFile)
  const missingRegistered = strictFiles.filter((f) => !existsSync(f))
  for (const f of missingRegistered) {
    process.stdout.write(`${relative(REPO_ROOT, f).replace(/\\/g, '/')}  [mismatch] registered chapter is missing from disk\n`)
  }
  const strictMismatches = report(strictFindings, { gating: true }) + missingRegistered.length

  let allFindings = strictFindings
  if (ALL) {
    process.stdout.write('\nCitation check — --all scope (advisory, does not gate): full docs/ walk\n')
    const allFiles = walkMarkdown(join(REPO_ROOT, 'docs'))
    allFindings = allFiles.flatMap(checkFile)
    report(allFindings, { gating: false })
  }

  if (JSON_OUT) {
    const payload = {
      generatedAt: new Date().toISOString(),
      strict: { files: strictFiles.map((f) => relative(REPO_ROOT, f).replace(/\\/g, '/')), findings: strictFindings },
      all: ALL ? { findings: allFindings } : null,
    }
    writeFileSync(JSON_OUT, JSON.stringify(payload, null, 2), 'utf8')
    process.stdout.write(`\nJSON written: ${JSON_OUT}\n`)
  }

  return strictMismatches > 0 ? 1 : 0
}

// Only run as a program when invoked directly — importing this module (the
// self-test does) must not execute the CLI or call process.exit.
const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]

if (isMain) {
  process.exit(run(process.argv.slice(2)))
}

export {
  classify,
  identifierFoundIn,
  extractCandidates,
  checkFile,
  registeredChapters,
  partsChapterFiles,
  walkMarkdown,
  findByBasename,
  run,
  REPO_ROOT,
  SRC,
}
