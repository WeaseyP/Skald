package skald_core

// =================================================================================
// Roadmap packet G3 (§9.5) — runtime musical scale quantization.
//
// The scale interval tables and the nearest-in-scale search, authored ONCE
// here and mirrored case by case against skald-ui/src/contexts/ScaleContext.tsx
// (SCALES / nearestInScale) — the editor's own reader of the same idea, which
// bakes a sequencer's authored notes into a chosen scale at Save/Generate time.
// This file exists to give the GENERATED Odin the same capability at runtime
// (skald_nearest_in_scale, emitted into codegen_project.odin's
// emit_scale_proc, mirrors nearest_in_scale below statement for statement),
// so a game can transpose a running instrument's key/scale without
// regenerating anything.
//
// Pinned by tests/unit/scale_test.odin against literals computed FROM the TS
// (this file and the TS never read each other, so a literal table is what
// keeps the two from drifting silently — the same reasoning CLAUDE.md gives
// for any TS mirror of Odin logic, applied in the other direction here).
// =================================================================================

// Editor order (ScaleContext.tsx's ScaleName union). Chromatic is the
// identity scale — every semitone is "in scale" — so it is also what an
// absent/unrecognised session value resolves to: "no quantization" rather
// than an arbitrary pick.
Scale_Kind :: enum {
	Chromatic,
	Major,
	Minor,
	Pentatonic,
	Dorian,
	Phrygian,
	Lydian,
	Mixolydian,
}

// Semitone offsets from the root, authored order (the tie-break below walks
// this order, not a sorted one). Mirrors ScaleContext.tsx's SCALES exactly.
SCALE_INTERVALS := [Scale_Kind][]int{
	.Chromatic  = {0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11},
	.Major      = {0, 2, 4, 5, 7, 9, 11},
	.Minor      = {0, 2, 3, 5, 7, 8, 10},
	.Pentatonic = {0, 3, 5, 7, 10},
	.Dorian     = {0, 2, 3, 5, 7, 9, 10},
	.Phrygian   = {0, 1, 3, 5, 7, 8, 10},
	.Lydian     = {0, 2, 4, 6, 7, 9, 11},
	.Mixolydian = {0, 2, 4, 5, 7, 9, 10},
}

// The editor's spelling (ScaleContext.tsx's ScaleName). Anything else —
// absent (every project before this packet), a hand-edited file, a future
// editor's typo — is Chromatic, so a bad value degrades to "plays what it's
// told" rather than an arbitrary quantization nobody authored.
parse_scale_name :: proc(s: string) -> Scale_Kind {
	switch s {
	case "Major":      return .Major
	case "Minor":      return .Minor
	case "Pentatonic": return .Pentatonic
	case "Dorian":     return .Dorian
	case "Phrygian":   return .Phrygian
	case "Lydian":     return .Lydian
	case "Mixolydian": return .Mixolydian
	}
	return .Chromatic
}

// ScaleContext.tsx's NOTES array, index = semitones above C. Mirrors it by
// position, not by parsing the sharp sign, so "C#" and any future
// respelling stay a straight table lookup on both sides.
ROOT_NOTE_NAMES := []string{"C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"}

// Unrecognised or absent -> 0 (C), the same "identity" reasoning as
// parse_scale_name: an unresolvable root should not transpose anything.
parse_root_note :: proc(s: string) -> int {
	for name, i in ROOT_NOTE_NAMES {
		if name == s do return i
	}
	return 0
}

abs_int :: proc(x: int) -> int {
	return x < 0 ? -x : x
}

// Mirrors ScaleContext.tsx::nearestInScale case by case:
//   1. normalize `note` to 0..11, then relative to `root`
//   2. already a member of the scale -> return `note` unchanged
//   3. else walk the interval table in AUTHORED order and keep the interval
//      whose shortest-arc distance is STRICTLY smaller than the best seen so
//      far — so on a tie the interval listed FIRST in SCALE_INTERVALS wins,
//      never a later one. The TS drives this with `bestDiff = 100` and a
//      `<` (never `<=`) comparison; this does the same.
nearest_in_scale :: proc(note: int, root: int, scale: Scale_Kind) -> int {
	intervals := SCALE_INTERVALS[scale]
	note_index := ((note % 12) + 12) % 12
	relative := ((note_index - root) % 12 + 12) % 12
	for interval in intervals {
		if interval == relative do return note
	}
	best_diff := 100
	for interval in intervals {
		diff := interval - relative
		if diff > 6 {
			diff -= 12
		} else if diff < -6 {
			diff += 12
		}
		if abs_int(diff) < abs_int(best_diff) {
			best_diff = diff
		}
	}
	return note + best_diff
}
