import { describe, it, expect } from 'vitest';
import { suffixForStepExport } from '../../app';

// item 14 (§6, F-A09-7), Export-Step half: "Export Step to Instrument" clones
// an Instrument node onto the canvas. app.tsx's handleExportStep already
// suffixed the clone's display `label` with "(Step N)" — this fixes the
// second half: the clone's `name`, which is the field codegen derives asset
// identity from, must get the same treatment so the exported step and its
// source Instrument don't claim the same identity in generated code.
describe('suffixForStepExport — Export-Step naming convention (F-A09-7)', () => {
    it('appends "(Step N)" to a base name', () => {
        expect(suffixForStepExport('Bass', 3)).toBe('Bass (Step 3)');
    });

    it('produces a distinct string from the original for any step', () => {
        const base = 'Lead';
        expect(suffixForStepExport(base, 1)).not.toBe(base);
    });
});
