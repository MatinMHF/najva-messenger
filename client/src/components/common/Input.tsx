import { InputHTMLAttributes, forwardRef, ReactNode } from 'react';
import './Input.css';

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  icon?: ReactNode;
  rightIcon?: ReactNode;
}

const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, icon, rightIcon, className = '', ...props }, ref) => {
    return (
      <div className={`input-group ${className}`}>
        {label && <label className="input-label">{label}</label>}
        <div className={`input-wrapper ${error ? 'input-error' : ''}`}>
          {icon && <span className="input-icon left">{icon}</span>}
          <input
            ref={ref}
            className={`input-field ${icon ? 'has-icon' : ''} ${rightIcon ? 'has-right-icon' : ''}`}
            {...props}
          />
          {rightIcon && <span className="input-icon right">{rightIcon}</span>}
        </div>
        {error && <span className="input-error-msg">{error}</span>}
      </div>
    );
  }
);

Input.displayName = 'Input';
export default Input;
