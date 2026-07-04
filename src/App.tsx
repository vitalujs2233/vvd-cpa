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
import { Loader } from '@/shared/ui/Loader';

// Главный Лейаут приложения, фиксирующий Bottom Menu
const AppLayout = () => {
  const handleTabClick = () => {
    // Вызов легкого тактильного отклика на смартфоне при переключении табов
    triggerHaptic.lightImpact();
  };

  return (
    <div className="flex flex-col h-screen w-full bg-transparent text-textPrimary overflow-hidden relative">
      
      {/* === ОПТИМИЗИРОВАННЫЙ НЕОНОВЫЙ ФОН С ВЕКТОРНЫМИ НИТЯМИ (БЕЗ ТЯЖЕЛЫХ ФИЛЬТРОВ) === */}
      <div className="absolute inset-0 z-0 pointer-events-none overflow-hidden bg-bgMain">
        {/* Мягкие размытые фоновые световые пятна ( Radial Spots ) */}
        <div className="absolute top-[10%] left-[-10%] w-[90%] h-[90%] rounded-full bg-[#784DFF]/[0.04] blur-[130px] pointer-events-none" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[100%] h-[100%] rounded-full bg-[#3B82F6]/[0.03] blur-[140px] pointer-events-none" />

        {/* Векторные парящие неоновые нити из гайдлайна (Оптимизировано: Multi-Stroke) */}
        <svg className="absolute inset-0 w-full h-full opacity-45" viewBox="0 0 1440 800" preserveAspectRatio="none">
          <defs>
            <linearGradient id="waveGrad1" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#784DFF" stopOpacity="0" />
              <stop offset="50%" stopColor="#9D4EDD" stopOpacity="0.55" />
              <stop offset="100%" stopColor="#C44DFF" stopOpacity="0" />
            </linearGradient>
            <linearGradient id="waveGrad2" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#3B82F6" stopOpacity="0" />
              <stop offset="50%" stopColor="#784DFF" stopOpacity="0.45" />
              <stop offset="100%" stopColor="#9D4EDD" stopOpacity="0" />
            </linearGradient>
          </defs>
          
          {/* ВОЛНА 1: Внутренний широкий светящийся ореол (Glow Underlay) */}
          <path 
            className="animate-wave-1" 
            d="M-100 350 C300 480 500 220 900 420 C1300 620 1500 320 1700 470" 
            fill="none" 
            stroke="url(#waveGrad1)" 
            strokeWidth="16" 
            opacity="0.25"
          />
          {/* ВОЛНА 1: Тонкая яркая центральная нить (Core) */}
          <path 
            className="animate-wave-1" 
            d="M-100 350 C300 480 500 220 900 420 C1300 620 1500 320 1700 470" 
            fill="none" 
            stroke="url(#waveGrad1)" 
            strokeWidth="2.5" 
            opacity="0.85"
          />

          {/* ВОЛНА 2: Внутренний широкий светящийся ореол (Glow Underlay) */}
          <path 
            className="animate-wave-2" 
            d="M-100 400 C200 220 600 520 1000 320 C1300 170 1500 470 1700 370" 
            fill="none" 
            stroke="url(#waveGrad2)" 
            strokeWidth="14" 
            opacity="0.22"
          />
          {/* ВОЛНА 2: Тонкая яркая центральная нить (Core) */}
          <path 
            className="animate-wave-2" 
            d="M-100 400 C200 220 600 520 1000 320 C1300 170 1500 470 1700 370" 
            fill="none" 
            stroke="url(#waveGrad2)" 
            strokeWidth="2" 
            opacity="0.8"
          />
        </svg>
        
        {/* Звездная пыль */}
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.15)_1px,transparent_1px)] bg-[size:40px_40px] opacity-20" />
      </div>

      {/* Контейнер контента со скроллом */}
      <div className="flex-1 overflow-y-auto scrollable-container relative z-10">
        <Outlet />
      </div>

      {/* Нижняя парящая стеклянная панель навигации */}
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
