// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import ExamplesModal from '../../components/ExamplesModal';
import { ExampleItem } from '../../definitions/examples';

afterEach(cleanup);

const mockExamples: ExampleItem[] = [
    {
        id: 'songs/full/four-bar-song.skald.json',
        name: 'Four Bar Song',
        category: 'Songs & Loops',
        categoryKey: 'songs',
        subcategory: 'Full',
        path: 'songs/full/four-bar-song.skald.json',
    },
    {
        id: 'instruments/leads/saw-lead.skald.json',
        name: 'Saw Lead',
        category: 'Instruments',
        categoryKey: 'instruments',
        subcategory: 'Leads',
        path: 'instruments/leads/saw-lead.skald.json',
    },
    {
        id: 'snes-kit/songs/space-funk.skald.json',
        name: 'Space Funk',
        category: 'SNES Kit',
        categoryKey: 'snes-kit',
        subcategory: 'Songs',
        path: 'snes-kit/songs/space-funk.skald.json',
    },
    {
        id: 'sound-effects/synth/LaserPew.json',
        name: 'Laser Pew',
        category: 'Sound Effects',
        categoryKey: 'sound-effects',
        subcategory: 'Synth',
        path: 'sound-effects/synth/LaserPew.json',
    },
];

describe('ExamplesModal', () => {
    let listExamples: ReturnType<typeof vi.fn>;
    let loadExample: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        listExamples = vi.fn().mockResolvedValue(mockExamples);
        loadExample = vi.fn().mockResolvedValue({ content: JSON.stringify({ nodes: [] }) });
        (window as unknown as { electron: unknown }).electron = {
            listExamples,
            loadExample,
        };
    });

    it('does not render when isOpen is false', () => {
        const { container } = render(
            <ExamplesModal
                isOpen={false}
                onClose={vi.fn()}
                onLoadExample={vi.fn()}
                onImportExample={vi.fn()}
            />
        );
        expect(container.firstChild).toBeNull();
    });

    it('renders examples and categories when open', async () => {
        render(
            <ExamplesModal
                isOpen={true}
                onClose={vi.fn()}
                onLoadExample={vi.fn()}
                onImportExample={vi.fn()}
            />
        );

        await waitFor(() => {
            expect(screen.getByText('Four Bar Song')).toBeTruthy();
            expect(screen.getByText('Saw Lead')).toBeTruthy();
            expect(screen.getByText('Space Funk')).toBeTruthy();
            expect(screen.getByText('Laser Pew')).toBeTruthy();
        });
    });

    it('filters examples by search query', async () => {
        render(
            <ExamplesModal
                isOpen={true}
                onClose={vi.fn()}
                onLoadExample={vi.fn()}
                onImportExample={vi.fn()}
            />
        );

        await waitFor(() => expect(screen.getByText('Saw Lead')).toBeTruthy());

        const searchInput = screen.getByPlaceholderText('Search presets...');
        fireEvent.change(searchInput, { target: { value: 'funk' } });

        expect(screen.getByText('Space Funk')).toBeTruthy();
        expect(screen.queryByText('Saw Lead')).toBeNull();
        expect(screen.queryByText('Laser Pew')).toBeNull();
    });

    it('filters examples by category tab', async () => {
        render(
            <ExamplesModal
                isOpen={true}
                onClose={vi.fn()}
                onLoadExample={vi.fn()}
                onImportExample={vi.fn()}
            />
        );

        await waitFor(() => expect(screen.getByText('Four Bar Song')).toBeTruthy());

        const sfxTab = screen.getByText('💥 Sound Effects');
        fireEvent.click(sfxTab);

        expect(screen.getByText('Laser Pew')).toBeTruthy();
        expect(screen.queryByText('Four Bar Song')).toBeNull();
        expect(screen.queryByText('Saw Lead')).toBeNull();
    });

    it('loads an example project on click', async () => {
        const onLoadExample = vi.fn();
        const onClose = vi.fn();

        render(
            <ExamplesModal
                isOpen={true}
                onClose={onClose}
                onLoadExample={onLoadExample}
                onImportExample={vi.fn()}
            />
        );

        await waitFor(() => expect(screen.getByText('Saw Lead')).toBeTruthy());

        const loadButtons = screen.getAllByText('Load Project');
        fireEvent.click(loadButtons[1]); // Saw Lead

        await waitFor(() => {
            expect(loadExample).toHaveBeenCalledWith('instruments/leads/saw-lead.skald.json');
            expect(onLoadExample).toHaveBeenCalledWith(JSON.stringify({ nodes: [] }), 'Saw Lead');
            expect(onClose).toHaveBeenCalled();
        });
    });

    it('imports an example patch on click', async () => {
        const onImportExample = vi.fn();
        const onClose = vi.fn();

        render(
            <ExamplesModal
                isOpen={true}
                onClose={onClose}
                onLoadExample={vi.fn()}
                onImportExample={onImportExample}
            />
        );

        await waitFor(() => expect(screen.getByText('Saw Lead')).toBeTruthy());

        const importButtons = screen.getAllByText('Import Patch');
        fireEvent.click(importButtons[0]); // Four Bar Song

        await waitFor(() => {
            expect(loadExample).toHaveBeenCalledWith('songs/full/four-bar-song.skald.json');
            expect(onImportExample).toHaveBeenCalledWith(JSON.stringify({ nodes: [] }), 'Four Bar Song');
            expect(onClose).toHaveBeenCalled();
        });
    });
});
