package generated_audio

import "core:math"
import "core:math/rand"

	PRNG_State :: struct {
		state: u32,
	}

	next_float32 :: proc(rng: ^PRNG_State) -> f32 {
		x := rng.state
		x ~= x << 13
		x ~= x >> 17
		x ~= x << 5
		rng.state = x
		return f32(x) / 4294967296.0
	}

	ADSR_Stage :: enum { Idle, Attack, Decay, Sustain, Release }

	Note_Event :: struct {
		note: u8,
		velocity: f32,
		start_time: f32,
		step: int,
		duration: f32,
	}
Kick_Voice_State :: struct {
	active: bool,
	note: u8,
	velocity: f32,
	age: f32,
	time_released: f32,
	current_freq: f32,
	target_freq: f32,
	glide_time: f32,
	duration: f32,
	osc_1_phase: [1]f32,
	adsr_3_stage: ADSR_Stage,
	adsr_3_time: f32,
	adsr_3_value: f32,
	adsr_3_release_level: f32,
	adsr_2_stage: ADSR_Stage,
	adsr_2_time: f32,
	adsr_2_value: f32,
	adsr_2_release_level: f32,
}

Kick_Processor :: struct {
	sample_rate: f32,
	voices: [8]Kick_Voice_State,
	next_voice_idx: int,
	prng: PRNG_State,
	total_samples: u64,
	phase: f32,
	tone: f32,
	amplitude: f32,
	depth: f32,
	mix: f32,
	attack: f32,
	decay: f32,
	sustain: f32,
	release: f32,
	frequency: f32,
	pulseWidth: f32,
	drive: f32,
}

Kick_init :: proc(p: ^Kick_Processor, sr: f32) {
	p.sample_rate = sr
	p.prng.state = 12345
	p.phase = 0.000
	p.tone = 4000.000
	p.amplitude = 0.500
	p.depth = 1.000
	p.mix = 0.500
	p.attack = 0.001
	p.decay = 0.052
	p.sustain = 0.000
	p.release = 0.001
	p.frequency = 121.350
	p.pulseWidth = 0.500
	p.drive = 5.000
}

Kick_note_on :: proc(p: ^Kick_Processor, note: u8, velocity: f32, duration: f32) {
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
	v.duration = duration
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
			p.voices[i].time_released = p.voices[i].age
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
	Kick_process_sequence(p)
	p.total_samples += 1

	for v_idx in 0..<8 {
		voice := &p.voices[v_idx]
		if !voice.active do continue

		voice.age += 1.0 / sample_rate;
		if voice.age >= voice.duration && voice.duration > 0.0 {
			if voice.adsr_3_stage != .Release && voice.adsr_3_stage != .Idle {
				voice.adsr_3_stage = .Release
				voice.adsr_3_release_level = voice.adsr_3_value
				voice.adsr_3_time = 0.0
			}
			if voice.adsr_2_stage != .Release && voice.adsr_2_stage != .Idle {
				voice.adsr_2_stage = .Release
				voice.adsr_2_release_level = voice.adsr_2_value
				voice.adsr_2_time = 0.0
			}
		}
		voice_busy := false
		node_4_out: f32 = 0.0
		node_1_out: f32 = 0.0
		node_3_out: f32 = 0.0
		node_5_out: f32 = 0.0
		node_2_out: f32 = 0.0

		// --- ADSR Node 2 ---
		{
			envelope: f32 = 0.0;
			switch voice.adsr_2_stage {
			case .Idle:
				envelope = 0.0;
			case .Attack:
				if (p.attack) > 0 do envelope = voice.age / (p.attack); else do envelope = 1.0;
				voice.adsr_2_release_level = envelope;
				if voice.age >= (p.attack) {
					voice.adsr_2_stage = .Decay;
				}
			case .Decay:
				time_in_decay := voice.age - (p.attack);
				if (p.decay) > 0 do envelope = 1.0 - (time_in_decay / (p.decay)) * (1.0 - (p.sustain)); else do envelope = (p.sustain);
				voice.adsr_2_release_level = envelope;
				if time_in_decay >= (p.decay) {
					voice.adsr_2_stage = .Sustain;
				}
			case .Sustain:
				envelope = (p.sustain);
				voice.adsr_2_release_level = envelope;
			case .Release:
				time_in_release := voice.age - voice.time_released;
				if (p.release) > 0 do envelope = voice.adsr_2_release_level * (1.0 - (time_in_release / (p.release))); else do envelope = 0.0;
				if envelope <= 0 {
					envelope = 0;
					voice.adsr_2_stage = .Idle;
				}
			}
			node_2_out = (1.0) * envelope * (p.depth);
		}

		// --- Oscillator Node 1 (Unison/Detune) ---
		{
			unison_out: f32 = 0.0;
			unison_count := 1;
			for i in 0..<unison_count {
				detune_amount: f32 = 0.0;
				if unison_count > 1 do detune_amount = (f32(i) / (f32(unison_count) - 1.0) - 0.5) * 2.0 * (5.000);
				detuned_freq := ((121.350) * math.pow(2.0, node_2_out)) * math.pow(2.0, detune_amount / 1200.0);
				phase_rads := f32(p.phase) * (f32(math.PI) / 180.0);
				voice.osc_1_phase[i] = math.mod(voice.osc_1_phase[i] + (2 * f32(math.PI) * detuned_freq / sample_rate), 2 * f32(math.PI));
				final_phase := voice.osc_1_phase[i] + phase_rads;
				switch "Sine" {
				case "Sawtooth":
					unison_out += ((final_phase / f32(math.PI)) - 1.0);
				case "Square":
					if math.sin(final_phase) > p.pulseWidth do unison_out += 1.0; else do unison_out -= 1.0;
				case "Triangle":
					unison_out += (2.0 / f32(math.PI)) * math.asin(math.sin(final_phase));
				case:
					unison_out += math.sin(final_phase);
				}
			}
			if unison_count > 0 do node_1_out = (unison_out / f32(unison_count)) * (p.amplitude);
		}

		// --- ADSR Node 3 ---
		{
			envelope: f32 = 0.0;
			switch voice.adsr_3_stage {
			case .Idle:
				envelope = 0.0;
			case .Attack:
				if (p.attack) > 0 do envelope = voice.age / (p.attack); else do envelope = 1.0;
				voice.adsr_3_release_level = envelope;
				if voice.age >= (p.attack) {
					voice.adsr_3_stage = .Decay;
				}
			case .Decay:
				time_in_decay := voice.age - (p.attack);
				if (p.decay) > 0 do envelope = 1.0 - (time_in_decay / (p.decay)) * (1.0 - (p.sustain)); else do envelope = (p.sustain);
				voice.adsr_3_release_level = envelope;
				if time_in_decay >= (p.decay) {
					voice.adsr_3_stage = .Sustain;
				}
			case .Sustain:
				envelope = (p.sustain);
				voice.adsr_3_release_level = envelope;
			case .Release:
				time_in_release := voice.age - voice.time_released;
				if (p.release) > 0 do envelope = voice.adsr_3_release_level * (1.0 - (time_in_release / (p.release))); else do envelope = 0.0;
				if envelope <= 0 {
					envelope = 0;
					voice.adsr_3_stage = .Idle;
				}
			}
			node_3_out = ((node_1_out)) * envelope * (p.depth);
		}

		// --- Distortion Node 4 ---
		node_4_out = math.tanh((node_3_out) * (p.drive));

		output += node_4_out
		if voice.adsr_3_stage != .Idle do voice_busy = true
		if voice.adsr_2_stage != .Idle do voice_busy = true
		if !voice_busy do voice.active = false
	}
	return output
}
Kick_process_sequence :: proc(p: ^Kick_Processor) {
	samples_per_step := u64(5512)
	current_step := p.total_samples / samples_per_step
	if current_step * samples_per_step == p.total_samples {
		step_idx := current_step % 32
		switch step_idx {
		case 17:
			Kick_note_on(p, 60, 1.000, 0.125)
		case 18:
			Kick_note_on(p, 60, 1.000, 0.125)
		case 19:
			Kick_note_on(p, 60, 1.000, 0.125)
		case 22:
			Kick_note_on(p, 60, 1.000, 0.125)
		case 21:
			Kick_note_on(p, 60, 1.000, 0.125)
		case 23:
			Kick_note_on(p, 60, 1.000, 0.125)
		case 25:
			Kick_note_on(p, 60, 1.000, 0.125)
		case 27:
			Kick_note_on(p, 60, 1.000, 0.125)
		case 29:
			Kick_note_on(p, 60, 1.000, 0.125)
		case 30:
			Kick_note_on(p, 60, 1.000, 0.125)
		case 31:
			Kick_note_on(p, 60, 1.000, 0.125)
		}
	}
}

Snare_Drum_Voice_State :: struct {
	active: bool,
	note: u8,
	velocity: f32,
	age: f32,
	time_released: f32,
	current_freq: f32,
	target_freq: f32,
	glide_time: f32,
	duration: f32,
	osc_3_phase: [1]f32,
	noise_1_rng: PRNG_State,
	filter_4_low: f32,
	filter_4_band: f32,
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
	total_samples: u64,
	sustain: f32,
	depth: f32,
	attack: f32,
	resonance: f32,
	frequency: f32,
	decay: f32,
	release: f32,
	phase: f32,
	cutoff: f32,
	pulseWidth: f32,
	amplitude: f32,
}

Snare_Drum_init :: proc(p: ^Snare_Drum_Processor, sr: f32) {
	p.sample_rate = sr
	p.prng.state = 12345
	p.sustain = 0.000
	p.depth = 1.000
	p.attack = 0.001
	p.resonance = 0.593
	p.frequency = 220.000
	p.decay = 0.159
	p.release = 0.133
	p.phase = 0.000
	p.cutoff = 2449.232
	p.pulseWidth = 0.500
	p.amplitude = 1.000
}

Snare_Drum_note_on :: proc(p: ^Snare_Drum_Processor, note: u8, velocity: f32, duration: f32) {
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
	v.duration = duration
	v.adsr_5_stage = .Attack
	v.adsr_5_time = 0.0
	v.adsr_5_value = 0.0
}

Snare_Drum_note_off :: proc(p: ^Snare_Drum_Processor, note: u8) {
	for i in 0..<8 {
		if p.voices[i].active && p.voices[i].note == note {
			releasing := false
			p.voices[i].time_released = p.voices[i].age
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
	Snare_Drum_process_sequence(p)
	p.total_samples += 1

	for v_idx in 0..<8 {
		voice := &p.voices[v_idx]
		if !voice.active do continue

		voice.age += 1.0 / sample_rate;
		if voice.age >= voice.duration && voice.duration > 0.0 {
			if voice.adsr_5_stage != .Release && voice.adsr_5_stage != .Idle {
				voice.adsr_5_stage = .Release
				voice.adsr_5_release_level = voice.adsr_5_value
				voice.adsr_5_time = 0.0
			}
		}
		voice_busy := false
		node_3_out: f32 = 0.0
		node_6_out: f32 = 0.0
		node_1_out: f32 = 0.0
		node_4_out: f32 = 0.0
		node_2_out: f32 = 0.0
		node_5_out: f32 = 0.0

		// --- Oscillator Node 3 (Unison/Detune) ---
		{
			unison_out: f32 = 0.0;
			unison_count := 1;
			for i in 0..<unison_count {
				detune_amount: f32 = 0.0;
				if unison_count > 1 do detune_amount = (f32(i) / (f32(unison_count) - 1.0) - 0.5) * 2.0 * (5.000);
				detuned_freq := (220.000) * math.pow(2.0, detune_amount / 1200.0);
				phase_rads := f32(p.phase) * (f32(math.PI) / 180.0);
				voice.osc_3_phase[i] = math.mod(voice.osc_3_phase[i] + (2 * f32(math.PI) * detuned_freq / sample_rate), 2 * f32(math.PI));
				final_phase := voice.osc_3_phase[i] + phase_rads;
				switch "Triangle" {
				case "Sawtooth":
					unison_out += ((final_phase / f32(math.PI)) - 1.0);
				case "Square":
					if math.sin(final_phase) > p.pulseWidth do unison_out += 1.0; else do unison_out -= 1.0;
				case "Triangle":
					unison_out += (2.0 / f32(math.PI)) * math.asin(math.sin(final_phase));
				case:
					unison_out += math.sin(final_phase);
				}
			}
			if unison_count > 0 do node_3_out = (unison_out / f32(unison_count)) * (p.amplitude);
		}

		// --- Noise Node 1 ---
		node_1_out = next_float32(&voice.noise_1_rng) * (p.amplitude);

		// --- Mixer Node 2 ---
		{
			mix_sum_2: f32 = 0.0;
			mix_sum_2 += node_1_out * (0.750);
			mix_sum_2 += node_3_out * (0.750);
		node_2_out = mix_sum_2;
		}

		// --- Filter Node 4 (SVF) ---
		{
			f_4 := f32(2.0 * math.sin(f32(math.PI) * (p.cutoff) / sample_rate));
			q_4 := f32(1.0 / (p.resonance));
			voice.filter_4_low += f_4 * voice.filter_4_band;
			high_4 := f32((node_2_out) - voice.filter_4_low - q_4 * voice.filter_4_band);
			voice.filter_4_band += f_4 * high_4;
			node_4_out = voice.filter_4_low;
		}

		// --- ADSR Node 5 ---
		{
			envelope: f32 = 0.0;
			switch voice.adsr_5_stage {
			case .Idle:
				envelope = 0.0;
			case .Attack:
				if (p.attack) > 0 do envelope = voice.age / (p.attack); else do envelope = 1.0;
				voice.adsr_5_release_level = envelope;
				if voice.age >= (p.attack) {
					voice.adsr_5_stage = .Decay;
				}
			case .Decay:
				time_in_decay := voice.age - (p.attack);
				if (p.decay) > 0 do envelope = 1.0 - (time_in_decay / (p.decay)) * (1.0 - (p.sustain)); else do envelope = (p.sustain);
				voice.adsr_5_release_level = envelope;
				if time_in_decay >= (p.decay) {
					voice.adsr_5_stage = .Sustain;
				}
			case .Sustain:
				envelope = (p.sustain);
				voice.adsr_5_release_level = envelope;
			case .Release:
				time_in_release := voice.age - voice.time_released;
				if (p.release) > 0 do envelope = voice.adsr_5_release_level * (1.0 - (time_in_release / (p.release))); else do envelope = 0.0;
				if envelope <= 0 {
					envelope = 0;
					voice.adsr_5_stage = .Idle;
				}
			}
			node_5_out = ((node_4_out)) * envelope * (p.depth);
		}

		output += node_5_out
		if voice.adsr_5_stage != .Idle do voice_busy = true
		if !voice_busy do voice.active = false
	}
	return output
}
Snare_Drum_process_sequence :: proc(p: ^Snare_Drum_Processor) {
	samples_per_step := u64(5512)
	current_step := p.total_samples / samples_per_step
	if current_step * samples_per_step == p.total_samples {
		step_idx := current_step % 32
		switch step_idx {
		case 20:
			Snare_Drum_note_on(p, 60, 1.000, 0.125)
		case 24:
			Snare_Drum_note_on(p, 60, 1.000, 0.125)
		case 26:
			Snare_Drum_note_on(p, 60, 1.000, 0.125)
		case 28:
			Snare_Drum_note_on(p, 60, 1.000, 0.125)
		case 5:
			Snare_Drum_note_on(p, 60, 1.000, 0.125)
		}
	}
}

sax_Voice_State :: struct {
	active: bool,
	note: u8,
	velocity: f32,
	age: f32,
	time_released: f32,
	current_freq: f32,
	target_freq: f32,
	glide_time: f32,
	duration: f32,
	adsr_7_stage: ADSR_Stage,
	adsr_7_time: f32,
	adsr_7_value: f32,
	adsr_7_release_level: f32,
	osc_2_phase: [1]f32,
	filter_3_low: f32,
	filter_3_band: f32,
}

sax_Processor :: struct {
	sample_rate: f32,
	voices: [8]sax_Voice_State,
	next_voice_idx: int,
	prng: PRNG_State,
	total_samples: u64,
	resonance: f32,
	decay: f32,
	cutoff: f32,
	useMpe: f32,
	device: f32,
	frequency: f32,
	depth: f32,
	phase: f32,
	release: f32,
	sustain: f32,
	amplitude: f32,
	pulseWidth: f32,
	attack: f32,
	gain: f32,
}

sax_init :: proc(p: ^sax_Processor, sr: f32) {
	p.sample_rate = sr
	p.prng.state = 12345
	p.resonance = 1.910
	p.decay = 0.240
	p.cutoff = 857.097
	p.useMpe = 0.000
	p.device = 0.000
	p.frequency = 440.000
	p.depth = 1.000
	p.phase = 0.000
	p.release = 0.213
	p.sustain = 0.819
	p.amplitude = 0.500
	p.pulseWidth = 0.500
	p.attack = 0.053
	p.gain = 0.000
}

sax_note_on :: proc(p: ^sax_Processor, note: u8, velocity: f32, duration: f32) {
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
	v.duration = duration
	v.adsr_7_stage = .Attack
	v.adsr_7_time = 0.0
	v.adsr_7_value = 0.0
}

sax_note_off :: proc(p: ^sax_Processor, note: u8) {
	for i in 0..<8 {
		if p.voices[i].active && p.voices[i].note == note {
			releasing := false
			p.voices[i].time_released = p.voices[i].age
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
	sax_process_sequence(p)
	p.total_samples += 1

	for v_idx in 0..<8 {
		voice := &p.voices[v_idx]
		if !voice.active do continue

		voice.age += 1.0 / sample_rate;
		if voice.age >= voice.duration && voice.duration > 0.0 {
			if voice.adsr_7_stage != .Release && voice.adsr_7_stage != .Idle {
				voice.adsr_7_stage = .Release
				voice.adsr_7_release_level = voice.adsr_7_value
				voice.adsr_7_time = 0.0
			}
		}
		voice_busy := false
		node_7_out: f32 = 0.0
		node_1_out: f32 = 0.0
		node_4_out: f32 = 0.0
		node_2_out: f32 = 0.0
		node_5_out: f32 = 0.0
		node_3_out: f32 = 0.0
		node_6_out: f32 = 0.0

		// --- MIDI Input Node 6 ---
		node_6_out_pitch := (f32(voice.note) - 69.0) / 12.0
		node_6_out_gate := f32(1.0)
		node_6_out_velocity := voice.velocity

		// --- Oscillator Node 2 (Unison/Detune) ---
		{
			unison_out: f32 = 0.0;
			unison_count := 1;
			for i in 0..<unison_count {
				detune_amount: f32 = 0.0;
				if unison_count > 1 do detune_amount = (f32(i) / (f32(unison_count) - 1.0) - 0.5) * 2.0 * (5.000);
				detuned_freq := ((440.000) * math.pow(2.0, node_6_out_pitch)) * math.pow(2.0, detune_amount / 1200.0);
				phase_rads := f32(p.phase) * (f32(math.PI) / 180.0);
				voice.osc_2_phase[i] = math.mod(voice.osc_2_phase[i] + (2 * f32(math.PI) * detuned_freq / sample_rate), 2 * f32(math.PI));
				final_phase := voice.osc_2_phase[i] + phase_rads;
				switch "Sawtooth" {
				case "Sawtooth":
					unison_out += ((final_phase / f32(math.PI)) - 1.0);
				case "Square":
					if math.sin(final_phase) > p.pulseWidth do unison_out += 1.0; else do unison_out -= 1.0;
				case "Triangle":
					unison_out += (2.0 / f32(math.PI)) * math.asin(math.sin(final_phase));
				case:
					unison_out += math.sin(final_phase);
				}
			}
			if unison_count > 0 do node_2_out = (unison_out / f32(unison_count)) * (p.amplitude);
		}

		// --- ADSR Node 7 ---
		{
			envelope: f32 = 0.0;
			switch voice.adsr_7_stage {
			case .Idle:
				envelope = 0.0;
			case .Attack:
				if (p.attack) > 0 do envelope = voice.age / (p.attack); else do envelope = 1.0;
				voice.adsr_7_release_level = envelope;
				if voice.age >= (p.attack) {
					voice.adsr_7_stage = .Decay;
				}
			case .Decay:
				time_in_decay := voice.age - (p.attack);
				if (p.decay) > 0 do envelope = 1.0 - (time_in_decay / (p.decay)) * (1.0 - (p.sustain)); else do envelope = (p.sustain);
				voice.adsr_7_release_level = envelope;
				if time_in_decay >= (p.decay) {
					voice.adsr_7_stage = .Sustain;
				}
			case .Sustain:
				envelope = (p.sustain);
				voice.adsr_7_release_level = envelope;
			case .Release:
				time_in_release := voice.age - voice.time_released;
				if (p.release) > 0 do envelope = voice.adsr_7_release_level * (1.0 - (time_in_release / (p.release))); else do envelope = 0.0;
				if envelope <= 0 {
					envelope = 0;
					voice.adsr_7_stage = .Idle;
				}
			}
			node_7_out = ((node_6_out_gate)) * envelope * (p.depth);
		}

		// --- Mapper Node 1 ---
		node_1_out = math.lerp(f32(400.000), f32(3000.000), math.clamp(((node_6_out_velocity) - (0.000)) / ((1.000) - (0.000)), 0.0, 1.0));

		// --- Filter Node 3 (SVF) ---
		{
			f_3 := f32(2.0 * math.sin(f32(math.PI) * ((p.cutoff) + (node_7_out) + (node_1_out)) / sample_rate));
			q_3 := f32(1.0 / (p.resonance));
			voice.filter_3_low += f_3 * voice.filter_3_band;
			high_3 := f32((node_2_out) - voice.filter_3_low - q_3 * voice.filter_3_band);
			voice.filter_3_band += f_3 * high_3;
			node_3_out = voice.filter_3_low;
		}

		// --- Gain Node 4 ---
		node_4_out = (node_3_out) * ((p.gain) + (node_7_out));

		output += node_4_out
		if voice.adsr_7_stage != .Idle do voice_busy = true
		if !voice_busy do voice.active = false
	}
	return output
}
sax_process_sequence :: proc(p: ^sax_Processor) {
	samples_per_step := u64(5512)
	current_step := p.total_samples / samples_per_step
	if current_step * samples_per_step == p.total_samples {
		step_idx := current_step % 32
		switch step_idx {
		case 16:
			sax_note_on(p, 60, 1.000, 0.375)
		case 20:
			sax_note_on(p, 60, 1.000, 0.125)
		case 21:
			sax_note_on(p, 60, 1.000, 0.125)
		case 22:
			sax_note_on(p, 60, 1.000, 0.125)
		case 24:
			sax_note_on(p, 60, 1.000, 0.375)
		case 27:
			sax_note_on(p, 60, 1.000, 0.125)
		case 28:
			sax_note_on(p, 60, 1.000, 0.375)
		}
	}
}

// --- Project Wrapper (Generic Interface) ---
Project_State :: struct {
	Kick: ^Kick_Processor,
	Snare_Drum: ^Snare_Drum_Processor,
	sax: ^sax_Processor,
}

project_init :: proc(p: ^Project_State, sr: f32) {
	p.Kick = new(Kick_Processor)
	Kick_init(p.Kick, sr)
	p.Snare_Drum = new(Snare_Drum_Processor)
	Snare_Drum_init(p.Snare_Drum, sr)
	p.sax = new(sax_Processor)
	sax_init(p.sax, sr)
}

project_process :: proc(p: ^Project_State) -> (f32, f32) {
	mixed_out: f32 = 0.0
	mixed_out += Kick_process(p.Kick)
	mixed_out += Snare_Drum_process(p.Snare_Drum)
	mixed_out += sax_process(p.sax)
	mixed_out = mixed_out * 0.500
	return mixed_out, mixed_out
}

project_destroy :: proc(p: ^Project_State) {
	free(p.Kick)
	free(p.Snare_Drum)
	free(p.sax)
}

