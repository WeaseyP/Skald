package generated_audio

import "core:math"

// --- Voice State (Enemy4) ---
Voice_State_Enemy4 :: struct {
	noise_10_rng: PRNG_State,
	filter_13_low: f32,
	filter_13_band: f32,
	adsr_11_stage: ADSR_Stage,
	adsr_11_level_at_release: f32,
}

Voice_Enemy4 :: struct {
	is_active: bool,
	note: u8,
	target_freq: f32,
	current_freq: f32, // For glide
	time_active: f32,
	time_released: f32,
	state: Voice_State_Enemy4,
}

AudioProcessor_Enemy4 :: struct {
	voices: [4]Voice_Enemy4,
	next_voice_index: int,

	// Instrument Parameters
	attack:           f32,
	decay:            f32,
	sustain:          f32,
	release:          f32,
}

// Track: Enemy 4 Percussion (Target Node: 1)
track_Enemy4_Enemy_4_Percussion_events := [?]Note_Event{
	{ note = 0, velocity = 1.000, start_time = 0.000, duration = 0.100 },
	{ note = 0, velocity = 0.800, start_time = 0.500, duration = 0.100 },
	{ note = 0, velocity = 1.000, start_time = 1.000, duration = 0.100 },
	{ note = 0, velocity = 0.800, start_time = 1.500, duration = 0.100 },
}

// --- Note On/Off Handlers (Enemy4) ---
note_on_Enemy4 :: proc(p: ^AudioProcessor_Enemy4, note: u8, velocity: f32) {
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

note_off_Enemy4 :: proc(p: ^AudioProcessor_Enemy4, note: u8) {
	for i in 0..<4 {
		voice := &p.voices[i];
		if voice.is_active && voice.note == note {
			voice.time_released = voice.time_active;
			voice.state.adsr_11_stage = .Release;
		}
	}
}

init_Enemy4 :: proc(p: ^AudioProcessor_Enemy4) {
	// Initialize default instrument parameters on the processor
	p.attack = 0.001;
	p.decay = 0.050;
	p.sustain = 0.000;
	p.release = 0.050;

	// Initialize individual voice states
	for i in 0..<4 {
		v := &p.voices[i];
		v.state.noise_10_rng.state = u32(i * 31 + 17) | 1;
	}
}

// Processes a single voice
process_voice_Enemy4 :: proc(p: ^AudioProcessor_Enemy4, voice: ^Voice_Enemy4, sample_rate: f32) -> f32 {
	node_10_out: f32;
	node_13_out: f32;
	node_11_out: f32;
	node_12_out: f32;

	glide_coeff := 1.0 - math.exp(-1.0 / (sample_rate * (0.050) + 0.0001));
	voice.current_freq += (voice.target_freq - voice.current_freq) * glide_coeff;

		// --- Noise Node 10 ---
		node_10_out = next_float32(&voice.state.noise_10_rng) * (1.000);

		// --- Filter Node 13 (SVF) ---
		{
			f_13 := f32(2.0 * math.sin(f32(math.PI) * (2000.000) / sample_rate));
			q_13 := f32(1.0 / (2.000));
			voice.state.filter_13_low += f_13 * voice.state.filter_13_band;
			high_13 := f32((node_10_out) - voice.state.filter_13_low - q_13 * voice.state.filter_13_band);
			voice.state.filter_13_band += f_13 * high_13;
			node_13_out = voice.state.filter_13_band;
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
			node_11_out = (node_13_out) * envelope * (1.000);
		}

	return node_11_out;
}

// --- Main Processing Function (Enemy4) ---
process_Enemy4 :: proc(p: ^AudioProcessor_Enemy4, sample_rate: f32, time: u64) -> (left: f32, right: f32) {
	// Check Events for track: Enemy 4 Percussion
	for event in track_Enemy4_Enemy_4_Percussion_events {
		event_start_sample := u64(event.start_time * sample_rate);
		if time == event_start_sample do note_on_Enemy4(p, event.note, event.velocity);
		event_end_sample := u64((event.start_time + event.duration) * sample_rate);
		if time == event_end_sample do note_off_Enemy4(p, event.note);
	}

	output_left: f32 = 0.0;
	output_right: f32 = 0.0;
	for i in 0..<4 {
		voice := &p.voices[i];
		if voice.is_active {
			mono_out := process_voice_Enemy4(p, voice, sample_rate);
			output_left += mono_out;
			output_right += mono_out;
			voice.time_active += 1.0 / sample_rate;
		}
	}
	return output_left, output_right;
}
