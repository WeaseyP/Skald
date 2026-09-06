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
}
