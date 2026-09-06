/*
================================================================================
| FILE: skald-ui/src/definitions/examples.ts                                   |
|                                                                              |
| The shape of one entry in the Examples library, as the main process's       |
| `list-examples` handler returns it and the Examples modal renders it.       |
|                                                                              |
| This used to live only in forge.env.d.ts. A `.d.ts` is not a module either  |
| ESLint's import resolver or a relative path from src/tests/ can reach: the  |
| modal imported it with one relative path that tsc accepted and ESLint      |
| rejected, and its test used a path that pointed one directory too shallow, |
| so `tsc --noEmit` and `npm run lint` were red at baseline from the day the  |
| test was written (TESTING.md's known-red table). A real module fixes both. |
================================================================================
*/

export interface ExampleItem {
    /** Unique within the list; the relative path, or `start-here/<path>` for a curated pointer. */
    id: string;
    name: string;
    /** Display category ("Songs & Loops", "Start Here", ...). */
    category: string;
    /** Filter key ("songs", "start-here", ...). */
    categoryKey: string;
    /** Subtitle: the subfolder name, or for Start Here what the example teaches. */
    subcategory?: string;
    /** Path relative to the examples directory, forward slashes. */
    path: string;
    /**
     * F5 — search/filter tags (`percussion`, `bass-synth`, ...), read from the
     * file's own top-level `meta.tags` (ExampleMeta, below). Absent when the
     * file carries no `meta` block, or `meta.tags` is missing/empty — a file
     * predating this feature must still list, just untagged.
     */
    tags?: string[];
    /** F5 — one-line description from `meta.description`, searched alongside name/category/tags. */
    description?: string;
}

/**
 * The optional top-level `"meta"` block a `.skald.json` file may carry
 * (F5 / docs/0.2-ROADMAP.md §9.13). Authored once, in the file, so it travels
 * with the file through Save/Load like `session` does — see
 * `skald-ui/src/hooks/nodeEditor/useFileIO.ts`'s `documentMetaRef`. Every
 * reader of a save file (the editor, the Electron and web example scanners,
 * the backend's `build_project_from_json`) ignores an unrecognised top-level
 * key, so adding this needed no save-migration: absent ⇒ no tags, and no
 * existing file's shape changed.
 */
export interface ExampleMeta {
    tags?: string[];
    description?: string;
}
