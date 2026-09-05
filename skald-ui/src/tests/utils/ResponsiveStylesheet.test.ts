/*
 * Roadmap E13, the drift guard.
 *
 * `responsive.css` and `useViewport.ts` describe the same two facts — "narrow"
 * and "coarse pointer". The moment the stylesheet states them a second time,
 * as its own `@media (max-width: …)` or `@media (pointer: coarse)` block, the
 * two readers are free to disagree: a 720px breakpoint in the hook and a 768px
 * one in CSS gives a window where the components lay out for a phone and the
 * hit areas do not. That is the SKB-002 class, and it is invisible in every
 * jsdom test because jsdom does not evaluate media queries at all.
 *
 * So the contract is structural: the stylesheet selects on the `data-pointer`
 * / `data-viewport` attributes the hook stamps, and contains no width- or
 * pointer-keyed media query of its own. `prefers-reduced-motion` is allowed —
 * it is a user preference the hook has no opinion about.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { findRepoRoot } from '../contracts/paramRangeDump';

// Same root-finder the param-range contract uses, for the same reason: vitest
// is normally invoked from skald-ui/ but need not be.
const source = readFileSync(
    path.join(findRepoRoot(), 'skald-ui', 'src', 'styles', 'responsive.css'),
    'utf-8',
);

// The rules only. The prose in this file explains why a `@media (pointer:
// coarse)` block would be wrong, and a scan that counted that sentence as one
// would be reporting on its own documentation.
const css = source.replace(/\/\*[\s\S]*?\*\//g, '');

describe('responsive.css', () => {
    it('never restates a breakpoint the hook already owns', () => {
        const mediaQueries = css.match(/@media[^{]*/g) ?? [];
        for (const query of mediaQueries) {
            expect(query).not.toMatch(/width|pointer|hover|orientation/);
        }
    });

    it('drives the coarse-pointer rules from the attribute the hook stamps', () => {
        expect(css).toContain('[data-pointer="coarse"] .react-flow__handle::after');
        expect(css).toContain('.skald-slider[data-pointer="coarse"]');
    });

    it('gives node ports the 24px hit area the WCAG target-size floor asks for', () => {
        const handleRule = css.slice(css.indexOf('[data-pointer="coarse"] .react-flow__handle::after'));
        const block = handleRule.slice(0, handleRule.indexOf('}'));
        expect(block).toMatch(/width:\s*24px/);
        expect(block).toMatch(/height:\s*24px/);
    });
});
