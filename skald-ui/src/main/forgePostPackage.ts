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
|                                                                              |
| WIN32 ONLY, by construction. `<outputPath>/resources/` is Electron          |
| Packager's layout for win32 and linux (`platform.js`); on darwin resources  |
| live at `<App>.app/Contents/Resources` (`mac.js`). forge.config.ts makes    |
| only win32 targets, and the existence check below would throw rather than  |
| silently ship archive/ if a mac maker were ever added without updating     |
| this path.                                                                  |
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
 *
 * B6-2-x2: the guard used to be `if (fs.existsSync(archiveDir))`, which cannot
 * tell "archive/ already gone" from "wrong path" — had `extraResource` been
 * renamed or the packager layout shifted, archive/ would have shipped and
 * nothing would have failed. So `resources/examples` itself is REQUIRED to
 * exist (throw otherwise: the layout this hook assumes is not the layout the
 * packager produced), and only `archive/` being absent is tolerated.
 */
export const removeArchiveFromPackagedExamples = (
    outputPaths: readonly string[],
    resourcesSubdir = 'resources',
): void => {
    for (const outputPath of outputPaths) {
        const examplesDir = path.join(outputPath, resourcesSubdir, 'examples');
        if (!fs.existsSync(examplesDir)) {
            throw new Error(
                `forgePostPackage: expected the packaged examples at ${examplesDir}, but it does not exist. ` +
                `Either forge.config.ts's extraResource no longer copies ../examples, or the packager's ` +
                `resources layout changed — in both cases examples/archive would ship unnoticed.`,
            );
        }
        const archiveDir = path.join(examplesDir, 'archive');
        if (fs.existsSync(archiveDir)) {
            fs.rmSync(archiveDir, { recursive: true, force: true });
        }
    }
};
