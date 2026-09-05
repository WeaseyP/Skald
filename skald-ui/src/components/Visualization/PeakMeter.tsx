import React, { useCallback, useEffect, useRef, useState } from 'react';
import { StereoAnalysers, advanceHold, isClipping, meterFill, peakOf, toDbfs } from '../../utils/meter';

// Roadmap packet B10 — stereo peak-hold meter with a clip LED, in the
// transport dock's Master section. Tapped from the worklet output, which IS
// the mixed, faded, soft-limited signal the export produces (there is no JS
// master gain any more — SKB-011), so what this meter shows is what a game
// gets. Two analysers, not one: an AnalyserNode downmixes to mono. Float
// samples, not bytes: the 8-bit variant cannot represent anything above
// 0 dBFS, so a clip LED driven by it could never light.
//
// Bars and hold ticks are painted by writing styles through refs inside the
// rAF loop rather than through React state — sixty state updates a second
// for two divs is pure overhead. The clip latch IS state, because it changes
// rarely and the LED must re-render when it does.

interface PeakMeterProps {
    analysers: StereoAnalysers | null;
    width?: number;
    height?: number;
}

const fmtDb = (db: number): string => (db === -Infinity ? '-inf' : db.toFixed(1));

const BAR_BG = '#141414';
const BAR_GRADIENT = 'linear-gradient(to top, #2ecc71 0%, #2ecc71 70%, #f1c40f 85%, #e74c3c 100%)';

export const PeakMeter: React.FC<PeakMeterProps> = ({ analysers, width = 100, height = 60 }) => {
    const barL = useRef<HTMLDivElement>(null);
    const barR = useRef<HTMLDivElement>(null);
    const fillL = useRef<HTMLDivElement>(null);
    const fillR = useRef<HTMLDivElement>(null);
    const holdL = useRef<HTMLDivElement>(null);
    const holdR = useRef<HTMLDivElement>(null);

    const [clipLit, setClipLit] = useState(false);
    const clipLatched = useRef(false);
    const holdDb = useRef<[number, number]>([-Infinity, -Infinity]);
    const lastFrameMs = useRef<number | null>(null);
    const rafId = useRef<number | undefined>(undefined);

    // E5 (roadmap 9.9): the DC-blocker/limiter's non-finite flush count.
    // `analysers.nonfiniteCounts` is a REF (useWasmAudioEngine mutates
    // `.current` in place from the worklet's message handler, never replacing
    // it), so this component polls it inside the same rAF tick that already
    // reads the audio buffers below, rather than subscribing to it as a prop
    // change — a count that can move dozens of times a second has no business
    // forcing sixty extra re-renders for a badge nobody is watching that
    // closely. React state here exists ONLY to re-render when the polled
    // value actually changes, same shape as the clip latch above.
    const [nonfiniteTotal, setNonfiniteTotal] = useState(0);
    // Compared against inside the rAF closure below (which is set up once per
    // `analysers` and never sees its own setState calls) — same reason
    // clipLatched sits next to clipLit above, instead of reading state back.
    const lastNonfiniteSeen = useRef(0);

    const resetClip = useCallback(() => {
        clipLatched.current = false;
        setClipLit(false);
    }, []);

    const paint = useCallback((peakL: number, peakR: number, holdDbL: number, holdDbR: number) => {
        const set = (
            bar: HTMLDivElement | null, fill: HTMLDivElement | null, hold: HTMLDivElement | null,
            peak: number, holdValueDb: number,
        ) => {
            if (!bar || !fill || !hold) return;
            bar.setAttribute('data-peak-db', fmtDb(toDbfs(peak)));
            fill.style.height = `${meterFill(peak) * 100}%`;
            const holdFill = meterFill(holdValueDb === -Infinity ? 0 : Math.pow(10, holdValueDb / 20));
            hold.style.bottom = `${holdFill * 100}%`;
            hold.style.visibility = holdFill > 0 ? 'visible' : 'hidden';
        };
        set(barL.current, fillL.current, holdL.current, peakL, holdDbL);
        set(barR.current, fillR.current, holdR.current, peakR, holdDbR);
    }, []);

    useEffect(() => {
        if (!analysers) {
            // Stopped: empty bars, hold reset. The clip latch is deliberately
            // kept — an over that happened before Stop is still information.
            holdDb.current = [-Infinity, -Infinity];
            paint(0, 0, -Infinity, -Infinity);
            // Unlike the clip latch, the non-finite badge does NOT persist
            // across Stop: useWasmAudioEngine resets the count on the next
            // Play (a fresh module has genuinely flushed nothing yet), and a
            // stopped transport showing a warning about audio that is no
            // longer playing is misleading, not informative.
            lastNonfiniteSeen.current = 0;
            setNonfiniteTotal(0);
            return;
        }
        const { left, right } = analysers;
        if (typeof left.getFloatTimeDomainData !== 'function' || typeof right.getFloatTimeDomainData !== 'function') {
            return;
        }
        // Allocated once per analyser, not once per frame (SKB-053's lesson
        // from the worklet applies here too).
        const bufL = new Float32Array(left.fftSize);
        const bufR = new Float32Array(right.fftSize);

        const tick = (nowMs: number) => {
            left.getFloatTimeDomainData(bufL);
            right.getFloatTimeDomainData(bufR);
            const peakL = peakOf(bufL);
            const peakR = peakOf(bufR);
            const dt = lastFrameMs.current === null ? 0 : Math.max(0, (nowMs - lastFrameMs.current) / 1000);
            lastFrameMs.current = nowMs;
            holdDb.current = [
                advanceHold(holdDb.current[0], toDbfs(peakL), dt),
                advanceHold(holdDb.current[1], toDbfs(peakR), dt),
            ];
            if (!clipLatched.current && (isClipping(peakL) || isClipping(peakR))) {
                clipLatched.current = true;
                setClipLit(true);
            }
            // E5: read fresh every tick — this is a plain mutated object, not
            // a subscription, so nothing else will tell this component the
            // value moved.
            const total = analysers.nonfiniteCounts?.current.total ?? 0;
            if (total !== lastNonfiniteSeen.current) {
                lastNonfiniteSeen.current = total;
                setNonfiniteTotal(total);
            }
            paint(peakL, peakR, holdDb.current[0], holdDb.current[1]);
            rafId.current = requestAnimationFrame(tick);
        };
        tick(performance.now());

        return () => {
            if (rafId.current !== undefined) cancelAnimationFrame(rafId.current);
            lastFrameMs.current = null;
        };
    }, [analysers, paint]);

    const barWidth = Math.max(8, Math.floor((width - 36) / 2));
    const barStyle: React.CSSProperties = {
        position: 'relative', width: barWidth, height, backgroundColor: BAR_BG, border: '1px solid #333', overflow: 'hidden',
    };
    const fillStyle: React.CSSProperties = {
        position: 'absolute', left: 0, right: 0, bottom: 0, height: '0%', background: BAR_GRADIENT,
    };
    const holdStyle: React.CSSProperties = {
        position: 'absolute', left: 0, right: 0, height: 2, bottom: '0%', backgroundColor: '#eee', visibility: 'hidden',
    };

    return (
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, width }} title="Peak meter (dBFS), tapped after the master fader and soft limit">
            <div ref={barL} data-testid="peak-meter-left" data-peak-db="-inf" style={barStyle} aria-label="Left peak">
                <div ref={fillL} style={fillStyle} />
                <div ref={holdL} style={holdStyle} />
            </div>
            <div ref={barR} data-testid="peak-meter-right" data-peak-db="-inf" style={barStyle} aria-label="Right peak">
                <div ref={fillR} style={fillStyle} />
                <div ref={holdR} style={holdStyle} />
            </div>
            <button
                type="button"
                data-testid="clip-led"
                data-lit={clipLit ? 'true' : 'false'}
                onClick={resetClip}
                title={clipLit
                    ? 'A sample reached or exceeded 0 dBFS since the LED was last cleared. Click to clear.'
                    : 'Clip indicator: lights when any sample reaches 0 dBFS and stays lit until clicked.'}
                style={{
                    width: 22, height: 14, padding: 0, border: '1px solid #444', borderRadius: 2, cursor: 'pointer',
                    fontSize: 8, fontWeight: 'bold', lineHeight: '12px',
                    backgroundColor: clipLit ? '#ff2a2a' : '#3a1111', color: clipLit ? '#fff' : '#7a4a4a',
                    boxShadow: clipLit ? '0 0 6px #ff2a2a' : 'none',
                }}
            >
                CLIP
            </button>
            {nonfiniteTotal > 0 && (
                // E5 (roadmap 9.9): a fault the CLIP LED cannot show any more —
                // the backend now flushes every NaN/Inf sample to silence
                // before it reaches this meter's analyser tap (see meter.ts's
                // note on peakOf), so an unstable patch that used to read as a
                // stuck-lit clip LED would otherwise just look quiet.
                <div
                    data-testid="nonfinite-warning"
                    title={`${nonfiniteTotal} non-finite (NaN/Inf) sample${nonfiniteTotal === 1 ? '' : 's'} flushed to silence by the DC-blocker/limiter since Play — the patch is producing invalid audio somewhere.`}
                    style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        height: 14, padding: '0 5px', borderRadius: 2, border: '1px solid #a8720f',
                        backgroundColor: 'rgba(178,120,25,0.95)', color: '#fff',
                        fontSize: 9, fontWeight: 'bold', lineHeight: '12px', whiteSpace: 'nowrap',
                    }}
                >
                    ⚠ {nonfiniteTotal}
                </div>
            )}
        </div>
    );
};
