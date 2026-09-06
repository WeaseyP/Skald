// @vitest-environment jsdom
//
// Roadmap packet B6-7. The primary button said "Generate Code" from the days
// when pressing it was the only way to run the generator. Since the WASM
// preview (Play) has compiled and run the real generated code on every edit,
// the button's only remaining job is to write that code to the chosen output
// file — so it says so, and its tooltip says why that is not a different code
// path from what the user has been hearing.
import React from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import Sidebar from '../../components/Sidebar';

afterEach(cleanup);

const noop = () => undefined;

const renderSidebar = () => render(
    <Sidebar
        onGenerate={noop}
        onPlay={noop}
        onStop={noop}
        isPlaying={false}
        onSave={noop}
        onLoad={noop}
        onImport={noop}
        onCreateInstrument={noop}
        onCreateGroup={noop}
        canCreateInstrument={false}
        bpm={120}
        onBpmChange={noop}
        isLooping={false}
        onLoopToggle={noop}
        onExplodeInstrument={noop}
        canExplodeInstrument={false}
        packageName="generated_audio"
        onPackageNameChange={noop}
        outputPath=""
        onSelectOutputPath={noop}
        onUndo={noop}
        onRedo={noop}
        canUndo={false}
        canRedo={false}
        undoDepth={0}
        redoDepth={0}
        undoLabel={null}
        redoLabel={null}
    />
);

describe('the export button (B6-7)', () => {
    it('is labelled Download Code, not Generate Code', () => {
        renderSidebar();
        expect(screen.queryByRole('button', { name: 'Generate Code' })).toBeNull();
        const button = screen.getByRole('button', { name: 'Download Code' });
        // The tooltip carries the reason the rename is honest: the preview
        // already runs this exact code, the button only writes it out.
        expect(button.title).toMatch(/preview already runs/i);
        expect(button.title).toMatch(/\.odin/);
    });
});
