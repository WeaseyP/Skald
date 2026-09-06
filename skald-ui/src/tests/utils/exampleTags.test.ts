// @vitest-environment node
/*
================================================================================
| Roadmap packet F5 — deriveTags, pinned against real shipped examples.       |
|                                                                              |
| deriveTags (utils/exampleTags.mjs) is a pure function of a path and a       |
| parsed file; these are read straight off disk rather than inlined as        |
| fixtures, so a future edit to one of these examples (content, not just a    |
| rename — startHere.test.ts already pins the paths) is what would surface    |
| here as a tag list changing, the same "read the real file" discipline the   |
| examples-corpus gate uses.                                                  |
================================================================================
*/
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { deriveTags } from '../../utils/exampleTags.mjs';

const examplesDir = path.resolve(__dirname, '..', '..', '..', '..', 'examples');
const load = (rel: string): unknown => JSON.parse(fs.readFileSync(path.join(examplesDir, rel), 'utf8'));

describe('deriveTags', () => {
    it('tags a sequenced bass instrument by folder and by its notes (Start Here #1)', () => {
        const rel = 'instruments/bass/bass-sequenced.skald.json';
        const tags = deriveTags(rel, load(rel));
        expect(tags).toEqual(['bass-synth', 'instrument', 'sequenced']);
    });

    it('tags a loose lead graph as a patch (no Instrument node) as well as by folder (Start Here #2)', () => {
        const rel = 'instruments/leads/saw-lead.skald.json';
        const tags = deriveTags(rel, load(rel));
        expect(tags).toContain('lead');
        expect(tags).toContain('instrument'); // folder category
        expect(tags).toContain('patch'); // SKB-019/B6-1: no top-level Instrument node
        expect(tags).not.toContain('sequenced');
    });

    it('tags a loose SFX graph as sfx + patch, not ambient (Start Here #4)', () => {
        const rel = 'sound-effects/synth/LaserPew.json';
        const tags = deriveTags(rel, load(rel));
        expect(tags).toEqual(['patch', 'sfx']);
    });

    it('tags an ambient drone by its name, independent of folder', () => {
        const rel = 'sound-effects/cosmic/BlackHoleDrone.json';
        const tags = deriveTags(rel, load(rel));
        expect(tags).toEqual(expect.arrayContaining(['ambient', 'sfx', 'patch']));
    });

    it('tags a percussion kit piece by its drums folder even without a Noise node', () => {
        const rel = 'instruments/drums/acoustic-electric/Cowbell.json';
        const tags = deriveTags(rel, load(rel));
        expect(tags).toContain('percussion');
        expect(tags).toContain('patch'); // this file has no Instrument node either
    });

    it('tags a sequenced SNES kick as percussion + sequenced under the snes-kit category', () => {
        const rel = 'snes-kit/drums/kick.skald.json';
        const tags = deriveTags(rel, load(rel));
        expect(tags).toEqual(['instrument', 'percussion', 'sequenced', 'snes-kit']);
    });

    it('detects a MIDI Input node anywhere in the graph', () => {
        const tags = deriveTags('instruments/x.skald.json', {
            nodes: [{ id: 'm', type: 'midiInput', data: {} }, { id: 'o', type: 'output', data: {} }],
        });
        expect(tags).toContain('midi');
    });

    it('tags a Noise-only voice as percussion regardless of folder', () => {
        const tags = deriveTags('sound-effects/synth/thud.json', {
            nodes: [{ id: 'n', type: 'noise', data: {} }, { id: 'o', type: 'output', data: {} }],
        });
        expect(tags).toContain('percussion');
        expect(tags).toContain('noise');
    });

    it('does not tag percussion when a pitched oscillator sits alongside noise (e.g. a noisy lead)', () => {
        const tags = deriveTags('instruments/leads/x.skald.json', {
            nodes: [
                { id: 'n', type: 'noise', data: {} },
                { id: 'o', type: 'oscillator', data: {} },
                { id: 'out', type: 'output', data: {} },
            ],
        });
        expect(tags).not.toContain('percussion');
        expect(tags).toContain('noise');
    });

    it('unions in a hand-curated meta.tags block without overriding derived tags', () => {
        const tags = deriveTags('instruments/bass/x.skald.json', {
            nodes: [{ id: 'i', type: 'instrument', data: {} }],
            meta: { tags: ['favourite'] },
        });
        expect(tags).toEqual(['bass-synth', 'favourite', 'instrument']);
    });

    it('a file with no meta block derives tags the same as one with an empty meta', () => {
        const withMeta = deriveTags('instruments/bass/x.skald.json', { nodes: [{ id: 'i', type: 'instrument', data: {} }], meta: {} });
        const withoutMeta = deriveTags('instruments/bass/x.skald.json', { nodes: [{ id: 'i', type: 'instrument', data: {} }] });
        expect(withMeta).toEqual(withoutMeta);
    });
});
