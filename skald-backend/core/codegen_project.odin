package skald_core

import "core:fmt"
import "core:math"
import "core:os"
import "core:strings"
import "core:slice"

generate_sequencer_logic :: proc(
	sb: ^strings.Builder,
	instrument: ^Project_Instrument, plan: ^Instrument_Plan,
	namespace_prefix: string,
	project: ^Project,
	asset_type: Asset_Type,
) {
	fmt.sbprintf(
		sb,
		"%s_process_sequence :: proc(p: ^%s_Processor) {{\n",
		namespace_prefix,
		namespace_prefix,
	)

	if asset_type != .Music_Layer {
		fmt.sbprint(sb, "}\n\n")
		return
	}

	tracks := active_sequencer_tracks(instrument, project)
	defer delete(tracks)
	if len(tracks) == 0 {
		fmt.sbprint(sb, "}\n\n")
		return
	}

	seq_nodes := nodes_sorted_by_id(&instrument.graph)
	defer delete(seq_nodes)

	global_steps := project.pattern_steps
	if global_steps <= 0 {
		for track in tracks {
			track_steps := track.num_steps
			if track_steps <= 0 do track_steps = 16
			if track_steps > global_steps do global_steps = track_steps
		}
	}

	fmt.sbprint(sb, "\tif !p.playing do return\n")

	fmt.sbprint(
		sb,
		"\tsamples_per_step_f := p.sample_rate * 60.0 / (p.bpm * 4.0)\n",
	)

	fmt.sbprint(sb, "\tif p.samples_until_next_step == 0 {\n")

	for track in tracks {
		track_steps := track.num_steps
		if track_steps <= 0 {
			track_steps = 16
		}
		fmt.sbprintf(sb, "\t\t// Track %q (%d steps)\n", track.name, track_steps)
		fmt.sbprintf(sb, "\t\tswitch p.current_step %% %d {{\n", track_steps)

		max_step := 0
		for event in track.events {
			if event.step > max_step do max_step = event.step
		}
		for s in 0 ..= max_step {
			first := true
			for event in track.events {
				if event.step != s do continue
				if first {
					fmt.sbprintf(sb, "\t\tcase %d:\n", s)
					first = false
				}
				duration_val := event.duration
				if duration_val <= 0.0 {
					duration_val = 1.0 
				}
				indent := "\t\t\t"
				has_prob := event.probability > 0.0 && event.probability < 1.0
				if has_prob {
					fmt.sbprintf(sb, "\t\t\tif next_float32(&p.prng) <= %.9f {{\n", event.probability)
					indent = "\t\t\t\t"
				}
				if len(event.patch_overrides) > 0 {
					plock_keys: [dynamic]string
					defer delete(plock_keys)
					for key, _ in event.patch_overrides do append(&plock_keys, key)
					slice.sort(plock_keys[:])

					emitted := make(map[string]bool)
					defer delete(emitted)
					for key in plock_keys {
						val := event.patch_overrides[key]
						plock_targets := resolve_plock_targets(seq_nodes, key)
						defer delete(plock_targets)
						clear(&emitted)
						for t in plock_targets {
							res, found := plan.exposed_resolutions[fmt.tprintf("%s::%s", t.node_id, t.param)]
							if !found do continue
							if emitted[res.field_name] do continue
							emitted[res.field_name] = true
							fmt.sbprintf(
								sb,
								"%s%s_set_param(p, \"%s\", %.9f)\n",
								indent,
								namespace_prefix,
								res.field_name,
								val,
							)
						}
					}
				}
				fmt.sbprintf(
					sb,
					"%s%s_note_on(p, %d, %.9f, f32(%.9f) * (60.0 / p.bpm / 4.0))\n",
					indent,
					namespace_prefix,
					event.note,
					event.velocity,
					duration_val,
				)
				if has_prob {
					fmt.sbprint(sb, "\t\t\t}\n")
				}
			}
		}

		fmt.sbprint(sb, "\t\t}\n")
	}

	fmt.sbprint(sb, "\t\tp.current_step += 1\n")
	fmt.sbprintf(sb, "\t\tif p.current_step >= %d {{\n", global_steps)
	fmt.sbprint(sb, "\t\t\tif p.loop {\n")
	fmt.sbprint(sb, "\t\t\t\tp.current_step = 0\n")
	fmt.sbprint(sb, "\t\t\t} else {\n")
	fmt.sbprint(sb, "\t\t\t\tp.playing = false\n")
	fmt.sbprint(sb, "\t\t\t}\n")
	fmt.sbprint(sb, "\t\t}\n")

	fmt.sbprint(sb, "\t\tp.step_frac_acc += samples_per_step_f\n")
	fmt.sbprint(sb, "\t\tn_step := u64(math.max(p.step_frac_acc, 1.0))\n")
	fmt.sbprint(sb, "\t\tp.step_frac_acc -= f32(n_step)\n")
	fmt.sbprint(sb, "\t\tp.samples_until_next_step = n_step - 1\n")
	fmt.sbprint(sb, "\t} else {\n")
	fmt.sbprint(sb, "\t\tp.samples_until_next_step -= 1\n")
	fmt.sbprint(sb, "\t}\n")

	fmt.sbprint(sb, "}\n\n")
}

resolve_unique_names :: proc(project: ^Project) -> []string {
    // C3: a prefix the author pinned with an Export ID is never suffixed
    // behind their back. Two pins on one name, or a pin another instrument's
    // display name happens to derive to, stop the build and say which two.
    if conflict, found := find_export_prefix_conflict(project); found {
        fmt.eprintf(
            "Error: instruments %q and %q would both export as %q. Give one of them a different Export ID (the display name can stay as it is).\n",
            conflict.a_name, conflict.b_name, conflict.prefix,
        )
        os.exit(1)
    }
    unique_names := make([]string, len(project.instruments))
    name_counts := make(map[string]int)
    defer delete(name_counts)
    for i in 0 ..< len(project.instruments) {
        base, _ := instrument_export_prefix(&project.instruments[i])
        count := name_counts[base]
        if count == 0 {
            unique_names[i] = base
        } else {
            unique_names[i] = fmt.aprintf("%s_%d", base, count + 1)
        }
        name_counts[base] = count + 1
    }
    return unique_names
}

emit_soft_limit_proc :: proc(sb: ^strings.Builder) {
	// E5 (roadmap 9.9): the count behind the editor's overflow warning. Every
	// per-asset processor already flushes its OWN non-finite output before it
	// gets here (see generate_processor_code's guard, its own p.nonfinite_count),
	// so in practice this only fires for the master-bus sum itself
	// (project_process / skald_process) — but it is the one call skald_soft_limit
	// makes no matter which shape called it, so it is the backstop that is
	// truly impossible to bypass, unlike the per-instrument `limit` flag.
	fmt.sbprint(sb, "skald_master_flush_count: i32\n\n")
	fmt.sbprint(sb, "// Soft limiter with a ceiling that really is 1.0 — plain tanh, not\n")
	fmt.sbprint(sb, "// tanh(x*k)/k, which topped out above 1 and still clipped the device.\n")
	fmt.sbprint(sb, "// Transparent for small signals (tanh(x) ~= x below ~0.3), saturating\n")
	fmt.sbprint(sb, "// smoothly instead of clipping as the mix gets hot.\n")
	fmt.sbprint(sb, "//\n")
	fmt.sbprint(sb, "// E5: tanh(NaN) is NaN, and tanh(+-Inf) is +-1 — a NaN INPUT would poison\n")
	fmt.sbprint(sb, "// the entire mix silently, and an Inf input would report a false full-scale\n")
	fmt.sbprint(sb, "// tone. Flushed to silence and counted instead, here, so this is caught no\n")
	fmt.sbprint(sb, "// matter which of the three call sites (a per-asset _process, project_process,\n")
	fmt.sbprint(sb, "// or the wasm shim's skald_process) fed it a bad sample.\n")
	fmt.sbprint(sb, "skald_soft_limit :: proc(l: f32, r: f32) -> (f32, f32) {\n")
	fmt.sbprint(sb, "\tlf, rf := l, r\n")
	fmt.sbprint(sb, "\tif math.is_nan(lf) || math.is_inf(lf) || math.is_nan(rf) || math.is_inf(rf) {\n")
	fmt.sbprint(sb, "\t\tlf, rf = 0.0, 0.0\n")
	fmt.sbprint(sb, "\t\tskald_master_flush_count += 1\n")
	fmt.sbprint(sb, "\t}\n")
	fmt.sbprint(sb, "\treturn math.tanh(lf), math.tanh(rf)\n")
	fmt.sbprint(sb, "}\n\n")
}

// E5 (roadmap 9.9): un-bypassable one-pole DC blocker, y = x - x1 + R*y1.
// R = 0.995 puts the -3dB cutoff at fc = sample_rate*(1-R)/(2*pi*R) ~= 38 Hz
// at 48 kHz — below any authored fundamental (nothing in schema/nodes.json
// gives a node a way to author a deliberate DC offset; a non-zero mean is
// always an artifact of an asymmetric pulse width, an unstable filter, or
// feedback, never intent) so there is no expressive cost at steady state.
//
// Deliberately NOT called from the per-asset _process (generate_processor_code):
// a first-order differencing filter like this one rings on a sudden onset —
// measured up to ~6.5% over the input's own peak for a couple of milliseconds
// after a note starts, before it settles — and per-asset _process is the
// numerically-pinned game-facing API (panner_center_unity/panner_mono_sum
// assert an EXACT 0.5 peak). Applied once instead, after every asset is
// already summed, on the two master-bus composers: project_process and the
// wasm shim's skald_process. Both are un-bypassable regardless of any
// instrument's `limit` flag, which is what roadmap 9.9 actually asks for
// ("the editor's monitor output pipeline") — see 80-exporting-odin.md.
emit_dc_block_proc :: proc(sb: ^strings.Builder) {
	fmt.sbprint(sb, "// E5: one-pole DC blocker state, one instance per master bus (project_process\n")
	fmt.sbprint(sb, "// or the wasm shim's skald_process — see skald_dc_block below). Reset\n")
	fmt.sbprint(sb, "// alongside every other master-bus field (project_init / skald_init).\n")
	fmt.sbprint(sb, "Skald_Dc_Block_State :: struct {\n")
	fmt.sbprint(sb, "\tx1_l, y1_l, x1_r, y1_r: f32,\n")
	fmt.sbprint(sb, "}\n\n")
	fmt.sbprint(sb, "// y = x - x1 + R*y1, R = 0.995 (~38 Hz cutoff at 48 kHz — see the note\n")
	fmt.sbprint(sb, "// above generate_project_code's call to emit_dc_block_proc).\n")
	fmt.sbprint(sb, "skald_dc_block :: proc(s: ^Skald_Dc_Block_State, l: f32, r: f32) -> (f32, f32) {\n")
	fmt.sbprint(sb, "\tyl := l - s.x1_l + 0.995 * s.y1_l\n")
	fmt.sbprint(sb, "\tyr := r - s.x1_r + 0.995 * s.y1_r\n")
	fmt.sbprint(sb, "\ts.x1_l, s.y1_l = l, yl\n")
	fmt.sbprint(sb, "\ts.x1_r, s.y1_r = r, yr\n")
	fmt.sbprint(sb, "\treturn yl, yr\n")
	fmt.sbprint(sb, "}\n\n")
}

// E8 (roadmap 9.4 item 2): the one warp function every curved ADSR stage
// calls, shared with skald-ui/src/components/controls/AdsrEnvelopeEditor.tsx
// (mirrored case-by-case, comment says so there) so a dragged tension handle
// previews the exact shape the export plays. c in [-1,1], 0 = linear — the
// `c == 0.0` branch is not an optimisation, it is what keeps this safe to
// call from an EXPOSED curve field that a live edit can set back to exactly
// 0 at runtime (see adsr_curve_is_flat: codegen decides ONLY whether to call
// this proc at all, never whether the proc itself sees a zero). k = c * 6.0
// is the strength that lands warp(0.5, +-1) at ~0.95/~0.05 instead of 0.5 —
// see tests/unit/dc_blocker_and_nonfinite_test.odin's neighbour for the ADSR
// warp unit test and tests/fixtures/adsr_curve.json for the acceptance proof.
emit_adsr_warp_proc :: proc(sb: ^strings.Builder) {
	fmt.sbprint(sb, "// y = warp(t, c): (1-exp(-k*t))/(1-exp(-k)), k = c*6.0, c==0 => t.\n")
	fmt.sbprint(sb, "skald_adsr_warp :: proc(t: f32, c: f32) -> f32 {\n")
	fmt.sbprint(sb, "\tif c == 0.0 do return t\n")
	fmt.sbprint(sb, "\tk := c * 6.0\n")
	fmt.sbprint(sb, "\treturn (1.0 - math.exp(-k * t)) / (1.0 - math.exp(-k))\n")
	fmt.sbprint(sb, "}\n\n")
}

// B7-2-followup / SKB-016: seconds for a feedback delay line to fall 60dB,
// mirroring feedback_tail_seconds (codegen_analysis.odin) exactly, but
// callable at runtime against LIVE field values instead of the compile-time
// worst case. Each per-asset <Foo>_bus_tail_seconds proc calls this once per
// note-off (when the tail arms), not once per sample, so the ln/pow stay off
// the audio path.
//
// Guarded against the three ways this can go wrong feeding straight into a
// u64(...) at the call site: ln(0) (gain <= 0.0 is handled before any ln
// call), division by zero (same guard — g is never 0 when ln(g) runs), and a
// NaN/negative/non-finite result (checked explicitly and discarded in favor
// of the safe `period` fallback).
emit_feedback_tail_proc :: proc(sb: ^strings.Builder) {
	fmt.sbprint(sb, "skald_feedback_tail_seconds :: proc(period: f32, gain: f32) -> f32 {\n")
	fmt.sbprint(sb, "\tif math.is_nan(period) || period <= 0.0 do return 0.0\n")
	fmt.sbprint(sb, "\t// 0.95 is the DSP's own feedback ceiling (see generate_delay_code /\n")
	fmt.sbprint(sb, "\t// generate_reverb_code), so no live value can ring longer than this.\n")
	fmt.sbprint(sb, "\tg := math.clamp(gain, 0.0, 0.95)\n")
	fmt.sbprint(sb, "\tif g <= 0.0 do return period\n")
	fmt.sbprint(sb, "\tpasses := math.ceil(math.ln(f32(0.001)) / math.ln(g))\n")
	fmt.sbprint(sb, "\tresult := period * passes\n")
	fmt.sbprint(sb, "\tif math.is_nan(result) || math.is_inf(result) || result < 0.0 do return period\n")
	fmt.sbprint(sb, "\treturn result\n")
	fmt.sbprint(sb, "}\n\n")
}

generate_project_code :: proc(project: ^Project, project_name: string, package_name: string, provenance := Provenance{}) -> string {
    sb := strings.builder_make()

    // Plans are built BEFORE the header (packet B12) because the header lists
    // every asset's exposed parameters, and it must list them from the same
    // Instrument_Plan the setters and _PARAMS are emitted from — a header
    // computed any other way could advertise a setter the body does not have,
    // which is the "preview lies about the export" defect class in prose form.
    // collect_plock_targets' hard errors fire here, before any text exists,
    // exactly as they did inside the per-instrument loop.
    plans := make([]Instrument_Plan, len(project.instruments))
    plocks := make([][dynamic]Plock_Target, len(project.instruments))
    for i in 0 ..< len(project.instruments) {
        inst := &project.instruments[i]
        plocks[i] = collect_plock_targets(inst, project)
        plans[i] = build_instrument_plan(&inst.graph, inst, plocks[i][:])
    }
    defer {
        for i in 0 ..< len(plans) {
            delete(plans[i].exposed_resolutions)
            delete(plans[i].stable_resolutions)
            delete(plocks[i])
        }
        delete(plans)
        delete(plocks)
    }

    asset_types := make([]Asset_Type, len(project.instruments))
    defer delete(asset_types)
    for i in 0 ..< len(project.instruments) {
        asset_types[i] = detect_asset_type(&project.instruments[i], project)
    }

    unique_names := resolve_unique_names(project)
    defer delete(unique_names)

    fmt.sbprintf(&sb, "package %s\n\n", package_name)

    // Processors are emitted before the header for the same reason the plans
    // are: the header lists exposed parameters, and packet B2's read scan can
    // prune a plan after seeing the emitted body. A pruned instrument is
    // regenerated against the pruned plan (its warnings print twice — the
    // price of a path that only runs when the reachability table has a gap).
    codes := make([]string, len(project.instruments))
    defer delete(codes)
    for i in 0 ..< len(project.instruments) {
        inst := &project.instruments[i]
        codes[i] = generate_processor_code(&inst.graph, inst, unique_names[i], asset_types[i], project.bpm, &plans[i], false)
        dead := unread_exposed_fields(codes[i], &plans[i])
        defer delete(dead)
        if len(dead) > 0 {
            warn_unread_exposed_fields(&inst.graph, inst.name, dead[:])
            omit_resolutions(&plans[i], dead[:])
            codes[i] = generate_processor_code(&inst.graph, inst, unique_names[i], asset_types[i], project.bpm, &plans[i], false)
        }
    }

    fmt.sbprint(&sb, "// =====================================================================\n")
    fmt.sbprint(&sb, "// Generated by Skald.\n")
    emit_provenance_banner(&sb, provenance)
    fmt.sbprint(&sb, "//\n")
    fmt.sbprint(&sb, "// SFX assets:")
    sfx_count := 0
    ml_count := 0
    for i in 0 ..< len(project.instruments) {
        if asset_types[i] == .SFX {
            fmt.sbprintf(&sb, " %s", unique_names[i])
            sfx_count += 1
        }
    }
    if sfx_count == 0 do fmt.sbprint(&sb, " (none)")
    fmt.sbprint(&sb, "\n")
    fmt.sbprint(&sb, "// Music Layer assets:")
    for i in 0 ..< len(project.instruments) {
        if asset_types[i] == .Music_Layer {
            fmt.sbprintf(&sb, " %s", unique_names[i])
            ml_count += 1
        }
    }
    if ml_count == 0 do fmt.sbprint(&sb, " (none)")
    fmt.sbprint(&sb, "\n")
    fmt.sbprint(&sb, "//\n")
    fmt.sbprint(&sb, "// Game integration: import this package and use the per-asset APIs.\n")
    fmt.sbprint(&sb, "//   SFX:         <Foo>_init, <Foo>_trigger, <Foo>_process, <Foo>_is_playing\n")
    fmt.sbprint(&sb, "//   Music Layer: <Bar>_init, <Bar>_start, <Bar>_stop, <Bar>_process,\n")
    fmt.sbprint(&sb, "//                <Bar>_set_loop\n")
    fmt.sbprint(&sb, "//\n")
    fmt.sbprint(&sb, "// <Foo>_trigger with duration<=0 (the default) plays a natural one-shot:\n")
    fmt.sbprint(&sb, "// the envelope holds through attack+decay, then releases (a patch with no\n")
    fmt.sbprint(&sb, "// envelope plays 1s). Pass an explicit duration in seconds to hold longer,\n")
    fmt.sbprint(&sb, "// or drive <Foo>_note_on / <Foo>_note_off yourself for full control.\n")
    fmt.sbprint(&sb, "//\n")
    fmt.sbprint(&sb, "// <Foo>_note_on clamps `note` to 0..127 and `velocity` to 0..1 SILENTLY —\n")
    fmt.sbprint(&sb, "// it is called at audio rate, so an out-of-range argument cannot afford a\n")
    fmt.sbprint(&sb, "// diagnostic. Check your own values if you need to know they were wrong.\n")
    fmt.sbprint(&sb, "// <Foo>_note_off clamps `note` the same way, because `note` is the key it\n")
    fmt.sbprint(&sb, "// matches voices on: if only one side clamped, note_off(200) would fail to\n")
    fmt.sbprint(&sb, "// release the voice note_on(200) parked at 127, and that voice would never\n")
    fmt.sbprint(&sb, "// free.\n")
    fmt.sbprint(&sb, "//\n")
    // F-B05-3 (packet B12): the setters are unguarded field writes, and until
    // this sentence existed nothing on the deliverable said so.
    fmt.sbprint(&sb, "// THREADING: every call on one asset — _init, _note_on, _note_off, _trigger,\n")
    fmt.sbprint(&sb, "// _start, _stop, _set_*, _set_param, _process, _is_playing — must come from\n")
    fmt.sbprint(&sb, "// the thread that calls that asset's _process. The setters are plain field\n")
    fmt.sbprint(&sb, "// writes with no synchronization, so a setter from another thread while\n")
    fmt.sbprint(&sb, "// _process runs is a data race, not a late parameter change. Queue values\n")
    fmt.sbprint(&sb, "// across threads in your own code and apply them on the audio thread.\n")
    fmt.sbprint(&sb, "//\n")
    emit_exposed_param_contract(&sb, project, unique_names, plans)
    {
        any_graph_input := false
        scan: for i in 0 ..< len(project.instruments) {
            for _, node in project.instruments[i].graph.nodes {
                if node.type == "GraphInput" {
                    any_graph_input = true
                    break scan
                }
            }
        }
        if any_graph_input {
            fmt.sbprint(&sb, "//\n")
            fmt.sbprint(&sb, "// Effect assets (instruments with an Input node) process external audio:\n")
            fmt.sbprint(&sb, "// call <Foo>_feed_input(p, l, r) with one stereo sample, then <Foo>_process.\n")
        }
    }
    fmt.sbprint(&sb, "//\n")
    fmt.sbprint(&sb, "// project_init/process/destroy is a convenience wrapper for the test\n")
    fmt.sbprint(&sb, "// harness only — game code should consume per-asset procs directly.\n")
    fmt.sbprint(&sb, "// =====================================================================\n\n")

    fmt.sbprint(&sb, "import \"core:math\"\n")
    fmt.sbprint(&sb, "import \"core:math/rand\"\n")
    fmt.sbprint(&sb, "\n")

    fmt.sbprint(&sb, "PRNG_State :: struct {\n")
    fmt.sbprint(&sb, "\tstate: u32,\n")
    fmt.sbprint(&sb, "}\n\n")
    fmt.sbprint(&sb, "next_float32 :: proc(rng: ^PRNG_State) -> f32 {\n")
    fmt.sbprint(&sb, "\tx := rng.state\n")
    fmt.sbprint(&sb, "\tx ~= x << 13\n")
    fmt.sbprint(&sb, "\tx ~= x >> 17\n")
    fmt.sbprint(&sb, "\tx ~= x << 5\n")
    fmt.sbprint(&sb, "\tif x == 0 do x = 0xDEADBEEF\n") 
    fmt.sbprint(&sb, "\trng.state = x\n")
    fmt.sbprint(&sb, "\treturn f32(x) / 4294967296.0\n")
    fmt.sbprint(&sb, "}\n\n")

    fmt.sbprint(&sb, "ADSR_Stage :: enum { Idle, Attack, Decay, Sustain, Release }\n\n")

    // C5 (F-A01-7): the square shape takes its duty cycle from the node's
    // pulseWidth instead of a hard-coded 0.5.
    fmt.sbprint(&sb, "skald_wavetable_shape :: proc(idx: int, ph: f32, pw: f32) -> f32 {\n")
    fmt.sbprint(&sb, "\tswitch idx {\n")
    fmt.sbprint(&sb, "\tcase 1: return abs(ph * 4.0 - 2.0) - 1.0\n")
    fmt.sbprint(&sb, "\tcase 2: return ph * 2.0 - 1.0\n")
    fmt.sbprint(&sb, "\tcase 3: return ph < pw ? 1.0 : -1.0\n")
    fmt.sbprint(&sb, "\t}\n")
    fmt.sbprint(&sb, "\treturn math.sin(ph * 2.0 * f32(math.PI))\n")
    fmt.sbprint(&sb, "}\n\n")
    fmt.sbprint(&sb, "skald_wavetable_sample :: proc(ph: f32, pos: f32, pw: f32) -> f32 {\n")
    fmt.sbprint(&sb, "\tp := math.clamp(pos, 0.0, 3.0)\n")
    fmt.sbprint(&sb, "\ti1 := int(p)\n")
    fmt.sbprint(&sb, "\ti2 := (i1 + 1) % 4\n")
    fmt.sbprint(&sb, "\tfrac := p - f32(i1)\n")
    fmt.sbprint(&sb, "\ts1 := skald_wavetable_shape(i1, ph, pw)\n")
    fmt.sbprint(&sb, "\ts2 := skald_wavetable_shape(i2, ph, pw)\n")
    fmt.sbprint(&sb, "\treturn s1 + (s2 - s1) * frac\n")
    fmt.sbprint(&sb, "}\n\n")

    emit_soft_limit_proc(&sb)
    emit_dc_block_proc(&sb)
    // B7-x3: skald_feedback_tail_seconds is called only from an asset's
    // <Foo>_bus_tail_seconds, which exists only when that asset has a
    // Delay/Reverb tail. Emitting the helper unconditionally put 12 lines of
    // dead code into every export without one — the majority of them.
    {
        any_tail := false
        for i in 0 ..< len(project.instruments) {
            inst := &project.instruments[i]
            nodes := nodes_sorted_by_id(&inst.graph)
            if compute_bus_tail_seconds(&inst.graph, nodes, &plans[i]) > 0.0 do any_tail = true
            delete(nodes)
        }
        if any_tail do emit_feedback_tail_proc(&sb)
    }
    // E8: same reasoning as B7-x3 above — skald_adsr_warp is called only
    // from an ADSR node whose attackCurve/decayCurve/releaseCurve is not
    // flat (adsr_curve_is_flat). Emitting it unconditionally would add dead
    // code to every project that has never touched a curve, breaking
    // byte-identity for every patch that predates this packet.
    {
        any_curve := false
        for i in 0 ..< len(project.instruments) {
            inst := &project.instruments[i]
            nodes := nodes_sorted_by_id(&inst.graph)
            for node in nodes {
                if node.type != "ADSR" do continue
                if !adsr_curve_is_flat(&plans[i], node, "attackCurve") do any_curve = true
                if !adsr_curve_is_flat(&plans[i], node, "decayCurve") do any_curve = true
                if !adsr_curve_is_flat(&plans[i], node, "releaseCurve") do any_curve = true
            }
            delete(nodes)
        }
        if any_curve do emit_adsr_warp_proc(&sb)
    }

    fmt.sbprint(&sb, "Note_Event :: struct {\n")
    fmt.sbprint(&sb, "\tnote: u8,\n")
    fmt.sbprint(&sb, "\tvelocity: f32,\n")
    fmt.sbprint(&sb, "\tstart_time: f32,\n")
    fmt.sbprint(&sb, "\tstep: int,\n")
    fmt.sbprint(&sb, "\tduration: f32,\n")
    fmt.sbprint(&sb, "}\n\n")

    fmt.sbprint(&sb, "Skald_Param_Info :: struct {\n")
    fmt.sbprint(&sb, "\tname:    string,\n")
    fmt.sbprint(&sb, "\tmin:     f32,\n")
    fmt.sbprint(&sb, "\tmax:     f32,\n")
    fmt.sbprint(&sb, "\tdefault: f32,\n")
    fmt.sbprint(&sb, "\tunit:    string,\n")
    fmt.sbprint(&sb, "}\n\n")

    for i in 0 ..< len(project.instruments) {
        inst := &project.instruments[i]
        fmt.sbprint(&sb, codes[i])
        generate_sequencer_logic(&sb, inst, &plans[i], unique_names[i], project, asset_types[i])
    }

    fmt.sbprint(&sb, "// --- Project Wrapper (test-harness convenience) ---\n")
    fmt.sbprint(&sb, "Project_State :: struct {\n")
    for i in 0 ..< len(project.instruments) {
        fmt.sbprintf(&sb, "\t%s: ^%s_Processor,\n", unique_names[i], unique_names[i])
    }
    fmt.sbprint(&sb, "\tmaster_volume: f32,\n")
    // E5: the master bus's own DC-blocker memory — see emit_dc_block_proc's
    // doc comment for why this lives here and not on each asset.
    fmt.sbprint(&sb, "\tdc: Skald_Dc_Block_State,\n")
    fmt.sbprint(&sb, "}\n\n")

    fmt.sbprint(&sb, "project_init :: proc(p: ^Project_State, sr: f32) {\n")
    master_vol := project.master_volume
    if master_vol < 0.0 do master_vol = 1.0
    fmt.sbprintf(&sb, "\tp.master_volume = %.9f\n", master_vol)
    fmt.sbprint(&sb, "\tp.dc = {}\n")
    for i in 0 ..< len(project.instruments) {
        n := unique_names[i]
        fmt.sbprintf(&sb, "\tp.%s = new(%s_Processor)\n", n, n)
        fmt.sbprintf(&sb, "\t%s_init(p.%s, sr)\n", n, n)
        if asset_types[i] == .Music_Layer {
            fmt.sbprintf(&sb, "\t%s_start(p.%s)\n", n, n)
        }
    }
    fmt.sbprint(&sb, "}\n\n")

    fmt.sbprint(&sb, "project_set_master_volume :: proc(p: ^Project_State, value: f32) {\n")
    fmt.sbprint(&sb, "\tp.master_volume = math.clamp(value, 0.0, 1.0)\n")
    fmt.sbprint(&sb, "}\n\n")

    any_solo := false
    for i in 0 ..< len(project.instruments) {
        if project.instruments[i].solo do any_solo = true
    }

    fmt.sbprint(&sb, "project_process :: proc(p: ^Project_State) -> (f32, f32) {\n")
    fmt.sbprint(&sb, "\tmixed_left: f32 = 0.0\n")
    fmt.sbprint(&sb, "\tmixed_right: f32 = 0.0\n")
    for i in 0 ..< len(project.instruments) {
        n := unique_names[i]
        inst := &project.instruments[i]
        if inst.mute || (any_solo && !inst.solo) {
            fmt.sbprintf(&sb, "\t// %s: muted in the project (excluded from the mix)\n", n)
            continue
        }
        fmt.sbprintf(
            &sb,
            "\t{{ l, r := %s_process(p.%s); mixed_left += l; mixed_right += r }}\n",
            n,
            n,
        )
    }
    fmt.sbprint(&sb, "\tmixed_left *= p.master_volume\n")
    fmt.sbprint(&sb, "\tmixed_right *= p.master_volume\n")
    // E5: after volume, before the limiter — DC-blocking a signal already
    // pushed toward the limiter's saturation zone would fight the shaping
    // the volume stage just applied.
    fmt.sbprint(&sb, "\tmixed_left, mixed_right = skald_dc_block(&p.dc, mixed_left, mixed_right)\n")
    fmt.sbprint(&sb, "\treturn skald_soft_limit(mixed_left, mixed_right)\n")
    fmt.sbprint(&sb, "}\n\n")

    fmt.sbprint(&sb, "project_destroy :: proc(p: ^Project_State) {\n")
    for i in 0 ..< len(project.instruments) {
        fmt.sbprintf(&sb, "\tfree(p.%s)\n", unique_names[i])
    }
    fmt.sbprint(&sb, "}\n\n")

    return strings.to_string(sb)
}

generate_wasm_shim_code :: proc(project: ^Project, package_name: string, provenance := Provenance{}) -> string {
    sb := strings.builder_make()

    asset_types := make([]Asset_Type, len(project.instruments))
    defer delete(asset_types)
    for i in 0 ..< len(project.instruments) {
        asset_types[i] = detect_asset_type(&project.instruments[i], project)
    }
    unique_names := resolve_unique_names(project)
    defer delete(unique_names)

    fmt.sbprintf(&sb, "package %s\n\n", package_name)
    fmt.sbprint(&sb, "// Generated by Skald — wasm export shim for the editor preview.\n")
    emit_provenance_banner(&sb, provenance)
    fmt.sbprint(&sb, "// Not part of the game-facing API; do not ship this file.\n")
    fmt.sbprint(&sb, "// Build: odin build <this dir> -target:freestanding_wasm32 -no-entry-point\n\n")
    fmt.sbprint(&sb, "import \"base:runtime\"\n")
    fmt.sbprint(&sb, "import \"core:math\"\n\n")

    for i in 0 ..< len(project.instruments) {
        fmt.sbprintf(&sb, "@(private=\"file\") wasm_%s: %s_Processor\n", unique_names[i], unique_names[i])
    }
    fmt.sbprint(&sb, "@(private=\"file\") wasm_master_volume: f32\n")
    // E5: the master bus's own DC-blocker memory — see emit_dc_block_proc's
    // doc comment for why this lives here and not on each asset.
    fmt.sbprint(&sb, "@(private=\"file\") wasm_dc: Skald_Dc_Block_State\n")
    fmt.sbprint(&sb, "\n")

    fmt.sbprint(&sb, "SKALD_WASM_BLOCK :: 128\n")
    fmt.sbprint(&sb, "@(private=\"file\") skald_left: [SKALD_WASM_BLOCK]f32\n")
    fmt.sbprint(&sb, "@(private=\"file\") skald_right: [SKALD_WASM_BLOCK]f32\n")
    fmt.sbprint(&sb, "@(private=\"file\") skald_name_buf: [128]u8\n\n")

    fmt.sbprint(&sb, "@(export)\nskald_left_ptr :: proc \"c\" () -> rawptr { return &skald_left[0] }\n\n")
    fmt.sbprint(&sb, "@(export)\nskald_right_ptr :: proc \"c\" () -> rawptr { return &skald_right[0] }\n\n")
    fmt.sbprint(&sb, "@(export)\nskald_name_buf_ptr :: proc \"c\" () -> rawptr { return &skald_name_buf[0] }\n\n")

    fmt.sbprintf(&sb, "@(export)\nskald_asset_count :: proc \"c\" () -> i32 {{ return %d }}\n\n", len(project.instruments))

    fmt.sbprint(&sb, "@(export)\nskald_init :: proc \"c\" (sample_rate: f32) {\n")
    fmt.sbprint(&sb, "\tcontext = runtime.default_context()\n")
    {
        master_vol := project.master_volume
        if master_vol < 0.0 do master_vol = 1.0
        fmt.sbprintf(&sb, "\twasm_master_volume = %.9f\n", master_vol)
    }
    // E5: a hot-swap calls skald_init on a freshly instantiated wasm module
    // (fresh globals already), but reset explicitly anyway — same discipline
    // as project_init's p.dc = {}, so neither depends on the other's runtime
    // for correctness.
    fmt.sbprint(&sb, "\twasm_dc = {}\n")
    for i in 0 ..< len(project.instruments) {
        n := unique_names[i]
        fmt.sbprintf(&sb, "\twasm_%s = {{}}\n", n)
        fmt.sbprintf(&sb, "\t%s_init(&wasm_%s, sample_rate)\n", n, n)
    }
    fmt.sbprint(&sb, "}\n\n")

    fmt.sbprint(&sb, "@(export)\nskald_set_master_volume :: proc \"c\" (value: f32) {\n")
    fmt.sbprint(&sb, "\tcontext = runtime.default_context()\n")
    fmt.sbprint(&sb, "\twasm_master_volume = math.clamp(value, 0.0, 1.0)\n")
    fmt.sbprint(&sb, "}\n\n")
    fmt.sbprint(&sb, "@(export)\nskald_get_master_volume :: proc \"c\" () -> f32 {\n")
    fmt.sbprint(&sb, "\treturn wasm_master_volume\n")
    fmt.sbprint(&sb, "}\n\n")

    fmt.sbprint(&sb, "@(export)\nskald_start_all :: proc \"c\" () {\n")
    fmt.sbprint(&sb, "\tcontext = runtime.default_context()\n")
    for i in 0 ..< len(project.instruments) {
        if asset_types[i] == .Music_Layer {
            fmt.sbprintf(&sb, "\t%s_start(&wasm_%s)\n", unique_names[i], unique_names[i])
        }
    }
    fmt.sbprint(&sb, "}\n\n")

    fmt.sbprint(&sb, "@(export)\nskald_stop_all :: proc \"c\" () {\n")
    fmt.sbprint(&sb, "\tcontext = runtime.default_context()\n")
    for i in 0 ..< len(project.instruments) {
        fmt.sbprintf(&sb, "\t%s_stop(&wasm_%s)\n", unique_names[i], unique_names[i])
    }
    fmt.sbprint(&sb, "}\n\n")

    fmt.sbprint(&sb, "@(export)\nskald_trigger :: proc \"c\" (asset: i32, note: u8, velocity: f32, duration: f32) {\n")
    fmt.sbprint(&sb, "\tcontext = runtime.default_context()\n")
    fmt.sbprint(&sb, "\tswitch asset {\n")
    for i in 0 ..< len(project.instruments) {
        n := unique_names[i]
        fmt.sbprintf(&sb, "\tcase %d: %s_trigger(&wasm_%s, note, velocity, duration)\n", i, n, n)
    }
    fmt.sbprint(&sb, "\t}\n}\n\n")

    fmt.sbprint(&sb, "@(export)\nskald_note_on :: proc \"c\" (asset: i32, note: u8, velocity: f32, duration: f32) {\n")
    fmt.sbprint(&sb, "\tcontext = runtime.default_context()\n")
    fmt.sbprint(&sb, "\tswitch asset {\n")
    for i in 0 ..< len(project.instruments) {
        n := unique_names[i]
        fmt.sbprintf(&sb, "\tcase %d: %s_note_on(&wasm_%s, note, velocity, duration)\n", i, n, n)
    }
    fmt.sbprint(&sb, "\t}\n}\n\n")

    fmt.sbprint(&sb, "@(export)\nskald_note_off :: proc \"c\" (asset: i32, note: u8) {\n")
    fmt.sbprint(&sb, "\tcontext = runtime.default_context()\n")
    fmt.sbprint(&sb, "\tswitch asset {\n")
    for i in 0 ..< len(project.instruments) {
        n := unique_names[i]
        fmt.sbprintf(&sb, "\tcase %d: %s_note_off(&wasm_%s, note)\n", i, n, n)
    }
    fmt.sbprint(&sb, "\t}\n}\n\n")

    fmt.sbprint(&sb, "@(export)\nskald_set_loop :: proc \"c\" (asset: i32, loop: i32) {\n")
    fmt.sbprint(&sb, "\tcontext = runtime.default_context()\n")
    fmt.sbprint(&sb, "\tswitch asset {\n")
    for i in 0 ..< len(project.instruments) {
        n := unique_names[i]
        fmt.sbprintf(&sb, "\tcase %d: %s_set_loop(&wasm_%s, loop != 0)\n", i, n, n)
    }
    fmt.sbprint(&sb, "\t}\n}\n\n")

    fmt.sbprint(&sb, "@(export)\nskald_is_playing :: proc \"c\" (asset: i32) -> i32 {\n")
    fmt.sbprint(&sb, "\tcontext = runtime.default_context()\n")
    fmt.sbprint(&sb, "\tswitch asset {\n")
    for i in 0 ..< len(project.instruments) {
        n := unique_names[i]
        fmt.sbprintf(&sb, "\tcase %d: return %s_is_playing(&wasm_%s) ? 1 : 0\n", i, n, n)
    }
    fmt.sbprint(&sb, "\t}\n\treturn 0\n}\n\n")

    fmt.sbprint(&sb, "@(export)\nskald_set_volume :: proc \"c\" (asset: i32, value: f32) {\n")
    fmt.sbprint(&sb, "\tcontext = runtime.default_context()\n")
    fmt.sbprint(&sb, "\tswitch asset {\n")
    for i in 0 ..< len(project.instruments) {
        n := unique_names[i]
        fmt.sbprintf(&sb, "\tcase %d: %s_set_volume(&wasm_%s, value)\n", i, n, n)
    }
    fmt.sbprint(&sb, "\t}\n}\n\n")

    fmt.sbprint(&sb, "@(export)\nskald_set_param :: proc \"c\" (asset: i32, name_len: i32, value: f32) -> i32 {\n")
    fmt.sbprint(&sb, "\tcontext = runtime.default_context()\n")
    fmt.sbprint(&sb, "\tif name_len <= 0 || int(name_len) > len(skald_name_buf) do return 0\n")
    fmt.sbprint(&sb, "\tname := string(skald_name_buf[:name_len])\n")
    fmt.sbprint(&sb, "\tswitch asset {\n")
    for i in 0 ..< len(project.instruments) {
        n := unique_names[i]
        fmt.sbprintf(&sb, "\tcase %d: return %s_set_param(&wasm_%s, name, value) ? 1 : 0\n", i, n, n)
    }
    fmt.sbprint(&sb, "\t}\n\treturn 0\n}\n\n")

    fmt.sbprint(&sb, "@(export)\nskald_get_step :: proc \"c\" (asset: i32) -> i32 {\n")
    fmt.sbprint(&sb, "\tcontext = runtime.default_context()\n")
    fmt.sbprint(&sb, "\tswitch asset {\n")
    for i in 0 ..< len(project.instruments) {
        fmt.sbprintf(&sb, "\tcase %d: return i32(wasm_%s.current_step)\n", i, unique_names[i])
    }
    fmt.sbprint(&sb, "\t}\n\treturn -1\n}\n\n")

    fmt.sbprint(&sb, "@(export)\nskald_get_step_wait :: proc \"c\" (asset: i32) -> i32 {\n")
    fmt.sbprint(&sb, "\tcontext = runtime.default_context()\n")
    fmt.sbprint(&sb, "\tswitch asset {\n")
    for i in 0 ..< len(project.instruments) {
        fmt.sbprintf(&sb, "\tcase %d: return i32(wasm_%s.samples_until_next_step)\n", i, unique_names[i])
    }
    fmt.sbprint(&sb, "\t}\n\treturn -1\n}\n\n")

    // E5: per-asset counts drive the canvas warning (attributable to the
    // node that produced them); the total additionally folds in
    // skald_master_flush_count, the master-bus backstop that has no single
    // asset to attribute to. Worklet polls both once per skald_process call
    // (skaldWasm.worklet.ts) and only posts a message when either changes.
    fmt.sbprint(&sb, "@(export)\nskald_get_asset_nonfinite_count :: proc \"c\" (asset: i32) -> i32 {\n")
    fmt.sbprint(&sb, "\tcontext = runtime.default_context()\n")
    fmt.sbprint(&sb, "\tswitch asset {\n")
    for i in 0 ..< len(project.instruments) {
        fmt.sbprintf(&sb, "\tcase %d: return wasm_%s.nonfinite_count\n", i, unique_names[i])
    }
    fmt.sbprint(&sb, "\t}\n\treturn 0\n}\n\n")

    fmt.sbprint(&sb, "@(export)\nskald_get_nonfinite_count :: proc \"c\" () -> i32 {\n")
    fmt.sbprint(&sb, "\tcontext = runtime.default_context()\n")
    fmt.sbprint(&sb, "\ttotal := skald_master_flush_count\n")
    for i in 0 ..< len(project.instruments) {
        fmt.sbprintf(&sb, "\ttotal += wasm_%s.nonfinite_count\n", unique_names[i])
    }
    fmt.sbprint(&sb, "\treturn total\n}\n\n")

    fmt.sbprint(&sb, "@(export)\nskald_seek :: proc \"c\" (asset: i32, step: i32, samples_until_next: i32) {\n")
    fmt.sbprint(&sb, "\tcontext = runtime.default_context()\n")
    fmt.sbprint(&sb, "\tif step < 0 || samples_until_next < 0 do return\n")
    fmt.sbprint(&sb, "\tswitch asset {\n")
    for i in 0 ..< len(project.instruments) {
        n := unique_names[i]
        fmt.sbprintf(&sb, "\tcase %d:\n", i)
        fmt.sbprintf(&sb, "\t\twasm_%s.current_step = u64(step)\n", n)
        fmt.sbprintf(&sb, "\t\twasm_%s.samples_until_next_step = u64(samples_until_next)\n", n)
        fmt.sbprintf(&sb, "\t\twasm_%s.step_frac_acc = 0.0\n", n)
    }
    fmt.sbprint(&sb, "\t}\n}\n\n")

    any_solo := false
    for i in 0 ..< len(project.instruments) {
        if project.instruments[i].solo do any_solo = true
    }

    fmt.sbprint(&sb, "@(export)\nskald_process :: proc \"c\" (nframes: i32) -> i32 {\n")
    fmt.sbprint(&sb, "\tcontext = runtime.default_context()\n")
    fmt.sbprint(&sb, "\tn := int(nframes)\n")
    fmt.sbprint(&sb, "\tif n > SKALD_WASM_BLOCK do n = SKALD_WASM_BLOCK\n")
    fmt.sbprint(&sb, "\tfor i in 0 ..< n {\n")
    fmt.sbprint(&sb, "\t\tmixed_left: f32 = 0.0\n")
    fmt.sbprint(&sb, "\t\tmixed_right: f32 = 0.0\n")
    for i in 0 ..< len(project.instruments) {
        n := unique_names[i]
        inst := &project.instruments[i]
        if inst.mute || (any_solo && !inst.solo) {
            fmt.sbprintf(&sb, "\t\t// %s: muted in the project (excluded from the mix)\n", n)
            continue
        }
        fmt.sbprintf(&sb, "\t\t{{ l, r := %s_process(&wasm_%s); mixed_left += l; mixed_right += r }}\n", n, n)
    }
    // E5: same order as project_process — volume, then DC block, then limit.
    fmt.sbprint(&sb, "\t\tvol_left := mixed_left * wasm_master_volume\n")
    fmt.sbprint(&sb, "\t\tvol_right := mixed_right * wasm_master_volume\n")
    fmt.sbprint(&sb, "\t\tdcb_left, dcb_right := skald_dc_block(&wasm_dc, vol_left, vol_right)\n")
    fmt.sbprint(&sb, "\t\tskald_left[i], skald_right[i] = skald_soft_limit(dcb_left, dcb_right)\n")
    fmt.sbprint(&sb, "\t}\n")
    fmt.sbprint(&sb, "\treturn i32(n)\n")
    fmt.sbprint(&sb, "}\n")

    return strings.to_string(sb)
}

// F-B05-6 (packet B12): the header used to omit the setters, _PARAMS and
// set_param entirely, so the expose mechanism — the whole point of exposing a
// parameter in the editor — was invisible to the game team reading the file.
// Emitted from the SAME plans the setters are generated from (see the note at
// the top of generate_project_code), so every setter named here exists below.
emit_exposed_param_contract :: proc(sb: ^strings.Builder, project: ^Project, unique_names: []string, plans: []Instrument_Plan) {
    fmt.sbprint(sb, "// Exposed parameters. Two setter styles per asset, both clamped to the range:\n")
    fmt.sbprint(sb, "//   typed   <Foo>_set_<field>(p, value)\n")
    fmt.sbprint(sb, "//   string  <Foo>_set_param(p, \"<field>\", value) -> bool   (false = unknown name;\n")
    fmt.sbprint(sb, "//           also accepts the editor's \"<nodeId>::<param>\" key). <Foo>_get_param\n")
    fmt.sbprint(sb, "//           reads back; <Foo>_PARAMS lists name/min/max/default/unit for UI binding.\n")
    // C3 (F-B05-4): the naming contract, stated where the game team reads
    // it. The typed setter's field is collision-prefixed — it gains a
    // "<Label>_" prefix when another node in the same asset exposes the same
    // parameter and loses it again when that exposure goes away — so an edit
    // to node B can rename node A's setter. The "<nodeId>::<param>" key
    // cannot move: the node id never changes. Labels are defaulted on every
    // node, so no rule local to node A could pin the typed name without
    // renaming every existing setter; the alias is the stable key instead.
    fmt.sbprint(sb, "// Stable identity: <Foo> is the Instrument's Export ID (its display name only when\n")
    fmt.sbprint(sb, "//   no Export ID is set), so renaming the instrument does not rename its procs. A\n")
    fmt.sbprint(sb, "//   typed setter's <field> gains a <Label>_ prefix when another node in the same asset\n")
    fmt.sbprint(sb, "//   exposes the same parameter, and loses it when that exposure goes away. Game code\n")
    fmt.sbprint(sb, "//   that must survive edits should key on <Foo>_set_param(p, \"<nodeId>::<param>\", v):\n")
    fmt.sbprint(sb, "//   the node id never changes. Both halves are listed per setter below.\n")
    for i in 0 ..< len(project.instruments) {
        name := unique_names[i]
        plan := &plans[i]
        if len(plan.stable_resolutions) == 0 {
            fmt.sbprintf(sb, "//   %s: (no exposed parameters)\n", name)
            continue
        }
        fmt.sbprintf(sb, "//   %s\n", name)
        for res in plan.stable_resolutions {
            // The raw node id is the editor's half of the "::" alias, but it is
            // authored text: node_key_emittable is the same filter set_param's
            // dispatch applies, so an id that cannot appear there is not shown
            // here either (a newline in a comment would end the comment).
            node := res.node_raw_id
            if node == "" || !node_key_emittable(node) do node = res.node_id
            unit := res.unit
            if unit == "" do unit = "-"
            // %.6g, not %v: %v prints an f32 0.01 as 0.0099999998. Six
            // significant digits reproduce every range-table literal exactly
            // (20000 stays 20000; %.4g would print 2e+04).
            fmt.sbprintf(
                sb,
                "//     %s_set_%s   min %.6g  max %.6g  default %.6g  unit %s   (node %s, param %s)\n",
                name, res.field_name, res.range_min, res.range_max, res.default, unit, node, res.param_name,
            )
        }
    }
}
