/*
================================================================================
| FILE: skald-ui/web-server/server.mjs                                         |
|                                                                              |
| Serves the dist-web/ build of the renderer and provides the two toolchain   |
| endpoints the browser shim (src/web/electronShim.ts) calls:                 |
|                                                                              |
|   POST /api/codegen             project JSON -> generated Odin source text  |
|   POST /api/build-wasm-preview  project JSON -> compiled wasm bytes         |
|                                                                              |
| Both run the same pipeline the Electron main process runs (main.ts):        |
| skald_codegen.exe, then `odin build -target:freestanding_wasm32` for the    |
| preview. Each request gets its own temp directory (Odin: one package per    |
| directory), so concurrent visitors can't race on shared files; a small      |
| semaphore caps concurrent compiles so a room full of friends can't melt     |
| the host machine.                                                           |
|                                                                              |
| Nothing client-supplied is ever used as a filesystem path.                  |
|                                                                              |
| Run:  node web-server/server.mjs   (from skald-ui/, after                   |
|       `npx vite build --config vite.web.config.ts`)                         |
================================================================================
*/
import http from 'node:http';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UI_ROOT = path.join(__dirname, '..');            // skald-ui/
const REPO_ROOT = path.join(UI_ROOT, '..');            // Skald/
const STATIC_ROOT = path.join(UI_ROOT, 'dist-web');
const CODEGEN_EXE = process.env.SKALD_CODEGEN ||
    path.join(UI_ROOT, process.platform === 'win32' ? 'skald_codegen.exe' : 'skald_codegen');

// PORT is what hosting platforms (Render, Railway, ...) inject.
const PORT = Number(process.env.PORT || process.env.SKALD_WEB_PORT || 8787);
// Localhost-only by default: reaching this server from another machine must be
// an explicit decision (a tunnel, or SKALD_WEB_HOST=0.0.0.0 in a container),
// never a side effect of starting it.
const HOST = process.env.SKALD_WEB_HOST || '127.0.0.1';
const PROCESS_TIMEOUT_MS = 60_000;
const MAX_BODY_BYTES = 20 * 1024 * 1024;
const MAX_CONCURRENT_BUILDS = 2;

// --- Odin resolution: SKALD_ODIN, then the vendored .tools/ toolchain -------

const findOdinUnder = (root, depth = 3) => {
    for (const name of ['odin.exe', 'odin']) {
        const candidate = path.join(root, name);
        try {
            if (fs.statSync(candidate).isFile()) return candidate;
        } catch { /* keep looking */ }
    }
    if (depth <= 0) return null;
    let children = [];
    try {
        children = fs.readdirSync(root, { withFileTypes: true })
            .filter((e) => e.isDirectory())
            .map((e) => e.name)
            .sort()
            .reverse(); // newest dated toolchain first, same as odinToolchain.ts
    } catch { return null; }
    for (const child of children) {
        const hit = findOdinUnder(path.join(root, child), depth - 1);
        if (hit) return hit;
    }
    return null;
};

const ODIN_EXE = process.env.SKALD_ODIN || findOdinUnder(path.join(REPO_ROOT, '.tools'));

// --- Process helper (same shape as main.ts runProcess) ----------------------

const runProcess = (command, args, stdin) =>
    new Promise((resolve, reject) => {
        const child = spawn(command, args);
        let stdout = '';
        let stderr = '';
        let settled = false;
        const timer = setTimeout(() => {
            settled = true;
            child.kill();
            reject(new Error(`${path.basename(command)} timed out after ${PROCESS_TIMEOUT_MS / 1000}s`));
        }, PROCESS_TIMEOUT_MS);
        child.stdout.on('data', (d) => { stdout += d.toString(); });
        child.stderr.on('data', (d) => { stderr += d.toString(); });
        child.on('close', (code) => {
            clearTimeout(timer);
            if (settled) return;
            if (code === 0) resolve(stdout);
            else reject(new Error(stderr || stdout || `${path.basename(command)} exited with code ${code}`));
        });
        child.on('error', (err) => {
            clearTimeout(timer);
            if (!settled) reject(err);
        });
        // A child that dies mid-write EPIPEs stdin; unhandled, that stream
        // error event takes the whole server down. The close handler already
        // reports the child's real failure, so the write error is noise.
        child.stdin.on('error', () => undefined);
        if (stdin !== undefined) child.stdin.write(stdin);
        child.stdin.end();
    });

// --- Tiny semaphore so N friends can't start N simultaneous compiles --------

let active = 0;
const waiters = [];
const withBuildSlot = async (fn) => {
    if (active >= MAX_CONCURRENT_BUILDS) {
        await new Promise((resolve) => waiters.push(resolve));
    }
    active++;
    try {
        return await fn();
    } finally {
        active--;
        const next = waiters.shift();
        if (next) next();
    }
};

const withTempDir = async (fn) => {
    const dir = await fsp.mkdtemp(path.join(os.tmpdir(), 'skald-web-'));
    try {
        return await fn(dir);
    } finally {
        fsp.rm(dir, { recursive: true, force: true }).catch(() => undefined);
    }
};

// --- Endpoints ---------------------------------------------------------------

// Input JSON goes to codegen as a FILE (-in:), not over stdin: the codegen
// reads stdin with Odin's read_entire_file_from_handle, which sizes its buffer
// by fstat — a Linux pipe stats as 0 bytes, so a piped payload reads back
// empty and fails JSON parsing. (Windows happened to work; the container did
// not.) The input file must live outside the wasm package directory — Odin
// allows one package per directory and a stray .json is harmless, but keeping
// inputs and sources separate costs nothing.

const generateCode = (graphJson, packageName) =>
    withBuildSlot(() => withTempDir(async (dir) => {
        const inFile = path.join(dir, 'input.json');
        const pkgDir = path.join(dir, 'pkg');
        await fsp.mkdir(pkgDir);
        const outFile = path.join(pkgDir, 'generated_audio.odin');
        await fsp.writeFile(inFile, graphJson, 'utf8');
        const args = [`-in:${inFile}`];
        // Package name reaches the codegen CLI and the generated source; keep it
        // to a valid Odin identifier rather than trusting the network.
        if (packageName && /^[A-Za-z_][A-Za-z0-9_]*$/.test(packageName)) {
            args.push(`-package:${packageName}`);
        }
        args.push(`-out:${outFile}`);
        await runProcess(CODEGEN_EXE, args);
        return fsp.readFile(outFile, 'utf8');
    }));

const buildWasmPreview = (projectJson) =>
    withBuildSlot(() => withTempDir(async (dir) => {
        const inFile = path.join(dir, 'input.json');
        const pkgDir = path.join(dir, 'pkg');
        await fsp.mkdir(pkgDir);
        const odinFile = path.join(pkgDir, 'generated_audio.odin');
        const shimFile = path.join(pkgDir, 'wasm_shim.odin');
        const wasmFile = path.join(dir, 'skald.wasm');
        await fsp.writeFile(inFile, projectJson, 'utf8');
        await runProcess(CODEGEN_EXE, [`-in:${inFile}`, `-out:${odinFile}`, `-wasm-shim:${shimFile}`]);
        // -o:none for the same reason main.ts uses it: preview rebuild latency
        // matters far more than optimizing a module that only has to clear one
        // ~2.9ms render quantum.
        await runProcess(ODIN_EXE, [
            'build', pkgDir,
            '-target:freestanding_wasm32',
            '-no-entry-point',
            '-o:none',
            `-out:${wasmFile}`,
        ]);
        return fsp.readFile(wasmFile);
    }));

// --- HTTP plumbing -----------------------------------------------------------

const readBody = (req) =>
    new Promise((resolve, reject) => {
        const chunks = [];
        let size = 0;
        req.on('data', (chunk) => {
            size += chunk.length;
            if (size > MAX_BODY_BYTES) {
                reject(new Error('Request body too large'));
                req.destroy();
                return;
            }
            chunks.push(chunk);
        });
        req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
        req.on('error', reject);
    });

const MIME = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.mjs': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.ico': 'image/x-icon',
    '.wasm': 'application/wasm',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.map': 'application/json',
};

const serveStatic = (req, res) => {
    const urlPath = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    let rel = urlPath === '/' ? 'index.web.html' : urlPath.slice(1);
    const filePath = path.resolve(STATIC_ROOT, rel);
    // path.resolve collapses any ../ — refuse anything that escapes dist-web.
    if (!filePath.startsWith(path.resolve(STATIC_ROOT) + path.sep) &&
        filePath !== path.resolve(STATIC_ROOT)) {
        res.writeHead(403).end('Forbidden');
        return;
    }
    fs.readFile(filePath, (err, data) => {
        if (err) {
            // SPA fallback: unknown paths get the app shell.
            fs.readFile(path.join(STATIC_ROOT, 'index.web.html'), (err2, shell) => {
                if (err2) {
                    res.writeHead(404).end('Not found — did you run the vite web build?');
                    return;
                }
                res.writeHead(200, { 'Content-Type': MIME['.html'] }).end(shell);
            });
            return;
        }
        const type = MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
        res.writeHead(200, { 'Content-Type': type }).end(data);
    });
};

const server = http.createServer(async (req, res) => {
    try {
        if (req.method === 'POST' && req.url === '/api/build-wasm-preview') {
            if (!ODIN_EXE) {
                res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' })
                    .end('The server has no Odin compiler (set SKALD_ODIN or run scripts/setup-dev.ps1 on the host).');
                return;
            }
            const projectJson = await readBody(req);
            const wasm = await buildWasmPreview(projectJson);
            res.writeHead(200, { 'Content-Type': 'application/wasm' }).end(wasm);
            return;
        }
        if (req.method === 'POST' && req.url === '/api/codegen') {
            const body = await readBody(req);
            let parsed;
            try {
                parsed = JSON.parse(body);
            } catch {
                res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Malformed request JSON');
                return;
            }
            if (typeof parsed?.graphJson !== 'string') {
                res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Missing graphJson');
                return;
            }
            const code = await generateCode(parsed.graphJson, parsed.packageName);
            res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' }).end(code);
            return;
        }
        if (req.method === 'GET' || req.method === 'HEAD') {
            serveStatic(req, res);
            return;
        }
        res.writeHead(405).end('Method not allowed');
    } catch (err) {
        // Compiler/codegen stderr rides in the body: the browser shim throws it
        // as the Error message and the canvas banner shows it verbatim.
        const message = err instanceof Error ? err.message : String(err);
        console.error(`[skald-web] ${req.method} ${req.url} failed:\n${message}`);
        if (!res.headersSent) {
            res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' }).end(message);
        } else {
            res.end();
        }
    }
});

server.listen(PORT, HOST, () => {
    console.log(`[skald-web] Serving ${STATIC_ROOT}`);
    console.log(`[skald-web] codegen: ${CODEGEN_EXE} (${fs.existsSync(CODEGEN_EXE) ? 'found' : 'MISSING'})`);
    console.log(`[skald-web] odin:    ${ODIN_EXE || 'NOT FOUND (preview builds will fail)'}`);
    console.log(`[skald-web] listening on http://${HOST}:${PORT}`);
});
