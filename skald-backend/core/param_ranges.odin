package skald_core

// Default min/max/default/unit for known parameter names. The codegen reads
// this at codegen-time to clamp typed setters and to populate the
// introspectable <Foo>_PARAMS table on each generated processor.
//
// These ranges are conservative (covering audible-range frequencies, time
// constants from 1ms to 10s, normalized 0-1 mix/feedback, etc.) and match
// the ranges sliders use in the UI's parameter panel. If the UI later sends
// per-parameter ranges in the JSON contract, the codegen can prefer those
// over this fallback table.
//
// ---------------------------------------------------------------------------
// ROADMAP PACKET A8 — this table is DATA, on purpose.
//
// It used to be a pair of `switch` statements inside `lookup_param_range`,
// which meant the set of (node_type, name) keys existed only as control flow:
// callable, but not enumerable. That is why six UI/backend range mismatches
// shipped and four of them were fixed once and re-found later (BUGS.md
// SKB-049, SKB-050, SKB-051, SKB-024) — nothing could list the contract in
// order to compare it against the editor.
//
// `tools/param_range_dump` walks the arrays below, calls
// `lookup_param_range` for each key, and prints the results as JSON;
// `skald-ui/src/tests/contracts/RangeParity.test.ts` asserts the editor's
// bounds against that JSON. So:
//
//   * Adding a range = adding a row here. It is dumped and gated automatically.
//   * Adding a special case to the PROC BODY instead of a row here makes it
//     invisible to the dump. Don't. If a rule genuinely cannot be a row (see
//     PARAM_RANGE_PREFIX_RULES) it must be declared as data too.
// ---------------------------------------------------------------------------

import "core:strings"

Param_Range :: struct {
	min:     f32,
	max:     f32,
	default: f32,
	unit:    string,
}

// One row of the range contract.
//
//	node_type == ""  the name-keyed generic table (any node type)
//	node_type != ""  a node-type-scoped override, consulted BEFORE the
//	                 generic table and before the prefix rules
Param_Range_Entry :: struct {
	node_type: string,
	name:      string,
	range:     Param_Range,
}

// A rule that matches by prefix rather than by exact name, so its key set is
// open-ended and cannot be enumerated as rows. Kept as data anyway so the dump
// can emit the rule itself (and sample it) instead of the dump restating it.
Param_Range_Prefix_Rule :: struct {
	node_type: string, // "" = applies to every node type
	prefix:    string,
	range:     Param_Range,
}

// ---------------------------------------------------------------------------
// ROADMAP PACKET C2 — the tables themselves are GENERATED.
//
// PARAM_RANGE_OVERRIDES, PARAM_RANGE_PREFIX_RULES, PARAM_RANGE_GENERIC and
// PARAM_RANGE_FALLBACK live in param_ranges.generated.odin, rendered from
// schema/nodes.json by `node scripts/gen-node-schema.mjs` — the same source
// the editor reads its stored defaults from (nodeSchema.generated.ts). The
// contract used to be authored five to seven times across two languages and
// carried ten live default divergences ("exposing an untouched Wavetable
// amplitude halves it — a 6 dB change from a checkbox", SKB-024); now a row
// is authored once and the staleness gate (skald-ui NodeSchema.test.ts)
// fails when either generated copy differs from the schema. Edit the
// schema, regenerate, never the generated files.
// ---------------------------------------------------------------------------


lookup_param_range :: proc(name: string, node_type := "") -> Param_Range {
	// Node-type-specific overrides first.
	if node_type != "" {
		for entry in PARAM_RANGE_OVERRIDES {
			if entry.node_type == node_type && entry.name == name {
				return entry.range
			}
		}
	}

	for rule in PARAM_RANGE_PREFIX_RULES {
		if rule.node_type != "" && rule.node_type != node_type {
			continue
		}
		// `len(name) > len(prefix)`: the bare prefix ("level") is not itself a
		// channel fader and must fall through to the generic table.
		if strings.has_prefix(name, rule.prefix) && len(name) > len(rule.prefix) {
			return rule.range
		}
	}

	for entry in PARAM_RANGE_GENERIC {
		if entry.name == name {
			return entry.range
		}
	}

	return PARAM_RANGE_FALLBACK
}
