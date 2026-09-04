// main.ts
import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import started from 'electron-squirrel-startup';
import { assertCodegenTargetSafe } from './main/codegenGuards';
import { runChild, RunChildResult } from './main/runChild';
import {
  DialogPathEnv,
  importDialogDefaultPath,
  openDialogDefaultPath,
  outputPathDefaultPath,
  resolveExamplesDir,
  saveDialogDefaultPath,
} from './main/dialogDefaults';
import {
  OdinPathEnv,
  createOdinResolver,
  odinMissingMessage,
} from './main/odinToolchain';
import {
  CodegenStampEnv,
  createCodegenGuard,
} from './main/codegenStamp';
import { atomicWriteFileSync } from './main/atomicSave';

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (started) {
  app.quit();
}

const createWindow = () => {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // and load the index.html of the app.
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`));
  }

  // Open the DevTools (dev builds only).
  if (!app.isPackaged) {
    mainWindow.webContents.openDevTools();
  }

  // Forward console logs to terminal
  mainWindow.webContents.on('console-message', (event, level, message, line, sourceId) => {
    const levels = ['DEBUG', 'INFO', 'WARNING', 'ERROR'];
    const levelName = levels[level] || 'INFO';
    console.log(`[Renderer ${levelName}]: ${message}`);
  });
};

// Resolve the Odin compiler (SKALD_ODIN -> the repo's vendored .tools
// toolchain -> PATH -> C:\Odin), memoised, with a short negative TTL and an
// async probe. See src/main/odinToolchain.ts for why each of those matters.
const odinPathEnv = (): OdinPathEnv => ({
  appPath: app.getAppPath(),
  resourcesPath: process.resourcesPath,
  isPackaged: app.isPackaged,
  envOverride: process.env.SKALD_ODIN,
});

const odinResolver = createOdinResolver(odinPathEnv);

// Fail LOUDLY at first launch when nothing can compile, rather than letting a
// missing toolchain surface as a build error the first time someone presses
// Play — which is what a packaged install did to every user of v0.1.0, and
// what a fresh terminal did to every developer who followed the documented
// setup (SKB-057). Nothing is bundled to fix this silently: see the
// extraResource note in forge.config.ts.
//
// The error box is the only main-process-owned surface that is visible IN THE
// APP without touching a renderer component. The same message also comes back
// through the build-wasm-preview rejection, which is the channel previewError
// / previewStale already ride to the on-canvas banner (useWasmAudioEngine ->
// app.tsx), so the failure is stated twice and neither is console-only.
const warnIfOdinMissing = async (): Promise<void> => {
  if (await odinResolver.resolve()) return;
  const message = odinMissingMessage(odinPathEnv());
  console.error(`[Skald] ${message}`);
  dialog.showErrorBox('Skald — audio preview unavailable', message);
};

// In dev, app.getAppPath() is the project root, where the exe sits. In a
// packaged build getAppPath() is inside app.asar — a virtual path spawn()
// cannot execute from — so the exe ships as an extraResource under
// process.resourcesPath instead (see forge.config.ts).
const codegenExePath = (): string =>
  app.isPackaged
    ? path.join(process.resourcesPath, 'skald_codegen.exe')
    : path.join(app.getAppPath(), 'skald_codegen.exe');

// --- Codegen provenance handshake (roadmap A2 / SKB-001) ---------------------
//
// The codegen binary is no longer committed to git; `prestart`/`premake` build
// it from source. That removes the stale-binary defect at its root, but not the
// ways it can come back: a developer who edits skald-backend/core and previews
// without rebuilding, a half-finished build, or a copy carried over from an
// older checkout. So the app asks the binary who it is (`-version`, a digest of
// the sources it was compiled from) and refuses to spawn one that does not match
// the backend sources on disk. See src/main/codegenStamp.ts.
//
// The backend sources are only present in a dev checkout; a packaged install
// gets the weaker "it must answer -version at all" check, and says so rather
// than claiming a freshness guarantee it cannot make.
const codegenStampEnv = (): CodegenStampEnv => {
  const backendDir = path.join(app.getAppPath(), '..', 'skald-backend');
  return {
    exePath: codegenExePath(),
    backendDir: !app.isPackaged && fs.existsSync(path.join(backendDir, 'main.odin')) ? backendDir : null,
  };
};

const codegenGuard = createCodegenGuard(codegenStampEnv);

// Same reasoning as warnIfOdinMissing: an error box is the one in-app surface
// the main process owns outright, and it fires at launch rather than waiting for
// the user to wonder why their edits have no effect. The same text also comes
// back through the build-wasm-preview and invoke-codegen rejections, so Play and
// Generate each state it again on the canvas.
const warnIfCodegenStale = async (): Promise<void> => {
  const verdict = await codegenGuard.check();
  if (verdict.ok) {
    if (verdict.note) console.warn(`[Skald] ${verdict.note}`);
    else console.log(`[Skald] Codegen provenance verified: ${verdict.stamp.digest}`);
    return;
  }
  console.error(`[Skald] ${verdict.message}`);
  dialog.showErrorBox('Skald — code generator out of date', verdict.message);
};

app.on('ready', () => {
  createWindow();
  // Deliberately not awaited: the window must come up regardless, and the
  // probes are async precisely so they cannot block the main process.
  void warnIfOdinMissing();
  void warnIfCodegenStale();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

ipcMain.handle('invoke-codegen', async (_, graphJson: string, options: { packageName?: string, outputPath?: string } = {}) => {
  // --- DEBUG: Log the JSON received by the main process ---
  console.log("Main process received from renderer:", graphJson.substring(0, 50) + "...");
  console.log("Options:", options);
  // ---------------------------------------------------------

  const executablePath = codegenExePath();

  // Refuse to write generated code with a generator that does not match the
  // backend sources. Generate Code is the path whose output a game developer
  // then compiles against for months, so shipping them stale output is worse
  // here than in preview — it leaves the repo, and it is what put the
  // voice-steal click into every checked-in generated_audio.odin (SKB-020).
  await codegenGuard.assertUsable();

  // Refuse to clobber a foreign Odin package — either by overwriting a
  // different-package file at the output path, or by dropping our file into a
  // directory another package already owns (Odin: one package per directory).
  // (This really happened: an output path pointed at the tester's `package
  // main` test_harness.odin, and every Generate silently killed it.)
  if (options.outputPath) {
    assertCodegenTargetSafe(options.outputPath, options.packageName);
  }

  // Capture the Project JSON next to the output .odin so the acceptance
  // harness can re-feed it as a fixture. Writing UTF-8 explicitly so the
  // file never picks up a BOM or UTF-16 envelope.
  if (options.outputPath) {
    const inputJsonPath = options.outputPath.replace(/\.odin$/i, '.json');
    if (inputJsonPath !== options.outputPath) {
      try {
        fs.writeFileSync(inputJsonPath, graphJson, { encoding: 'utf8' });
        console.log(`[Skald] Wrote codegen input JSON to ${inputJsonPath}`);
      } catch (err) {
        console.error(`[Skald] Failed to write input JSON to ${inputJsonPath}: ${err}`);
      }
    }
  }

  const args: string[] = [];
  if (options.packageName) {
    args.push(`-package:${options.packageName}`);
  }
  if (options.outputPath) {
    args.push(`-out:${options.outputPath}`);
  }

  // SKB-039 / packet B9-4: the same timeout and stdin-error handling the
  // preview build has had since F-B08, through the one shared helper. This
  // path used to spawn bare: a hung generator left Generate pending forever,
  // and a generator that exited before draining stdin — every preflight hard
  // error does — raised an unlistened 'error' on child.stdin, which is an
  // uncaught exception in the main process. See src/main/runChild.ts.
  let result: RunChildResult;
  try {
    result = await runChild(executablePath, args, {
      stdin: graphJson,
      // Odin's own diagnostics, live, so a hang is visible in the terminal
      // before the timeout names it.
      onStderr: (chunk) => console.error(`[Odin STDERR]: ${chunk}`),
    });
  } catch (err) {
    console.error(`Codegen failed: ${err instanceof Error ? err.message : String(err)}`);
    throw err;
  }

  console.log("Codegen successful.");
  // BUG-CODE-PREVIEW-WRONG: stdout is just a "Package generated audio"
  // success line. The actual generated code lives at outputPath. Read
  // it back so the renderer's CodePreviewPanel shows the real .odin
  // output instead of the literal status string.
  if (options.outputPath) {
    try {
      return fs.readFileSync(options.outputPath, { encoding: 'utf8' });
    } catch (err) {
      console.error(`Failed to read generated code from ${options.outputPath}: ${err}`);
      // fall through to stdout so the user gets *something* useful
    }
  }
  return result.stdout;
});

// --- Live preview: JSON -> codegen (+wasm shim) -> odin build -> wasm bytes ---

// Timeout + stdin-error handling live in runChild (src/main/runChild.ts), the
// same helper invoke-codegen uses — one spawn shape for every child, so a
// hardening fix cannot land on the preview path and miss Generate again
// (SKB-039 / packet B9-4).
const runProcess = (command: string, args: string[], stdin?: string): Promise<string> =>
  runChild(command, args, { stdin }).then((r) => r.stdout);

// All preview builds share one fixed directory, so two overlapping IPC calls
// would race on the same generated_audio.odin/skald.wasm files (a fast
// double-click on Play, or a hot-swap rebuild overlapping a fresh Play).
// Serialize them: each call chains onto the previous one.
let previewBuildChain: Promise<unknown> = Promise.resolve();

const buildWasmPreview = async (projectJson: string): Promise<ArrayBuffer> => {
  const odinPath = await odinResolver.resolve();
  if (!odinPath) {
    // Rejecting with the full actionable text on purpose: this rejection is
    // what the renderer turns into the on-canvas preview banner, so the fix
    // (the vendored path, SKALD_ODIN, setup-dev.ps1) has to be IN the message.
    throw new Error(odinMissingMessage(odinPathEnv()));
  }

  // Checked after Odin, before the codegen spawn: without a compiler you cannot
  // rebuild the generator either, so that message comes first. This rejection
  // is what the renderer turns into the on-canvas banner (useWasmAudioEngine ->
  // app.tsx), which is the whole point — a stale generator used to surface as
  // knobs that quietly did nothing (SKB-001/F-C4-2).
  await codegenGuard.assertUsable();

  // The preview package lives in its own directory (Odin: one package per
  // directory) under userData so it never collides with user-chosen output
  // paths or the tester tree.
  const previewDir = path.join(app.getPath('userData'), 'wasm-preview');
  fs.mkdirSync(previewDir, { recursive: true });
  const odinFile = path.join(previewDir, 'generated_audio.odin');
  const shimFile = path.join(previewDir, 'wasm_shim.odin');
  const wasmFile = path.join(previewDir, 'skald.wasm');

  // Remove the previous run's wasm so a build that somehow exits 0 without
  // producing output can never hand back stale DSP bytes.
  fs.rmSync(wasmFile, { force: true });

  await runProcess(codegenExePath(), [`-out:${odinFile}`, `-wasm-shim:${shimFile}`], projectJson);

  // -o:none, NOT -o:speed. The preview module's only real-time requirement is
  // clearing one ~2.9ms render quantum, and optimisation time is paid on every
  // debounced live-edit rebuild: measured 702ms -> 172ms on the 9-instrument
  // snes demo, and ~1.4s -> ~250ms on a 24-instrument patch (F-B08-4).
  // Generate Code / export keeps its own optimisation level — this flag is the
  // preview path only.
  await runProcess(odinPath, [
    'build', previewDir,
    '-target:freestanding_wasm32',
    '-no-entry-point',
    '-o:none',
    `-out:${wasmFile}`,
  ]);

  const bytes = fs.readFileSync(wasmFile);
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
};

ipcMain.handle('build-wasm-preview', (_, projectJson: string): Promise<ArrayBuffer> => {
  const run = previewBuildChain.then(() => buildWasmPreview(projectJson));
  // The chain must survive a failed build; swallow the error for chaining
  // purposes only (the caller still gets the rejection from `run`).
  previewBuildChain = run.catch(() => undefined);
  return run;
});

// Load / Save / Import all open on the examples folder, so the patches every
// manual chapter's "Try it" section references are one click away instead of
// wherever the OS last left the picker. See src/main/dialogDefaults.ts.
const dialogPathEnv = (): DialogPathEnv => ({
  appPath: app.getAppPath(),
  resourcesPath: process.resourcesPath,
  isPackaged: app.isPackaged,
  documentsPath: app.getPath('documents'),
  envOverride: process.env.SKALD_EXAMPLES_DIR,
  importOverride: process.env.SKALD_IMPORT_DIR,
});

// Handler for selecting output path. `currentPath` is whatever the renderer
// already has selected this session (app.tsx's `outputPath` state) — passing
// it back is what makes the dialog remember a choice instead of resetting to
// the tester default on every click (roadmap A7 item 23 / F-C4-11). Before
// this, exporting to your own project directory meant re-navigating there
// every single time Generate's "..." button was pressed.
ipcMain.handle('select-output-path', async (_, currentPath?: string) => {
  const { filePath } = await dialog.showSaveDialog({
    title: 'Select Output File',
    buttonLabel: 'Select',
    defaultPath: outputPathDefaultPath(currentPath || undefined, dialogPathEnv()),
    filters: [{ name: 'Odin Source File', extensions: ['odin'] }],
  });
  return filePath || null;
});

// Handler for saving the graph. Returns an explicit result: the renderer
// used to fire-and-forget, so a full disk / locked file / permission error
// left the user believing their song was saved when nothing was written.
ipcMain.handle('save-graph', async (_, graphJson: string): Promise<{ saved: boolean; path?: string; error?: string }> => {
  const { filePath } = await dialog.showSaveDialog({
    title: 'Save Skald Graph',
    buttonLabel: 'Save',
    defaultPath: saveDialogDefaultPath(`skald-graph-${Date.now()}.json`, dialogPathEnv()),
    filters: [{ name: 'Skald Files', extensions: ['json'] }],
  });

  if (!filePath) {
    return { saved: false }; // user canceled — not an error
  }
  try {
    // Atomic write (SKB-034): a straight fs.writeFileSync onto filePath
    // truncates the target before any new bytes land, so a write that fails
    // partway through (full disk, a locked file, a permission error) used to
    // destroy the previous good save along with it. Writing to a temp file
    // beside the target and renaming over it means the target only ever
    // changes via one atomic filesystem operation — see main/atomicSave.ts.
    atomicWriteFileSync(filePath, graphJson);
    return { saved: true, path: filePath };
  } catch (err) {
    console.error(`[Skald] Failed to save graph to ${filePath}:`, err);
    return { saved: false, error: err instanceof Error ? err.message : String(err) };
  }
});

// Handler for loading the graph. content: null with no error = canceled.
ipcMain.handle('load-graph', async (): Promise<{ content: string | null; error?: string }> => {
  const { filePaths } = await dialog.showOpenDialog({
    title: 'Load Skald Graph',
    buttonLabel: 'Load',
    properties: ['openFile'],
    defaultPath: openDialogDefaultPath(dialogPathEnv()),
    filters: [{ name: 'Skald Files', extensions: ['json'] }],
  });

  if (!filePaths || filePaths.length === 0) {
    return { content: null };
  }
  try {
    return { content: fs.readFileSync(filePaths[0], 'utf-8') };
  } catch (err) {
    console.error(`[Skald] Failed to read graph from ${filePaths[0]}:`, err);
    return { content: null, error: err instanceof Error ? err.message : String(err) };
  }
});

// Import Patch. Separate from load-graph on two counts: it opens in the patch
// kit rather than the top of examples/, and it takes a multi-selection, so a
// whole drum kit lands on the canvas in one trip through the dialog.
//
// An unreadable file in the selection is reported per-file rather than failing
// the batch — the renderer merges what it got and names what it skipped.
ipcMain.handle('import-patches', async (): Promise<{
  files: { name: string; content: string }[];
  skipped: { name: string; error: string }[];
}> => {
  const { filePaths } = await dialog.showOpenDialog({
    title: 'Import Skald Patches',
    buttonLabel: 'Import',
    properties: ['openFile', 'multiSelections'],
    defaultPath: importDialogDefaultPath(dialogPathEnv()),
    filters: [{ name: 'Skald Files', extensions: ['json'] }],
  });

  const files: { name: string; content: string }[] = [];
  const skipped: { name: string; error: string }[] = [];
  for (const filePath of filePaths ?? []) {
    try {
      files.push({ name: path.basename(filePath), content: fs.readFileSync(filePath, 'utf-8') });
    } catch (err) {
      console.error(`[Skald] Failed to read patch from ${filePath}:`, err);
      skipped.push({ name: path.basename(filePath), error: err instanceof Error ? err.message : String(err) });
    }
  }
  return { files, skipped };
});

const formatExampleName = (filename: string): string => {
  const name = filename.replace(/\.skald\.json$/i, '').replace(/\.json$/i, '');
  return name
    .replace(/[-_]/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\b\w/g, (c) => c.toUpperCase());
};

const scanExamplesSync = (dir: string, baseDir: string = dir): any[] => {
  const results: any[] = [];
  if (!fs.existsSync(dir)) return results;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'archive' || entry.name === 'integration_demo' || entry.name.startsWith('.')) continue;
      results.push(...scanExamplesSync(fullPath, baseDir));
    } else if (entry.isFile() && (entry.name.endsWith('.json') || entry.name.endsWith('.skald.json'))) {
      const relPath = path.relative(baseDir, fullPath).replace(/\\/g, '/');
      const parts = relPath.split('/');
      const categoryRaw = parts[0] || 'other';
      let category = 'Other';
      if (categoryRaw === 'songs') category = 'Songs & Loops';
      else if (categoryRaw === 'instruments') category = 'Instruments';
      else if (categoryRaw === 'snes-kit') category = 'SNES Kit';
      else if (categoryRaw === 'sound-effects') category = 'Sound Effects';

      let subcategory = '';
      if (parts.length > 2) {
        subcategory = formatExampleName(parts[1]);
      } else if (categoryRaw === 'snes-kit' && parts.length > 1) {
        subcategory = formatExampleName(parts[1]);
      }

      results.push({
        id: relPath,
        name: formatExampleName(entry.name),
        category,
        categoryKey: categoryRaw,
        subcategory,
        path: relPath,
      });
    }
  }
  return results.sort((a, b) => {
    if (a.category !== b.category) return a.category.localeCompare(b.category);
    if (a.subcategory !== b.subcategory) return a.subcategory.localeCompare(b.subcategory);
    return a.name.localeCompare(b.name);
  });
};

ipcMain.handle('list-examples', async () => {
  const examplesDir = resolveExamplesDir(dialogPathEnv());
  if (!examplesDir) return [];
  return scanExamplesSync(examplesDir);
});

ipcMain.handle('load-example', async (_, relPath: string): Promise<{ content: string | null; error?: string }> => {
  const examplesDir = resolveExamplesDir(dialogPathEnv());
  if (!examplesDir) return { content: null, error: 'Examples directory not found' };
  const targetFile = path.resolve(examplesDir, relPath);
  if (!targetFile.startsWith(path.resolve(examplesDir) + path.sep) && targetFile !== path.resolve(examplesDir)) {
    return { content: null, error: 'Forbidden' };
  }
  try {
    return { content: fs.readFileSync(targetFile, 'utf-8') };
  } catch (err) {
    return { content: null, error: err instanceof Error ? err.message : String(err) };
  }
});