import React, { useState } from 'react';

interface NamePromptModalProps {
  title: string;
  defaultValue?: string;
  onNameConfirm: (name: string) => void;
  onCancel: () => void;
}

export const NamePromptModal: React.FC<NamePromptModalProps> = ({ title, defaultValue = '', onNameConfirm, onCancel }) => {
  const [name, setName] = useState(defaultValue);

  const handleConfirm = () => {
    if (name.trim() !== '') {
      onNameConfirm(name);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50">
      <div className="bg-gray-800 p-6 rounded-lg shadow-lg text-white">
        <h3 className="text-lg font-bold mb-4">{title}</h3>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Enter instrument name"
          className="bg-gray-700 text-white w-full p-2 rounded mb-4"
          autoFocus
        />
        <div className="flex justify-end space-x-2">
          <button
            onClick={onCancel}
            className="bg-gray-600 hover:bg-gray-500 text-white font-bold py-2 px-4 rounded"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            className="bg-blue-600 hover:bg-blue-500 text-white font-bold py-2 px-4 rounded"
          >
            Create
          </button>
        </div>
      </div>
    </div>
  );
};

export default NamePromptModal;
