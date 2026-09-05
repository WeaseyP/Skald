import React, { useState, useRef, useCallback, useEffect } from 'react';
import { formatDisplayValue } from '../../utils/formatDisplayValue';

// --- PROPS INTERFACE ---

interface AdsrData {
    attack: number;
    decay: number;
    sustain: number;
    release: number;
    // Roadmap E8 (9.4 item 2): per-stage curve tension, -1..1, 0 = linear.
    attackCurve: number;
    decayCurve: number;
    releaseCurve: number;
}

interface AdsrEnvelopeEditorProps {
    value: AdsrData;
    onChange: (newValue: AdsrData) => void;
    width?: number;
    height?: number;
    maxTime?: number; // Maximum time for the envelope's x-axis in seconds
}

// --- CURVE MATH ---
//
// Mirrors skald_adsr_warp (skald-backend/core/codegen_project.odin::
// emit_adsr_warp_proc) verbatim, case-by-case, per CLAUDE.md's "mirror
// against the source" rule: (1-exp(-k*t))/(1-exp(-k)), k = c*6.0, c==0 => t.
// If that emitter's formula changes, this copy must change with it — the
// whole point of drawing the curve here at all is that a dragged handle
// previews the EXACT shape the export plays, not an approximation of it.
export const warpT = (t: number, c: number): number => {
    if (c === 0) return t;
    const k = c * 6.0;
    return (1 - Math.exp(-k * t)) / (1 - Math.exp(-k));
};

// Inverse of warpT at t=0.5 only — enough for a midpoint tension handle,
// which is the one point on the curve a drag actually targets. warpT(0.5, c)
// is monotonic increasing in c over [-1,1] (from ~0.0475 at c=-1 through 0.5
// at c=0 to ~0.9525 at c=1), so plain bisection is exact enough in a handful
// of iterations — no closed-form inverse exists because c appears inside
// both the numerator's and denominator's exponent.
export const invertWarpAtHalf = (targetFraction: number): number => {
    const target = Math.max(0.001, Math.min(0.999, targetFraction));
    let lo = -1, hi = 1;
    for (let i = 0; i < 30; i++) {
        const mid = (lo + hi) / 2;
        if (warpT(0.5, mid) < target) lo = mid; else hi = mid;
    }
    return (lo + hi) / 2;
};

// --- STYLES ---

const containerStyle: React.CSSProperties = {
    touchAction: 'none',
    WebkitUserSelect: 'none',
    userSelect: 'none',
    cursor: 'default',
    padding: '10px',
    background: '#252526',
    borderRadius: '8px',
};

const pointStyle: React.CSSProperties = {
    cursor: 'move',
    fill: '#3182CE',
    stroke: '#E2E8F0',
    strokeWidth: 2,
    transition: 'r 0.1s ease-in-out',
};

// E8: the tension handles get their own fill so they read as a DIFFERENT
// kind of control from the timing/level points above — dragging one reshapes
// the ramp between two fixed points rather than moving an endpoint.
const curvePointStyle: React.CSSProperties = {
    cursor: 'ns-resize',
    fill: '#D69E2E',
    stroke: '#E2E8F0',
    strokeWidth: 2,
    transition: 'r 0.1s ease-in-out',
};

const lineStyle: React.CSSProperties = {
    fill: 'none',
    stroke: '#4A5568',
    strokeWidth: 2,
};

const fillStyle: React.CSSProperties = {
    fill: 'rgba(66, 153, 225, 0.3)',
};

const textLabelStyle: React.CSSProperties = {
    fill: '#A0AEC0',
    fontSize: '11px',
    textAnchor: 'middle',
    pointerEvents: 'none',
};

const readoutContainerStyle: React.CSSProperties = {
    display: 'flex',
    justifyContent: 'space-around',
    marginTop: '10px',
    fontFamily: 'monospace',
    fontSize: '12px',
    color: '#E0E0E0',
};

// Number of line segments per curved stage. High enough that a strong curve
// (|c| near 1, all its shape change compressed into the first/last few
// percent of t) still reads as smooth, cheap enough to recompute on every
// drag frame without profiling.
const CURVE_SAMPLES = 24;

// One ADSR stage's ramp, in (x, level) space: `level(t)` maps t in [0,1] to
// the 0..1 (or sustain..0, etc — whatever the stage's own range is) level
// this stage actually plays at that fraction of its own duration. Same
// shape for all three stages so sampledSegmentPath below does not need to
// know which stage it is drawing.
type StageRamp = { x0: number; x1: number; levelAt: (t: number) => number };

// --- MAIN COMPONENT ---

export const AdsrEnvelopeEditor: React.FC<AdsrEnvelopeEditorProps> = ({
    value,
    onChange,
    width = 300,
    height = 150,
    maxTime = 4.0, // Default max time of 4 seconds
}) => {
    const svgRef = useRef<SVGSVGElement>(null);
    const [draggedPoint, setDraggedPoint] = useState<string | null>(null);
    const valueRef = useRef(value);
    valueRef.current = value;

    const yPadding = 10;
    const visualHoldDuration = 0.1; // Sustain phase will be 10% of the graph width

    // --- Coordinate Scaling ---
    const scaleX = (time: number) => (time / maxTime) * width;
    const scaleY = (level: number) => (height - yPadding * 2) * (1 - level) + yPadding;
    const levelAtY = (posY: number) => 1 - ((posY - yPadding) / (height - yPadding * 2));
    const timeAtX = (posX: number) => (posX / width) * maxTime;

    const { attack, decay, sustain, release, attackCurve, decayCurve, releaseCurve } = value;

    // Calculate positions based on A, D, R times and a fixed visual sustain period
    const sustainStartTime = attack + decay;
    const sustainEndTime = sustainStartTime + (maxTime * visualHoldDuration);
    const releaseEndTime = sustainEndTime + release;

    const points = {
        p1: { x: 0, y: height - yPadding },
        p2: { x: scaleX(attack), y: yPadding },
        p3: { x: scaleX(sustainStartTime), y: scaleY(sustain) },
        p4: { x: scaleX(sustainEndTime), y: scaleY(sustain) },
        p5: { x: scaleX(releaseEndTime), y: height - yPadding },
    };

    // E8: each stage's level(t) mirrors its emitted Odin line exactly —
    // attack rises 0->1 via warpT alone; decay falls 1->sustain via
    // 1-warpT*(1-sustain); release falls sustain->0 via sustain*(1-warpT),
    // assuming (as the static preview must) that release begins right at
    // the visual sustain plateau, same as the existing straight-line release
    // always assumed. At c=0 every one of these degenerates to EXACTLY the
    // pre-E8 straight line, so a patch with no curve draws pixel-identical
    // to before this packet.
    const attackRamp: StageRamp = { x0: points.p1.x, x1: points.p2.x, levelAt: (t) => warpT(t, attackCurve) };
    const decayRamp: StageRamp = { x0: points.p2.x, x1: points.p3.x, levelAt: (t) => 1 - warpT(t, decayCurve) * (1 - sustain) };
    const releaseRamp: StageRamp = { x0: points.p4.x, x1: points.p5.x, levelAt: (t) => sustain * (1 - warpT(t, releaseCurve)) };

    const sampledSegmentPath = (ramp: StageRamp): string => {
        const parts: string[] = [];
        for (let i = 1; i <= CURVE_SAMPLES; i++) {
            const t = i / CURVE_SAMPLES;
            const x = ramp.x0 + t * (ramp.x1 - ramp.x0);
            const y = scaleY(ramp.levelAt(t));
            parts.push(`L ${x},${y}`);
        }
        return parts.join(' ');
    };

    const pathData = [
        `M ${points.p1.x},${points.p1.y}`,
        sampledSegmentPath(attackRamp),
        sampledSegmentPath(decayRamp),
        `L ${points.p4.x},${points.p4.y}`,
        sampledSegmentPath(releaseRamp),
    ].join(' ');
    const fillPathData = `${pathData} L ${scaleX(maxTime)},${height} L 0,${height} Z`;

    // Midpoint tension handles sit at each stage's own t=0.5, at the CURVED
    // (not linear) level — dragging one reads back exactly where it is drawn.
    const curvePoints = {
        attack: { x: attackRamp.x0 + 0.5 * (attackRamp.x1 - attackRamp.x0), y: scaleY(attackRamp.levelAt(0.5)) },
        decay: { x: decayRamp.x0 + 0.5 * (decayRamp.x1 - decayRamp.x0), y: scaleY(decayRamp.levelAt(0.5)) },
        release: { x: releaseRamp.x0 + 0.5 * (releaseRamp.x1 - releaseRamp.x0), y: scaleY(releaseRamp.levelAt(0.5)) },
    };

    const handleMouseDown = (e: React.MouseEvent, pointName: string) => {
        e.preventDefault();
        setDraggedPoint(pointName);
    };

    const handleMouseUp = useCallback(() => {
        setDraggedPoint(null);
    }, []);

    const handleMouseMove = useCallback((e: MouseEvent) => {
        if (!draggedPoint || !svgRef.current) return;
        e.preventDefault();

        const rect = svgRef.current.getBoundingClientRect();
        const x = Math.max(0, Math.min(width, e.clientX - rect.left));
        const y = Math.max(yPadding, Math.min(height - yPadding, e.clientY - rect.top));

        const newValues = { ...valueRef.current };

        switch (draggedPoint) {
            case 'attack': { // P2
                newValues.attack = Math.max(0.001, timeAtX(x));
                // Prevent attack from overlapping decay
                if (newValues.attack + newValues.decay > maxTime) {
                    newValues.decay = maxTime - newValues.attack;
                }
                break;
            }
            case 'decay': { // P3
                const decayEndTime = timeAtX(x);
                newValues.decay = Math.max(0.001, decayEndTime - newValues.attack);
                newValues.sustain = Math.max(0, Math.min(1, levelAtY(y)));
                break;
            }
            case 'release': { // P5
                const releaseStartTime = newValues.attack + newValues.decay + (maxTime * visualHoldDuration);
                newValues.release = Math.max(0.001, timeAtX(x) - releaseStartTime);
                break;
            }
            // E8: the three tension handles. Vertical-only — dragging one
            // reshapes its stage's ramp, never its duration or its target
            // level, both of which stay owned by the point above it.
            case 'attackCurve': {
                // level(0.5) = warpT(0.5, c) directly: the target fraction IS
                // the desired warp value, no algebra needed.
                newValues.attackCurve = invertWarpAtHalf(levelAtY(y));
                break;
            }
            case 'decayCurve': {
                // level(0.5) = 1 - warpT(0.5,c)*(1-sustain) => warpT(0.5,c) =
                // (1-level)/(1-sustain). A sustain pinned at 1 collapses the
                // decay stage to zero visual range (p2 and p3 coincide) —
                // there is nothing to drag, so leave the curve alone rather
                // than divide by zero.
                const span = 1 - newValues.sustain;
                if (span > 0.0001) {
                    const desiredLevel = levelAtY(y);
                    newValues.decayCurve = invertWarpAtHalf((1 - desiredLevel) / span);
                }
                break;
            }
            case 'releaseCurve': {
                // level(0.5) = sustain*(1-warpT(0.5,c)) => warpT(0.5,c) =
                // 1 - level/sustain. A sustain of exactly 0 collapses the
                // release stage the same way decay collapses at sustain=1.
                if (newValues.sustain > 0.0001) {
                    const desiredLevel = levelAtY(y);
                    newValues.releaseCurve = invertWarpAtHalf(1 - desiredLevel / newValues.sustain);
                }
                break;
            }
        }
        onChange(newValues);
    }, [draggedPoint, width, height, onChange, maxTime]);

    useEffect(() => {
        if (draggedPoint) {
            window.addEventListener('mousemove', handleMouseMove);
            window.addEventListener('mouseup', handleMouseUp);
        }
        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, [draggedPoint, handleMouseMove, handleMouseUp]);

    const renderControlPoint = (name: string, cx: number, cy: number) => (
        <circle
            cx={cx}
            cy={cy}
            r={draggedPoint === name ? 10 : 8}
            style={pointStyle}
            onMouseDown={(e) => handleMouseDown(e, name)}
        />
    );

    const renderCurvePoint = (name: string, cx: number, cy: number) => (
        <circle
            data-testid={`curve-handle-${name}`}
            cx={cx}
            cy={cy}
            r={draggedPoint === name ? 7 : 5}
            style={curvePointStyle}
            onMouseDown={(e) => handleMouseDown(e, name)}
        />
    );

    return (
        <div style={containerStyle}>
            <svg ref={svgRef} width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
                <path d={fillPathData} style={fillStyle} />
                <path d={pathData} style={lineStyle} />

                {renderControlPoint('attack', points.p2.x, points.p2.y)}
                {renderControlPoint('decay', points.p3.x, points.p3.y)}
                {/* The fourth point is now purely visual and not interactive */}
                <circle cx={points.p4.x} cy={points.p4.y} r="6" style={{...pointStyle, fill: '#4A5568', cursor: 'default'}} />
                {renderControlPoint('release', points.p5.x, points.p5.y)}

                {/* E8: tension handles, one per curved stage. */}
                {renderCurvePoint('attackCurve', curvePoints.attack.x, curvePoints.attack.y)}
                {renderCurvePoint('decayCurve', curvePoints.decay.x, curvePoints.decay.y)}
                {renderCurvePoint('releaseCurve', curvePoints.release.x, curvePoints.release.y)}

                <text x={points.p2.x} y={height - 5} style={textLabelStyle}>A</text>
                <text x={points.p3.x} y={height - 5} style={textLabelStyle}>D</text>
                <text x={points.p4.x} y={height - 5} style={textLabelStyle}>S</text>
                <text x={points.p5.x > 15 ? points.p5.x - 10 : 5} y={height - 5} style={textLabelStyle}>R</text>
            </svg>
            <div style={readoutContainerStyle}>
                <div>A: {formatDisplayValue(attack)}s</div>
                <div>D: {formatDisplayValue(decay)}s</div>
                <div>S: {formatDisplayValue(sustain)}</div>
                <div>R: {formatDisplayValue(release)}s</div>
            </div>
        </div>
    );
};
