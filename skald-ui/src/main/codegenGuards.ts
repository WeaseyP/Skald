/*
================================================================================
| FILE: skald-ui/src/main/codegenGuards.ts                                     |
|                                                                              |
| Pure safety guards for the 'invoke-codegen' main-process handler. Extracted  |
| from main.ts so the "don't clobber a foreign Odin package" logic can be      |
| exercised directly with real temp dirs, no Electron in the loop.             |
|                                                                              |
| Odin allows exactly ONE package per directory, and the generated file always |
| declares `package <packageName>`. These guards refuse two ways a Generate    |
| could silently destroy hand-written code (this really happened to the test   |
| harness): overwriting a foreign-package file at the exact output path, or    |
| dropping a foreign-package file into a directory that already owns another   |
| package.                                                                     |
================================================================================
*/
import path from 'node:path';
import fs from 'node:fs';

const DEFAULT_PACKAGE = 'generated_audio';

const readPackage = (filePath: string): string | null => {
    const m = fs.readFileSync(filePath, { encoding: 'utf8' }).match(/^\s*package\s+([A-Za-z0-9_]+)/m);
    return m ? m[1] : null;
};

// Guard 1: refuse to overwrite a file at the output path whose `package X`
// declaration differs from the package we are about to write.
export const assertTargetPackageMatches = (outputPath: string, packageName?: string): void => {
    if (!fs.existsSync(outputPath)) return;
    let existingPackage: string | null = null;
    try {
        existingPackage = readPackage(outputPath);
    } catch {
        // Unreadable target — let the codegen's own write surface the error.
    }
    const targetPackage = packageName || DEFAULT_PACKAGE;
    if (existingPackage && existingPackage !== targetPackage) {
        throw new Error(
            `Refusing to overwrite ${outputPath}: it declares 'package ${existingPackage}', ` +
            `but this generation would write 'package ${targetPackage}'. That file looks hand-written ` +
            `(e.g. the test harness). Pick a different output file, such as ` +
            `skald-backend/tester/generated_audio/generated_audio.odin.`
        );
    }
};

// Guard 2: refuse to write into a directory that already contains a sibling
// .odin file declaring a DIFFERENT package (adding ours would break the build).
export const assertNoForeignSiblingPackage = (outputPath: string, packageName?: string): void => {
    const targetPackage = packageName || DEFAULT_PACKAGE;
    const outPathResolved = path.resolve(outputPath).toLowerCase();
    const outDir = path.dirname(path.resolve(outputPath));
    let dirEntries: string[] = [];
    try {
        dirEntries = fs.readdirSync(outDir);
    } catch {
        // Directory doesn't exist yet — the codegen write will surface that.
    }
    for (const name of dirEntries) {
        if (!name.toLowerCase().endsWith('.odin')) continue;
        const fullPath = path.join(outDir, name);
        if (fullPath.toLowerCase() === outPathResolved) continue; // the target itself, checked above
        let siblingPackage: string | null = null;
        try {
            siblingPackage = readPackage(fullPath);
        } catch {
            continue;
        }
        if (siblingPackage && siblingPackage !== targetPackage) {
            throw new Error(
                `Refusing to write into ${outDir}: it contains ${name} ('package ${siblingPackage}'), ` +
                `and Odin allows only one package per directory — adding 'package ${targetPackage}' ` +
                `there would break the build. Pick a directory of its own, such as ` +
                `skald-backend/tester/generated_audio/generated_audio.odin.`
            );
        }
    }
};

// Run both guards. Throws the first failing guard's Error; returns silently
// when the target is safe to write.
export const assertCodegenTargetSafe = (outputPath: string, packageName?: string): void => {
    assertTargetPackageMatches(outputPath, packageName);
    assertNoForeignSiblingPackage(outputPath, packageName);
};
