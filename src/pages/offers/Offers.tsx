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
    colorClass: 'text-error bg-error/10 border-error/20',
  },
  {
    id: 'mainstream-dating',
    title: 'Mainstream Dating',
    offersCount: 95,
    iconName: 'sparkles',
    isTop: false,
    isNew: true,
    colorClass: 'text-warning bg-warning/10 border-warning/20',
  },
  {
    id: 'nutra',
    title: 'Nutra',
    offersCount: 80,
    iconName: 'pill',
    isTop: true,
    isNew: false,
    colorClass: 'text-success bg-success/10 border-success/20',
  },
  {
    id: 'crypto',
    title: 'Crypto',
    offersCount: 65,
    iconName: 'coins',
    isTop: true,
    isNew: false,
    colorClass: 'text-accent bg-accent/10 border-accent/20',
  },
  {
    id: 'gaming',
    title: 'Gaming',
    offersCount: 50,
    iconName: 'gamepad',
    isTop: false,
    isNew: true,
    colorClass: 'text-blue-400 bg-blue-400/10 border-blue-400/20',
  },
  {
    id: 'utilities',
    title: 'Utilities',
    offersCount: 40,
    iconName: 'smartphone',
    isTop: false,
    isNew: false,
    colorClass: 'text-textSec bg-gray-800/40 border-gray-700/40',
  },
];

export const Offers: React.FC = () => {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'all' | 'top' | 'new' | 'fav'>('all');
  const [favorites, setFavorites] = useState<string[]>(['adult-dating', 'crypto']); // Предустановлено по макету

  // Функция переключения категории в избранное
  const toggleFavorite = (id: string, e: React.MouseEvent) => {
    e.stopPropagation(); // Предотвращаем клик по всей карточке
    triggerHaptic.lightImpact();
    setFavorites(prev => 
      prev.includes(id) ? prev.filter(favId => favId !== id) : [...prev, id]
    );
  };

  // Выбор рендеринга соответствующей иконки для категории
  const renderIcon = (name: string, className: string) => {
    const iconProps = { size: 18, className };
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

  // Мемоизированная фильтрация списка категорий по тексту и активному табу
  const filteredCategories = useMemo(() => {
    return CATEGORIES_DATA.filter(category => {
      // Фильтр по строке поиска
      const matchesSearch = category.title.toLowerCase().includes(searchQuery.toLowerCase());
      if (!matchesSearch) return false;

      // Фильтр по активному табу
      if (activeTab === 'top') return category.isTop;
      if (activeTab === 'new') return category.isNew;
      if (activeTab === 'fav') return favorites.includes(category.id);
      
      return true;
    });
  }, [searchQuery, activeTab, favorites]);

  return (
    <div className="flex flex-col gap-16 p-16 select-none pb-24">
      {/* Шапка страницы */}
      <div className="text-left">
        <h1 className="text-2xl font-bold text-white">Категории Офферов</h1>
        <p className="text-xs text-textMuted mt-1">Выберите вертикаль для генерации SmartLink</p>
      </div>

      {/* Инпут поиска из нашего UI-Kit */}
      <Input
        placeholder="Поиск вертикали..."
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        icon={<Search size={16} />}
      />

      {/* Горизонтальные табы-фильтры по макету */}
      <div className="flex bg-bgCard border border-gray-800/40 rounded-app-xs p-4 gap-4">
        <button
          onClick={() => handleTabChange('all')}
          className={`flex-1 py-1.5 text-xs font-semibold rounded-app-xs transition-colors duration-150 ${
            activeTab === 'all' ? 'bg-accent text-white shadow' : 'text-textMuted hover:text-white'
          }`}
        >
          Все
        </button>
        <button
          onClick={() => handleTabChange('top')}
          className={`flex-1 py-1.5 text-xs font-semibold rounded-app-xs transition-colors duration-150 ${
            activeTab === 'top' ? 'bg-accent text-white shadow' : 'text-textMuted hover:text-white'
          }`}
        >
          Топ
        </button>
        <button
          onClick={() => handleTabChange('new')}
          className={`flex-1 py-1.5 text-xs font-semibold rounded-app-xs transition-colors duration-150 ${
            activeTab === 'new' ? 'bg-accent text-white shadow' : 'text-textMuted hover:text-white'
          }`}
        >
          Новые
        </button>
        <button
          onClick={() => handleTabChange('fav')}
          className={`flex-1 py-1.5 text-xs font-semibold rounded-app-xs transition-colors duration-150 flex items-center justify-center gap-1 ${
            activeTab === 'fav' ? 'bg-accent text-white shadow' : 'text-textMuted hover:text-white'
          }`}
        >
          <Star size={10} className={activeTab === 'fav' ? 'fill-white' : 'fill-none'} />
          Избранное
        </button>
      </div>

      {/* Список категорий */}
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
                className="flex items-center justify-between p-12 text-left"
              >
                <div className="flex items-center gap-12">
                  {/* Контейнер иконки с цветом из макета */}
                  <div className={`w-10 h-10 rounded-app-xs border flex items-center justify-center ${category.colorClass}`}>
                    {renderIcon(category.iconName, '')}
                  </div>
                  <div className="flex flex-col">
                    <span className="text-sm font-bold text-white">{category.title}</span>
                    <span className="text-[10px] text-textMuted mt-1">
                      {category.offersCount} офферов доступно
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-12">
                  {/* Кнопка добавления в Избранное */}
                  <button
                    onClick={(e) => toggleFavorite(category.id, e)}
                    className="p-8 text-textMuted hover:text-white transition-colors duration-150"
                  >
                    <Heart 
                      size={16} 
                      className={isFav ? 'fill-error text-error' : 'text-textMuted hover:text-white/60'} 
                    />
                  </button>
                  {/* Стрелочка навигации */}
                  <ChevronRight size={16} className="text-gray-600 mr-2" />
                </div>
              </Card>
            );
          })
        ) : (
          <div className="py-32 text-center text-textMuted text-xs bg-bgCard border border-gray-800/40 rounded-app-md">
            Вертикали не найдены
          </div>
        )}
      </div>
    </div>
  );
};
