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

	node_1_out = f32(math.sin(p.osc_1.phase) * 0.500);
	p.osc_1.phase += 2 * math.PI * 440.000 / sample_rate;
	if p.osc_1.phase > 2 * math.PI { p.osc_1.phase -= 2 * math.PI; }

	node_2_out = node_1_out;
	return node_2_out, node_2_out;
}
