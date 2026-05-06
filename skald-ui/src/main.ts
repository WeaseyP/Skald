// main.ts
import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import { spawn } from 'child_process';
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

  // Open the DevTools.
  mainWindow.webContents.openDevTools();

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

ipcMain.handle('invoke-codegen', async (_, graphJson: string, options: { packageName?: string, outputPath?: string } = {}) => {
  // --- DEBUG: Log the JSON received by the main process ---
  console.log("Main process received from renderer:", graphJson.substring(0, 50) + "...");
  console.log("Options:", options);
  // ---------------------------------------------------------

  // In dev mode, app.getAppPath() points to the project root.
  // In production, it would point to the app's resource directory.
  const executablePath = path.join(app.getAppPath(), 'skald_codegen.exe');

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

// Handler for selecting output path
ipcMain.handle('select-output-path', async () => {
  const { filePath } = await dialog.showSaveDialog({
    title: 'Select Output File',
    buttonLabel: 'Select',
    defaultPath: 'generated_audio.odin',
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