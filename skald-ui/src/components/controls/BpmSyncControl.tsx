import React from 'react';
import { SYNC_RATE_OPTIONS } from '../../definitions/bpm';

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

// Note divisions come from the shared SYNC_RATE_OPTIONS constant so this
// dropdown and the on-node sync-rate selects always offer the same list —
// they edit the same stored `syncRate` value.
const noteDivisions = SYNC_RATE_OPTIONS;


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