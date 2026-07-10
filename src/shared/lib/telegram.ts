// Мы полностью убрали неверный импорт из первой строки. 
// Все типы автоматически и без ошибок подгружаются из глобального файла telegram.d.ts

// Безопасный доступ к Telegram WebApp API
export const tg: TelegramWebApp | undefined = 
  typeof window !== 'undefined' ? window.Telegram?.WebApp : undefined;

// Флаг, указывающий, запущено ли приложение внутри Telegram
export const isTelegramAvailable = typeof window !== 'undefined' && !!window.Telegram?.WebApp;

// Демонстрационные данные, привязанные строго к вашему ID для бесшовного тестирования на ПК
const MOCK_USER: TelegramUser = {
  id: 232682307,        // Ваш реальный Telegram ID
  first_name: 'Виталий', // Ваше имя из профиля
  last_name: 'lv',       // Ваша фамилия из профиля
  username: 'VILITOLU',  // Ваш юзернейм из профиля
  language_code: 'ru',
  photo_url: '',         
};

/**
 * Возвращает проверенные данные пользователя из базы данных Supabase (сохраненные в localStorage бэкендом),
 * либо извлекает сырые данные из Telegram WebApp API,
 * либо возвращает демонстрационного Виталия при локальной разработке.
 */
export const getTelegramUser = (): TelegramUser => {
  // В первую очередь пытаемся получить реальные проверенные данные из базы Supabase через localStorage
  const savedUser = typeof window !== 'undefined' ? localStorage.getItem('vvd_cpa_user_data') : null;
  if (savedUser) {
  try {
    const user = JSON.parse(savedUser);

    return {
      id: user.telegram_id,
      first_name: user.first_name,
      last_name: user.last_name,
      username: user.username,
      language_code: "ru",
      photo_url: user.photo_url,
    };
  } catch (error) {
    console.error("Ошибка парсинга сохраненных данных пользователя из БД:", error);
  }
}

  // Если проверенных данных в базе еще нет, возвращаем сырые данные Telegram SDK
  if (tg?.initDataUnsafe?.user) {
    return tg.initDataUnsafe.user;
  }
  
  // Возврат моковых данных при локальном тестировании
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
