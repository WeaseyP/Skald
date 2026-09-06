// @vitest-environment node
//
// Roadmap packet B6-5. The Help menu is built from a pure template so its
// labels and wiring can be checked here; main.ts injects the three actions.
import { describe, expect, it, vi } from 'vitest';
import type { MenuItemConstructorOptions } from 'electron';
import { aboutText, buildHelpMenu, MANUAL_FALLBACK_URL, resolveManualPath } from '../../main/helpMenu';

const submenuOf = (menu: MenuItemConstructorOptions): MenuItemConstructorOptions[] =>
    menu.submenu as MenuItemConstructorOptions[];

describe('buildHelpMenu', () => {
    it('offers Manual, Examples folder and About, wired to the injected actions', () => {
        const actions = { openManual: vi.fn(), openExamplesFolder: vi.fn(), showAbout: vi.fn() };
        const menu = buildHelpMenu(actions);
        expect(menu.label).toBe('Help');
        const labels = submenuOf(menu).map((i) => i.label ?? i.type);
        expect(labels).toEqual(['User Manual', 'Open Examples Folder', 'separator', 'About Skald']);

        const click = (label: string) => {
            const item = submenuOf(menu).find((i) => i.label === label)!;
            (item.click as () => void)();
        };
        click('User Manual');
        click('Open Examples Folder');
        click('About Skald');
        expect(actions.openManual).toHaveBeenCalledTimes(1);
        expect(actions.openExamplesFolder).toHaveBeenCalledTimes(1);
        expect(actions.showAbout).toHaveBeenCalledTimes(1);
    });

    it('binds F1 to the manual', () => {
        const menu = buildHelpMenu({ openManual: vi.fn(), openExamplesFolder: vi.fn(), showAbout: vi.fn() });
        expect(submenuOf(menu).find((i) => i.label === 'User Manual')?.accelerator).toBe('F1');
    });
});

describe('resolveManualPath', () => {
    it('returns the first existing candidate, else null so the caller opens the fallback URL', () => {
        expect(resolveManualPath(['a', 'b', 'c'], (p) => p === 'b')).toBe('b');
        expect(resolveManualPath(['a', 'b'], () => false)).toBeNull();
        expect(MANUAL_FALLBACK_URL).toMatch(/^https:\/\/github\.com\/.*manual-source$/);
    });
});

describe('aboutText', () => {
    const base = { appVersion: '0.1.0', electronVersion: '43.0.0', chromeVersion: '140.0.0.0', nodeVersion: '22.16.0' };

    it('carries the app and runtime versions and the codegen digest', () => {
        const text = aboutText({ ...base, codegen: { ok: true, digest: 'fnv1a64:00000000deadbeef', verified: true } });
        expect(text).toContain('Skald 0.1.0');
        expect(text).toContain('Electron 43.0.0');
        expect(text).toContain('fnv1a64:00000000deadbeef');
        expect(text).toContain('verified against the skald-backend sources');
    });

    it('says when the stamp could not be verified, and when the generator is unusable', () => {
        expect(aboutText({ ...base, codegen: { ok: true, digest: 'fnv1a64:1', verified: false } })).toContain('no backend sources here to verify');
        expect(aboutText({ ...base, codegen: { ok: false, message: 'skald_codegen.exe is missing' } })).toContain('skald_codegen.exe is missing');
    });
});
