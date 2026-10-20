import {saveSnapshot} from '@/shared/lib/viewSnapshot';
import {preloadStartupData, StartupDataError} from '@/shared/lib/startupData';
import React, { useState, useEffect } from 'react';
import { MemoryRouter, Routes, Route, NavLink, Outlet } from 'react-router-dom';
import { Home as HomeIcon, Grid, BarChart3, Wrench, User } from 'lucide-react';
import { triggerHaptic } from '@/shared/lib/telegram';
import { Home } from '@/pages/home/Home';
import { Offers } from '@/pages/offers/Offers';
import { OfferDetail } from '@/pages/offers/OfferDetail';
import { Withdrawal } from '@/pages/withdrawal/Withdrawal';
import { Stats } from '@/pages/stats/Stats';
import { Dvizh } from '@/pages/dvizh/Dvizh';
import { IQPlay } from '@/pages/iq-play/IQPlay';
import { Tools,ToolsTopupPage,ToolsHistory,ToolsPurchases,ToolsNumbers,MyNumbers,ToolsProxy,MyProxies } from '@/pages/tools/MarketplacePages';
import { AIModelsPage,AIEditor } from '@/pages/tools/AIStudio';
import { PublicAIPage } from '@/pages/tools/PublicAIChat';
import { Profile } from '@/pages/profile/Profile';
import { Referral } from '@/pages/Referral';
import { Admin } from '@/pages/admin/Admin';
// Импортируем наш личный тикет-чат как SupportChat
import { Chat as SupportChat } from '@/pages/chat/Chat';
import { Loader } from '@/shared/ui/Loader';

// Импортируем методы сетевого API и хелперы токенов
import { loginViaTelegramApi, ApiError, isTemporarySignInError } from '@/shared/lib/api';

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
      <div className="flex-1 overflow-y-auto scrollable-container relative z-10 w-full max-w-[1200px] mx-auto pb-[80px]">
        <Outlet />
      </div>

      {/* Нижняя навигация: «Инструменты» вместо «Движ» */}
      <nav
  className="fixed bottom-0 left-0 right-0 h-[80px] bg-bgCard/60 backdrop-blur-lg border-t border-white/[0.04] flex items-center justify-around px-4 pb-safe shadow-[0_-8px_32px_0_rgba(0,0,0,0.5)] z-[9999] w-full max-w-[1200px] mx-auto rounded-t-card"
>
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

        {/* Инструменты; «Движ» открывается из шапки главной */}
        <NavLink
          to="/tools"
          onClick={handleTabClick}
          className={({ isActive }) =>
            `flex flex-col items-center justify-center flex-1 py-3 transition-all duration-300 ease-out origin-center ${
              isActive 
                ? 'text-accentGoldBright scale-105 drop-shadow-[0_0_8px_#F6C453]' 
                : 'text-textSecondary hover:text-textPrimary'
            }`
          }
        >
          <Wrench size={20} />
          <span className="text-[9px] mt-1.5 font-bold uppercase tracking-normal">Инструменты</span>
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

// Tools use the existing app shell and bottom navigation.

const MiniApp = () => {
  const [authState, setAuthState] = useState<'loading'|'ready'|'error'|'data-error'|'connection-error'>('loading');
  const [authMessage, setAuthMessage] = useState('');
  const [startupAttempt,setStartupAttempt]=useState(0);

  useEffect(() => {
    window.Telegram?.WebApp?.ready();
    window.Telegram?.WebApp?.expand?.();
  }, []);

  useEffect(() => {
    let active = true;
    const authenticate = async () => {
      setAuthState('loading');
      try {
        if (!window.Telegram?.WebApp?.initData) {
          throw new Error('Откройте VVD CPA через кнопку Mini App в Telegram.');
        }
        const response = await loginViaTelegramApi();
        if (active) {
          localStorage.setItem('vvd_cpa_user_data', JSON.stringify(response.user));
          saveSnapshot(`account:${response.user.telegram_id}`,response.user);
          await preloadStartupData(response.user.telegram_id,response.user.partner_code,response.user.role);
          if(active)setAuthState('ready');
        }
      } catch (cause) {
        if (active) {
          if(cause instanceof StartupDataError){
            setAuthMessage(cause.message);setAuthState('data-error');return;
          }
          localStorage.removeItem('vvd_cpa_user_data');
          const code = cause instanceof ApiError ? cause.code : '';
          const message = code === 'init_data_expired'
            ? 'Срок действия Telegram-сессии истёк. Закройте Mini App и запустите заново из бота.'
            : code === 'invalid_signature'
            ? 'Не удалось подтвердить подлинность входа. Запустите Mini App из официального бота VVD CPA. Если ошибка повторяется, обратитесь в поддержку.'
            : code === 'network_error'
            ? 'Не удалось связаться с сервером VVD CPA. Проверьте соединение и нажмите «Повторить».'
            : code === 'account_storage_error' || code === 'auth_config_error' || (cause instanceof ApiError && cause.status >= 500)
            ? 'Сервис входа временно недоступен. Попробуйте позже или обратитесь в поддержку.'
            : code === 'init_data_missing' || !(window.Telegram?.WebApp?.initData)
            ? 'Telegram не передал данные входа. Откройте приложение кнопкой Mini App в официальном боте.'
            : cause instanceof ApiError
            ? 'Не удалось проверить Telegram-вход. Запустите Mini App из бота или обратитесь в поддержку.'
            : cause instanceof Error ? cause.message : 'Не удалось авторизоваться.';
          setAuthMessage(message);
          setAuthState(isTemporarySignInError(cause)?'connection-error':'error');
        }
      }
    };
    void authenticate();
    return () => { active = false; };
  }, [startupAttempt]);

  if (authState === 'loading') return <Loader />;
  if (authState === 'error' || authState === 'data-error' || authState === 'connection-error') {
    return <div role="alert" className="min-h-[100dvh] flex items-center justify-center bg-bgMain p-6 text-center text-sm text-textSecondary">
      <div className="max-w-xs rounded-card border border-accentGold/25 bg-bgCard p-5">
        <h1 className="mb-3 text-base font-bold text-accentBrightGold">{authState==='data-error'?'Данные пока не загрузились':authState==='connection-error'?'Не удалось подключиться':'Требуется вход через Telegram'}</h1>
        <p>{authMessage}</p>
        {(authState==='data-error'||authState==='connection-error')&&<button className="mt-4 rounded-app-xs bg-accentGold px-4 py-2 text-black" onClick={()=>setStartupAttempt(n=>n+1)}>Повторить</button>}
      </div>
    </div>;
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
            {/* Существующий экран «Движ» сохранён */}
            <Route path="dvizh" element={<Dvizh />} />
            <Route path="tools" element={<Outlet />}>
              <Route index element={<Tools />} />
              <Route path="topup" element={<ToolsTopupPage />} />
              <Route path="history" element={<ToolsHistory />} />
              <Route path="purchases" element={<ToolsPurchases />} />
              <Route path="numbers" element={<ToolsNumbers />} />
              <Route path="numbers/my" element={<MyNumbers />} />
              <Route path="proxy" element={<ToolsProxy />} />
              <Route path="proxy/my" element={<MyProxies />} />
              <Route path="ai" element={<AIModelsPage />} />
              <Route path="ai/new" element={<AIEditor />} />
              <Route path="ai/:id" element={<AIEditor />} />
            </Route>
            <Route path="profile" element={<Profile />} />
            <Route path="referral" element={<Referral />} />
          </Route>

          {/* Вложенный детальный экран оффера без нижнего меню */}
          <Route path="/offers/:id" element={<OfferDetail />} />
          <Route path="/offers/:id/:offerId" element={<OfferDetail />} />

          {/* Вложенный экран финансов и выплат без нижнего меню */}
          <Route path="/withdrawal" element={<Withdrawal />} />

          {/* Вложенный экран личного тикет-чата тех-поддержки (SupportChat) без нижнего меню */}
          <Route path="/support" element={<SupportChat />} />
          {/* Вложенный экран админ-панели без нижнего меню */}
          <Route path="/admin" element={<Admin />} />
          <Route path="/iq-play" element={<IQPlay />} />
        </Routes>
      </MemoryRouter>
    </div>
  );
};

// Public AI profiles work without Telegram login at /vvd-cpa/?model=slug.
const App = () => {
  const slug = new URLSearchParams(window.location.search).get('model');
  return slug ? <PublicAIPage slug={slug} /> : <MiniApp />;
};
export default App;
