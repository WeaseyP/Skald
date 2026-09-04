package skald_core

import "core:fmt"
import "core:os"
import "core:path/filepath"
import "core:strings"

// =================================================================================
// Output-target guard (roadmap packet B9-3).
//
// Odin allows exactly ONE package per directory, and every generated file
// declares `package <package_name>`. Two ways a Generate could silently destroy
// hand-written code — and did, to the test harness: overwriting a
// foreign-package file at the exact output path, or dropping our file into a
// directory that already owns another package.
//
// The editor has refused both since the incident (skald-ui/src/main/
// codegenGuards.ts, assertCodegenTargetSafe), but only the editor: the CLI —
// the path every harness, script and game-team integration takes — wrote
// wherever -out: pointed. This is a case-by-case mirror of that TypeScript,
// kept deliberately literal (same two guards, same order, same message text) so
// a reader can diff them by eye. If you change one, change the other.
// =================================================================================

/// The `package X` declaration of an Odin source file. Mirrors readPackage's
/// /^\s*package\s+([A-Za-z0-9_]+)/m: the first line that, after leading
/// whitespace, reads `package` + whitespace + identifier. ("", false) when the
/// file has no such line or cannot be read — both mean "nothing to protect".
read_package_decl :: proc(path: string) -> (string, bool) {
	data, ok := os.read_entire_file(path)
	if !ok do return "", false
	defer delete(data)
	text := string(data)
	for line in strings.split_lines_iterator(&text) {
		trimmed := strings.trim_left_space(line)
		if !strings.has_prefix(trimmed, "package") do continue
		rest := trimmed[len("package"):]
		if len(rest) == 0 || (rest[0] != ' ' && rest[0] != '\t') do continue
		rest = strings.trim_left_space(rest)
		end := 0
		for end < len(rest) {
			c := rest[end]
			is_ident := (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9') || c == '_'
			if !is_ident do break
			end += 1
		}
		if end == 0 do continue
		return strings.clone(rest[:end]), true
	}
	return "", false
}

/// Both guards, first failure wins — assertCodegenTargetSafe's shape. Returns
/// the message to print (allocated) and whether writing must be refused. A
/// directory that does not exist yet is not a conflict: the write itself will
/// report that, with the OS's own wording.
codegen_target_conflict :: proc(out_path: string, package_name: string) -> (msg: string, conflict: bool) {
	// Guard 1: a file at the output path declaring a DIFFERENT package.
	if os.is_file(out_path) {
		if existing, ok := read_package_decl(out_path); ok && existing != package_name {
			return fmt.aprintf(
				"Refusing to overwrite %s: it declares 'package %s', but this generation would write 'package %s'. That file looks hand-written (e.g. the test harness). Pick a different output file, such as skald-backend/tester/generated_audio/generated_audio.odin.",
				out_path, existing, package_name,
			), true
		}
	}

	// Guard 2: a sibling .odin file in the output directory declaring a
	// DIFFERENT package (adding ours would break the build). Extension match
	// is case-insensitive like the TypeScript's toLowerCase(); the target file
	// itself is skipped because guard 1 already judged it.
	dir := filepath.dir(out_path)
	defer delete(dir)
	base := filepath.base(out_path)
	fd, open_err := os.open(dir)
	if open_err != nil do return "", false
	defer os.close(fd)
	entries, read_err := os.read_dir(fd, -1)
	if read_err != nil do return "", false
	defer os.file_info_slice_delete(entries)
	for e in entries {
		if e.is_dir do continue
		lower := strings.to_lower(e.name, context.temp_allocator)
		if !strings.has_suffix(lower, ".odin") do continue
		if strings.equal_fold(e.name, base) do continue
		sibling, ok := read_package_decl(e.fullpath)
		if ok && sibling != package_name {
			return fmt.aprintf(
				"Refusing to write into %s: it contains %s ('package %s'), and Odin allows only one package per directory — adding 'package %s' there would break the build. Pick a directory of its own, such as skald-backend/tester/generated_audio/generated_audio.odin.",
				dir, e.name, sibling, package_name,
			), true
		}
	}
	return "", false
}
