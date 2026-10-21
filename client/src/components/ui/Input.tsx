import React from 'react';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
  icon?: React.ReactNode;
  fullWidth?: boolean;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  (
    {
      label,
      error,
      helperText,
      icon,
      fullWidth = true,
      className = '',
      id,
      disabled,
      ...props
    },
    ref
  ) => {
    const inputId = id || (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined);

    return (
      <div className={`${fullWidth ? 'w-full' : ''} text-left`}>
        {label && (
          <label
            htmlFor={inputId}
            className="block text-xs font-semibold text-slate-700 mb-1.5"
          >
            {label}
          </label>
        )}
        <div className="relative flex items-center">
          {icon && (
            <div className="absolute left-3 text-slate-400 pointer-events-none flex items-center justify-center">
              {icon}
            </div>
          )}
          <input
            id={inputId}
            ref={ref}
            disabled={disabled}
            className={`
              block w-full rounded-lg border text-sm transition-colors
              px-3 py-2 bg-white text-slate-900 placeholder:text-slate-400
              focus:outline-none focus:ring-2
              disabled:bg-slate-50 disabled:text-slate-500 disabled:cursor-not-allowed
              ${icon ? 'pl-9' : ''}
              ${
                error
                  ? 'border-rose-400 focus:border-rose-500 focus:ring-rose-200 text-rose-900'
                  : 'border-slate-300 focus:border-blue-500 focus:ring-blue-100 hover:border-slate-400'
              }
              ${className}
            `}
            {...props}
          />
        </div>
        {error ? (
          <p className="mt-1 text-xs text-rose-600 font-medium">{error}</p>
        ) : helperText ? (
          <p className="mt-1 text-xs text-slate-500">{helperText}</p>
        ) : null}
      </div>
    );
  }
);

Input.displayName = 'Input';
