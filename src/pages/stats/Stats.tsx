import React, { useState, useMemo } from 'react';
import { 
  TrendingUp, BarChart2, Eye, ShieldAlert, 
  Coins, ArrowUpRight, ArrowDownRight, RefreshCw 
} from 'lucide-react';
import { Card } from '@/shared/ui/Card';
import { triggerHaptic } from '@/shared/lib/telegram';

interface StatsPeriodData {
  clicks: number;
  clicksTrend: number;
  conversions: number;
  conversionsTrend: number;
  cr: string; // Conversion Rate (%)
  income: number;
  incomeTrend: number;
  epc: number;
  epcTrend: number;
  chartPath: string; // Путь для SVG линии
  chartAreaPath: string; // Путь для SVG заливки под линией
}

// База данных по периодам для пересчета статистики на лету
const STATS_DATA_MAP: Record<'today' | 'yesterday' | '7days' | '30days' | 'all', StatsPeriodData> = {
  today: {
    clicks: 1234,
    clicksTrend: 12.5,
    conversions: 56,
    conversionsTrend: 8.2,
    cr: '4.54%',
    income: 23.45,
    incomeTrend: 12.5,
    epc: 0.10,
    epcTrend: 6.1,
    chartPath: 'M 0 110 Q 50 120 100 80 T 200 110 T 300 50 T 400 30',
    chartAreaPath: 'M 0 110 Q 50 120 100 80 T 200 110 T 300 50 T 400 30 L 400 150 L 0 150 Z',
  },
  yesterday: {
    clicks: 980,
    clicksTrend: -4.2,
    conversions: 42,
    conversionsTrend: -2.1,
    cr: '4.28%',
    income: 18.20,
    incomeTrend: -5.3,
    epc: 0.09,
    epcTrend: -1.5,
    chartPath: 'M 0 90 Q 50 60 100 110 T 200 80 T 300 120 T 400 100',
    chartAreaPath: 'M 0 90 Q 50 60 100 110 T 200 80 T 300 120 T 400 100 L 400 150 L 0 150 Z',
  },
  '7days': {
    clicks: 8750,
    clicksTrend: 14.8,
    conversions: 380,
    conversionsTrend: 11.2,
    cr: '4.34%',
    income: 162.40,
    incomeTrend: 15.1,
    epc: 0.12,
    epcTrend: 8.4,
    chartPath: 'M 0 120 Q 50 90 100 60 T 200 90 T 300 40 T 400 15',
    chartAreaPath: 'M 0 120 Q 50 90 100 60 T 200 90 T 300 40 T 400 15 L 400 150 L 0 150 Z',
  },
  '30days': {
    clicks: 35600,
    clicksTrend: 18.9,
    conversions: 1490,
    conversionsTrend: 15.6,
    cr: '4.18%',
    income: 650.10,
    incomeTrend: 19.4,
    epc: 0.11,
    epcTrend: 10.2,
    chartPath: 'M 0 130 Q 50 110 100 50 T 200 70 T 300 30 T 400 10',
    chartAreaPath: 'M 0 130 Q 50 110 100 50 T 200 70 T 300 30 T 400 10 L 400 150 L 0 150 Z',
  },
  all: {
    clicks: 120400,
    clicksTrend: 22.1,
    conversions: 4890,
    conversionsTrend: 19.8,
    cr: '4.06%',
    income: 2120.50,
    incomeTrend: 24.3,
    epc: 0.10,
    epcTrend: 11.5,
    chartPath: 'M 0 100 Q 50 80 100 40 T 200 60 T 300 20 T 400 5',
    chartAreaPath: 'M 0 100 Q 50 80 100 40 T 200 60 T 300 20 T 400 5 L 400 150 L 0 150 Z',
  },
};

export const Stats: React.FC = () => {
  const [activeFilter, setActiveFilter] = useState<'today' | 'yesterday' | '7days' | '30days' | 'all'>('today');
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Получаем данные для активного периода
  const currentData = useMemo(() => {
    return STATS_DATA_MAP[activeFilter];
  }, [activeFilter]);

  const handleFilterChange = (filter: 'today' | 'yesterday' | '7days' | '30days' | 'all') => {
    triggerHaptic.lightImpact();
    setActiveFilter(filter);
  };

  const handleRefresh = () => {
    triggerHaptic.mediumImpact();
    setIsRefreshing(true);
    
    // Имитация обновления статистики из сети
    setTimeout(() => {
      setIsRefreshing(false);
      triggerHaptic.success();
    }, 800);
  };

  // Метод рендеринга плашки тренда (зеленая вверх или красная вниз)
  const renderTrend = (value: number) => {
    const isPositive = value >= 0;
    return (
      <span className={`inline-flex items-center text-[10px] font-bold px-1.5 py-0.5 rounded-app-xs gap-2 ${
        isPositive ? 'text-success bg-success/10 border border-success/20' : 'text-error bg-error/10 border border-error/20'
      }`}>
        {isPositive ? <ArrowUpRight size={10} /> : <ArrowDownRight size={10} />}
        {isPositive ? '+' : ''}{value}%
      </span>
    );
  };

  return (
    <div className="flex flex-col gap-16 p-16 select-none pb-24">
      
      {/* Шапка раздела */}
      <div className="flex items-center justify-between text-left">
        <div className="flex flex-col">
          <h1 className="text-2xl font-bold text-white">Статистика</h1>
          <p className="text-xs text-textMuted mt-1">Аналитика трафика в реальном времени</p>
        </div>
        
        {/* Кнопка ручного обновления */}
        <button 
          onClick={handleRefresh}
          className={`w-10 h-10 rounded-app-xs bg-bgCard border border-gray-800/40 flex items-center justify-center text-textMuted active:scale-95 transition-all duration-200 ${
            isRefreshing ? 'animate-spin text-accent' : 'hover:text-white'
          }`}
        >
          <RefreshCw size={16} />
        </button>
      </div>

      {/* Горизонтальные вкладки дат по макету */}
      <div className="flex bg-bgCard border border-gray-800/40 rounded-app-xs p-4 gap-4 overflow-x-auto no-scrollbar scrollable-container">
        <button
          onClick={() => handleFilterChange('today')}
          className={`px-3 py-1.5 text-xs font-semibold rounded-app-xs transition-colors whitespace-nowrap shrink-0 ${
            activeFilter === 'today' ? 'bg-accent text-white shadow' : 'text-textMuted'
          }`}
        >
          Сегодня
        </button>
        <button
          onClick={() => handleFilterChange('yesterday')}
          className={`px-3 py-1.5 text-xs font-semibold rounded-app-xs transition-colors whitespace-nowrap shrink-0 ${
            activeFilter === 'yesterday' ? 'bg-accent text-white shadow' : 'text-textMuted'
          }`}
        >
          Вчера
        </button>
        <button
          onClick={() => handleFilterChange('7days')}
          className={`px-3 py-1.5 text-xs font-semibold rounded-app-xs transition-colors whitespace-nowrap shrink-0 ${
            activeFilter === '7days' ? 'bg-accent text-white shadow' : 'text-textMuted'
          }`}
        >
          7 дней
        </button>
        <button
          onClick={() => handleFilterChange('30days')}
          className={`px-3 py-1.5 text-xs font-semibold rounded-app-xs transition-colors whitespace-nowrap shrink-0 ${
            activeFilter === '30days' ? 'bg-accent text-white shadow' : 'text-textMuted'
          }`}
        >
          30 дней
        </button>
        <button
          onClick={() => handleFilterChange('all')}
          className={`px-3 py-1.5 text-xs font-semibold rounded-app-xs transition-colors whitespace-nowrap shrink-0 ${
            activeFilter === 'all' ? 'bg-accent text-white shadow' : 'text-textMuted'
          }`}
        >
          Все
        </button>
      </div>

      {/* Интерактивный SVG график */}
      <Card variant="default" padding="none" className="relative flex flex-col p-12 overflow-hidden h-[210px] justify-between">
        <div className="flex items-center justify-between text-left">
          <span className="text-xs font-bold text-white">Тренд дохода</span>
          <span className="text-[10px] text-textMuted">Интервал: {activeFilter === 'today' ? '24 часа' : 'Динамика периода'}</span>
        </div>

        {/* Тело SVG графика */}
        <div className="w-full h-[120px] relative mt-12">
          <svg className="w-full h-full" viewBox="0 0 400 150" preserveAspectRatio="none">
            <defs>
              {/* Фиолетовый градиент для плавной заливки под линией */}
              <linearGradient id="chartGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#7B5CFF" stopOpacity="0.25" />
                <stop offset="100%" stopColor="#7B5CFF" stopOpacity="0.0" />
              </linearGradient>
            </defs>

            {/* Вспомогательные горизонтальные линии сетки */}
            <line x1="0" y1="35" x2="400" y2="35" stroke="#374151" strokeOpacity="0.2" strokeDasharray="4" />
            <line x1="0" y1="75" x2="400" y2="75" stroke="#374151" strokeOpacity="0.2" strokeDasharray="4" />
            <line x1="0" y1="115" x2="400" y2="115" stroke="#374151" strokeOpacity="0.2" strokeDasharray="4" />

            {/* Векторная область заливки под трендом */}
            <path
              d={currentData.chartAreaPath}
              fill="url(#chartGradient)"
              className="transition-all duration-500 ease-in-out"
            />

            {/* Главная акцентная фиолетовая линия тренда */}
            <path
              d={currentData.chartPath}
              fill="none"
              stroke="#7B5CFF"
              strokeWidth="3"
              strokeLinecap="round"
              className="transition-all duration-500 ease-in-out"
            />
          </svg>
        </div>

        {/* Шкала оси X (Временные маркеры из макета) */}
        <div className="flex justify-between text-[10px] text-textMuted px-2 border-t border-gray-800/20 pt-8 mt-2">
          <span>00:00</span>
          <span>06:00</span>
          <span>12:00</span>
          <span>18:00</span>
          <span>24:00</span>
        </div>
      </Card>

      {/* Сетка карточек метрик (Сводка из макета) */}
      <div className="grid grid-cols-2 gap-12 text-left">
        {/* Карточка 1: Клики */}
        <Card padding="md" className="flex flex-col justify-between gap-12 min-h-[96px]">
          <div className="flex items-center justify-between text-textMuted">
            <span className="text-[10px] font-semibold uppercase tracking-wider">Клики</span>
            <Eye size={12} className="text-accent" />
          </div>
          <div className="flex justify-between items-end">
            <span className="text-lg font-bold text-white">{currentData.clicks.toLocaleString('ru-RU')}</span>
            {renderTrend(currentData.clicksTrend)}
          </div>
        </Card>

        {/* Карточка 2: Конверсии */}
        <Card padding="md" className="flex flex-col justify-between gap-12 min-h-[96px]">
          <div className="flex items-center justify-between text-textMuted">
            <span className="text-[10px] font-semibold uppercase tracking-wider">Конверсии</span>
            <ShieldAlert size={12} className="text-accent" />
          </div>
          <div className="flex justify-between items-end">
            <div className="flex flex-col">
              <span className="text-lg font-bold text-white">{currentData.conversions}</span>
              <span className="text-[8px] text-textMuted font-semibold mt-0.5">CR: {currentData.cr}</span>
            </div>
            {renderTrend(currentData.conversionsTrend)}
          </div>
        </Card>

        {/* Карточка 3: Доход */}
        <Card padding="md" className="flex flex-col justify-between gap-12 min-h-[96px]">
          <div className="flex items-center justify-between text-textMuted">
            <span className="text-[10px] font-semibold uppercase tracking-wider">Доход</span>
            <Coins size={12} className="text-success" />
          </div>
          <div className="flex justify-between items-end">
            <span className="text-lg font-bold text-white">${currentData.income.toLocaleString('ru-RU', { minimumFractionDigits: 2 })}</span>
            {renderTrend(currentData.incomeTrend)}
          </div>
        </Card>

        {/* Карточка 4: EPC */}
        <Card padding="md" className="flex flex-col justify-between gap-12 min-h-[96px]">
          <div className="flex items-center justify-between text-textMuted">
            <span className="text-[10px] font-semibold uppercase tracking-wider">EPC</span>
            <BarChart2 size={12} className="text-accent" />
          </div>
          <div className="flex justify-between items-end">
            <span className="text-lg font-bold text-white">${currentData.epc.toFixed(2)}</span>
            {renderTrend(currentData.epcTrend)}
          </div>
        </Card>
      </div>
    </div>
  );
};
