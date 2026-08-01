/*
================================================================================
| FILE: skald-ui/scripts/ensure-codegen.mjs                                    |
|                                                                              |
| Builds skald_codegen.exe before `npm start` / `npm run make` (roadmap packet  |
| A2 / BUGS.md SKB-001).                                                       |
|                                                                              |
| The binary the app spawns used to be COMMITTED, and went nine backend commits |
| stale: in a fresh clone every exposed-parameter knob was a silent no-op in    |
| preview, while CI validated a compiler nobody ran. It is untracked now, which |
| means something has to build it, and the honest place is the two commands a   |
| contributor actually types.                                                   |
|                                                                              |
| WHY THIS IS A SCRIPT AND NOT `"prestart": "npm run build:codegen"`.           |
| A raw batch failure in `prestart` aborts `npm start`, which would turn        |
| "preview silently does nothing" into "the app does not start" — the exact     |
| regression roadmap §4.8 ordered packet A13 ahead of this one to avoid. So a   |
| failed build here is LOUD but NOT fatal for `start`: the editor still opens,  |
| and A13's launch error box plus the codegen provenance banner say what is     |
| wrong and how to fix it, in the app, where the user is.                       |
|                                                                              |
| For PACKAGING (`--required`) the same failure is fatal: an installer built     |
| around a missing or stale generator is a shipped defect, not an inconvenience.|
================================================================================
*/
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const uiRoot = path.resolve(here, '..');
const backendRoot = path.resolve(uiRoot, '..', 'skald-backend');
const buildScript = path.join(backendRoot, 'build_codegen.bat');
const exePath = path.join(uiRoot, 'skald_codegen.exe');

const required = process.argv.includes('--required');
const label = required ? 'required' : 'advisory';

const banner = (lines) => {
    const width = Math.max(...lines.map((l) => l.length));
    const rule = '-'.repeat(width + 4);
    console.error(`\n${rule}`);
    for (const line of lines) console.error(`| ${line.padEnd(width)} |`);
    console.error(`${rule}\n`);
};

/** What to say when the generator could not be built. Names every way out. */
const failureAdvice = () => {
    const lines = [
        'Could not build the Skald code generator (skald_codegen.exe).',
        '',
        'It is not committed to git on purpose: a checked-in binary went nine',
        'backend commits stale and every exposed-parameter knob in preview',
        'became a silent no-op (BUGS.md SKB-001). It is built from source',
        'instead, and that build just failed.',
        '',
        'Most likely: no Odin compiler. build_codegen.bat looks for, in order,',
        '  1. %SKALD_ODIN%',
        '  2. ..\\.tools\\odin-dev-2025-02\\odin-windows-amd64-dev-2025-02\\odin.exe',
        '  3. odin on PATH',
        '',
        'Fix with either:',
        '  powershell -ExecutionPolicy Bypass -File ..\\scripts\\setup-dev.ps1',
        '    (downloads the pinned toolchain into .tools\\ and persists SKALD_ODIN)',
        '  or install Odin from https://odin-lang.org and add it to PATH.',
        '',
        'Then: npm run build:codegen',
    ];
    if (required) {
        lines.push(
            '',
            'This is a PACKAGING build, so it stops here: shipping an installer',
            'without a matching generator is the defect this packet removed.',
        );
    } else {
        lines.push(
            '',
            'Skald will still start. Editing, save and load work without a',
            'generator; Play and Generate Code will refuse with a banner that',
            'repeats this fix, rather than quietly using a stale binary.',
        );
    }
    banner(lines);
};

if (!existsSync(buildScript)) {
    banner([
        `Missing ${buildScript}`,
        '',
        'skald-ui expects the Odin backend as a sibling directory. This looks',
        'like a partial checkout of the Skald repository.',
    ]);
    process.exit(required ? 1 : 0);
}

console.log(`[Skald] Building the code generator before start (${label})...`);
const build = spawnSync(buildScript, [], { cwd: backendRoot, stdio: 'inherit', shell: true });

if (build.status !== 0) {
    failureAdvice();
    process.exit(required ? 1 : 0);
}

// Print the provenance stamp the app is about to check, so the terminal states
// which generator this run of Skald will use. Silence here would put us back
// where we started: a binary whose identity nobody looked at.
const stamp = spawnSync(exePath, ['-version'], { encoding: 'utf8' });
const digest = /^source-digest:\s*(\S+)$/m.exec(stamp.stdout ?? '');
if (digest) {
    console.log(`[Skald] Code generator ready: ${digest[1]}`);
} else {
    banner([
        'Built skald_codegen.exe, but it did not report a provenance stamp.',
        '',
        'Expected `skald_codegen.exe -version` to print `source-digest:`.',
        'The app will refuse to use a generator it cannot identify, so this',
        'needs looking at: see skald-backend/main.odin (print_version) and',
        'skald-ui/src/main/codegenStamp.ts.',
    ]);
    process.exit(required ? 1 : 0);
}
