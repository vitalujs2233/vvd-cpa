import type { TelegramUser, TelegramWebApp } from '@/types/telegram';

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
      return JSON.parse(savedUser);
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
