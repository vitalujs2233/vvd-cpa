// Мы заменили локальный адрес http://localhost:8000 на ваш реальный живой адрес бэкенда на Render
const API_BASE_URL = 'https://vvd-cpa.onrender.com/api/v1';

/**
 * Безопасное сохранение JWT-токена сессии в локальную память браузера.
 */
export const saveAuthToken = (token: string): void => {
  localStorage.setItem('vvd_cpa_jwt_token', token);
};

/**
 * Получение текущего JWT-токена из локальной памяти.
 */
export const getAuthToken = (): string | null => {
  return localStorage.getItem('vvd_cpa_jwt_token');
};

/**
 * Удаление JWT-токена из памяти (выход из аккаунта).
 */
export const removeAuthToken = (): void => {
  localStorage.removeItem('vvd_cpa_jwt_token');
};

/**
 * Универсальный асинхронный типизированный хелпер запросов (альтернатива Axios на базе fetch).
 * Автоматически подставляет базовый адрес API, прикрепляет JWT-токен в заголовки
 * и обрабатывает ошибки сервера.
 */
export const apiRequest = async <T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> => {
  const url = `${API_BASE_URL}${endpoint}`;
  const token = getAuthToken();

  // Оптимизировано: Объявили заголовки как Record<string, string> для строгого и безопасного маппинга в TS
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((options.headers as Record<string, string>) || {}),
  };

  // Если в памяти браузера сохранен JWT-токен сессии,
  // автоматически прикрепляем его в заголовок Authorization для всех запросов
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const config: RequestInit = {
    ...options,
    headers,
  };

  try {
    const response = await fetch(url, config);

    // Если сервер вернул ошибку, извлекаем ее текст
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.detail || `Ошибка сервера: ${response.status}`);
    }

    // Возвращаем результат в нужном типе данных
    return (await response.json()) as T;
  } catch (error) {
    console.error(`Сетевая ошибка при запросе к ${endpoint}:`, error);
    throw error;
  }
};

/**
 * Описание типов данных ответа сервера на запрос авторизации
 */
export interface AuthResponse {
  access_token: string;
  token_type: string;
  user: {
    telegram_id: number;
    first_name: string;
    last_name?: string;
    username?: string;
    photo_url?: string;
    role: string;
    status: string;
  };
}

/**
 * Сетевой POST-запрос авторизации:
 * Отправляет initData в FastAPI бэкенд для проверки подписи и регистрации.
 */
export const loginViaTelegramApi = async (initData: string): Promise<AuthResponse> => {
  return apiRequest<AuthResponse>('/auth/telegram', {
    method: 'POST',
    body: JSON.stringify({ init_data: initData }),
  });
};
