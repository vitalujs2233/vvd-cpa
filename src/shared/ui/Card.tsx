import React from 'react';

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  variant?: 'default' | 'accent' | 'outlined';
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
  // Базовые классы анимации, границ и переполнения контента
  const baseStyles = 'transition-all duration-200 border w-full overflow-hidden';
  
  // Цветовые схемы на основе токенов из tailwind.config.js
  const variantStyles = {
    default: 'bg-bgCard border-gray-800/40 text-white',
    accent: 'bg-accentDark border-accent/20 text-white',
    outlined: 'bg-transparent border-gray-800/80 text-white',
  };

  // Соответствие сетке отступов из макета (8px, 12px, 16px)
  const paddingStyles = {
    none: 'p-0',
    sm: 'p-8',
    md: 'p-12',
    lg: 'p-16',
  };

  // Скругление углов по умолчанию по макету (rounded-app-md = 12px)
  const radiusStyles = 'rounded-app-md';

  // Эффект нажатия (Scale Down) для тач-скринов мобильных телефонов
  const clickableStyles = clickable
    ? 'cursor-pointer active:scale-[0.98] hover:border-accent/40'
    : '';

  return (
    <div
      className={`${baseStyles} ${variantStyles[variant]} ${paddingStyles[padding]} ${radiusStyles} ${clickableStyles} ${className}`}
      {...props}
    >
      {children}
    </div>
  );
};
