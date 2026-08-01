package skald_unit_tests

// =====================================================================
// Packet B1 / BUGS.md SKB-004 — the master-volume presence contract.
//
// Two procs are under test:
//
//   core.resolved_master_volume(authored: Maybe(f32)) -> f32
//       THE decision point B1 exists to create: absent -> unity (a
//       session-less legacy file keeps exporting exactly as it always
//       did), authored 0 -> real silence (a deliberately muted project
//       ships muted — before this, `<= 0.0` was misread as "absent" and
//       the export came out at FULL volume), negative -> clamped to
//       silence, positive -> as authored. Both readers of .skald.json
//       call this one proc, which is what keeps them from drifting.
//
//   core.session_has_values(session: Session_Raw) -> bool
//       Presence of the session block itself, now measured from Maybe
//       nil-ness rather than inferred from `> 0` value sniffing — the
//       inference that made `{"masterVolume": 0}` indistinguishable from
//       no session at all.
//
// json_roundtrip_* additionally pins the property everything above rests
// on: the vendored Odin unmarshaller really does distinguish an absent
// key (nil) from an authored 0 (non-nil) through a Maybe field, for both
// integer-token and float-token spellings. If a toolchain bump ever
// breaks that, these fail before any golden does.
//
// Run (from skald-backend\):
//   odin test tests\unit
// =====================================================================

import core "../../core"
import "core:encoding/json"
import "core:testing"

@(test)
resolved_master_volume_absent_is_unity :: proc(t: ^testing.T) {
	testing.expect_value(t, core.resolved_master_volume(nil), 1.0)
}

@(test)
resolved_master_volume_authored_zero_is_silence :: proc(t: ^testing.T) {
	// The deliberate behaviour change (SKB-004): 0 is a real value.
	testing.expect_value(t, core.resolved_master_volume(f32(0.0)), 0.0)
}

@(test)
resolved_master_volume_negative_clamps_to_silence :: proc(t: ^testing.T) {
	testing.expect_value(t, core.resolved_master_volume(f32(-0.5)), 0.0)
}

@(test)
resolved_master_volume_authored_value_passes_through :: proc(t: ^testing.T) {
	testing.expect_value(t, core.resolved_master_volume(f32(0.7)), 0.7)
	// > 1 is legal — it drives the soft limiter harder, same as always.
	testing.expect_value(t, core.resolved_master_volume(f32(1.5)), 1.5)
}

@(test)
session_presence_from_maybe_not_value_sniffing :: proc(t: ^testing.T) {
	empty: core.Session_Raw
	testing.expect(t, !core.session_has_values(empty), "zeroed Session_Raw must read as absent")

	zero_master := core.Session_Raw{masterVolume = f32(0.0)}
	testing.expect(
		t,
		core.session_has_values(zero_master),
		"an authored masterVolume of 0 IS a session block — the old `> 0` sniff read it as absent, which is SKB-004's shape",
	)

	bpm_only := core.Session_Raw{bpm = f32(140.0)}
	testing.expect(t, core.session_has_values(bpm_only), "a partial block counts as present")
}

@(test)
json_roundtrip_maybe_distinguishes_absent_from_zero :: proc(t: ^testing.T) {
	authored_zero: core.Session_Raw
	err0 := json.unmarshal(transmute([]byte)string(`{"bpm": 128, "masterVolume": 0}`), &authored_zero)
	testing.expect(t, err0 == nil, "unmarshal of an integer-token masterVolume failed")
	mv, present := authored_zero.masterVolume.?
	testing.expect(t, present, "authored masterVolume: 0 must arrive non-nil")
	testing.expect_value(t, mv, 0.0)
	bpm, bpm_present := authored_zero.bpm.?
	testing.expect(t, bpm_present, "authored bpm must arrive non-nil")
	testing.expect_value(t, bpm, 128.0)

	absent: core.Session_Raw
	err1 := json.unmarshal(transmute([]byte)string(`{"bpm": 128}`), &absent)
	testing.expect(t, err1 == nil)
	testing.expect(t, absent.masterVolume == nil, "an absent masterVolume key must arrive nil")

	// A UI NaN serializes as null; "not a number" and "not authored" must
	// mean the same thing.
	null_val: core.Session_Raw
	err2 := json.unmarshal(transmute([]byte)string(`{"masterVolume": null}`), &null_val)
	testing.expect(t, err2 == nil)
	testing.expect(t, null_val.masterVolume == nil, "masterVolume: null must arrive nil")

	// Float-token spelling of zero, the shape the editor's serializer emits.
	float_zero: core.Session_Raw
	err3 := json.unmarshal(transmute([]byte)string(`{"masterVolume": 0.0}`), &float_zero)
	testing.expect(t, err3 == nil)
	fmv, fpresent := float_zero.masterVolume.?
	testing.expect(t, fpresent, "authored masterVolume: 0.0 must arrive non-nil")
	testing.expect_value(t, fmv, 0.0)
}

@(test)
json_roundtrip_project_shape_master_volume :: proc(t: ^testing.T) {
	// Same contract on the project-shaped reader's raw struct.
	authored: core.Project_Raw
	err := json.unmarshal(
		transmute([]byte)string(`{"project": {"bpm": 120, "master_volume": 0, "instruments": []}}`),
		&authored,
	)
	testing.expect(t, err == nil)
	mv, present := authored.project.master_volume.?
	testing.expect(t, present, "authored project master_volume: 0 must arrive non-nil")
	testing.expect_value(t, mv, 0.0)

	absent: core.Project_Raw
	err2 := json.unmarshal(
		transmute([]byte)string(`{"project": {"bpm": 120, "instruments": []}}`),
		&absent,
	)
	testing.expect(t, err2 == nil)
	testing.expect(t, absent.project.master_volume == nil, "absent project master_volume must arrive nil")
}
