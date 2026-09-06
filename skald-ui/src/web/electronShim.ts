/*
================================================================================
| FILE: skald-ui/src/web/electronShim.ts                                       |
|                                                                              |
| Browser replacement for the Electron preload bridge (src/preload.ts), so    |
| the renderer can run as a plain web page served by web-server/server.mjs.   |
|                                                                              |
| Same six-method surface, different transports:                              |
|   invokeCodegen / buildWasmPreview  -> HTTP to the local server, which runs |
|                                        the same skald_codegen.exe + odin    |
|                                        build the Electron main process does |
|   saveGraph / saveWav / saveWavStems -> browser download                    |
|   loadGraph / importPatches         -> browser file picker                  |
|   selectOutputPath                  -> filename prompt (downloads have no   |
|                                        real destination dialog)             |
================================================================================
*/

const post = async (url: string, body: string): Promise<Response> => {
    const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
    });
    if (!res.ok) {
        // The server puts the codegen/compiler stderr in the body; that text is
        // what useWasmAudioEngine surfaces on the canvas banner, so pass it
        // through as the Error message rather than a bare status code.
        const text = await res.text();
        throw new Error(text || `${url} failed with HTTP ${res.status}`);
    }
    return res;
};

// BlobPart, not string: the WAV bounce (roadmap G1) hands this raw bytes and
// a Blob built from a string would utf8-encode them, corrupting every byte
// above 0x7F — a downloaded file that is the right length and pure static.
const download = (name: string, content: BlobPart, type: string): void => {
    const url = URL.createObjectURL(new Blob([content], { type }));
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
};

const pickFiles = (multiple: boolean): Promise<File[]> =>
    new Promise((resolve) => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json,application/json';
        input.multiple = multiple;
        input.style.display = 'none';
        document.body.appendChild(input);
        const done = (files: File[]) => {
            input.remove();
            resolve(files);
        };
        input.addEventListener('change', () => done(Array.from(input.files ?? [])));
        // 'cancel' fires in Chromium/Firefox/Safari when the picker is dismissed;
        // without it a canceled dialog would leave the caller's await pending.
        input.addEventListener('cancel', () => done([]));
        input.click();
    });

export const installElectronShim = (): void => {
    (window as unknown as { electron: unknown }).electron = {
        invokeCodegen: async (
            graphJson: string,
            options?: { packageName?: string; outputPath?: string }
        ): Promise<string> => {
            const res = await post(
                '/api/codegen',
                JSON.stringify({ graphJson, packageName: options?.packageName })
            );
            const code = await res.text();
            // The web build has no output path to write to — hand the user the
            // file instead, named from whatever they typed in the path box.
            const base =
                (options?.outputPath || 'generated_audio.odin').split(/[\\/]/).pop() ||
                'generated_audio.odin';
            download(base.endsWith('.odin') ? base : `${base}.odin`, code, 'text/plain');
            return code;
        },

        buildWasmPreview: async (projectJson: string): Promise<ArrayBuffer> => {
            const res = await post('/api/build-wasm-preview', projectJson);
            return res.arrayBuffer();
        },

        // Roadmap G1 — offline bounce. A browser download has no destination
        // dialog, so the file lands wherever the browser puts downloads and
        // the reported "path" says so rather than inventing one.
        saveWav: async (
            fileName: string,
            bytes: Uint8Array
        ): Promise<{ saved: boolean; path?: string; error?: string }> => {
            try {
                // A fresh copy, not the incoming view: a Uint8Array that came
                // over a possibly-shared buffer is not a BlobPart, and slicing
                // it is also what guarantees the Blob owns bytes nothing else
                // can rewrite between here and the browser's download.
                download(fileName, new Uint8Array(bytes).slice().buffer, 'audio/wav');
                return { saved: true, path: `${fileName} (in your Downloads)` };
            } catch (e) {
                return { saved: false, error: e instanceof Error ? e.message : String(e) };
            }
        },

        // Roadmap G2 — stems in the browser. There is no folder picker and
        // no zip: the files download one after another, which is what a
        // browser can actually do, and the reported "path" says so rather than
        // implying a directory the page never chose.
        saveWavStems: async (
            files: { name: string; bytes: Uint8Array }[]
        ): Promise<{ saved: boolean; path?: string; error?: string }> => {
            try {
                for (const file of files) {
                    download(file.name, new Uint8Array(file.bytes).slice().buffer, 'audio/wav');
                }
                return { saved: true, path: `${files.length} files (in your Downloads)` };
            } catch (e) {
                return { saved: false, error: e instanceof Error ? e.message : String(e) };
            }
        },

        saveGraph: async (
            graphJson: string
        ): Promise<{ saved: boolean; path?: string; error?: string }> => {
            const name = `skald-graph-${Date.now()}.json`;
            try {
                download(name, graphJson, 'application/json');
                return { saved: true, path: `${name} (in your Downloads)` };
            } catch (e) {
                return { saved: false, error: e instanceof Error ? e.message : String(e) };
            }
        },

        loadGraph: async (): Promise<{ content: string | null; error?: string }> => {
            const [file] = await pickFiles(false);
            if (!file) return { content: null };
            try {
                return { content: await file.text() };
            } catch (e) {
                return { content: null, error: e instanceof Error ? e.message : String(e) };
            }
        },

        importPatches: async (): Promise<{
            files: { name: string; content: string }[];
            skipped: { name: string; error: string }[];
        }> => {
            const picked = await pickFiles(true);
            const files: { name: string; content: string }[] = [];
            const skipped: { name: string; error: string }[] = [];
            for (const f of picked) {
                try {
                    files.push({ name: f.name, content: await f.text() });
                } catch (e) {
                    skipped.push({ name: f.name, error: e instanceof Error ? e.message : String(e) });
                }
            }
            return { files, skipped };
        },

        selectOutputPath: async (currentPath?: string): Promise<string | null> => {
            const name = window.prompt(
                'File name for the generated Odin code (it will download to your browser\'s download folder):',
                currentPath || 'generated_audio.odin'
            );
            return name && name.trim().length > 0 ? name.trim() : null;
        },

        listExamples: async (): Promise<any[]> => {
            try {
                const res = await fetch('/api/examples');
                if (!res.ok) return [];
                return await res.json();
            } catch (e) {
                console.error('Failed to list examples:', e);
                return [];
            }
        },

        loadExample: async (examplePath: string): Promise<{ content: string | null; error?: string }> => {
            try {
                const res = await fetch(`/api/examples/${encodeURIComponent(examplePath)}`);
                if (!res.ok) {
                    return { content: null, error: `HTTP ${res.status}: Failed to load example` };
                }
                return { content: await res.text() };
            } catch (e) {
                return { content: null, error: e instanceof Error ? e.message : String(e) };
            }
        },
    };
};
