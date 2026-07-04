/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Дорогие глубокие цвета из гайдлайна
        bgMain: '#070A14',          // Основной фон Premium Dark
        bgSec: '#0D1222',           // Второй фон (для глубины и подложек)
        bgCard: '#111827',          // Базовый цвет премиум-карточек
        borderCard: 'rgba(255, 255, 255, 0.08)', // Деликатная полупрозрачная граница
        
        textPrimary: '#F8FAFC',     // Чистый контрастный текст
        textSecondary: '#A6ADC8',   // Вторичный благородный приглушенный текст
        
        // Акцентная неоновая палитра
        accentPurple: '#7C3AED',    // Главный неоновый фиолетовый
        accentViolet: '#9D4EDD',    // Дополнительный фиолетовый
        accentPink: '#C026D3',      // Дополнительный розовый
        
        // Статусные цвета премиум-класса
        success: '#22C55E',         // Зеленый для прибыли
        error: '#EF4444',           // Красный для ошибок/деструктивных действий
        info: '#3B82F6',            // Синий для информации
      },
      fontFamily: {
        // Подключаем премиальный шрифт Inter
        sans: ['Inter', 'SF Pro Display', 'sans-serif'],
      },
      borderRadius: {
        // Радиусы скругления строго по гайдлайну
        'card': '24px',             // Премиум-карточки (24-30px)
        'btn': '18px',              // Большие кнопки (18-22px)
        'app-xs': '12px',           // Малые элементы управления
      },
      boxShadow: {
        // Многослойная парящая тень без использования дешевых box-shadow
        'premium': '0 12px 40px -12px rgba(0, 0, 0, 0.7), inset 0 1px 0 0 rgba(255, 255, 255, 0.08)',
        
        // Фирменное неоновое свечение для активных элементов (Purple Glow)
        'glow-purple': '0 0 20px rgba(124, 58, 237, 0.35), 0 0 40px rgba(192, 38, 211, 0.15)',
        
        // Легкое внутреннее свечение для Glassmorphism карточек
        'glass-inner': 'inset 0 1px 1px 0 rgba(255, 255, 255, 0.05)',
      },
      backgroundImage: {
        // Благородный неоновый градиент Purple → Violet → Pink
        'accent-gradient': 'linear-gradient(135deg, #7C3AED 0%, #9D4EDD 50%, #C026D3 100%)',
        // Мягкий темный градиент для премиального фона
        'dark-radial': 'radial-gradient(circle at 50% 0%, #0D1222 0%, #070A14 100%)',
      },
      animation: {
        // Мягкий пульсирующий неоновый свет
        'neon-pulse': 'neonPulse 2.5s infinite ease-in-out',
        // Медленное парение элементов (Float)
        'float': 'float 4s infinite ease-in-out',
      },
      keyframes: {
        neonPulse: {
          '0%, 100%': { opacity: '0.8', filter: 'drop-shadow(0 0 15px rgba(124, 58, 237, 0.3))' },
          '50%': { opacity: '1', filter: 'drop-shadow(0 0 30px rgba(192, 38, 211, 0.6))' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-6px)' },
        },
      },
    },
  },
  plugins: [],
}
