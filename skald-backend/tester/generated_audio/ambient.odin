package generated_audio

import "core:math"

// --- Voice State (Ambient) ---
Voice_State_Ambient :: struct {
	osc_10_phase: [1]f32,
	adsr_11_stage: ADSR_Stage,
	adsr_11_level_at_release: f32,
}

Voice_Ambient :: struct {
	is_active: bool,
	note: u8,
	target_freq: f32,
	current_freq: f32, // For glide
	time_active: f32,
	time_released: f32,
	state: Voice_State_Ambient,
}

AudioProcessor_Ambient :: struct {
	voices: [2]Voice_Ambient,
	next_voice_index: int,

	// Instrument Parameters
	attack:           f32,
	decay:            f32,
	sustain:          f32,
	release:          f32,

	// Global Effects State
	delay_13_buffer: [96000]f32,
	delay_13_write_index: int,
}

// Track: Ambient Drone (Target Node: 1)
track_Ambient_Ambient_Drone_events := [?]Note_Event{
	{ note = 36, velocity = 0.500, start_time = 0.000, duration = 4.000 },
	{ note = 43, velocity = 0.400, start_time = 2.000, duration = 4.000 },
}

// --- Note On/Off Handlers (Ambient) ---
note_on_Ambient :: proc(p: ^AudioProcessor_Ambient, note: u8, velocity: f32) {
	// Simple 'next available' voice stealing
	voice := &p.voices[p.next_voice_index];
	p.next_voice_index = (p.next_voice_index + 1) % 2;

	voice.is_active = true;
	voice.note = note;
	voice.target_freq = 440.0 * math.pow(2.0, (f32(note) - 69.0) / 12.0);
	voice.time_active = 0.0;
	voice.time_released = 0.0;

	// Trigger ADSR envelopes
	voice.state.adsr_11_stage = .Attack;
}

note_off_Ambient :: proc(p: ^AudioProcessor_Ambient, note: u8) {
	for i in 0..<2 {
		voice := &p.voices[i];
		if voice.is_active && voice.note == note {
			voice.time_released = voice.time_active;
			voice.state.adsr_11_stage = .Release;
		}
	}
}

init_Ambient :: proc(p: ^AudioProcessor_Ambient) {
	// Initialize default instrument parameters on the processor
	p.attack = 1.000;
	p.decay = 2.000;
	p.sustain = 0.800;
	p.release = 2.000;

}

// Processes a single voice
process_voice_Ambient :: proc(p: ^AudioProcessor_Ambient, voice: ^Voice_Ambient, sample_rate: f32) -> f32 {
	node_10_out: f32;
	node_11_out: f32;
	node_13_out: f32;
	node_12_out: f32;

	glide_coeff := 1.0 - math.exp(-1.0 / (sample_rate * (0.050) + 0.0001));
	voice.current_freq += (voice.target_freq - voice.current_freq) * glide_coeff;

		// --- Oscillator Node 10 (Unison/Detune) ---
		{
			unison_out: f32 = 0.0;
			unison_count := 1;
			for i in 0..<unison_count {
				detune_amount: f32 = 0.0;
				if unison_count > 1 do detune_amount = (f32(i) / (f32(unison_count) - 1.0) - 0.5) * 2.0 * (5.000);
				detuned_freq := (1.000) * math.pow(2.0, detune_amount / 1200.0);
				phase_rads := f32(0.000) * (f32(math.PI) / 180.0);
				voice.state.osc_10_phase[i] = math.mod(voice.state.osc_10_phase[i] + (2 * f32(math.PI) * detuned_freq / sample_rate), 2 * f32(math.PI));
				final_phase := voice.state.osc_10_phase[i] + phase_rads;
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
			if unison_count > 0 do node_10_out = (unison_out / f32(unison_count)) * (0.500);
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
			node_11_out = (node_10_out) * envelope * (1.000);
		}

		// --- Reverb Node 13 (Simple FDN) ---
		{
			delay_samples_13 := int(math.clamp((0.075) * sample_rate, 0, 96000-1));
			read_index_13 := (p.delay_13_write_index - delay_samples_13 + len(p.delay_13_buffer)) % len(p.delay_13_buffer);
			delayed_sample_13 := p.delay_13_buffer[read_index_13];
			p.delay_13_buffer[p.delay_13_write_index] = (node_11_out) + delayed_sample_13 * (0.800);
			p.delay_13_write_index = (p.delay_13_write_index + 1) % len(p.delay_13_buffer);
			node_13_out = (node_11_out) * (1.0 - (0.600)) + delayed_sample_13 * (0.600);
		}

	return node_13_out;
}

// --- Main Processing Function (Ambient) ---
process_Ambient :: proc(p: ^AudioProcessor_Ambient, sample_rate: f32, time: u64) -> (left: f32, right: f32) {
	// Check Events for track: Ambient Drone
	for event in track_Ambient_Ambient_Drone_events {
		event_start_sample := u64(event.start_time * sample_rate);
		if time == event_start_sample do note_on_Ambient(p, event.note, event.velocity);
		event_end_sample := u64((event.start_time + event.duration) * sample_rate);
		if time == event_end_sample do note_off_Ambient(p, event.note);
	}

	output_left: f32 = 0.0;
	output_right: f32 = 0.0;
	for i in 0..<2 {
		voice := &p.voices[i];
		if voice.is_active {
			mono_out := process_voice_Ambient(p, voice, sample_rate);
			output_left += mono_out;
			output_right += mono_out;
			voice.time_active += 1.0 / sample_rate;
		}
	}
	return output_left, output_right;
}
