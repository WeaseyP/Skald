import React, { useRef, useEffect } from 'react';
import { correlation, StereoAnalysers } from '../../utils/meter';
import { SPECTROGRAM_PALETTE, binsForLogFrequencyRows, nextSpectrogramColumn } from '../../utils/spectrogram';

/** E9 (roadmap 0.2 §9.4 item 3): one of four ways to look at the same tap.
 *  A single-select mode, not the old `showSpectrum`/`showOscilloscope` pair —
 *  the whole point of a selector is that exactly one view occupies the
 *  canvas at a time. */
export type VisualizerMode = 'oscilloscope' | 'spectrum' | 'spectrogram' | 'correlation';

interface AudioVisualizerProps {
    analyser: AnalyserNode | null;
    /** The stereo tap `correlation` mode reads. Same shape PeakMeter already
     *  reads (`meterAnalysers` off useWasmAudioEngine, via GraphActionsContext
     *  in this component's caller) — a second, independently-wired stereo tap
     *  would be a second thing that could disagree with the meter about what
     *  "stereo" means for this project (CLAUDE.md's "one reader"). Optional:
     *  a caller that never shows correlation mode need not wire it up. */
    stereoAnalysers?: StereoAnalysers | null;
    width?: number;
    height?: number;
    mode?: VisualizerMode;
    /** Renders the mode-selector row when supplied; omit for a read-only
     *  visualizer pinned to one mode (e.g. an isolated preview). */
    onModeChange?: (mode: VisualizerMode) => void;
}

const MODE_BUTTONS: ReadonlyArray<{ id: VisualizerMode; label: string; title: string }> = [
    { id: 'oscilloscope', label: '∿', title: 'Oscilloscope (time domain)' },
    { id: 'spectrum', label: '▤', title: 'Spectrum (FFT bars)' },
    { id: 'spectrogram', label: '▨', title: 'Spectrogram (scrolling waterfall, log-frequency axis)' },
    { id: 'correlation', label: 'Φ', title: 'Phase correlation (stereo goniometer + correlation meter)' },
];

const BG = 'rgba(20, 20, 20, 1)';
// Caps how many of a big fftSize's samples the goniometer scatters per frame
// — the shape it draws is a Lissajous figure over the WHOLE window either
// way, so subsampling a 2048-sample buffer down to ~512 points changes
// density, not the picture, for a canvas this size.
const MAX_GONIOMETER_POINTS = 512;

export const AudioVisualizer: React.FC<AudioVisualizerProps> = ({
    analyser,
    stereoAnalysers = null,
    width = 300,
    height = 100,
    mode = 'oscilloscope',
    onModeChange,
}) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const requestRef = useRef<number | undefined>(undefined);
    const spectrogramColumn = useRef(0);

    useEffect(() => {
        if (!analyser || !canvasRef.current) return;

        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        if (typeof analyser.getByteTimeDomainData !== 'function') {
            // Invalid analyser prop (likely during init or HMR), just return silently
            return;
        }

        // Data Arrays. These are NOT the same size (F-B08-9): the time-domain
        // waveform has fftSize samples (2048), while the spectrum has
        // frequencyBinCount bins (fftSize/2 = 1024). Sizing both from
        // frequencyBinCount drew the oscilloscope from only the first HALF of
        // the analysis window — half the samples it should show.
        const timeLength = analyser.fftSize;
        const freqLength = analyser.frequencyBinCount;
        const dataArrayTime = new Uint8Array(timeLength);
        const dataArrayFreq = new Uint8Array(freqLength);

        // Spectrogram's log-frequency row lookup: built once per (analyser,
        // height) pair, never inside the render loop (SKB-053's lesson from
        // the worklet applies to a 60fps canvas loop just as much as to a
        // per-sample DSP one).
        const sampleRate = analyser.context?.sampleRate ?? 48000;
        const binForRow = binsForLogFrequencyRows(height, freqLength, sampleRate);
        spectrogramColumn.current = 0;

        // Correlation's stereo buffers: allocated once here, same discipline
        // as PeakMeter's bufL/bufR, not once per frame.
        const left = stereoAnalysers?.left ?? null;
        const right = stereoAnalysers?.right ?? null;
        const canCorrelate = !!left && !!right
            && typeof left.getFloatTimeDomainData === 'function'
            && typeof right.getFloatTimeDomainData === 'function';
        const bufL = canCorrelate ? new Float32Array(left!.fftSize) : new Float32Array(0);
        const bufR = canCorrelate ? new Float32Array(right!.fftSize) : new Float32Array(0);
        const goniometerStep = canCorrelate ? Math.max(1, Math.floor(bufL.length / MAX_GONIOMETER_POINTS)) : 1;

        // One clear before the loop starts, not one per frame: the
        // spectrogram builds its picture ACROSS frames (a scrolling
        // waterfall) — clearing on every tick the way the other three modes
        // do would erase each column before it was ever visible.
        ctx.fillStyle = BG;
        ctx.fillRect(0, 0, width, height);

        const drawOscilloscope = () => {
            analyser.getByteTimeDomainData(dataArrayTime);
            ctx.fillStyle = BG;
            ctx.fillRect(0, 0, width, height);
            ctx.lineWidth = 2;
            ctx.strokeStyle = '#00ffcc';
            ctx.beginPath();
            const sliceWidth = width * 1.0 / timeLength;
            let x = 0;
            for (let i = 0; i < timeLength; i++) {
                const v = dataArrayTime[i] / 128.0;
                const y = v * height / 2;
                if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
                x += sliceWidth;
            }
            ctx.lineTo(canvas.width, canvas.height / 2);
            ctx.stroke();
        };

        const drawSpectrum = () => {
            analyser.getByteFrequencyData(dataArrayFreq);
            ctx.fillStyle = BG;
            ctx.fillRect(0, 0, width, height);
            const barWidth = (width / freqLength) * 2.5;
            let x = 0;
            for (let i = 0; i < freqLength; i++) {
                const barHeight = dataArrayFreq[i] / 255 * height;
                // Gradient Color based on frequency/amplitude
                const r = barHeight + (25 * (i / freqLength));
                const g = 250 * (i / freqLength);
                const b = 50;
                ctx.fillStyle = `rgb(${r},${g},${b})`;
                ctx.fillRect(x, height - barHeight, barWidth, barHeight);
                x += barWidth + 1;
                if (x > width) break; // Optimization
            }
        };

        const drawSpectrogramColumn = () => {
            analyser.getByteFrequencyData(dataArrayFreq);
            const x = spectrogramColumn.current;
            for (let y = 0; y < binForRow.length; y++) {
                ctx.fillStyle = SPECTROGRAM_PALETTE[dataArrayFreq[binForRow[y]]];
                ctx.fillRect(x, y, 1, 1);
            }
            spectrogramColumn.current = nextSpectrogramColumn(x, width);
        };

        const METER_BAR_HEIGHT = 14; // reserved strip at the bottom for the -1..+1 correlation meter
        const drawCorrelation = () => {
            ctx.fillStyle = BG;
            ctx.fillRect(0, 0, width, height);

            const plotHeight = Math.max(1, height - METER_BAR_HEIGHT);
            let corr = 0;
            if (canCorrelate) {
                left!.getFloatTimeDomainData(bufL);
                right!.getFloatTimeDomainData(bufR);
                corr = correlation(bufL, bufR);

                // Goniometer: classic 45-degree rotation so identical L/R
                // (mono) draws a VERTICAL line, the orientation a sound
                // designer trained on a hardware phase scope expects — a
                // plain L-on-x/R-on-y scatter reads mono as a diagonal, which
                // is correct but unfamiliar.
                const midX = width / 2;
                const midY = plotHeight / 2;
                const scale = Math.min(width, plotHeight) / 2 * 0.9;
                ctx.fillStyle = '#00ffcc';
                for (let i = 0; i < bufL.length; i += goniometerStep) {
                    const l = bufL[i];
                    const r = bufR[i];
                    const gx = (r - l) * Math.SQRT1_2;
                    const gy = -(r + l) * Math.SQRT1_2;
                    ctx.fillRect(midX + gx * scale, midY + gy * scale, 1, 1);
                }
            }

            // -1..+1 correlation meter bar under the scatter.
            const barY = height - METER_BAR_HEIGHT + 4;
            ctx.fillStyle = '#333';
            ctx.fillRect(4, barY, width - 8, 6);
            const markerX = 4 + ((corr + 1) / 2) * (width - 8);
            ctx.fillStyle = corr < 0 ? '#e74c3c' : '#2ecc71';
            ctx.fillRect(markerX - 2, barY - 2, 4, 10);
            ctx.fillStyle = '#ccc';
            ctx.font = '9px monospace';
            ctx.fillText(canCorrelate ? corr.toFixed(2) : 'no stereo tap', 4, barY - 4);
        };

        const render = () => {
            switch (mode) {
                case 'oscilloscope': drawOscilloscope(); break;
                case 'spectrum': drawSpectrum(); break;
                case 'spectrogram': drawSpectrogramColumn(); break;
                case 'correlation': drawCorrelation(); break;
            }
            requestRef.current = requestAnimationFrame(render);
        };

        render();

        return () => {
            if (requestRef.current) cancelAnimationFrame(requestRef.current);
        };
    }, [analyser, stereoAnalysers, width, height, mode]);

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <div style={{ display: 'flex', gap: 2 }} role="group" aria-label="Visualizer mode">
                {MODE_BUTTONS.map(m => (
                    <button
                        key={m.id}
                        type="button"
                        data-testid={`visualizer-mode-${m.id}`}
                        title={m.title}
                        aria-pressed={mode === m.id}
                        onClick={() => onModeChange?.(m.id)}
                        style={{
                            flex: 1, fontSize: 9, lineHeight: '12px', padding: '1px 0',
                            border: '1px solid #333', borderRadius: 2, cursor: 'pointer',
                            background: mode === m.id ? '#2a2a2a' : '#141414',
                            color: mode === m.id ? '#00ffcc' : '#888',
                        }}
                    >
                        {m.label}
                    </button>
                ))}
            </div>
            <canvas
                ref={canvasRef}
                width={width}
                height={height}
                style={{ borderRadius: '4px', border: '1px solid #333' }}
            />
        </div>
    );
};
