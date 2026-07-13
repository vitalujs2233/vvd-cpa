import React, { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  ArrowLeft, Users, Layers, CreditCard, Newspaper, 
  BarChart2, Settings, LogOut, Search, ShieldAlert, 
  UserCheck 
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



export const Admin: React.FC = () => {
  const navigate = useNavigate();
  const currentUser = getTelegramUser();

  // Привязка прав администратора строго к вашему Telegram ID: 232682307
  const isAdmin = currentUser.id === 232682307;

  const [subView, setSubView] = useState<'menu' | 'users'>('menu');
  const [searchQuery, setSearchQuery] = useState('');
  const [adminUsers, setAdminUsers] = useState<AdminUser[]>([]);
const [usersLoading, setUsersLoading] = useState(false);

useEffect(() => {
  if (subView !== 'users') return;

  const loadUsers = async () => {
    try {
      setUsersLoading(true);

      const response = await fetch(
        'https://vvd-cpa-v2.onrender.com/admin/users'
      );

      const data = await response.json();

      if (data.success && Array.isArray(data.users)) {
        setAdminUsers(data.users);
      }
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

  const handleBackToProfile = () => {
    triggerHaptic.lightImpact();
    navigate('/profile');
  };

  const handleSubViewChange = (view: 'menu' | 'users') => {
    triggerHaptic.lightImpact();
    setSubView(view);
  };

  const filteredUsers = useMemo(() => {
  const query = searchQuery.toLowerCase().trim();

  return adminUsers.filter(user => {
    const fullName = `${user.first_name || ''} ${user.last_name || ''}`.toLowerCase();
    const partnerCode = (user.partner_code || '').toLowerCase();
    const username = (user.username || '').toLowerCase();
    const telegramId = String(user.telegram_id);

    return (
      fullName.includes(query) ||
      partnerCode.includes(query) ||
      username.includes(query) ||
      telegramId.includes(query)
    );
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
    <div className="flex flex-col gap-4 p-4 select-none pb-32 animate-fade-in">
      
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
              <div className="flex items-center justify-between p-4 opacity-40 pointer-events-none">
                <div className="flex items-center gap-3">
                  <CreditCard size={16} className="text-accentPurple" />
                  <span className="text-xs font-semibold text-white">Выплаты</span>
                </div>
                <span className="text-[10px] text-textSecondary font-medium">В разработке</span>
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
            {filteredUsers.length > 0 ? (
              filteredUsers.map((user) => (
                <Card 
                  key={user.id} 
                  padding="sm"
                  className="flex items-center justify-between text-left hover-lift"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-accentPurple/10 border border-accentPurple/25 flex items-center justify-center text-accentPurple shrink-0">
                      <Users size={18} />
                    </div>
                    
                    <div className="flex flex-col">
                      <span className="text-xs font-bold text-white">{user.name}</span>
                      <span className="text-[9px] text-textSecondary font-semibold mt-0.5">ID: {user.id}</span>
                    </div>
                  </div>

                  {/* Статус */}
                  <div className="flex items-center gap-1.5 pr-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-success shadow-[0_0_8px_#22C55E] animate-pulse" />
                    <span className="text-[9px] font-bold text-success uppercase tracking-wider">Активен</span>
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
    </div>
  );
};
