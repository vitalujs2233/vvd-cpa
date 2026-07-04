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
  size = 'lg',
  isLoading = false,
  hapticEffect = 'light',
  className = '',
  disabled,
  onClick,
  ...props
}) => {
  // Базовые стили с изящной кривой Безье для плавной анимации (Lift & Scale)
  const baseStyles = 'inline-flex items-center justify-center font-bold transition-all duration-300 outline-none select-none active:scale-[0.97] active:translate-y-0 disabled:opacity-40 disabled:pointer-events-none whitespace-nowrap';

  // Люксовые цветовые схемы строго из золотого гайдлайна (без фиолетового цвета)
  const variantStyles = {
    // Золотой премиум-градиент со сверкающим золотым свечением (Glow Gold) и темным текстом
    primary: 'bg-gold-gradient text-bgMain shadow-glow-gold hover:shadow-[0_0_30px_rgba(246,196,83,0.5),0_0_50px_rgba(212,175,55,0.25)] hover:-translate-y-[1.5px] hover:scale-[1.01]',
    
    // Полупрозрачная стеклянная кнопка со слабым внутренним свечением
    secondary: 'bg-white/[0.04] text-textPrimary border border-white/10 hover:bg-white/[0.08] hover:-translate-y-[1px]',
    
    // Тонкая рамка для второстепенных действий
    outline: 'bg-transparent text-textPrimary border border-borderCard hover:bg-white/[0.02]',
    
    // Элегантный зеленый градиент для выплат
    success: 'bg-gradient-to-r from-success to-success/90 text-white shadow-[0_0_20px_rgba(34,197,94,0.25)] hover:shadow-[0_0_30px_rgba(34,197,94,0.45)] hover:-translate-y-[1px]',
    
    // Красный градиент для опасных действий
    danger: 'bg-gradient-to-r from-error to-error/90 text-white shadow-[0_0_20px_rgba(239,68,68,0.25)] hover:bg-error/95',
  };

  // Размеры кнопок под мобильные стандарты
  const sizeStyles = {
    sm: 'px-4 py-2 text-xs h-[38px] rounded-app-xs',       // Малые кнопки внутри карточек
    md: 'px-5 py-2.5 text-xs h-[46px] rounded-app-xs',     // Средние кнопки
    lg: 'px-8 py-4 text-sm h-[54px] rounded-btn w-full',   // Большие люксовые кнопки (54px высота, 18px скругление)
  };

  const handlePress = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (disabled || isLoading) return;

    // Вызываем нативный тактильный сигнал в момент физического касания на телефоне
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
        <div className="flex items-center justify-center gap-8">
          {/* Минималистичный премиум-лоадер */}
          <div className="relative w-4 h-4">
            <div className="absolute inset-0 rounded-full border-2 border-bgMain/20"></div>
            <div className="absolute inset-0 rounded-full border-2 border-t-bgMain animate-spin"></div>
          </div>
          <span className="text-xs text-bgMain/90">Пожалуйста, подождите...</span>
        </div>
      ) : (
        children
      )}
    </button>
  );
};
