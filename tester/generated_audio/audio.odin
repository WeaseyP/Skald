package generated_audio

import "core:math"

Oscillator_1_State :: struct {
	phase: f32,
}

Filter_3_State :: struct {
	z1: f32, // Stores the previous output sample for the IIR filter
}

AudioProcessor :: struct {
	osc_1: Oscillator_1_State,
	filter_3: Filter_3_State,
}

process_sample :: proc(p: ^AudioProcessor, sample_rate: f32) -> (left: f32, right: f32) {
	node_1_out: f32
	node_3_out: f32
	node_2_out: f32

	p.osc_1.phase += 2 * math.PI * 440.000 / sample_rate;
	if p.osc_1.phase > 2 * math.PI { p.osc_1.phase -= 2 * math.PI; }
	node_1_out = f32(((p.osc_1.phase / math.PI) - 1.0) * 0.300);

	// --- Filter Node 3 ---
	b_3 := f32(1.0 - math.exp(-2.0 * math.PI * 200.000 / sample_rate));
	p.filter_3.z1 = (node_1_out * b_3) + (p.filter_3.z1 * (1.0 - b_3));
	node_3_out = p.filter_3.z1;

	node_2_out = node_3_out;
	return node_2_out, node_2_out;
}
