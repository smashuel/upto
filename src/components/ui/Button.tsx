import React from 'react';
import { LucideIcon } from 'lucide-react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'success' | 'light' | 'outline-primary' | 'outline-secondary' | 'outline-light' | 'ghost' | 'adventure' | 'sunrise' | 'mountain' | 'sky' | 'highland' | 'fjord';
  size?: 'sm' | 'md' | 'lg';
  icon?: LucideIcon;
  loading?: boolean;
  children: React.ReactNode;
}

export const Button: React.FC<ButtonProps> = ({
  variant = 'primary',
  size = 'md',
  icon: Icon,
  loading = false,
  children,
  className = '',
  disabled,
  type = 'button',
  ...props
}) => {
  const getBootstrapClasses = () => {
    const baseClass = 'btn';
    let variantClass;
    
    switch (variant) {
      case 'ghost':
        variantClass = 'btn-outline-secondary';
        break;
      case 'adventure':
        variantClass = 'btn-adventure';
        break;
      case 'sunrise':
        variantClass = 'btn-sunrise';
        break;
      case 'mountain':
        variantClass = 'btn-mountain';
        break;
      case 'sky':
        variantClass = 'btn-sky';
        break;
      case 'highland':
        variantClass = 'btn-highland';
        break;
      case 'fjord':
        variantClass = 'btn-fjord';
        break;
      default:
        variantClass = `btn-${variant}`;
    }
    
    const sizeClass = size !== 'md' ? `btn-${size}` : '';
    
    return [baseClass, variantClass, sizeClass, className]
      .filter(Boolean)
      .join(' ');
  };

  return (
    <button
      type={type}
      className={getBootstrapClasses()}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? (
        <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
      ) : Icon ? (
        <Icon size={16} className="me-2" />
      ) : null}
      {children}
    </button>
  );
};