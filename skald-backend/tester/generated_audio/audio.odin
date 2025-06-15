package generated_audio

import "core:math"

Oscillator_1_State :: struct {
	phase: f32,
}

AudioProcessor :: struct {
	osc_1: Oscillator_1_State,
}

process_sample :: proc(p: ^AudioProcessor, sample_rate: f32) -> (left: f32, right: f32) {
	node_1_out: f32
	node_2_out: f32

	// --- Oscillator Node 1 ---
	p.osc_1.phase += 2 * math.PI * 240.990 / sample_rate;
	if p.osc_1.phase > 2 * math.PI { p.osc_1.phase -= 2 * math.PI; }
	node_1_out = f32(((p.osc_1.phase / math.PI) - 1.0) * 0.300);

	node_2_out = node_1_out;
	return node_2_out, node_2_out;
}
