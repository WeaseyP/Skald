/*
================================================================================
| FILE: skald-ui/src/utils/exampleTags.mjs                                     |
|                                                                              |
| Roadmap packet F5 — search + tags for the Examples Library.                 |
|                                                                              |
| Tags are DERIVED at scan time, not authored into the ~100 shipped example    |
| files: a coordinator review of this packet found the alternative (a         |
| top-level "meta" block written into every example) would touch every        |
| corpus golden's input digest and the example corpus itself for a feature    |
| that is one small, pure function of data already on disk (the file's own    |
| path and its parsed nodes/tracks) — nothing new to author, migrate, or keep |
| in sync. A file MAY still carry a hand-curated `"meta": {"tags": [...]}}`   |
| block (ExampleMeta, definitions/examples.ts) and its tags are unioned in,   |
| but none of the shipped examples do, so this changes no example's bytes.    |
|                                                                              |
| Plain ESM (.mjs) with JSDoc types, not .ts: this is the ONE reader, shared   |
| verbatim by two runtimes that cannot both `import` a .ts file the same way  |
| — the Electron main process (src/main.ts, bundled by @electron-forge/       |
| plugin-vite, which resolves .mjs like any other ES module) and the browser  |
| build's standalone Node server (web-server/server.mjs, run directly with    |
| `node`, no bundler or TS loader at all). A second, hand-mirrored copy of    |
| the heuristics for whichever runtime got skipped is exactly the "two        |
| readers" bug class CLAUDE.md calls out for P-lock resolution and ranges —   |
| tagging is no different, so both scanners import this file instead.        |
================================================================================
*/

/** @typedef {{ id?: string, type?: string, data?: { subgraph?: { nodes?: RawNode[] } } }} RawNode */
/** @typedef {{ notes?: unknown[] }} RawTrack */
/** @typedef {{ tags?: unknown }} RawMeta */

/**
 * Every node in the graph, including recursively through each Instrument's
 * `data.subgraph.nodes` — the same shape saveMigrations.ts's `walkNodes`
 * visits, re-stated here (not imported) because that module is TypeScript
 * and this one deliberately is not (see file header).
 * @param {RawNode[] | undefined} nodes
 * @returns {RawNode[]}
 */
const allNodes = (nodes) => {
    /** @type {RawNode[]} */
    const out = [];
    /** @param {RawNode[] | undefined} arr */
    const walk = (arr) => {
        if (!Array.isArray(arr)) return;
        for (const n of arr) {
            if (!n || typeof n !== 'object') continue;
            out.push(n);
            walk(n.data && n.data.subgraph ? n.data.subgraph.nodes : undefined);
        }
    };
    walk(nodes);
    return out;
};

/** Node-type strings are camelCase in the editor's own save shape (fmOperator,
 * midiInput); lower-cased once here so every membership check below is a
 * plain string compare. This is a UI search aid, not a codegen-reading
 * mirror, so ASCII-only case folding (CLAUDE.md's strings.equal_fold note)
 * carries no correctness risk the way it would for a parameter alias. */
const typeOf = (/** @type {RawNode} */ n) => String(n && n.type ? n.type : '').toLowerCase();

// Folder segment (instruments/<sub>/...) -> tag. Deliberately not exhaustive:
// an unmapped subfolder (keys, guitar, brass, winds) still gets the folder
// name itself as a tag two lines down, so every example is at least as
// searchable by its own directory name as it was by `subcategory` before.
const INSTRUMENT_SUBFOLDER_TAGS = {
    bass: 'bass-synth',
    leads: 'lead',
    pads: 'pad',
    drums: 'percussion',
};

/**
 * Pure function of (relative path, parsed file) -> sorted, de-duplicated
 * tags. No filesystem access, no state — safe to call once per scan from
 * either runtime, and to unit-test directly against real example files.
 *
 * @param {string} relPath Path relative to the examples directory, forward slashes.
 * @param {any} parsed The file's parsed JSON (already read by the caller).
 * @returns {string[]}
 */
export const deriveTags = (relPath, parsed) => {
    /** @type {Set<string>} */
    const tags = new Set();
    const parts = relPath.split('/');
    const top = parts[0];

    const nodes = parsed && Array.isArray(parsed.nodes) ? parsed.nodes : [];
    const flat = allNodes(nodes);
    const types = new Set(flat.map(typeOf));

    // --- folder-derived category tags ----------------------------------
    if (top === 'sound-effects') tags.add('sfx');
    if (top === 'songs') tags.add('song');
    if (top === 'instruments') {
        tags.add('instrument');
        const sub = parts[1];
        if (sub && INSTRUMENT_SUBFOLDER_TAGS[sub]) tags.add(INSTRUMENT_SUBFOLDER_TAGS[sub]);
        else if (sub) tags.add(sub);
    }
    if (top === 'snes-kit') {
        tags.add('snes-kit');
        const sub = parts[1];
        if (sub === 'drums') tags.add('percussion');
        else if (sub === 'songs') tags.add('song');
        else if (sub === 'instruments') tags.add('instrument');
    }

    // --- structural tags (what the graph actually contains) -------------
    if (types.has('midiinput')) tags.add('midi');
    if (types.has('fmoperator')) tags.add('fm');
    if (types.has('wavetable')) tags.add('wavetable');
    const hasNoise = types.has('noise');
    const hasPitched = ['oscillator', 'wavetable', 'fmoperator', 'samplehold'].some((t) => types.has(t));
    if (hasNoise) {
        tags.add('noise');
        // A Noise-only voice with nothing pitched underneath is percussion
        // by construction, independent of which folder it happens to sit in
        // (e.g. instruments/drums/acoustic-electric/*.json).
        if (!hasPitched) tags.add('percussion');
    }
    // SKB-019 / packet B6-1: a graph with no Instrument node auto-wraps as one
    // "Asset" SFX instrument on Play/Generate — it is a loose patch, not a
    // full instrument, and is tagged as such regardless of folder. The
    // converse is tagged too (independent of the instruments/ folder tag
    // above, which a snes-kit/drums Instrument never gets): having a real
    // Instrument node is itself searchable.
    if (types.has('instrument')) tags.add('instrument');
    else if (nodes.length > 0) tags.add('patch');

    const tracks = parsed && Array.isArray(parsed.sequencerTracks) ? parsed.sequencerTracks : [];
    const hasSequencedNotes = tracks.some(
        (/** @type {RawTrack} */ t) => Array.isArray(t && t.notes) && /** @type {unknown[]} */ (t.notes).length > 0,
    );
    if (hasSequencedNotes) tags.add('sequenced');

    // Ambient has no structural signature that distinguishes it from any
    // other pad/drone — a path/name heuristic is the only mechanical signal
    // available, so it is intentionally the loosest rule here.
    if (/ambient|drone|atmo|cosmic/i.test(relPath)) tags.add('ambient');

    // --- hand-curated union ----------------------------------------------
    // A file MAY carry a top-level `"meta": {"tags": [...]}}` (ExampleMeta,
    // definitions/examples.ts) to add tags no mechanical rule above would
    // find; none of the shipped examples do this today; unioned in, never
    // overriding what was derived.
    const meta = parsed && typeof parsed.meta === 'object' ? /** @type {RawMeta} */ (parsed.meta) : null;
    const metaTags = meta && Array.isArray(meta.tags) ? meta.tags : [];
    for (const t of metaTags) {
        if (typeof t === 'string' && t.trim().length > 0) tags.add(t.trim());
    }

    return [...tags].sort();
};
