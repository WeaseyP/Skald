#+feature dynamic-literals
package skald_unit_tests

// =====================================================================
// Roadmap packet B8-3 / BUGS.md SKB-014 — exponent-port overdrive warning.
//
// Oscillator.input_freq, Wavetable.input_freq and FmOperator's
// input_carrier/input_freq are V/Oct exponential ports: the summed
// modulation reaches `math.pow(2.0, math.clamp(mod, -10.0, 10.0))`
// (codegen_nodes.odin). An authored source that can exceed +/-10 there is
// silently capped instead of erroring — the Kick "Pitch Env" ADSR shipped
// in four-bar-song.skald.json with `depth: 120` is exactly this, and it
// clamped to a fixed 1024x (2^10) pitch error with no diagnostic anywhere.
//
// core.exponent_source_peak(graph, src, plan) -> (peak: f64, ok: bool) is
// the pure predicate under test: the provable peak magnitude a modulation
// source can contribute, or ok=false when nothing here can be bounded
// without runtime information (an exposed/P-locked param, or an ADSR whose
// own `input` is wired to something of unknown magnitude). warn_exponent_
// port_overdrive itself only calls fmt.eprintf and is not tested
// in-process, matching this file's siblings (warn_dead_exposed_params,
// warn_unreachable_nodes) — their print wrappers are exercised end-to-end
// via a codegen_only golden fixture instead (see
// tests/fixtures/codegen_only/exponent_port_overdrive.json), and their
// pure logic is what is unit-tested here.
//
// Run (from skald-backend\):
//   odin test tests\unit
// =====================================================================

import core "../../core"
import "core:encoding/json"
import "core:fmt"
import "core:testing"

// --- helpers ---------------------------------------------------------
// bus_graph, node_with, node_with_id are declared in bus_domain_test.odin /
// param_ranges_test.odin / param_reachability_test.odin — same package.

plan_with_exposed :: proc(node_id: string, param: string) -> core.Instrument_Plan {
	plan: core.Instrument_Plan
	plan.exposed_resolutions = make(map[string]core.Exposed_Resolution)
	// Mirrors the "<node.id>::<param>" key every real caller builds
	// (get_f32_param, tail_param_worst_case) — duplicated here rather than
	// imported so a future rename of the key format breaks this test too.
	full_key := fmt.tprintf("%s::%s", node_id, param)
	plan.exposed_resolutions[full_key] = core.Exposed_Resolution{field_name = param, param_name = param, node_id = node_id}
	return plan
}

// =====================================================================
// ADSR — node_out = input * envelope * depth * vel_scale; envelope and
// vel_scale are each in [0,1], so with `input` unwired the peak is exactly
// |depth|.
// =====================================================================

@(test)
test_adsr_peak_equals_abs_depth_when_unwired :: proc(t: ^testing.T) {
	adsr := node_with_id("pitch_env", "ADSR", json.Object{"depth" = json.Float(120.0)})
	g := bus_graph([]core.Node{adsr}, []core.Connection{})
	peak, ok := core.exponent_source_peak(&g, adsr, nil)
	testing.expect(t, ok, "an unwired ADSR with a literal depth must be provable")
	testing.expectf(t, peak == 120.0, "expected peak 120.0 (SKB-014's Kick depth), got %v", peak)
}

@(test)
test_adsr_peak_defaults_to_one_when_depth_absent :: proc(t: ^testing.T) {
	adsr := node_with_id("a1", "ADSR", json.Object{})
	g := bus_graph([]core.Node{adsr}, []core.Connection{})
	peak, ok := core.exponent_source_peak(&g, adsr, nil)
	testing.expect(t, ok, "an ADSR with no authored depth must still be provable (default 1.0)")
	testing.expectf(t, peak == 1.0, "expected default peak 1.0, got %v", peak)
}

@(test)
test_adsr_peak_unprovable_when_input_is_wired :: proc(t: ^testing.T) {
	// Something of unknown magnitude feeding ADSR.input breaks the
	// envelope*vel_scale<=1 bound this proc relies on.
	upstream := node_with_id("up", "Filter", json.Object{})
	adsr := node_with_id("a1", "ADSR", json.Object{"depth" = json.Float(5.0)})
	conns := []core.Connection{{from_node = "up", from_port = "output", to_node = "a1", to_port = "input"}}
	g := bus_graph([]core.Node{upstream, adsr}, conns)
	_, ok := core.exponent_source_peak(&g, adsr, nil)
	testing.expect(t, !ok, "an ADSR with a wired `input` must not be treated as provable, regardless of depth")
}

@(test)
test_adsr_peak_unprovable_when_depth_is_exposed :: proc(t: ^testing.T) {
	adsr := node_with_id("a1", "ADSR", json.Object{"depth" = json.Float(5.0)})
	g := bus_graph([]core.Node{adsr}, []core.Connection{})
	plan := plan_with_exposed("a1", "depth")
	defer delete(plan.exposed_resolutions)
	_, ok := core.exponent_source_peak(&g, adsr, &plan)
	testing.expect(t, !ok, "an exposed ADSR depth is runtime-settable, so its authored literal is not a ceiling")
}

// =====================================================================
// Mapper — node_out = lerp(outMin, outMax, clamp(t, 0, 1)), which stays
// within [outMin, outMax] for ANY value of the mapped input.
// =====================================================================

@(test)
test_mapper_peak_is_larger_abs_of_outmin_outmax :: proc(t: ^testing.T) {
	mapper := node_with_id("m1", "Mapper", json.Object{"outMin" = json.Float(-2.0), "outMax" = json.Float(15.0)})
	g := bus_graph([]core.Node{mapper}, []core.Connection{})
	peak, ok := core.exponent_source_peak(&g, mapper, nil)
	testing.expect(t, ok, "a Mapper with literal outMin/outMax must be provable")
	testing.expectf(t, peak == 15.0, "expected peak 15.0 (|outMax| > |outMin|), got %v", peak)

	mapper2 := node_with_id("m2", "Mapper", json.Object{"outMin" = json.Float(-20.0), "outMax" = json.Float(5.0)})
	g2 := bus_graph([]core.Node{mapper2}, []core.Connection{})
	peak2, ok2 := core.exponent_source_peak(&g2, mapper2, nil)
	testing.expect(t, ok2, "a Mapper with a negative outMin must still be provable")
	testing.expectf(t, peak2 == 20.0, "expected peak 20.0 (|outMin| > |outMax|), got %v", peak2)
}

@(test)
test_mapper_peak_defaults_when_out_range_absent :: proc(t: ^testing.T) {
	mapper := node_with_id("m1", "Mapper", json.Object{})
	g := bus_graph([]core.Node{mapper}, []core.Connection{})
	peak, ok := core.exponent_source_peak(&g, mapper, nil)
	testing.expect(t, ok, "a Mapper with no authored outMin/outMax must still be provable (defaults 0.0/1.0)")
	testing.expectf(t, peak == 1.0, "expected default peak 1.0, got %v", peak)
}

@(test)
test_mapper_peak_unprovable_when_out_max_is_exposed :: proc(t: ^testing.T) {
	mapper := node_with_id("m1", "Mapper", json.Object{"outMin" = json.Float(0.0), "outMax" = json.Float(3000.0)})
	g := bus_graph([]core.Node{mapper}, []core.Connection{})
	plan := plan_with_exposed("m1", "outMax")
	defer delete(plan.exposed_resolutions)
	_, ok := core.exponent_source_peak(&g, mapper, &plan)
	testing.expect(t, !ok, "an exposed outMax's declared range (param_ranges.odin: +/-1e6) must not be treated as a provable peak — that would fire on nearly every exposed Mapper")
}

// =====================================================================
// LFO — node_out = amplitude * waveform(phase); every waveform is within
// [-1, 1], so the peak is exactly |amplitude|. LFO has no audio-rate input
// port (graph_validate.odin has no LFO case in valid_input_ports).
// =====================================================================

@(test)
test_lfo_peak_is_abs_amplitude :: proc(t: ^testing.T) {
	lfo := node_with_id("l1", "LFO", json.Object{"amplitude" = json.Float(-15.0)})
	g := bus_graph([]core.Node{lfo}, []core.Connection{})
	peak, ok := core.exponent_source_peak(&g, lfo, nil)
	testing.expect(t, ok, "an LFO with a literal amplitude must be provable")
	testing.expectf(t, peak == 15.0, "expected peak 15.0 (abs of -15.0), got %v", peak)
}

@(test)
test_lfo_peak_defaults_to_one_when_amplitude_absent :: proc(t: ^testing.T) {
	lfo := node_with_id("l1", "LFO", json.Object{})
	g := bus_graph([]core.Node{lfo}, []core.Connection{})
	peak, ok := core.exponent_source_peak(&g, lfo, nil)
	testing.expect(t, ok, "an LFO with no authored amplitude must still be provable (default 1.0)")
	testing.expectf(t, peak == 1.0, "expected default peak 1.0, got %v", peak)
}

@(test)
test_lfo_peak_unprovable_when_amplitude_is_exposed :: proc(t: ^testing.T) {
	lfo := node_with_id("l1", "LFO", json.Object{"amplitude" = json.Float(15.0)})
	g := bus_graph([]core.Node{lfo}, []core.Connection{})
	plan := plan_with_exposed("l1", "amplitude")
	defer delete(plan.exposed_resolutions)
	_, ok := core.exponent_source_peak(&g, lfo, &plan)
	testing.expect(t, !ok, "an exposed LFO amplitude is runtime-settable and must not be treated as a provable peak")
}

// =====================================================================
// Unmodeled source types — a node type this proc does not model (an
// Oscillator, a Filter, ...) must never be claimed provable. Silence here
// is the deliberate "stay silent where you cannot prove it" half of B8-3,
// not an oversight.
// =====================================================================

@(test)
test_unmodeled_source_type_is_never_provable :: proc(t: ^testing.T) {
	for ty in ([]string{"Oscillator", "Filter", "Gain", "Noise", "SampleHold", "MidiInput", "FmOperator", "Wavetable"}) {
		src := node_with_id("s1", ty, json.Object{})
		g := bus_graph([]core.Node{src}, []core.Connection{})
		_, ok := core.exponent_source_peak(&g, src, nil)
		testing.expectf(t, !ok, "%s is not modeled by exponent_source_peak and must report unprovable, not a guessed peak", ty)
	}
}
