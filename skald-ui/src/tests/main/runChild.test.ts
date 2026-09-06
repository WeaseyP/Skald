// @vitest-environment node
//
// Roadmap packet B9-4 / BUGS.md SKB-039. `invoke-codegen` in main.ts used to
// spawn the generator with no timeout and no error handler on the child's
// stdin. Two consequences, both invisible until they happened in production:
//
//   * a generator that hung (AV scan holding the output file, a stuck read)
//     left the IPC Promise pending forever — the renderer's Generate button
//     never came back;
//   * a generator that exited BEFORE draining stdin (every hard error the
//     preflight pass emits does exactly that, after reading only the first
//     chunk) made `child.stdin.write(graphJson)` raise EPIPE as an 'error'
//     event on a stream nobody listened to, which in Node is an uncaught
//     exception in the Electron main process.
//
// runChild is the one spawn-with-stdin helper both invoke-codegen and the
// preview build now share. It is exercised here against real child processes
// (node itself) because the failure modes are OS pipe semantics, not logic a
// mock could reproduce.
import { describe, it, expect } from 'vitest';
import { runChild } from '../../main/runChild';

const node = process.execPath;

describe('runChild — the happy path', () => {
    it('resolves with the child stdout and forwards stdin to the child', async () => {
        const result = await runChild(node, ['-e', "process.stdin.on('data', d => process.stdout.write(d))"], {
            stdin: 'hello from stdin',
        });
        expect(result.stdout).toBe('hello from stdin');
    });

    it('rejects with the child stderr when the exit code is non-zero', async () => {
        await expect(
            runChild(node, ['-e', "console.error('boom: bad graph'); process.exit(3)"], { stdin: '{}' }),
        ).rejects.toThrow(/boom: bad graph/);
    });

    it('streams stderr chunks to onStderr as they arrive', async () => {
        const chunks: string[] = [];
        await runChild(node, ['-e', "console.error('warn 1'); console.error('warn 2')"], {
            onStderr: (c) => chunks.push(c),
        });
        expect(chunks.join('')).toContain('warn 1');
        expect(chunks.join('')).toContain('warn 2');
    });
});

describe('runChild — SKB-039: the two ways the old spawn hung or crashed', () => {
    it('rejects with a timeout instead of pending forever when the child never exits', async () => {
        const started = Date.now();
        await expect(
            runChild(node, ['-e', 'setTimeout(() => {}, 30000)'], { stdin: '{}', timeoutMs: 300 }),
        ).rejects.toThrow(/timed out after 0\.3s/);
        // Pinned well under the child's own 30s sleep so a "pass" cannot be
        // the child simply finishing.
        expect(Date.now() - started).toBeLessThan(5000);
    }, 10_000);

    it('does not raise an unhandled stream error when the child exits before reading stdin', async () => {
        // 4 MB is far past any OS pipe buffer, so the write cannot complete
        // before the child is gone: the stdin stream WILL emit 'error'
        // (EPIPE or EOF). Before B9-4 that event had no listener, and vitest
        // reports it as an unhandled error that fails the run.
        const big = 'x'.repeat(4 * 1024 * 1024);
        await expect(
            runChild(node, ['-e', "console.error('rejected before reading input'); process.exit(1)"], { stdin: big }),
        ).rejects.toThrow(/rejected before reading input/);
    }, 10_000);
});
