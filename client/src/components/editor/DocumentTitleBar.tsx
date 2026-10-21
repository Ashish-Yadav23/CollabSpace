import React, { useState, useEffect } from 'react';

export interface DocumentTitleBarProps {
  title: string;
  onTitleChange: (newTitle: string) => void;
  isReadOnly?: boolean;
  className?: string;
}

export const DocumentTitleBar: React.FC<DocumentTitleBarProps> = ({
  title,
  onTitleChange,
  isReadOnly = false,
  className = '',
}) => {
  const [localTitle, setLocalTitle] = useState(title);

  useEffect(() => {
    setLocalTitle(title);
  }, [title]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setLocalTitle(val);
    onTitleChange(val);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === 'Escape') {
      e.currentTarget.blur();
    }
  };

  return (
    <div className={`flex items-center space-x-2 ${className}`}>
      <input
        type="text"
        value={localTitle}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        disabled={isReadOnly}
        placeholder="Untitled Document"
        aria-label="Document Title"
        className={`text-lg font-semibold text-gray-800 bg-transparent rounded px-2 py-1 transition-colors border border-transparent ${
          isReadOnly
            ? 'cursor-default text-gray-700 bg-gray-50 focus:outline-none'
            : 'hover:border-gray-300 focus:border-blue-500 focus:bg-white focus:outline-none focus:ring-1 focus:ring-blue-500'
        }`}
      />
      {isReadOnly && (
        <span className="text-xs bg-amber-100 text-amber-800 font-medium px-2 py-0.5 rounded-full select-none">
          View only
        </span>
      )}
    </div>
  );
};
