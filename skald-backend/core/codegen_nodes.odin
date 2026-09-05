package skald_core

import "core:fmt"
import "core:math"
import "core:strings"
import "core:strconv"
import json "core:encoding/json"

generate_oscillator_code :: proc(sb: ^strings.Builder, node: Node, graph: ^Graph, plan: ^Instrument_Plan, instrument: ^Project_Instrument) {
	freq_str: string
	base_freq_str := "voice.current_freq"
	if get_bool_param(node, "fixedPitch", false) {
		base_freq_str = get_f32_param(graph, plan, node, "frequency", "", 440.0)
	}

	input_sum_str := "0.0"
	if graph != nil {
        sources := find_inputs_for_port(graph, node.id, "input_freq")
        defer delete(sources)
        if len(sources) > 0 {
            sb_sum := strings.builder_make()
            defer strings.builder_destroy(&sb_sum)
            for src, i in sources {
                v := get_output_var(src.id, src.port)
                if i == 0 do fmt.sbprint(&sb_sum, v)
                else do fmt.sbprintf(&sb_sum, " + %s", v)
            }
            input_sum_str = strings.to_string(sb_sum)
        }
    }
    
    if input_sum_str != "0.0" {
		freq_str = fmt.tprintf("(%s) * math.pow(2.0, math.clamp(f32(%s), -10.0, 10.0))", base_freq_str, input_sum_str)
	} else {
		freq_str = base_freq_str
	}

	amp_str  := get_f32_param(graph, plan, node, "amplitude", "input_amp", 0.5)
	pw_str   := get_f32_param(graph, plan, node, "pulseWidth", "input_pulseWidth", 0.5)
	phase_str:= get_f32_param(graph, plan, node, "phase", "", 0.0)
	waveform := get_string_param(node, "waveform", "Sine")

	unison_count := instrument.unison
	if unison_count <= 0 do unison_count = 1
	detune_amount := instrument.detune

	fmt.sbprintf(sb, "\t\t// --- Oscillator Node %s (Unison/Detune) ---\n", node.id)
	fmt.sbprint(sb, "\t\t{\n")
	fmt.sbprintf(sb, "\t\t\tunison_out: f32 = 0.0;\n")
	fmt.sbprintf(sb, "\t\t\tunison_count := %d;\n", unison_count)
	fmt.sbprint(sb, "\t\t\tfor i in 0..<unison_count {\n")
	fmt.sbprint(sb, "\t\t\t\tdetune_amount: f32 = 0.0;\n")
	fmt.sbprintf(sb, "\t\t\t\tif unison_count > 1 do detune_amount = (f32(i) / (f32(unison_count) - 1.0) - 0.5) * 2.0 * (%.9f);\n", detune_amount)
	emit_f32_local(sb, "\t\t\t\t", "detuned_freq", fmt.tprintf("(%s) * math.pow(2.0, detune_amount / 1200.0)", freq_str))
	emit_f32_local(sb, "\t\t\t\t", "phase_rads", fmt.tprintf("f32(%s) * (f32(math.PI) / 180.0)", phase_str))
	fmt.sbprintf(sb, "\t\t\t\tvoice.osc_%s_phase[i] = math.mod(voice.osc_%s_phase[i] + (2 * f32(math.PI) * detuned_freq / sample_rate), 2 * f32(math.PI));\n", node.id, node.id)
	fmt.sbprintf(sb, "\t\t\t\tfinal_phase := math.mod(voice.osc_%s_phase[i] + phase_rads, 2 * f32(math.PI));\n", node.id)

	switch waveform {
	case "Sawtooth":
		fmt.sbprint(sb, "\t\t\t\tunison_out += ((final_phase / f32(math.PI)) - 1.0);\n")
	case "Square":
		fmt.sbprintf(
			sb,
			"\t\t\t\tif final_phase < 2 * f32(math.PI) * math.clamp(f32(%s), 0.01, 0.99) do unison_out += 1.0; else do unison_out -= 1.0;\n",
			pw_str,
		)
	case "Triangle":
		fmt.sbprint(sb, "\t\t\t\tunison_out += (2.0 / f32(math.PI)) * math.asin(math.sin(final_phase));\n")
	case: // Default to Sine
		fmt.sbprint(sb, "\t\t\t\tunison_out += math.sin(final_phase);\n")
	}

	fmt.sbprint(sb, "\t\t\t}\n") 
	fmt.sbprintf(sb, "\t\t\tnode_%s_out = (unison_out / f32(unison_count)) * (%s);\n", node.id, amp_str)
	fmt.sbprint(sb, "\t\t}\n\n")
}

generate_adsr_code :: proc(sb: ^strings.Builder, node: Node, graph: ^Graph, plan: ^Instrument_Plan) {
	input_str := "1.0"
    if graph != nil {
        sources := find_inputs_for_port(graph, node.id, "input")
        defer delete(sources)
        if len(sources) > 0 {
            sb_sum := strings.builder_make()
            defer strings.builder_destroy(&sb_sum)
            for src, i in sources {
                v := get_output_var(src.id, src.port)
                if i == 0 do fmt.sbprint(&sb_sum, v)
                else do fmt.sbprintf(&sb_sum, " + %s", v)
            }
            input_str = fmt.tprintf("(%s)", strings.to_string(sb_sum))
        }
    }

	depth_str := get_f32_param(graph, plan, node, "depth", "", 1.0)
    attack_str  := get_f32_param(graph, plan, node, "attack", "input_attack", 0.01)
    decay_str   := get_f32_param(graph, plan, node, "decay", "input_decay", 0.1)
    sustain_str := get_f32_param(graph, plan, node, "sustain", "input_sustain", 0.7)
    release_str := get_f32_param(graph, plan, node, "release", "input_release", 0.1)
    vs_str      := get_f32_param(graph, plan, node, "velocitySensitivity", "", 0.5)

	fmt.sbprintf(sb, "\t\t// --- ADSR Node %s ---\n", node.id)
	fmt.sbprint(sb, "\t\t{\n")
	fmt.sbprint(sb, "\t\t\tenvelope: f32 = 0.0;\n")
	fmt.sbprintf(sb, "\t\t\tswitch voice.adsr_%s_stage {{\n", node.id)
	fmt.sbprint(sb, "\t\t\tcase .Idle:\n")
	fmt.sbprint(sb, "\t\t\t\tenvelope = 0.0;\n")
	fmt.sbprint(sb, "\t\t\tcase .Attack:\n")
	fmt.sbprintf(sb, "\t\t\t\tif (%s) > 0 do envelope = voice.adsr_%s_attack_start + (1.0 - voice.adsr_%s_attack_start) * (voice.age / math.max(f32(%s), 0.000001)); else do envelope = 1.0;\n", attack_str, node.id, node.id, attack_str)
	fmt.sbprintf(sb, "\t\t\t\tvoice.adsr_%s_release_level = envelope;\n", node.id)
	fmt.sbprintf(sb, "\t\t\t\tif voice.age >= (%s) {{\n", attack_str)
	fmt.sbprintf(sb, "\t\t\t\t\tvoice.adsr_%s_stage = .Decay;\n", node.id)
	fmt.sbprint(sb, "\t\t\t\t}\n")
	fmt.sbprint(sb, "\t\t\tcase .Decay:\n")
	fmt.sbprintf(sb, "\t\t\t\ttime_in_decay := voice.age - (%s);\n", attack_str)
	fmt.sbprintf(sb, "\t\t\t\tif (%s) > 0 do envelope = 1.0 - (time_in_decay / math.max(f32(%s), 0.000001)) * (1.0 - (%s)); else do envelope = (%s);\n", decay_str, decay_str, sustain_str, sustain_str)
	fmt.sbprintf(sb, "\t\t\t\tvoice.adsr_%s_release_level = envelope;\n", node.id)
	fmt.sbprintf(sb, "\t\t\t\tif time_in_decay >= (%s) {{\n", decay_str)
	fmt.sbprintf(sb, "\t\t\t\t\tvoice.adsr_%s_stage = .Sustain;\n", node.id)
	fmt.sbprint(sb, "\t\t\t\t}\n")
	fmt.sbprint(sb, "\t\t\tcase .Sustain:\n")
	fmt.sbprintf(sb, "\t\t\t\tenvelope = (%s);\n", sustain_str)
	fmt.sbprintf(sb, "\t\t\t\tvoice.adsr_%s_release_level = envelope;\n", node.id)
	// C6-4 (SKB-041): Sustain used to jump straight to Idle when the level was
	// <= 0.0001 — and an Idle envelope marks the whole voice inactive, so a
	// held note whose ADSR only shaped a filter went silent at the end of the
	// decay, and the Release the UI draws never ran. A sustain of 0 is a
	// level, not an end: the stage now waits for note_off/duration like any
	// other, and the one-shot _trigger already auto-releases at attack+decay.
	fmt.sbprint(sb, "\t\t\tcase .Release:\n")
	fmt.sbprint(sb, "\t\t\t\ttime_in_release := voice.age - voice.time_released;\n")
	fmt.sbprintf(sb, "\t\t\t\tif (%s) > 0 do envelope = voice.adsr_%s_release_level * (1.0 - (time_in_release / math.max(f32(%s), 0.000001))); else do envelope = 0.0;\n", release_str, node.id, release_str)
	fmt.sbprint(sb, "\t\t\t\tif envelope <= 0 {\n")
	fmt.sbprint(sb, "\t\t\t\t\tenvelope = 0;\n")
	fmt.sbprintf(sb, "\t\t\t\t\tvoice.adsr_%s_stage = .Idle;\n", node.id)
	fmt.sbprint(sb, "\t\t\t\t}\n")
	fmt.sbprint(sb, "\t\t\t}\n")
	emit_f32_local(sb, "\t\t\t", fmt.tprintf("vel_scale_%s", node.id), fmt.tprintf("(1.0 - (%s)) + (%s) * voice.velocity", vs_str, vs_str))
	fmt.sbprintf(sb, "\t\t\tnode_%s_out = (%s) * envelope * (%s) * vel_scale_%s;\n", node.id, input_str, depth_str, node.id)
	fmt.sbprint(sb, "\t\t}\n\n")
}

noise_is_pink :: proc(node: Node) -> bool {
	t := get_string_param(node, "type", "White")
	return strings.to_lower(t, context.temp_allocator) == "pink"
}

generate_noise_code :: proc(sb: ^strings.Builder, node: Node, graph: ^Graph, plan: ^Instrument_Plan, sp: string) {
	amp_str := get_f32_param(graph, plan, node, "amplitude", "input_amp", 1.0)
	fmt.sbprintf(sb, "\t\t// --- Noise Node %s ---\n", node.id)
	if noise_is_pink(node) {
		fmt.sbprint(sb, "\t\t{\n")
		fmt.sbprintf(sb, "\t\t\twhite_%s := next_float32(&%snoise_%s_rng) * 2.0 - 1.0;\n", node.id, sp, node.id)
		fmt.sbprintf(sb, "\t\t\t%snoise_%s_p0 = 0.99765 * %snoise_%s_p0 + white_%s * 0.0990460;\n", sp, node.id, sp, node.id, node.id)
		fmt.sbprintf(sb, "\t\t\t%snoise_%s_p1 = 0.96300 * %snoise_%s_p1 + white_%s * 0.2965164;\n", sp, node.id, sp, node.id, node.id)
		fmt.sbprintf(sb, "\t\t\t%snoise_%s_p2 = 0.57000 * %snoise_%s_p2 + white_%s * 1.0526913;\n", sp, node.id, sp, node.id, node.id)
		fmt.sbprintf(sb, "\t\t\tnode_%s_out = (%snoise_%s_p0 + %snoise_%s_p1 + %snoise_%s_p2 + white_%s * 0.1848) * 0.25 * (%s);\n", node.id, sp, node.id, sp, node.id, sp, node.id, node.id, amp_str)
		fmt.sbprint(sb, "\t\t}\n\n")
	} else {
		fmt.sbprintf(sb, "\t\tnode_%s_out = (next_float32(&%snoise_%s_rng) * 2.0 - 1.0) * (%s);\n\n", node.id, sp, node.id, amp_str)
	}
}

generate_filter_code :: proc(sb: ^strings.Builder, node: Node, graph: ^Graph, plan: ^Instrument_Plan, sp: string) {
	input_str := sum_port_inputs(graph, node.id, "input", "0.0")
	cutoff_str := get_f32_param(graph, plan, node, "cutoff", "input_cutoff", 1000.0)
	res_str    := get_f32_param(graph, plan, node, "resonance", "input_res", 1.0)
	f_type     := get_string_param(node, "type", "LowPass")

	fmt.sbprintf(sb, "\t\t// --- Filter Node %s (SVF) ---\n", node.id)
	fmt.sbprint(sb, "\t\t{\n")
	emit_f32_local(sb, "\t\t\t", fmt.tprintf("cutoff_c_%s", node.id), fmt.tprintf("math.clamp(f32(%s), 10.0, sample_rate * 0.16)", cutoff_str))
	fmt.sbprintf(sb, "\t\t\tf_%s := f32(2.0 * math.sin(f32(math.PI) * cutoff_c_%s / sample_rate));\n", node.id, node.id)
	emit_f32_local(sb, "\t\t\t", fmt.tprintf("q_%s", node.id), fmt.tprintf("math.clamp(1.0 / math.max(f32(%s), 0.1), 0.05, 1.9 - f_%s)", res_str, node.id))

	fmt.sbprintf(sb, "\t\t\t%sfilter_%s_low += f_%s * %sfilter_%s_band;\n", sp, node.id, node.id, sp, node.id)
	fmt.sbprintf(sb, "\t\t\thigh_%s := f32((%s) - %sfilter_%s_low - q_%s * %sfilter_%s_band);\n", node.id, input_str, sp, node.id, node.id, sp, node.id)
	fmt.sbprintf(sb, "\t\t\t%sfilter_%s_band += f_%s * high_%s;\n", sp, node.id, node.id, node.id)

	switch strings.to_lower(f_type, context.temp_allocator) {
	case "highpass":
		fmt.sbprintf(sb, "\t\t\tnode_%s_out = high_%s;\n", node.id, node.id)
	case "bandpass":
		fmt.sbprintf(sb, "\t\t\tnode_%s_out = %sfilter_%s_band;\n", node.id, sp, node.id)
	case "notch":
		fmt.sbprintf(sb, "\t\t\tnode_%s_out = high_%s + %sfilter_%s_low;\n", node.id, node.id, sp, node.id)
	case: // Lowpass
		fmt.sbprintf(sb, "\t\t\tnode_%s_out = %sfilter_%s_low;\n", node.id, sp, node.id)
	}
	fmt.sbprint(sb, "\t\t}\n\n")
}

generate_lfo_code :: proc(sb: ^strings.Builder, node: Node, graph: ^Graph, plan: ^Instrument_Plan, sp: string) {
	freq_str := get_f32_param(graph, plan, node, "frequency", "", 5.0)
	if sec_expr, synced := bpm_sync_seconds_expr(node); synced {
		freq_str = fmt.tprintf("(1.0 / %s)", sec_expr)
	}
	amp_str  := get_f32_param(graph, plan, node, "amplitude", "", 1.0)
	waveform := get_string_param(node, "waveform", "Sine")

	fmt.sbprintf(sb, "\t\t// --- LFO Node %s ---\n", node.id)
	fmt.sbprintf(sb, "\t\t%slfo_%s_phase = math.mod(%slfo_%s_phase + (2 * f32(math.PI) * (%s) / sample_rate), 2 * f32(math.PI));\n", sp, node.id, sp, node.id, freq_str)
	fmt.sbprintf(sb, "\t\tif %slfo_%s_phase < 0.0 do %slfo_%s_phase += 2 * f32(math.PI);\n", sp, node.id, sp, node.id)

	switch waveform {
	case "Sawtooth":
		fmt.sbprintf(sb, "\t\tnode_%s_out = ((%slfo_%s_phase / f32(math.PI)) - 1.0) * (%s);\n\n", node.id, sp, node.id, amp_str)
	case "Square":
		fmt.sbprintf(sb, "\t\tif math.sin(%slfo_%s_phase) > 0 do node_%s_out = %s; else do node_%s_out = -%s;\n\n", sp, node.id, node.id, amp_str, node.id, amp_str)
	case "Triangle":
		fmt.sbprintf(sb, "\t\tnode_%s_out = (2.0 / f32(math.PI)) * math.asin(math.sin(%slfo_%s_phase)) * (%s);\n\n", node.id, sp, node.id, amp_str)
	case: // "Sine"
		fmt.sbprintf(sb, "\t\tnode_%s_out = math.sin(%slfo_%s_phase) * (%s);\n\n", node.id, sp, node.id, amp_str)
	}
}

generate_sample_hold_code :: proc(sb: ^strings.Builder, node: Node, graph: ^Graph, plan: ^Instrument_Plan, sp: string) {
	rate_str := get_f32_param(graph, plan, node, "rate", "", 10.0)
	if sec_expr, synced := bpm_sync_seconds_expr(node); synced {
		rate_str = fmt.tprintf("(1.0 / %s)", sec_expr)
	}
	amp_str  := get_f32_param(graph, plan, node, "amplitude", "", 1.0)
	fmt.sbprintf(sb, "\t\t// --- Sample & Hold Node %s ---\n", node.id)
	fmt.sbprintf(sb, "\t\t%ssh_%s_counter += 1;\n", sp, node.id)
	fmt.sbprintf(sb, "\t\tupdate_interval_%s := u64(sample_rate / math.max(f32(%s), 0.1));\n", node.id, rate_str)
	fmt.sbprintf(sb, "\t\tif %ssh_%s_counter >= update_interval_%s {{\n", sp, node.id, node.id)
	fmt.sbprintf(sb, "\t\t\t%ssh_%s_current_value = next_float32(&%ssh_%s_rng) * 2.0 - 1.0;\n", sp, node.id, sp, node.id)
	fmt.sbprintf(sb, "\t\t\t%ssh_%s_counter = 0;\n", sp, node.id)
	fmt.sbprint(sb, "\t\t}\n")
	fmt.sbprintf(sb, "\t\tnode_%s_out = %ssh_%s_current_value * (%s);\n\n", node.id, sp, node.id, amp_str)
}

generate_fm_operator_code :: proc(sb: ^strings.Builder, node: Node, graph: ^Graph, plan: ^Instrument_Plan, instrument: ^Project_Instrument) {
	mod_str := "0.0"
	if graph != nil {
        sources := find_inputs_for_port(graph, node.id, "input_mod")
        defer delete(sources)
        if len(sources) > 0 {
            sb_sum := strings.builder_make()
            defer strings.builder_destroy(&sb_sum)
            for src, i in sources {
                v := get_output_var(src.id, src.port)
                if i == 0 do fmt.sbprint(&sb_sum, v)
                else do fmt.sbprintf(&sb_sum, " + %s", v)
            }
            mod_str = fmt.tprintf("(%s)", strings.to_string(sb_sum))
        }
    }

	carrier_base_freq_str := "voice.current_freq"
	carrier_mod_str := ""
	if graph != nil {
		sources := find_inputs_for_port(graph, node.id, "input_carrier")
		defer delete(sources)
		freq_sources := find_inputs_for_port(graph, node.id, "input_freq")
		defer delete(freq_sources)
		for src in freq_sources do append(&sources, src)
		if len(sources) > 0 {
			sb_sum := strings.builder_make()
			defer strings.builder_destroy(&sb_sum)
			for src, i in sources {
				v := get_output_var(src.id, src.port)
				if i == 0 do fmt.sbprint(&sb_sum, v)
				else do fmt.sbprintf(&sb_sum, " + %s", v)
			}
			carrier_mod_str = fmt.tprintf(" * math.pow(2.0, math.clamp(f32(%s), -10.0, 10.0))", strings.to_string(sb_sum))
		}
	}

	ratio_str := get_f32_param(graph, plan, node, "frequency", "", 1.0)
	mod_index_str := get_f32_param(graph, plan, node, "modIndex", "", 100.0)

	unison_count := instrument.unison
	if unison_count <= 0 do unison_count = 1
	detune_amount := instrument.detune

	fmt.sbprintf(sb, "\t\t// --- FM Operator Node %s (Unison/Detune) ---\n", node.id)
	fmt.sbprint(sb, "\t\t{\n")
	emit_f32_local(sb, "\t\t\t", fmt.tprintf("carrier_freq_%s", node.id), fmt.tprintf("%s * math.clamp(f32(%s), 0.01, 32.0)%s", carrier_base_freq_str, ratio_str, carrier_mod_str))
	fmt.sbprintf(sb, "\t\t\tunison_out: f32 = 0.0;\n")
	fmt.sbprintf(sb, "\t\t\tunison_count := %d;\n", unison_count)
	fmt.sbprint(sb, "\t\t\tfor i in 0..<unison_count {\n")
	fmt.sbprint(sb, "\t\t\t\tdetune_amount: f32 = 0.0;\n")
	fmt.sbprintf(sb, "\t\t\t\tif unison_count > 1 do detune_amount = (f32(i) / (f32(unison_count) - 1.0) - 0.5) * 2.0 * (%.9f);\n", detune_amount)
	emit_f32_local(sb, "\t\t\t\t", fmt.tprintf("detuned_carrier_freq_%s", node.id), fmt.tprintf("carrier_freq_%s * math.pow(2.0, detune_amount / 1200.0)", node.id))
	fmt.sbprintf(sb, "\t\t\t\tvoice.fm_%s_phase[i] = math.mod(voice.fm_%s_phase[i] + (2 * f32(math.PI) * detuned_carrier_freq_%s / sample_rate), 2 * f32(math.PI));\n", node.id, node.id, node.id)
	fmt.sbprintf(sb, "\t\t\t\tunison_out += math.sin(voice.fm_%s_phase[i] + (%s) * (%s));\n", node.id, mod_str, mod_index_str)
	fmt.sbprint(sb, "\t\t\t}\n")
	fmt.sbprintf(sb, "\t\t\tnode_%s_out = unison_out / f32(unison_count);\n", node.id)
	fmt.sbprint(sb, "\t\t}\n\n")
}

generate_wavetable_code :: proc(sb: ^strings.Builder, node: Node, graph: ^Graph, plan: ^Instrument_Plan, instrument: ^Project_Instrument) {
	base_freq_str := "voice.current_freq"
	if get_bool_param(node, "fixedPitch", false) {
		base_freq_str = get_f32_param(graph, plan, node, "frequency", "", 440.0)
	}
	freq_str := base_freq_str
	if graph != nil {
		sources := find_inputs_for_port(graph, node.id, "input_freq")
		defer delete(sources)
		if len(sources) > 0 {
			sb_sum := strings.builder_make()
			defer strings.builder_destroy(&sb_sum)
			for src, i in sources {
				v := get_output_var(src.id, src.port)
				if i == 0 do fmt.sbprint(&sb_sum, v)
				else do fmt.sbprintf(&sb_sum, " + %s", v)
			}
			freq_str = fmt.tprintf("(%s) * math.pow(2.0, math.clamp(f32(%s), -10.0, 10.0))", base_freq_str, strings.to_string(sb_sum))
		}
	}
	pos_str := get_f32_param(graph, plan, node, "position", "input_pos", 0.0)
	amp_str := get_f32_param(graph, plan, node, "amplitude", "input_amp", 1.0)

	unison_count := instrument.unison
	if unison_count <= 0 do unison_count = 1
	detune_amount := instrument.detune

	fmt.sbprintf(sb, "\t\t// --- Wavetable Node %s (Unison/Detune) ---\n", node.id)
	fmt.sbprint(sb, "\t\t{\n")
	fmt.sbprintf(sb, "\t\t\tunison_out: f32 = 0.0;\n")
	fmt.sbprintf(sb, "\t\t\tunison_count := %d;\n", unison_count)
	fmt.sbprint(sb, "\t\t\tfor i in 0..<unison_count {\n")
	fmt.sbprint(sb, "\t\t\t\tdetune_amount: f32 = 0.0;\n")
	fmt.sbprintf(sb, "\t\t\t\tif unison_count > 1 do detune_amount = (f32(i) / (f32(unison_count) - 1.0) - 0.5) * 2.0 * (%.9f);\n", detune_amount)
	emit_f32_local(sb, "\t\t\t\t", "detuned_freq", fmt.tprintf("(%s) * math.pow(2.0, detune_amount / 1200.0)", freq_str))
	fmt.sbprintf(sb, "\t\t\t\tvoice.wavetable_%s_phase[i] = math.mod(voice.wavetable_%s_phase[i] + (detuned_freq / sample_rate), 1.0);\n", node.id, node.id)
	fmt.sbprintf(sb, "\t\t\t\tif voice.wavetable_%s_phase[i] < 0.0 do voice.wavetable_%s_phase[i] += 1.0;\n", node.id, node.id)
	fmt.sbprintf(sb, "\t\t\t\tunison_out += skald_wavetable_sample(voice.wavetable_%s_phase[i], f32(%s));\n", node.id, pos_str)
	fmt.sbprint(sb, "\t\t\t}\n")
	fmt.sbprintf(sb, "\t\t\tnode_%s_out = (unison_out / f32(unison_count)) * (%s);\n", node.id, amp_str)
	fmt.sbprint(sb, "\t\t}\n\n")
}

generate_delay_code :: proc(sb: ^strings.Builder, node: Node, graph: ^Graph, plan: ^Instrument_Plan) {
	input_str := sum_port_inputs(graph, node.id, "input", "0.0")
	time_str    := get_f32_param(graph, plan, node, "delayTime", "", 0.5)
	if sec_expr, synced := bpm_sync_seconds_expr(node); synced {
		time_str = sec_expr
	}
	fdbk_str    := get_f32_param(graph, plan, node, "feedback", "", 0.5)
	mix_str     := get_f32_param(graph, plan, node, "mix", "", 0.5)
	if _, has_mix := node.parameters["mix"]; !has_mix {
		mix_str = get_f32_param(graph, plan, node, "wetDryMix", "", 0.5)
	}

	fmt.sbprintf(sb, "\t\t// --- Delay Node %s ---\n", node.id)
	fmt.sbprint(sb, "\t\t{\n")
	fmt.sbprintf(sb, "\t\t\tdelay_samples_%s := int(math.clamp((%s) * sample_rate, 1, %d-1));\n", node.id, time_str, MAX_DELAY_SAMPLES)
	fmt.sbprintf(sb, "\t\t\tread_index_%s := (p.delay_%s_write_index - delay_samples_%s + len(p.delay_%s_buffer)) %% len(p.delay_%s_buffer);\n", node.id, node.id, node.id, node.id, node.id)
	fmt.sbprintf(sb, "\t\t\tdelayed_sample_%s := p.delay_%s_buffer[read_index_%s];\n", node.id, node.id, node.id)
	fmt.sbprintf(sb, "\t\t\tp.delay_%s_buffer[p.delay_%s_write_index] = (%s) + delayed_sample_%s * math.clamp(f32(%s), 0.0, 0.95);\n", node.id, node.id, input_str, node.id, fdbk_str)
	fmt.sbprintf(sb, "\t\t\tp.delay_%s_write_index = (p.delay_%s_write_index + 1) %% len(p.delay_%s_buffer);\n", node.id, node.id, node.id)
	fmt.sbprintf(sb, "\t\t\tnode_%s_out = (%s) * (1.0 - (%s)) + delayed_sample_%s * (%s);\n", node.id, input_str, mix_str, node.id, mix_str)
	fmt.sbprint(sb, "\t\t}\n\n")
}

generate_reverb_code :: proc(sb: ^strings.Builder, node: Node, graph: ^Graph, plan: ^Instrument_Plan) {
	input_str := sum_port_inputs(graph, node.id, "input", "0.0")

	decay_str     := get_f32_param(graph, plan, node, "decay", "", 0.5)
	pre_delay_str := get_f32_param(graph, plan, node, "preDelay", "", 0.02)
	mix_str       := get_f32_param(graph, plan, node, "mix", "", 0.5)

	// B7-x1: shared with the tail-length analysis and the runtime live-tail
	// proc via REVERB_COMB_SECONDS — see its doc comment in
	// codegen_analysis.odin.
	delay_time := REVERB_COMB_SECONDS

	fmt.sbprintf(sb, "\t\t// --- Reverb Node %s (pre-delay + feedback comb) ---\n", node.id)
	fmt.sbprint(sb, "\t\t{\n")
	emit_f32_local(sb, "\t\t\t", fmt.tprintf("pre_delay_seconds_%s", node.id), fmt.tprintf("math.clamp(f32(%s), 0.0, 0.25)", pre_delay_str))
	fmt.sbprintf(sb, "\t\t\tpre_delay_samples_%s := int(math.clamp(pre_delay_seconds_%s * sample_rate, 0.0, f32(%d)));\n", node.id, node.id, MAX_REVERB_PREDELAY_SAMPLES)
	fmt.sbprintf(sb, "\t\t\tpre_write_index_%s := p.delay_%s_write_index %% len(p.reverb_%s_pre_buffer)\n", node.id, node.id, node.id)
	fmt.sbprintf(sb, "\t\t\tpre_delayed_input_%s := f32(%s)\n", node.id, input_str)
	fmt.sbprintf(sb, "\t\t\tif pre_delay_samples_%s > 0 {{\n", node.id)
	fmt.sbprintf(sb, "\t\t\t\tpre_read_index_%s := (pre_write_index_%s - pre_delay_samples_%s + len(p.reverb_%s_pre_buffer)) %% len(p.reverb_%s_pre_buffer)\n", node.id, node.id, node.id, node.id, node.id)
	fmt.sbprintf(sb, "\t\t\t\tpre_delayed_input_%s = p.reverb_%s_pre_buffer[pre_read_index_%s]\n", node.id, node.id, node.id)
	fmt.sbprint(sb, "\t\t\t}\n")
	fmt.sbprintf(sb, "\t\t\tp.reverb_%s_pre_buffer[pre_write_index_%s] = f32(%s)\n", node.id, node.id, input_str)
	fmt.sbprintf(sb, "\t\t\tdelay_samples_%s := int(math.clamp((%.9f) * sample_rate, 0, %d-1));\n", node.id, delay_time, MAX_DELAY_SAMPLES)
	fmt.sbprintf(sb, "\t\t\tread_index_%s := (p.delay_%s_write_index - delay_samples_%s + len(p.delay_%s_buffer)) %% len(p.delay_%s_buffer);\n", node.id, node.id, node.id, node.id, node.id)
	fmt.sbprintf(sb, "\t\t\tdelayed_sample_%s := p.delay_%s_buffer[read_index_%s];\n", node.id, node.id, node.id)
	emit_f32_local(sb, "\t\t\t", fmt.tprintf("decay_gain_%s", node.id), fmt.tprintf("math.clamp(math.pow(f32(0.001), f32(%.9f) / math.max(f32(%s), 0.01)), 0.0, 0.95)", delay_time, decay_str))
	fmt.sbprintf(sb, "\t\t\tp.delay_%s_buffer[p.delay_%s_write_index] = pre_delayed_input_%s + delayed_sample_%s * decay_gain_%s;\n", node.id, node.id, node.id, node.id, node.id)
	fmt.sbprintf(sb, "\t\t\tp.delay_%s_write_index = (p.delay_%s_write_index + 1) %% len(p.delay_%s_buffer);\n", node.id, node.id, node.id)
	fmt.sbprintf(sb, "\t\t\tnode_%s_out = (%s) * (1.0 - (%s)) + delayed_sample_%s * (%s);\n", node.id, input_str, mix_str, node.id, mix_str)
	fmt.sbprint(sb, "\t\t}\n\n")
}

generate_distortion_code :: proc(sb: ^strings.Builder, node: Node, graph: ^Graph, plan: ^Instrument_Plan, sp: string) {
	input_str := sum_port_inputs(graph, node.id, "input", "0.0")
	drive_str := get_f32_param(graph, plan, node, "drive", "", 20.0)
	tone_str  := get_f32_param(graph, plan, node, "tone", "", 4000.0)
	mix_str   := get_f32_param(graph, plan, node, "mix", "", 0.5)
	shape := strings.to_lower(get_string_param(node, "shape", "classic"), context.temp_allocator)

	fmt.sbprintf(sb, "\t\t// --- Distortion Node %s (%s) ---\n", node.id, shape)
	fmt.sbprint(sb, "\t\t{\n")
	emit_f32_local(sb, "\t\t\t", fmt.tprintf("dist_in_%s", node.id), fmt.tprintf("(%s)", input_str))
	emit_f32_local(sb, "\t\t\t", fmt.tprintf("dist_k_%s", node.id), fmt.tprintf("math.max(f32(%s), 1.0)", drive_str))
	switch shape {
	case "soft", "softclip":
		emit_f32_local(sb, "\t\t\t", fmt.tprintf("dist_wet_%s", node.id), fmt.tprintf("math.tanh(dist_in_%s * dist_k_%s)", node.id, node.id))
	case "hard", "hardclip":
		emit_f32_local(sb, "\t\t\t", fmt.tprintf("dist_wet_%s", node.id), fmt.tprintf("math.clamp(dist_in_%s * dist_k_%s, -1.0, 1.0)", node.id, node.id))
	case "asymmetric":
		emit_f32_local(sb, "\t\t\t", fmt.tprintf("dist_wet_%s", node.id), fmt.tprintf("dist_in_%s > 0.0 ? dist_in_%s : dist_in_%s / (1.0 + abs(dist_in_%s * dist_k_%s))", node.id, node.id, node.id, node.id, node.id))
	case: // classic
		emit_f32_local(sb, "\t\t\t", fmt.tprintf("dist_wet_%s", node.id), fmt.tprintf("(f32(math.PI) + dist_k_%s) * dist_in_%s / (f32(math.PI) + dist_k_%s * abs(dist_in_%s))", node.id, node.id, node.id, node.id))
	}
	emit_f32_local(sb, "\t\t\t", fmt.tprintf("tone_k_%s", node.id), fmt.tprintf("math.clamp(2.0 * f32(math.PI) * math.clamp(f32(%s), 100.0, 20000.0) / sample_rate, 0.001, 1.0)", tone_str))
	fmt.sbprintf(sb, "\t\t\t%sdist_%s_tone += tone_k_%s * (dist_wet_%s - %sdist_%s_tone);\n", sp, node.id, node.id, node.id, sp, node.id)
	emit_f32_local(sb, "\t\t\t", fmt.tprintf("mix_%s", node.id), fmt.tprintf("math.clamp(f32(%s), 0.0, 1.0)", mix_str))
	fmt.sbprintf(sb, "\t\t\tnode_%s_out = dist_in_%s * (1.0 - mix_%s) + %sdist_%s_tone * mix_%s;\n", node.id, node.id, node.id, sp, node.id, node.id)
	out_gain_str := get_f32_param(graph, plan, node, "outputGain", "", 1.0)
	if out_gain_str != f32_literal(1.0) {
		emit_f32_local(sb, "\t\t\t", fmt.tprintf("out_gain_%s", node.id), fmt.tprintf("math.clamp(f32(%s), 0.0, 4.0)", out_gain_str))
		fmt.sbprintf(sb, "\t\t\tnode_%s_out *= out_gain_%s;\n", node.id, node.id)
	}
	fmt.sbprint(sb, "\t\t}\n\n")
}

mixer_channel_level :: proc(node: Node, channel: int, fallback: f32) -> f32 {
	if channel < 1 do return fallback

	levels: []json.Value
	if lv, ok := node.parameters["levels"]; ok {
		if arr, is_arr := lv.(json.Array); is_arr {
			levels = arr[:]
		}
	}
	if channel - 1 >= len(levels) do return fallback

	level := fallback
	#partial switch v in levels[channel-1] {
	case json.Float:
		level = f32(v)
	case json.Integer:
		level = f32(v)
	case json.Object:
		if lv, ok := v["level"]; ok {
			#partial switch l in lv {
			case json.Float:   level = f32(l)
			case json.Integer: level = f32(l)
			}
		}
	}
	return level
}

mixer_level_channel :: proc(param_name: string) -> (int, bool) {
	if !strings.has_prefix(param_name, "level") || len(param_name) <= len("level") {
		return 0, false
	}
	channel, ok := strconv.parse_int(param_name[len("level"):])
	return channel, ok && channel >= 1
}

exposed_param_default :: proc(node: Node, param_name: string, fallback: f32) -> f32 {
	if val, found := node.parameters[param_name]; found {
		#partial switch v in val {
		case json.Float:   return f32(v)
		case json.Integer: return f32(v)
		}
	}

	if node.type == "Mixer" {
		if channel, ok := mixer_level_channel(param_name); ok {
			return mixer_channel_level(node, channel, fallback)
		}
	}
	return fallback
}

generate_mixer_code :: proc(sb: ^strings.Builder, node: Node, graph: ^Graph, plan: ^Instrument_Plan) {
	input_count := 8
	if val, ok := node.parameters["inputCount"]; ok {
		#partial switch v in val {
		case json.Float:
			input_count = int(v)
		case json.Integer:
			input_count = int(v)
		}
	}
	if input_count < 1 {
		input_count = 1
	}
	if input_count > 32 {
		input_count = 32
	}

	fmt.sbprintf(sb, "\t\t// --- Mixer Node %s (%d inputs) ---\n", node.id, input_count)
	fmt.sbprint(sb, "\t\t{\n")
	fmt.sbprintf(sb, "\t\t\tmix_sum_%s: f32 = 0.0;\n", node.id)
	for i in 1 ..= input_count {
		port_name := fmt.tprintf("input_%d", i)
		sources := find_inputs_for_port(graph, node.id, port_name)
		defer delete(sources)
		if len(sources) == 0 do continue

		default_gain := mixer_channel_level(node, i, 1.0)
		gain_param := fmt.tprintf("level%d", i)
		gain_str := get_f32_param(graph, plan, node, gain_param, "", default_gain)
		for src in sources {
			fmt.sbprintf(sb, "\t\t\tmix_sum_%s += %s * (%s);\n", node.id, get_output_var(src.id, src.port), gain_str)
		}
	}
	fmt.sbprintf(sb, "\t\tnode_%s_out = mix_sum_%s;\n", node.id, node.id)
	fmt.sbprint(sb, "\t\t}\n\n")
}

// SKB-013. The law used to be bare cos/sin, which is constant-POWER but not
// unity-gain: at pan 0 both channels came out at cos(pi/4) = 0.7071, so
// dropping a Panner into a chain and leaving it centred cost 3 dB. A control
// whose neutral position is not neutral is the defect — nobody expects the
// pan knob to be a trim. Normalizing by sqrt(2) moves the 0 dB point from
// "hard left/right" to "centre" and leaves the law constant-power, so a sweep
// still holds its apparent loudness. The price is that full deflection now
// peaks at 1.4142 in one channel; on a limited asset (the default)
// skald_soft_limit absorbs that, and on an authored `limit: false` asset it is
// the author's headroom to manage, same as any other hot sum.
//
// The mono fallback (node_<id>_out, read when a MONO-input node consumes the
// Panner) used to be (L+R)*0.7071068, which is pan-dependent: unity at centre,
// 0.7071 at either extreme. So sweeping the pan made a mono consumer duck. It
// is now a pass-through, because a mono sum genuinely carries no pan
// information and encoding it as level was the bug, not the fix.
generate_panner_code :: proc(sb: ^strings.Builder, node: Node, graph: ^Graph, plan: ^Instrument_Plan) {
	input_str := sum_port_inputs(graph, node.id, "input", "0.0")
	pan_str := get_f32_param(graph, plan, node, "pan", "input_pan", 0.0)
	fmt.sbprintf(sb, "\t\t// --- Panner Node %s ---\n", node.id)
	fmt.sbprint(sb, "\t\t// Constant-power cos/sin law normalized by sqrt(2), so pan 0 is unity in\n")
	fmt.sbprint(sb, "\t\t// BOTH channels and a centred Panner is a transparent insert. Full\n")
	fmt.sbprint(sb, "\t\t// deflection therefore peaks at 1.4142 in one channel (+3dB).\n")
	fmt.sbprint(sb, "\t\t{\n")
	emit_f32_local(sb, "\t\t\t", fmt.tprintf("pan_in_%s", node.id), fmt.tprintf("(%s)", input_str))
	emit_f32_local(sb, "\t\t\t", fmt.tprintf("pan_angle_%s", node.id), fmt.tprintf("(math.clamp(f32(%s), -1.0, 1.0) * 0.5 + 0.5) * f32(math.PI) / 2.0", pan_str))
	fmt.sbprintf(sb, "\t\t\tnode_%s_out_left = pan_in_%s * math.cos(pan_angle_%s) * 1.4142136;\n", node.id, node.id, node.id)
	fmt.sbprintf(sb, "\t\t\tnode_%s_out_right = pan_in_%s * math.sin(pan_angle_%s) * 1.4142136;\n", node.id, node.id, node.id)
	fmt.sbprint(sb, "\t\t\t// Mono consumers get the input untouched: pan is not a level.\n")
	fmt.sbprintf(sb, "\t\t\tnode_%s_out = pan_in_%s;\n", node.id, node.id)
	fmt.sbprint(sb, "\t\t}\n\n")
}

generate_mapper_code :: proc(sb: ^strings.Builder, node: Node, graph: ^Graph, plan: ^Instrument_Plan) {
	input_str := sum_port_inputs(graph, node.id, "input", "0.0")

	inMin := get_f32_param(graph, plan, node, "inMin", "", 0.0)
	inMax := get_f32_param(graph, plan, node, "inMax", "", 1.0)
	outMin := get_f32_param(graph, plan, node, "outMin", "", 0.0)
	outMax := get_f32_param(graph, plan, node, "outMax", "", 1.0)

	fmt.sbprintf(sb, "\t\t// --- Mapper Node %s ---\n", node.id)
	fmt.sbprint(sb, "\t\t{\n")
	emit_f32_local(sb, "\t\t\t", fmt.tprintf("in_range_%s", node.id), fmt.tprintf("f32(%s) - f32(%s)", inMax, inMin))
	fmt.sbprintf(sb, "\t\t\tif in_range_%s == 0.0 do in_range_%s = 1.0;\n", node.id, node.id)
	fmt.sbprintf(sb, "\t\t\tnode_%s_out = math.lerp(f32(%s), f32(%s), math.clamp((f32(%s) - f32(%s)) / in_range_%s, 0.0, 1.0));\n", node.id, outMin, outMax, input_str, inMin, node.id)
	fmt.sbprint(sb, "\t\t}\n\n")
}


generate_gain_code :: proc(sb: ^strings.Builder, node: Node, graph: ^Graph, plan: ^Instrument_Plan) {
	input_str := sum_port_inputs(graph, node.id, "input", "0.0")

	// C4 (F-A04-4): every modulation port in the generator is additive —
	// `(knob) + (incoming)` — and on the VCA's Gain port that defeated the one
	// idiom the node exists for: a bare envelope into a separate amplifier
	// computed `audio * (0.75 + envelope)`, a note that never stopped. All
	// five VCAs in the flagship song hand-set `gain: 0` to work around it.
	// `gainMode` "multiply" (what the editor gives every new VCA) scales the
	// knob by the product of the incoming signals: `audio * knob * env` has
	// full authority from silence to unity. Anything else — including the
	// field being ABSENT, which is every pre-C4 file on disk and every CLI
	// input the editor never migrated — keeps the additive form, so no
	// existing patch changes sound; the 2->3 save migration stamps "add" so
	// the file says which it is. Exact match on the lowercase spelling the
	// editor writes: an unknown value is legacy, never a guess.
	gain_str: string
	if get_string_param(node, "gainMode", "") == "multiply" {
		gain_str = get_f32_param(graph, plan, node, "gain", "", 1.0)
		sources := find_inputs_for_port(graph, node.id, "input_gain")
		defer delete(sources)
		if len(sources) > 0 {
			gsb := strings.builder_make()
			defer strings.builder_destroy(&gsb)
			fmt.sbprintf(&gsb, "(%s)", gain_str)
			for src in sources {
				fmt.sbprintf(&gsb, " * (%s)", get_output_var(src.id, src.port))
			}
			gain_str = strings.clone(strings.to_string(gsb), context.temp_allocator)
		}
	} else {
		gain_str = get_f32_param(graph, plan, node, "gain", "input_gain", 1.0)
	}

	fmt.sbprintf(sb, "\t\t// --- Gain Node %s ---\n", node.id)
	fmt.sbprintf(sb, "\t\tnode_%s_out = (%s) * (%s);\n\n", node.id, input_str, gain_str)
}

generate_midi_input_code :: proc(sb: ^strings.Builder, node: Node, graph: ^Graph, plan: ^Instrument_Plan) {
	fmt.sbprintf(sb, "\t\t// --- MIDI Input Node %s ---\n", node.id)
	fmt.sbprintf(sb, "\t\tnode_%s_out_pitch := (f32(voice.note) - 69.0) / 12.0\n", node.id)
	fmt.sbprintf(sb, "\t\tnode_%s_out_gate := f32(1.0)\n", node.id)
	fmt.sbprintf(sb, "\t\tif voice.time_released > 0.0 do node_%s_out_gate = 0.0\n", node.id)
	fmt.sbprintf(sb, "\t\tnode_%s_out_velocity := voice.velocity\n\n", node.id)
}

generate_graph_output_adds :: proc(
	sb: ^strings.Builder,
	node: Node,
	graph: ^Graph,
	bus_nodes: map[string]bool,
	bus_pass: bool,
	gain_suffix: string = "", // C6-3: " * voice_gain" on the voice pass of a no-ADSR graph
) {
	sources := find_inputs_for_port(graph, node.id, "input")
	defer delete(sources)
	for src in sources {
		if bus_nodes[src.id] != bus_pass do continue
		src_node, found := graph.nodes[src.id]
		if !found do continue
		if src_node.type == "Panner" && (src.port == "" || src.port == "output") {
			fmt.sbprintf(sb, "\t\toutput_left += node_%s_out_left%s\n", src.id, gain_suffix)
			fmt.sbprintf(sb, "\t\toutput_right += node_%s_out_right%s\n", src.id, gain_suffix)
		} else {
			v := get_output_var(src.id, src.port)
			fmt.sbprintf(sb, "\t\toutput_left += %s%s\n", v, gain_suffix)
			fmt.sbprintf(sb, "\t\toutput_right += %s%s\n", v, gain_suffix)
		}
	}
}
