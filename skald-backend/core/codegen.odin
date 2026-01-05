package skald_core

import "core:fmt"
import "core:strings"
import "core:math"
import rand "core:math/rand"
import json "core:encoding/json"

// =================================================================================
// SECTION D: Modular Code Generation Procedures
// =================================================================================

generate_oscillator_code :: proc(sb: ^strings.Builder, node: Node, graph: ^Graph, instrument: ^Project_Instrument) {
	freq_str: string
	
	// Determine Base Frequency (Parameter OR Voice Frequency)
	base_freq_str := "voice.current_freq" // Priority 3: Default to voice frequency
	if val, ok := node.parameters["frequency"]; ok {
        #partial switch v in val {
		// Priority 2: Use fixed parameter if present
		case json.Float:
			base_freq_str = fmt.tprintf("%f", v)
		case json.Integer:
			base_freq_str = fmt.tprintf("%f", f64(v))
        }
	}

	// Apply Modulation (Priority 1: Add Input)
	if id, ok := find_input_for_port(graph, node.id, "input_freq"); ok {
		input_str := get_output_var(id)
		freq_str = fmt.tprintf("(%s) + (%s)", base_freq_str, input_str)
	} else {
		freq_str = base_freq_str
	}

	amp_str  := get_f32_param(graph, node, "amplitude", "input_amp", 0.5)
	pw_str   := get_f32_param(graph, node, "pulseWidth", "input_pulseWidth", 0.5)
	phase_str:= get_f32_param(nil, node, "phase", "", 0.0)
	waveform := get_string_param(node, "waveform", "Sine")

	unison_count := instrument.unison
	detune_amount := instrument.detune

	fmt.sbprintf(sb, "\t\t// --- Oscillator Node %d (Unison/Detune) ---\n", node.id)
	fmt.sbprint(sb, "\t\t{\n")
	fmt.sbprintf(sb, "\t\t\tunison_out: f32 = 0.0;\n")
	fmt.sbprintf(sb, "\t\t\tunison_count := %d;\n", unison_count)
	fmt.sbprint(sb, "\t\t\tfor i in 0..<unison_count {\n")
	fmt.sbprint(sb, "\t\t\t\tdetune_amount: f32 = 0.0;\n")
	fmt.sbprintf(sb, "\t\t\t\tif unison_count > 1 do detune_amount = (f32(i) / (f32(unison_count) - 1.0) - 0.5) * 2.0 * (%f);\n", detune_amount)
	fmt.sbprintf(sb, "\t\t\t\tdetuned_freq := (%s) * math.pow(2.0, detune_amount / 1200.0);\n", freq_str)
	fmt.sbprintf(sb, "\t\t\t\tphase_rads := f32(%s) * (f32(math.PI) / 180.0);\n", phase_str)
	fmt.sbprintf(sb, "\t\t\t\tvoice.state.osc_%d_phase[i] = math.mod(voice.state.osc_%d_phase[i] + (2 * f32(math.PI) * detuned_freq / sample_rate), 2 * f32(math.PI));\n", node.id, node.id)
	fmt.sbprintf(sb, "\t\t\t\tfinal_phase := voice.state.osc_%d_phase[i] + phase_rads;\n", node.id)

	fmt.sbprint(sb, "\t\t\t\tswitch \"")
	fmt.sbprint(sb, waveform)
	fmt.sbprint(sb, "\" {\n")
	fmt.sbprint(sb, "\t\t\t\tcase \"Sawtooth\":\n")
	fmt.sbprint(sb, "\t\t\t\t\tunison_out += ((final_phase / f32(math.PI)) - 1.0);\n")
	fmt.sbprint(sb, "\t\t\t\tcase \"Square\":\n")
	fmt.sbprintf(sb, "\t\t\t\t\tif math.sin(final_phase) > %s do unison_out += 1.0; else do unison_out -= 1.0;\n", pw_str)
	fmt.sbprint(sb, "\t\t\t\tcase \"Triangle\":\n")
	fmt.sbprint(sb, "\t\t\t\t\tunison_out += (2.0 / f32(math.PI)) * math.asin(math.sin(final_phase));\n")
	fmt.sbprint(sb, "\t\t\t\tcase:\n") // Default to Sine
	fmt.sbprint(sb, "\t\t\t\t\tunison_out += math.sin(final_phase);\n")
	fmt.sbprint(sb, "\t\t\t\t}\n") // End of switch

	fmt.sbprint(sb, "\t\t\t}\n") // End of for loop
	fmt.sbprintf(sb, "\t\t\tif unison_count > 0 do node_%d_out = (unison_out / f32(unison_count)) * (%s);\n", node.id, amp_str)
	fmt.sbprint(sb, "\t\t}\n\n")
}

generate_adsr_code :: proc(sb: ^strings.Builder, node: Node, graph: ^Graph) {
	input_str := "1.0"
	if id, ok := find_input_for_port(graph, node.id, "input"); ok do input_str = get_output_var(id)

	depth_str := get_f32_param(nil, node, "depth", "", 1.0)

	fmt.sbprintf(sb, "\t\t// --- ADSR Node %d ---\n", node.id)
	fmt.sbprint(sb, "\t\t{\n")
	fmt.sbprint(sb, "\t\t\tenvelope: f32 = 0.0;\n")
	fmt.sbprintf(sb, "\t\t\tswitch voice.state.adsr_%d_stage {{\n", node.id)
	fmt.sbprint(sb, "\t\t\tcase .Idle:\n")
	fmt.sbprint(sb, "\t\t\t\tenvelope = 0.0;\n")
	fmt.sbprint(sb, "\t\t\tcase .Attack:\n")
	fmt.sbprint(sb, "\t\t\t\tif p.attack > 0 do envelope = voice.time_active / p.attack; else do envelope = 1.0;\n")
	fmt.sbprintf(sb, "\t\t\t\tvoice.state.adsr_%d_level_at_release = envelope;\n", node.id)
	fmt.sbprint(sb, "\t\t\t\tif voice.time_active >= p.attack {\n")
	fmt.sbprintf(sb, "\t\t\t\t\tvoice.state.adsr_%d_stage = .Decay;\n", node.id)
	fmt.sbprint(sb, "\t\t\t\t}\n")
	fmt.sbprint(sb, "\t\t\tcase .Decay:\n")
	fmt.sbprint(sb, "\t\t\t\ttime_in_decay := voice.time_active - p.attack;\n")
	fmt.sbprint(sb, "\t\t\t\tif p.decay > 0 do envelope = 1.0 - (time_in_decay / p.decay) * (1.0 - p.sustain); else do envelope = p.sustain;\n")
	fmt.sbprintf(sb, "\t\t\t\tvoice.state.adsr_%d_level_at_release = envelope;\n", node.id)
	fmt.sbprint(sb, "\t\t\t\tif time_in_decay >= p.decay {\n")
	fmt.sbprintf(sb, "\t\t\t\t\tvoice.state.adsr_%d_stage = .Sustain;\n", node.id)
	fmt.sbprint(sb, "\t\t\t\t}\n")
	fmt.sbprint(sb, "\t\t\tcase .Sustain:\n")
	fmt.sbprint(sb, "\t\t\t\tenvelope = p.sustain;\n")
	fmt.sbprintf(sb, "\t\t\t\tvoice.state.adsr_%d_level_at_release = envelope;\n", node.id)
	fmt.sbprint(sb, "\t\t\tcase .Release:\n")
	fmt.sbprint(sb, "\t\t\t\ttime_in_release := voice.time_active - voice.time_released;\n")
	fmt.sbprintf(sb, "\t\t\t\tif p.release > 0 do envelope = voice.state.adsr_%d_level_at_release * (1.0 - (time_in_release / p.release)); else do envelope = 0.0;\n", node.id)
	fmt.sbprint(sb, "\t\t\t\tif envelope <= 0 {\n")
	fmt.sbprint(sb, "\t\t\t\t\tenvelope = 0;\n")
	fmt.sbprint(sb, "\t\t\t\t\tvoice.is_active = false;\n")
	fmt.sbprint(sb, "\t\t\t\t}\n")
	fmt.sbprint(sb, "\t\t\t}\n")
	fmt.sbprintf(sb, "\t\t\tnode_%d_out = (%s) * envelope * (%s);\n", node.id, input_str, depth_str)
	fmt.sbprint(sb, "\t\t}\n\n")
}

generate_noise_code :: proc(sb: ^strings.Builder, node: Node, graph: ^Graph) {
	amp_str := get_f32_param(graph, node, "amplitude", "input_amp", 1.0)
	fmt.sbprintf(sb, "\t\t// --- Noise Node %d ---\n", node.id)
	fmt.sbprintf(sb, "\t\tnode_%d_out = next_float32(&voice.state.noise_%d_rng) * (%s);\n\n", node.id, node.id, amp_str)
}

generate_filter_code :: proc(sb: ^strings.Builder, node: Node, graph: ^Graph) {
	input_str := "0.0"
	if id, ok := find_input_for_port(graph, node.id, "input"); ok do input_str = get_output_var(id)
	
	cutoff_str := get_f32_param(graph, node, "cutoff", "input_cutoff", 1000.0)
	res_str    := get_f32_param(graph, node, "resonance", "input_res", 1.0)
	f_type     := get_string_param(node, "type", "LowPass")

	fmt.sbprintf(sb, "\t\t// --- Filter Node %d (SVF) ---\n", node.id)
	fmt.sbprint(sb, "\t\t{\n")
	// Algorithm: Chamberlin SVF
	// f = 2 * sin(pi * cutoff / fs)
	// q = 1.0 / res
	// low = low + f * band
	// high = input - low - q*band
	// band = band + f * high
	fmt.sbprintf(sb, "\t\t\tf_%d := f32(2.0 * math.sin(f32(math.PI) * (%s) / sample_rate));\n", node.id, cutoff_str)
	fmt.sbprintf(sb, "\t\t\tq_%d := f32(1.0 / (%s));\n", node.id, res_str)
	
	fmt.sbprintf(sb, "\t\t\tvoice.state.filter_%d_low += f_%d * voice.state.filter_%d_band;\n", node.id, node.id, node.id)
	fmt.sbprintf(sb, "\t\t\thigh_%d := f32((%s) - voice.state.filter_%d_low - q_%d * voice.state.filter_%d_band);\n", node.id, input_str, node.id, node.id, node.id)
	fmt.sbprintf(sb, "\t\t\tvoice.state.filter_%d_band += f_%d * high_%d;\n", node.id, node.id, node.id)

	switch f_type {
	case "HighPass":
		fmt.sbprintf(sb, "\t\t\tnode_%d_out = high_%d;\n", node.id, node.id)
	case "BandPass":
		fmt.sbprintf(sb, "\t\t\tnode_%d_out = voice.state.filter_%d_band;\n", node.id, node.id)
	case "Notch":
		fmt.sbprintf(sb, "\t\t\tnode_%d_out = high_%d + voice.state.filter_%d_low;\n", node.id, node.id, node.id)
	case: // LowPass
		fmt.sbprintf(sb, "\t\t\tnode_%d_out = voice.state.filter_%d_low;\n", node.id, node.id)
	}
	fmt.sbprint(sb, "\t\t}\n\n")
}

generate_lfo_code :: proc(sb: ^strings.Builder, node: Node, graph: ^Graph) {
	freq_str := get_f32_param(graph, node, "frequency", "", 5.0)
	amp_str  := get_f32_param(graph, node, "amplitude", "", 1.0)
	waveform := get_string_param(node, "waveform", "Sine")

	fmt.sbprintf(sb, "\t\t// --- LFO Node %d ---\n", node.id)
	fmt.sbprintf(sb, "\t\tvoice.state.lfo_%d_phase = math.mod(voice.state.lfo_%d_phase + (2 * f32(math.PI) * (%s) / sample_rate), 2 * f32(math.PI));\n", node.id, node.id, freq_str)

	switch waveform {
	case "Sawtooth":
		fmt.sbprintf(sb, "\t\tnode_%d_out = ((voice.state.lfo_%d_phase / f32(math.PI)) - 1.0) * (%s);\n\n", node.id, node.id, amp_str)
	case "Square":
		fmt.sbprintf(sb, "\t\tif math.sin(voice.state.lfo_%d_phase) > 0 do node_%d_out = %s; else do node_%d_out = -%s;\n\n", node.id, node.id, amp_str, node.id, amp_str)
	case "Triangle":
		fmt.sbprintf(sb, "\t\tnode_%d_out = (2.0 / f32(math.PI)) * math.asin(math.sin(voice.state.lfo_%d_phase)) * (%s);\n\n", node.id, node.id, amp_str)
	case: // "Sine"
		fmt.sbprintf(sb, "\t\tnode_%d_out = math.sin(voice.state.lfo_%d_phase) * (%s);\n\n", node.id, node.id, amp_str)
	}
}

generate_sample_hold_code :: proc(sb: ^strings.Builder, node: Node, graph: ^Graph) {
	rate_str := get_f32_param(graph, node, "rate", "", 10.0)
	amp_str  := get_f32_param(graph, node, "amplitude", "", 1.0)
	fmt.sbprintf(sb, "\t\t// --- Sample & Hold Node %d ---\n", node.id)
	fmt.sbprintf(sb, "\t\tvoice.state.sh_%d_counter += 1;\n", node.id)
	fmt.sbprintf(sb, "\t\tupdate_interval_%d := u64(sample_rate / (%s));\n", node.id, rate_str)
	fmt.sbprintf(sb, "\t\tif voice.state.sh_%d_counter >= update_interval_%d {{\n", node.id, node.id)
	fmt.sbprintf(sb, "\t\t\tvoice.state.sh_%d_current_value = next_float32(&voice.state.sh_%d_rng) * 2.0 - 1.0;\n", node.id, node.id)
	fmt.sbprintf(sb, "\t\t\tvoice.state.sh_%d_counter = 0;\n", node.id)
	fmt.sbprint(sb, "\t\t}\n")
	fmt.sbprintf(sb, "\t\tnode_%d_out = voice.state.sh_%d_current_value * (%s);\n\n", node.id, node.id, amp_str)
}

generate_fm_operator_code :: proc(sb: ^strings.Builder, node: Node, graph: ^Graph) {
	// The modulator signal comes from the 'input_mod' port.
	mod_str := "0.0"
	if id, ok := find_input_for_port(graph, node.id, "input_mod"); ok do mod_str = get_output_var(id)

	// The base frequency for the carrier should come from the voice's current frequency.
	carrier_base_freq_str := "voice.current_freq"

	// Parameters from the node itself.
	// The UI sends 'frequency' which we will treat as the carrier-to-modulator frequency ratio.
	ratio_str := get_f32_param(nil, node, "frequency", "", 1.0)
	// The UI sends 'modIndex', which is the modulation depth.
	mod_index_str := get_f32_param(nil, node, "modIndex", "", 100.0)

	fmt.sbprintf(sb, "\t\t// --- FM Operator Node %d ---\n", node.id)
	fmt.sbprint(sb, "\t\t{\n")
	// Calculate the actual carrier frequency by applying the ratio.
	fmt.sbprintf(sb, "\t\t\tcarrier_freq_%d := %s * (%s);\n", node.id, carrier_base_freq_str, ratio_str)
	// Increment the phase based on the carrier frequency.
	fmt.sbprintf(sb, "\t\t\tvoice.state.fm_%d_phase = math.mod(voice.state.fm_%d_phase + (2 * f32(math.PI) * carrier_freq_%d / sample_rate), 2 * f32(math.PI));\n", node.id, node.id, node.id)
	// Calculate the final output. The modulator signal is multiplied by the modulation index and added to the phase.
	fmt.sbprintf(sb, "\t\t\tnode_%d_out = math.sin(voice.state.fm_%d_phase + (%s) * (%s));\n", node.id, node.id, mod_str, mod_index_str)
	fmt.sbprint(sb, "\t\t}\n\n")
}

generate_wavetable_code :: proc(sb: ^strings.Builder, node: Node, graph: ^Graph) {
	freq_str := get_f32_param(graph, node, "frequency", "input_freq", 440.0)
	fmt.sbprintf(sb, "\t\t// --- Wavetable Node %d (Placeholder) ---\n", node.id)
	fmt.sbprintf(sb, "\t\tvoice.state.wavetable_%d_phase = math.mod(voice.state.wavetable_%d_phase + (2 * f32(math.PI) * (%s) / sample_rate), 2 * f32(math.PI));\n", node.id, node.id, freq_str)
	fmt.sbprintf(sb, "\t\tnode_%d_out = math.sin(voice.state.wavetable_%d_phase);\n\n", node.id, node.id)
}

generate_delay_code :: proc(sb: ^strings.Builder, node: Node, graph: ^Graph) {
	input_str := "0.0"
	if id, ok := find_input_for_port(graph, node.id, "input"); ok do input_str = get_output_var(id)
	time_str    := get_f32_param(graph, node, "delayTime", "", 0.5)
	fdbk_str    := get_f32_param(graph, node, "feedback", "", 0.5)
	mix_str     := get_f32_param(graph, node, "wetDryMix", "", 0.5)

	fmt.sbprintf(sb, "\t\t// --- Delay Node %d ---\n", node.id)
	fmt.sbprint(sb, "\t\t{\n")
	fmt.sbprintf(sb, "\t\t\tdelay_samples_%d := int(math.clamp((%s) * sample_rate, 0, %d-1));\n", node.id, time_str, 96000)
	fmt.sbprintf(sb, "\t\t\tread_index_%d := (p.delay_%d_write_index - delay_samples_%d + len(p.delay_%d_buffer)) %% len(p.delay_%d_buffer);\n", node.id, node.id, node.id, node.id, node.id)
	fmt.sbprintf(sb, "\t\t\tdelayed_sample_%d := p.delay_%d_buffer[read_index_%d];\n", node.id, node.id, node.id)
	fmt.sbprintf(sb, "\t\t\tp.delay_%d_buffer[p.delay_%d_write_index] = (%s) + delayed_sample_%d * (%s);\n", node.id, node.id, input_str, node.id, fdbk_str)
	fmt.sbprintf(sb, "\t\t\tp.delay_%d_write_index = (p.delay_%d_write_index + 1) %% len(p.delay_%d_buffer);\n", node.id, node.id, node.id)
	fmt.sbprintf(sb, "\t\t\tnode_%d_out = (%s) * (1.0 - (%s)) + delayed_sample_%d * (%s);\n", node.id, input_str, mix_str, node.id, mix_str)
	fmt.sbprint(sb, "\t\t}\n\n")
}

generate_reverb_code :: proc(sb: ^strings.Builder, node: Node, graph: ^Graph) {
	input_str := "0.0"
	if id, ok := find_input_for_port(graph, node.id, "input"); ok do input_str = get_output_var(id)
	
	decay_str := get_f32_param(nil, node, "decay", "", 0.5)
	mix_str   := get_f32_param(nil, node, "mix", "", 0.5)
	
	delay_time := 0.075 

	fmt.sbprintf(sb, "\t\t// --- Reverb Node %d (Simple FDN) ---\n", node.id)
	fmt.sbprint(sb, "\t\t{\n")
	fmt.sbprintf(sb, "\t\t\tdelay_samples_%d := int(math.clamp((%f) * sample_rate, 0, %d-1));\n", node.id, delay_time, 96000)
	fmt.sbprintf(sb, "\t\t\tread_index_%d := (p.delay_%d_write_index - delay_samples_%d + len(p.delay_%d_buffer)) %% len(p.delay_%d_buffer);\n", node.id, node.id, node.id, node.id, node.id)
	fmt.sbprintf(sb, "\t\t\tdelayed_sample_%d := p.delay_%d_buffer[read_index_%d];\n", node.id, node.id, node.id)
	fmt.sbprintf(sb, "\t\t\tp.delay_%d_buffer[p.delay_%d_write_index] = (%s) + delayed_sample_%d * (%s);\n", node.id, node.id, input_str, node.id, decay_str)
	fmt.sbprintf(sb, "\t\t\tp.delay_%d_write_index = (p.delay_%d_write_index + 1) %% len(p.delay_%d_buffer);\n", node.id, node.id, node.id)
	fmt.sbprintf(sb, "\t\t\tnode_%d_out = (%s) * (1.0 - (%s)) + delayed_sample_%d * (%s);\n", node.id, input_str, mix_str, node.id, mix_str)
	fmt.sbprint(sb, "\t\t}\n\n")
}

generate_distortion_code :: proc(sb: ^strings.Builder, node: Node, graph: ^Graph) {
	input_str := "0.0"
	if id, ok := find_input_for_port(graph, node.id, "input"); ok do input_str = get_output_var(id)
	drive_str := get_f32_param(graph, node, "drive", "", 20.0)
	shape := get_string_param(node, "shape", "SoftClip")

	fmt.sbprintf(sb, "\t\t// --- Distortion Node %d ---\n", node.id)
	switch shape {
	case "HardClip":
		fmt.sbprintf(sb, "\t\tnode_%d_out = math.clamp((%s) * (%s), -1.0, 1.0);\n\n", node.id, input_str, drive_str)
	case: // "SoftClip"
		fmt.sbprintf(sb, "\t\tnode_%d_out = math.tanh((%s) * (%s));\n\n", node.id, input_str, drive_str)
	}
}

generate_mixer_code :: proc(sb: ^strings.Builder, node: Node, graph: ^Graph) {
	fmt.sbprintf(sb, "\t\t// --- Mixer Node %d ---\n", node.id)
	fmt.sbprint(sb, "\t\t{\n")
	fmt.sbprintf(sb, "\t\t\tmix_sum_%d: f32 = 0.0;\n", node.id)
	for i in 1..=8 {
		port_name := fmt.tprintf("input_%d", i)
		if id, ok := find_input_for_port(graph, node.id, port_name); ok {
			gain_param := fmt.tprintf("input_%d_gain", i)
			gain_str := get_f32_param(graph, node, gain_param, "", 0.75)
			fmt.sbprintf(sb, "\t\t\tmix_sum_%d += %s * (%s);\n", node.id, get_output_var(id), gain_str)
		}
	}
	fmt.sbprintf(sb, "\t\tnode_%d_out = mix_sum_%d;\n", node.id, node.id)
	fmt.sbprint(sb, "\t\t}\n\n")
}

generate_panner_code :: proc(sb: ^strings.Builder, node: Node, graph: ^Graph) {
	input_str := "0.0"
	if id, ok := find_input_for_port(graph, node.id, "input"); ok do input_str = get_output_var(id)
	pan_str := get_f32_param(graph, node, "pan", "input_pan", 0.0)
	fmt.sbprintf(sb, "\t\t// --- Panner Node %d ---\n", node.id)
	fmt.sbprint(sb, "\t\t{\n")
	fmt.sbprintf(sb, "\t\t\tpan_angle_%d := ((%s) * 0.5 + 0.5) * f32(math.PI) / 2.0;\n", node.id, pan_str)
	fmt.sbprintf(sb, "\t\t\tnode_%d_out_left = (%s) * math.cos(pan_angle_%d);\n", node.id, input_str, node.id)
	fmt.sbprintf(sb, "\t\t\tnode_%d_out_right = (%s) * math.sin(pan_angle_%d);\n", node.id, input_str, node.id)
	fmt.sbprint(sb, "\t\t}\n\n")
}

generate_mapper_code :: proc(sb: ^strings.Builder, node: Node, graph: ^Graph) {
	input_str := "0.0"
	if id, ok := find_input_for_port(graph, node.id, "input"); ok do input_str = get_output_var(id)
	
	inMin := get_f32_param(graph, node, "inMin", "", 0.0)
	inMax := get_f32_param(graph, node, "inMax", "", 1.0)
	outMin := get_f32_param(graph, node, "outMin", "", 0.0)
	outMax := get_f32_param(graph, node, "outMax", "", 1.0)

	fmt.sbprintf(sb, "\t\t// --- Mapper Node %d ---\n", node.id)
	fmt.sbprintf(sb, "\t\tnode_%d_out = math.lerp(%s, %s, math.clamp(((%s) - (%s)) / ((%s) - (%s)), 0.0, 1.0));\n\n", node.id, outMin, outMax, input_str, inMin, inMax, inMin)
}


generate_gain_code :: proc(sb: ^strings.Builder, node: Node, graph: ^Graph) {
	input_str := "0.0"
	if id, ok := find_input_for_port(graph, node.id, "input"); ok do input_str = get_output_var(id)
	
	gain_str := get_f32_param(graph, node, "gain", "input_gain", 1.0)

	fmt.sbprintf(sb, "\t\t// --- Gain Node %d ---\n", node.id)
	fmt.sbprintf(sb, "\t\tnode_%d_out = (%s) * (%s);\n\n", node.id, input_str, gain_str)
}

generate_midi_input_code :: proc(sb: ^strings.Builder, node: Node, graph: ^Graph) {
	// MIDI Input Node outputs: Pitch (Hz), Gate (0.0 or 1.0), and Velocity (0.0 - 1.0)
	// These values are derived directly from the voice state, which is populated by the note_on event.

	fmt.sbprintf(sb, "\t\t// --- MIDI Input Node %d ---\n", node.id)
	// Output 1: Pitch (mapped from voice.current_freq)
	fmt.sbprintf(sb, "\t\tnode_%d_out_pitch = voice.current_freq;\n", node.id)
	// Output 2: Gate (1.0 if voice is active/sustained, though voice lifecycle manages this. We'll just output 1.0 for now as 'active')\n")
	// In a more complex ADSR setup, gate might go low during release, but for this simple model, 1.0 is fine while voice is active.
	fmt.sbprintf(sb, "\t\tnode_%d_out_gate = 1.0;\n", node.id)
	// Output 3: Velocity
	fmt.sbprintf(sb, "\t\tnode_%d_out_velocity = voice.velocity;\n\n", node.id)
}

// Generates note_on and note_off procedures for the test harness.
generate_note_on_off_code :: proc(sb: ^strings.Builder, subgraph_nodes: []Node, polyphony_str: string, has_adsr: bool, namespace_prefix: string) {
	fmt.sbprintf(sb, "// --- Note On/Off Handlers (%s) ---\n", namespace_prefix)

	// --- note_on ---
	fmt.sbprintf(sb, "note_on_%s :: proc(p: ^AudioProcessor_%s, note: u8, velocity: f32) {{\n", namespace_prefix, namespace_prefix)
	fmt.sbprint(sb, "\t// Simple 'next available' voice stealing\n")
	fmt.sbprintf(sb, "\tvoice := &p.voices[p.next_voice_index];\n")

	fmt.sbprintf(sb, "\tp.next_voice_index = (p.next_voice_index + 1) %% %s;\n\n", polyphony_str)

	fmt.sbprint(sb, "\tvoice.is_active = true;\n")
	fmt.sbprint(sb, "\tvoice.note = note;\n")
	fmt.sbprint(sb, "\tvoice.target_freq = 440.0 * math.pow(2.0, (f32(note) - 69.0) / 12.0);\n")
	fmt.sbprint(sb, "\tvoice.time_active = 0.0;\n")
	fmt.sbprint(sb, "\tvoice.velocity = velocity;\n")
	fmt.sbprint(sb, "\tvoice.time_released = 0.0;\n\n")

	if has_adsr {
		fmt.sbprint(sb, "\t// Trigger ADSR envelopes\n")
		for node in subgraph_nodes {
			if strings.to_lower(node.type) == "adsr" {
				fmt.sbprintf(sb, "\tvoice.state.adsr_%d_stage = .Attack;\n", node.id)
			}
		}
	}
	fmt.sbprint(sb, "}\n\n")


	// --- note_off ---
	fmt.sbprintf(sb, "note_off_%s :: proc(p: ^AudioProcessor_%s, note: u8) {{\n", namespace_prefix, namespace_prefix)
	fmt.sbprintf(sb, "\tfor i in 0..<%s {{\n", polyphony_str)
	fmt.sbprint(sb, "\t\tvoice := &p.voices[i];\n")
	fmt.sbprint(sb, "\t\tif voice.is_active && voice.note == note {\n")
	fmt.sbprint(sb, "\t\t\tvoice.time_released = voice.time_active;\n")
	if has_adsr {
		for node in subgraph_nodes {
			if strings.to_lower(node.type) == "adsr" {
				fmt.sbprintf(sb, "\t\t\tvoice.state.adsr_%d_stage = .Release;\n", node.id)
			}
		}
	} else {
        // If there's no ADSR, the note should just stop immediately.
        fmt.sbprint(sb, "\t\t\tvoice.is_active = false;\n")
    }
	fmt.sbprint(sb, "\t\t}\n")
	fmt.sbprint(sb, "\t}\n")
	fmt.sbprint(sb, "}\n\n")
}


// generate_processor_code generates the Odin source code for the audio processor logic.
// It creates struct definitions, state management, and the `process_audio` function.
generate_processor_code :: proc(graph: ^Graph, instrument: ^Project_Instrument, namespace_prefix: string) -> string {
	
	// --- Extract Instrument Parameters ---
	polyphony := instrument.voice_count
	if polyphony <= 0 do polyphony = 1

    sb := strings.builder_make()
    // Caller converts to string, we return it.

	// --- Header ---
	fmt.sbprint(&sb, "package generated_audio\n\n")
	fmt.sbprint(&sb, "import \"core:math\"\n")
	fmt.sbprint(&sb, "import \"core:math/rand\"\n\n")

	// --- Struct Definitions ---
	fmt.sbprintf(&sb, "%s_Voice_State :: struct {\n", namespace_prefix)
	fmt.sbprint(&sb, "\tactive: bool,\n")
	fmt.sbprint(&sb, "\tnote: u8,\n")
	fmt.sbprint(&sb, "\tvelocity: f32,\n")
    fmt.sbprint(&sb, "\tage: f32,\n")
	fmt.sbprint(&sb, "\tcurrent_freq: f32,\n")
	fmt.sbprint(&sb, "\ttarget_freq: f32,\n")
	fmt.sbprint(&sb, "\tglide_time: f32,\n")

	// Generate state fields for nodes
	for _, node in graph.nodes {
		if node.type == "Oscillator" {
			fmt.sbprintf(&sb, "\tosc_%d_phase: [%d]f32,\n", node.id, instrument.unison) 
		} else if node.type == "ADSR" {
			fmt.sbprintf(&sb, "\tadsr_%d_stage: ADSR_Stage,\n", node.id)
			fmt.sbprintf(&sb, "\tadsr_%d_time: f32,\n", node.id)
			fmt.sbprintf(&sb, "\tadsr_%d_value: f32,\n", node.id)
            fmt.sbprintf(&sb, "\tadsr_%d_release_level: f32,\n", node.id)
		}
	}
	fmt.sbprint(&sb, "}\n\n")

	// --- Processor State ---
	fmt.sbprintf(&sb, "%s_Processor :: struct {\n", namespace_prefix)
	fmt.sbprintf(&sb, "\tsample_rate: f32,\n")
	fmt.sbprintf(&sb, "\tvoices: [%d]%s_Voice_State,\n", polyphony, namespace_prefix)
	fmt.sbprint(&sb, "\tnext_voice_idx: int,\n")
	fmt.sbprint(&sb, "\tprng: PRNG_State,\n")
	fmt.sbprint(&sb, "}\n\n")
	
	// --- Initialization ---
	fmt.sbprintf(&sb, "%s_init :: proc(p: ^%s_Processor, sr: f32) {\n", namespace_prefix, namespace_prefix)
	fmt.sbprint(&sb, "\tp.sample_rate = sr\n")
    fmt.sbprintf(&sb, "\tp.prng.state = 12345\n") 
	fmt.sbprint(&sb, "}\n\n")

	// --- Voice Management ---
	fmt.sbprintf(&sb, "%s_note_on :: proc(p: ^%s_Processor, note: u8, velocity: f32) {\n", namespace_prefix, namespace_prefix)
	fmt.sbprint(&sb, "\tvoice_idx := -1\n")
	fmt.sbprintf(&sb, "\tfor i in 0..<%d {\n", polyphony)
	fmt.sbprint(&sb, "\t\tif !p.voices[i].active {\n")
	fmt.sbprint(&sb, "\t\t\tvoice_idx = i\n")
	fmt.sbprint(&sb, "\t\t\tbreak\n")
	fmt.sbprint(&sb, "\t\t}\n")
	fmt.sbprint(&sb, "\t}\n")
	fmt.sbprint(&sb, "\tif voice_idx == -1 {\n")
	fmt.sbprint(&sb, "\t\tvoice_idx = p.next_voice_idx\n")
	fmt.sbprintf(&sb, "\t\tp.next_voice_idx = (p.next_voice_idx + 1) %% %d\n", polyphony)
	fmt.sbprint(&sb, "\t}\n\n")
	
	fmt.sbprint(&sb, "\tv := &p.voices[voice_idx]\n")
	fmt.sbprint(&sb, "\tv.active = true\n")
	fmt.sbprint(&sb, "\tv.note = note\n")
	fmt.sbprint(&sb, "\tv.velocity = velocity\n")
    fmt.sbprint(&sb, "\tv.age = 0.0\n")
    fmt.sbprint(&sb, "\tfreq := 440.0 * math.pow(2.0, (f32(note) - 69.0) / 12.0)\n")
	fmt.sbprint(&sb, "\tv.target_freq = freq\n")
	fmt.sbprint(&sb, "\tv.current_freq = freq\n") 
    fmt.sbprintf(&sb, "\tv.glide_time = %f\n", instrument.glide)
    
    // Reset Envelopes
	for _, node in graph.nodes {
		if node.type == "ADSR" {
			fmt.sbprintf(&sb, "\tv.adsr_%d_stage = .Attack\n", node.id)
			fmt.sbprintf(&sb, "\tv.adsr_%d_time = 0.0\n", node.id)
			fmt.sbprintf(&sb, "\tv.adsr_%d_value = 0.0\n", node.id)
		}
	}
	fmt.sbprint(&sb, "}\n\n")

	fmt.sbprintf(&sb, "%s_note_off :: proc(p: ^%s_Processor, note: u8) {\n", namespace_prefix, namespace_prefix)
	fmt.sbprintf(&sb, "\tfor i in 0..<%d {\n", polyphony)
	fmt.sbprint(&sb, "\t\tif p.voices[i].active && p.voices[i].note == note {\n")
    fmt.sbprint(&sb, "\t\t\treleasing := false\n")
	for _, node in graph.nodes {
		if node.type == "ADSR" {
			fmt.sbprintf(&sb, "\t\t\tp.voices[i].adsr_%d_stage = .Release\n", node.id)
            fmt.sbprintf(&sb, "\t\t\tp.voices[i].adsr_%d_release_level = p.voices[i].adsr_%d_value\n", node.id, node.id)
            fmt.sbprintf(&sb, "\t\t\tp.voices[i].adsr_%d_time = 0.0\n", node.id)
            fmt.sbprint(&sb, "\t\t\treleasing = true\n")
		}
	}
    fmt.sbprint(&sb, "\t\t\tif !releasing do p.voices[i].active = false\n")
	fmt.sbprint(&sb, "\t\t}\n")
	fmt.sbprint(&sb, "\t}\n")
	fmt.sbprint(&sb, "}\n\n")

	// --- Process Audio Function ---
	fmt.sbprintf(&sb, "%s_process :: proc(p: ^%s_Processor) -> f32 {\n", namespace_prefix, namespace_prefix)
	fmt.sbprint(&sb, "\tsample_rate := p.sample_rate\n")
	fmt.sbprint(&sb, "\toutput: f32 = 0.0\n")
	
	fmt.sbprintf(&sb, "\tfor v_idx in 0..<%d {\n", polyphony)
	fmt.sbprint(&sb, "\t\tvoice := &p.voices[v_idx]\n")
	fmt.sbprint(&sb, "\t\tif !voice.active do continue\n\n")
    
	// Variable declarations
	for _, node in graph.nodes {
		fmt.sbprintf(&sb, "\t\tnode_%d_out: f32 = 0.0\n", node.id)
	}
	fmt.sbprint(&sb, "\n")
	
    // --- Topological Sort & Generation ---
    sorted_nodes, _ := topological_sort(graph)
    defer delete(sorted_nodes)
    
    for node in sorted_nodes {
        switch node.type {
        case "Oscillator":
            // Fix: Pass 'instrument' pointer correctly
            generate_oscillator_code(&sb, node, graph, instrument)
        case "ADSR":
            generate_adsr_code(&sb, node, graph)
        case "Filter":
             generate_filter_code(&sb, node, graph)
        case "Gain":
             generate_gain_code(&sb, node, graph)
        case "Distortion":
             generate_distortion_code(&sb, node, graph)
        case "Delay":
             generate_delay_code(&sb, node, graph)
        case "Reverb":
             generate_reverb_code(&sb, node, graph)
        case "Noise":
             generate_noise_code(&sb, node, graph)
        case "Mapper":
             generate_mapper_code(&sb, node, graph)
        case "MidiInput":
             fmt.sbprintf(&sb, "\t\t// Midi Input Node %d\n", node.id)
             fmt.sbprintf(&sb, "\t\tnode_%d_out = voice.velocity\n\n", node.id)
        case "GraphOutput":
             if id, ok := find_input_for_port(graph, node.id, "input"); ok {
                  src := get_output_var(id)
                  fmt.sbprintf(&sb, "\t\toutput += %s\n", src)
             }
        }
    }
    
	fmt.sbprint(&sb, "\t}\n")
	fmt.sbprint(&sb, "\treturn output\n")
	fmt.sbprint(&sb, "}\n")

	return strings.to_string(sb)
}

// --- Project Level Generation ---
generate_project_code :: proc(project: ^Project, project_name: string, package_name: string) -> string {
    sb := strings.builder_make()
    // defer strings.builder_destroy(&sb)


    fmt.sbprintf(&sb, "package %s\n\n", package_name)
    fmt.sbprint(&sb, "import \"core:math\"\n")
    fmt.sbprint(&sb, "import \"core:math/rand\"\n")
    fmt.sbprint(&sb, "\n")

    // Define PRNG State struct globally once
    fmt.sbprint(&sb, "PRNG_State :: struct {\n")
    fmt.sbprint(&sb, "\tstate: u32,\n")
    fmt.sbprint(&sb, "}\n\n")
    fmt.sbprint(&sb, "next_float32 :: proc(rng: ^PRNG_State) -> f32 {\n")
    fmt.sbprint(&sb, "\tx := rng.state\n")
    fmt.sbprint(&sb, "\tx ^= x << 13\n")
    fmt.sbprint(&sb, "\tx ^= x >> 17\n")
    fmt.sbprint(&sb, "\tx ^= x << 5\n")
    fmt.sbprint(&sb, "\trng.state = x\n")
    fmt.sbprint(&sb, "\treturn f32(x) / 4294967296.0\n")
    fmt.sbprint(&sb, "}\n\n")
	
	// Define shared Enums (ADSR Stage)
	fmt.sbprint(&sb, "ADSR_Stage :: enum { Idle, Attack, Decay, Sustain, Release }\n\n")

    // Define Note_Event globally
	fmt.sbprint(&sb, "Note_Event :: struct {\n")
	fmt.sbprint(&sb, "\tnote: u8,\n")
	fmt.sbprint(&sb, "\tvelocity: f32,\n")
	fmt.sbprint(&sb, "\tstart_time: f32,\n")
	fmt.sbprint(&sb, "\tduration: f32,\n")
	fmt.sbprint(&sb, "}\n\n")


    for i in 0..<len(project.instruments) {
        inst := &project.instruments[i]
        // Clean name for usage in struct names
        clean_name, _ := strings.replace_all(inst.name, " ", "_")
        // Also handle empty names?
        if len(clean_name) == 0 do clean_name = fmt.tprintf("Instrument_%s", inst.id)

        // We need to call a modified generate_processor_code that APPENDS to sb instead of returning string.
        // Or we can just adapt the existing function logic here.
        // Actually, reusing logic is better.
        // The existing `generate_processor_code` prints package/imports which we don't want repeated.
        
        // Let's implement a `generate_instrument_structs` function by stripping the package header from `generate_processor_code`
        // ... or just copy-paste-modify for now since I can't easily refactor `generate_processor_code` without changing signature 
        // and I want to keep this constrained.
        
        // BETTER: Create a new internal function `generate_instrument_implementation` that takes an `sb` and writes to it.
        // But `generate_processor_code` is 300 lines.
        
        // For this task, I will rewrite `generate_processor_code` to accept an `sb` and option to skip header.
        // But `generate_processor_code` is used by `main.odin` (old path).
        
        // Strategy: I will copy the body of `generate_processor_code` into a helper `generate_instrument_implementation` 
        // and make `generate_processor_code` call it.
        // However, I can't easily do that with `replace_file_content` without rewriting the whole file.
        
        // Alternative: string manipulation.
        // Call `generate_processor_code`. It returns a string with "package ...".
        // Strip the first few lines.
        // Append to `sb`.
        // This is inefficient but safe and easy.

        code := generate_processor_code(&inst.graph, inst, clean_name)
        
        // Strip package and imports
        lines := strings.split(code, "\n")
        defer delete(lines)
        
        start_index := 0
        for line, idx in lines {
             if strings.contains(line, "Voice State") {
                 start_index = idx
                 break
             }
        }
        
        // Re-assemble
        for i in start_index..<len(lines) {
            fmt.sbprintln(&sb, lines[i])
        }
    }
    
    return strings.to_string(sb)
}
