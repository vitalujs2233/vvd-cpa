import {saveSnapshot} from '@/shared/lib/viewSnapshot';
import {preloadStartupData, StartupDataError} from '@/shared/lib/startupData';
import React, { useState, useEffect } from 'react';
import { MemoryRouter, Routes, Route, NavLink, Outlet, useLocation } from 'react-router-dom';
import { Home as HomeIcon, Grid, BarChart3, Wrench, User, Globe2, LogOut, ShieldCheck } from 'lucide-react';
import { triggerHaptic } from '@/shared/lib/telegram';
import { Home } from '@/pages/home/Home';
import { InfoPage } from '@/pages/info/InfoPage';
import { Offers } from '@/pages/offers/Offers';
import { OfferDetail } from '@/pages/offers/OfferDetail';
import { Withdrawal } from '@/pages/withdrawal/Withdrawal';
import { Stats } from '@/pages/stats/Stats';
import { Dvizh } from '@/pages/dvizh/Dvizh';
import { IQPlay } from '@/pages/iq-play/IQPlay';
import { Tools,ToolsTopupPage,ToolsHistory,ToolsPurchases,ToolsNumbers,MyNumbers,ToolsProxy,MyProxies } from '@/pages/tools/MarketplacePages';
import { AIModelsPage,AIEditor } from '@/pages/tools/AIStudio';
import {ServiceDirectoryPage,ServiceCategoryPage} from '@/pages/tools/ServiceDirectory';
import { PublicAIPage } from '@/pages/tools/PublicAIChat';
import { PublicWebsite } from '@/pages/public/PublicWebsite';
import { useBrowserSession } from '@/pages/public/WebAuth';
import {getWebSession} from '@/shared/lib/browserSession';
import type {AuthResponse} from '@/shared/lib/api';
import { Profile } from '@/pages/profile/Profile';
import { Referral } from '@/pages/Referral';
import { Admin } from '@/pages/admin/Admin';
import {MaintenanceScreen,useMiniAppMaintenance} from '@/pages/maintenance/Maintenance';
// Импортируем наш личный тикет-чат как SupportChat
import { Chat as SupportChat } from '@/pages/chat/Chat';
import { Loader } from '@/shared/ui/Loader';

// Импортируем методы сетевого API и хелперы токенов
import { loginViaTelegramApi, ApiError, isTemporarySignInError } from '@/shared/lib/api';

// Единый фон всех обычных экранов, кроме театральной сцены IQ Play.
const AppBackdrop = () => {
  const location = useLocation();
  if (location.pathname === '/iq-play') return null;
  return (
      <div className="vvd-app-backdrop" aria-hidden="true">
        <div className="vvd-app-backdrop-stars" />
        <svg className="vvd-app-backdrop-waves" viewBox="0 0 430 900" preserveAspectRatio="none" focusable="false">
          <defs>
            <linearGradient id="vvd-bg-gold-wave" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="#F6C453" stopOpacity=".04" />
              <stop offset="18%" stopColor="#FFE08A" stopOpacity=".65" />
              <stop offset="55%" stopColor="#D4AF37" stopOpacity=".36" />
              <stop offset="85%" stopColor="#FFE08A" stopOpacity=".75" />
              <stop offset="100%" stopColor="#D4AF37" stopOpacity=".06" />
            </linearGradient>
            <linearGradient id="vvd-bg-soft-wave" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#F6C453" stopOpacity=".04" />
              <stop offset="50%" stopColor="#E8B857" stopOpacity=".36" />
              <stop offset="100%" stopColor="#D4AF37" stopOpacity=".02" />
            </linearGradient>
          </defs>
          <g className="vvd-app-wave-upper" fill="none" strokeLinecap="round">
            <path d="M-45 166 C35 144 58 86 143 80 S274 65 348 15 S438 -17 475 -26" stroke="url(#vvd-bg-gold-wave)" strokeWidth="1.6" />
            <path d="M-48 180 C32 160 65 105 152 100 S284 80 358 33 S442 -1 477 -8" stroke="url(#vvd-bg-gold-wave)" strokeWidth=".85" opacity=".65" />
            <path d="M-52 150 C22 127 63 63 140 60 S273 47 346 -2 S435 -34 476 -45" stroke="#E5B754" strokeWidth=".65" opacity=".25" />
            <path d="M-65 246 C15 223 30 166 83 150" stroke="url(#vvd-bg-soft-wave)" strokeWidth="18" opacity=".13" />
          </g>
          <g className="vvd-app-wave-lower" fill="none" strokeLinecap="round">
            <path d="M-48 770 C62 713 82 755 158 752 S306 809 393 730 S447 704 480 679" stroke="url(#vvd-bg-gold-wave)" strokeWidth="1.5" />
            <path d="M-48 784 C65 734 80 771 159 771 S311 827 395 752 S447 722 480 699" stroke="url(#vvd-bg-gold-wave)" strokeWidth=".8" opacity=".55" />
            <path d="M-49 755 C48 691 90 740 159 735 S308 788 392 709 S449 682 480 659" stroke="#D4AF37" strokeWidth=".7" opacity=".28" />
            <path d="M346 920 C363 820 434 781 480 735" stroke="url(#vvd-bg-soft-wave)" strokeWidth="24" opacity=".13" />
          </g>
        </svg>
      </div>
  );
};

// Главный Лейаут приложения, фиксирующий Bottom Menu
const AppLayout = ({webMode=false}:{webMode?:boolean}) => {
  const location = useLocation();
  const tabPaths = ['/', '/offers', '/stats', '/tools', '/profile'] as const;
  const activeTab = tabPaths.includes(location.pathname as typeof tabPaths[number]) ? location.pathname : null;
  // Keep visited tab screens mounted: switching tabs no longer destroys their data or UI.
  const [visitedTabs,setVisitedTabs] = useState<string[]>(()=>activeTab?[activeTab]:[]);
  useEffect(()=>{
    if(activeTab)setVisitedTabs(current=>current.includes(activeTab)?current:[...current,activeTab]);
  },[activeTab]);
  const tabScreens:Record<string,React.ReactNode> = {
    '/': <Home />, '/offers': <Offers />, '/stats': <Stats />,
    '/tools': <Tools />, '/profile': <Profile />
  };
  const handleTabClick = () => {
    // Вызов легкого тактильного отклика на смартфоне при переключении табов
    triggerHaptic.lightImpact();
  };

  return (
    // bg-bgMain заменен на bg-transparent для открытия видимости неоновых волн и картинки bg.png на фоне
    <div
  className="flex flex-col w-full bg-transparent text-textPrimary relative"
  style={{
    height: webMode ? "calc(100dvh - 64px)" : "100dvh",
  }}
>
      
      {/* Контейнер контента со скроллом */}
      <div className="flex-1 min-w-0 overflow-y-auto overflow-x-hidden scrollable-container relative z-10 w-full max-w-[1200px] mx-auto pb-[80px]">
        {tabPaths.map(path=>(visitedTabs.includes(path)||activeTab===path)&&(
          <div key={path} style={{display:activeTab===path?'block':'none'}} aria-hidden={activeTab!==path}>
            {tabScreens[path]}
          </div>
        ))}
        {!activeTab&&<Outlet />}
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

const MiniApp = ({webUser}:{webUser?:AuthResponse['user']}) => {
  const [authState, setAuthState] = useState<'loading'|'ready'|'error'|'data-error'|'connection-error'>('loading');
  const [authMessage, setAuthMessage] = useState('');
  const [verifiedAdmin,setVerifiedAdmin]=useState(false);
  const {status:maintenance,checked:maintenanceChecked,refresh:refreshMaintenance}=useMiniAppMaintenance();
  const [startupAttempt,setStartupAttempt]=useState(0);

  useEffect(() => {
    window.Telegram?.WebApp?.ready();
    window.Telegram?.WebApp?.expand?.();
  }, []);

  useEffect(() => {
    let active = true;
    const authenticate = async () => {
      setAuthState('loading');
      setVerifiedAdmin(false);
      try {
        if (!webUser && !window.Telegram?.WebApp?.initData) {
          throw new Error('Откройте VVD CPA через Telegram или авторизуйтесь на сайте.');
        }
        if (webUser && !getWebSession()) {
          throw new Error('Веб-сессия завершилась. Войдите ещё раз.');
        }
        const response = webUser ? {user:webUser} : await loginViaTelegramApi();
        if (active) {
          // Server-verified authentication is required before administrator bypass.
          setVerifiedAdmin(response.user.role==='admin'||response.user.telegram_id===232682307);
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
  }, [startupAttempt, webUser?.telegram_id]);

  // The notice takes precedence over normal authentication and Mini App pages.
  // Verified administrators retain the dashboard to turn this mode off.
  if(maintenance?.enabled && !verifiedAdmin)return <MaintenanceScreen settings={maintenance} onRefresh={refreshMaintenance}/>;
  if(!maintenanceChecked || authState === 'loading') return <Loader />;
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
  className="w-full relative isolate bg-transparent"
  style={{
    minHeight: "100dvh",
  }}
>
      <MemoryRouter>
        <AppBackdrop />
        <Routes>
          {/* Обертка Лейаута */}
          <Route path="/" element={<AppLayout webMode={Boolean(webUser)}/>}>
            <Route index element={null} />
            <Route path="why-vvd" element={<InfoPage />} />
            <Route path="offers" element={null} />
            <Route path="stats" element={null} />
            {/* Существующий экран «Движ» сохранён */}
            <Route path="dvizh" element={<Dvizh />} />
            <Route path="tools" element={<Outlet />}>
              <Route index element={null} />
              <Route path="topup" element={<ToolsTopupPage />} />
              <Route path="history" element={<ToolsHistory />} />
              <Route path="purchases" element={<ToolsPurchases />} />
              <Route path="directory" element={<ServiceDirectoryPage />} />
              <Route path="directory/:categoryId" element={<ServiceCategoryPage />} />
              <Route path="numbers" element={<ToolsNumbers />} />
              <Route path="numbers/my" element={<MyNumbers />} />
              <Route path="proxy" element={<ToolsProxy />} />
              <Route path="proxy/my" element={<MyProxies />} />
              <Route path="ai" element={<AIModelsPage />} />
              <Route path="ai/new" element={<AIEditor />} />
              <Route path="ai/:id" element={<AIEditor />} />
            </Route>
            <Route path="profile" element={null} />
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

// Telegram inside-app and website users share the existing VVD CPA routes,
// UI, accounts and API data. The website only differs in login and outer header.
const BrowserPortal = () => {
  const auth=useBrowserSession();
  const [publicView,setPublicView]=useState(false);
  const openApp=()=>setPublicView(false);
  const goPublic=()=>setPublicView(true);

  if(auth.restoring && !auth.profile) return <Loader />;
  if(auth.restoreError && !auth.profile){
    return <main role="alert" className="min-h-[100dvh] flex items-center justify-center bg-bgMain p-6 text-center text-textSecondary">
      <div className="max-w-sm rounded-card border border-accentGold/25 bg-bgCard p-6">
        <h1 className="mb-3 text-lg font-bold text-accentBrightGold">Временно нет связи с сервером</h1>
        <p className="mb-4 text-sm">Вход Telegram сохранён. Проверь соединение и попробуй восстановить кабинет без повторной авторизации.</p>
        <button type="button" onClick={auth.retryRestore} className="rounded-app-xs bg-accentGold px-5 py-3 font-semibold text-black">Повторить подключение</button>
      </div>
    </main>;
  }

  if(auth.profile && !publicView){
    const user={...auth.profile.user,partner_code:auth.profile.user.partner_code||''};
    const exit=async()=>{
      await auth.logout();
      localStorage.removeItem('vvd_cpa_user_data');
      setPublicView(false);
    };
    return <div className="relative min-h-[100dvh] w-full overflow-hidden bg-bgMain text-textPrimary">
      <header className="relative z-[10001] flex h-16 items-center justify-between gap-3 border-b border-accentGold/25 bg-[#100e0b]/95 px-4 text-white backdrop-blur-md">
        <div className="min-w-0">
          <b className="block truncate text-sm tracking-wider text-accentBrightGold">VVD CPA</b>
          <span className="text-[10px] text-textSecondary">Веб-платформа · Telegram аккаунт</span>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button type="button" onClick={goPublic}
            className="flex items-center gap-1.5 rounded-app-xs border border-accentGold/30 bg-accentGold/10 px-3 py-2 text-[11px] font-semibold text-accentBrightGold">
            <Globe2 size={15}/> <span>Сайт</span>
          </button>
          <button type="button" onClick={()=>void exit()} aria-label="Выйти из аккаунта"
            className="flex items-center gap-1.5 rounded-app-xs border border-white/15 px-3 py-2 text-[11px] text-textSecondary">
            <LogOut size={15}/> <span>Выйти</span>
          </button>
        </div>
      </header>
      <MiniApp key={user.telegram_id} webUser={user}/>
    </div>;
  }
  return <PublicWebsite auth={auth} onOpenApp={openApp}/>;
};

const App = () => {
  const slug = new URLSearchParams(window.location.search).get('model');
  if (slug) return <PublicAIPage slug={slug} />;
  return window.Telegram?.WebApp?.initData ? <MiniApp /> : <BrowserPortal />;
};
export default App;
