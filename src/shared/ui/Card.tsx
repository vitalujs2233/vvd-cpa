import React from 'react';

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  variant?: 'default' | 'accent' | 'outlined' | 'glow';
  padding?: 'none' | 'sm' | 'md' | 'lg';
  clickable?: boolean;
}

export const Card: React.FC<CardProps> = ({
  children,
  variant = 'default',
  padding = 'md',
  clickable = false,
  className = '',
  ...props
}) => {
  // Базовая плавная анимация переходов, парящих теней и скругления 24px (rounded-card)
  const baseStyles = 'transition-all duration-300 rounded-card overflow-hidden w-full';
  
  // Дорогие Luxury стили оформления карточек
  const variantStyles = {
    // Glassmorphism подложка со внутренним свечением и тонкой границей 8%
    default: 'glass-card text-textPrimary',
    
    // Премиальный переливающийся градиент VVD CPA
    accent: 'bg-accent-gradient text-white border border-accentPink/30 shadow-premium',
    
    // Чистая парящая неоновая подложка с мягким фиолетово-розовым свечением
    glow: 'glass-card text-textPrimary shadow-glow-purple border-accentPurple/20',
    
    // Прозрачная карточка с тонкой рамкой для второстепенных списков
    outlined: 'bg-transparent border border-borderCard text-textPrimary shadow-glass-inner',
  };

  // Luxury-отступы из нашей сетки
  const paddingStyles = {
    none: 'p-0',
    sm: 'p-12', // 12px
    md: 'p-20', // 20px
    lg: 'p-24', // 24px
  };

  // Высококлассная микро-анимация при касании на мобильном экране (Lift & Scale)
  const clickableStyles = clickable
    ? 'cursor-pointer active:scale-[0.98] active:translate-y-[1px] hover:border-accentPurple/40 duration-200'
    : '';

  return (
    <div
      className={`${baseStyles} ${variantStyles[variant]} ${paddingStyles[padding]} ${clickableStyles} ${className}`}
      {...props}
    >
      {children}
    </div>
  );
};
