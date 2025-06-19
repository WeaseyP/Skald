package generated_audio

import "core:math"
import "core:time"
import "base:runtime"

Oscillator_1_State :: struct {
	phase: f32,
}

AudioProcessor :: struct {
	// --- Exposed Parameters ---
	node_1_frequency: f32,
	node_1_amplitude: f32,

	// --- Internal State ---
	osc_1: Oscillator_1_State,
}

init_processor :: proc(p: ^AudioProcessor) {
	// Initialize exposed parameters to their defaults
	p.node_1_frequency = 440.000;
	p.node_1_amplitude = 0.500;
}

// --- Public Setter Functions ---
set_node_1_frequency :: proc(p: ^AudioProcessor, value: f32) {
	p.node_1_frequency = value;
}

set_node_1_amplitude :: proc(p: ^AudioProcessor, value: f32) {
	p.node_1_amplitude = value;
}

process_sample :: proc(p: ^AudioProcessor, sample_rate: f32, time_in_samples: u64) -> (left: f32, right: f32) {
	node_1_out: f32;
	node_2_out: f32;

	// --- Oscillator Node 1 ---
	p.osc_1.phase += 2 * math.PI * (440.000) / sample_rate;
	if p.osc_1.phase > 2 * math.PI { p.osc_1.phase -= 2 * math.PI; }
	node_1_out = f32(((p.osc_1.phase / math.PI) - 1.0) * (0.500));

	return node_1_out, node_1_out;
}
