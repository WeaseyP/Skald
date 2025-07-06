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
}

// --- STYLES ---

const containerStyle: React.CSSProperties = {
    touchAction: 'none',
    WebkitUserSelect: 'none',
    userSelect: 'none',
    cursor: 'default',
};

const pointStyle: React.CSSProperties = {
    cursor: 'move',
    fill: '#3182CE', // blue-500
    stroke: '#E2E8F0', // gray-200
    strokeWidth: 2,
};

const lineStyle: React.CSSProperties = {
    fill: 'none',
    stroke: '#4A5568', // gray-600
    strokeWidth: 2,
};

const fillStyle: React.CSSProperties = {
    fill: 'rgba(66, 153, 225, 0.3)', // blue-400 with alpha
};


// --- MAIN COMPONENT ---

export const AdsrEnvelopeEditor: React.FC<AdsrEnvelopeEditorProps> = ({
    value,
    onChange,
    width = 300,
    height = 150,
}) => {
    const svgRef = useRef<SVGSVGElement>(null);
    const [draggedPoint, setDraggedPoint] = useState<string | null>(null);

    // Use a stable reference for the value during a drag operation to avoid stale closures
    const valueRef = useRef(value);
    valueRef.current = value;

    // --- Calculations for SVG Path ---
    // These convert the ADSR time/level values into X/Y coordinates for the SVG.
    const { attack, decay, sustain, release } = value;

    // We add a fixed "sustain time" for visualization purposes. This makes the total time calculation more stable.
    const sustainTimeVisual = 1.0;
    const totalTime = attack + decay + sustainTimeVisual + release;

    const scaleX = (time: number) => (time / totalTime) * width;

    const attackX = scaleX(attack);
    const decayX = scaleX(decay);
    const sustainX = scaleX(sustainTimeVisual);
    const releaseX = scaleX(release);

    const sustainY = height * (1 - sustain);

    const points = {
        p1: { x: 0, y: height },                                     // Start
        p2: { x: attackX, y: 0 },                                    // Attack Peak
        p3: { x: attackX + decayX, y: sustainY },                    // Decay End / Sustain Start
        p4: { x: attackX + decayX + sustainX, y: sustainY },         // Sustain End / Release Start
        p5: { x: attackX + decayX + sustainX + releaseX, y: height }, // Release End
    };

    const pathData = `M ${points.p1.x},${points.p1.y} L ${points.p2.x},${points.p2.y} L ${points.p3.x},${points.p3.y} L ${points.p4.x},${points.p4.y} L ${points.p5.x},${points.p5.y}`;
    const fillPathData = `${pathData} L ${width},${height} L 0,${height} Z`;

    // --- Drag Handlers ---

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
        let x = e.clientX - rect.left;
        let y = e.clientY - rect.top;

        // Clamp coordinates to SVG bounds
        x = Math.max(0, Math.min(width, x));
        y = Math.max(0, Math.min(height, y));

        const currentValue = valueRef.current;
        const newValues = { ...currentValue };

        // Inverse function to convert X coordinate back to a time value
        const timeAtX = (posX: number) => (posX / width) * (currentValue.attack + currentValue.decay + sustainTimeVisual + currentValue.release);

        switch (draggedPoint) {
            case 'attack': { // Controls p2
                const newAttackTime = timeAtX(x);
                newValues.attack = Math.max(0.001, newAttackTime);
                break;
            }
            case 'decay': { // Controls p3
                const newSustainLevel = 1 - y / height;
                const timeAtDecayPoint = timeAtX(x);
                const newDecayTime = timeAtDecayPoint - newValues.attack;

                newValues.decay = Math.max(0.001, newDecayTime);
                newValues.sustain = Math.max(0, Math.min(1, newSustainLevel));
                break;
            }
            case 'release': { // Controls p5, relative to p4
                 const timeAtReleasePoint = timeAtX(x);
                 const sustainEndTime = newValues.attack + newValues.decay + sustainTimeVisual;
                 const newReleaseTime = timeAtReleasePoint - sustainEndTime;

                 newValues.release = Math.max(0.001, newReleaseTime);
                break;
            }
        }
        onChange(newValues);

    }, [draggedPoint, width, height, onChange]);

    // Add and remove global event listeners for dragging outside the SVG
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


    return (
        <div style={containerStyle}>
            <svg ref={svgRef} width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
                <path d={fillPathData} style={fillStyle} />
                <path d={pathData} style={lineStyle} />

                {/* Draggable points */}
                <circle cx={points.p2.x} cy={points.p2.y} r="8" style={pointStyle} onMouseDown={(e) => handleMouseDown(e, 'attack')} />
                <circle cx={points.p3.x} cy={points.p3.y} r="8" style={pointStyle} onMouseDown={(e) => handleMouseDown(e, 'decay')} />
                {/* The handle for release time is actually the final point, p5 */}
                <circle cx={points.p5.x} cy={points.p5.y} r="8" style={pointStyle} onMouseDown={(e) => handleMouseDown(e, 'release')} />
            </svg>
        </div>
    );
};