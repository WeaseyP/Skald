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
