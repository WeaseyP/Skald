package generated_audio

import "core:math"

// --- Voice State (Default) ---
Voice_State_Default :: struct {
	osc_2_phase: [1]f32,
	adsr_3_stage: ADSR_Stage,
	adsr_3_level_at_release: f32,
	filter_4_low: f32,
	filter_4_band: f32,
}

Voice_Default :: struct {
	is_active: bool,
	note: u8,
	target_freq: f32,
	current_freq: f32, // For glide
	time_active: f32,
	time_released: f32,
	velocity: f32, // Added for MIDI Node support
	state: Voice_State_Default,
}

AudioProcessor_Default :: struct {
	voices: [8]Voice_Default,
	next_voice_index: int,

	// Instrument Parameters
	attack:           f32,
	decay:            f32,
	sustain:          f32,
	release:          f32,
}

// Track: sax (Target Node: 1)
track_Default_sax_events := [?]Note_Event{
	{ note = 60, velocity = 1.000, start_time = 0.000, duration = 0.750 },
	{ note = 60, velocity = 1.000, start_time = 0.500, duration = 0.250 },
	{ note = 60, velocity = 1.000, start_time = 1.000, duration = 0.250 },
}

// --- Note On/Off Handlers (Default) ---
note_on_Default :: proc(p: ^AudioProcessor_Default, note: u8, velocity: f32) {
	// Simple 'next available' voice stealing
	voice := &p.voices[p.next_voice_index];
	p.next_voice_index = (p.next_voice_index + 1) % 8;

	voice.is_active = true;
	voice.note = note;
	voice.target_freq = 440.0 * math.pow(2.0, (f32(note) - 69.0) / 12.0);
	voice.time_active = 0.0;
	voice.velocity = velocity;
	voice.time_released = 0.0;

	// Trigger ADSR envelopes
	voice.state.adsr_3_stage = .Attack;
}

note_off_Default :: proc(p: ^AudioProcessor_Default, note: u8) {
	for i in 0..<8 {
		voice := &p.voices[i];
		if voice.is_active && voice.note == note {
			voice.time_released = voice.time_active;
			voice.state.adsr_3_stage = .Release;
		}
	}
}

init_Default :: proc(p: ^AudioProcessor_Default) {
	// Initialize default instrument parameters on the processor
	p.attack = 0.040;
	p.decay = 0.213;
	p.sustain = 0.388;
	p.release = 0.293;

}

// Processes a single voice
process_voice_Default :: proc(p: ^AudioProcessor_Default, voice: ^Voice_Default, sample_rate: f32) -> f32 {
	node_1_out_pitch: f32;
	node_1_out_gate: f32;
	node_1_out_velocity: f32;
	node_2_out: f32;
	node_3_out: f32;
	node_4_out: f32;
	node_5_out: f32;
	node_6_out: f32;
	node_7_out: f32;

	glide_coeff := 1.0 - math.exp(-1.0 / (sample_rate * (0.050) + 0.0001));
	voice.current_freq += (voice.target_freq - voice.current_freq) * glide_coeff;

		// --- MIDI Input Node 1 ---
		node_1_out_pitch = voice.current_freq;
		node_1_out_gate = 1.0;
		node_1_out_velocity = voice.velocity;

		// --- Oscillator Node 2 (Unison/Detune) ---
		{
			unison_out: f32 = 0.0;
			unison_count := 1;
			for i in 0..<unison_count {
				detune_amount: f32 = 0.0;
				if unison_count > 1 do detune_amount = (f32(i) / (f32(unison_count) - 1.0) - 0.5) * 2.0 * (5.000);
				detuned_freq := ((440.000) + (node_1_out)) * math.pow(2.0, detune_amount / 1200.0);
				phase_rads := f32(0.000) * (f32(math.PI) / 180.0);
				voice.state.osc_2_phase[i] = math.mod(voice.state.osc_2_phase[i] + (2 * f32(math.PI) * detuned_freq / sample_rate), 2 * f32(math.PI));
				final_phase := voice.state.osc_2_phase[i] + phase_rads;
				switch "Sawtooth" {
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
			if unison_count > 0 do node_2_out = (unison_out / f32(unison_count)) * (0.608);
		}

		// --- ADSR Node 3 ---
		{
			envelope: f32 = 0.0;
			switch voice.state.adsr_3_stage {
			case .Idle:
				envelope = 0.0;
			case .Attack:
				if p.attack > 0 do envelope = voice.time_active / p.attack; else do envelope = 1.0;
				voice.state.adsr_3_level_at_release = envelope;
				if voice.time_active >= p.attack {
					voice.state.adsr_3_stage = .Decay;
				}
			case .Decay:
				time_in_decay := voice.time_active - p.attack;
				if p.decay > 0 do envelope = 1.0 - (time_in_decay / p.decay) * (1.0 - p.sustain); else do envelope = p.sustain;
				voice.state.adsr_3_level_at_release = envelope;
				if time_in_decay >= p.decay {
					voice.state.adsr_3_stage = .Sustain;
				}
			case .Sustain:
				envelope = p.sustain;
				voice.state.adsr_3_level_at_release = envelope;
			case .Release:
				time_in_release := voice.time_active - voice.time_released;
				if p.release > 0 do envelope = voice.state.adsr_3_level_at_release * (1.0 - (time_in_release / p.release)); else do envelope = 0.0;
				if envelope <= 0 {
					envelope = 0;
					voice.is_active = false;
				}
			}
			node_3_out = (node_1_out) * envelope * (1.000);
		}

		// --- Filter Node 4 (SVF) ---
		{
			f_4 := f32(2.0 * math.sin(f32(math.PI) * ((833.739) + (node_2_out)) / sample_rate));
			q_4 := f32(1.0 / (2.023));
			voice.state.filter_4_low += f_4 * voice.state.filter_4_band;
			high_4 := f32((0.0) - voice.state.filter_4_low - q_4 * voice.state.filter_4_band);
			voice.state.filter_4_band += f_4 * high_4;
			node_4_out = voice.state.filter_4_low;
		}

		// --- Distortion Node 5 ---
		node_5_out = math.tanh((node_4_out) * (25.000));

		// --- Gain Node 6 ---
		node_6_out = (node_5_out) * ((0.800) + (node_3_out));

	return node_6_out;
}

// --- Main Processing Function (Default) ---
process_Default :: proc(p: ^AudioProcessor_Default, sample_rate: f32, time: u64) -> (left: f32, right: f32) {
	// Check Events for track: mid
	for event in track_Default_mid_events {
		event_start_sample := u64(event.start_time * sample_rate);
		if time == event_start_sample do note_on_Default(p, event.note, event.velocity);
		event_end_sample := u64((event.start_time + event.duration) * sample_rate);
		if time == event_end_sample do note_off_Default(p, event.note);
	}

	output_left: f32 = 0.0;
	output_right: f32 = 0.0;
	for i in 0..<8 {
		voice := &p.voices[i];
		if voice.is_active {
			mono_out := process_voice_Default(p, voice, sample_rate);
			output_left += mono_out;
			output_right += mono_out;
			voice.time_active += 1.0 / sample_rate;
		}
	}
	return output_left, output_right;
}
