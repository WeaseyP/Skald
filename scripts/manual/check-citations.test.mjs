// Self-test for check-citations.mjs (roadmap D3). Run with `node --test`.
//
// Each case writes a throwaway markdown file into the OS temp dir and asks
// checkFile() to classify its citations, so these tests exercise exactly the
// extraction/classification logic the CLI uses — not a re-implementation of
// it.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { checkFile } from './check-citations.mjs'

function withMarkdown(lines, fn) {
  const dir = mkdtempSync(join(tmpdir(), 'check-citations-test-'))
  const path = join(dir, 't.md')
  writeFileSync(path, lines.join('\n'), 'utf8')
  try {
    return fn(path)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

test('new-form citation with a real identifier passes', () => {
  withMarkdown(
    ['# T', 'See `skald-backend/core/codegen_nodes.odin::generate_filter_code` for the body.'],
    (path) => {
      const findings = checkFile(path)
      const hit = findings.find((f) => f.kind === 'new')
      assert.ok(hit, 'expected a new-form finding')
      assert.equal(hit.status, 'pass')
    },
  )
})

test('new-form citation with a missing identifier is a mismatch', () => {
  withMarkdown(
    ['# T', 'See `skald-backend/core/codegen_nodes.odin::this_proc_does_not_exist_anywhere` here.'],
    (path) => {
      const findings = checkFile(path)
      const hit = findings.find((f) => f.kind === 'new')
      assert.ok(hit)
      assert.equal(hit.status, 'mismatch')
      assert.match(hit.reason, /not found/)
    },
  )
})

test('legacy citation into a source file is a strict mismatch', () => {
  withMarkdown(['# T', 'See `skald-backend/core/codegen_nodes.odin:42` for the line.'], (path) => {
    const findings = checkFile(path)
    const hit = findings.find((f) => f.kind === 'legacy')
    assert.ok(hit)
    assert.equal(hit.status, 'mismatch')
    assert.match(hit.reason, /legacy/i)
  })
})

test('legacy citation into a docs/**.md chapter is also a strict mismatch', () => {
  withMarkdown(['# T', 'See `00-foundations.md:17` for the intro.'], (path) => {
    const findings = checkFile(path)
    const hit = findings.find((f) => f.kind === 'legacy')
    assert.ok(hit)
    assert.equal(hit.status, 'mismatch')
  })
})

test('fenced code blocks are not scanned for citations', () => {
  withMarkdown(
    ['# T', '```odin', 'foo :: proc() { bar::baz_undefined_thing() }', '```', 'No citations above should be flagged.'],
    (path) => {
      const findings = checkFile(path)
      assert.equal(findings.length, 0)
    },
  )
})

test('Odin pkg::proc prose is not flagged as a citation', () => {
  withMarkdown(['# T', 'Odin spells package-qualified calls as `fmt::println` in prose.'], (path) => {
    const findings = checkFile(path)
    assert.equal(findings.length, 0)
  })
})

test('basename fallback resolves a moved file and reports a warning, not a pass', () => {
  withMarkdown(
    ['# T', 'Wrong relative prefix: `core/codegen_nodes.odin::generate_filter_code` should still resolve.'],
    (path) => {
      const findings = checkFile(path)
      const hit = findings.find((f) => f.kind === 'new')
      assert.ok(hit)
      assert.equal(hit.status, 'warning')
      assert.match(hit.reason, /basename/)
    },
  )
})

test('a bare `:NNN` continuing an earlier citation is a strict mismatch', () => {
  withMarkdown(
    ['# T', 'The pad clamps at 20 (`skald-ui/src/components/NodeParameterControls.tsx:144`, `:153`).'],
    (path) => {
      const findings = checkFile(path)
      const bare = findings.find((f) => f.citation === ':153')
      assert.ok(bare, 'expected the bare :153 to be classified')
      assert.equal(bare.status, 'mismatch')
      assert.match(bare.reason, /bare line-number/)
    },
  )
})

test('a comma list of lines after one path is a legacy citation, not prose', () => {
  withMarkdown(
    ['# T', 'Both ranges live in `skald-backend/core/codegen_nodes.odin:339, :341, 344-346`.'],
    (path) => {
      const findings = checkFile(path)
      const hit = findings.find((f) => f.kind === 'legacy')
      assert.ok(hit, 'expected a legacy finding for the comma list')
      assert.equal(hit.status, 'mismatch')
    },
  )
})

test('a hyphenated node id in an example JSON is a valid identifier', () => {
  withMarkdown(
    ['# T', 'The pad drifts under `examples/snes-kit/instruments/space-pad.skald.json::pad-drift-lfo`.'],
    (path) => {
      const findings = checkFile(path)
      const hit = findings.find((f) => f.kind === 'new')
      assert.ok(hit, 'expected a new-form finding')
      assert.equal(hit.status, 'pass')
    },
  )
})

test('a bare `::identifier` inherits the path of the last full citation on the line', () => {
  withMarkdown(
    ['# T', 'See `skald-backend/core/codegen_nodes.odin::generate_filter_code` and `::generate_reverb_code`, but not `::this_does_not_exist_zz`.'],
    (path) => {
      const findings = checkFile(path)
      const ok = findings.find((f) => f.citation === '::generate_reverb_code')
      const bad = findings.find((f) => f.citation === '::this_does_not_exist_zz')
      assert.equal(ok?.status, 'pass')
      assert.equal(bad?.status, 'mismatch')
    },
  )
})

test('a bare `::identifier` with nothing to inherit from is a mismatch', () => {
  withMarkdown(['# T', 'The clamp lives in `::generate_filter_code`.'], (path) => {
    const findings = checkFile(path)
    const hit = findings.find((f) => f.citation === '::generate_filter_code')
    assert.equal(hit?.status, 'mismatch')
  })
})
