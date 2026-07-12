// main.ts
import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import { spawn, spawnSync } from 'child_process';
import started from 'electron-squirrel-startup';

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

app.on('ready', createWindow);

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

// In dev, app.getAppPath() is the project root, where the exe sits. In a
// packaged build getAppPath() is inside app.asar — a virtual path spawn()
// cannot execute from — so the exe ships as an extraResource under
// process.resourcesPath instead (see forge.config.ts).
const codegenExePath = (): string =>
  app.isPackaged
    ? path.join(process.resourcesPath, 'skald_codegen.exe')
    : path.join(app.getAppPath(), 'skald_codegen.exe');

ipcMain.handle('invoke-codegen', async (_, graphJson: string, options: { packageName?: string, outputPath?: string } = {}) => {
  // --- DEBUG: Log the JSON received by the main process ---
  console.log("Main process received from renderer:", graphJson.substring(0, 50) + "...");
  console.log("Options:", options);
  // ---------------------------------------------------------

  const executablePath = codegenExePath();

  // Refuse to overwrite a foreign Odin source file. The generated file
  // declares `package <packageName>`; if the file already at the output path
  // declares a DIFFERENT package, the user almost certainly picked the wrong
  // output file — overwriting would destroy hand-written code. (This really
  // happened: an output path pointed at the tester's `package main`
  // test_harness.odin, and every Generate silently killed the test harness.)
  if (options.outputPath && fs.existsSync(options.outputPath)) {
    let existingPackage: string | null = null;
    try {
      const existing = fs.readFileSync(options.outputPath, { encoding: 'utf8' });
      const pkgMatch = existing.match(/^\s*package\s+([A-Za-z0-9_]+)/m);
      existingPackage = pkgMatch ? pkgMatch[1] : null;
    } catch {
      // Unreadable target — let the codegen's own write surface the error.
    }
    const targetPackage = options.packageName || 'generated_audio';
    if (existingPackage && existingPackage !== targetPackage) {
      const msg =
        `Refusing to overwrite ${options.outputPath}: it declares 'package ${existingPackage}', ` +
        `but this generation would write 'package ${targetPackage}'. That file looks hand-written ` +
        `(e.g. the test harness). Pick a different output file, such as ` +
        `skald-backend/tester/generated_audio/generated_audio.odin.`;
      console.error(`[Skald] ${msg}`);
      throw new Error(msg);
    }
  }

  // Odin allows exactly ONE package per directory. Writing the generated
  // file into a directory whose OTHER .odin files declare a different
  // package breaks that whole package's build (e.g. generated_audio.odin
  // dropped into tester/ next to the 'package main' test harness).
  if (options.outputPath) {
    const targetPackage = options.packageName || 'generated_audio';
    const outPathResolved = path.resolve(options.outputPath).toLowerCase();
    const outDir = path.dirname(path.resolve(options.outputPath));
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
        const m = fs.readFileSync(fullPath, { encoding: 'utf8' }).match(/^\s*package\s+([A-Za-z0-9_]+)/m);
        siblingPackage = m ? m[1] : null;
      } catch {
        continue;
      }
      if (siblingPackage && siblingPackage !== targetPackage) {
        const msg =
          `Refusing to write into ${outDir}: it contains ${name} ('package ${siblingPackage}'), ` +
          `and Odin allows only one package per directory — adding 'package ${targetPackage}' ` +
          `there would break the build. Pick a directory of its own, such as ` +
          `skald-backend/tester/generated_audio/generated_audio.odin.`;
        console.error(`[Skald] ${msg}`);
        throw new Error(msg);
      }
    }
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

  return new Promise((resolve, reject) => {

    const args: string[] = [];
    if (options.packageName) {
      args.push(`-package:${options.packageName}`);
    }
    if (options.outputPath) {
      args.push(`-out:${options.outputPath}`);
    }

    // Spawn with arguments
    // Use 'spawn' but we need to write to stdin.
    const child = spawn(executablePath, args);

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    child.stderr.on('data', (data) => {
      // --- DEBUG: This will print any debug statements from the Odin backend ---
      console.error(`[Odin STDERR]: ${data.toString()}`);
      // -------------------------------------------------------------------------
      stderr += data.toString();
    });

    child.on('close', (code) => {
      if (code === 0) {
        console.log("Codegen successful.");
        // BUG-CODE-PREVIEW-WRONG: stdout is just a "Package generated audio"
        // success line. The actual generated code lives at outputPath. Read
        // it back so the renderer's CodePreviewPanel shows the real .odin
        // output instead of the literal status string.
        if (options.outputPath) {
          try {
            const generatedCode = fs.readFileSync(options.outputPath, { encoding: 'utf8' });
            resolve(generatedCode);
            return;
          } catch (err) {
            console.error(`Failed to read generated code from ${options.outputPath}: ${err}`);
            // fall through to stdout so the user gets *something* useful
          }
        }
        resolve(stdout);
      } else {
        console.error(`Codegen failed with code ${code}: ${stderr}`);
        reject(new Error(stderr || `Codegen process exited with code ${code}`));
      }
    });

    child.on('error', (err) => {
      console.error(`Failed to start codegen process: ${err.message}`);
      reject(err);
    });

    child.stdin.write(graphJson);
    child.stdin.end();
  });
});

// --- Live preview: JSON -> codegen (+wasm shim) -> odin build -> wasm bytes ---

// Resolve the Odin compiler. SKALD_ODIN env var wins; then PATH; then the
// conventional Windows install location. Only successful lookups are cached:
// caching a miss would keep saying "not found" after the user installs Odin
// mid-session.
let cachedOdinPath: string | null = null;
const findOdin = (): string | null => {
  if (cachedOdinPath !== null) return cachedOdinPath;
  const candidates = [process.env.SKALD_ODIN, 'odin', 'C:\\Odin\\odin.exe'].filter(Boolean) as string[];
  for (const candidate of candidates) {
    try {
      const probe = spawnSync(candidate, ['version'], { timeout: 10_000 });
      if (probe.status === 0) {
        cachedOdinPath = candidate;
        return candidate;
      }
    } catch {
      // try the next candidate
    }
  }
  return null;
};

// A hung child (AV scan holding a file, stuck compiler) would otherwise leave
// the returned Promise pending forever and wedge the preview's buildInFlight
// latch — kill and reject instead.
const PROCESS_TIMEOUT_MS = 60_000;

const runProcess = (command: string, args: string[], stdin?: string): Promise<string> =>
  new Promise((resolve, reject) => {
    const child = spawn(command, args);
    let stdout = '';
    let stderr = '';
    let settled = false;
    const timer = setTimeout(() => {
      settled = true;
      child.kill();
      reject(new Error(`${command} timed out after ${PROCESS_TIMEOUT_MS / 1000}s`));
    }, PROCESS_TIMEOUT_MS);
    child.stdout.on('data', (d) => { stdout += d.toString(); });
    child.stderr.on('data', (d) => { stderr += d.toString(); });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (settled) return;
      if (code === 0) resolve(stdout);
      else reject(new Error(stderr || stdout || `${command} exited with code ${code}`));
    });
    child.on('error', (err) => {
      clearTimeout(timer);
      if (!settled) reject(err);
    });
    if (stdin !== undefined) child.stdin.write(stdin);
    child.stdin.end();
  });

// All preview builds share one fixed directory, so two overlapping IPC calls
// would race on the same generated_audio.odin/skald.wasm files (a fast
// double-click on Play, or a hot-swap rebuild overlapping a fresh Play).
// Serialize them: each call chains onto the previous one.
let previewBuildChain: Promise<unknown> = Promise.resolve();

const buildWasmPreview = async (projectJson: string): Promise<ArrayBuffer> => {
  const odinPath = findOdin();
  if (!odinPath) {
    throw new Error(
      'Odin compiler not found. Install Odin (https://odin-lang.org) and either add it to PATH ' +
      'or set the SKALD_ODIN environment variable to the odin executable.'
    );
  }

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

  await runProcess(odinPath, [
    'build', previewDir,
    '-target:freestanding_wasm32',
    '-no-entry-point',
    '-o:speed',
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

// Handler for selecting output path
ipcMain.handle('select-output-path', async () => {
  // Default the dialog to the tester's generated_audio package — the one
  // place build_and_test.bat reads from. Landing anywhere else in the
  // tester tree breaks the harness build (one Odin package per directory).
  let defaultPath = 'generated_audio.odin';
  const testerDefault = path.join(
    app.getAppPath(), '..', 'skald-backend', 'tester', 'generated_audio', 'generated_audio.odin'
  );
  if (fs.existsSync(path.dirname(testerDefault))) {
    defaultPath = testerDefault;
  }
  const { filePath } = await dialog.showSaveDialog({
    title: 'Select Output File',
    buttonLabel: 'Select',
    defaultPath,
    filters: [{ name: 'Odin Source File', extensions: ['odin'] }],
  });
  return filePath || null;
});


// Handler for saving the graph
ipcMain.handle('save-graph', async (_, graphJson: string) => {
  const { filePath } = await dialog.showSaveDialog({
    title: 'Save Skald Graph',
    buttonLabel: 'Save',
    defaultPath: `skald-graph-${Date.now()}.json`,
    filters: [{ name: 'Skald Files', extensions: ['json'] }],
  });

  if (filePath) {
    fs.writeFileSync(filePath, graphJson);
  }
});

// Handler for loading the graph
ipcMain.handle('load-graph', async () => {
  const { filePaths } = await dialog.showOpenDialog({
    title: 'Load Skald Graph',
    buttonLabel: 'Load',
    properties: ['openFile'],
    filters: [{ name: 'Skald Files', extensions: ['json'] }],
  });

  if (filePaths && filePaths.length > 0) {
    const content = fs.readFileSync(filePaths[0], 'utf-8');
    return content;
  }
  return null;
});