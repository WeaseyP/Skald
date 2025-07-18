package generated_audio

import "core:math"

// --- Voice State (Generated from Instrument subgraph) ---
Voice_State :: struct {
	osc_2_phase: [1]f32,
	osc_3_phase: [1]f32,
	osc_1_phase: [1]f32,
}

Voice :: struct {
	is_active: bool,
	note: u8,
	target_freq: f32,
	current_freq: f32, // For glide
	time_active: f32,
	time_released: f32,
	state: Voice_State,
}

AudioProcessor :: struct {
	voices: [8]Voice,
	next_voice_index: int,

	// Global Effects State
	delay_5_buffer: [96000]f32,
	delay_5_write_index: int,
}

// --- Note On/Off Handlers ---
note_on :: proc(p: ^AudioProcessor, note: u8, velocity: f32) {
	// Simple 'next available' voice stealing
	voice := &p.voices[p.next_voice_index];
	p.next_voice_index = (p.next_voice_index + 1) % 8;

	voice.is_active = true;
	voice.note = note;
	voice.target_freq = 440.0 * math.pow(2.0, (f32(note) - 69.0) / 12.0);
	voice.time_active = 0.0;
	voice.time_released = 0.0;

}

note_off :: proc(p: ^AudioProcessor, note: u8) {
	for i in 0..<8 {
		voice := &p.voices[i];
		if voice.is_active && voice.note == note {
			voice.time_released = voice.time_active;
			voice.is_active = false;
		}
	}
}

init_processor :: proc(p: ^AudioProcessor) {
}

// Processes a single voice
process_voice :: proc(p: ^AudioProcessor, voice: ^Voice, sample_rate: f32) -> f32 {
	node_2_out: f32;
	node_3_out: f32;
	node_1_out: f32;
	node_4_out: f32;
	node_5_out: f32;
	node_6_out: f32;

	glide_coeff := 1.0 - math.exp(-1.0 / (sample_rate * (0.050) + 0.0001));
	voice.current_freq += (voice.target_freq - voice.current_freq) * glide_coeff;

		// --- Oscillator Node 2 (Unison/Detune) ---
		{
			unison_out: f32 = 0.0;
			unison_count := 1;
			for i in 0..<unison_count {
				detune_amount: f32 = 0.0;
				if unison_count > 1 do detune_amount = (f32(i) / (f32(unison_count) - 1.0) - 0.5) * 2.0 * (5.000);
				detuned_freq := (55.200) * math.pow(2.0, detune_amount / 1200.0);
				phase_rads := f32(0.000) * (f32(math.PI) / 180.0);
				voice.state.osc_2_phase[i] = math.mod(voice.state.osc_2_phase[i] + (2 * f32(math.PI) * detuned_freq / sample_rate), 2 * f32(math.PI));
				final_phase := voice.state.osc_2_phase[i] + phase_rads;
				switch "Sine" {
				case "Sawtooth":
					unison_out += ((final_phase / f32(math.PI)) - 1.0);
				case "Square":
					if math.sin(final_phase) > 0.500 do unison_out += 1.0; else do unison_out -= 1.0;
				case "Triangle":
					unison_out += (2.0 / f32(math.PI)) * math.asin(math.sin(final_phase));
				case:
					unison_out += math.sin(final_phase);
				}
			}
			if unison_count > 0 do node_2_out = (unison_out / f32(unison_count)) * (0.500);
		}

		// --- Oscillator Node 3 (Unison/Detune) ---
		{
			unison_out: f32 = 0.0;
			unison_count := 1;
			for i in 0..<unison_count {
				detune_amount: f32 = 0.0;
				if unison_count > 1 do detune_amount = (f32(i) / (f32(unison_count) - 1.0) - 0.5) * 2.0 * (5.000);
				detuned_freq := (82.400) * math.pow(2.0, detune_amount / 1200.0);
				phase_rads := f32(0.000) * (f32(math.PI) / 180.0);
				voice.state.osc_3_phase[i] = math.mod(voice.state.osc_3_phase[i] + (2 * f32(math.PI) * detuned_freq / sample_rate), 2 * f32(math.PI));
				final_phase := voice.state.osc_3_phase[i] + phase_rads;
				switch "Sine" {
				case "Sawtooth":
					unison_out += ((final_phase / f32(math.PI)) - 1.0);
				case "Square":
					if math.sin(final_phase) > 0.500 do unison_out += 1.0; else do unison_out -= 1.0;
				case "Triangle":
					unison_out += (2.0 / f32(math.PI)) * math.asin(math.sin(final_phase));
				case:
					unison_out += math.sin(final_phase);
				}
			}
			if unison_count > 0 do node_3_out = (unison_out / f32(unison_count)) * (0.500);
		}

		// --- Oscillator Node 1 (Unison/Detune) ---
		{
			unison_out: f32 = 0.0;
			unison_count := 1;
			for i in 0..<unison_count {
				detune_amount: f32 = 0.0;
				if unison_count > 1 do detune_amount = (f32(i) / (f32(unison_count) - 1.0) - 0.5) * 2.0 * (5.000);
				detuned_freq := (55.000) * math.pow(2.0, detune_amount / 1200.0);
				phase_rads := f32(0.000) * (f32(math.PI) / 180.0);
				voice.state.osc_1_phase[i] = math.mod(voice.state.osc_1_phase[i] + (2 * f32(math.PI) * detuned_freq / sample_rate), 2 * f32(math.PI));
				final_phase := voice.state.osc_1_phase[i] + phase_rads;
				switch "Sine" {
				case "Sawtooth":
					unison_out += ((final_phase / f32(math.PI)) - 1.0);
				case "Square":
					if math.sin(final_phase) > 0.500 do unison_out += 1.0; else do unison_out -= 1.0;
				case "Triangle":
					unison_out += (2.0 / f32(math.PI)) * math.asin(math.sin(final_phase));
				case:
					unison_out += math.sin(final_phase);
				}
			}
			if unison_count > 0 do node_1_out = (unison_out / f32(unison_count)) * (0.500);
		}

		// --- Mixer Node 4 ---
		{
			mix_sum_4: f32 = 0.0;
			mix_sum_4 += node_1_out * (0.750);
			mix_sum_4 += node_2_out * (0.750);
			mix_sum_4 += node_3_out * (0.750);
		node_4_out = mix_sum_4;
		}

		// --- Reverb Node 5 (Simple FDN) ---
		{
			delay_samples_5 := int(math.clamp((0.075) * sample_rate, 0, 96000-1));
			read_index_5 := (p.delay_5_write_index - delay_samples_5 + len(p.delay_5_buffer)) % len(p.delay_5_buffer);
			delayed_sample_5 := p.delay_5_buffer[read_index_5];
			p.delay_5_buffer[p.delay_5_write_index] = (node_4_out) + delayed_sample_5 * (10.000);
			p.delay_5_write_index = (p.delay_5_write_index + 1) % len(p.delay_5_buffer);
			node_5_out = (node_4_out) * (1.0 - (0.800)) + delayed_sample_5 * (0.800);
		}

	return node_5_out;
}

// --- Main Processing Function ---
process_sample :: proc(p: ^AudioProcessor, sample_rate: f32, time: u64) -> (left: f32, right: f32) {
	output_left: f32 = 0.0;
	output_right: f32 = 0.0;
	// NOTE: Event scheduling logic to trigger voices would go here, driven by a Note_Event array.
	for i in 0..<8 {
		voice := &p.voices[i];
		if voice.is_active {
			mono_out := process_voice(p, voice, sample_rate);
			output_left += mono_out;
			output_right += mono_out;
			voice.time_active += 1.0 / sample_rate;
		}
	}
	return output_left, output_right;
}
