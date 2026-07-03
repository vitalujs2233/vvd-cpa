import React from 'react';
import { HashRouter, Routes, Route, NavLink, Outlet } from 'react-router-dom';
import { Home as HomeIcon, Grid, BarChart3, MessageSquare, User } from 'lucide-react';
import { triggerHaptic } from '@/shared/lib/telegram';
import { Home } from '@/pages/home/Home';

// Временные легковесные компоненты страниц для бесшовной сборки проекта на данном этапе.
// В процессе развития проекта мы заменим их полноценными изолированными страницами.
const OffersPlaceholder = () => (
  <div className="flex-1 flex flex-col items-center justify-center p-20 text-center h-full">
    <h1 className="text-2xl font-bold text-white">Офферы</h1>
    <p className="text-textMuted text-xs mt-2">Каталог CPA категорий готовится к детальной верстке.</p>
  </div>
);

const StatsPlaceholder = () => (
  <div className="flex-1 flex flex-col items-center justify-center p-20 text-center h-full">
    <h1 className="text-2xl font-bold text-white">Статистика</h1>
    <p className="text-textMuted text-xs mt-2">Раздел интерактивной аналитики готовится к детальной верстке.</p>
  </div>
);

const ChatPlaceholder = () => (
  <div className="flex-1 flex flex-col items-center justify-center p-20 text-center h-full">
    <h1 className="text-2xl font-bold text-white">Чат Поддержки</h1>
    <p className="text-textMuted text-xs mt-2">Форма создания тикетов и переписка готовятся к детальной верстке.</p>
  </div>
);

const ProfilePlaceholder = () => (
  <div className="flex-1 flex flex-col items-center justify-center p-20 text-center h-full">
    <h1 className="text-2xl font-bold text-white">Профиль</h1>
    <p className="text-textMuted text-xs mt-2">Настройки личного кабинета готовятся к детальной верстке.</p>
  </div>
);

// Главный Лейаут приложения, фиксирующий Bottom Menu
const AppLayout = () => {
  const handleTabClick = () => {
    // Вызов легкого тактильного отклика на смартфоне при переключении табов
    triggerHaptic.lightImpact();
  };

  return (
    <div className="flex flex-col h-screen w-full bg-bgDark text-white overflow-hidden">
      {/* Контейнер контента со скроллом */}
      <div className="flex-1 overflow-y-auto scrollable-container">
        <Outlet />
      </div>

      {/* Нижняя панель навигации (Bottom Menu) точно по макету */}
      <nav className="h-[64px] bg-bgCard border-t border-gray-800/50 flex items-center justify-around px-4 pb-safe shadow-[0_-4px_24px_rgba(0,0,0,0.4)] z-50">
        <NavLink
          to="/"
          onClick={handleTabClick}
          className={({ isActive }) =>
            `flex flex-col items-center justify-center flex-1 py-2 transition-colors duration-200 ${
              isActive ? 'text-accent' : 'text-textMuted hover:text-white'
            }`
          }
        >
          <HomeIcon size={20} />
          <span className="text-[10px] mt-1 font-medium">Главная</span>
        </NavLink>

        <NavLink
          to="/offers"
          onClick={handleTabClick}
          className={({ isActive }) =>
            `flex flex-col items-center justify-center flex-1 py-2 transition-colors duration-200 ${
              isActive ? 'text-accent' : 'text-textMuted hover:text-white'
            }`
          }
        >
          <Grid size={20} />
          <span className="text-[10px] mt-1 font-medium">Офферы</span>
        </NavLink>

        <NavLink
          to="/stats"
          onClick={handleTabClick}
          className={({ isActive }) =>
            `flex flex-col items-center justify-center flex-1 py-2 transition-colors duration-200 ${
              isActive ? 'text-accent' : 'text-textMuted hover:text-white'
            }`
          }
        >
          <BarChart3 size={20} />
          <span className="text-[10px] mt-1 font-medium">Статистика</span>
        </NavLink>

        <NavLink
          to="/chat"
          onClick={handleTabClick}
          className={({ isActive }) =>
            `flex flex-col items-center justify-center flex-1 py-2 transition-colors duration-200 ${
              isActive ? 'text-accent' : 'text-textMuted hover:text-white'
            }`
          }
        >
          <MessageSquare size={20} />
          <span className="text-[10px] mt-1 font-medium">Чат</span>
        </NavLink>

        <NavLink
          to="/profile"
          onClick={handleTabClick}
          className={({ isActive }) =>
            `flex flex-col items-center justify-center flex-1 py-2 transition-colors duration-200 ${
              isActive ? 'text-accent' : 'text-textMuted hover:text-white'
            }`
          }
        >
          <User size={20} />
          <span className="text-[10px] mt-1 font-medium">Профиль</span>
        </NavLink>
      </nav>
    </div>
  );
};

const App = () => {
  return (
    <HashRouter>
      <Routes>
        {/* Обертка Лейаута с нижней панелью навигации */}
        <Route path="/" element={<AppLayout />}>
          <Route index element={<Home />} />
          <Route path="offers" element={<OffersPlaceholder />} />
          <Route path="stats" element={<StatsPlaceholder />} />
          <Route path="chat" element={<ChatPlaceholder />} />
          <Route path="profile" element={<ProfilePlaceholder />} />
        </Route>
      </Routes>
    </HashRouter>
  );
};

export default App;
