package skald_codegen

import "core:fmt"
import "core:os"
import "core:path/filepath"
import "core:strings"
import "core"

// =====================================================================
// PROVENANCE STAMP  (roadmap packet A2 / BUGS.md SKB-001)
//
// `skald_codegen.exe -version` prints who this binary IS, so the editor can
// refuse to spawn one that does not match the backend source in the checkout
// instead of silently generating with a compiler nine commits old — which is
// exactly what shipped: the committed binary predated the "<nodeId>::<param>"
// set_param alias, so every exposed-parameter knob in preview was a no-op, and
// CI validated a compiler nobody ran.
//
// WHAT THE STAMP IS, AND WHY IT IS NOT A VERSION NUMBER
//
// Deliberately NOT a hand-maintained constant like `VERSION :: "0.2.0"`. The
// bug being fixed here is drift that nobody noticed; a number a human has to
// remember to bump is drift with extra steps — it would have read "0.1.0" all
// through the nine stale commits and certified them as current. There is also
// no git hash here: a hash identifies a commit, not a build, and the tree the
// binary was actually built from is routinely dirty (that was SKB-000).
//
// Instead the identity is CONTENT-DERIVED: `#load` embeds the bytes of every
// backend source file at compile time, and the stamp is an FNV-1a digest over
// them. It therefore changes if and only if the sources this compiler was
// built from changed, it cannot be forgotten, and the editor can recompute it
// from the files on disk without a build. `skald-ui/src/main/codegenStamp.ts`
// is the other half; the algorithm below is the contract between them.
//
// Per-file digests are printed as well as the combined one so a mismatch can
// name the file that moved ("core/codegen.odin changed since this binary was
// built") rather than just asserting staleness.
//
// THE ONE HOLE, AND WHERE IT IS GATED: this list is hand-written, so a NEW
// backend source file is invisible to the stamp until it is added here. That
// is checked in CI ("Provenance stamp covers every backend source" in
// .github/workflows/ci.yml), which compares this list against the actual
// main.odin + core\*.odin glob and fails on any file the stamp does not cover.
// =====================================================================

/// Bumped only when the OUTPUT FORMAT below changes, so a parser can tell a
/// format it does not understand from a binary that has no stamp at all.
STAMP_FORMAT :: 1

Source_File :: struct {
	path:  string,
	bytes: []byte,
}

/// Every source file that goes into this executable, with its bytes embedded
/// at compile time. Paths are relative to skald-backend\ and use forward
/// slashes so the stamp is identical on every host.
CODEGEN_SOURCES := [?]Source_File {
	{"main.odin", #load("main.odin")},
	{"core/codegen.odin", #load("core/codegen.odin")},
	{"core/codegen_analysis.odin", #load("core/codegen_analysis.odin")},
	{"core/codegen_nodes.odin", #load("core/codegen_nodes.odin")},
	{"core/codegen_processor.odin", #load("core/codegen_processor.odin")},
	{"core/codegen_project.odin", #load("core/codegen_project.odin")},
	{"core/graph_utils.odin", #load("core/graph_utils.odin")},
	{"core/graph_validate.odin", #load("core/graph_validate.odin")},
	{"core/json.odin", #load("core/json.odin")},
	{"core/param_ranges.odin", #load("core/param_ranges.odin")},
	{"core/param_utils.odin", #load("core/param_utils.odin")},
	{"core/target_guard.odin", #load("core/target_guard.odin")},
	{"core/types.odin", #load("core/types.odin")},
}

FNV1A64_OFFSET :: 0xcbf29ce484222325
FNV1A64_PRIME :: 0x100000001b3

/// FNV-1a, 64-bit, streamable via `seed`. Chosen because it is short enough to
/// be provably identical in Odin and in TypeScript (the editor recomputes it
/// from the files on disk) and needs no crypto dependency on either side. This
/// is a drift detector, not a security boundary — nothing here defends against
/// a hostile binary, only against a stale one.
fnv1a64 :: proc(data: []byte, seed: u64 = FNV1A64_OFFSET) -> u64 {
	h := seed
	for b in data {
		h ~= u64(b)
		h *= FNV1A64_PRIME
	}
	return h
}

/// Digest over every source, in list order: path, NUL, contents, NUL. The
/// paths and the separators are part of the stream so that renaming a file, or
/// moving bytes between two files, changes the answer.
source_digest :: proc() -> u64 {
	nul := [1]byte{0}
	h := u64(FNV1A64_OFFSET)
	for src in CODEGEN_SOURCES {
		h = fnv1a64(transmute([]byte)src.path, h)
		h = fnv1a64(nul[:], h)
		h = fnv1a64(src.bytes, h)
		h = fnv1a64(nul[:], h)
	}
	return h
}

/// Line-oriented and greppable on purpose: the editor parses this, CI parses
/// this, and a human reading a bug report has to be able to eyeball it.
print_version :: proc() {
	fmt.printf("skald_codegen\n")
	fmt.printf("stamp-format: %d\n", STAMP_FORMAT)
	fmt.printf("odin-version: %s\n", ODIN_VERSION)
	fmt.printf("source-digest: fnv1a64:%016x\n", source_digest())
	for src in CODEGEN_SOURCES {
		fmt.printf("source-file: fnv1a64:%016x %s\n", fnv1a64(src.bytes), src.path)
	}
}

main :: proc() {
	// Parse arguments
	name := "Default"
	input_file := ""
	output_file := ""
	wasm_shim_file := ""
	package_name := "generated_audio"
	want_version := false
	want_check := false

	for arg in os.args {
		if arg == "-version" || arg == "--version" {
			want_version = true
		}
		// Packet B9-3: run the whole pipeline — parse, every preflight rule,
		// both emissions, the output-target guard — and write nothing. Exit 0
		// means "-out would succeed"; every refusal exits 1 with the same
		// message a real run would print.
		if arg == "-check" || arg == "--check" {
			want_check = true
		}
		if len(arg) > 6 && arg[0:6] == "-name:" {
			name = arg[6:]
		}
		if len(arg) > 4 && arg[0:4] == "-in:" {
			input_file = arg[4:]
		}
		if len(arg) > 5 && arg[0:5] == "-out:" {
			output_file = arg[5:]
		}
		if len(arg) > 11 && arg[0:11] == "-wasm-shim:" {
			wasm_shim_file = arg[11:]
		}
		if len(arg) > 9 && arg[0:9] == "-package:" {
			package_name = arg[9:]
		}
	}

	// Answered BEFORE stdin is touched. The handshake probe closes stdin, so a
	// binary that read stdin first would either block or fail the very check
	// that is meant to identify it — and "did it answer -version at all" is how
	// the editor recognises a pre-A2 binary that has no stamp.
	if want_version {
		print_version()
		os.exit(0)
	}

	input_bytes: []byte
	read_bool: bool
	if input_file != "" {
		input_bytes, read_bool = os.read_entire_file(input_file)
		if !read_bool {
			fmt.eprintf("Error reading input file: %s\n", input_file)
			os.exit(1)
		}
	} else {
		input_bytes, read_bool = os.read_entire_file_from_handle(os.stdin)
		if !read_bool {
			fmt.eprintf("Error reading from stdin\n")
			os.exit(1)
		}
	}
	defer delete(input_bytes)

	// One reader for both input shapes (A4 step 2 / BUGS.md SKB-002). The
	// shape decision — project export vs React Flow graph save — and both
	// constructors live in core; the graph shape is a normaliser over
	// build_project_from_raw, not a second parser. The structural sniffing
	// that used to sit here ("unmarshal as project; no instruments? try
	// graph") is gone with the second constructor that required it.
	project, parse_err_msg := core.build_project_from_json(input_bytes)
	if parse_err_msg != "" {
		fmt.eprintf("Error: %s\n", parse_err_msg)
		os.exit(1)
	}

	// BUG-EMPTY-PROJECT-SILENT: a graph that lacks any instrument-typed
	// nodes silently produced an empty Project_State + no-op project_process
	// and exited 0. Make this a hard error — game devs need to notice when
	// their patch isn't being codegen'd.
	if len(project.instruments) == 0 {
		fmt.eprintf(
			"Error: input contains no instruments. Wrap nodes in an Instrument (Sidebar → Create Instrument) before generating.\n",
		)
		os.exit(1)
	}

	generated_code := core.generate_project_code(&project, name, package_name)

	// The shim is emitted from the same analysis but is a second shape
	// (CLAUDE.md: "two shapes from one analysis"); -check generates it even
	// when nobody asked for the file, so a shim-only failure is a check
	// failure too.
	shim_code := ""
	if wasm_shim_file != "" || want_check {
		shim_code = core.generate_wasm_shim_code(&project, package_name)
	}

	// Always write to file. If output_file is empty, default to "generated_audio.odin"
	target_file := output_file
	if target_file == "" {
		target_file = "generated_audio.odin"
	}

	// Packet B9-3: refuse to clobber a foreign Odin package, exactly as the
	// editor has since the incident that killed the tester's test_harness.odin
	// (skald-ui/src/main/codegenGuards.ts). Under -check with no -out nothing
	// would be written anywhere, so there is no destination to judge.
	if !(want_check && output_file == "") {
		refuse_unsafe_target(target_file, package_name)
		if wasm_shim_file != "" do refuse_unsafe_target(wasm_shim_file, package_name)
	}

	if want_check {
		if output_file != "" {
			fmt.printf("Check OK: %d instrument(s); -out:%s would be written\n", len(project.instruments), target_file)
		} else {
			fmt.printf("Check OK: %d instrument(s)\n", len(project.instruments))
		}
		os.exit(0)
	}

	write_bool := os.write_entire_file(target_file, transmute([]byte)generated_code)
	if !write_bool {
		fmt.eprintf("Error writing output file: %s\n", target_file)
		os.exit(1)
	}

	// Editor-preview support: also emit the wasm export shim (same package,
	// separate file) when asked. Game-facing generation never passes this.
	if wasm_shim_file != "" {
		if !os.write_entire_file(wasm_shim_file, transmute([]byte)shim_code) {
			fmt.eprintf("Error writing wasm shim file: %s\n", wasm_shim_file)
			os.exit(1)
		}
	}

	// Stdout used to carry just the literal "Package generated audio" status
	// line, which the Electron renderer was treating as the displayed code
	// preview (BUG-CODE-PREVIEW-WRONG). The renderer is now patched to read
	// the output file directly; this status line is kept for shell scripts
	// piping codegen output.
	fmt.printf("Codegen OK: %d instrument(s) -> %s\n", len(project.instruments), target_file)
}

/// The CLI half of assertCodegenTargetSafe. `nul` (and /dev/null) is a
/// discard sink, not a directory entry: `-out:nul` is the documented way to
/// run the generator for its diagnostics alone (tests/fixtures/_negative/
/// README.md), and judging the current directory's siblings for it would
/// refuse every such run made from skald-backend\ — main.odin here is
/// `package skald_codegen`.
refuse_unsafe_target :: proc(path: string, package_name: string) {
	base := filepath.base(path)
	if strings.equal_fold(base, "nul") || strings.equal_fold(path, "/dev/null") do return
	if msg, conflict := core.codegen_target_conflict(path, package_name); conflict {
		fmt.eprintf("Error: %s\n", msg)
		os.exit(1)
	}
}
