/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Палитра из дизайн-системы макета
        bgDark: '#0B0E14',      // Основной фон приложения
        bgCard: '#151B24',      // Второстепенный фон/карточки
        accent: '#7B5CFF',      // Основной фиолетовый акцент
        accentDark: '#1F223D',  // Темный фиолетовый (для подложек)
        success: '#2ECB5E',     // Зеленый (доходы, активные статусы)
        warning: '#F59E0B',     // Желтый/оранжевый (холд, предупреждения)
        error: '#EF4444',       // Красный (удаление аккаунта, ошибки)
        textMuted: '#A1A1AA',   // Серый приглушенный текст (подписи)
        textSec: '#E4E4E7',     // Светло-серый второстепенный текст
      },
      fontFamily: {
        // Семейство шрифтов Inter из макета
        sans: ['Inter', 'sans-serif'],
      },
      borderRadius: {
        // Радиусы скругления углов из макета (4px, 8px, 12px, 16px, 20px)
        'app-xs': '4px',
        'app-sm': '8px',
        'app-md': '12px',
        'app-lg': '16px',
        'app-xl': '20px',
      },
      spacing: {
        // Основные отступы из макета (4px, 8px, 12px, 16px, 20px, 32px)
        '4': '4px',
        '8': '8px',
        '12': '12px',
        '16': '16px',
        '20': '20px',
        '32': '32px',
      },
    },
  },
  plugins: [],
}
