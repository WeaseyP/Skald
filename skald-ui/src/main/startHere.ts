/*
================================================================================
| FILE: skald-ui/src/main/startHere.ts                                         |
|                                                                              |
| The curated "Start Here" list (roadmap packet B6-3) and the first-run       |
| patch (B6-6). Pure data plus one pure projection, so the list can be        |
| pinned by a test that checks every path exists in examples/ and is a        |
| graph-shaped save — a curated list that points at a renamed file is worse   |
| than no list.                                                                |
|                                                                              |
| The entries are EXISTING examples, not copies. A copy under                 |
| examples/start-here/ would be a second file for the corpus gate to golden   |
| and for content fixes (B8 rewired four-bar-song) to miss. The folder        |
| exists for people browsing the repo (examples/start-here/README.md) and     |
| carries the same six pointers.                                              |
================================================================================
*/

import type { ExampleItem } from '../definitions/examples';

export interface StartHereEntry {
    /** Path relative to the examples directory, forward slashes. */
    path: string;
    /** Display name; numbered so the modal shows the intended order. */
    name: string;
    /** One sentence on what this one teaches — shown as the item's subtitle. */
    why: string;
}

export const START_HERE_CATEGORY_KEY = 'start-here';
export const START_HERE_CATEGORY_LABEL = 'Start Here';

export const START_HERE: readonly StartHereEntry[] = [
    {
        path: 'instruments/bass/bass-sequenced.skald.json',
        name: '1. Sequenced Bass',
        why: 'One instrument, one track. Press Play and it sounds; open the track to see the notes.',
    },
    {
        path: 'instruments/leads/saw-lead.skald.json',
        name: '2. Saw Lead',
        why: 'A single playable instrument: the node graph on its own, no sequencer.',
    },
    {
        path: 'instruments/drums/kick-sequenced.skald.json',
        name: '3. Sequenced Kick',
        why: 'A percussion voice: an envelope driving pitch, and a step grid.',
    },
    {
        path: 'sound-effects/synth/LaserPew.json',
        name: '4. Laser Pew (SFX)',
        why: 'A one-shot game sound with no Instrument node: how a loose graph exports as an SFX asset.',
    },
    {
        path: 'sound-effects/synth/classic-delay-puck.skald.json',
        name: '5. Delay Puck',
        why: 'A bus effect: what Delay does to the tail, and why is_playing stays true after the note.',
    },
    {
        path: 'songs/full/four-bar-song.skald.json',
        name: '6. Four-Bar Song',
        why: 'Several instruments, several tracks, a full pattern: the flagship song.',
    },
];

/** The patch a brand-new install opens with (B6-6): the first Start Here entry. */
export const FIRST_RUN_EXAMPLE: StartHereEntry = START_HERE[0];

/**
 * The Start Here entries as example-list items (the shape `list-examples`
 * returns, src/definitions/examples.ts), in curated order, skipping any whose
 * file is missing (a broken pointer must not be clickable). Ids are prefixed
 * so the same file can also appear under its real category without a
 * duplicate key.
 */
export const startHereExampleItems = (existsRel: (rel: string) => boolean): ExampleItem[] =>
    START_HERE.filter((e) => existsRel(e.path)).map((e) => ({
        id: `${START_HERE_CATEGORY_KEY}/${e.path}`,
        name: e.name,
        category: START_HERE_CATEGORY_LABEL,
        categoryKey: START_HERE_CATEGORY_KEY,
        subcategory: e.why,
        path: e.path,
    }));
