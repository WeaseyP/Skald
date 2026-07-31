import React, { useRef, useEffect } from 'react';

interface AudioVisualizerProps {
    analyser: AnalyserNode | null;
    width?: number;
    height?: number;
    showSpectrum?: boolean;
    showOscilloscope?: boolean;
}

export const AudioVisualizer: React.FC<AudioVisualizerProps> = ({
    analyser,
    width = 300,
    height = 100,
    showSpectrum = true,
    showOscilloscope = true
}) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const requestRef = useRef<number | undefined>(undefined);

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

        const render = () => {
            // Get Data
            if (showOscilloscope) analyser.getByteTimeDomainData(dataArrayTime);
            if (showSpectrum) analyser.getByteFrequencyData(dataArrayFreq);

            // Clear
            ctx.fillStyle = 'rgba(20, 20, 20, 1)'; // Dark background
            ctx.fillRect(0, 0, width, height);

            // Draw Spectrum
            if (showSpectrum) {
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
            }

            // Draw Oscilloscope
            if (showOscilloscope) {
                ctx.lineWidth = 2;
                ctx.strokeStyle = '#00ffcc'; // Cyan
                ctx.beginPath();

                const sliceWidth = width * 1.0 / timeLength;
                let x = 0;

                for (let i = 0; i < timeLength; i++) {
                    const v = dataArrayTime[i] / 128.0;
                    const y = v * height / 2;

                    if (i === 0) {
                        ctx.moveTo(x, y);
                    } else {
                        ctx.lineTo(x, y);
                    }

                    x += sliceWidth;
                }

                ctx.lineTo(canvas.width, canvas.height / 2);
                ctx.stroke();
            }

            requestRef.current = requestAnimationFrame(render);
        };

        render();

        return () => {
            if (requestRef.current) cancelAnimationFrame(requestRef.current);
        };
    }, [analyser, width, height, showSpectrum, showOscilloscope]);

    return (
        <canvas
            ref={canvasRef}
            width={width}
            height={height}
            style={{ borderRadius: '4px', border: '1px solid #333' }}
        />
    );
};
