package generated_audio

import "core:math"
import "core:math/rand"

PRNG_State :: struct {
	state: u32,
}

next_float32 :: proc(rng: ^PRNG_State) -> f32 {
	x := rng.state
	x ^= x << 13
	x ^= x >> 17
	x ^= x << 5
	rng.state = x
	return f32(x) / 4294967296.0
}

ADSR_Stage :: enum { Idle, Attack, Decay, Sustain, Release }

Note_Event :: struct {
	note: u8,
	velocity: f32,
	start_time: f32,
	duration: f32,
}

Kick_Voice_State :: struct {
	active: bool,
	note: u8,
	velocity: f32,
	age: f32,
	current_freq: f32,
	target_freq: f32,
	glide_time: f32,
	adsr_3_stage: ADSR_Stage,
	adsr_3_time: f32,
	adsr_3_value: f32,
	adsr_3_release_level: f32,
	adsr_2_stage: ADSR_Stage,
	adsr_2_time: f32,
	adsr_2_value: f32,
	adsr_2_release_level: f32,
	osc_1_phase: [1]f32,
}

Kick_Processor :: struct {
	sample_rate: f32,
	voices: [8]Kick_Voice_State,
	next_voice_idx: int,
	prng: PRNG_State,
}

Kick_init :: proc(p: ^Kick_Processor, sr: f32) {
	p.sample_rate = sr
	p.prng.state = 12345
}

Kick_note_on :: proc(p: ^Kick_Processor, note: u8, velocity: f32) {
	voice_idx := -1
	for i in 0..<8 {
		if !p.voices[i].active {
			voice_idx = i
			break
		}
	}
	if voice_idx == -1 {
		voice_idx = p.next_voice_idx
		p.next_voice_idx = (p.next_voice_idx + 1) % 8
	}

	v := &p.voices[voice_idx]
	v.active = true
	v.note = note
	v.velocity = velocity
	v.age = 0.0
	freq := 440.0 * math.pow(2.0, (f32(note) - 69.0) / 12.0)
	v.target_freq = freq
	v.current_freq = freq
	v.glide_time = 0.050
	v.adsr_3_stage = .Attack
	v.adsr_3_time = 0.0
	v.adsr_3_value = 0.0
	v.adsr_2_stage = .Attack
	v.adsr_2_time = 0.0
	v.adsr_2_value = 0.0
}

Kick_note_off :: proc(p: ^Kick_Processor, note: u8) {
	for i in 0..<8 {
		if p.voices[i].active && p.voices[i].note == note {
			releasing := false
			p.voices[i].adsr_3_stage = .Release
			p.voices[i].adsr_3_release_level = p.voices[i].adsr_3_value
			p.voices[i].adsr_3_time = 0.0
			releasing = true
			p.voices[i].adsr_2_stage = .Release
			p.voices[i].adsr_2_release_level = p.voices[i].adsr_2_value
			p.voices[i].adsr_2_time = 0.0
			releasing = true
			if !releasing do p.voices[i].active = false
		}
	}
}

Kick_process :: proc(p: ^Kick_Processor) -> f32 {
	sample_rate := p.sample_rate
	output: f32 = 0.0
	for v_idx in 0..<8 {
		voice := &p.voices[v_idx]
		if !voice.active do continue

		node_3_out: f32 = 0.0
		node_2_out: f32 = 0.0
		node_1_out: f32 = 0.0
		node_5_out: f32 = 0.0
		node_4_out: f32 = 0.0

		// --- ADSR Node 2 ---
		{
			envelope: f32 = 0.0;
			switch voice.state.adsr_2_stage {
			case .Idle:
				envelope = 0.0;
			case .Attack:
				if p.attack > 0 do envelope = voice.time_active / p.attack; else do envelope = 1.0;
				voice.state.adsr_2_level_at_release = envelope;
				if voice.time_active >= p.attack {
					voice.state.adsr_2_stage = .Decay;
				}
			case .Decay:
				time_in_decay := voice.time_active - p.attack;
				if p.decay > 0 do envelope = 1.0 - (time_in_decay / p.decay) * (1.0 - p.sustain); else do envelope = p.sustain;
				voice.state.adsr_2_level_at_release = envelope;
				if time_in_decay >= p.decay {
					voice.state.adsr_2_stage = .Sustain;
				}
			case .Sustain:
				envelope = p.sustain;
				voice.state.adsr_2_level_at_release = envelope;
			case .Release:
				time_in_release := voice.time_active - voice.time_released;
				if p.release > 0 do envelope = voice.state.adsr_2_level_at_release * (1.0 - (time_in_release / p.release)); else do envelope = 0.0;
				if envelope <= 0 {
					envelope = 0;
					voice.is_active = false;
				}
			}
			node_2_out = (1.0) * envelope * (1.000);
		}

		// --- Oscillator Node 1 (Unison/Detune) ---
		{
			unison_out: f32 = 0.0;
			unison_count := 1;
			for i in 0..<unison_count {
				detune_amount: f32 = 0.0;
				if unison_count > 1 do detune_amount = (f32(i) / (f32(unison_count) - 1.0) - 0.5) * 2.0 * (5.000);
				detuned_freq := ((121.350) + (node_2_out)) * math.pow(2.0, detune_amount / 1200.0);
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

		// --- Distortion Node 4 ---
		node_4_out = math.tanh((node_3_out) * (5.000));

		output += node_4_out
	}
	return output
}
Snare_Drum_Voice_State :: struct {
	active: bool,
	note: u8,
	velocity: f32,
	age: f32,
	current_freq: f32,
	target_freq: f32,
	glide_time: f32,
	osc_3_phase: [1]f32,
	adsr_5_stage: ADSR_Stage,
	adsr_5_time: f32,
	adsr_5_value: f32,
	adsr_5_release_level: f32,
}

Snare_Drum_Processor :: struct {
	sample_rate: f32,
	voices: [8]Snare_Drum_Voice_State,
	next_voice_idx: int,
	prng: PRNG_State,
}

Snare_Drum_init :: proc(p: ^Snare_Drum_Processor, sr: f32) {
	p.sample_rate = sr
	p.prng.state = 12345
}

Snare_Drum_note_on :: proc(p: ^Snare_Drum_Processor, note: u8, velocity: f32) {
	voice_idx := -1
	for i in 0..<8 {
		if !p.voices[i].active {
			voice_idx = i
			break
		}
	}
	if voice_idx == -1 {
		voice_idx = p.next_voice_idx
		p.next_voice_idx = (p.next_voice_idx + 1) % 8
	}

	v := &p.voices[voice_idx]
	v.active = true
	v.note = note
	v.velocity = velocity
	v.age = 0.0
	freq := 440.0 * math.pow(2.0, (f32(note) - 69.0) / 12.0)
	v.target_freq = freq
	v.current_freq = freq
	v.glide_time = 0.050
	v.adsr_5_stage = .Attack
	v.adsr_5_time = 0.0
	v.adsr_5_value = 0.0
}

Snare_Drum_note_off :: proc(p: ^Snare_Drum_Processor, note: u8) {
	for i in 0..<8 {
		if p.voices[i].active && p.voices[i].note == note {
			releasing := false
			p.voices[i].adsr_5_stage = .Release
			p.voices[i].adsr_5_release_level = p.voices[i].adsr_5_value
			p.voices[i].adsr_5_time = 0.0
			releasing = true
			if !releasing do p.voices[i].active = false
		}
	}
}

Snare_Drum_process :: proc(p: ^Snare_Drum_Processor) -> f32 {
	sample_rate := p.sample_rate
	output: f32 = 0.0
	for v_idx in 0..<8 {
		voice := &p.voices[v_idx]
		if !voice.active do continue

		node_1_out: f32 = 0.0
		node_3_out: f32 = 0.0
		node_2_out: f32 = 0.0
		node_5_out: f32 = 0.0
		node_4_out: f32 = 0.0
		node_6_out: f32 = 0.0

		// --- Noise Node 1 ---
		node_1_out = next_float32(&voice.state.noise_1_rng) * (1.000);

		// --- Oscillator Node 3 (Unison/Detune) ---
		{
			unison_out: f32 = 0.0;
			unison_count := 1;
			for i in 0..<unison_count {
				detune_amount: f32 = 0.0;
				if unison_count > 1 do detune_amount = (f32(i) / (f32(unison_count) - 1.0) - 0.5) * 2.0 * (5.000);
				detuned_freq := (220.000) * math.pow(2.0, detune_amount / 1200.0);
				phase_rads := f32(0.000) * (f32(math.PI) / 180.0);
				voice.state.osc_3_phase[i] = math.mod(voice.state.osc_3_phase[i] + (2 * f32(math.PI) * detuned_freq / sample_rate), 2 * f32(math.PI));
				final_phase := voice.state.osc_3_phase[i] + phase_rads;
				switch "Triangle" {
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

		// --- Filter Node 4 (SVF) ---
		{
			f_4 := f32(2.0 * math.sin(f32(math.PI) * (2449.232) / sample_rate));
			q_4 := f32(1.0 / (0.593));
			voice.state.filter_4_low += f_4 * voice.state.filter_4_band;
			high_4 := f32((node_2_out) - voice.state.filter_4_low - q_4 * voice.state.filter_4_band);
			voice.state.filter_4_band += f_4 * high_4;
			node_4_out = voice.state.filter_4_low;
		}

		// --- ADSR Node 5 ---
		{
			envelope: f32 = 0.0;
			switch voice.state.adsr_5_stage {
			case .Idle:
				envelope = 0.0;
			case .Attack:
				if p.attack > 0 do envelope = voice.time_active / p.attack; else do envelope = 1.0;
				voice.state.adsr_5_level_at_release = envelope;
				if voice.time_active >= p.attack {
					voice.state.adsr_5_stage = .Decay;
				}
			case .Decay:
				time_in_decay := voice.time_active - p.attack;
				if p.decay > 0 do envelope = 1.0 - (time_in_decay / p.decay) * (1.0 - p.sustain); else do envelope = p.sustain;
				voice.state.adsr_5_level_at_release = envelope;
				if time_in_decay >= p.decay {
					voice.state.adsr_5_stage = .Sustain;
				}
			case .Sustain:
				envelope = p.sustain;
				voice.state.adsr_5_level_at_release = envelope;
			case .Release:
				time_in_release := voice.time_active - voice.time_released;
				if p.release > 0 do envelope = voice.state.adsr_5_level_at_release * (1.0 - (time_in_release / p.release)); else do envelope = 0.0;
				if envelope <= 0 {
					envelope = 0;
					voice.is_active = false;
				}
			}
			node_5_out = (node_4_out) * envelope * (1.000);
		}

		output += node_5_out
	}
	return output
}
sax_Voice_State :: struct {
	active: bool,
	note: u8,
	velocity: f32,
	age: f32,
	current_freq: f32,
	target_freq: f32,
	glide_time: f32,
	adsr_7_stage: ADSR_Stage,
	adsr_7_time: f32,
	adsr_7_value: f32,
	adsr_7_release_level: f32,
	osc_2_phase: [1]f32,
}

sax_Processor :: struct {
	sample_rate: f32,
	voices: [8]sax_Voice_State,
	next_voice_idx: int,
	prng: PRNG_State,
}

sax_init :: proc(p: ^sax_Processor, sr: f32) {
	p.sample_rate = sr
	p.prng.state = 12345
}

sax_note_on :: proc(p: ^sax_Processor, note: u8, velocity: f32) {
	voice_idx := -1
	for i in 0..<8 {
		if !p.voices[i].active {
			voice_idx = i
			break
		}
	}
	if voice_idx == -1 {
		voice_idx = p.next_voice_idx
		p.next_voice_idx = (p.next_voice_idx + 1) % 8
	}

	v := &p.voices[voice_idx]
	v.active = true
	v.note = note
	v.velocity = velocity
	v.age = 0.0
	freq := 440.0 * math.pow(2.0, (f32(note) - 69.0) / 12.0)
	v.target_freq = freq
	v.current_freq = freq
	v.glide_time = 0.050
	v.adsr_7_stage = .Attack
	v.adsr_7_time = 0.0
	v.adsr_7_value = 0.0
}

sax_note_off :: proc(p: ^sax_Processor, note: u8) {
	for i in 0..<8 {
		if p.voices[i].active && p.voices[i].note == note {
			releasing := false
			p.voices[i].adsr_7_stage = .Release
			p.voices[i].adsr_7_release_level = p.voices[i].adsr_7_value
			p.voices[i].adsr_7_time = 0.0
			releasing = true
			if !releasing do p.voices[i].active = false
		}
	}
}

sax_process :: proc(p: ^sax_Processor) -> f32 {
	sample_rate := p.sample_rate
	output: f32 = 0.0
	for v_idx in 0..<8 {
		voice := &p.voices[v_idx]
		if !voice.active do continue

		node_7_out: f32 = 0.0
		node_6_out: f32 = 0.0
		node_5_out: f32 = 0.0
		node_4_out: f32 = 0.0
		node_3_out: f32 = 0.0
		node_2_out: f32 = 0.0
		node_1_out: f32 = 0.0

		// Midi Input Node 6
		node_6_out = voice.velocity

		// --- Oscillator Node 2 (Unison/Detune) ---
		{
			unison_out: f32 = 0.0;
			unison_count := 1;
			for i in 0..<unison_count {
				detune_amount: f32 = 0.0;
				if unison_count > 1 do detune_amount = (f32(i) / (f32(unison_count) - 1.0) - 0.5) * 2.0 * (5.000);
				detuned_freq := ((440.000) + (node_6_out)) * math.pow(2.0, detune_amount / 1200.0);
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
			if unison_count > 0 do node_2_out = (unison_out / f32(unison_count)) * (0.500);
		}

		// --- ADSR Node 7 ---
		{
			envelope: f32 = 0.0;
			switch voice.state.adsr_7_stage {
			case .Idle:
				envelope = 0.0;
			case .Attack:
				if p.attack > 0 do envelope = voice.time_active / p.attack; else do envelope = 1.0;
				voice.state.adsr_7_level_at_release = envelope;
				if voice.time_active >= p.attack {
					voice.state.adsr_7_stage = .Decay;
				}
			case .Decay:
				time_in_decay := voice.time_active - p.attack;
				if p.decay > 0 do envelope = 1.0 - (time_in_decay / p.decay) * (1.0 - p.sustain); else do envelope = p.sustain;
				voice.state.adsr_7_level_at_release = envelope;
				if time_in_decay >= p.decay {
					voice.state.adsr_7_stage = .Sustain;
				}
			case .Sustain:
				envelope = p.sustain;
				voice.state.adsr_7_level_at_release = envelope;
			case .Release:
				time_in_release := voice.time_active - voice.time_released;
				if p.release > 0 do envelope = voice.state.adsr_7_level_at_release * (1.0 - (time_in_release / p.release)); else do envelope = 0.0;
				if envelope <= 0 {
					envelope = 0;
					voice.is_active = false;
				}
			}
			node_7_out = (node_6_out) * envelope * (1.000);
		}

		// --- Mapper Node 1 ---
		node_1_out = math.lerp(400.000, 3000.000, math.clamp(((node_6_out) - (0.000)) / ((1.000) - (0.000)), 0.0, 1.0));

		// --- Filter Node 3 (SVF) ---
		{
			f_3 := f32(2.0 * math.sin(f32(math.PI) * ((857.097) + (node_7_out)) / sample_rate));
			q_3 := f32(1.0 / (1.910));
			voice.state.filter_3_low += f_3 * voice.state.filter_3_band;
			high_3 := f32((node_2_out) - voice.state.filter_3_low - q_3 * voice.state.filter_3_band);
			voice.state.filter_3_band += f_3 * high_3;
			node_3_out = voice.state.filter_3_low;
		}

		// --- Gain Node 4 ---
		node_4_out = (node_3_out) * ((0.000) + (node_7_out));

		output += node_4_out
	}
	return output
}
