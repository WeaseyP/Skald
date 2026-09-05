// @vitest-environment jsdom
//
// E7: "Add a one-line legend somewhere discoverable" for the new semantic
// cable colours. It lives in the existing "?" popup rather than a new UI
// surface, and reads its colours/labels from edgeKind.ts directly (not a
// copy), so the legend cannot say something the canvas doesn't actually draw.
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ShortcutLegend } from '../../components/ShortcutLegend';
import { EDGE_KIND_COLORS, EDGE_KIND_LABELS } from '../../components/Edges/edgeKind';

afterEach(cleanup);

// jsdom normalizes an inline hex background to rgb(); comparing through the
// same normalization (rather than hardcoding the rgb triplets) keeps this
// test from silently drifting if a colour in edgeKind.ts ever changes.
const asRgb = (hex: string): string => {
    const probe = document.createElement('div');
    probe.style.background = hex;
    return probe.style.background;
};

describe('ShortcutLegend: cable-colour key', () => {
    it('lists all three wire kinds with edgeKind.ts\'s own labels and colours', () => {
        render(<ShortcutLegend />);
        fireEvent.click(screen.getByLabelText('Keyboard shortcuts'));

        for (const kind of ['audio', 'modulation', 'trigger'] as const) {
            const entry = screen.getByText(`${EDGE_KIND_LABELS[kind]} wire`);
            expect(entry).toBeTruthy();
            const swatch = entry.querySelector('span') as HTMLElement;
            expect(swatch.style.background).toBe(asRgb(EDGE_KIND_COLORS[kind]));
        }
    });
});
