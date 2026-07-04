import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Search, Heart, Sparkles, Pill, Coins, Gamepad2, 
  Smartphone, ChevronRight, Star 
} from 'lucide-react';
import { Card } from '@/shared/ui/Card';
import { Input } from '@/shared/ui/Input';
import { triggerHaptic } from '@/shared/lib/telegram';

interface OfferCategory {
  id: string;
  title: string;
  offersCount: number;
  iconName: 'heart' | 'sparkles' | 'pill' | 'coins' | 'gamepad' | 'smartphone';
  isTop: boolean;
  isNew: boolean;
  colorClass: string;
}

const CATEGORIES_DATA: OfferCategory[] = [
  {
    id: 'adult-dating',
    title: 'Adult Dating',
    offersCount: 120,
    iconName: 'heart',
    isTop: true,
    isNew: false,
    colorClass: 'text-error bg-error/10 border-error/25 shadow-[0_0_15px_rgba(239,68,68,0.15)]',
  },
  {
    id: 'mainstream-dating',
    title: 'Mainstream Dating',
    offersCount: 95,
    iconName: 'sparkles',
    isTop: false,
    isNew: true,
    colorClass: 'text-warning bg-warning/10 border-warning/25 shadow-[0_0_15px_rgba(245,158,11,0.15)]',
  },
  {
    id: 'nutra',
    title: 'Nutra',
    offersCount: 80,
    iconName: 'pill',
    isTop: true,
    isNew: false,
    colorClass: 'text-success bg-success/10 border-success/25 shadow-[0_0_15px_rgba(34,197,94,0.15)]',
  },
  {
    id: 'crypto',
    title: 'Crypto',
    offersCount: 65,
    iconName: 'coins',
    isTop: true,
    isNew: false,
    colorClass: 'text-accentPurple bg-accentPurple/10 border-accentPurple/25 shadow-[0_0_15px_rgba(124,58,237,0.15)]',
  },
  {
    id: 'gaming',
    title: 'Gaming',
    offersCount: 50,
    iconName: 'gamepad',
    isTop: false,
    isNew: true,
    colorClass: 'text-blue-400 bg-blue-400/10 border-blue-400/25 shadow-[0_0_15px_rgba(96,165,250,0.15)]',
  },
  {
    id: 'utilities',
    title: 'Utilities',
    offersCount: 40,
    iconName: 'smartphone',
    isTop: false,
    isNew: false,
    colorClass: 'text-textSec bg-white/[0.02] border-white/10',
  },
];

export const Offers: React.FC = () => {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'all' | 'top' | 'new' | 'fav'>('all');
  const [favorites, setFavorites] = useState<string[]>(['adult-dating', 'crypto']); // Предустановлено по макету

  const toggleFavorite = (id: string, e: React.MouseEvent) => {
    e.stopPropagation(); // Исключаем срабатывание клика по всей карточке
    triggerHaptic.lightImpact();
    setFavorites(prev => 
      prev.includes(id) ? prev.filter(favId => favId !== id) : [...prev, id]
    );
  };

  const renderIcon = (name: string, className: string) => {
    const iconProps = { size: 20, className }; // Крупные люксовые иконки
    switch (name) {
      case 'heart': return <Heart {...iconProps} />;
      case 'sparkles': return <Sparkles {...iconProps} />;
      case 'pill': return <Pill {...iconProps} />;
      case 'coins': return <Coins {...iconProps} />;
      case 'gamepad': return <Gamepad2 {...iconProps} />;
      case 'smartphone': return <Smartphone {...iconProps} />;
      default: return <Sparkles {...iconProps} />;
    }
  };

  const handleCategoryClick = (id: string) => {
    triggerHaptic.mediumImpact();
    navigate(`/offers/${id}`);
  };

  const handleTabChange = (tab: 'all' | 'top' | 'new' | 'fav') => {
    triggerHaptic.lightImpact();
    setActiveTab(tab);
  };

  const filteredCategories = useMemo(() => {
    return CATEGORIES_DATA.filter(category => {
      const matchesSearch = category.title.toLowerCase().includes(searchQuery.toLowerCase());
      if (!matchesSearch) return false;

      if (activeTab === 'top') return category.isTop;
      if (activeTab === 'new') return category.isNew;
      if (activeTab === 'fav') return favorites.includes(category.id);
      
      return true;
    });
  }, [searchQuery, activeTab, favorites]);

  return (
    <div className="flex flex-col gap-20 p-16 select-none pb-32 animate-fade-in">
      
      {/* Шапка раздела */}
      <div className="flex flex-col text-left">
        <span className="text-[10px] text-textSecondary font-bold uppercase tracking-wider">CPA Каталог</span>
        <h1 className="text-2xl font-bold text-white mt-1">Офферы</h1>
      </div>

      {/* Роскошный матовый поиск с иконкой */}
      <Input 
        placeholder="Поиск по категориям или ID..."
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        icon={<Search size={16} />}
      />

      {/* Панель табов (Glassmorphism, плавная анимация, неоновое свечение для активной вкладки) */}
      <div className="flex bg-bgCard/35 backdrop-blur-md border border-white/[0.04] rounded-app-xs p-4 gap-4 shadow-glass-inner">
        <button
          onClick={() => handleTabChange('all')}
          className={`flex-1 py-2 text-xs font-semibold rounded-app-xs transition-all duration-300 ${
            activeTab === 'all' 
              ? 'bg-accent-gradient text-white shadow-glow-purple' 
              : 'text-textSecondary hover:text-textPrimary'
          }`}
        >
          Все
        </button>
        <button
          onClick={() => handleTabChange('top')}
          className={`flex-1 py-2 text-xs font-semibold rounded-app-xs transition-all duration-300 ${
            activeTab === 'top' 
              ? 'bg-accent-gradient text-white shadow-glow-purple' 
              : 'text-textSecondary hover:text-textPrimary'
          }`}
        >
          Топ
        </button>
        <button
          onClick={() => handleTabChange('new')}
          className={`flex-1 py-2 text-xs font-semibold rounded-app-xs transition-all duration-300 ${
            activeTab === 'new' 
              ? 'bg-accent-gradient text-white shadow-glow-purple' 
              : 'text-textSecondary hover:text-textPrimary'
          }`}
        >
          Новые
        </button>
        <button
          onClick={() => handleTabChange('fav')}
          className={`flex-1 py-2 text-xs font-semibold rounded-app-xs transition-all duration-300 flex items-center justify-center gap-4 ${
            activeTab === 'fav' 
              ? 'bg-accent-gradient text-white shadow-glow-purple' 
              : 'text-textSecondary hover:text-textPrimary'
          }`}
        >
          <Star size={12} className={activeTab === 'fav' ? 'fill-white text-white' : 'fill-none'} />
          Избранное
        </button>
      </div>

      {/* Список категорий в стиле Luxury UI */}
      <div className="flex flex-col gap-12">
        {filteredCategories.length > 0 ? (
          filteredCategories.map((category) => {
            const isFav = favorites.includes(category.id);
            return (
              <Card
                key={category.id}
                clickable
                padding="none"
                onClick={() => handleCategoryClick(category.id)}
                className="flex items-center justify-between p-16 text-left hover-lift"
              >
                <div className="flex items-center gap-16">
                  {/* Крупный контейнер иконки с благородной подсветкой */}
                  <div className={`w-12 h-12 rounded-app-xs border flex items-center justify-center ${category.colorClass}`}>
                    {renderIcon(category.iconName, '')}
                  </div>
                  <div className="flex flex-col">
                    <span className="text-sm font-bold text-white">{category.title}</span>
                    <span className="text-[10px] text-textSecondary font-semibold mt-1">
                      {category.offersCount} офферов доступно
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-12">
                  {/* Статус Active с неоновым зеленым пульсирующим свечением */}
                  <div className="flex items-center gap-6 px-8 py-4 bg-white/[0.02] border border-white/5 rounded-app-xs">
                    <span className="w-1.5 h-1.5 rounded-full bg-success shadow-[0_0_8px_#22C55E] animate-pulse" />
                    <span className="text-[9px] font-bold text-success uppercase tracking-wider">Active</span>
                  </div>

                  {/* Кнопка добавления в Избранное с неоновым красным свечением */}
                  <button
                    onClick={(e) => toggleFavorite(category.id, e)}
                    className="p-8 text-textSecondary hover:text-textPrimary transition-all duration-200"
                  >
                    <Heart 
                      size={18} 
                      className={isFav ? 'fill-error text-error drop-shadow-[0_0_6px_#EF4444]' : 'text-textSecondary/50 hover:text-textPrimary'} 
                    />
                  </button>
                  <ChevronRight size={16} className="text-gray-600 mr-2" />
                </div>
              </Card>
            );
          })
        ) : (
          <div className="py-32 text-center text-textSecondary text-xs bg-bgCard/30 border border-white/[0.04] rounded-card backdrop-blur-md">
            Вертикали не найдены
          </div>
        )}
      </div>
    </div>
  );
};
