package skald_core

// Default min/max/default/unit for known parameter names. The codegen reads
// this at codegen-time to clamp typed setters and to populate the
// introspectable <Foo>_PARAMS table on each generated processor.
//
// These ranges are conservative (covering audible-range frequencies, time
// constants from 1ms to 10s, normalized 0-1 mix/feedback, etc.) and match
// the ranges sliders use in the UI's parameter panel. If the UI later sends
// per-parameter ranges in the JSON contract, the codegen can prefer those
// over this fallback table.

Param_Range :: struct {
	min:     f32,
	max:     f32,
	default: f32,
	unit:    string,
}

import "core:strings"

lookup_param_range :: proc(name: string) -> Param_Range {
	// Mixer channel levels: level1, level2, ... Default 1.0 (unity), NOT the
	// wide-open unknown fallback — an exposed channel used to initialize to
	// 0.0 (silently muted) with a ±1e6 clamp.
	if strings.has_prefix(name, "level") && len(name) > 5 {
		return {0.0, 2.0, 1.0, "x"}
	}
	switch name {
	// Pitch / spectrum
	case "frequency":
		return {20.0, 20000.0, 440.0, "Hz"}
	case "cutoff":
		return {20.0, 20000.0, 800.0, "Hz"}
	case "resonance":
		return {0.1, 20.0, 1.0, "Q"}
	case "phase":
		return {0.0, 360.0, 0.0, "deg"}
	case "pulseWidth":
		return {0.0, 1.0, 0.5, ""}

	// Envelope
	case "attack":
		return {0.001, 10.0, 0.1, "s"}
	case "decay":
		return {0.001, 10.0, 0.1, "s"}
	case "sustain":
		return {0.0, 1.0, 0.7, ""}
	case "release":
		return {0.001, 10.0, 0.2, "s"}
	case "depth":
		return {0.0, 1.0, 1.0, ""}
	case "velocitySensitivity":
		return {0.0, 1.0, 0.5, ""}

	// Effects
	case "delayTime":
		return {0.0, 2.0, 0.5, "s"}
	case "feedback":
		return {0.0, 0.99, 0.5, ""}
	case "wetDryMix", "mix":
		return {0.0, 1.0, 0.5, ""}
	case "drive":
		return {1.0, 100.0, 20.0, "x"}

	// Mixers / amplitude
	case "gain":
		return {0.0, 4.0, 1.0, "x"}
	case "amplitude":
		return {0.0, 1.0, 0.5, ""}
	case "pan":
		return {-1.0, 1.0, 0.0, ""}

	// Modulation
	case "rate":
		return {0.1, 100.0, 10.0, "Hz"}
	case "modIndex":
		return {0.0, 1000.0, 100.0, ""}

	// Mapper / range nodes
	case "inMin", "outMin":
		return {-1.0e6, 1.0e6, 0.0, ""}
	case "inMax", "outMax":
		return {-1.0e6, 1.0e6, 1.0, ""}

	// Global / project
	case "bpm":
		return {20.0, 999.0, 120.0, "bpm"}
	case "voiceCount":
		return {1.0, 64.0, 8.0, ""}
	case "unison":
		return {1.0, 16.0, 1.0, ""}
	case "detune":
		return {0.0, 100.0, 5.0, "cents"}
	case "glide":
		return {0.0, 5.0, 0.05, "s"}
	}

	// Unknown parameter: wide-open range, neutral default. Caller can still
	// expose this; the clamp simply won't bite.
	return {-1.0e6, 1.0e6, 0.0, ""}
}
