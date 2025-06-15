import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'node:path';
import { spawn } from 'child_process';
import started from 'electron-squirrel-startup';

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (started) {
  app.quit();
}

const createWindow = () => {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 1200, // Increased width to better fit layout
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      // These are important for security and allowing the preload script to work
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

ipcMain.handle('invoke-codegen', async (_, graphJson: string) => {
    // --- DEBUG: Log the JSON received by the main process ---
    console.log("Main process received from renderer:", graphJson);
    // ---------------------------------------------------------

    // In dev mode, app.getAppPath() points to the project root.
    // In production, it would point to the app's resource directory.
    const executablePath = path.join(app.getAppPath(), 'skald_codegen.exe');
    
    return new Promise((resolve, reject) => {
        const child = spawn(executablePath);

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