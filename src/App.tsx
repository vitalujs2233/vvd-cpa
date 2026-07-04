import React, { useState } from 'react';
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
// Подключили импорт нашего премиального лоадера
import { Loader } from '@/shared/ui/Loader';

// Главный Лейаут приложения, фиксирующий Bottom Menu
const AppLayout = () => {
  const handleTabClick = () => {
    // Вызов легкого тактильного отклика на смартфоне при переключении табов
    triggerHaptic.lightImpact();
  };

  return (
    // bg-bgMain заменен на bg-transparent для открытия видимости неоновых волн
    <div className="flex flex-col h-screen w-full bg-transparent text-textPrimary overflow-hidden">
      {/* Контейнер контента со скроллом */}
      <div className="flex-1 overflow-y-auto scrollable-container">
        <Outlet />
      </div>

      {/* Нижняя парящая стеклянная панель навигации (Glass Navigation, Blur, Высота 80px) */}
      <nav className="h-[80px] bg-bgCard/60 backdrop-blur-lg border-t border-white/[0.04] flex items-center justify-around px-4 pb-safe shadow-[0_-8px_32px_0_rgba(0,0,0,0.5)] z-50">
        <NavLink
          to="/"
          onClick={handleTabClick}
          className={({ isActive }) =>
            `flex flex-col items-center justify-center flex-1 py-3 transition-all duration-300 ease-out origin-center ${
              isActive 
                ? 'text-accentPurple scale-105 drop-shadow-[0_0_8px_#7C3AED]' 
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
                ? 'text-accentPurple scale-105 drop-shadow-[0_0_8px_#7C3AED]' 
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
                ? 'text-accentPurple scale-105 drop-shadow-[0_0_8px_#7C3AED]' 
                : 'text-textSecondary hover:text-textPrimary'
            }`
          }
        >
          <BarChart3 size={20} />
          <span className="text-[10px] mt-1.5 font-bold uppercase tracking-wider scale-90">Анализ</span>
        </NavLink>

        <NavLink
          to="/chat"
          onClick={handleTabClick}
          className={({ isActive }) =>
            `flex flex-col items-center justify-center flex-1 py-3 transition-all duration-300 ease-out origin-center ${
              isActive 
                ? 'text-accentPurple scale-105 drop-shadow-[0_0_8px_#7C3AED]' 
                : 'text-textSecondary hover:text-textPrimary'
            }`
          }
        >
          <MessageSquare size={20} />
          <span className="text-[10px] mt-1.5 font-bold uppercase tracking-wider scale-90">Чат</span>
        </NavLink>

        <NavLink
          to="/profile"
          onClick={handleTabClick}
          className={({ isActive }) =>
            `flex flex-col items-center justify-center flex-1 py-3 transition-all duration-300 ease-out origin-center ${
              isActive 
                ? 'text-accentPurple scale-105 drop-shadow-[0_0_8px_#7C3AED]' 
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
  // Состояние отображения стартового люксового лоадера
  const [isLoading, setIsLoading] = useState(true);

  if (isLoading) {
    // Рендерим лоадер до завершения анимации загрузки
    return <Loader onComplete={() => setIsLoading(false)} />;
  }

  return (
    <MemoryRouter>
      <Routes>
        {/* Обертка Лейаута с парящей нижней панелью навигации */}
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
