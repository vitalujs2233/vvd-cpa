import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Search, Heart, Sparkles, Video, Joystick, Gamepad2, 
  Smartphone, ChevronRight, Star 
   
} from 'lucide-react';
import { Card } from '@/shared/ui/Card';
import { Input } from '@/shared/ui/Input';
import { triggerHaptic } from '@/shared/lib/telegram';

interface OfferCategory {
  id: string;
  title: string;
  offersCount: number;
  iconName: 'heart' | 'sparkles' | 'video' | 'joystick' | 'gamepad' | 'smartphone';
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
  id: 'webcam',
  title: 'Web Cam',
  offersCount: 80,
  iconName: 'video',
  isTop: true,
  isNew: false,
  colorClass: 'text-success bg-success/10 border-success/25 shadow-[0_0_15px_rgba(34,197,94,0.15)]',
},
  {
  id: 'adult-games',
  title: 'Adult Games',
  offersCount: 65,
  iconName: 'joystick',
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
    e.stopPropagation(); // Исключаем клик по всей карточке
    triggerHaptic.lightImpact();
    setFavorites(prev => 
      prev.includes(id) ? prev.filter(favId => favId !== id) : [...prev, id]
    );
  };

  const renderIcon = (name: string, className: string) => {
    const iconProps = { size: 20, className }; // Крупные иконки
    switch (name) {
      case 'heart': return <Heart {...iconProps} />;
      case 'sparkles': return <Sparkles {...iconProps} />;
      case 'video': return <Video {...iconProps} />;
      case 'joystick': return <Joystick {...iconProps} />;
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
    <div className="flex flex-col gap-4 p-4 select-none pb-32 animate-fade-in w-full">
      
      {/* Шапка раздела */}
      <div className="flex flex-col text-left">
        <span className="text-[10px] text-textSecondary font-bold uppercase tracking-wider">CPA Каталог</span>
        <h1 className="text-2xl font-bold text-white mt-1">Офферы</h1>
      </div>

      {/* Поиск */}
      <Input 
        placeholder="Поиск по категориям или ID..."
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        icon={<Search size={16} />}
      />

      {/* Панель табов */}
      <div className="flex bg-bgCard/35 backdrop-blur-md border border-white/[0.04] rounded-app-xs p-2 gap-2 shadow-glass-inner">
        <button
          onClick={() => handleTabChange('all')}
          className={`flex-1 py-1.5 text-xs font-semibold rounded-app-xs transition-all duration-300 ${
            activeTab === 'all' 
              ? 'bg-accent-gradient text-white shadow-glow-purple' 
              : 'text-textSecondary hover:text-textPrimary'
          }`}
        >
          Все
        </button>
        <button
          onClick={() => handleTabChange('top')}
          className={`flex-1 py-1.5 text-xs font-semibold rounded-app-xs transition-all duration-300 ${
            activeTab === 'top' 
              ? 'bg-accent-gradient text-white shadow-glow-purple' 
              : 'text-textSecondary hover:text-textPrimary'
          }`}
        >
          Топ
        </button>
        <button
          onClick={() => handleTabChange('new')}
          className={`flex-1 py-1.5 text-xs font-semibold rounded-app-xs transition-all duration-300 ${
            activeTab === 'new' 
              ? 'bg-accent-gradient text-white shadow-glow-purple' 
              : 'text-textSecondary hover:text-textPrimary'
          }`}
        >
          Новые
        </button>
        <button
          onClick={() => handleTabChange('fav')}
          className={`flex-1 py-1.5 text-xs font-semibold rounded-app-xs transition-all duration-300 flex items-center justify-center gap-1.5 ${
            activeTab === 'fav' 
              ? 'bg-accent-gradient text-white shadow-glow-purple' 
              : 'text-textSecondary hover:text-textPrimary'
          }`}
        >
          <Star size={10} className={activeTab === 'fav' ? 'fill-white text-white' : 'fill-none'} />
          Избранное
        </button>
      </div>

      {/* 
        Список категорий.
        ПЕРЕВЕДЕН НА АДАПТИВНУЮ СЕТКУ:
        - На телефоне: 1 колонка (grid-cols-1)
        - На планшетах: 2 колонки (md:grid-cols-2)
        - На компьютерах: 3 колонки (lg:grid-cols-3)
      */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 w-full">
        {filteredCategories.length > 0 ? (
          filteredCategories.map((category) => {
            const isFav = favorites.includes(category.id);
            return (
              <Card
                key={category.id}
                clickable
                padding="sm"
                onClick={() => handleCategoryClick(category.id)}
                className="flex items-center justify-between hover-lift shadow-premium"
              >
                <div className="flex items-center gap-3">
                  <div className={`w-11 h-11 rounded-app-xs border flex items-center justify-center ${category.colorClass}`}>
                    {renderIcon(category.iconName, '')}
                  </div>
                  <div className="flex flex-col text-left">
                    <span className="text-sm font-bold text-white">{category.title}</span>
                    <span className="text-[10px] text-textSecondary font-semibold mt-1">
                      {category.offersCount} офферов доступно
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1.5 px-2 py-1 bg-success/5 border border-success/20 rounded-app-xs">
                    <span className="w-1.5 h-1.5 rounded-full bg-success shadow-[0_0_8px_#22C55E] animate-pulse" />
                    <span className="text-[9px] font-bold text-success uppercase tracking-wider">Active</span>
                  </div>

                  <button
                    onClick={(e) => toggleFavorite(category.id, e)}
                    className="p-2 text-textSecondary hover:text-white transition-colors duration-150"
                  >
                    <Heart 
                      size={16} 
                      className={isFav ? 'fill-error text-error drop-shadow-[0_0_6px_#EF4444]' : 'text-textSecondary/50 hover:text-textPrimary'} 
                    />
                  </button>
                  <ChevronRight size={16} className="text-gray-600 mr-1" />
                </div>
              </Card>
            );
          })
        ) : (
          <div className="py-32 text-center text-textSecondary text-xs bg-bgCard/35 border border-white/[0.04] rounded-card backdrop-blur-md col-span-full">
            Вертикали не найдены
          </div>
        )}
      </div>
    </div>
  );
};
