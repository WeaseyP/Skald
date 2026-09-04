# Start here

Six examples, in order, for a first hour with Skald. In the app they are the
**Start Here** category of the Examples button; a fresh install opens with the
first one already loaded, so pressing Play makes a sound before you have built
anything.

These are pointers, not copies — each file lives in its real category below,
where the corpus gate and content fixes find it. The list itself is
`skald-ui/src/main/startHere.ts`, and a test checks every path here still
exists.

| # | Open this | What it teaches |
|---|---|---|
| 1 | [`instruments/bass/bass-sequenced.skald.json`](../instruments/bass/bass-sequenced.skald.json) | One instrument, one track. Press Play and it sounds; open the track to see the notes. |
| 2 | [`instruments/leads/saw-lead.skald.json`](../instruments/leads/saw-lead.skald.json) | A single playable instrument: the node graph on its own, no sequencer. |
| 3 | [`instruments/drums/kick-sequenced.skald.json`](../instruments/drums/kick-sequenced.skald.json) | A percussion voice: an envelope driving pitch, and a step grid. |
| 4 | [`sound-effects/synth/LaserPew.json`](../sound-effects/synth/LaserPew.json) | A one-shot game sound with no Instrument node: how a loose graph exports as an SFX asset. |
| 5 | [`sound-effects/synth/classic-delay-puck.skald.json`](../sound-effects/synth/classic-delay-puck.skald.json) | A bus effect: what Delay does to the tail, and why `is_playing` stays true after the note. |
| 6 | [`songs/full/four-bar-song.skald.json`](../songs/full/four-bar-song.skald.json) | Several instruments, several tracks, a full pattern: the flagship song. |

When you are done with these, the [user manual](../../docs/manual-source/)
covers everything else, and the [SNES Kit](../snes-kit/README.md) is a
complete 16-bit soundtrack starter.
