package generated_audio

import "core:math"
import "core:time"
import "base:runtime"

Filter_2_State :: struct {
	z1: f32,
}

Oscillator_1_State :: struct {
	phase: f32,
}

Oscillator_4_State :: struct {
	phase: f32,
}

AudioProcessor :: struct {
	filter_2: Filter_2_State,
	osc_1: Oscillator_1_State,
	osc_4: Oscillator_4_State,
}

init_processor :: proc(p: ^AudioProcessor) {
}

process_sample :: proc(p: ^AudioProcessor, sample_rate: f32, time_in_samples: u64) -> (left: f32, right: f32) {
	node_3_out: f32;
	node_2_out: f32;
	node_1_out: f32;
	node_7_out: f32;
	node_5_out: f32;
	node_4_out: f32;

	// --- Instrument Node 7 ---
	// (sub) --- Oscillator Node 4 ---
	p.osc_4.phase += 2 * math.PI * (440.000) / sample_rate;
	if p.osc_4.phase > 2 * math.PI { p.osc_4.phase -= 2 * math.PI; }
	node_4_out = f32(((p.osc_4.phase / math.PI) - 1.0) * (0.500));
	// (sub) --- ADSR Node 3 ---
	attack_samples_3  := u64(0.1000 * sample_rate);
	decay_samples_3   := u64(0.0500 * sample_rate);
	note_samples_3    := u64(1.0000 * sample_rate);
	envelope_3: f32 = 0.0;
	if time_in_samples < attack_samples_3 { envelope_3 = f32(time_in_samples) / f32(attack_samples_3); } else if time_in_samples < attack_samples_3 + decay_samples_3 { time_after_attack_3 := f32(time_in_samples - attack_samples_3); envelope_3 = 1.0 - (time_after_attack_3 / f32(decay_samples_3) * (1.0 - 0.2500)); } else if time_in_samples < note_samples_3 { envelope_3 = 0.2500; } else { envelope_3 = 0.0; }
	node_3_out = (node_4_out) * envelope_3;
	// (sub) --- Oscillator Node 1 ---
	p.osc_1.phase += 2 * math.PI * (440.000) / sample_rate;
	if p.osc_1.phase > 2 * math.PI { p.osc_1.phase -= 2 * math.PI; }
	node_1_out = f32(((p.osc_1.phase / math.PI) - 1.0) * (node_3_out));
	// (sub) --- ADSR Node 2 ---
	attack_samples_2  := u64(0.0400 * sample_rate);
	decay_samples_2   := u64(0.1300 * sample_rate);
	note_samples_2    := u64(1.0000 * sample_rate);
	envelope_2: f32 = 0.0;
	if time_in_samples < attack_samples_2 { envelope_2 = f32(time_in_samples) / f32(attack_samples_2); } else if time_in_samples < attack_samples_2 + decay_samples_2 { time_after_attack_2 := f32(time_in_samples - attack_samples_2); envelope_2 = 1.0 - (time_after_attack_2 / f32(decay_samples_2) * (1.0 - 0.1300)); } else if time_in_samples < note_samples_2 { envelope_2 = 0.1300; } else { envelope_2 = 0.0; }
	node_2_out = (node_1_out) * envelope_2;
	// --- End Instrument Node 7 ---

	return node_2_out, node_2_out;
}
