import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  ArrowLeft, Users, Layers, CreditCard, Newspaper, 
  BarChart2, Settings, LogOut, Search, ShieldAlert, 
  CheckCircle2, UserCheck 
} from 'lucide-react';
import { Card } from '@/shared/ui/Card';
import { Button } from '@/shared/ui/Button';
import { Input } from '@/shared/ui/Input';
import { getTelegramUser, triggerHaptic } from '@/shared/lib/telegram';

interface AdminUser {
  id: string;
  name: string;
  status: 'active' | 'inactive';
}

const ADMIN_USERS_MOCK: AdminUser[] = [
  { id: '123456', name: 'John Doe', status: 'active' },
  { id: '12E457', name: 'Jane Smith', status: 'active' },
  { id: '123458', name: 'Mike Johnson', status: 'active' },
  { id: '123459', name: 'Sarah Wilson', status: 'active' },
];

export const Admin: React.FC = () => {
  const navigate = useNavigate();
  const currentUser = getTelegramUser();

  // Проверка прав администратора (по макету ID администратора — 123456)
  const isAdmin = currentUser.id === 123456;

  // Управление экранами админки: 'menu' (главное меню), 'users' (список пользователей)
  const [subView, setSubView] = useState<'menu' | 'users'>('menu');
  const [searchQuery, setSearchQuery] = useState('');

  const handleBackToProfile = () => {
    triggerHaptic.lightImpact();
    navigate('/profile');
  };

  const handleSubViewChange = (view: 'menu' | 'users') => {
    triggerHaptic.lightImpact();
    setSubView(view);
  };

  // Фильтрация списка пользователей по строке поиска
  const filteredUsers = useMemo(() => {
    return ADMIN_USERS_MOCK.filter(user => 
      user.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
      user.id.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [searchQuery]);

  // Экран ограничения доступа, если ID пользователя не является администраторским
  if (!isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center p-16 h-screen bg-bgDark select-none">
        <Card padding="lg" className="flex flex-col items-center gap-16 border-error/15 bg-error/[0.01]">
          <div className="w-16 h-16 rounded-full bg-error/10 border border-error/20 flex items-center justify-center text-error">
            <ShieldAlert size={32} />
          </div>
          <div className="flex flex-col gap-6 text-center">
            <h1 className="text-lg font-bold text-white">Доступ ограничен</h1>
            <p className="text-xs text-textMuted leading-relaxed max-w-[240px]">
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
    <div className="flex flex-col gap-16 p-16 select-none pb-32 animate-fade-in">
      
      {/* ================= VIEW 1: ГЛАВНОЕ МЕНЮ АДМИНКИ (Раздел 9) ================= */}
      {subView === 'menu' && (
        <div className="flex flex-col gap-16">
          {/* Шапка админ-панели */}
          <div className="flex items-center gap-12 text-left">
            <button 
              onClick={handleBackToProfile}
              className="w-10 h-10 rounded-app-xs bg-bgCard border border-gray-800/40 flex items-center justify-center text-textSec active:scale-95 transition-transform"
            >
              <ArrowLeft size={18} />
            </button>
            <div className="flex flex-col">
              <span className="text-[10px] text-accent font-semibold uppercase tracking-wider">Панель управления</span>
              <h1 className="text-xl font-bold text-white leading-none">Админ панель</h1>
            </div>
          </div>

          {/* Информационная карточка */}
          <Card padding="md" className="flex items-center gap-12 text-left border-accent/10 bg-accentDark/[0.02]">
            <div className="w-10 h-10 rounded-full bg-accent/10 border border-accent/20 flex items-center justify-center text-accent">
              <UserCheck size={18} />
            </div>
            <div className="flex flex-col">
              <span className="text-xs font-bold text-white">Администратор: {currentUser.first_name}</span>
              <span className="text-[10px] text-textMuted mt-0.5">У вас есть полный доступ ко всем функциям управления.</span>
            </div>
          </Card>

          {/* Навигационная сетка управления (Меню раздела 9) */}
          <div className="flex flex-col gap-12">
            <Card padding="none" className="divide-y divide-gray-800/40 text-left">
              {/* Управление вебмастерами */}
              <div 
                onClick={() => handleSubViewChange('users')}
                className="flex items-center justify-between p-12 hover:bg-white/[0.01] active:bg-white/[0.03] cursor-pointer transition-colors"
              >
                <div className="flex items-center gap-12">
                  <Users size={16} className="text-accent" />
                  <span className="text-xs font-semibold text-white">Пользователи</span>
                </div>
                <span className="text-[10px] text-accent font-semibold">Управление</span>
              </div>

              {/* Управление офферами */}
              <div className="flex items-center justify-between p-12 opacity-60 pointer-events-none">
                <div className="flex items-center gap-12">
                  <Layers size={16} className="text-accent" />
                  <span className="text-xs font-semibold text-white">Офферы</span>
                </div>
                <span className="text-[10px] text-textMuted font-medium">В разработке</span>
              </div>

              {/* Управление выплатами */}
              <div className="flex items-center justify-between p-12 opacity-60 pointer-events-none">
                <div className="flex items-center gap-12">
                  <CreditCard size={16} className="text-accent" />
                  <span className="text-xs font-semibold text-white">Выплаты</span>
                </div>
                <span className="text-[10px] text-textMuted font-medium">В разработке</span>
              </div>

              {/* Управление новостями */}
              <div className="flex items-center justify-between p-12 opacity-60 pointer-events-none">
                <div className="flex items-center gap-12">
                  <Newspaper size={16} className="text-accent" />
                  <span className="text-xs font-semibold text-white">Новости</span>
                </div>
                <span className="text-[10px] text-textMuted font-medium">В разработке</span>
              </div>

              {/* Общая статистика CPA-сети */}
              <div className="flex items-center justify-between p-12 opacity-60 pointer-events-none">
                <div className="flex items-center gap-12">
                  <BarChart2 size={16} className="text-accent" />
                  <span className="text-xs font-semibold text-white">Статистика</span>
                </div>
                <span className="text-[10px] text-textMuted font-medium">В разработке</span>
              </div>
            </Card>

            {/* Выход из панели */}
            <Card padding="none" className="text-left border-error/10 bg-error/[0.02]">
              <div 
                onClick={handleBackToProfile}
                className="flex items-center gap-12 p-12 hover:bg-error/[0.03] active:bg-error/[0.05] cursor-pointer transition-colors"
              >
                <LogOut size={16} className="text-error" />
                <span className="text-xs font-bold text-error">Выход из админ панели</span>
              </div>
            </Card>
          </div>
        </div>
      )}

      {/* ================= VIEW 2: СПИСОК ПОЛЬЗОВАТЕЛЕЙ (Раздел 9.1) ================= */}
      {subView === 'users' && (
        <div className="flex flex-col gap-16 animate-fade-in">
          {/* Шапка списка пользователей */}
          <div className="flex items-center gap-12 text-left">
            <button 
              onClick={() => handleSubViewChange('menu')}
              className="w-10 h-10 rounded-app-xs bg-bgCard border border-gray-800/40 flex items-center justify-center text-textSec active:scale-95 transition-transform"
            >
              <ArrowLeft size={18} />
            </button>
            <div className="flex flex-col">
              <span className="text-[10px] text-accent font-semibold uppercase tracking-wider">Админ панель</span>
              <h1 className="text-xl font-bold text-white leading-none">Пользователи</h1>
            </div>
          </div>

          {/* Поиск пользователей */}
          <Input 
            placeholder="Поиск по имени или ID..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            icon={<Search size={16} />}
          />

          {/* Таблица пользователей по макету */}
          <div className="flex flex-col gap-12">
            {filteredUsers.length > 0 ? (
              filteredUsers.map((user) => (
                <Card 
                  key={user.id} 
                  padding="sm"
                  className="flex items-center justify-between text-left hover:border-accent/10 transition-colors"
                >
                  <div className="flex items-center gap-12">
                    {/* Аватар-заглушка */}
                    <div className="w-10 h-10 rounded-full bg-accentDark/30 border border-accent/15 flex items-center justify-center text-accent">
                      <Users size={16} />
                    </div>
                    
                    <div className="flex flex-col">
                      <span className="text-xs font-bold text-white">{user.name}</span>
                      <span className="text-[9px] text-textMuted mt-0.5">ID: {user.id}</span>
                    </div>
                  </div>

                  {/* Статус активности вебмастера */}
                  <div className="flex items-center gap-6 pr-2">
                    <span className="w-2 h-2 rounded-full bg-success animate-pulse" />
                    <span className="text-[9px] text-success uppercase font-bold tracking-wider">Активен</span>
                  </div>
                </Card>
              ))
            ) : (
              <div className="py-32 text-center text-textMuted text-xs bg-bgCard border border-gray-800/40 rounded-app-md">
                Пользователи не найдены
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
