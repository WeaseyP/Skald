import React from 'react';
import { Node } from 'reactflow';
import { CustomSlider } from './controls/CustomSlider';
import { BpmSyncControl } from './controls/BpmSyncControl';
import { AdsrEnvelopeEditor } from './controls/AdsrEnvelopeEditor';
import { XYPad } from './controls/XYPad';

interface NodeParameterControlsProps {
    node: Node;
    values?: Record<string, any>; // If provided, overrides node.data
    onChange: (paramName: string, value: any) => void;
    renderControlWrapper: (paramKey: string, label: string, control: React.ReactNode, isExposable?: boolean) => React.ReactNode;
}

const inputStyles: React.CSSProperties = {
    width: '100%',
    padding: '8px',
    boxSizing: 'border-box',
    borderRadius: '4px',
    border: '1px solid #555',
    background: '#333',
    color: '#E0E0E0',
    outline: 'none',
};

const labelStyles: React.CSSProperties = {
    fontWeight: 'bold',
    color: '#CCCCCC',
    display: 'block',
    marginBottom: '5px'
}

export const NodeParameterControls: React.FC<NodeParameterControlsProps> = ({ node, values, onChange, renderControlWrapper }) => {
    const { type, data: nodeData } = node;
    const data = values || nodeData;

    const createSelect = (paramKey: string, options: string[]) => (
        <select name={paramKey} value={data[paramKey]} onChange={(e) => onChange(paramKey, e.target.value)} style={inputStyles}>
            {options.map(opt => <option key={opt} value={opt}>{opt}</option>)}
        </select>
    );

    // Helpers to cleanup common patterns
    const slider = (param: string, min: number, max: number, def: number, scale?: 'log' | 'linear', step?: number) => (
        <CustomSlider
            min={min} max={max}
            value={data[param] ?? def}
            onChange={val => onChange(param, val)}
            scale={scale}
            step={step}
        />
    );

    switch (type) {
        case 'adsr':
            return (<>
                <AdsrEnvelopeEditor
                    value={{ attack: data.attack, decay: data.decay, sustain: data.sustain, release: data.release }}
                    onChange={(newAdsr) => {
                        onChange('attack', newAdsr.attack);
                        onChange('decay', newAdsr.decay);
                        onChange('sustain', newAdsr.sustain);
                        onChange('release', newAdsr.release);
                    }}
                />
                {renderControlWrapper('depth', 'Depth', slider('depth', 0, 1, 1))}
                {renderControlWrapper('velocitySensitivity', 'Velocity Sens.', slider('velocitySensitivity', 0, 1, 0.5))}
            </>);
        case 'filter':
            return (<>
                {renderControlWrapper('type', 'Filter Type', createSelect('type', ['Lowpass', 'Highpass', 'Bandpass', 'Notch']), false)}
                <XYPad
                    xValue={data.cutoff}
                    yValue={data.resonance}
                    minX={20} maxX={20000} minY={0.1} maxY={30}
                    onChange={({ x, y }) => {
                        onChange('cutoff', x);
                        onChange('resonance', y);
                    }}
                    xScale="log" yScale="log"
                />
                <div style={{ fontSize: '0.8em', color: '#888' }}>
                    Cutoff: {(data.cutoff ?? 1000).toFixed(2)} Hz <br />
                    Resonance: {(data.resonance ?? 1).toFixed(2)}
                </div>
            </>);
        case 'lfo':
            return (<>
                {renderControlWrapper('waveform', 'Waveform', createSelect('waveform', ['Sine', 'Sawtooth', 'Triangle', 'Square']), false)}
                {data.bpmSync
                    ? renderControlWrapper('syncRate', 'Sync Rate', <BpmSyncControl value={data.syncRate ?? '1/4'} onChange={val => onChange('syncRate', val)} />)
                    : renderControlWrapper('frequency', 'Frequency (Hz)', slider('frequency', 0.1, 50, 5, 'log'))
                }
                {renderControlWrapper('amplitude', 'Amplitude (Depth)', slider('amplitude', 0, 1, 1))}
                {/* BPM Sync Toggle is handled specially in main panel, but we might want it here? For now, skipping complex toggle logic or implementing basic checkbox */}
                <div style={{ margin: '10px 0' }}>
                    <label style={{ ...labelStyles, display: 'inline', marginRight: 10 }}>BPM Sync</label>
                    <input type="checkbox" checked={data.bpmSync || false} onChange={e => onChange('bpmSync', e.target.checked)} />
                </div>
            </>);
        case 'delay':
            return (<>
                {data.bpmSync
                    ? renderControlWrapper('syncRate', 'Sync Rate', <BpmSyncControl value={data.syncRate ?? '1/8'} onChange={val => onChange('syncRate', val)} />)
                    : renderControlWrapper('delayTime', 'Delay Time (s)', slider('delayTime', 0.001, 5, 0.5))
                }
                {renderControlWrapper('feedback', 'Feedback', slider('feedback', 0, 1, 0.5))}
                {renderControlWrapper('mix', 'Wet/Dry Mix', slider('mix', 0, 1, 0.5))}
                <div style={{ margin: '10px 0' }}>
                    <label style={{ ...labelStyles, display: 'inline', marginRight: 10 }}>BPM Sync</label>
                    <input type="checkbox" checked={data.bpmSync || false} onChange={e => onChange('bpmSync', e.target.checked)} />
                </div>
            </>);
        case 'sampleHold':
            return (<>
                {data.bpmSync
                    ? renderControlWrapper('syncRate', 'Sync Rate', <BpmSyncControl value={data.syncRate ?? '1/8'} onChange={val => onChange('syncRate', val)} />)
                    : renderControlWrapper('rate', 'Rate (Hz)', slider('rate', 0.1, 50, 10, 'log'))
                }
                {renderControlWrapper('amplitude', 'Amplitude (Depth)', slider('amplitude', 0, 1, 1))}
                <div style={{ margin: '10px 0' }}>
                    <label style={{ ...labelStyles, display: 'inline', marginRight: 10 }}>BPM Sync</label>
                    <input type="checkbox" checked={data.bpmSync || false} onChange={e => onChange('bpmSync', e.target.checked)} />
                </div>
            </>);
        case 'fmOperator':
            return (<>
                {renderControlWrapper('frequency', 'Carrier Freq (Hz)', slider('frequency', 20, 20000, 440, 'log'))}
                {renderControlWrapper('modIndex', 'Modulation Index', slider('modIndex', 0, 1000, 100))}
            </>);
        case 'wavetable':
            return (<>
                {renderControlWrapper('tableName', 'Table', createSelect('tableName', ['Sine', 'Triangle', 'Sawtooth', 'Square']), false)}
                {renderControlWrapper('frequency', 'Frequency (Hz)', slider('frequency', 20, 20000, 440, 'log'))}
                {renderControlWrapper('position', 'Table Position', slider('position', 0, 3, 0, undefined, 0.01))}
            </>);
        case 'oscillator':
            return (<>
                {renderControlWrapper('waveform', 'Waveform', createSelect('waveform', ['Sawtooth', 'Sine', 'Triangle', 'Square']), false)}
                {renderControlWrapper('frequency', 'Frequency (Hz)', slider('frequency', 20, 20000, 440, 'log'))}
                {renderControlWrapper('amplitude', 'Amplitude', slider('amplitude', 0, 1, 0.5))}
                {data.waveform === 'Square' && renderControlWrapper('pulseWidth', 'Pulse Width', slider('pulseWidth', 0.01, 0.99, 0.5))}
                {renderControlWrapper('phase', 'Phase', slider('phase', 0, 360, 0))}
            </>);
        case 'noise':
            return (<>
                {renderControlWrapper('type', 'Noise Type', createSelect('type', ['White', 'Pink']), false)}
                {renderControlWrapper('amplitude', 'Amplitude', slider('amplitude', 0, 1, 1))}
            </>);
        case 'reverb':
            return (<>
                {renderControlWrapper('decay', 'Decay (s)', slider('decay', 0.1, 10, 3))}
                {renderControlWrapper('preDelay', 'Pre-Delay (s)', slider('preDelay', 0, 1, 0.01))}
                {renderControlWrapper('mix', 'Wet/Dry Mix', slider('mix', 0, 1, 0.5))}
            </>);
        case 'distortion':
            return (<>
                {renderControlWrapper('drive', 'Drive', slider('drive', 1, 100, 20))}
                {renderControlWrapper('tone', 'Tone (Hz)', slider('tone', 100, 10000, 4000, 'log'))}
                {renderControlWrapper('mix', 'Wet/Dry Mix', slider('mix', 0, 1, 0.5))}
            </>);
        case 'panner':
            return (<>
                {renderControlWrapper('pan', 'Pan', slider('pan', -1, 1, 0))}
            </>);
        case 'gain':
        case 'VisualGainNode':
            return (<>
                {renderControlWrapper('gain', 'Gain', slider('gain', 0, 1, 0.75))}
            </>);
        // Complex types (mixer, instrument, group) are handled by Parent usually, 
        // but simple Instrument params (non-subgraph) can go here
        case 'instrument':
            return (<>
                {renderControlWrapper('voiceCount', 'Voice Count', slider('voiceCount', 1, 32, 8, undefined, 1))}
                {renderControlWrapper('glide', 'Glide (s)', slider('glide', 0, 2, 0.05))}
                {renderControlWrapper('unison', 'Unison Voices', slider('unison', 1, 16, 1, undefined, 1))}
                {renderControlWrapper('detune', 'Detune (cents)', slider('detune', 0, 100, 5))}
            </>);
        default:
            return <div><small style={{ color: '#666' }}>No standard controls for {type}</small></div>;
    }
};
