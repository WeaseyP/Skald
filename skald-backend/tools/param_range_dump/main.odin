package param_range_dump

// =====================================================================
// Roadmap packet A8 — the range-parity gate, backend half.
//
// Prints the backend's parameter-range contract to stdout as JSON so the
// editor's bounds can be asserted against it
// (skald-ui/src/tests/contracts/RangeParity.test.ts).
//
// WHY THIS IS A SEPARATE PROGRAM: `main.odin` is the codegen CLI, whose
// argument surface is a shipped contract (the Electron main process spawns
// it). A `-dump-ranges` flag there would widen that contract for a
// test-only concern, so this lives on its own.
//
// THE ONE RULE: this program must never RESTATE a range. Every number it
// prints comes back from an actual `core.lookup_param_range` call; the
// arrays in core/param_ranges.odin supply only the KEYS to call it with.
// A dump that hardcoded the values it claims to be dumping would agree
// with itself forever and the gate would be decorative.
//
// TWO OUTPUTS, for the two directions the gate has to check:
//
//   "entries"  Every key in the table, enumerated. Lets a consumer find
//              backend rows no editor control can reach.
//
//   "queries"  Resolutions for (nodeType, name) pairs passed as
//              `-q:<nodeType>=<name>` (empty nodeType = `-q:=<name>`).
//              `=` separates rather than `/` on purpose: a `/` in an
//              argument is rewritten to a Windows path by MSYS shells
//              (git-bash turns `-q:=amp` into `-q:C:/Program Files/...`),
//              which silently turns a real query into a fallback lookup.
//              This exists so the TypeScript side never re-implements the
//              precedence rule (override > prefix > generic > fallback).
//              A second implementation of the precedence would be one more
//              copy of the contract, which is the bug this packet retires:
//              the editor asks the backend about its own keys instead.
//
// Build & run (from skald-backend\):
//   odin build tools\param_range_dump -out:tools\param_range_dump.exe
//   tools\param_range_dump.exe > ranges.json
//   tools\param_range_dump.exe -q:LFO=frequency -q:=amplitude
// =====================================================================

import core "../../core"
import "core:encoding/json"
import "core:fmt"
import "core:os"
import "core:slice"
import "core:strconv"
import "core:strings"

// How many channels of each open-ended prefix rule to sample concretely.
// The editor's Mixer tops out at 8 faders; 12 samples past it deliberately,
// so a UI that grows to 12 is still covered without a change here.
PREFIX_SAMPLE_COUNT :: 12

// NOTE: Odin's `fmt` verbs include a brace form, so a literal `{` inside a
// format string is parsed as a directive ("%!(MISSING CLOSE BRACE)"). Every
// literal below therefore goes through `strings.write_string`, and `sbprintf`
// is only used on brace-free formats.

// f32 shortest round-trip. bit_size 32 matters: formatting an f32 as f64 turns
// the table's 0.99 into 0.9900000095367432, which would force every consumer
// of this JSON to invent its own tolerance.
f32_json :: proc(v: f32, buf: []byte) -> string {
	s := strconv.append_float(buf, f64(v), 'g', -1, 32)
	// append_float emits a leading '+' for non-negative values; JSON forbids it.
	if len(s) > 0 && s[0] == '+' {
		return s[1:]
	}
	return s
}

kv_num :: proc(sb: ^strings.Builder, key: string, v: f32) {
	buf: [64]byte
	strings.write_string(sb, `"`)
	strings.write_string(sb, key)
	strings.write_string(sb, `": `)
	strings.write_string(sb, f32_json(v, buf[:]))
}

kv_str :: proc(sb: ^strings.Builder, key: string, v: string) {
	strings.write_string(sb, `"`)
	strings.write_string(sb, key)
	strings.write_string(sb, `": `)
	// Every string emitted here is a node type, parameter name or unit from
	// our own table: ASCII, no quotes, no backslashes. Quote directly.
	strings.write_string(sb, `"`)
	strings.write_string(sb, v)
	strings.write_string(sb, `"`)
}

comma :: proc(sb: ^strings.Builder) {
	strings.write_string(sb, ", ")
}

// Emit min/max/default/unit/exposedDefault for ONE key by calling the real
// lookup. Nothing here reads the table's struct literals.
write_range_fields :: proc(sb: ^strings.Builder, name: string, node_type: string) {
	r := core.lookup_param_range(name, node_type)

	// The default an exposed-but-never-touched parameter actually generates.
	// This is the composition the -6 dB bug lives in (BUGS.md SKB-024): the
	// range default only reaches the generated field if there is no stored
	// value and no node-shape resolution (Mixer `levels`) ahead of it. Dumped
	// by calling the real resolver with an EMPTY node of this type — exactly
	// the state "the user ticked Expose and changed nothing" produces.
	empty := core.Node {
		id         = "dump",
		raw_id     = "dump",
		type       = node_type,
		parameters = make(json.Object),
	}
	defer delete(empty.parameters)
	resolved := core.exposed_param_default(empty, name, r.default)

	kv_num(sb, "min", r.min);          comma(sb)
	kv_num(sb, "max", r.max);          comma(sb)
	kv_num(sb, "default", r.default);  comma(sb)
	kv_str(sb, "unit", r.unit);        comma(sb)
	kv_num(sb, "exposedDefault", resolved)
}

Key :: struct {
	node_type: string,
	name:      string,
	source:    string,
}

main :: proc() {
	keys: [dynamic]Key
	defer delete(keys)

	// --- Enumerate. Keys only; values come from the lookup call above. ---
	for e in core.PARAM_RANGE_OVERRIDES {
		append(&keys, Key{e.node_type, e.name, "override"})
	}
	for e in core.PARAM_RANGE_GENERIC {
		append(&keys, Key{e.node_type, e.name, "generic"})
	}
	// Prefix rules have an unbounded key set, so they cannot be rows. Sample
	// them: `prefixRules` below carries the rule itself so a consumer can check
	// names past the samples, and these entries prove the rule is actually
	// reachable through `lookup_param_range` rather than merely asserted.
	for rule in core.PARAM_RANGE_PREFIX_RULES {
		for i in 1 ..= PREFIX_SAMPLE_COUNT {
			append(&keys, Key{rule.node_type, fmt.aprintf("%s%d", rule.prefix, i), "prefixSample"})
		}
	}

	// Stable output: this JSON is diffable and may be pasted into a report.
	slice.sort_by(keys[:], proc(a, b: Key) -> bool {
		if a.node_type != b.node_type {
			return a.node_type < b.node_type
		}
		return a.name < b.name
	})

	sb := strings.builder_make()
	defer strings.builder_destroy(&sb)

	strings.write_string(&sb, "{\n")
	strings.write_string(&sb, `  "schema": "skald.paramRanges.v1",`)
	strings.write_string(&sb, "\n")
	strings.write_string(
		&sb,
		`  "generatedBy": "skald-backend/tools/param_range_dump - generated, never committed",`,
	)
	strings.write_string(&sb, "\n")

	// The unknown-parameter fallback, so a consumer can tell "this name is not
	// in the table" apart from "this name is deliberately wide open".
	fb := core.lookup_param_range("__skald_unknown_parameter_probe__", "")
	strings.write_string(&sb, `  "fallback": {`)
	kv_num(&sb, "min", fb.min);         comma(&sb)
	kv_num(&sb, "max", fb.max);         comma(&sb)
	kv_num(&sb, "default", fb.default); comma(&sb)
	kv_str(&sb, "unit", fb.unit)
	strings.write_string(&sb, "},\n")

	strings.write_string(&sb, `  "prefixRules": [`)
	strings.write_string(&sb, "\n")
	for rule, i in core.PARAM_RANGE_PREFIX_RULES {
		// Sample the rule THROUGH the lookup rather than printing rule.range,
		// so this row is generated too.
		probe := fmt.tprintf("%s1", rule.prefix)
		r := core.lookup_param_range(probe, rule.node_type)
		strings.write_string(&sb, "    {")
		kv_str(&sb, "nodeType", rule.node_type); comma(&sb)
		kv_str(&sb, "prefix", rule.prefix);      comma(&sb)
		kv_num(&sb, "min", r.min);               comma(&sb)
		kv_num(&sb, "max", r.max);               comma(&sb)
		kv_num(&sb, "default", r.default);       comma(&sb)
		kv_str(&sb, "unit", r.unit);             comma(&sb)
		kv_num(&sb, "sampledTo", f32(PREFIX_SAMPLE_COUNT))
		strings.write_string(&sb, "}")
		if i < len(core.PARAM_RANGE_PREFIX_RULES) - 1 {
			strings.write_string(&sb, ",")
		}
		strings.write_string(&sb, "\n")
	}
	strings.write_string(&sb, "  ],\n")

	strings.write_string(&sb, `  "entries": [`)
	strings.write_string(&sb, "\n")
	for k, i in keys {
		strings.write_string(&sb, "    {")
		kv_str(&sb, "nodeType", k.node_type); comma(&sb)
		kv_str(&sb, "name", k.name);          comma(&sb)
		kv_str(&sb, "source", k.source);      comma(&sb)
		write_range_fields(&sb, k.name, k.node_type)
		strings.write_string(&sb, "}")
		if i < len(keys) - 1 {
			strings.write_string(&sb, ",")
		}
		strings.write_string(&sb, "\n")
	}
	strings.write_string(&sb, "  ],\n")

	// --- Query mode: resolve the caller's own keys through the real proc. ---
	queries: [dynamic]Key
	defer delete(queries)
	for arg in os.args[1:] {
		if !strings.has_prefix(arg, "-q:") {
			continue
		}
		spec := arg[3:]
		sep := strings.index_byte(spec, '=')
		if sep < 0 {
			fmt.eprintf("param_range_dump: bad -q argument %q, want -q:<nodeType>=<name>\n", arg)
			os.exit(2)
		}
		append(&queries, Key{spec[:sep], spec[sep + 1:], "query"})
	}

	strings.write_string(&sb, `  "queries": [`)
	strings.write_string(&sb, "\n")
	for q, i in queries {
		strings.write_string(&sb, "    {")
		kv_str(&sb, "nodeType", q.node_type); comma(&sb)
		kv_str(&sb, "name", q.name);          comma(&sb)
		write_range_fields(&sb, q.name, q.node_type)
		strings.write_string(&sb, "}")
		if i < len(queries) - 1 {
			strings.write_string(&sb, ",")
		}
		strings.write_string(&sb, "\n")
	}
	strings.write_string(&sb, "  ]\n")
	strings.write_string(&sb, "}\n")

	os.write_string(os.stdout, strings.to_string(sb))
}
