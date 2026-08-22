/*
================================================================================
| FILE: skald-ui/src/main/forgePostPackage.ts                                  |
|                                                                              |
| Strips examples/archive/ out of a packaged build's resources, after         |
| packaging, instead of narrowing forge.config.ts's `extraResource` list.     |
|                                                                              |
| `extraResource` copies a path verbatim (`@electron/packager`'s App#copyExtra|
| does `fs.copy(resource, resourcesDir/basename(resource))` on the whole      |
| entry) — there is no glob or ignore support, so "exclude one subfolder of   |
| ../examples" cannot be expressed as an array edit. The only way to keep     |
| `../examples` as a single extraResource entry (needed so every other        |
| example still ships — see forge.config.ts's comment on why examples ship    |
| at all) while dropping just `archive/` is to remove it AFTER packaging      |
| copies the tree. `postPackage` is the hook Forge runs once packaging        |
| finishes, and it is handed exactly the `outputPaths` this needs             |
| (`packageResult.outputPaths`, one per platform/arch); a `prePackage` hook    |
| staging a filtered copy of `../examples` elsewhere would work too but adds  |
| a second on-disk examples tree to keep in sync with the real one for no     |
| benefit over deleting four files after the fact.                           |
|                                                                              |
| `archive/` itself must stay in the REPO (see corpusGate.ts's header on why  |
| the corpus glob walks it) — this hook only ever touches the packaged        |
| OUTPUT under outputPaths, never `../examples` itself.                      |
================================================================================
*/
import fs from 'node:fs';
import path from 'node:path';

/**
 * Remove `resources/examples/archive` from each packaged output directory.
 *
 * `resourcesSubdir` defaults to Electron Packager's actual layout
 * (`<outputPath>/resources/...`, per `App#resourcesDir` in
 * `@electron/packager`) and is only a parameter so a test can point this at a
 * synthetic fixture tree without packaging a real app.
 */
export const removeArchiveFromPackagedExamples = (
    outputPaths: readonly string[],
    resourcesSubdir = 'resources',
): void => {
    for (const outputPath of outputPaths) {
        const archiveDir = path.join(outputPath, resourcesSubdir, 'examples', 'archive');
        if (fs.existsSync(archiveDir)) {
            fs.rmSync(archiveDir, { recursive: true, force: true });
        }
    }
};
