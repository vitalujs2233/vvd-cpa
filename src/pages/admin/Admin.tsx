import React, { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  ArrowLeft, Users, Layers, CreditCard, Newspaper, 
  BarChart2, Settings, LogOut, Search, ShieldAlert, 
  UserCheck, Megaphone 
} from 'lucide-react';
import { Card } from '@/shared/ui/Card';
import { Button } from '@/shared/ui/Button';
import { Input } from '@/shared/ui/Input';
import { getTelegramUser, triggerHaptic } from '@/shared/lib/telegram';

interface AdminUser {
  telegram_id: number;
  partner_code: string | null;
  first_name: string;
  last_name: string;
  username: string;
  status: string;
  clicks: number;
  conversions: number;
  income: number;
  cr: number;
}

interface CountryStat {
  country_code: string;
  country_name: string;
  clicks: number;
  conversions: number;
  income: number;
}

interface FinanceStat {
  gross_income: number;
  partner_income: number;
  service_income: number;
  service_fee_percent: number;
}

interface Withdrawal {
  id: number;
  partner_code?: string | null;
  telegram_id?: number | null;
  amount: number;
  payment_method?: string | null;
  wallet?: string | null;
  status: string;
  created_at?: string | null;
  processed_at?: string | null;
}

interface ChatBanner {
  id: number;
  title: string;
  text: string;
  button_text: string;
  button_url: string;
  is_active: boolean;
}
interface ChatBan {
  telegram_id: string;
  user_name: string;
  banned_by: string;
  created_at: string;
}
export const Admin: React.FC = () => {
  const navigate = useNavigate();
  const currentUser = getTelegramUser();

  // Привязка прав администратора строго к вашему Telegram ID: 232682307
  const isAdmin = currentUser.id === 232682307;

  const [subView, setSubView] = useState<
  'menu' |
  'users' |
  'user' |
  'withdrawals' |
  'banner' |
  'chatBans'
>('menu');
  const [searchQuery, setSearchQuery] = useState('');
  const [adminUsers, setAdminUsers] = useState<AdminUser[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null);
  const [countryStats, setCountryStats] = useState<CountryStat[]>([]);
  const [userStatsLoading, setUserStatsLoading] = useState(false);
  const [finance, setFinance] = useState<FinanceStat | null>(null);
  const [financeLoading, setFinanceLoading] = useState(false);
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([]);
  const [withdrawalsLoading, setWithdrawalsLoading] = useState(false);
  const [withdrawalFilter, setWithdrawalFilter] = useState<'all' | 'pending' | 'paid' | 'rejected'>('all');
  const [withdrawalSearch, setWithdrawalSearch] = useState('');
  const [processingWithdrawalId, setProcessingWithdrawalId] = useState<number | null>(null);
  const [chatBanner, setChatBanner] = useState<ChatBanner | null>(null);
  const [bannerLoading, setBannerLoading] = useState(false);
  const [bannerSaving, setBannerSaving] = useState(false);
  const [chatBans, setChatBans] = useState<ChatBan[]>([]);
  const [chatBansLoading, setChatBansLoading] = useState(false);

  useEffect(() => {
    if (subView !== 'menu') return;

    const loadFinance = async () => {
      try {
        setFinanceLoading(true);
        const response = await fetch('https://vvd-cpa-v2.onrender.com/admin/finance');
        const data = await response.json();
        if (data.success) {
          setFinance({
            gross_income: Number(data.gross_income || 0),
            partner_income: Number(data.partner_income || 0),
            service_income: Number(data.service_income || 0),
            service_fee_percent: Number(data.service_fee_percent || 20),
          });
        }
      } catch (error) {
        console.error('Ошибка загрузки финансов VVD:', error);
      } finally {
        setFinanceLoading(false);
      }
    };

    loadFinance();
    const interval = window.setInterval(loadFinance, 10000);
    return () => window.clearInterval(interval);
  }, [subView]);

  useEffect(() => {
    if (subView !== 'users') return;
    const loadUsers = async () => {
      try {
        setUsersLoading(true);
        const response = await fetch('https://vvd-cpa-v2.onrender.com/admin/users');
        const data = await response.json();
        if (data.success && Array.isArray(data.users)) setAdminUsers(data.users);
      } catch (error) {
        console.error('Ошибка загрузки пользователей:', error);
      } finally {
        setUsersLoading(false);
      }
    };
    loadUsers();
    const interval = window.setInterval(loadUsers, 10000);
    return () => window.clearInterval(interval);
  }, [subView]);

  useEffect(() => {
    if (subView !== 'withdrawals') return;

    const loadWithdrawals = async () => {
      try {
        setWithdrawalsLoading(true);
        const response = await fetch('https://vvd-cpa-v2.onrender.com/admin/withdrawals');
        const data = await response.json();

        if (response.ok && data.success && Array.isArray(data.withdrawals)) {
          setWithdrawals(data.withdrawals);
        } else {
          console.error('Ошибка загрузки выплат:', data);
        }
      } catch (error) {
        console.error('Ошибка загрузки выплат:', error);
      } finally {
        setWithdrawalsLoading(false);
      }
    };

    loadWithdrawals();
    const interval = window.setInterval(loadWithdrawals, 10000);
    return () => window.clearInterval(interval);
  }, [subView]);

useEffect(() => {
  if (subView !== 'banner') return;

  const loadBanner = async () => {
    try {
      setBannerLoading(true);

      const response = await fetch(
        'https://vvd-cpa-v2.onrender.com/chat/banner',
        { cache: 'no-store' }
      );

      const data = await response.json();

      if (data.success && data.banner) {
        setChatBanner({
          id: Number(data.banner.id),
          title: data.banner.title || '',
          text: data.banner.text || '',
          button_text: data.banner.button_text || '',
          button_url: data.banner.button_url || '',
          is_active: Boolean(data.banner.is_active),
        });
      }
    } catch (error) {
      console.error('Ошибка загрузки рекламы Движ:', error);
    } finally {
      setBannerLoading(false);
    }
  };

  loadBanner();
}, [subView]);
useEffect(() => {
  if (subView !== 'chatBans') return;

  const loadChatBans = async () => {
    try {
      setChatBansLoading(true);

      const response = await fetch(
        'https://vvd-cpa-v2.onrender.com/admin/chat/bans',
        {
          cache: 'no-store',
        }
      );

      const data = await response.json();

      if (data.success && Array.isArray(data.bans)) {
        setChatBans(data.bans);
      }
    } catch (error) {
      console.error('Ошибка загрузки блокировок:', error);
    } finally {
      setChatBansLoading(false);
    }
  };

  loadChatBans();
}, [subView]);
const saveChatBanner = async () => {
  if (!chatBanner) return;

  try {
    triggerHaptic.lightImpact();
    setBannerSaving(true);

    const response = await fetch(
      'https://vvd-cpa-v2.onrender.com/admin/chat/banner',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title: chatBanner.title,
          text: chatBanner.text,
          button_text: chatBanner.button_text,
          button_url: chatBanner.button_url,
          is_active: chatBanner.is_active,
        }),
      }
    );

    const data = await response.json();

    if (!response.ok || !data.success) {
      throw new Error(data.message || data.detail || 'Ошибка сохранения рекламы');
    }

    triggerHaptic.success();
    window.alert('Реклама Движ сохранена');
  } catch (error) {
    console.error('Ошибка сохранения рекламы Движ:', error);
    window.alert(
      error instanceof Error
        ? error.message
        : 'Ошибка сохранения рекламы'
    );
  } finally {
    setBannerSaving(false);
  }
};
  
  const processWithdrawal = async (withdrawalId: number, action: 'pay' | 'reject') => {
    const question = action === 'pay'
      ? 'Подтвердить выплату?'
      : 'Отклонить заявку и вернуть средства?';

    if (!window.confirm(question)) return;

    try {
      triggerHaptic.lightImpact();
      setProcessingWithdrawalId(withdrawalId);

      const response = await fetch(
        `https://vvd-cpa-v2.onrender.com/admin/withdrawals/${withdrawalId}/${action === 'pay' ? 'paid' : 'reject'}`,
        { method: 'POST' }
      );
      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message || data.detail || 'Ошибка обработки заявки');
      }

      setWithdrawals(prev =>
        prev.map(item =>
          item.id === withdrawalId
            ? {
                ...item,
                status: action === 'pay' ? 'paid' : 'rejected',
                processed_at: new Date().toISOString(),
              }
            : item
        )
      );
    } catch (error) {
      console.error('Ошибка обработки выплаты:', error);
      window.alert(error instanceof Error ? error.message : 'Ошибка обработки выплаты');
    } finally {
      setProcessingWithdrawalId(null);
    }
  };

  const filteredWithdrawals = useMemo(() => {
    const query = withdrawalSearch.toLowerCase().trim();

    return withdrawals.filter(item => {
      const matchesFilter = withdrawalFilter === 'all' || item.status === withdrawalFilter;
      const matchesSearch =
        !query ||
        String(item.partner_code || '').toLowerCase().includes(query) ||
        String(item.telegram_id || '').includes(query) ||
        String(item.wallet || '').toLowerCase().includes(query);

      return matchesFilter && matchesSearch;
    });
  }, [withdrawals, withdrawalFilter, withdrawalSearch]);

  const handleBackToProfile = () => {
    triggerHaptic.lightImpact();
    navigate('/profile');
  };

  const handleSubViewChange = (
  view:
    | 'menu'
    | 'users'
    | 'user'
    | 'withdrawals'
    | 'banner'
    | 'chatBans'
) => {
  triggerHaptic.lightImpact();
  setSubView(view);
};

  const openUser = async (user: AdminUser) => {
    triggerHaptic.lightImpact();
    setSelectedUser(user);
    setSubView('user');
    setCountryStats([]);
    setUserStatsLoading(true);

    try {
      const [usersResponse, countriesResponse] = await Promise.all([
        fetch('https://vvd-cpa-v2.onrender.com/admin/users'),
        fetch(`https://vvd-cpa-v2.onrender.com/statistics/${user.telegram_id}/countries`)
      ]);

      const usersData = await usersResponse.json();
      const countriesData = await countriesResponse.json();

      if (usersData.success && Array.isArray(usersData.users)) {
        const freshUser = usersData.users.find(
          (item: AdminUser) => item.telegram_id === user.telegram_id
        );
        if (freshUser) setSelectedUser(freshUser);
      }

      if (countriesData.success && Array.isArray(countriesData.countries)) {
        setCountryStats(countriesData.countries);
      }
    } catch (error) {
      console.error('Ошибка загрузки статистики партнёра:', error);
    } finally {
      setUserStatsLoading(false);
    }
  };

  const filteredUsers = useMemo(() => {
    const query = searchQuery.toLowerCase().trim();
    return adminUsers.filter(user => {
      const fullName = `${user.first_name || ''} ${user.last_name || ''}`.toLowerCase();
      return fullName.includes(query) ||
        (user.partner_code || '').toLowerCase().includes(query) ||
        (user.username || '').toLowerCase().includes(query) ||
        String(user.telegram_id).includes(query);
    });
  }, [adminUsers, searchQuery]);

  if (!isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center p-4 h-screen bg-bgDark select-none">
        <Card padding="lg" className="flex flex-col items-center gap-4 border-error/15 bg-error/[0.01]">
          <div className="w-16 h-16 rounded-full bg-error/10 border border-error/20 flex items-center justify-center text-error">
            <ShieldAlert size={32} />
          </div>
          <div className="flex flex-col gap-2 text-center">
            <h1 className="text-lg font-bold text-white">Доступ ограничен</h1>
            <p className="text-xs text-textSecondary leading-relaxed max-w-[240px]">
              Данный раздел предназначен исключительно для администраторов платформы VVD CPA.
            </p>
          </div>
          <Button 
            variant="outline" 
            size="md" 
            onClick={() => { triggerHaptic.lightImpact(); navigate('/'); }}
            className="w-full h-10 border-gray-800"
          >
            Вернуться на Главную
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div
      className="flex flex-col gap-4 p-4 select-none pb-32 animate-fade-in"
      style={{
        height: '100dvh',
        minHeight: 0,
        overflowY: 'auto',
        overflowX: 'hidden',
        WebkitOverflowScrolling: 'touch',
        touchAction: 'pan-y',
        overscrollBehaviorY: 'contain',
      }}
    >
      
      {/* ================= VIEW 1: ГЛАВНОЕ МЕНЮ АДМИНКИ ================= */}
      {subView === 'menu' && (
        <div className="flex flex-col gap-4">
          {/* Шапка админ-панели */}
          <div className="flex items-center gap-3 text-left">
            <button 
              onClick={handleBackToProfile}
              className="w-11 h-11 rounded-full bg-bgCard/40 border border-white/10 flex items-center justify-center text-textSecondary hover:text-textPrimary active:scale-95 transition-transform shadow-glass-inner"
            >
              <ArrowLeft size={18} />
            </button>
            <div className="flex flex-col">
              <span className="text-[10px] text-accentPurple font-bold uppercase tracking-wider">Панель управления</span>
              <h1 className="text-xl font-bold text-white leading-none mt-0.5">Админ панель</h1>
            </div>
          </div>

          {/* Информационная карточка */}
          <Card padding="md" className="flex items-center gap-3 text-left border-accentPurple/10 bg-accentPurple/[0.02]">
            <div className="w-10 h-10 rounded-full bg-accentPurple/10 border border-accentPurple/20 flex items-center justify-center text-accentPurple shrink-0">
              <UserCheck size={18} />
            </div>
            <div className="flex flex-col">
              <span className="text-xs font-bold text-white">Администратор: {currentUser.first_name}</span>
              <span className="text-[10px] text-textSecondary mt-0.5">У вас есть полный доступ ко всем функциям управления.</span>
            </div>
          </Card>

          {/* Финансы VVD */}
          <Card padding="md" className="flex flex-col gap-3 text-left border-accentPurple/10 bg-accentPurple/[0.02] shadow-premium">
            <div className="flex items-center justify-between gap-3">
              <div className="flex flex-col">
                <span className="text-[10px] text-accentPurple font-bold uppercase tracking-wider">Финансы VVD</span>
                <span className="text-xs font-bold text-white mt-0.5">Доход платформы</span>
              </div>
              <span className="text-[10px] text-textSecondary font-semibold">
                Комиссия {finance?.service_fee_percent ?? 20}%
              </span>
            </div>

            {financeLoading && !finance ? (
              <div className="py-5 text-center text-textSecondary text-xs">
                Загрузка финансов...
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-2 border-t border-white/[0.05] pt-3">
                <div>
                  <span className="text-[8px] text-textSecondary uppercase block">Traforce Gross</span>
                  <span className="text-sm font-bold text-white">${(finance?.gross_income ?? 0).toFixed(2)}</span>
                </div>
                <div>
                  <span className="text-[8px] text-textSecondary uppercase block">Партнёрам</span>
                  <span className="text-sm font-bold text-white">${(finance?.partner_income ?? 0).toFixed(2)}</span>
                </div>
                <div>
                  <span className="text-[8px] text-textSecondary uppercase block">Доход VVD</span>
                  <span className="text-sm font-bold text-success">${(finance?.service_income ?? 0).toFixed(2)}</span>
                </div>
              </div>
            )}
          </Card>

          {/* Навигационная сетка управления */}
          <div className="flex flex-col gap-3">
            <Card padding="none" className="divide-y divide-white/[0.04] text-left shadow-premium">
              {/* Управление вебмастерами */}
              <div 
                onClick={() => handleSubViewChange('users')}
                className="flex items-center justify-between p-4 hover:bg-white/[0.01] active:bg-white/[0.02] cursor-pointer transition-colors"
              >
                <div className="flex items-center gap-3">
                  <Users size={16} className="text-accentPurple" />
                  <span className="text-xs font-semibold text-white">Пользователи</span>
                </div>
                <span className="text-[10px] text-accentPurple font-bold uppercase tracking-wider">Управление</span>
              </div>

              {/* Управление офферами */}
              <div className="flex items-center justify-between p-4 opacity-40 pointer-events-none">
                <div className="flex items-center gap-3">
                  <Layers size={16} className="text-accentPurple" />
                  <span className="text-xs font-semibold text-white">Офферы</span>
                </div>
                <span className="text-[10px] text-textSecondary font-medium">В разработке</span>
              </div>

              {/* Управление выплатами */}
              <div
                onClick={() => handleSubViewChange('withdrawals')}
                className="flex items-center justify-between p-4 hover:bg-white/[0.01] active:bg-white/[0.02] cursor-pointer transition-colors"
              >
                <div className="flex items-center gap-3">
                  <CreditCard size={16} className="text-accentPurple" />
                  <span className="text-xs font-semibold text-white">Выплаты</span>
                </div>
                <span className="text-[10px] text-accentPurple font-bold uppercase tracking-wider">Управление</span>
              </div>

              {/* Реклама в Движ */}
<div
  onClick={() => handleSubViewChange('banner')}
  className="flex items-center justify-between p-4 hover:bg-white/[0.01] active:bg-white/[0.02] cursor-pointer transition-colors"
>
  <div className="flex items-center gap-3">
    <Megaphone size={16} className="text-accentGold" />
    <span className="text-xs font-semibold text-white">
      Реклама в Движ
    </span>
  </div>

  <span className="text-[10px] text-red-400 font-bold uppercase tracking-wider">
    Управление
  </span>
</div>
    {/* Блокировки чата */}
<div
  onClick={() => handleSubViewChange('chatBans')}
  className="flex items-center justify-between p-4 hover:bg-white/[0.01] active:bg-white/[0.02] cursor-pointer transition-colors"
>
  <div className="flex items-center gap-3">
    <ShieldAlert size={16} className="text-red-400" />
    <span className="text-xs font-semibold text-white">
      Блокировки чата
    </span>
  </div>          
  <span className="text-[10px] text-red-400 font-bold uppercase tracking-wider">
  Управление
</span>

</div>
              {/* Управление новостями */}
              <div className="flex items-center justify-between p-4 opacity-40 pointer-events-none">
                <div className="flex items-center gap-3">
                  <Newspaper size={16} className="text-accentPurple" />
                  <span className="text-xs font-semibold text-white">Новости</span>
                </div>
                <span className="text-[10px] text-textSecondary font-medium">В разработке</span>
              </div>

              {/* Общая статистика */}
              <div className="flex items-center justify-between p-4 opacity-40 pointer-events-none">
                <div className="flex items-center gap-3">
                  <BarChart2 size={16} className="text-accentPurple" />
                  <span className="text-xs font-semibold text-white">Статистика</span>
                </div>
                <span className="text-[10px] text-textSecondary font-medium">В разработке</span>
              </div>
            </Card>

            {/* Выход из панели */}
            <Card padding="none" className="text-left border-error/10 bg-error/[0.01] shadow-premium">
              <div 
                onClick={handleBackToProfile}
                className="flex items-center gap-3 p-4 hover:bg-error/[0.03] active:bg-error/[0.05] cursor-pointer transition-colors"
              >
                <LogOut size={16} className="text-error drop-shadow-[0_0_4px_#EF4444]" />
                <span className="text-xs font-bold text-error uppercase tracking-wider">Выход из админ панели</span>
              </div>
            </Card>
          </div>
        </div>
      )}
{/* ================= РЕКЛАМА В ДВИЖ ================= */}
{subView === 'banner' && (
  <div className="flex flex-col gap-4 animate-fade-in">

    <div className="flex items-center gap-3 text-left">
      <button
        onClick={() => handleSubViewChange('menu')}
        className="w-11 h-11 rounded-full bg-bgCard/40 border border-white/10 flex items-center justify-center text-textSecondary hover:text-textPrimary active:scale-95 transition-transform shadow-glass-inner"
      >
        <ArrowLeft size={18} />
      </button>

      <div className="flex flex-col">
        <span className="text-[10px] text-accentGold font-bold uppercase tracking-wider">
          Движ
        </span>
        <h1 className="text-xl font-bold text-white leading-none mt-0.5">
          Реклама в чате
        </h1>
      </div>
    </div>

    {bannerLoading || !chatBanner ? (
      <div className="py-24 text-center text-textSecondary text-xs">
        Загрузка рекламы...
      </div>
    ) : (
      <Card padding="md" className="flex flex-col gap-4 text-left">

        <div>
          <span className="text-[9px] text-textSecondary uppercase block mb-2">
            Заголовок
          </span>

          <Input
            value={chatBanner.title}
            onChange={(e) =>
              setChatBanner(prev =>
                prev ? { ...prev, title: e.target.value } : prev
              )
            }
            placeholder="VVD CPA"
          />
        </div>

        <div>
          <span className="text-[9px] text-textSecondary uppercase block mb-2">
            Текст рекламы
          </span>

          <textarea
            value={chatBanner.text}
            onChange={(e) =>
              setChatBanner(prev =>
                prev ? { ...prev, text: e.target.value } : prev
              )
            }
            placeholder="Текст рекламы..."
            className="w-full min-h-28 rounded-xl bg-bgCard/60 border border-white/10 p-3 text-xs text-white outline-none resize-none"
          />
        </div>

        <div>
          <span className="text-[9px] text-textSecondary uppercase block mb-2">
            Текст кнопки
          </span>

          <Input
            value={chatBanner.button_text}
            onChange={(e) =>
              setChatBanner(prev =>
                prev ? { ...prev, button_text: e.target.value } : prev
              )
            }
            placeholder="Подробнее"
          />
        </div>

        <div>
          <span className="text-[9px] text-textSecondary uppercase block mb-2">
            Ссылка
          </span>

          <Input
            value={chatBanner.button_url}
            onChange={(e) =>
              setChatBanner(prev =>
                prev ? { ...prev, button_url: e.target.value } : prev
              )
            }
            placeholder="https://..."
          />
        </div>

        <div
          onClick={() =>
            setChatBanner(prev =>
              prev
                ? { ...prev, is_active: !prev.is_active }
                : prev
            )
          }
          className="flex items-center justify-between p-4 rounded-xl border border-white/[0.06] bg-bgCard/40 cursor-pointer"
        >
          <span className="text-xs font-bold text-white">
            Показывать рекламу
          </span>

          <span
            className={`text-[10px] font-bold uppercase ${
              chatBanner.is_active
                ? 'text-success'
                : 'text-error'
            }`}
          >
            {chatBanner.is_active ? 'Включена' : 'Выключена'}
          </span>
        </div>

        <Button
          size="md"
          onClick={saveChatBanner}
          disabled={bannerSaving}
          className="w-full"
        >
          {bannerSaving ? 'Сохранение...' : 'Сохранить рекламу'}
        </Button>

      </Card>
    )}
  </div>
)}
      {/* ================= VIEW 2: СПИСОК ПОЛЬЗОВАТЕЛЕЙ ================= */}
      {subView === 'users' && (
        <div className="flex flex-col gap-4 animate-fade-in">
          {/* Шапка */}
          <div className="flex items-center gap-3 text-left">
            <button 
              onClick={() => handleSubViewChange('menu')}
              className="w-11 h-11 rounded-full bg-bgCard/40 border border-white/10 flex items-center justify-center text-textSecondary hover:text-textPrimary active:scale-95 transition-transform shadow-glass-inner"
            >
              <ArrowLeft size={18} />
            </button>
            <div className="flex flex-col">
              <span className="text-[10px] text-accentPurple font-bold uppercase tracking-wider">Админ панель</span>
              <h1 className="text-xl font-bold text-white leading-none mt-0.5">Пользователи</h1>
            </div>
          </div>

          {/* Поиск */}
          <Input 
            placeholder="Поиск по имени или ID..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            icon={<Search size={16} />}
          />

          {/* Таблица пользователей */}
          <div className="flex flex-col gap-3">
            {usersLoading && adminUsers.length === 0 ? (
              <div className="py-32 text-center text-textSecondary text-xs bg-bgCard/35 border border-white/[0.04] rounded-card backdrop-blur-md">
                Загрузка пользователей...
              </div>
            ) : filteredUsers.length > 0 ? (
              filteredUsers.map((user) => (
                <Card
                  key={user.telegram_id}
                  padding="sm"
                  className="flex flex-col gap-3 text-left hover-lift cursor-pointer active:scale-[0.99] transition-transform"
                  onClick={() => openUser(user)}
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-full bg-accentPurple/10 border border-accentPurple/25 flex items-center justify-center text-accentPurple shrink-0">
                        <Users size={18} />
                      </div>
                      <div className="flex flex-col min-w-0">
                        <span className="text-xs font-bold text-white truncate">
                          {`${user.first_name || ''} ${user.last_name || ''}`.trim() || 'Без имени'}
                        </span>
                        <span className="text-[10px] text-accentPurple font-bold mt-0.5">{user.partner_code || 'Код не присвоен'}</span>
                        <span className="text-[9px] text-textSecondary font-semibold mt-0.5">Telegram ID: {user.telegram_id}</span>
                        {user.username && <span className="text-[9px] text-textSecondary mt-0.5">@{user.username}</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 pr-1 shrink-0">
                      <span className={`w-1.5 h-1.5 rounded-full ${user.status === 'active' ? 'bg-success shadow-[0_0_8px_#22C55E]' : 'bg-error'}`} />
                      <span className={`text-[9px] font-bold uppercase tracking-wider ${user.status === 'active' ? 'text-success' : 'text-error'}`}>
                        {user.status === 'active' ? 'Активен' : 'Неактивен'}
                      </span>
                    </div>
                  </div>
                  <div className="grid grid-cols-4 gap-2 border-t border-white/[0.05] pt-3">
                    <div><span className="text-[8px] text-textSecondary uppercase block">Клики</span><span className="text-xs font-bold text-white">{user.clicks}</span></div>
                    <div><span className="text-[8px] text-textSecondary uppercase block">Конверсии</span><span className="text-xs font-bold text-white">{user.conversions}</span></div>
                    <div><span className="text-[8px] text-textSecondary uppercase block">Доход</span><span className="text-xs font-bold text-success">${user.income.toFixed(2)}</span></div>
                    <div><span className="text-[8px] text-textSecondary uppercase block">CR</span><span className="text-xs font-bold text-white">{user.cr.toFixed(2)}%</span></div>
                  </div>
                </Card>
              ))
            ) : (
              <div className="py-32 text-center text-textSecondary text-xs bg-bgCard/35 border border-white/[0.04] rounded-card backdrop-blur-md">
                Пользователи не найдены
              </div>
            )}
          </div>
        </div>
      )}

      {/* ================= VIEW 3: ВЫПЛАТЫ ================= */}
      {subView === 'withdrawals' && (
        <div className="flex flex-col gap-4 animate-fade-in">
          <div className="flex items-center gap-3 text-left">
            <button
              onClick={() => handleSubViewChange('menu')}
              className="w-11 h-11 rounded-full bg-bgCard/40 border border-white/10 flex items-center justify-center text-textSecondary hover:text-textPrimary active:scale-95 transition-transform shadow-glass-inner"
            >
              <ArrowLeft size={18} />
            </button>
            <div className="flex flex-col">
              <span className="text-[10px] text-accentPurple font-bold uppercase tracking-wider">Админ панель</span>
              <h1 className="text-xl font-bold text-white leading-none mt-0.5">Выплаты</h1>
            </div>
          </div>

          <Input
            placeholder="Partner Code, кошелёк или Telegram ID..."
            value={withdrawalSearch}
            onChange={(e) => setWithdrawalSearch(e.target.value)}
            icon={<Search size={16} />}
          />

          <div className="grid grid-cols-4 gap-2">
            {([
              ['all', 'Все'],
              ['pending', 'Ожидают'],
              ['paid', 'Выплачены'],
              ['rejected', 'Отклонены'],
            ] as const).map(([value, label]) => (
              <button
                key={value}
                onClick={() => setWithdrawalFilter(value)}
                className={`min-h-10 rounded-xl border px-2 text-[9px] font-bold transition-colors ${
                  withdrawalFilter === value
                    ? 'bg-accentPurple/15 border-accentPurple/40 text-accentPurple'
                    : 'bg-bgCard/40 border-white/[0.06] text-textSecondary'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="flex flex-col gap-3">
            {withdrawalsLoading && withdrawals.length === 0 ? (
              <div className="py-24 text-center text-textSecondary text-xs">
                Загрузка выплат...
              </div>
            ) : filteredWithdrawals.length > 0 ? (
              filteredWithdrawals.map((item) => (
                <Card key={item.id} padding="md" className="flex flex-col gap-3 text-left">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex flex-col min-w-0">
                      <span className="text-xs font-bold text-white">
                        {item.partner_code || `Telegram ID: ${item.telegram_id || '—'}`}
                      </span>
                      <span className="text-[9px] text-textSecondary mt-1">
                        {item.payment_method || 'USDT TRC20'}
                      </span>
                    </div>
                    <div className="text-right shrink-0">
                      <span className="text-base font-bold text-white">
                        ${Number(item.amount || 0).toFixed(2)}
                      </span>
                      <span className={`block text-[8px] font-bold uppercase mt-1 ${
                        item.status === 'paid'
                          ? 'text-success'
                          : item.status === 'rejected'
                            ? 'text-error'
                            : 'text-accentPurple'
                      }`}>
                        {item.status === 'paid'
                          ? 'Выплачено'
                          : item.status === 'rejected'
                            ? 'Отклонено'
                            : 'Ожидает выплаты'}
                      </span>
                    </div>
                  </div>

                  <div className="border-t border-white/[0.05] pt-3">
                    <span className="text-[8px] text-textSecondary uppercase block">Кошелёк</span>
                    <span className="text-[10px] font-semibold text-white break-all">
                      {item.wallet || '—'}
                    </span>
                  </div>

                  {item.created_at && (
                    <span className="text-[9px] text-textSecondary">
                      Создано: {new Date(item.created_at).toLocaleString('ru-RU')}
                    </span>
                  )}

                  {item.status === 'pending' && (
                    <div className="grid grid-cols-2 gap-2 border-t border-white/[0.05] pt-3">
                      <Button
                        size="md"
                        onClick={() => processWithdrawal(item.id, 'pay')}
                        disabled={processingWithdrawalId === item.id}
                        className="w-full"
                      >
                        {processingWithdrawalId === item.id ? 'Обработка...' : 'Выплачено'}
                      </Button>
                      <Button
                        variant="outline"
                        size="md"
                        onClick={() => processWithdrawal(item.id, 'reject')}
                        disabled={processingWithdrawalId === item.id}
                        className="w-full border-error/30 text-error"
                      >
                        Отклонить
                      </Button>
                    </div>
                  )}
                </Card>
              ))
            ) : (
              <div className="py-24 text-center text-textSecondary text-xs bg-bgCard/35 border border-white/[0.04] rounded-card">
                Заявки на выплату не найдены
              </div>
            )}
          </div>
        </div>
      )}

      {/* ================= VIEW 3: КАРТОЧКА ПАРТНЁРА ================= */}
      {subView === 'user' && selectedUser && (
        <div className="flex flex-col gap-4 animate-fade-in">
          <div className="flex items-center gap-3 text-left">
            <button
              onClick={() => { triggerHaptic.lightImpact(); setSubView('users'); }}
              className="w-11 h-11 rounded-full bg-bgCard/40 border border-white/10 flex items-center justify-center text-textSecondary hover:text-textPrimary active:scale-95 transition-transform shadow-glass-inner"
            >
              <ArrowLeft size={18} />
            </button>
            <div className="flex flex-col">
              <span className="text-[10px] text-accentPurple font-bold uppercase tracking-wider">Партнёр</span>
              <h1 className="text-xl font-bold text-white leading-none mt-0.5">
                {`${selectedUser.first_name || ''} ${selectedUser.last_name || ''}`.trim() || 'Без имени'}
              </h1>
            </div>
          </div>

          <Card padding="md" className="flex flex-col gap-3 text-left border-accentPurple/10">
            <div>
              <span className="text-[9px] text-textSecondary uppercase block">Partner / SUB1</span>
              <span className="text-lg font-bold text-accentPurple">{selectedUser.partner_code || 'Код не присвоен'}</span>
            </div>
            <div className="grid grid-cols-2 gap-3 border-t border-white/[0.05] pt-3">
              <div>
                <span className="text-[8px] text-textSecondary uppercase block">Telegram ID</span>
                <span className="text-xs font-bold text-white">{selectedUser.telegram_id}</span>
              </div>
              <div>
                <span className="text-[8px] text-textSecondary uppercase block">Username</span>
                <span className="text-xs font-bold text-white">{selectedUser.username ? `@${selectedUser.username}` : '—'}</span>
              </div>
            </div>
          </Card>

          <div className="grid grid-cols-2 gap-3">
            <Card padding="sm" className="text-left">
              <span className="text-[8px] text-textSecondary uppercase block">Клики</span>
              <span className="text-xl font-bold text-white">{selectedUser.clicks}</span>
            </Card>
            <Card padding="sm" className="text-left">
              <span className="text-[8px] text-textSecondary uppercase block">Конверсии</span>
              <span className="text-xl font-bold text-white">{selectedUser.conversions}</span>
            </Card>
            <Card padding="sm" className="text-left">
              <span className="text-[8px] text-textSecondary uppercase block">Доход</span>
              <span className="text-xl font-bold text-success">${selectedUser.income.toFixed(2)}</span>
            </Card>
            <Card padding="sm" className="text-left">
              <span className="text-[8px] text-textSecondary uppercase block">CR</span>
              <span className="text-xl font-bold text-white">{selectedUser.cr.toFixed(2)}%</span>
            </Card>
          </div>

          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between px-1">
              <span className="text-xs font-bold text-white">География трафика</span>
              <span className="text-[9px] text-textSecondary">{countryStats.length} стран</span>
            </div>

            {userStatsLoading ? (
              <div className="py-16 text-center text-textSecondary text-xs">Загрузка статистики...</div>
            ) : countryStats.length > 0 ? (
              countryStats.map((country) => {
                const cr = country.clicks > 0 ? (country.conversions / country.clicks) * 100 : 0;
                return (
                  <Card key={`${country.country_code}-${country.country_name}`} padding="sm" className="text-left">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex flex-col">
                        <span className="text-xs font-bold text-white">{country.country_name || country.country_code}</span>
                        <span className="text-[9px] text-textSecondary">{country.country_code}</span>
                      </div>
                      <span className="text-xs font-bold text-success">${country.income.toFixed(2)}</span>
                    </div>
                    <div className="grid grid-cols-3 gap-2 border-t border-white/[0.05] pt-3 mt-3">
                      <div><span className="text-[8px] text-textSecondary uppercase block">Клики</span><span className="text-xs font-bold text-white">{country.clicks}</span></div>
                      <div><span className="text-[8px] text-textSecondary uppercase block">Конверсии</span><span className="text-xs font-bold text-white">{country.conversions}</span></div>
                      <div><span className="text-[8px] text-textSecondary uppercase block">CR</span><span className="text-xs font-bold text-white">{cr.toFixed(2)}%</span></div>
                    </div>
                  </Card>
                );
              })
            ) : (
              <div className="py-16 text-center text-textSecondary text-xs bg-bgCard/35 border border-white/[0.04] rounded-card">
                У партнёра пока нет географической статистики
              </div>
            )}
          </div>
        </div>
      )}
      {subView === 'chatBans' && (
  <div className="flex flex-col gap-4 animate-fade-in">

    <div className="flex items-center gap-3">
      <button
        onClick={() => handleSubViewChange('menu')}
        className="w-11 h-11 rounded-full bg-bgCard/40 border border-white/10 flex items-center justify-center"
      >
        <ArrowLeft size={18}/>
      </button>

      <div>
        <span className="text-[10px] text-red-400 font-bold uppercase">
          Модерация
        </span>

        <h1 className="text-xl font-bold text-white">
          Блокировки чата
        </h1>
      </div>
    </div>

    {chatBansLoading ? (
      <div className="py-24 text-center text-textSecondary">
        Загрузка...
      </div>
    ) : chatBans.length === 0 ? (
      <div className="py-24 text-center text-textSecondary">
        Нет заблокированных пользователей
      </div>
    ) : (
      chatBans.map((ban) => (
        <Card
          key={ban.telegram_id}
          padding="md"
          className="flex flex-col gap-3"
        >

          <div className="flex justify-between items-center">
            <div>
              <div className="text-white font-bold">
                {ban.user_name}
              </div>

              <div className="text-xs text-textSecondary">
                {ban.telegram_id}
              </div>
            </div>

            <Button
              variant="outline"
              onClick={async () => {
                await fetch("https://vvd-cpa-v2.onrender.com/admin/chat/unban", {
                  method: "POST",
                  headers: {
                    "Content-Type": "application/json",
                  },
                  body: JSON.stringify({
                    admin_id: currentUser.id,
                    telegram_id: ban.telegram_id,
                  }),
                });

                setChatBans(prev =>
                  prev.filter(x => x.telegram_id !== ban.telegram_id)
                );
              }}
            >
              Разбанить
            </Button>

          </div>

        </Card>
      ))
    )}

  </div>
)}
    </div>
  );
};
