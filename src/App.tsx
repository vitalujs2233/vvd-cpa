import React, { useState, useEffect } from 'react';
import { MemoryRouter, Routes, Route, NavLink, Outlet } from 'react-router-dom';
import { Home as HomeIcon, Grid, BarChart3, Flame, User } from 'lucide-react';
import { triggerHaptic } from '@/shared/lib/telegram';
import { Home } from '@/pages/home/Home';
import { Offers } from '@/pages/offers/Offers';
import { OfferDetail } from '@/pages/offers/OfferDetail';
import { Withdrawal } from '@/pages/withdrawal/Withdrawal';
import { Stats } from '@/pages/stats/Stats';
import { Dvizh } from '@/pages/dvizh/Dvizh';
import { Profile } from '@/pages/profile/Profile';
import { Admin } from '@/pages/admin/Admin';
// Импортируем наш личный тикет-чат как SupportChat
import { Chat as SupportChat } from '@/pages/chat/Chat';
import { Loader } from '@/shared/ui/Loader';

// Импортируем методы сетевого API и хелперы токенов
import { loginViaTelegramApi, saveAuthToken } from '@/shared/lib/api';

// Главный Лейаут приложения, фиксирующий Bottom Menu
const AppLayout = () => {
  const handleTabClick = () => {
    // Вызов легкого тактильного отклика на смартфоне при переключении табов
    triggerHaptic.lightImpact();
  };

  return (
    // bg-bgMain заменен на bg-transparent для открытия видимости неоновых волн и картинки bg.png на фоне
    <div
  className="flex flex-col w-full bg-transparent text-textPrimary relative"
  style={{
    height: "100dvh",
  }}
>
      
      {/* Контейнер контента со скроллом */}
      <div className="flex-1 overflow-y-auto scrollable-container relative z-10 w-full max-w-[1200px] mx-auto">
        <Outlet />
      </div>

      {/* Нижняя парящая стеклянная панель навигации (🔥 Движ восстановлен на своем месте!) */}
      <nav className="h-[80px] bg-bgCard/60 backdrop-blur-lg border-t border-white/[0.04] flex items-center justify-around px-4 pb-safe shadow-[0_-8px_32px_0_rgba(0,0,0,0.5)] z-50 w-full max-w-[1200px] mx-auto rounded-t-card">
        <NavLink
          to="/"
          onClick={handleTabClick}
          className={({ isActive }) =>
            `flex flex-col items-center justify-center flex-1 py-3 transition-all duration-300 ease-out origin-center ${
              isActive 
                ? 'text-accentGoldBright scale-105 drop-shadow-[0_0_8px_#F6C453]' 
                : 'text-textSecondary hover:text-textPrimary'
            }`
          }
        >
          <HomeIcon size={20} />
          <span className="text-[10px] mt-1.5 font-bold uppercase tracking-wider scale-90">Главная</span>
        </NavLink>

        <NavLink
          to="/offers"
          onClick={handleTabClick}
          className={({ isActive }) =>
            `flex flex-col items-center justify-center flex-1 py-3 transition-all duration-300 ease-out origin-center ${
              isActive 
                ? 'text-accentGoldBright scale-105 drop-shadow-[0_0_8px_#F6C453]' 
                : 'text-textSecondary hover:text-textPrimary'
            }`
          }
        >
          <Grid size={20} />
          <span className="text-[10px] mt-1.5 font-bold uppercase tracking-wider scale-90">Офферы</span>
        </NavLink>

        <NavLink
          to="/stats"
          onClick={handleTabClick}
          className={({ isActive }) =>
            `flex flex-col items-center justify-center flex-1 py-3 transition-all duration-300 ease-out origin-center ${
              isActive 
                ? 'text-accentGoldBright scale-105 drop-shadow-[0_0_8px_#F6C453]' 
                : 'text-textSecondary hover:text-textPrimary'
            }`
          }
        >
          <BarChart3 size={20} />
          <span className="text-[10px] mt-1.5 font-bold uppercase tracking-wider scale-90">Анализ</span>
        </NavLink>

        {/* Восстановленная люксовая вкладка «Движ» */}
        <NavLink
          to="/dvizh"
          onClick={handleTabClick}
          className={({ isActive }) =>
            `flex flex-col items-center justify-center flex-1 py-3 transition-all duration-300 ease-out origin-center ${
              isActive 
                ? 'text-accentGoldBright scale-105 drop-shadow-[0_0_8px_#F6C453]' 
                : 'text-textSecondary hover:text-textPrimary'
            }`
          }
        >
          <Flame size={20} />
          <span className="text-[10px] mt-1.5 font-bold uppercase tracking-wider scale-90">Движ</span>
        </NavLink>

        <NavLink
          to="/profile"
          onClick={handleTabClick}
          className={({ isActive }) =>
            `flex flex-col items-center justify-center flex-1 py-3 transition-all duration-300 ease-out origin-center ${
              isActive 
                ? 'text-accentGoldBright scale-105 drop-shadow-[0_0_8px_#F6C453]' 
                : 'text-textSecondary hover:text-textPrimary'
            }`
          }
        >
          <User size={20} />
          <span className="text-[10px] mt-1.5 font-bold uppercase tracking-wider scale-90">Кабинет</span>
        </NavLink>
      </nav>
    </div>
  );
};

const App = () => {
  // Состояние отображения стартового золотого лоадера
  const [isLoading, setIsLoading] = useState(true);
  useEffect(() => {
  const tg = window.Telegram?.WebApp;

  if (!tg) return;

  tg.ready();

  if (tg.expand) {
    tg.expand();
  }

  if (tg.disableVerticalSwipes) {
    tg.disableVerticalSwipes();
  }
}, []);

  // Боевой асинхронный хук авторизации
  useEffect(() => {
    const authenticateUser = async () => {
      try {
        // 1. Извлекаем сырую строку initData из нативного Telegram SDK
        const initData = window.Telegram?.WebApp?.initData || '';
        console.log("INIT DATA:", initData);
console.log("Telegram:", window.Telegram?.WebApp);
        
        // Исправлено: Привели import.meta к типу any для обхода проверки компилятора TypeScript
        const isDevMode = (import.meta as any).env?.DEV;

        if (initData || isDevMode) {
          // 2. Отправляем сетевой POST-запрос на наш FastAPI бэкенд
         const response = await loginViaTelegramApi();
          
          // 3. Сохраняем полученный боевой JWT-токен доступа в localStorage
          saveAuthToken(response.access_token);
          
          // 4. Записываем профиль пользователя из Supabase в локальную память для сквозного отображения
          localStorage.setItem('vvd_cpa_user_data', JSON.stringify(response.user));
          
          console.log("Авторизация на бэкенде VVD CPA пройдена успешно!");
        }
      } catch (error) {
        console.error("Сбой автоматической авторизации на бэкенде:", error);
      }
    };

    authenticateUser();
  }, []);

  if (isLoading) {
    // Рендерим золотую заставку
    return <Loader onComplete={() => setIsLoading(false)} />;
  }

  return (
    <div
  className="w-full relative bg-transparent"
  style={{
    minHeight: "100dvh",
  }}
>
      <MemoryRouter>
        <Routes>
          {/* Обертка Лейаута */}
          <Route path="/" element={<AppLayout />}>
            <Route index element={<Home />} />
            <Route path="offers" element={<Offers />} />
            <Route path="stats" element={<Stats />} />
            {/* Наш роут для вкладки «Движ» восстановлен */}
            <Route path="dvizh" element={<Dvizh />} />
            <Route path="profile" element={<Profile />} />
          </Route>

          {/* Вложенный детальный экран оффера без нижнего меню */}
          <Route path="/offers/:id" element={<OfferDetail />} />

          {/* Вложенный экран финансов и выплат без нижнего меню */}
          <Route path="/withdrawal" element={<Withdrawal />} />

          {/* Вложенный экран личного тикет-чата тех-поддержки (SupportChat) без нижнего меню */}
          <Route path="/support" element={<SupportChat />} />

          {/* Вложенный экран админ-панели без нижнего меню */}
          <Route path="/admin" element={<Admin />} />
        </Routes>
      </MemoryRouter>
    </div>
  );
};

export default App;
