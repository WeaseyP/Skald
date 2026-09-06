// @vitest-environment jsdom
//
// Roadmap G1/G2 (§9.12) — the sidebar's bounce affordances.
//
// The render is faster than realtime but it is not instant: a 64-bar bounce
// with stems is N+1 full passes, and the one thing that must never happen is
// a click that looks like nothing happened. So the busy state is asserted
// here as a user-visible fact (the button says what it is doing and refuses a
// second click) rather than left to a boolean nobody renders.
import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, fireEvent } from '@testing-library/react';
import Sidebar from '../../components/Sidebar';

afterEach(cleanup);

const noop = () => undefined;

const renderSidebar = (props: Record<string, unknown> = {}) => render(
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
        {...props}
    />
);

describe('Bounce to WAV', () => {
    it('is absent when the host has not wired a bounce, so nothing offers a button that does nothing', () => {
        renderSidebar();
        expect(screen.queryByRole('button', { name: /bounce to wav/i })).toBeNull();
    });

    it('bounces the bar count shown, and says whether the tail is included', () => {
        const onBounce = vi.fn();
        renderSidebar({ onBounce, defaultBounceBars: 4 });

        const bars = screen.getByLabelText('Bars to bounce') as HTMLInputElement;
        expect(bars.value).toBe('4');
        fireEvent.click(screen.getByRole('button', { name: /bounce to wav/i }));

        expect(onBounce).toHaveBeenCalledWith({ bars: 4, includeTail: true });
    });

    it('bounces without the tail when the user unticks it', () => {
        const onBounce = vi.fn();
        renderSidebar({ onBounce, defaultBounceBars: 2 });

        fireEvent.click(screen.getByLabelText(/include tail/i));
        fireEvent.click(screen.getByRole('button', { name: /bounce to wav/i }));

        expect(onBounce).toHaveBeenCalledWith({ bars: 2, includeTail: false });
    });

    it('keeps the bar count inside the 1..64 range the render core supports', () => {
        const onBounce = vi.fn();
        renderSidebar({ onBounce, defaultBounceBars: 4 });
        const bars = screen.getByLabelText('Bars to bounce') as HTMLInputElement;

        fireEvent.change(bars, { target: { value: '900' } });
        fireEvent.blur(bars);
        fireEvent.click(screen.getByRole('button', { name: /bounce to wav/i }));
        expect(onBounce).toHaveBeenCalledWith({ bars: 64, includeTail: true });

        onBounce.mockClear();
        fireEvent.change(bars, { target: { value: '0' } });
        fireEvent.blur(bars);
        fireEvent.click(screen.getByRole('button', { name: /bounce to wav/i }));
        expect(onBounce).toHaveBeenCalledWith({ bars: 1, includeTail: true });
    });

    it('while a bounce runs, says so, shows how far along it is, and refuses a second click', () => {
        const onBounce = vi.fn();
        renderSidebar({ onBounce, defaultBounceBars: 4, isBouncing: true, bounceProgress: 0.42 });

        const button = screen.getByRole('button', { name: /bouncing/i });
        expect((button as HTMLButtonElement).disabled).toBe(true);
        expect(button.textContent).toContain('42%');

        fireEvent.click(button);
        expect(onBounce).not.toHaveBeenCalled();
    });

    it('offers Cancel only while a bounce is running', () => {
        const onCancelBounce = vi.fn();
        const { rerender } = renderSidebar({ onBounce: noop, onCancelBounce });
        expect(screen.queryByRole('button', { name: /cancel bounce/i })).toBeNull();

        cleanup();
        renderSidebar({ onBounce: noop, onCancelBounce, isBouncing: true });
        fireEvent.click(screen.getByRole('button', { name: /cancel bounce/i }));
        expect(onCancelBounce).toHaveBeenCalled();
        void rerender;
    });
});

describe('Export Stems', () => {
    it('is absent until the host wires stem export', () => {
        renderSidebar({ onBounce: noop });
        expect(screen.queryByRole('button', { name: /export stems/i })).toBeNull();
    });

    it('exports the same bars and tail setting the bounce would use', () => {
        const onExportStems = vi.fn();
        renderSidebar({ onBounce: noop, onExportStems, defaultBounceBars: 8 });

        fireEvent.click(screen.getByLabelText(/include tail/i));
        fireEvent.click(screen.getByRole('button', { name: /export stems/i }));

        expect(onExportStems).toHaveBeenCalledWith({ bars: 8, includeTail: false });
    });

    it('says in its tooltip that mute and solo do not apply, because they do not', () => {
        renderSidebar({ onBounce: noop, onExportStems: noop });
        const button = screen.getByRole('button', { name: /export stems/i });
        expect(button.title).toMatch(/mute and solo are ignored/i);
    });

    it('refuses a click while a bounce is already running', () => {
        const onExportStems = vi.fn();
        renderSidebar({ onBounce: noop, onExportStems, isBouncing: true });
        fireEvent.click(screen.getByRole('button', { name: /export stems/i }));
        expect(onExportStems).not.toHaveBeenCalled();
    });
});
