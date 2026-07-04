import React, { forwardRef } from 'react';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  icon?: React.ReactNode;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(({
  label,
  error,
  icon,
  className = '',
  disabled,
  ...props
}, ref) => {
  // Базовая обертка поля ввода с принудительной разблокировкой выделения текста на смартфонах
  const wrapperStyles = 'flex flex-col w-full text-left select-text';

  // Контейнер самого инпута (Glassmorphism, высота 48px, скругление 12px)
  const inputContainerStyles = `
    relative flex items-center bg-bgCard/35 backdrop-blur-md border rounded-app-xs transition-all duration-300 overflow-hidden h-12 shadow-glass-inner
    ${error 
      ? 'border-error/40 focus-within:border-error focus-within:shadow-[0_0_15px_rgba(239,68,68,0.15)]' 
      : 'border-borderCard focus-within:border-accentPurple/60 focus-within:shadow-[0_0_15px_rgba(124,58,237,0.1)]'}
    ${disabled ? 'opacity-40 pointer-events-none' : ''}
  `;

  // Стили текстового поля
  const baseInputStyles = 'w-full h-full bg-transparent px-4 text-sm text-textPrimary outline-none placeholder:text-textSecondary/50 placeholder:text-xs select-text';

  return (
    <div className={`${wrapperStyles} ${className}`}>
      {/* Элегантный премиальный лейбл в верхнем регистре */}
      {label && (
        <label className="text-[10px] text-textSecondary/80 font-bold uppercase tracking-wider mb-2 px-1">
          {label}
        </label>
      )}

      {/* Область ввода */}
      <div className={inputContainerStyles}>
        {/* Иконка слева (например, лупа для поиска) */}
        {icon && (
          <div className="flex items-center justify-center pl-4 pr-1 text-textSecondary/60">
            {icon}
          </div>
        )}
        
        <input
          ref={ref}
          className={`${baseInputStyles} ${icon ? 'pl-2' : ''}`}
          disabled={disabled}
          {...props}
        />
      </div>

      {/* Ошибка валидации с мягким появлением */}
      {error && (
        <span className="text-[10px] text-error mt-1.5 px-1 font-semibold tracking-wide animate-fade-in">
          {error}
        </span>
      )}
    </div>
  );
});

Input.displayName = 'Input';
