/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Палитра Gold Premium строго по спецификации
        bgMain: '#070707',          // Глубокий почти черный цвет фона
        bgSec: '#0D0D0D',           // Вторичный черный фон (индиго-оттенок)
        bgCard: '#111111',          // Оформление премиум-карточек
        borderCard: 'rgba(255, 255, 255, 0.08)', // Деликатная рамка
        
        textPrimary: '#FFFFFF',     // Чистый белый текст
        textSecondary: '#A6ADC8',   // Благородный приглушенный текст
        
        // Акцентное золото (Gold Gradient)
        accentGold: '#D4AF37',      // Благородное золото
        accentBrightGold: '#F6C453',// Яркое золото
        accentLightGold: '#FFE08A', // Сверкающий золотой свет
        
        // Статусные цвета Premium SaaS
        success: '#22C55E',         // Зеленый для прибыли
        error: '#EF4444',           // Красный для ошибок
        info: '#3B82F6',            // Синий для информации
      },
      fontFamily: {
        // Подключаем премиальный шрифт Inter
        sans: ['Inter', 'SF Pro Display', 'sans-serif'],
      },
      borderRadius: {
        // Скругления строго по спецификации
        'card': '24px',             // Карточки: 24 px
        'btn': '18px',              // Кнопки: 18–20 px
        'badge': '14px',            // Бейджи: 14 px
        'app-xs': '12px',           // Малые элементы
      },
      boxShadow: {
        // Многослойные парящие тени без дешевых box-shadow
        'premium': '0 16px 40px -10px rgba(0, 0, 0, 0.85), inset 0 1px 1px 0 rgba(255, 255, 255, 0.12)',
        
        // Фирменное неоновое золотое свечение (Gold Premium Glow)
        'glow-gold': '0 0 20px rgba(246, 196, 83, 0.35), 0 0 40px rgba(212, 175, 55, 0.18)',
        
        // Легкое внутреннее свечение для Glassmorphism
        'glass-inner': 'inset 0 1px 1px 0 rgba(255, 255, 255, 0.15)',
      },
      backgroundImage: {
        // Роскошный золотой градиент Gold Premium (Light Gold → Gold → Bright Gold)
        'gold-gradient': 'linear-gradient(135deg, #FFE08A 0%, #D4AF37 50%, #F6C453 100%)',
        // Мягкий темный градиент для премиального фона
        'dark-radial': 'radial-gradient(circle at 50% 0%, #0D0D0D 0%, #070707 100%)',
      },
      animation: {
        // Мягкий пульсирующий неоновый свет золота
        'neon-pulse': 'neonPulse 2.5s infinite ease-in-out',
        // Медленное парение элементов (Float)
        'float': 'float 4s infinite ease-in-out',
      },
      keyframes: {
        neonPulse: {
          '0%, 100%': { opacity: '0.8', filter: 'drop-shadow(0 0 15px rgba(246, 196, 83, 0.3))' },
          '50%': { opacity: '1', filter: 'drop-shadow(0 0 30px rgba(212, 175, 55, 0.55))' },
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
