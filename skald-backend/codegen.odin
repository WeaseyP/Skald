package skald_codegen

import "core:fmt"
import "core:strings"
import "core:math"
import rand "core:math/rand"

// =================================================================================
// SECTION D: Modular Code Generation Procedures
// =================================================================================

generate_oscillator_code :: proc(sb: ^strings.Builder, node: Node, graph: ^Graph, instrument: Node) {
	freq_str: string
	// Priority 1: Check for an input connection to the frequency port.
	if id, ok := find_input_for_port(graph, node.id, "input_freq"); ok {
		freq_str = get_output_var(id)
	} else {
		// Priority 2: Check for a fixed 'frequency' parameter on the node itself for drone behavior.
		if val, ok := node.parameters["frequency"]; ok {
			if f, ok2 := val.(f64); ok2 {
				freq_str = fmt.tprintf("%f", f)
			} else if i, ok2 := val.(i64); ok2 {
				freq_str = fmt.tprintf("%f", f64(i))
			} else {
				// Fallback if parameter has an unexpected type.
				freq_str = "voice.current_freq"
			}
		} else {
			// Priority 3: Default to the voice's current note frequency for standard synth behavior.
			freq_str = "voice.current_freq"
		}
	}

	amp_str  := get_f32_param(graph, node, "amplitude", "input_amp", 0.5)
	pw_str   := get_f32_param(graph, node, "pulseWidth", "input_pulseWidth", 0.5)
	phase_str:= get_f32_param(nil, node, "phase", "", 0.0)
	waveform := get_string_param(node, "waveform", "Sine")

	unison_count_str := get_int_param(nil, instrument, "unison", "", 1)
	detune_str := get_f32_param(nil, instrument, "detune", "", 5.0)

	fmt.sbprintf(sb, "\t\t// --- Oscillator Node %d (Unison/Detune) ---\n", node.id)
	fmt.sbprint(sb, "\t\t{\n")
	fmt.sbprintf(sb, "\t\t\tunison_out: f32 = 0.0;\n")
	fmt.sbprintf(sb, "\t\t\tunison_count := %s;\n", unison_count_str)
	fmt.sbprint(sb, "\t\t\tfor i in 0..<unison_count {\n")
	fmt.sbprint(sb, "\t\t\t\tdetune_amount: f32 = 0.0;\n")
	fmt.sbprintf(sb, "\t\t\t\tif unison_count > 1 do detune_amount = (f32(i) / (f32(unison_count) - 1.0) - 0.5) * 2.0 * (%s);\n", detune_str)
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
	fmt.sbprintf(sb, "\t\t\tswitch voice.state.adsr_%d_stage {\n", node.id)
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
	f_type     := get_string_param(node, "type", "LowPass")

	fmt.sbprintf(sb, "\t\t// --- Filter Node %d ---\n", node.id)
	fmt.sbprint(sb, "\t\t{\n")
	fmt.sbprintf(sb, "\t\t\tc_%d := 2.0 * f32(math.PI) * (%s) / sample_rate;\n", node.id, cutoff_str)
	fmt.sbprintf(sb, "\t\t\ta1_%d := math.exp(-c_%d);\n", node.id, node.id)
	fmt.sbprintf(sb, "\t\t\tb1_%d := 1.0 - a1_%d;\n", node.id, node.id)
	fmt.sbprintf(sb, "\t\t\tfiltered_sample_%d := (%s) * b1_%d + voice.state.filter_%d_z1 * a1_%d;\n", node.id, input_str, node.id, node.id, node.id)
	fmt.sbprintf(sb, "\t\t\tvoice.state.filter_%d_z1 = filtered_sample_%d;\n", node.id, node.id)

	switch f_type {
	case "HighPass":
		fmt.sbprintf(sb, "\t\t\tnode_%d_out = %s - filtered_sample_%d;\n", node.id, input_str, node.id)
	case: // "LowPass", "BandPass", "Notch" all default to lowpass for now
		fmt.sbprintf(sb, "\t\t\tnode_%d_out = filtered_sample_%d;\n", node.id, node.id)
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

// Generates note_on and note_off procedures for the test harness.
generate_note_on_off_code :: proc(sb: ^strings.Builder, subgraph_nodes: []Node, polyphony_str: string, has_adsr: bool) {
	fmt.sbprint(sb, "// --- Note On/Off Handlers ---\n")

	// --- note_on ---
	fmt.sbprint(sb, "note_on :: proc(p: ^AudioProcessor, note: u8, velocity: f32) {\n")
	fmt.sbprint(sb, "\t// Simple 'next available' voice stealing\n")
	fmt.sbprintf(sb, "\tvoice := &p.voices[p.next_voice_index];\n")
	fmt.sbprintf(sb, "\tp.next_voice_index = (p.next_voice_index + 1) %% %s;\n\n", polyphony_str)

	fmt.sbprint(sb, "\tvoice.is_active = true;\n")
	fmt.sbprint(sb, "\tvoice.note = note;\n")
	fmt.sbprint(sb, "\tvoice.target_freq = 440.0 * math.pow(2.0, (f32(note) - 69.0) / 12.0);\n")
	fmt.sbprint(sb, "\tvoice.time_active = 0.0;\n")
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
	fmt.sbprint(sb, "note_off :: proc(p: ^AudioProcessor, note: u8) {\n")
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


generate_processor_code :: proc(graph: ^Graph) -> string {
	instrument_node: Node
	found_instrument := false
	for _, node in graph.nodes {
		if node.type == "Instrument" {
			instrument_node = node
			found_instrument = true
			break
		}
	}
	if !found_instrument {
		return "// ERROR: No Instrument node found in the graph."
	}
	if instrument_node.subgraph == nil {
		return "// ERROR: Instrument node has no subgraph."
	}
	subgraph := instrument_node.subgraph
	sorted_nodes, is_dag := topological_sort(subgraph)
	if !is_dag {
		return "// ERROR: Instrument subgraph contains a cycle."
	}

	sb := strings.builder_make()
	defer strings.builder_destroy(&sb)

	polyphony_str := get_int_param(nil, instrument_node, "polyphony", "", 8)
	glide_time_str := get_f32_param(nil, instrument_node, "glideTime", "", 0.05)

	// --- Pre-scan subgraph for required features ---
	has_adsr := false
	needs_rand := false
	has_global_fx := false // New flag for shared effects
	for _, node in subgraph.nodes {
		node_type_lower := strings.to_lower(node.type)
		if node_type_lower == "adsr" {
			has_adsr = true
		}
		if node_type_lower == "noise" || node_type_lower == "samplehold" {
			needs_rand = true
		}
		if node_type_lower == "delay" || node_type_lower == "reverb" {
			has_global_fx = true
		}
	}

	// --- Generate Package and Imports ---
	fmt.sbprint(&sb, "package generated_audio\n\n")
	fmt.sbprint(&sb, "import \"core:math\"\n")
	if needs_rand {
		// Use the local PRNG instead of the core:rand package
	}
	fmt.sbprint(&sb, "\n")


	// --- Generate local PRNG if needed ---
	if needs_rand {
		fmt.sbprint(&sb, "// --- Local PRNG Implementation (xorshift32) ---\n")
		fmt.sbprint(&sb, "PRNG_State :: struct {\n")
		fmt.sbprint(&sb, "\tstate: u32,\n")
		fmt.sbprint(&sb, "}\n\n")
		fmt.sbprint(&sb, "// Generates the next u32 and updates the state.\n")
		fmt.sbprint(&sb, "next_u32 :: proc(rng: ^PRNG_State) -> u32 {\n")
		fmt.sbprint(&sb, "\tx := rng.state;\n")
		fmt.sbprint(&sb, "\tx = x ~ (x << 13);\n")
		fmt.sbprint(&sb, "\tx = x ~ (x >> 17);\n")
		fmt.sbprint(&sb, "\tx = x ~ (x << 5);\n")
		fmt.sbprint(&sb, "\trng.state = x;\n")
		fmt.sbprint(&sb, "\treturn x;\n")
		fmt.sbprint(&sb, "}\n\n")
		fmt.sbprint(&sb, "// Generates the next f32 in the range [-1.0, 1.0)\n")
		fmt.sbprint(&sb, "next_float32 :: proc(rng: ^PRNG_State) -> f32 {\n")
		fmt.sbprint(&sb, "\ti := next_u32(rng) >> 8;\n")
		fmt.sbprint(&sb, "\treturn (f32(i) / f32(1<<24)) * 2.0 - 1.0;\n")
		fmt.sbprint(&sb, "}\n\n")
	}


	// --- Voice State Generation ---
	fmt.sbprint(&sb, "// --- Voice State (Generated from Instrument subgraph) ---\n")
	fmt.sbprint(&sb, "Voice_State :: struct {\n")
	for node in sorted_nodes {
		node_type_lower := strings.to_lower(node.type)
		switch node_type_lower {
		case "oscillator":
			unison_count_str := get_int_param(nil, instrument_node, "unison", "", 1)
			fmt.sbprintf(&sb, "\tosc_%d_phase: [%s]f32,\n", node.id, unison_count_str)
		case "adsr":
			fmt.sbprintf(&sb, "\tadsr_%d_stage: ADSR_Stage,\n", node.id)
			fmt.sbprintf(&sb, "\tadsr_%d_level_at_release: f32,\n", node.id)
		case "noise":
			fmt.sbprintf(&sb, "\tnoise_%d_rng: PRNG_State,\n", node.id)
		case "filter":
			fmt.sbprintf(&sb, "\tfilter_%d_z1: f32,\n", node.id)
		case "lfo":
			fmt.sbprintf(&sb, "\tlfo_%d_phase: f32,\n", node.id)
		case "samplehold":
			fmt.sbprintf(&sb, "\tsh_%d_counter: u64,\n", node.id)
			fmt.sbprintf(&sb, "\tsh_%d_current_value: f32,\n", node.id)
			fmt.sbprintf(&sb, "\tsh_%d_rng: PRNG_State,\n", node.id)
		case "fmoperator":
			fmt.sbprintf(&sb, "\tfm_%d_phase: f32,\n", node.id)
		case "wavetable":
			fmt.sbprintf(&sb, "\twavetable_%d_phase: f32,\n", node.id)
		// State for delay and reverb is now global, so it's removed from here.
		}
	}
	fmt.sbprint(&sb, "}\n\n")

	if has_adsr {
		fmt.sbprint(&sb, "ADSR_Stage :: enum { Idle, Attack, Decay, Sustain, Release }\n\n")
	}

	fmt.sbprint(&sb, "Voice :: struct {\n")
	fmt.sbprint(&sb, "\tis_active: bool,\n")
	fmt.sbprint(&sb, "\tnote: u8,\n\ttarget_freq: f32,\n\tcurrent_freq: f32, // For glide\n")
	fmt.sbprint(&sb, "\ttime_active: f32,\n\ttime_released: f32,\n")
	fmt.sbprint(&sb, "\tstate: Voice_State,\n")
	fmt.sbprint(&sb, "}\n\n")

	fmt.sbprint(&sb, "AudioProcessor :: struct {\n")
	fmt.sbprintf(&sb, "\tvoices: [%s]Voice,\n", polyphony_str)
	fmt.sbprint(&sb, "\tnext_voice_index: int,\n")
	if has_adsr {
		fmt.sbprint(&sb, "\n\t// Instrument Parameters\n")
		fmt.sbprintf(&sb, "\tattack:           f32,\n")
		fmt.sbprintf(&sb, "\tdecay:            f32,\n")
		fmt.sbprintf(&sb, "\tsustain:          f32,\n")
		fmt.sbprintf(&sb, "\trelease:          f32,\n")
	}
	// Add global FX state here, outside the voice loop
	if has_global_fx {
		fmt.sbprint(&sb, "\n\t// Global Effects State\n")
		for node in sorted_nodes {
			node_type_lower := strings.to_lower(node.type)
			switch node_type_lower {
			case "delay", "reverb":
				fmt.sbprintf(&sb, "\tdelay_%d_buffer: [96000]f32,\n", node.id)
				fmt.sbprintf(&sb, "\tdelay_%d_write_index: int,\n", node.id)
			}
		}
	}
	fmt.sbprint(&sb, "}\n\n")

    generate_note_on_off_code(&sb, sorted_nodes, polyphony_str, has_adsr)

	// --- State Initialization ---
	fmt.sbprint(&sb, "init_processor :: proc(p: ^AudioProcessor) {\n")
	if has_adsr {
		attack_str  := "0.01"
		decay_str   := "0.2"
		sustain_str := "0.5"
		release_str := "1.0"
		for _, sub_node in subgraph.nodes {
			if sub_node.type == "ADSR" {
				attack_str  = get_f32_param(nil, sub_node, "attack", "", 0.01)
				decay_str   = get_f32_param(nil, sub_node, "decay", "", 0.2)
				sustain_str = get_f32_param(nil, sub_node, "sustain", "", 0.5)
				release_str = get_f32_param(nil, sub_node, "release", "", 1.0)
				break
			}
		}
		fmt.sbprint(&sb, "\t// Initialize default instrument parameters on the processor\n")
		fmt.sbprintf(&sb, "\tp.attack = %s;\n", attack_str)
		fmt.sbprintf(&sb, "\tp.decay = %s;\n", decay_str)
		fmt.sbprintf(&sb, "\tp.sustain = %s;\n", sustain_str)
		fmt.sbprintf(&sb, "\tp.release = %s;\n\n", release_str)
	}

	if needs_rand {
		fmt.sbprint(&sb, "\t// Initialize individual voice states\n")
		fmt.sbprintf(&sb, "\tfor i in 0..<%s {{\n", polyphony_str)
		fmt.sbprint(&sb, "\t\tv := &p.voices[i];\n")
		for node in sorted_nodes {
			node_type_lower := strings.to_lower(node.type)
			switch node_type_lower {
			case "noise":
				fmt.sbprintf(&sb, "\t\tv.state.noise_%d_rng.state = u32(i * 31 + 17) | 1;\n", node.id)
			case "samplehold":
				fmt.sbprintf(&sb, "\t\tv.state.sh_%d_rng.state = u32(i * 19 + 23) | 1;\n", node.id)
			}
		}
		fmt.sbprint(&sb, "\t}\n")
	}
	fmt.sbprint(&sb, "}\n\n")


	// --- Voice Processing Logic ---
	fmt.sbprint(&sb, "// Processes a single voice\n")
	// The signature now ALWAYS includes the processor `p` because effects might need it.
	fmt.sbprint(&sb, "process_voice :: proc(p: ^AudioProcessor, voice: ^Voice, sample_rate: f32) -> f32 {\n")

	for node in sorted_nodes {
		if strings.to_lower(node.type) == "panner" {
			fmt.sbprintf(&sb, "\tnode_%d_out_left: f32;\n", node.id)
			fmt.sbprintf(&sb, "\tnode_%d_out_right: f32;\n", node.id)
		} else {
			fmt.sbprintf(&sb, "\tnode_%d_out: f32;\n", node.id)
		}
	}
	fmt.sbprint(&sb, "\n")

	fmt.sbprintf(&sb, "\tglide_coeff := 1.0 - math.exp(-1.0 / (sample_rate * (%s) + 0.0001));\n", glide_time_str)
	fmt.sbprintf(&sb, "\tvoice.current_freq += (voice.target_freq - voice.current_freq) * glide_coeff;\n\n")

	for node in sorted_nodes {
		node_type_lower := strings.to_lower(node.type)
		switch node_type_lower {
		case "oscillator":
			generate_oscillator_code(&sb, node, subgraph, instrument_node)
		case "adsr":
			generate_adsr_code(&sb, node, subgraph)
		case "noise":
			generate_noise_code(&sb, node, subgraph)
		case "filter":
			generate_filter_code(&sb, node, subgraph)
		case "lfo":
			generate_lfo_code(&sb, node, subgraph)
		case "samplehold":
			generate_sample_hold_code(&sb, node, subgraph)
		case "fmoperator":
			generate_fm_operator_code(&sb, node, subgraph)
		case "wavetable":
			generate_wavetable_code(&sb, node, subgraph)
		case "delay":
			generate_delay_code(&sb, node, subgraph)
		case "reverb":
			generate_reverb_code(&sb, node, subgraph)
		case "distortion":
			generate_distortion_code(&sb, node, subgraph)
		case "mixer":
			generate_mixer_code(&sb, node, subgraph)
		case "panner":
			generate_panner_code(&sb, node, subgraph)
		case "graphinput":
			input_name_val := get_string_param(node, "name", "gate")
			if input_name_val == "gate" {
				fmt.sbprintf(&sb, "\tnode_%d_out = 1.0; // Default for Gate GraphInput\n\n", node.id)
			} else {
				fmt.sbprintf(&sb, "\tnode_%d_out = 0.0; // Default for other GraphInput\n\n", node.id)
			}
		}
	}

	subgraph_output_id := -1
	for node in sorted_nodes {
		if strings.to_lower(node.type) == "graphoutput" {
			if id, ok := find_input_for_port(subgraph, node.id, "input"); ok {
				subgraph_output_id = id
				break
			}
		}
	}

	if subgraph_output_id != -1 {
		is_panner_output := false
		if output_node, ok := subgraph.nodes[subgraph_output_id]; ok {
			if strings.to_lower(output_node.type) == "panner" {
				is_panner_output = true
			}
		}

		if is_panner_output {
			fmt.sbprintf(&sb, "\treturn (node_%d_out_left + node_%d_out_right) * 0.5;\n", subgraph_output_id, subgraph_output_id)
		} else {
			fmt.sbprintf(&sb, "\treturn node_%d_out;\n", subgraph_output_id)
		}
	} else {
		fmt.sbprint(&sb, "\treturn 0.0; // No valid subgraph output found\n")
	}

	fmt.sbprint(&sb, "}\n\n")

	// --- Main Sample Processing ---
	fmt.sbprint(&sb, "// --- Main Processing Function ---\n")
	fmt.sbprint(&sb, "process_sample :: proc(p: ^AudioProcessor, sample_rate: f32, time: u64) -> (left: f32, right: f32) {\n")
	fmt.sbprint(&sb, "\toutput_left: f32 = 0.0;\n")
	fmt.sbprint(&sb, "\toutput_right: f32 = 0.0;\n")
	fmt.sbprint(&sb, "\t// NOTE: Event scheduling logic to trigger voices would go here, driven by a Note_Event array.\n")
	fmt.sbprintf(&sb, "\tfor i in 0..<%s {{\n", polyphony_str)
	fmt.sbprint(&sb, "\t\tvoice := &p.voices[i];\n")
	fmt.sbprint(&sb, "\t\tif voice.is_active {\n")
	// Always pass 'p' now, as global effects might be present.
	fmt.sbprint(&sb, "\t\t\tmono_out := process_voice(p, voice, sample_rate);\n")
	fmt.sbprint(&sb, "\t\t\toutput_left += mono_out;\n")
	fmt.sbprint(&sb, "\t\t\toutput_right += mono_out;\n")
	fmt.sbprint(&sb, "\t\t\tvoice.time_active += 1.0 / sample_rate;\n")
	fmt.sbprint(&sb, "\t\t}\n")
	fmt.sbprint(&sb, "\t}\n")
	fmt.sbprintf(&sb, "\treturn output_left, output_right;\n")
	fmt.sbprint(&sb, "}\n")

	return strings.to_string(sb)
}
