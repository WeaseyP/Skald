/*
================================================================================
| FILE: skald-ui/src/main/runChild.ts                                          |
|                                                                              |
| The one spawn-with-stdin helper for every child the main process runs: the  |
| code generator (Generate Code AND the live preview) and the Odin compiler.  |
| Extracted from main.ts so the two ways a bare spawn fails can be proven     |
| against real child processes (src/tests/main/runChild.test.ts).             |
================================================================================
*/
import { spawn } from 'node:child_process';

// A hung child (AV scan holding a file, stuck compiler) would otherwise leave
// the returned Promise pending forever and wedge whichever caller is waiting —
// the preview's buildInFlight latch, or the renderer's Generate button.
export const CHILD_TIMEOUT_MS = 60_000;

export interface RunChildOptions {
    /** Written to the child's stdin, then stdin is closed. */
    stdin?: string;
    timeoutMs?: number;
    /** Called with each stderr chunk as it arrives (for live logging). */
    onStderr?: (chunk: string) => void;
}

export interface RunChildResult {
    stdout: string;
    stderr: string;
}

// SKB-039 / roadmap packet B9-4. Two things this does that `spawn` + a bare
// `child.stdin.write` did not:
//
//   * a timeout that kills the child and rejects, so a hang is a visible error
//     instead of a Promise that never settles;
//   * a listener on child.stdin's 'error' event. The generator exits before
//     draining stdin on EVERY preflight hard error (it reads the first chunk,
//     rejects the graph, exits 1), so for any payload larger than the OS pipe
//     buffer the write raises EPIPE (or EOF on Windows). An 'error' event with
//     no listener is an uncaught exception — in the main process, that is the
//     whole app. The listener records it and lets the 'close' handler report
//     the child's own exit code and stderr, which is the message the user
//     actually needs.
export const runChild = (command: string, args: string[], opts: RunChildOptions = {}): Promise<RunChildResult> =>
    new Promise((resolve, reject) => {
        const timeoutMs = opts.timeoutMs ?? CHILD_TIMEOUT_MS;
        const child = spawn(command, args);
        let stdout = '';
        let stderr = '';
        let stdinError: Error | null = null;
        let settled = false;

        const settle = (outcome: () => void) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            outcome();
        };

        const timer = setTimeout(() => {
            child.kill();
            settle(() => reject(new Error(`${command} timed out after ${timeoutMs / 1000}s`)));
        }, timeoutMs);

        child.stdout.on('data', (d) => { stdout += d.toString(); });
        child.stderr.on('data', (d) => {
            const chunk = d.toString();
            stderr += chunk;
            opts.onStderr?.(chunk);
        });

        child.on('close', (code) => settle(() => {
            if (code === 0) {
                resolve({ stdout, stderr });
                return;
            }
            const detail = stderr || stdout || `${command} exited with code ${code}`;
            // The stdin failure is a symptom of the early exit, not the cause;
            // it is appended only when the child said nothing itself.
            const suffix = !stderr && stdinError ? ` (stdin write failed: ${stdinError.message})` : '';
            reject(new Error(detail + suffix));
        }));

        child.on('error', (err) => settle(() => reject(err)));

        child.stdin.on('error', (err: Error) => { stdinError = err; });

        if (opts.stdin !== undefined) child.stdin.write(opts.stdin);
        child.stdin.end();
    });
