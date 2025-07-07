import React from 'react';

// --- STYLES ---

const selectStyles: React.CSSProperties = {
    width: '100%',
    padding: '8px',
    boxSizing: 'border-box',
    borderRadius: '4px',
    border: '1px solid #555',
    background: '#333',
    color: '#E0E0E0',
    outline: 'none',
};

// --- PROPS INTERFACE ---

interface BpmSyncControlProps {
    value: string; // e.g., "1/4", "1/8t"
    onChange: (newDivision: string) => void;
}

// --- Note Divisions ---
// These are common musical subdivisions.
const noteDivisions = [
    "1/64t", "1/64", "1/32t", "1/32", "1/16t", "1/16", "1/8t", "1/8", 
    "1/4t", "1/4", "1/2t", "1/2", "1/1"
];


// --- MAIN COMPONENT ---

export const BpmSyncControl: React.FC<BpmSyncControlProps> = ({ value, onChange }) => {
    
    const handleSelectionChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        onChange(e.target.value);
    };

    return (
        <select
            style={selectStyles}
            value={value}
            onChange={handleSelectionChange}
        >
            {noteDivisions.map(division => (
                <option key={division} value={division}>
                    {division}
                </option>
            ))}
        </select>
    );
};