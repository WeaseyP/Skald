// @vitest-environment jsdom
import React from 'react';
import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { NodeParameterControls } from '../../components/NodeParameterControls';
import { nodeTypes } from '../../definitions/nodeTypes';
import { NODE_DEFINITIONS } from '../../definitions/node-definitions';
import { ParamNodeConfig } from '../../components/Nodes/ParamNode';

// ---------------------------------------------------------------------------
// Packet A7 item 7 — card/sidebar parameter parity.
//
// Skald keeps two hand-maintained representations of every node's parameters:
// the on-canvas node card (`makeParamNode`'s `fields`) and the sidebar
// (`NodeParameterControls`). Nothing reconciled them, so parameters drifted
// into one surface and not the other — Reverb `preDelay` shipped in the engine
// and in the sidebar with no card control at all, and Oscillator `phase` the
// same way.
//
// This asserts the containment that matters: every parameter the sidebar
// offers for a node type must also be editable on that type's card. (The
// reverse is deliberately NOT asserted — a card may carry a mode switch the
// sidebar renders outside the wrapper, e.g. `bpmSync`.)
//
// This is the cheap stand-in for packet C2's generated node schema, which
// replaces both representations with one. Until then, this test is the thing
// that fails when the next parameter lands on one surface only.
// ---------------------------------------------------------------------------

// Node types whose card is hand-written rather than spec-driven, so there is
// no `fields` array to compare against. Listed explicitly (not detected) so
// that converting a card to `makeParamNode`, or adding a new hand-written one,
// forces a deliberate edit here.
const HAND_WRITTEN_CARDS = ['instrument', 'mixer', 'midiInput', 'output', 'group'];

/** Data shapes to render each type under, so `showIf`-gated controls appear. */
const dataVariants = (base: Record<string, unknown>): Record<string, unknown>[] => [
    base,
    { ...base, bpmSync: true },
    { ...base, bpmSync: false },
    { ...base, fixedPitch: true },
    { ...base, fixedPitch: false },
    { ...base, waveform: 'Square' },
];

/** Every parameter key the sidebar wraps for `type`, across all modes. */
const sidebarParamKeys = (type: string): Set<string> => {
    const base = { ...(NODE_DEFINITIONS[type]?.defaultParameters ?? {}) } as Record<string, unknown>;
    const keys = new Set<string>();
    for (const data of dataVariants(base)) {
        const { unmount } = render(
            <NodeParameterControls
                node={{ id: `${type}-1`, type, position: { x: 0, y: 0 }, data }}
                onChange={vi.fn()}
                renderControlWrapper={(paramKey, _label, control) => {
                    keys.add(paramKey);
                    return <div key={paramKey}>{control}</div>;
                }}
                bpm={120}
            />
        );
        unmount();
    }
    return keys;
};

const specDrivenTypes = Object.entries(nodeTypes)
    .map(([type, Component]) => [type, (Component as { paramSpec?: ParamNodeConfig }).paramSpec] as const)
    .filter((entry): entry is readonly [string, ParamNodeConfig] => entry[1] !== undefined);

describe('node card / sidebar parameter parity', () => {
    it('covers every registered node type either by spec or by explicit exemption', () => {
        const covered = [...specDrivenTypes.map(([type]) => type), ...HAND_WRITTEN_CARDS].sort();
        expect(covered).toEqual(Object.keys(nodeTypes).sort());
    });

    it.each(specDrivenTypes.map(([type, spec]) => ({ type, spec })))(
        '$type card fields are a superset of its sidebar parameters',
        ({ type, spec }) => {
            const cardKeys = new Set((spec.fields ?? []).map((f) => f.key));
            const missing = [...sidebarParamKeys(type)].filter((k) => !cardKeys.has(k));
            expect(missing).toEqual([]);
        }
    );

    it('Reverb pre-delay is reachable on the card and exposed by default', () => {
        // The named instance this test was written for: implemented in the
        // engine (0-0.25 s, clamped), offered by the sidebar, absent from the
        // card — so the primary editing surface could not reach it.
        const spec = (nodeTypes.reverb as unknown as { paramSpec: ParamNodeConfig }).paramSpec;
        const preDelay = (spec.fields ?? []).find((f) => f.key === 'preDelay');
        expect(preDelay).toBeDefined();
        expect(preDelay?.min).toBe(0);
        expect(preDelay?.max).toBe(0.25);
        // Read-time default matches the codegen fallback, so a save with no
        // `preDelay` key does not render 0 while the engine plays 0.02.
        expect(preDelay?.default).toBe(0.02);
        expect(NODE_DEFINITIONS.reverb.defaultParameters.exposedParameters).toContain('preDelay');
    });

    it('ADSR labels its input port "In", not "Gate"', () => {
        // A7 item 13. The port is the ADSR's audio multiplicand, not a gate;
        // the old label got a MIDI gate wired into it in shipped content,
        // which multiplies the release tail by zero at note-off.
        const spec = (nodeTypes.adsr as unknown as { paramSpec: ParamNodeConfig }).paramSpec;
        expect(spec.inputs?.map((p) => p.label)).toEqual(['In']);
        expect(spec.inputs?.map((p) => p.id)).toEqual(['input']); // handle id unchanged
    });

    it('Wavetable amplitude exists on the card, in the defaults and in the default exposed set', () => {
        // A7 item 8. The engine multiplied by it (fallback 1.0), the card
        // rendered a control for it, and nothing else knew it existed.
        const spec = (nodeTypes.wavetable as unknown as { paramSpec: ParamNodeConfig }).paramSpec;
        expect((spec.fields ?? []).find((f) => f.key === 'amplitude')?.default).toBe(1);
        const defaults = NODE_DEFINITIONS.wavetable.defaultParameters;
        expect(defaults.amplitude).toBe(1.0);
        expect(defaults.exposedParameters).toContain('amplitude');
    });
});
