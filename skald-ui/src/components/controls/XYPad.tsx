import React, { useState, useRef, useCallback, useEffect } from 'react';

// --- PROPS INTERFACE ---

interface XYPadProps {
    xValue: number;
    yValue: number;
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
    onChange: (values: { x: number; y: number }) => void;
    xScale?: 'log' | 'linear';
    yScale?: 'log' | 'linear';
    width?: number;
    height?: number;
}

// --- STYLES ---

const padStyle: React.CSSProperties = {
    width: '100%',
    height: '200px',
    background: '#252526',
    border: '1px solid #4A5568',
    borderRadius: '8px',
    position: 'relative',
    cursor: 'crosshair',
    touchAction: 'none',
    WebkitUserSelect: 'none',
    userSelect: 'none',
};

const handleStyle: React.CSSProperties = {
    position: 'absolute',
    width: '20px',
    height: '20px',
    background: '#3182CE',
    border: '2px solid #E0E0E0',
    borderRadius: '50%',
    transform: 'translate(-50%, -50%)',
    pointerEvents: 'none', // Prevent handle from capturing mouse events
};

const gridLineStyle: React.CSSProperties = {
    stroke: '#4A5568',
    strokeWidth: 0.5,
};

// --- HELPER FUNCTIONS ---
const toLogValue = (position: number, min: number, max: number) => {
    const minLog = Math.log(min);
    const maxLog = Math.log(max);
    const scale = maxLog - minLog;
    return Math.exp(minLog + scale * position);
};

const fromLogValue = (value: number, min: number, max: number) => {
    if (value <= 0) return 0;
    const minLog = Math.log(min);
    const maxLog = Math.log(max);
    const scale = maxLog - minLog;
    if (scale === 0) return 0;
    return (Math.log(value) - minLog) / scale;
};


// --- MAIN COMPONENT ---

export const XYPad: React.FC<XYPadProps> = ({
    xValue,
    yValue,
    minX,
    maxX,
    minY,
    maxY,
    onChange,
    xScale = 'linear',
    yScale = 'linear',
    width = 250,
    height = 200,
}) => {
    const padRef = useRef<HTMLDivElement>(null);
    const [isDragging, setIsDragging] = useState(false);
    const [localPosition, setLocalPosition] = useState({ x: xValue, y: yValue });

    useEffect(() => {
        setLocalPosition({ x: xValue, y: yValue });
    }, [xValue, yValue]);

    const getPositionFromValue = (valX: number, valY: number) => {
        const xPos = xScale === 'log' 
            ? fromLogValue(valX, minX, maxX)
            : (valX - minX) / (maxX - minX);

        const yPos = yScale === 'log'
            ? fromLogValue(valY, minY, maxY)
            : (valY - minY) / (maxY - minY);

        return {
            x: xPos * width,
            y: (1 - yPos) * height,
        };
    };

    const handleInteraction = useCallback((clientX: number, clientY: number) => {
        if (!padRef.current) return;

        const rect = padRef.current.getBoundingClientRect();
        let x = (clientX - rect.left) / width;
        let y = 1 - ((clientY - rect.top) / height);
        
        x = Math.max(0, Math.min(1, x));
        y = Math.max(0, Math.min(1, y));

        const newXValue = xScale === 'log' ? toLogValue(x, minX, maxX) : minX + x * (maxX - minX);
        const newYValue = yScale === 'log' ? toLogValue(y, minY, maxY) : minY + y * (maxY - minY);

        setLocalPosition({ x: newXValue, y: newYValue });

    }, [width, height, minX, maxX, minY, maxY, xScale, yScale]);

    const handleMouseDown = (e: React.MouseEvent) => {
        setIsDragging(true);
        handleInteraction(e.clientX, e.clientY);
    };

    const handleMouseUp = useCallback(() => {
        if (isDragging) {
            onChange(localPosition);
            setIsDragging(false);
        }
    }, [isDragging, localPosition, onChange]);

    const handleMouseMove = useCallback((e: MouseEvent) => {
        if (isDragging) {
            handleInteraction(e.clientX, e.clientY);
        }
    }, [isDragging, handleInteraction]);

    useEffect(() => {
        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);
        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, [handleMouseMove, handleMouseUp]);

    const pos = getPositionFromValue(localPosition.x, localPosition.y);

    return (
        <div
            ref={padRef}
            style={{...padStyle, width: `${width}px`, height: `${height}px`}}
            onMouseDown={handleMouseDown}
        >
            <svg width="100%" height="100%" style={{ position: 'absolute' }}>
                <line x1={width/2} y1="0" x2={width/2} y2={height} style={gridLineStyle} />
                <line x1="0" y1={height/2} x2={width} y2={height/2} style={gridLineStyle} />
            </svg>
            <div style={{ ...handleStyle, left: `${pos.x}px`, top: `${pos.y}px` }} />
        </div>
    );
};
