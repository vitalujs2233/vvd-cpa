import React from 'react';
import { triggerHaptic } from '@/shared/lib/telegram';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  children: React.ReactNode;
  variant?: 'primary' | 'secondary' | 'danger' | 'success' | 'outline';
  size?: 'sm' | 'md' | 'lg';
  isLoading?: boolean;
  hapticEffect?: 'light' | 'medium' | 'success' | 'none';
}

export const Button: React.FC<ButtonProps> = ({
  children,
  variant = 'primary',
  size = 'md',
  isLoading = false,
  hapticEffect = 'light',
  className = '',
  disabled,
  onClick,
  ...props
}) => {
  // Базовые стили кнопки (закругление, выравнивание, тактильное сжатие при нажатии пальцем)
  const baseStyles = 'inline-flex items-center justify-center font-medium rounded-app-xs transition-all duration-150 outline-none select-none active:scale-[0.97] disabled:opacity-50 disabled:pointer-events-none whitespace-nowrap';

  // Цветовые схемы на основе дизайн-системы макета
  const variantStyles = {
    primary: 'bg-accent text-white hover:bg-accent/90 focus:ring-2 focus:ring-accent/40',
    secondary: 'bg-accentDark text-white hover:bg-accentDark/80 focus:ring-2 focus:ring-accentDark/40',
    outline: 'bg-transparent text-white border border-gray-800 hover:bg-white/5',
    success: 'bg-success text-white hover:bg-success/90 focus:ring-2 focus:ring-success/40',
    danger: 'bg-error text-white hover:bg-error/90 focus:ring-2 focus:ring-error/40',
  };

  // Размеры кнопок под разные интерфейсные задачи
  const sizeStyles = {
    sm: 'px-3 py-1.5 text-xs h-8',
    md: 'px-4 py-2.5 text-sm h-10',
    lg: 'px-6 py-3.5 text-sm h-12 w-full', // Широкая полноразмерная кнопка
  };

  const handlePress = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (disabled || isLoading) return;

    // Вызываем соответствующий тип вибрации на смартфоне в момент физического тапа
    if (hapticEffect === 'light') triggerHaptic.lightImpact();
    else if (hapticEffect === 'medium') triggerHaptic.mediumImpact();
    else if (hapticEffect === 'success') triggerHaptic.success();

    if (onClick) {
      onClick(e);
    }
  };

  return (
    <button
      className={`${baseStyles} ${variantStyles[variant]} ${sizeStyles[size]} ${className}`}
      disabled={disabled || isLoading}
      onClick={handlePress}
      {...props}
    >
      {isLoading ? (
        <div className="flex items-center justify-center">
          <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          <span className="text-xs">Загрузка...</span>
        </div>
      ) : (
        children
      )}
    </button>
  );
};
