/*
================================================================================
| Roadmap packet B8 — Flagship Content / BUGS.md SKB-014, SKB-015.            |
|                                                                              |
| Two defect SHAPES, not tied to any one file, so a future example that       |
| reintroduces either one is caught here rather than by ear:                  |
|                                                                              |
|   SKB-014 — MidiInput.pitch wired straight into an exponential V/Oct port   |
|   (Oscillator/Wavetable input_freq). The generated voice already gets its   |
|   pitch from _note_on; the wire ADDS voice.note as a second, unintended     |
|   octave offset on top of it (codegen_nodes.odin's                         |
|   `base * math.pow(2.0, math.clamp(mod, -10.0, 10.0))`).                    |
|                                                                              |
|   SKB-015 — MidiInput.gate wired into an ADSR's `input` port. The generated |
|   ADSR multiplies input * envelope (generate_adsr_code), and MidiInput.gate |
|   emits 0.0 the instant a note releases (codegen_nodes.odin:572-573) — so   |
|   the wire multiplies the whole release stage by zero and the tail never   |
|   sounds, no matter how long `release` is authored.                        |
|                                                                              |
| Both shipped in four-bar-song.skald.json (11 wires total) and sax3.json (1  |
| of each) until B8-1/B8-2 deleted them (the depth also dropped to 1.5 on the |
| four-bar-song Kick's Pitch Env, covered separately by                      |
| tests/unit/exponent_overdrive_test.odin and the codegen_only golden         |
| fixture on the backend side — this file is the front-end-visible half:     |
| the example DATA itself must never carry either shape again).               |
|                                                                              |
| Run against the pre-fix files (`git show HEAD~1:<path>` at the commit       |
| before B8 landed) this test fails on both files; it is green only because   |
| the wires are gone, not because the check is vacuous — see the "at least    |
| one file is actually exercised" hygiene test at the bottom.                 |
================================================================================
*/
import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';
import { findRepoRoot } from '../contracts/paramRangeDump';

const repoRoot = findRepoRoot();

interface RawNode {
    id: string;
    type: string;
    data?: { subgraph?: { nodes?: RawNode[]; connections?: RawConn[] } };
}
interface RawConn {
    from_node: string;
    from_port: string;
    to_node: string;
    to_port: string;
}
interface RawGraph {
    nodes: RawNode[];
    connections: RawConn[];
}

/** Every Instrument node's `data.subgraph` — the only place these wires can live. */
const collectSubgraphs = (nodes: RawNode[]): RawGraph[] => {
    const graphs: RawGraph[] = [];
    for (const n of nodes) {
        const sg = n?.data?.subgraph;
        if (sg && Array.isArray(sg.nodes) && Array.isArray(sg.connections)) {
            graphs.push({ nodes: sg.nodes, connections: sg.connections });
        }
    }
    return graphs;
};

const FLAGSHIP_FILES = [
    'examples/songs/full/four-bar-song.skald.json',
    'examples/instruments/winds/midi-setup/sax3.json',
];

const EXPONENTIAL_FREQ_PORTS = new Set(['input_freq', 'input_carrier']);

let exercisedPitchCheck = 0;
let exercisedGateCheck = 0;

describe('B8 — flagship content defect wires stay absent (SKB-014 / SKB-015)', () => {
    for (const rel of FLAGSHIP_FILES) {
        const abs = path.join(repoRoot, rel);

        it(`${rel}: no MidiInput.pitch wired into an exponential V/Oct port`, () => {
            const raw = JSON.parse(fs.readFileSync(abs, 'utf8'));
            const subgraphs = collectSubgraphs(raw.nodes ?? []);
            expect(subgraphs.length, `${rel}: expected at least one Instrument subgraph`).toBeGreaterThan(0);

            for (const g of subgraphs) {
                const byId = new Map(g.nodes.map((n) => [n.id, n]));
                for (const c of g.connections) {
                    exercisedPitchCheck++;
                    const from = byId.get(c.from_node);
                    if (from?.type !== 'midiInput' || c.from_port !== 'pitch') continue;
                    const to = byId.get(c.to_node);
                    expect(
                        EXPONENTIAL_FREQ_PORTS.has(c.to_port),
                        `${rel}: MidiInput(${c.from_node}).pitch is wired into ` +
                            `${to?.type}(${c.to_node}).${c.to_port}, an exponential V/Oct port — the voice's ` +
                            `pitch is already set by _note_on, so this adds voice.note as a second unintended ` +
                            `octave offset (SKB-014). Delete the wire.`,
                    ).toBe(false);
                }
            }
        });

        it(`${rel}: no MidiInput.gate wired into an ADSR's audio input`, () => {
            const raw = JSON.parse(fs.readFileSync(abs, 'utf8'));
            const subgraphs = collectSubgraphs(raw.nodes ?? []);
            expect(subgraphs.length, `${rel}: expected at least one Instrument subgraph`).toBeGreaterThan(0);

            for (const g of subgraphs) {
                const byId = new Map(g.nodes.map((n) => [n.id, n]));
                for (const c of g.connections) {
                    exercisedGateCheck++;
                    const from = byId.get(c.from_node);
                    if (from?.type !== 'midiInput' || c.from_port !== 'gate') continue;
                    const to = byId.get(c.to_node);
                    if (to?.type !== 'adsr') continue;
                    expect(
                        c.to_port,
                        `${rel}: MidiInput(${c.from_node}).gate is wired into ADSR(${c.to_node}).${c.to_port} — ` +
                            `generate_adsr_code multiplies (input) * envelope, and MidiInput.gate emits 0.0 the ` +
                            `instant a note releases, so this silences the whole release tail regardless of the ` +
                            `authored release time (SKB-015). Delete the wire.`,
                    ).not.toBe('input');
                }
            }
        });
    }

    it('the checks above actually walked connections, not an empty file (coverage-floor lesson, see A8)', () => {
        expect(exercisedPitchCheck, 'no connection was ever inspected for the pitch check — it passed vacuously').toBeGreaterThan(0);
        expect(exercisedGateCheck, 'no connection was ever inspected for the gate check — it passed vacuously').toBeGreaterThan(0);
    });
});
