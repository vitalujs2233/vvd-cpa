// Мы убрали строчку импорта типов, так как они глобально видны из telegram.d.ts

// Безопасный доступ к Telegram WebApp API
export const tg: TelegramWebApp | undefined = 
  typeof window !== 'undefined' ? window.Telegram?.WebApp : undefined;

// Флаг, указывающий, запущено ли приложение внутри Telegram
export const isTelegramAvailable = typeof window !== 'undefined' && !!window.Telegram?.WebApp;

// Демо-данные из макета для разработки и тестирования в обычном браузере на компьютере
const MOCK_USER: TelegramUser = {
  id: 123456,
  first_name: 'John',
  last_name: 'Doe',
  username: 'johndoe',
  language_code: 'ru',
  photo_url: '', // Здесь может быть ссылка на аватар пользователя
};

/**
 * Возвращает реального пользователя из Telegram WebApp API,
 * либо возвращает демонстрационного John Doe при локальной разработке.
 */
export const getTelegramUser = (): TelegramUser => {
  if (tg?.initDataUnsafe?.user) {
    return tg.initDataUnsafe.user;
  }
  return MOCK_USER;
};

/**
 * Первичная инициализация WebApp приложения:
 * сообщает Telegram о готовности, разворачивает приложение во весь экран
 * и фиксирует темный цвет шапки и фона в соответствии с дизайн-макетом.
 */
export const initTelegramWebApp = (): void => {
  if (!tg) return;
  try {
    tg.ready();
    tg.expand();
    
    // Пытаемся установить цвет верхней панели и фона под макет (#0B0E14)
    if (typeof tg.setHeaderColor === 'function') {
      tg.setHeaderColor('#0B0E14');
    }
    if (typeof tg.setBackgroundColor === 'function') {
      tg.setBackgroundColor('#0B0E14');
    }
  } catch (error) {
    console.warn('Telegram WebApp инициализирован с предупреждением:', error);
  }
};

/**
 * Утилита для безопасного вызова вибрации устройства при действиях пользователя.
 * Если приложение запущено вне Telegram, вызовы будут проигнорированы без ошибок.
 */
export const triggerHaptic = {
  success: (): void => {
    if (tg?.HapticFeedback) {
      tg.HapticFeedback.notificationOccurred('success');
    }
  },
  error: (): void => {
    if (tg?.HapticFeedback) {
      tg.HapticFeedback.notificationOccurred('error');
    }
  },
  warning: (): void => {
    if (tg?.HapticFeedback) {
      tg.HapticFeedback.notificationOccurred('warning');
    }
  },
  lightImpact: (): void => {
    if (tg?.HapticFeedback) {
      tg.HapticFeedback.impactOccurred('light');
    }
  },
  mediumImpact: (): void => {
    if (tg?.HapticFeedback) {
      tg.HapticFeedback.impactOccurred('medium');
    }
  }
};
