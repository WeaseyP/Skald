import React, { useState, useRef, useCallback, useEffect } from 'react';

// --- PROPS INTERFACE ---

interface AdsrData {
    attack: number;
    decay: number;
    sustain: number;
    release: number;
}

interface AdsrEnvelopeEditorProps {
    value: AdsrData;
    onChange: (newValue: AdsrData) => void;
    width?: number;
    height?: number;
    maxTime?: number; // Maximum time for the envelope's x-axis in seconds
}

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

    const { attack, decay, sustain, release } = value;
    
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

    const pathData = `M ${points.p1.x},${points.p1.y} L ${points.p2.x},${points.p2.y} L ${points.p3.x},${points.p3.y} L ${points.p4.x},${points.p4.y} L ${points.p5.x},${points.p5.y}`;
    const fillPathData = `${pathData} L ${scaleX(maxTime)},${height} L 0,${height} Z`;

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

                <text x={points.p2.x} y={height - 5} style={textLabelStyle}>A</text>
                <text x={points.p3.x} y={height - 5} style={textLabelStyle}>D</text>
                <text x={points.p4.x} y={height - 5} style={textLabelStyle}>S</text>
                <text x={points.p5.x > 15 ? points.p5.x - 10 : 5} y={height - 5} style={textLabelStyle}>R</text>
            </svg>
            <div style={readoutContainerStyle}>
                <div>A: {attack.toFixed(2)}s</div>
                <div>D: {decay.toFixed(2)}s</div>
                <div>S: {sustain.toFixed(2)}</div>
                <div>R: {release.toFixed(2)}s</div>
            </div>
        </div>
    );
};
