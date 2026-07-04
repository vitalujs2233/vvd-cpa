import React from 'react';
import { MemoryRouter, Routes, Route, NavLink, Outlet } from 'react-router-dom';
import { Home as HomeIcon, Grid, BarChart3, MessageSquare, User } from 'lucide-react';
import { triggerHaptic } from '@/shared/lib/telegram';
import { Home } from '@/pages/home/Home';
import { Offers } from '@/pages/offers/Offers';
import { OfferDetail } from '@/pages/offers/OfferDetail';
import { Withdrawal } from '@/pages/withdrawal/Withdrawal';
import { Stats } from '@/pages/stats/Stats';
import { Chat } from '@/pages/chat/Chat';
import { Profile } from '@/pages/profile/Profile';
import { Admin } from '@/pages/admin/Admin';

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
    // Заменили HashRouter на MemoryRouter для полной изоляции от ссылок Телеграма
    <MemoryRouter>
      <Routes>
        {/* Обертка Лейаута с нижней панелью навигации */}
        <Route path="/" element={<AppLayout />}>
          <Route index element={<Home />} />
          <Route path="offers" element={<Offers />} />
          <Route path="stats" element={<Stats />} />
          <Route path="chat" element={<Chat />} />
          <Route path="profile" element={<Profile />} />
        </Route>

        {/* Вложенный детальный экран оффера без нижнего меню */}
        <Route path="/offers/:id" element={<OfferDetail />} />

        {/* Вложенный экран финансов и выплат (Форма, история, чек) без нижнего меню */}
        <Route path="/withdrawal" element={<Withdrawal />} />

        {/* Вложенный экран админ-панели без нижнего меню */}
        <Route path="/admin" element={<Admin />} />
      </Routes>
    </MemoryRouter>
  );
};

export default App;
