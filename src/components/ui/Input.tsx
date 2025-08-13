import React from 'react';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
  inputGroupText?: string;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(({
  label,
  error,
  helperText,
  inputGroupText,
  className = '',
  id,
  ...props
}, ref) => {
  const inputId = id || `input-${Math.random().toString(36).substr(2, 9)}`;
  const inputClasses = `form-control ${error ? 'is-invalid' : ''} ${className}`;

  const renderInput = () => (
    <input
      ref={ref}
      id={inputId}
      className={inputClasses}
      {...props}
    />
  );

  return (
    <div className="mb-3">
      {label && (
        <label htmlFor={inputId} className="form-label">
          {label}
        </label>
      )}
      
      {inputGroupText ? (
        <div className="input-group">
          {renderInput()}
          <span className="input-group-text">{inputGroupText}</span>
        </div>
      ) : (
        renderInput()
      )}
      
      {error && (
        <div className="invalid-feedback d-block">
          {error}
        </div>
      )}
      
      {helperText && !error && (
        <div className="form-text">
          {helperText}
        </div>
      )}
    </div>
  );
});

Input.displayName = 'Input';