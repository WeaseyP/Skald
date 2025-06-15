// src/components/CodePreviewPanel.tsx

import React, { useState } from 'react';

const panelStyles: React.CSSProperties = {
  padding: '15px',
  borderLeft: '1px solid #ddd',
  display: 'flex',
  flexDirection: 'column',
  height: '100%',
  boxSizing: 'border-box'
};

const preStyles: React.CSSProperties = {
    backgroundColor: '#2e2e2e',
    color: '#d4d4d4',
    padding: '10px',
    borderRadius: '4px',
    flexGrow: 1,
    overflow: 'auto',
    whiteSpace: 'pre-wrap',
    fontFamily: 'monospace'
}

const buttonContainerStyles: React.CSSProperties = {
    display: 'flex',
    gap: '10px',
    marginTop: '10px'
};

const baseButtonStyles: React.CSSProperties = {
    flexGrow: 1,
    padding: '10px',
    color: 'white',
    border: 'none',
    borderRadius: '5px',
    cursor: 'pointer',
    fontSize: '14px',
    transition: 'background-color 0.2s'
};

const copyButtonStyles: React.CSSProperties = {
    ...baseButtonStyles,
    backgroundColor: '#1971c2',
};

const closeButtonStyles: React.CSSProperties = {
    ...baseButtonStyles,
    backgroundColor: '#e03131',
};

interface CodePreviewProps {
    code: string;
    onClose: () => void;
}

const CodePreviewPanel: React.FC<CodePreviewProps> = ({ code, onClose }) => {
  const [isCopied, setIsCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(code).then(() => {
        setIsCopied(true);
        setTimeout(() => setIsCopied(false), 2000); // Reset button text after 2 seconds
    }).catch(err => {
        console.error('Failed to copy: ', err);
        alert('Failed to copy code to clipboard.');
    });
  };

  return (
    <div style={panelStyles}>
      <h2>Generated Code</h2>
      <pre style={preStyles}>
        <code>{code}</code>
      </pre>
      <div style={buttonContainerStyles}>
        <button style={copyButtonStyles} onClick={handleCopy} disabled={isCopied}>
            {isCopied ? 'Copied!' : 'Copy Code'}
        </button>
        <button style={closeButtonStyles} onClick={onClose}>Close</button>
      </div>
    </div>
  );
};

export default CodePreviewPanel;