package skald_unit_tests

// =====================================================================
// Roadmap packet B7 / BUGS.md SKB-017 — cross-domain modulation.
//
// Two procs are under test, both factored out of compute_bus_domain for
// exactly this reason:
//
//   core.seed_bus_domain(graph, sorted) -> map[string]bool
//       Delay/Reverb/GraphInput seed the bus domain and it propagates
//       downstream. Unchanged behaviour, pinned here so the hoist tests
//       below are testing the hoist and not the seeding.
//
//   core.hoist_bus_modulators(graph, sorted, &bus) -> (conflict, found)
//       The new rule. A non-voice-coupled modulator (LFO, SampleHold,
//       Noise, Mapper) that feeds a bus node is MOVED into the bus
//       domain; one that feeds both domains is reported as a conflict.
//
// Why this rule needs tests rather than only goldens: evaluated in the
// voice domain, a modulator feeding the bus was summed across active
// voices, so an LFO at amplitude 600 swung a post-Delay cutoff ±600 with
// one note held and ±2400 with four, and ±0 once the last voice went
// inactive — mid-tail. Nothing about the emitted text looks wrong; you
// have to hold four notes to hear it. A golden cannot state the rule,
// and the mixed-domain half exits the process, so it could not be
// covered in-process at all until the analysis stopped printing its own
// diagnostics.
//
// Run (from skald-backend\):
//   odin test tests\unit
// =====================================================================

import core "../../core"
import "core:testing"

// --- helpers ---------------------------------------------------------

// Graph.nodes is a map keyed by id, which is what the codegen indexes; the
// node list here is positional purely for readability.
bus_graph :: proc(nodes: []core.Node, conns: []core.Connection) -> core.Graph {
	m := make(map[string]core.Node)
	for n in nodes do m[n.id] = n
	return core.Graph{nodes = m, connections = conns}
}

// seed + hoist over one graph, returning the resulting domain map and the
// conflict (if any). Caller owns the map.
resolve_domains :: proc(
	t: ^testing.T,
	g: ^core.Graph,
) -> (map[string]bool, core.Cross_Domain_Conflict, bool) {
	sorted, is_dag := core.topological_sort(g)
	defer delete(sorted)
	testing.expect(t, is_dag, "test fixture graph must be a DAG")
	bus := core.seed_bus_domain(g, sorted)
	conflict, found := core.hoist_bus_modulators(g, sorted, &bus)
	return bus, conflict, found
}

// =====================================================================
// is_hoistable_modulator_type — the type list itself
// =====================================================================

@(test)
test_hoistable_types_are_exactly_the_stateless_modulators :: proc(t: ^testing.T) {
	for ty in ([]string{"LFO", "SampleHold", "Noise", "Mapper"}) {
		testing.expect(
			t,
			core.is_hoistable_modulator_type(ty),
			"a non-voice-coupled modulator must be hoistable — it has no note, envelope stage or per-voice pitch, so evaluating it once per sample is meaningful",
		)
	}
	// The voice-coupled types must NEVER be hoisted; compute_bus_domain still
	// hard-errors on them landing in the bus domain, and a hoist would route
	// around that check rather than satisfying it.
	for ty in ([]string{"Oscillator", "ADSR", "FmOperator", "Wavetable", "MidiInput"}) {
		testing.expect(
			t,
			!core.is_hoistable_modulator_type(ty),
			"a voice-coupled node must not be hoistable",
		)
	}
	// Effects are not modulators; they follow the signal path and are placed
	// by propagation, not by this rule.
	for ty in ([]string{"Filter", "Gain", "Distortion", "Mixer", "Panner", "Delay", "Reverb"}) {
		testing.expect(t, !core.is_hoistable_modulator_type(ty), "an effect is not a hoistable modulator")
	}
}

// =====================================================================
// hoist_bus_modulators — the hoist
// =====================================================================

@(test)
test_lfo_feeding_only_a_bus_node_is_hoisted :: proc(t: ^testing.T) {
	// Osc -> Delay -> Filter -> Out, with the LFO modulating the POST-delay
	// filter's cutoff. This is SKB-017's reproduction.
	g := bus_graph(
		{
			{id = "osc", type = "Oscillator"},
			{id = "dly", type = "Delay"},
			{id = "flt", type = "Filter"},
			{id = "lfo", type = "LFO"},
			{id = "out", type = "GraphOutput"},
		},
		{
			{"osc", "output", "dly", "input"},
			{"dly", "output", "flt", "input"},
			{"lfo", "output", "flt", "input_cutoff"},
			{"flt", "output", "out", "input"},
		},
	)
	defer delete(g.nodes)
	bus, _, found := resolve_domains(t, &g)
	defer delete(bus)

	testing.expect(t, !found, "an LFO whose only consumer is a bus node is not a conflict, it is a hoist")
	testing.expect(
		t,
		bus["lfo"],
		"the LFO must land in the bus domain: left per-voice its output was summed across active voices and vanished entirely once the last voice released",
	)
	testing.expect(t, bus["flt"], "the post-Delay filter is bus domain by propagation")
	testing.expect(t, !bus["osc"], "the oscillator stays per-voice")
}

@(test)
test_modulator_feeding_only_voice_nodes_stays_per_voice :: proc(t: ^testing.T) {
	// The overwhelmingly common wiring, and the one the hoist must not touch:
	// a per-voice LFO modulating a per-voice filter. Over-hoisting here would
	// collapse every voice's vibrato onto one shared phase.
	g := bus_graph(
		{
			{id = "osc", type = "Oscillator"},
			{id = "flt", type = "Filter"},
			{id = "lfo", type = "LFO"},
			{id = "dly", type = "Delay"},
			{id = "out", type = "GraphOutput"},
		},
		{
			{"osc", "output", "flt", "input"},
			{"lfo", "output", "flt", "input_cutoff"},
			{"flt", "output", "dly", "input"},
			{"dly", "output", "out", "input"},
		},
	)
	defer delete(g.nodes)
	bus, _, found := resolve_domains(t, &g)
	defer delete(bus)

	testing.expect(t, !found, "a purely per-voice modulator is not a conflict")
	testing.expect(t, !bus["lfo"], "an LFO that only feeds per-voice nodes must stay per-voice")
	testing.expect(t, !bus["flt"], "a filter upstream of the Delay is per-voice")
}

@(test)
test_hoist_cascades_up_a_modulator_chain :: proc(t: ^testing.T) {
	// LFO -> Mapper -> (bus) Filter cutoff. The Mapper is hoisted because its
	// consumer is bus, and the LFO then follows because its consumer is the
	// now-hoisted Mapper. Sinks-first iteration is what makes that one pass.
	g := bus_graph(
		{
			{id = "osc", type = "Oscillator"},
			{id = "dly", type = "Delay"},
			{id = "flt", type = "Filter"},
			{id = "lfo", type = "LFO"},
			{id = "map", type = "Mapper"},
			{id = "out", type = "GraphOutput"},
		},
		{
			{"osc", "output", "dly", "input"},
			{"dly", "output", "flt", "input"},
			{"lfo", "output", "map", "input"},
			{"map", "output", "flt", "input_cutoff"},
			{"flt", "output", "out", "input"},
		},
	)
	defer delete(g.nodes)
	bus, _, found := resolve_domains(t, &g)
	defer delete(bus)

	testing.expect(t, !found, "a chain that ends entirely in the bus domain is not a conflict")
	testing.expect(t, bus["map"], "the Mapper feeding a bus node must be hoisted")
	testing.expect(
		t,
		bus["lfo"],
		"the LFO behind the hoisted Mapper must be hoisted too, or it would be evaluated per voice and read once per sample",
	)
}

@(test)
test_graph_output_consumer_does_not_decide_the_domain :: proc(t: ^testing.T) {
	// GraphOutput sits in the bus domain here (it is fed by the Delay), but it
	// is domain-agnostic: generate_graph_output_adds runs in both passes and
	// filters its sources by the domain each one is actually in. So an LFO
	// wired to BOTH a per-voice filter and the output is not a conflict, and
	// must not be hoisted on the strength of the output edge.
	g := bus_graph(
		{
			{id = "osc", type = "Oscillator"},
			{id = "flt", type = "Filter"},
			{id = "lfo", type = "LFO"},
			{id = "dly", type = "Delay"},
			{id = "out", type = "GraphOutput"},
		},
		{
			{"osc", "output", "flt", "input"},
			{"lfo", "output", "flt", "input_cutoff"},
			{"lfo", "output", "out", "input"},
			{"flt", "output", "dly", "input"},
			{"dly", "output", "out", "input"},
		},
	)
	defer delete(g.nodes)
	bus, _, found := resolve_domains(t, &g)
	defer delete(bus)

	testing.expect(t, bus["out"], "the GraphOutput is in the bus domain by propagation from the Delay")
	testing.expect(t, !found, "a GraphOutput edge is not a vote for either clock")
	testing.expect(t, !bus["lfo"], "the LFO must follow its per-voice filter, not the output node")
}

// =====================================================================
// hoist_bus_modulators — the mixed-domain conflict
// =====================================================================

@(test)
test_modulator_feeding_both_domains_is_a_conflict :: proc(t: ^testing.T) {
	// One LFO into a per-voice oscillator's pitch AND a post-Delay filter's
	// cutoff. There is no domain this node can live in, and picking one
	// silently is how the bug class survived: the wiring stays legal and the
	// emission stays plausible. compute_bus_domain turns this into a hard
	// error naming both consumers.
	g := bus_graph(
		{
			{id = "osc", type = "Oscillator"},
			{id = "dly", type = "Delay"},
			{id = "flt", type = "Filter"},
			{id = "lfo", type = "LFO"},
			{id = "out", type = "GraphOutput"},
		},
		{
			{"lfo", "output", "osc", "input_freq"},
			{"osc", "output", "dly", "input"},
			{"dly", "output", "flt", "input"},
			{"lfo", "output", "flt", "input_cutoff"},
			{"flt", "output", "out", "input"},
		},
	)
	defer delete(g.nodes)
	bus, conflict, found := resolve_domains(t, &g)
	defer delete(bus)

	testing.expect(t, found, "an LFO feeding both a per-voice and a bus node must be reported, never silently placed")
	testing.expect_value(t, conflict.node_id, "lfo")
	testing.expect_value(t, conflict.node_type, "LFO")
	// Both consumers are named because the user has to know WHICH two wires
	// to duplicate the modulator between.
	testing.expect_value(t, conflict.voice_consumer, "Oscillator(osc)")
	testing.expect_value(t, conflict.bus_consumer, "Filter(flt)")
	testing.expect(t, !bus["lfo"], "a conflicting node must not be hoisted; the caller exits instead")
}

@(test)
test_noise_feeding_both_domains_is_a_conflict :: proc(t: ^testing.T) {
	// Same rule for the other three hoistable types — Noise in particular,
	// because its per-voice PRNG seeding in _init is keyed off the same domain
	// map, so a half-placed Noise node would be seeded in one place and read
	// in another.
	g := bus_graph(
		{
			{id = "nz", type = "Noise"},
			{id = "vgain", type = "Gain"},
			{id = "rev", type = "Reverb"},
			{id = "bgain", type = "Gain"},
			{id = "out", type = "GraphOutput"},
		},
		{
			{"nz", "output", "vgain", "input"},
			{"vgain", "output", "rev", "input"},
			{"rev", "output", "bgain", "input"},
			{"nz", "output", "bgain", "input_gain"},
			{"bgain", "output", "out", "input"},
		},
	)
	defer delete(g.nodes)
	bus, conflict, found := resolve_domains(t, &g)
	defer delete(bus)

	testing.expect(t, found, "a Noise node feeding both domains must be reported")
	testing.expect_value(t, conflict.node_type, "Noise")
	testing.expect_value(t, conflict.voice_consumer, "Gain(vgain)")
	testing.expect_value(t, conflict.bus_consumer, "Gain(bgain)")
}
