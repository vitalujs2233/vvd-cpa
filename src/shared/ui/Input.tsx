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
  // Базовая обертка поля ввода с принудительной разблокировкой выделения текста
  const wrapperStyles = 'flex flex-col w-full text-left select-text';

  // Контейнер самого инпута (темная подложка, радиус 4px из макета)
  const inputContainerStyles = `
    relative flex items-center bg-bgCard border rounded-app-xs transition-all duration-200 overflow-hidden h-10
    ${error ? 'border-error/60 focus-within:border-error' : 'border-gray-800/40 focus-within:border-accent/80'}
    ${disabled ? 'opacity-50 pointer-events-none' : ''}
  `;

  // Стили самого текстового поля
  const baseInputStyles = 'w-full h-full bg-transparent px-3 text-sm text-white outline-none placeholder:text-textMuted placeholder:text-xs select-text';

  return (
    <div className={`${wrapperStyles} ${className}`}>
      {/* Лейбл инпута (если передан) */}
      {label && (
        <label className="text-xs text-textMuted font-medium mb-1.5 px-0.5">
          {label}
        </label>
      )}

      {/* Область ввода */}
      <div className={inputContainerStyles}>
        {/* Иконка слева (например, лупа для поиска) */}
        {icon && (
          <div className="flex items-center justify-center pl-3 pr-1 text-textMuted">
            {icon}
          </div>
        )}
        
        <input
          ref={ref}
          className={`${baseInputStyles} ${icon ? 'pl-1' : ''}`}
          disabled={disabled}
          {...props}
        />
      </div>

      {/* Ошибка валидации */}
      {error && (
        <span className="text-[10px] text-error mt-1 px-0.5 font-medium">
          {error}
        </span>
      )}
    </div>
  );
});

Input.displayName = 'Input';
