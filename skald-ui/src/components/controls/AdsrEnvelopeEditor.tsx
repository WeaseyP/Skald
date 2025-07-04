import React, { useState, useRef, useCallback } from 'react';

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
};

const pointStyle: React.CSSProperties = {
    cursor: 'move',
    fill: '#3182CE',
    stroke: '#E0E0E0',
    strokeWidth: 2,
};

const lineStyle: React.CSSProperties = {
    fill: 'none',
    stroke: '#4A5568',
    strokeWidth: 2,
};

const fillStyle: React.CSSProperties = {
    fill: 'rgba(49, 130, 206, 0.3)',
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

    const { attack, decay, sustain, release } = value;

    // --- Calculations for SVG Path ---
    // These convert the ADSR time/level values into X/Y coordinates for the SVG.
    const totalTime = attack + decay + 1 + release; // Add 1 unit for sustain visualization
    const scaleX = (time: number) => (time / totalTime) * width;

    const attackX = scaleX(attack);
    const decayX = scaleX(decay);
    const sustainX = scaleX(1); // Fixed width for sustain portion
    const releaseX = scaleX(release);

    const sustainY = height * (1 - sustain);

    const points = {
        p1: { x: 0, y: height },
        p2: { x: attackX, y: 0 },
        p3: { x: attackX + decayX, y: sustainY },
        p4: { x: attackX + decayX + sustainX, y: sustainY },
        p5: { x: attackX + decayX + sustainX + releaseX, y: height },
    };

    const pathData = `M ${points.p1.x},${points.p1.y} L ${points.p2.x},${points.p2.y} L ${points.p3.x},${points.p3.y} L ${points.p4.x},${points.p4.y} L ${points.p5.x},${points.p5.y}`;
    const fillPathData = `${pathData} L ${width},${height} L 0,${height} Z`;

    // --- Drag Handlers ---

    const getCoords = (e: MouseEvent | React.MouseEvent): { x: number; y: number } => {
        if (!svgRef.current) return { x: 0, y: 0 };
        const rect = svgRef.current.getBoundingClientRect();
        return {
            x: e.clientX - rect.left,
            y: e.clientY - rect.top,
        };
    };
    
    const handleMouseDown = (pointName: string) => {
        setDraggedPoint(pointName);
    };

    const handleMouseUp = useCallback(() => {
        setDraggedPoint(null);
    }, []);

    const handleMouseMove = useCallback((e: MouseEvent) => {
        if (!draggedPoint || !svgRef.current) return;

        let { x, y } = getCoords(e);
        x = Math.max(0, Math.min(width, x));
        y = Math.max(0, Math.min(height, y));

        const newValues = { ...value };
        
        // This is a simplified model. A real implementation would have more robust logic
        // to prevent points from crossing over each other and to scale time values correctly.
        switch (draggedPoint) {
            case 'attack':
                newValues.attack = (x / width) * 5; // Max attack 5s
                break;
            case 'decay':
                const currentAttackX = scaleX(newValues.attack);
                newValues.decay = ((x - currentAttackX) / width) * 5; // Max decay 5s
                newValues.sustain = 1 - y / height;
                break;
            case 'release':
                const preReleaseX = points.p4.x;
                newValues.release = ((x - preReleaseX) / width) * 10; // Max release 10s
                break;
        }

        // Clamp values to be non-negative
        newValues.attack = Math.max(0.001, newValues.attack);
        newValues.decay = Math.max(0.001, newValues.decay);
        newValues.sustain = Math.max(0, Math.min(1, newValues.sustain));
        newValues.release = Math.max(0.001, newValues.release);

        onChange(newValues);

    }, [draggedPoint, value, onChange, width, height]);

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
                <circle cx={points.p2.x} cy={points.p2.y} r="8" style={pointStyle} onMouseDown={() => handleMouseDown('attack')} />
                <circle cx={points.p3.x} cy={points.p3.y} r="8" style={pointStyle} onMouseDown={() => handleMouseDown('decay')} />
                <circle cx={points.p5.x} cy={points.p5.y} r="8" style={pointStyle} onMouseDown={() => handleMouseDown('release')} />
            </svg>
        </div>
    );
};
