// @vitest-environment node
//
// Roadmap packet B6-3. The Start Here list is pointers into examples/, so
// this test is what makes a rename of any of those files a red gate instead
// of a dead link in the Examples modal.
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
    FIRST_RUN_EXAMPLE,
    START_HERE,
    START_HERE_CATEGORY_KEY,
    startHereExampleItems,
} from '../../main/startHere';

const examplesDir = path.resolve(__dirname, '..', '..', '..', '..', 'examples');

describe('START_HERE', () => {
    it('points only at files that exist, each a graph-shaped editor save', () => {
        for (const entry of START_HERE) {
            const abs = path.join(examplesDir, entry.path);
            expect(fs.existsSync(abs), `${entry.path} is missing from examples/`).toBe(true);
            const parsed = JSON.parse(fs.readFileSync(abs, 'utf8'));
            expect(Array.isArray(parsed.nodes), `${entry.path} is not a graph-shaped save (no top-level nodes[])`).toBe(true);
        }
    });

    it('has unique paths and numbered names in curated order', () => {
        const paths = START_HERE.map((e) => e.path);
        expect(new Set(paths).size).toBe(paths.length);
        START_HERE.forEach((e, i) => expect(e.name.startsWith(`${i + 1}. `), e.name).toBe(true));
        expect(START_HERE.length).toBeGreaterThanOrEqual(5);
    });

    it('the first-run patch is a sequenced example so Play makes a sound with no editing', () => {
        const abs = path.join(examplesDir, FIRST_RUN_EXAMPLE.path);
        const parsed = JSON.parse(fs.readFileSync(abs, 'utf8'));
        const tracks = parsed.sequencerTracks ?? [];
        expect(tracks.length, 'the first-run patch must carry at least one track').toBeGreaterThan(0);
        expect(tracks.some((t: { notes?: unknown[] }) => (t.notes?.length ?? 0) > 0)).toBe(true);
    });

    it('projects to example-list items in order, skipping a missing file rather than listing a dead pointer', () => {
        const all = startHereExampleItems(() => true);
        expect(all.map((i) => i.path)).toEqual(START_HERE.map((e) => e.path));
        expect(all.every((i) => i.categoryKey === START_HERE_CATEGORY_KEY)).toBe(true);
        expect(all.every((i) => i.id.startsWith(`${START_HERE_CATEGORY_KEY}/`))).toBe(true);

        const missingFirst = startHereExampleItems((rel) => rel !== START_HERE[0].path);
        expect(missingFirst).toHaveLength(START_HERE.length - 1);
        expect(missingFirst[0].path).toBe(START_HERE[1].path);
    });
});
