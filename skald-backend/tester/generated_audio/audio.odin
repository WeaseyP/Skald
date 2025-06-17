package generated_audio

import "core:math"
import rand "core:math/rand"
import "core:time"
import "base:runtime"

Oscillator_2_State :: struct {
	phase: f32,
}

AudioProcessor :: struct {
	osc_2: Oscillator_2_State,
}

init_processor :: proc(p: ^AudioProcessor) {
}

process_sample :: proc(p: ^AudioProcessor, sample_rate: f32, time_in_samples: u64) -> (left: f32, right: f32) {
	node_4_out: f32
	node_1_out: f32
	node_2_out: f32
	node_3_out: f32

	// --- Instrument Node 4 ---
	// (sub) --- Oscillator Node 2 ---
	p.osc_2.phase += 2 * math.PI * (440.0) / sample_rate;
	if p.osc_2.phase > 2 * math.PI { p.osc_2.phase -= 2 * math.PI; }
	node_2_out = f32(((p.osc_2.phase / math.PI) - 1.0) * (0.500));
	// (sub) --- ADSR Node 1 ---
	attack_samples_1  := u64(0.1000 * sample_rate);
	decay_samples_1   := u64(0.2000 * sample_rate);
	note_samples_1    := u64(1.0000 * sample_rate);
	envelope_1: f32 = 0.0;
	if time_in_samples < attack_samples_1 { envelope_1 = f32(time_in_samples) / f32(attack_samples_1); } else if time_in_samples < attack_samples_1 + decay_samples_1 { time_after_attack_1 := f32(time_in_samples - attack_samples_1); envelope_1 = 1.0 - (time_after_attack_1 / f32(decay_samples_1) * (1.0 - 0.5000)); } else if time_in_samples < note_samples_1 { envelope_1 = 0.5000; } else { envelope_1 = 0.0; }
	node_1_out = (node_2_out) * envelope_1;
	// --- End Instrument Node ---

	node_3_out = node_4_out;
	return node_3_out, node_3_out;
}
