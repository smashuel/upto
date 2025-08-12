import React from 'react';

interface CardProps {
  children: React.ReactNode;
  className?: string;
  header?: React.ReactNode;
  footer?: React.ReactNode;
  variant?: 'default' | 'adventure' | 'step';
}

export const Card: React.FC<CardProps> = ({
  children,
  className = '',
  header,
  footer,
  variant = 'default'
}) => {
  const getCardClasses = () => {
    const baseClasses = 'card';
    const variantClasses = {
      default: '',
      adventure: 'adventure-card',
      step: 'step-card'
    };
    
    return `${baseClasses} ${variantClasses[variant]} ${className}`;
  };

  return (
    <div className={getCardClasses()}>
      {header && (
        <div className="card-header">
          {header}
        </div>
      )}
      
      <div className="card-body">
        {children}
      </div>
      
      {footer && (
        <div className="card-footer">
          {footer}
        </div>
      )}
    </div>
  );
};