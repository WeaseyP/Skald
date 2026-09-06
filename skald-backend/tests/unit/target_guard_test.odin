package skald_unit_tests

// =====================================================================
// Roadmap packet B9-3 — the CLI's output-target guard.
//
//   core.codegen_target_conflict(out_path, package_name) -> (msg, conflict)
//
// A case-by-case mirror of skald-ui/src/main/codegenGuards.ts, whose own
// tests (src/tests/main/ipcGuards.test.ts) these follow one for one. Real
// temp directories, not a mocked filesystem: the failure this prevents is a
// real file being clobbered, and only the real fs proves the guard sees it.
//
// Run (from skald-backend\):
//   odin test tests\unit
// =====================================================================

import core "../../core"
import "core:fmt"
import "core:os"
import "core:strings"
import "core:testing"

// One scratch directory per test so `odin test`'s parallel runner cannot make
// two tests see each other's files. Leftovers from an aborted run are cleared
// first.
guard_dir :: proc(name: string) -> string {
	base := os.get_env("TEMP", context.temp_allocator)
	if base == "" do base = "."
	dir := fmt.aprintf("%s/skald-guard-%s", base, name)
	guard_cleanup(dir)
	os.make_directory(dir)
	return dir
}

guard_cleanup :: proc(dir: string) {
	if fd, err := os.open(dir); err == nil {
		if entries, rerr := os.read_dir(fd, -1); rerr == nil {
			for e in entries do os.remove(e.fullpath)
			os.file_info_slice_delete(entries)
		}
		os.close(fd)
	}
	os.remove_directory(dir)
}

guard_write :: proc(dir: string, name: string, contents: string) -> string {
	path := fmt.aprintf("%s/%s", dir, name)
	ok := os.write_entire_file(path, transmute([]byte)contents)
	assert(ok, "test fixture write failed")
	return path
}

// --- guard 1: the target file itself ------------------------------------

@(test)
test_overwrite_same_package_is_allowed :: proc(t: ^testing.T) {
	dir := guard_dir("same_pkg")
	defer guard_cleanup(dir)
	out := guard_write(dir, "generated_audio.odin", "package generated_audio\n\nmain :: proc() {}\n")
	_, conflict := core.codegen_target_conflict(out, "generated_audio")
	testing.expect(t, !conflict, "a target already declaring the same package is the normal regenerate case")
}

@(test)
test_overwrite_foreign_package_is_refused_naming_both :: proc(t: ^testing.T) {
	dir := guard_dir("foreign_pkg")
	defer guard_cleanup(dir)
	out := guard_write(dir, "test_harness.odin", "package main\n\nmain :: proc() {}\n")
	msg, conflict := core.codegen_target_conflict(out, "generated_audio")
	testing.expect(t, conflict, "a target declaring a different package must be refused")
	testing.expect(t, strings.contains(msg, "Refusing to overwrite"), msg)
	testing.expect(t, strings.contains(msg, "'package main'"), "message must name the existing package")
	testing.expect(t, strings.contains(msg, "'package generated_audio'"), "message must name the package we would write")
}

@(test)
test_target_without_package_line_is_allowed :: proc(t: ^testing.T) {
	dir := guard_dir("no_pkg_line")
	defer guard_cleanup(dir)
	out := guard_write(dir, "scratch.odin", "// just a comment, no package line\n")
	_, conflict := core.codegen_target_conflict(out, "generated_audio")
	testing.expect(t, !conflict, "no package declaration means nothing to protect")
}

@(test)
test_missing_target_file_is_allowed :: proc(t: ^testing.T) {
	dir := guard_dir("missing_target")
	defer guard_cleanup(dir)
	out := fmt.tprintf("%s/brand_new.odin", dir)
	_, conflict := core.codegen_target_conflict(out, "generated_audio")
	testing.expect(t, !conflict, "a target that does not exist yet cannot conflict")
}

@(test)
test_package_line_may_be_indented_and_crlf :: proc(t: ^testing.T) {
	// readPackage's regex is /^\s*package\s+.../m — leading whitespace and a
	// CRLF file are both fine. Files in this repo are mostly CRLF.
	dir := guard_dir("indented_crlf")
	defer guard_cleanup(dir)
	out := guard_write(dir, "x.odin", "// header\r\n  package   main\r\n\r\nfoo :: proc() {}\r\n")
	msg, conflict := core.codegen_target_conflict(out, "generated_audio")
	testing.expect(t, conflict, "an indented CRLF `package main` must still be read")
	testing.expect(t, strings.contains(msg, "'package main'"), msg)
}

// --- guard 2: siblings in the output directory --------------------------

@(test)
test_foreign_sibling_is_refused_naming_the_file :: proc(t: ^testing.T) {
	dir := guard_dir("foreign_sibling")
	defer guard_cleanup(dir)
	guard_write(dir, "test_harness.odin", "package main\n")
	out := fmt.tprintf("%s/generated_audio.odin", dir)
	msg, conflict := core.codegen_target_conflict(out, "generated_audio")
	testing.expect(t, conflict, "a sibling declaring a different package makes the directory unwritable")
	testing.expect(t, strings.contains(msg, "Refusing to write into"), msg)
	testing.expect(t, strings.contains(msg, "test_harness.odin"), "message must name the sibling")
	testing.expect(t, strings.contains(msg, "'package main'"), "message must name the sibling's package")
}

@(test)
test_same_package_sibling_is_allowed :: proc(t: ^testing.T) {
	// The preview directory: generated_audio.odin next to wasm_shim.odin,
	// both `package generated_audio`.
	dir := guard_dir("same_sibling")
	defer guard_cleanup(dir)
	guard_write(dir, "wasm_shim.odin", "package generated_audio\n")
	out := fmt.tprintf("%s/generated_audio.odin", dir)
	_, conflict := core.codegen_target_conflict(out, "generated_audio")
	testing.expect(t, !conflict, "a sibling of the same package is the two-file preview layout")
}

@(test)
test_non_odin_sibling_is_ignored :: proc(t: ^testing.T) {
	// acceptance/generated_audio/ holds `_stub.odin.template`, whose contents
	// declare `package generated_audio` — but a template of any package is
	// not a source file and must not be read as one.
	dir := guard_dir("template_sibling")
	defer guard_cleanup(dir)
	guard_write(dir, "_stub.odin.template", "package main\n")
	guard_write(dir, "notes.txt", "package main\n")
	out := fmt.tprintf("%s/generated_audio.odin", dir)
	_, conflict := core.codegen_target_conflict(out, "generated_audio")
	testing.expect(t, !conflict, "only .odin siblings participate in the one-package-per-directory rule")
}

@(test)
test_odin_extension_match_is_case_insensitive :: proc(t: ^testing.T) {
	dir := guard_dir("upper_ext")
	defer guard_cleanup(dir)
	guard_write(dir, "HARNESS.ODIN", "package main\n")
	out := fmt.tprintf("%s/generated_audio.odin", dir)
	_, conflict := core.codegen_target_conflict(out, "generated_audio")
	testing.expect(t, conflict, "the compiler reads HARNESS.ODIN as a source file, so must the guard")
}

@(test)
test_missing_directory_is_allowed :: proc(t: ^testing.T) {
	base := os.get_env("TEMP", context.temp_allocator)
	if base == "" do base = "."
	out := fmt.tprintf("%s/skald-guard-does-not-exist-%d/generated_audio.odin", base, 424242)
	_, conflict := core.codegen_target_conflict(out, "generated_audio")
	testing.expect(t, !conflict, "a directory that does not exist is the write's error to report, not a package conflict")
}
