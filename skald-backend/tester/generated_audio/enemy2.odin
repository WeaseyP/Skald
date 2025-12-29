package generated_audio

import "core:math"

// --- Voice State (Enemy2) ---
Voice_State_Enemy2 :: struct {
	osc_10_phase: [1]f32,
	filter_12_low: f32,
	filter_12_band: f32,
	adsr_11_stage: ADSR_Stage,
	adsr_11_level_at_release: f32,
}

Voice_Enemy2 :: struct {
	is_active: bool,
	note: u8,
	target_freq: f32,
	current_freq: f32, // For glide
	time_active: f32,
	time_released: f32,
	state: Voice_State_Enemy2,
}

AudioProcessor_Enemy2 :: struct {
	voices: [4]Voice_Enemy2,
	next_voice_index: int,

	// Instrument Parameters
	attack:           f32,
	decay:            f32,
	sustain:          f32,
	release:          f32,
}

// Track: Enemy 2 Bass (Target Node: 1)
track_Enemy2_Enemy_2_Bass_events := [?]Note_Event{
	{ note = 36, velocity = 0.900, start_time = 0.000, duration = 0.400 },
	{ note = 36, velocity = 0.800, start_time = 0.500, duration = 0.400 },
	{ note = 38, velocity = 0.800, start_time = 1.000, duration = 0.400 },
	{ note = 31, velocity = 0.900, start_time = 1.500, duration = 0.400 },
}

// --- Note On/Off Handlers (Enemy2) ---
note_on_Enemy2 :: proc(p: ^AudioProcessor_Enemy2, note: u8, velocity: f32) {
	// Simple 'next available' voice stealing
	voice := &p.voices[p.next_voice_index];
	p.next_voice_index = (p.next_voice_index + 1) % 4;

	voice.is_active = true;
	voice.note = note;
	voice.target_freq = 440.0 * math.pow(2.0, (f32(note) - 69.0) / 12.0);
	voice.time_active = 0.0;
	voice.time_released = 0.0;

	// Trigger ADSR envelopes
	voice.state.adsr_11_stage = .Attack;
}

note_off_Enemy2 :: proc(p: ^AudioProcessor_Enemy2, note: u8) {
	for i in 0..<4 {
		voice := &p.voices[i];
		if voice.is_active && voice.note == note {
			voice.time_released = voice.time_active;
			voice.state.adsr_11_stage = .Release;
		}
	}
}

init_Enemy2 :: proc(p: ^AudioProcessor_Enemy2) {
	// Initialize default instrument parameters on the processor
	p.attack = 0.050;
	p.decay = 0.200;
	p.sustain = 0.600;
	p.release = 0.200;

}

// Processes a single voice
process_voice_Enemy2 :: proc(p: ^AudioProcessor_Enemy2, voice: ^Voice_Enemy2, sample_rate: f32) -> f32 {
	node_10_out: f32;
	node_12_out: f32;
	node_11_out: f32;
	node_13_out: f32;

	glide_coeff := 1.0 - math.exp(-1.0 / (sample_rate * (0.050) + 0.0001));
	voice.current_freq += (voice.target_freq - voice.current_freq) * glide_coeff;

		// --- Oscillator Node 10 (Unison/Detune) ---
		{
			unison_out: f32 = 0.0;
			unison_count := 1;
			for i in 0..<unison_count {
				detune_amount: f32 = 0.0;
				if unison_count > 1 do detune_amount = (f32(i) / (f32(unison_count) - 1.0) - 0.5) * 2.0 * (5.000);
				detuned_freq := (0.500) * math.pow(2.0, detune_amount / 1200.0);
				phase_rads := f32(0.000) * (f32(math.PI) / 180.0);
				voice.state.osc_10_phase[i] = math.mod(voice.state.osc_10_phase[i] + (2 * f32(math.PI) * detuned_freq / sample_rate), 2 * f32(math.PI));
				final_phase := voice.state.osc_10_phase[i] + phase_rads;
				switch "Square" {
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
			if unison_count > 0 do node_10_out = (unison_out / f32(unison_count)) * (0.500);
		}

		// --- Filter Node 12 (SVF) ---
		{
			f_12 := f32(2.0 * math.sin(f32(math.PI) * (800.000) / sample_rate));
			q_12 := f32(1.0 / (1.000));
			voice.state.filter_12_low += f_12 * voice.state.filter_12_band;
			high_12 := f32((node_10_out) - voice.state.filter_12_low - q_12 * voice.state.filter_12_band);
			voice.state.filter_12_band += f_12 * high_12;
			node_12_out = voice.state.filter_12_low;
		}

		// --- ADSR Node 11 ---
		{
			envelope: f32 = 0.0;
			switch voice.state.adsr_11_stage {
			case .Idle:
				envelope = 0.0;
			case .Attack:
				if p.attack > 0 do envelope = voice.time_active / p.attack; else do envelope = 1.0;
				voice.state.adsr_11_level_at_release = envelope;
				if voice.time_active >= p.attack {
					voice.state.adsr_11_stage = .Decay;
				}
			case .Decay:
				time_in_decay := voice.time_active - p.attack;
				if p.decay > 0 do envelope = 1.0 - (time_in_decay / p.decay) * (1.0 - p.sustain); else do envelope = p.sustain;
				voice.state.adsr_11_level_at_release = envelope;
				if time_in_decay >= p.decay {
					voice.state.adsr_11_stage = .Sustain;
				}
			case .Sustain:
				envelope = p.sustain;
				voice.state.adsr_11_level_at_release = envelope;
			case .Release:
				time_in_release := voice.time_active - voice.time_released;
				if p.release > 0 do envelope = voice.state.adsr_11_level_at_release * (1.0 - (time_in_release / p.release)); else do envelope = 0.0;
				if envelope <= 0 {
					envelope = 0;
					voice.is_active = false;
				}
			}
			node_11_out = (node_12_out) * envelope * (1.000);
		}

	return node_11_out;
}

// --- Main Processing Function (Enemy2) ---
process_Enemy2 :: proc(p: ^AudioProcessor_Enemy2, sample_rate: f32, time: u64) -> (left: f32, right: f32) {
	// Check Events for track: Enemy 2 Bass
	for event in track_Enemy2_Enemy_2_Bass_events {
		event_start_sample := u64(event.start_time * sample_rate);
		if time == event_start_sample do note_on_Enemy2(p, event.note, event.velocity);
		event_end_sample := u64((event.start_time + event.duration) * sample_rate);
		if time == event_end_sample do note_off_Enemy2(p, event.note);
	}

	output_left: f32 = 0.0;
	output_right: f32 = 0.0;
	for i in 0..<4 {
		voice := &p.voices[i];
		if voice.is_active {
			mono_out := process_voice_Enemy2(p, voice, sample_rate);
			output_left += mono_out;
			output_right += mono_out;
			voice.time_active += 1.0 / sample_rate;
		}
	}
	return output_left, output_right;
}
