import React from 'react';

export const NodeTheme = {
    colors: {
        background: '#2D3748',
        border: '#5A67D8',
        text: '#E2E8F0',
        textMuted: '#A0AEC0',
        handleIn: '#90CDF4',
        handleOut: '#68D391',
        divider: '#4A5568',
        inputBg: '#1A202C',
        inputBorder: '#4A5568',
    },
    layout: {
        borderRadius: '8px',
        padding: '10px',
        minWidth: '160px',
        handleSize: '8px',
    }
};

export const commonNodeStyles: React.CSSProperties = {
    background: NodeTheme.colors.background,
    border: `2px solid ${NodeTheme.colors.border}`,
    borderRadius: NodeTheme.layout.borderRadius,
    padding: NodeTheme.layout.padding,
    color: NodeTheme.colors.text,
    minWidth: NodeTheme.layout.minWidth,
    fontFamily: 'Inter, system-ui, sans-serif',
    boxShadow: '0 4px 6px rgba(0,0,0,0.3)',
};

export const nodeHeaderStyles: React.CSSProperties = {
    textAlign: 'center',
    marginBottom: '10px',
    fontWeight: 600,
    borderBottom: `1px solid ${NodeTheme.colors.divider}`,
    paddingBottom: '5px',
    fontSize: '0.9em',
};

export const handleContainerStyles: React.CSSProperties = {
    position: 'relative',
    height: '24px',
    display: 'flex',
    alignItems: 'center',
    margin: '2px 0'
};

export const labelStyles: React.CSSProperties = {
    fontSize: '0.8em',
    color: NodeTheme.colors.textMuted,
    pointerEvents: 'none'
};

export const inputGroupStyles: React.CSSProperties = {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    fontSize: '0.75em',
    marginBottom: '5px'
};

export const numberInputStyles: React.CSSProperties = {
    background: NodeTheme.colors.inputBg,
    border: `1px solid ${NodeTheme.colors.inputBorder}`,
    color: NodeTheme.colors.text,
    borderRadius: '4px',
    padding: '2px 5px',
    fontSize: '1em',
    width: '50px'
};

export const selectStyles: React.CSSProperties = {
    ...numberInputStyles,
    width: 'auto',
    maxWidth: '110px',
};

// One FIXED accent color per node type, used for the border and header of
// every node — the color is the node's identity and never changes between
// sessions or views. Grouped by role: warm = sound sources, purple =
// modulators, green = envelopes, blue/teal = tone & time, red = drive,
// grey/yellow = utilities, indigo = structure.
export const NODE_ACCENTS: Record<string, string> = {
    oscillator: '#F6AD55', // orange — primary source
    wavetable:  '#ED8936', // deep orange — morphing source
    fmOperator: '#F687B3', // pink — FM source
    noise:      '#E2E8F0', // white — noise source
    lfo:        '#B794F4', // purple — modulator
    sampleHold: '#9F7AEA', // deep purple — stepped modulator
    adsr:       '#68D391', // green — envelope
    filter:     '#63B3ED', // blue — tone shaping
    delay:      '#4FD1C5', // teal — time FX
    reverb:     '#38B2AC', // deep teal — space FX
    distortion: '#FC8181', // red — drive
    mixer:      '#A0AEC0', // grey — utility
    gain:       '#D6BCFA', // lilac — level utility
    panner:     '#76E4F7', // cyan — stereo utility
    mapper:     '#FAF089', // pale yellow — math utility
    midiInput:  '#F6E05E', // yellow — external input
    output:     '#F97316', // burnt orange — destination
    instrument: '#7F9CF5', // indigo — structure
    group:      '#718096', // slate — structure
    InstrumentInput:  '#F97316',
    InstrumentOutput: '#F97316',
};

export const accentFor = (type?: string): string =>
    NODE_ACCENTS[type ?? ''] ?? NodeTheme.colors.border;

// Shell + header carrying the type accent. Every node builds from these so
// the visual language stays uniform.
export const nodeShellStyles = (accent: string): React.CSSProperties => ({
    ...commonNodeStyles,
    border: `2px solid ${accent}`,
});

export const nodeHeaderStylesFor = (accent: string): React.CSSProperties => ({
    ...nodeHeaderStyles,
    color: accent,
    borderBottom: `1px solid ${accent}`,
});
