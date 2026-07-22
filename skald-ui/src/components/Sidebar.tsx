import React from 'react';

// --- STYLES ---

const sidebarStyles: React.CSSProperties = {
    padding: '15px',
    fontFamily: 'sans-serif',
    color: '#E0E0E0',
    height: '100%',
    boxSizing: 'border-box',
    overflowY: 'auto',
};

const titleStyles: React.CSSProperties = {
    fontSize: '1.5em',
    fontWeight: 'bold',
    marginBottom: '20px',
    textAlign: 'center',
    color: '#FFFFFF',
};

const sectionTitleStyles: React.CSSProperties = {
    fontSize: '1.1em',
    fontWeight: '600',
    marginTop: '20px',
    marginBottom: '10px',
    color: '#a0aec0',
    borderBottom: '1px solid #4A5568',
    paddingBottom: '5px',
};

const nodeStyles: React.CSSProperties = {
    padding: '10px',
    marginBottom: '10px',
    borderRadius: '5px',
    background: '#384252',
    border: '1px solid #4A5568',
    cursor: 'grab',
    textAlign: 'center',
};

const buttonStyles: React.CSSProperties = {
    width: '100%',
    padding: '10px',
    borderRadius: '5px',
    border: 'none',
    color: 'white',
    fontWeight: 'bold',
    cursor: 'pointer',
    marginTop: '5px',
    transition: 'background-color 0.2s',
};

const primaryButtonStyles: React.CSSProperties = {
    ...buttonStyles,
    background: '#3182CE',
};

const secondaryButtonStyles: React.CSSProperties = {
    ...buttonStyles,
    background: '#4A5568',
};

const activeLoopButtonStyles: React.CSSProperties = {
    ...buttonStyles,
    background: '#2F855A', // A green color to indicate it's active
};

const disabledButtonStyles: React.CSSProperties = {
    ...buttonStyles,
    background: '#4A5568',
    opacity: 0.5,
    cursor: 'not-allowed',
};

const bpmInputStyles: React.CSSProperties = {
    width: '100%',
    padding: '8px',
    boxSizing: 'border-box',
    borderRadius: '4px',
    border: '1px solid #555',
    background: '#333',
    color: '#E0E0E0',
    outline: 'none',
    textAlign: 'center',
    fontSize: '1.2em',
};

// --- PROPS INTERFACE ---

interface SidebarProps {
    onGenerate: () => void;
    onPlay: () => void;
    onStop: () => void;
    isPlaying: boolean;
    onSave: () => void;
    onLoad: () => void;
    onCreateInstrument: () => void;
    onCreateGroup: () => void;
    canCreateInstrument: boolean;
    bpm: number;
    onBpmChange: (newBpm: number) => void;
    isLooping: boolean;
    onLoopToggle: () => void;
    onExplodeInstrument: () => void;
    canExplodeInstrument: boolean;
    onImport: () => void;
    packageName: string;
    onPackageNameChange: (name: string) => void;
    outputPath: string;
    onSelectOutputPath: () => void;
}


// --- MAIN COMPONENT ---

const Sidebar: React.FC<SidebarProps> = ({
    onGenerate,
    onPlay,
    onStop,
    isPlaying,
    onSave,
    onLoad,
    onCreateInstrument,
    onCreateGroup,
    canCreateInstrument,
    bpm,
    onBpmChange,
    isLooping,
    onLoopToggle,
    onExplodeInstrument,
    canExplodeInstrument,
    onImport,
    packageName,
    onPackageNameChange,
    outputPath,
    onSelectOutputPath,
}) => {

    const onDragStart = (event: React.DragEvent, nodeType: string) => {
        event.dataTransfer.setData('application/reactflow', nodeType);
        event.dataTransfer.effectAllowed = 'move';
    };

    return (
        <div style={sidebarStyles}>
            <h1 style={titleStyles}>Skald</h1>

            <div>
                <h2 style={sectionTitleStyles}>Global</h2>
                <label style={{ display: 'block', textAlign: 'center', marginBottom: '5px' }}>BPM</label>
                <input
                    type="number"
                    value={bpm}
                    onChange={(e) => onBpmChange(parseInt(e.target.value, 10))}
                    style={bpmInputStyles}
                    min="20"
                    max="300"
                />
            </div>

            <div>
                <h2 style={sectionTitleStyles}>Generation</h2>
                <div style={{ marginBottom: '10px' }}>
                    <label style={{ display: 'block', fontSize: '0.8em', color: '#ccc', marginBottom: '2px' }}>Package Name</label>
                    <input
                        type="text"
                        value={packageName}
                        onChange={(e) => onPackageNameChange(e.target.value)}
                        style={{ ...bpmInputStyles, fontSize: '0.9em', width: '100%' }}
                        placeholder="generated_audio"
                    />
                </div>
                <div style={{ marginBottom: '10px' }}>
                    <button style={{ ...secondaryButtonStyles, fontSize: '0.8em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} onClick={onSelectOutputPath} title={outputPath}>
                        {outputPath ? (outputPath.split(/[\\/]/).pop() || 'Output File Selected') : 'Select Output File'}
                    </button>
                </div>
                <button style={primaryButtonStyles} onClick={onGenerate}>Generate Code</button>
            </div>

            <div>
                <h2 style={sectionTitleStyles}>Graph Actions</h2>
                {!isPlaying ? (
                    <button style={secondaryButtonStyles} onClick={onPlay}>Play</button>
                ) : (
                    <button style={{ ...secondaryButtonStyles, background: '#C53030' }} onClick={onStop}>Stop</button>
                )}
                <button
                    style={isLooping ? activeLoopButtonStyles : secondaryButtonStyles}
                    onClick={onLoopToggle}
                >
                    {isLooping ? 'Looping' : 'Loop'}
                </button>
                <button style={secondaryButtonStyles} onClick={onSave}>Save</button>
                <button style={secondaryButtonStyles} onClick={onLoad}>Load</button>
                <button style={secondaryButtonStyles} onClick={onImport}>Import Patch</button>
            </div>

            <div>
                <h2 style={sectionTitleStyles}>Grouping</h2>
                <button
                    style={canCreateInstrument ? secondaryButtonStyles : disabledButtonStyles}
                    onClick={onCreateInstrument}
                    disabled={!canCreateInstrument}
                    title={canCreateInstrument ? "Group selected nodes into a reusable instrument" : "Select 2 or more nodes to create an instrument"}
                >
                    Create Instrument
                </button>
                <button
                    style={canCreateInstrument ? secondaryButtonStyles : disabledButtonStyles}
                    onClick={onCreateGroup}
                    disabled={!canCreateInstrument}
                    title={canCreateInstrument ? "Group selected nodes visually" : "Select 2 or more nodes to create a group"}
                >
                    Create Group
                </button>
                <button
                    style={canExplodeInstrument ? secondaryButtonStyles : disabledButtonStyles}
                    onClick={onExplodeInstrument}
                    disabled={!canExplodeInstrument}
                    title={canExplodeInstrument ? "Break instrument back into its components" : "Select exactly 1 instrument to explode"}
                >
                    Explode Instrument
                </button>
            </div>

            <div>
                <h2 style={sectionTitleStyles}>Nodes</h2>
                {paletteNodes.map(({ type, label, tip, style }) => (
                    <div
                        key={type}
                        style={{ ...nodeStyles, ...style }}
                        onDragStart={(event) => onDragStart(event, type)}
                        draggable
                        title={tip}
                        tabIndex={0}
                        role="button"
                        aria-label={`${label}: ${tip}`}
                    >
                        {label}
                    </div>
                ))}
            </div>
        </div>
    );
};

// Palette entries with one-line tooltips — items used to carry no
// description at all. Wavetable is back: codegen now generates a real
// position-morphing wavetable (P4), so the old placeholder-hiding
// workaround no longer applies.
const paletteNodes: Array<{ type: string; label: string; tip: string; style?: React.CSSProperties }> = [
    { type: 'oscillator', label: 'Oscillator', tip: 'Tone generator (sine/saw/triangle/PWM square). Pitch tracks the played note.' },
    { type: 'noise', label: 'Noise', tip: 'White noise source.' },
    { type: 'lfo', label: 'LFO', tip: 'Low-frequency oscillator for modulating parameters. Can sync to BPM.' },
    { type: 'sampleHold', label: 'S & H', tip: 'Sample & hold — stepped random modulation. Can sync to BPM.' },
    { type: 'fmOperator', label: 'FM Operator', tip: 'FM sine at a ratio of the played note. Feed input_mod for sidebands.' },
    { type: 'wavetable', label: 'Wavetable', tip: 'Morphing wavetable: position sweeps sine → triangle → saw → square.' },
    { type: 'adsr', label: 'ADSR', tip: 'Envelope: shapes a note over attack/decay/sustain/release. Scales with velocity.' },
    { type: 'filter', label: 'Filter', tip: 'Lowpass/Highpass/Bandpass/Notch filter with cutoff + resonance (XY pad).' },
    { type: 'delay', label: 'Delay', tip: 'Echo with feedback and wet/dry mix. Can sync to BPM.' },
    { type: 'reverb', label: 'Reverb', tip: 'Room tail with decay time, pre-delay and wet/dry mix.' },
    { type: 'distortion', label: 'Distortion', tip: 'Waveshaper (classic/soft/hard/asymmetric) with tone filter and mix.' },
    { type: 'mixer', label: 'Mixer', tip: 'Sums several inputs with per-channel level sliders.' },
    { type: 'mapper', label: 'Mapper', tip: 'Rescales a modulation signal from one range to another (clamped).' },
    { type: 'panner', label: 'Panner', tip: 'Equal-power stereo panner.' },
    { type: 'gain', label: 'VCA', tip: 'Gain stage — modulate the gain input for tremolo or volume control.' },
    { type: 'output', label: 'Output', tip: 'Connects the patch to the master output.' },
    { type: 'midiInput', label: 'MIDI Input', tip: 'Pitch (V/Oct), gate and velocity signals from your MIDI device.', style: { borderColor: '#F6E05E', color: '#F6E05E' } },
];

export default Sidebar;
