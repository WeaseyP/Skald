# Negative codegen fixtures

Graphs the generator is supposed to REJECT. They live here, in an
underscore-prefixed subdirectory, because both harnesses treat a non-zero
codegen exit as a failure of the suite:

* `run_acceptance.bat` globs `tests\fixtures\*.json` and reports
  `CODEGEN FAILED FOR <name>`
* `run_golden.bat` globs the same plus `graph\` and `codegen_only\`, and has no
  concept of an expected-failure snapshot

Both globs are non-recursive, so nothing here is picked up — the same escape
`_graph_seeds\` uses.

The rules themselves are gated in-process by `odin test tests\unit`, which is
where the assertions live; these files exist so a human can reproduce the exact
stderr a user would see. Run one by hand from `skald-backend\`:

    odin build main.odin -file -out:codegen.exe
    .\codegen.exe -in:tests\fixtures\_negative\<name>.json -out:nul

Expect exit code 1 and the error on stderr.

| fixture | rule | gated by |
| --- | --- | --- |
| `cross_domain_modulator.json` | SKB-017: a modulator feeding both the voice domain and the bus domain is a hard error, not a silent domain choice | `tests\unit\bus_domain_test.odin` |
| `nested_instrument.json` | SKB-028 (B9-1): an Instrument node inside an instrument's subgraph is a hard error. Before B9-1 this file printed "unknown node type" and then **exited 0 and wrote the file** with the inner instrument's output stuck at 0.0 | `tests\unit\preflight_test.odin` |
| `duplicate_node_id.json` | SKB-021 (B9-2): two nodes with the same literal id in one graph. Was a warn-and-rename to `1_dup2`, which left every connection on the first node | `tests\unit\preflight_test.odin` |
| `sanitized_id_collision.json` | SKB-021 (B9-2): `osc-1` and `osc_1` are distinct in the JSON and one identifier in the generated Odin | `tests\unit\preflight_test.odin` |
