package skald_unit_tests

// =====================================================================
// Roadmap packet C3 — stable asset identity (F-C3-10, F-B05-4, F-A09-7/8).
//
// A game addressed a Skald asset three ways and all three moved under
// ordinary editing: the symbol prefix was the DISPLAY NAME sanitized (so a
// cosmetic rename broke the game's build), two same-named instruments got a
// silent `_2` nobody could see in the editor, and whether an asset was an
// SFX or a Music Layer was re-inferred from whatever the track view held
// at Generate time. C3 gives the Instrument an explicit Export ID and an
// explicit asset type; this file pins how the generator reads them.
//
//   core.instrument_export_prefix(inst) -> (prefix, explicit)
//       The Export ID (sanitized) when one is set; the legacy
//       clean_instrument_name otherwise, so every pre-C3 file keeps the
//       symbols it always had.
//   core.find_export_prefix_conflict(project) -> (conflict, found)
//       Two assets resolving to one prefix where at least one pinned it
//       explicitly. The call site exits; the finder is what the test runs
//       (the same split preflight_test.odin uses).
//   core.detect_asset_type(inst, project)
//       Honours an explicit setting before falling back to the track
//       inference.
//
// Run (from skald-backend\):
//   odin test tests\unit
// =====================================================================

import core "../../core"
import "core:testing"

inst_named :: proc(id, name, export_id: string, asset_type: core.Asset_Type_Setting) -> core.Project_Instrument {
	return core.Project_Instrument{id = id, name = name, export_id = export_id, asset_type = asset_type}
}

@(test)
test_export_id_names_the_asset_not_the_display_name :: proc(t: ^testing.T) {
	inst := inst_named("n1", "Bass Synth (v2)", "Bass", .Auto)
	prefix, explicit := core.instrument_export_prefix(&inst)
	testing.expect_value(t, prefix, "Bass")
	testing.expect(t, explicit, "a set Export ID is an explicit choice")
}

@(test)
test_export_id_is_sanitized_like_every_other_identifier :: proc(t: ^testing.T) {
	inst := inst_named("n1", "Bass", "Player SFX-2", .Auto)
	prefix, _ := core.instrument_export_prefix(&inst)
	testing.expect_value(t, prefix, "Player_SFX_2")
}

@(test)
test_export_id_absent_falls_back_to_the_display_name :: proc(t: ^testing.T) {
	// Pre-C3 files have no Export ID; their symbols must not move.
	inst := inst_named("n1", "Bass Synth", "", .Auto)
	prefix, explicit := core.instrument_export_prefix(&inst)
	testing.expect_value(t, prefix, "Bass_Synth")
	testing.expect(t, !explicit, "a derived prefix is not an explicit choice")
}

@(test)
test_export_id_of_only_punctuation_is_treated_as_absent :: proc(t: ^testing.T) {
	// "---" sanitizes to "___": no usable characters, so it cannot name a
	// proc. Same fallback rule as a degenerate display name (F-B04-5).
	inst := inst_named("n1", "Bass", "---", .Auto)
	prefix, explicit := core.instrument_export_prefix(&inst)
	testing.expect_value(t, prefix, "Bass")
	testing.expect(t, !explicit, "an unusable Export ID must not count as explicit")
}

@(test)
test_two_explicit_export_ids_that_collide_are_a_conflict :: proc(t: ^testing.T) {
	insts := []core.Project_Instrument{
		inst_named("a", "Bass", "Keys", .Auto),
		inst_named("b", "Lead", "Keys", .Auto),
	}
	project := core.Project{instruments = insts}
	conflict, found := core.find_export_prefix_conflict(&project)
	testing.expect(t, found, "two assets pinned to one prefix must be reported")
	testing.expect_value(t, conflict.prefix, "Keys")
	testing.expect_value(t, conflict.a_name, "Bass")
	testing.expect_value(t, conflict.b_name, "Lead")
}

@(test)
test_an_explicit_export_id_colliding_with_a_derived_name_is_a_conflict :: proc(t: ^testing.T) {
	// The user pinned "Keys"; another instrument merely happens to be
	// displayed as "Keys". Silently renaming either would defeat the pin.
	insts := []core.Project_Instrument{
		inst_named("a", "Keys", "", .Auto),
		inst_named("b", "Piano", "Keys", .Auto),
	}
	project := core.Project{instruments = insts}
	_, found := core.find_export_prefix_conflict(&project)
	testing.expect(t, found, "a pinned prefix taken by a derived name must be reported")
}

@(test)
test_derived_duplicates_keep_the_legacy_suffix :: proc(t: ^testing.T) {
	// Two pre-C3 instruments both displayed as "Bass" have always emitted
	// Bass and Bass_2. That is not a conflict — nobody pinned anything —
	// and the suffix rule is unchanged so their goldens do not move.
	insts := []core.Project_Instrument{
		inst_named("a", "Bass", "", .Auto),
		inst_named("b", "Bass", "", .Auto),
	}
	project := core.Project{instruments = insts}
	_, found := core.find_export_prefix_conflict(&project)
	testing.expect(t, !found, "derived duplicates are the legacy case, not a conflict")
	names := core.resolve_unique_names(&project)
	defer delete(names)
	testing.expect_value(t, names[0], "Bass")
	testing.expect_value(t, names[1], "Bass_2")
}

@(test)
test_explicit_asset_type_overrides_the_track_inference :: proc(t: ^testing.T) {
	events := []core.Note_Event{{note = 60, velocity = 1, step = 0, duration = 0.25}}
	tracks := []core.Sequencer_Track{{target_node_id = "a", events = events}}
	sfx := inst_named("a", "Kick", "", .SFX)
	music := inst_named("b", "Pad", "", .Music_Layer)
	auto := inst_named("a", "Kick", "", .Auto)
	project := core.Project{sequencer_tracks = tracks}

	// A track with notes points at it, but the author said one-shot.
	testing.expect_value(t, core.detect_asset_type(&sfx, &project), core.Asset_Type.SFX)
	// No track at all, but the author said music layer: the sequence runs.
	testing.expect_value(t, core.detect_asset_type(&music, &project), core.Asset_Type.Music_Layer)
	// Auto is the pre-C3 rule, unchanged.
	testing.expect_value(t, core.detect_asset_type(&auto, &project), core.Asset_Type.Music_Layer)
}

@(test)
test_asset_type_setting_parses_the_editor_spelling_only :: proc(t: ^testing.T) {
	testing.expect_value(t, core.parse_asset_type_setting("sfx"), core.Asset_Type_Setting.SFX)
	testing.expect_value(t, core.parse_asset_type_setting("music"), core.Asset_Type_Setting.Music_Layer)
	testing.expect_value(t, core.parse_asset_type_setting(""), core.Asset_Type_Setting.Auto)
	// Anything else is a value this generator does not know; inferring is
	// safer than guessing what a future editor meant.
	testing.expect_value(t, core.parse_asset_type_setting("Music Layer"), core.Asset_Type_Setting.Auto)
}

@(test)
test_graph_shape_reads_export_id_and_asset_type_from_the_instrument_node :: proc(t: ^testing.T) {
	src := `{
	  "version": 2,
	  "nodes": [
	    { "id": "inst1", "type": "instrument", "position": {"x":0,"y":0},
	      "data": { "name": "Bass Synth", "exportId": "Bass", "assetType": "sfx",
	                "subgraph": { "nodes": [
	                  { "id": "o", "type": "oscillator", "position": {"x":0,"y":0}, "data": { "frequency": 110 } },
	                  { "id": "g", "type": "graphOutput", "position": {"x":0,"y":0}, "data": {} }
	                ], "connections": [ { "from_node": "o", "from_port": "output", "to_node": "g", "to_port": "input" } ] } } }
	  ],
	  "edges": [],
	  "sequencerTracks": [ { "id": "t", "targetNodeId": "inst1", "name": "Bass Synth", "steps": 16,
	                         "notes": [ { "step": 0, "note": 36, "velocity": 1, "duration": 0.25 } ], "isMuted": false, "isSolo": false } ]
	}`
	project, err := core.build_project_from_json(transmute([]byte)src)
	testing.expect(t, err == "", err)
	if err != "" do return
	testing.expect_value(t, len(project.instruments), 1)
	if len(project.instruments) != 1 do return
	inst := &project.instruments[0]
	testing.expect_value(t, inst.export_id, "Bass")
	testing.expect_value(t, inst.asset_type, core.Asset_Type_Setting.SFX)
	prefix, _ := core.instrument_export_prefix(inst)
	testing.expect_value(t, prefix, "Bass")
	// The track has a note, but the node says SFX.
	testing.expect_value(t, core.detect_asset_type(inst, &project), core.Asset_Type.SFX)
	testing.expect_value(t, core.SAVE_FORMAT_VERSION, 3)
}
