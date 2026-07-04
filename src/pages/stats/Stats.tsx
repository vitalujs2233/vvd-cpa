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
    
    setTimeout(() => {
      setIsRefreshing(false);
      triggerHaptic.success();
    }, 800);
  };

  const renderTrend = (value: number) => {
    const isPositive = value >= 0;
    return (
      <span className={`inline-flex items-center text-[9px] font-bold px-2 py-0.5 rounded-app-xs gap-1.5 shrink-0 border ${
        isPositive 
          ? 'text-success bg-success/10 border-success/20 shadow-[0_0_10px_rgba(34,197,94,0.15)]' 
          : 'text-error bg-error/10 border-error/20 shadow-[0_0_10px_rgba(239,68,68,0.15)]'
      }`}>
        {isPositive ? <ArrowUpRight size={10} className="drop-shadow-[0_0_4px_#22C55E]" /> : <ArrowDownRight size={10} className="drop-shadow-[0_0_4px_#EF4444]" />}
        {isPositive ? '+' : ''}{value}%
      </span>
    );
  };

  return (
    // Заменили внешние отступы p-16 (64px) на адаптивные p-4 (16px), а gap-20 на gap-4
    <div className="flex flex-col gap-4 p-4 select-none pb-32 animate-fade-in">
      
      {/* Шапка раздела */}
      <div className="flex items-center justify-between text-left">
        <div className="flex flex-col">
          <span className="text-[10px] text-textSecondary font-bold uppercase tracking-wider">Платформа VVD CPA</span>
          <h1 className="text-2xl font-bold text-white mt-1">Анализ трафика</h1>
        </div>
        
        {/* Кнопка обновления */}
        <button 
          onClick={handleRefresh}
          className={`w-11 h-11 rounded-full bg-bgCard/40 border border-white/10 flex items-center justify-center text-textSecondary active:scale-95 transition-all duration-200 shadow-glass-inner ${
            isRefreshing ? 'animate-spin text-accentPurple' : 'hover:text-textPrimary'
          }`}
        >
          <RefreshCw size={16} />
        </button>
      </div>

      {/* Горизонтальные вкладки дат */}
      <div className="flex bg-bgCard/35 backdrop-blur-md border border-white/[0.04] rounded-app-xs p-2 gap-2 overflow-x-auto no-scrollbar scrollable-container shadow-glass-inner">
        <button
          onClick={() => handleFilterChange('today')}
          className={`px-3 py-1.5 text-xs font-semibold rounded-app-xs transition-all duration-300 whitespace-nowrap shrink-0 ${
            activeFilter === 'today' ? 'bg-accent-gradient text-white shadow-glow-purple' : 'text-textSecondary hover:text-textPrimary'
          }`}
        >
          Сегодня
        </button>
        <button
          onClick={() => handleFilterChange('yesterday')}
          className={`px-3 py-1.5 text-xs font-semibold rounded-app-xs transition-all duration-300 whitespace-nowrap shrink-0 ${
            activeFilter === 'yesterday' ? 'bg-accent-gradient text-white shadow-glow-purple' : 'text-textSecondary hover:text-textPrimary'
          }`}
        >
          Вчера
        </button>
        <button
          onClick={() => handleFilterChange('7days')}
          className={`px-3 py-1.5 text-xs font-semibold rounded-app-xs transition-all duration-300 whitespace-nowrap shrink-0 ${
            activeFilter === '7days' ? 'bg-accent-gradient text-white shadow-glow-purple' : 'text-textSecondary hover:text-textPrimary'
          }`}
        >
          7 дней
        </button>
        <button
          onClick={() => handleFilterChange('30days')}
          className={`px-3 py-1.5 text-xs font-semibold rounded-app-xs transition-all duration-300 whitespace-nowrap shrink-0 ${
            activeFilter === '30days' ? 'bg-accent-gradient text-white shadow-glow-purple' : 'text-textSecondary hover:text-textPrimary'
          }`}
        >
          30 дней
        </button>
        <button
          onClick={() => handleFilterChange('all')}
          className={`px-3 py-1.5 text-xs font-semibold rounded-app-xs transition-all duration-300 whitespace-nowrap shrink-0 ${
            activeFilter === 'all' ? 'bg-accent-gradient text-white shadow-glow-purple' : 'text-textSecondary hover:text-textPrimary'
          }`}
        >
          Все время
        </button>
      </div>

      {/* Векторный график (Заменили внутренние отступы с 64px до 16px) */}
      <Card variant="default" padding="none" className="relative flex flex-col p-4 overflow-hidden h-[230px] justify-between shadow-premium">
        <div className="flex items-center justify-between text-left">
          <span className="text-xs font-bold text-white">Динамика прибыли</span>
          <span className="text-[10px] text-textSecondary">Интервал: {activeFilter === 'today' ? '24 часа' : 'Динамика периода'}</span>
        </div>

        {/* Тело SVG графика (Заменили mt-16 на mt-4) */}
        <div className="w-full h-[120px] relative mt-4">
          <svg className="w-full h-full" viewBox="0 0 400 150" preserveAspectRatio="none">
            <defs>
              <linearGradient id="chartGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#7C3AED" stopOpacity="0.25" />
                <stop offset="100%" stopColor="#7C3AED" stopOpacity="0.0" />
              </linearGradient>

              <filter id="neonGlow" x="-20%" y="-20%" width="140%" height="140%">
                <feGaussianBlur stdDeviation="5" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>

            <line x1="0" y1="35" x2="400" y2="35" stroke="#374151" strokeOpacity="0.15" strokeDasharray="4" />
            <line x1="0" y1="75" x2="400" y2="75" stroke="#374151" strokeOpacity="0.15" strokeDasharray="4" />
            <line x1="0" y1="115" x2="400" y2="115" stroke="#374151" strokeOpacity="0.15" strokeDasharray="4" />

            <path
              d={currentData.chartAreaPath}
              fill="url(#chartGradient)"
              className="transition-all duration-500 ease-in-out"
            />

            <path
              d={currentData.chartPath}
              fill="none"
              stroke="#9D4EDD"
              strokeWidth="4"
              strokeLinecap="round"
              filter="url(#neonGlow)"
              opacity="0.6"
              className="transition-all duration-500 ease-in-out"
            />

            <path
              d={currentData.chartPath}
              fill="none"
              stroke="#F8FAFC"
              strokeWidth="2.5"
              strokeLinecap="round"
              className="transition-all duration-500 ease-in-out"
            />
          </svg>
        </div>

        {/* Шкала оси X (Заменили pt-12 и mt-4 на pt-3 и mt-1) */}
        <div className="flex justify-between text-[10px] text-textSecondary/80 px-2 border-t border-white/[0.04] pt-3 mt-1 font-semibold">
          <span>00:00</span>
          <span>06:00</span>
          <span>12:00</span>
          <span>18:00</span>
          <span>24:00</span>
        </div>
      </Card>

      {/* Сетка карточек метрик (Заменили gap-12 на gap-3) */}
      <div className="grid grid-cols-2 gap-3 text-left">
        {/* Клики (Заменили gap-16 на gap-3) */}
        <Card padding="sm" className="flex flex-col justify-between gap-3 min-h-[106px] border-white/5 shadow-glass-inner">
          <div className="flex items-center justify-between text-textSecondary">
            <span className="text-[10px] font-bold uppercase tracking-wider">Клики</span>
            <div className="w-7 h-7 rounded-full bg-accentPurple/10 border border-accentPurple/20 flex items-center justify-center text-accentPurple shadow-[0_0_10px_rgba(124,58,237,0.1)]">
              <Eye size={12} />
            </div>
          </div>
          <div className="flex justify-between items-end">
            <span className="text-lg font-bold text-white tracking-tight">{currentData.clicks.toLocaleString('ru-RU')}</span>
            {renderTrend(currentData.clicksTrend)}
          </div>
        </Card>

        {/* Конверсии / CR (Заменили gap-16 на gap-3) */}
        <Card padding="sm" className="flex flex-col justify-between gap-3 min-h-[106px] border-white/5 shadow-glass-inner">
          <div className="flex items-center justify-between text-textSecondary">
            <span className="text-[10px] font-bold uppercase tracking-wider">Конверсии</span>
            <div className="w-7 h-7 rounded-full bg-accentPurple/10 border border-accentPurple/20 flex items-center justify-center text-accentPurple shadow-[0_0_10px_rgba(124,58,237,0.1)]">
              <ShieldAlert size={12} />
            </div>
          </div>
          <div className="flex justify-between items-end">
            <div className="flex flex-col">
              <span className="text-lg font-bold text-white tracking-tight">{currentData.conversions}</span>
              <span className="text-[9px] text-textSecondary font-semibold mt-0.5">CR: {currentData.cr}</span>
            </div>
            {renderTrend(currentData.conversionsTrend)}
          </div>
        </Card>

        {/* Доход (gap-16 на gap-3) */}
        <Card padding="sm" className="flex flex-col justify-between gap-3 min-h-[106px] border-white/5 shadow-glass-inner">
          <div className="flex items-center justify-between text-textSecondary">
            <span className="text-[10px] font-bold uppercase tracking-wider">Доход</span>
            <div className="w-7 h-7 rounded-full bg-success/10 border border-success/20 flex items-center justify-center text-success shadow-[0_0_10px_rgba(34,197,94,0.1)]">
              <Coins size={12} />
            </div>
          </div>
          <div className="flex justify-between items-end">
            <span className="text-lg font-bold text-white tracking-tight">${currentData.income.toLocaleString('ru-RU', { minimumFractionDigits: 2 })}</span>
            {renderTrend(currentData.incomeTrend)}
          </div>
        </Card>

        {/* EPC (gap-16 на gap-3) */}
        <Card padding="sm" className="flex flex-col justify-between gap-16 min-h-[106px] border-white/5 shadow-glass-inner">
          <div className="flex items-center justify-between text-textSecondary">
            <span className="text-[10px] font-bold uppercase tracking-wider">EPC</span>
            <div className="w-7 h-7 rounded-full bg-accentPurple/10 border border-accentPurple/20 flex items-center justify-center text-accentPurple shadow-[0_0_10px_rgba(124,58,237,0.1)]">
              <BarChart2 size={12} />
            </div>
          </div>
          <div className="flex justify-between items-end">
            <span className="text-lg font-bold text-white tracking-tight">${currentData.epc.toFixed(2)}</span>
            {renderTrend(currentData.epcTrend)}
          </div>
        </Card>
      </div>
    </div>
  );
};
