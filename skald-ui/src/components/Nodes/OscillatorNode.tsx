
import React from 'react';
import { Handle, Position } from 'reactflow';
import { CustomSlider } from '../controls/CustomSlider';

// The props interface now includes the update function passed from app.tsx
interface OscillatorNodeProps {
    id: string;
    data: {
        label: string;
        frequency: number;
        waveform: 'Sine' | 'Square' | 'Sawtooth' | 'Triangle';
        pulseWidth?: number;
        phase?: number;
    };
    updateNodeData: (nodeId: string, data: object) => void;
}

export const OscillatorNode: React.FC<OscillatorNodeProps> = ({ id, data, updateNodeData }) => {
    // This function now correctly uses the prop to update the central state
    const handleParamChange = (param: keyof typeof data, value: any) => {
        if (updateNodeData) {
            updateNodeData(id, { [param]: value });
        }
    };

    return (
        <div className="bg-gray-700 border border-gray-600 rounded-lg p-4 w-64 text-white shadow-lg">
            <div className="font-bold mb-2 text-center">{data.label}</div>

            {/* Main Input/Output Handles */}
            <Handle type="target" position={Position.Left} id="input" className="w-3 h-3 !bg-blue-500" />
            <Handle type="source" position={Position.Right} id="output" className="w-3 h-3 !bg-blue-500" />
            
            {/* Parameter Handles */}
            <Handle type="target" position={Position.Left} id="frequency" style={{ top: '60px' }} className="w-2 h-2 !bg-green-400" />
            {data.waveform === 'Square' && (
               <Handle type="target" position={Position.Left} id="pulseWidth" style={{ top: '85px' }} className="w-2 h-2 !bg-green-400" />
            )}


            {/* Parameter Controls */}
            <div className="space-y-3 mt-2">
                <div className="flex items-center justify-between">
                    <label className="text-sm">Waveform</label>
                    <select
                        value={data.waveform}
                        onChange={(e) => handleParamChange('waveform', e.target.value)}
                        className="bg-gray-800 border border-gray-600 rounded p-1 text-sm"
                    >
                        <option>Sine</option>
                        <option>Square</option>
                        <option>Sawtooth</option>
                        <option>Triangle</option>
                    </select>
                </div>

                <div className="flex items-center justify-between">
                    <label className="text-sm">Frequency</label>
                    <CustomSlider
                        value={data.frequency}
                        onChange={(v) => handleParamChange('frequency', v)}
                        min={20}
                        max={20000}
                        step={1}
                        scale="log"
                        className="w-2/3"
                    />
                </div>

                {data.waveform === 'Square' && (
                    <div className="flex items-center justify-between">
                        <label className="text-sm">Pulse Width</label>
                        <CustomSlider
                            value={data.pulseWidth ?? 0.5}
                            onChange={(v) => handleParamChange('pulseWidth', v)}
                            min={0.01}
                            max={0.99}
                            step={0.01}
                            className="w-2/3"
                        />
                    </div>
                )}

                <div className="flex items-center justify-between">
                    <label className="text-sm">Phase</label>
                    <CustomSlider
                        value={data.phase ?? 0}
                        onChange={(v) => handleParamChange('phase', v)}
                        min={0}
                        max={360}
                        step={1}
                        className="w-2/3"
                    />
                </div>
            </div>
        </div>
    );
};