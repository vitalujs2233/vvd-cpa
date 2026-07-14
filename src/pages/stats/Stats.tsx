import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { BarChart2, Coins, Eye, RefreshCw, ShieldAlert } from 'lucide-react';
import { Card } from '@/shared/ui/Card';
import { getTelegramUser, triggerHaptic } from '@/shared/lib/telegram';

type Filter = 'today' | 'yesterday' | '7days' | '30days' | 'all';
type Vertical = 'all' | 'adult' | 'mainstream' | 'webcam' | 'adult_games';
type Stat = { date: string; clicks: number; conversions: number; income: number };
type Country = { country_code: string; country_name: string; clicks: number; conversions: number; income: number };

const API = 'https://vvd-cpa-v2.onrender.com';

const inPeriod = (value: string, filter: Filter) => {
  if (filter === 'all') return true;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const [y, m, d] = value.split('-').map(Number);
  const date = new Date(y, m - 1, d); date.setHours(0, 0, 0, 0);
  if (filter === 'today') return date.getTime() === today.getTime();
  if (filter === 'yesterday') {
    const x = new Date(today); x.setDate(x.getDate() - 1);
    return date.getTime() === x.getTime();
  }
  const days = filter === '7days' ? 7 : 30;
  const from = new Date(today); from.setDate(from.getDate() - days + 1);
  return date >= from && date <= today;
};

const chartPaths = (rows: Stat[]) => {
  const grouped = new Map<string, number>();
  rows.forEach(r => grouped.set(r.date, (grouped.get(r.date) || 0) + r.income));
  const values = [...grouped.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, v]) => v);
  if (!values.length) return { line: 'M 0 130 L 400 130', area: 'M 0 130 L 400 130 L 400 150 L 0 150 Z' };
  const max = Math.max(...values, 1);
  const pts = values.map((v, i) => ({
    x: values.length === 1 ? 200 : i / (values.length - 1) * 400,
    y: 130 - v / max * 120
  }));
  const line = pts.length === 1
    ? `M 0 ${pts[0].y} L 400 ${pts[0].y}`
    : pts.map((p, i) => `${i ? 'L' : 'M'} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(' ');
  return { line, area: `${line} L 400 150 L 0 150 Z` };
};

export const Stats: React.FC = () => {
  const [filter, setFilter] = useState<Filter>('today');
  const [vertical, setVertical] = useState<Vertical>('all');
  const [stats, setStats] = useState<Stat[]>([]);
  const [countries, setCountries] = useState<Country[]>([]);
  const [selectedCountry, setSelectedCountry] = useState<string>('all');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (refresh = false) => {
    refresh ? setRefreshing(true) : setLoading(true);
    setError(null);
    if (refresh) triggerHaptic.mediumImpact();
    try {
      const id = Number(getTelegramUser().id);
      if (!id) throw new Error('Не удалось определить Telegram ID');
      const [s, c] = await Promise.all([
        fetch(
  `${API}/statistics/${id}${vertical !== 'all' ? `?vertical=${vertical}` : ''}`,
  { cache: 'no-store' }
),
        fetch(`${API}/statistics/${id}/countries`, { cache: 'no-store' })
      ]);
      if (!s.ok || !c.ok) throw new Error(`Ошибка API: statistics ${s.status}, countries ${c.status}`);
      const sd = await s.json();
      const cd = await c.json();
      if (!sd.success || !cd.success) throw new Error('Backend вернул ошибку статистики');
      setStats((sd.statistics || []).map((r: Stat) => ({
        date: r.date, clicks: Number(r.clicks || 0), conversions: Number(r.conversions || 0), income: Number(r.income || 0)
      })));
      setCountries((cd.countries || []).map((r: Country) => ({
        country_code: r.country_code, country_name: r.country_name, clicks: Number(r.clicks || 0),
        conversions: Number(r.conversions || 0), income: Number(r.income || 0)
      })));
      if (refresh) triggerHaptic.success();
    } catch (e) {
      console.error(e);
      setError(e instanceof Error ? e.message : 'Ошибка загрузки аналитики');
      if (refresh) triggerHaptic.error();
    } finally {
      setLoading(false); setRefreshing(false);
    }
  }, [vertical]);

  useEffect(() => {
  void load();

  const interval = window.setInterval(() => {
    void load();
  }, 10000);

  return () => {
    window.clearInterval(interval);
  };
}, [load]);

  const rows = useMemo(() => stats.filter(r => inPeriod(r.date, filter)), [stats, filter]);
  const selectedCountryData = useMemo(
    () => countries.find(c => c.country_code === selectedCountry),
    [countries, selectedCountry]
  );

  const data = useMemo(() => {
    const periodClicks = rows.reduce((a, r) => a + r.clicks, 0);
    const periodConversions = rows.reduce((a, r) => a + r.conversions, 0);
    const periodIncome = rows.reduce((a, r) => a + r.income, 0);

    const countryClicks = countries.reduce((a, r) => a + r.clicks, 0);
    const countryConversions = countries.reduce((a, r) => a + r.conversions, 0);
    const countryIncome = countries.reduce((a, r) => a + r.income, 0);

    const clicks = selectedCountryData
      ? selectedCountryData.clicks
      : countryClicks || periodClicks;
    const conversions = selectedCountryData
      ? selectedCountryData.conversions
      : countryConversions || periodConversions;
    const income = selectedCountryData
      ? selectedCountryData.income
      : countryIncome || periodIncome;

    return {
      clicks, conversions, income,
      cr: clicks ? conversions / clicks * 100 : 0,
      epc: clicks ? income / clicks : 0,
      ...chartPaths(rows)
    };
  }, [rows, countries, selectedCountryData]);

  const filters: { key: Filter; label: string }[] = [
    { key: 'today', label: 'Сегодня' }, { key: 'yesterday', label: 'Вчера' },
    { key: '7days', label: '7 дней' }, { key: '30days', label: '30 дней' },
    { key: 'all', label: 'Все время' }
  ];

  const metric = (title: string, value: React.ReactNode, icon: React.ReactNode, sub?: string) => (
    <Card padding="sm" className="flex flex-col justify-between gap-3 min-h-[106px] border-white/5 shadow-glass-inner">
      <div className="flex items-center justify-between text-textSecondary">
        <span className="text-[10px] font-bold uppercase tracking-wider">{title}</span>
        <div className="w-7 h-7 rounded-full bg-accentPurple/10 border border-accentPurple/20 flex items-center justify-center text-accentPurple">{icon}</div>
      </div>
      <div className="flex flex-col">
        <span className="text-lg font-bold text-white tracking-tight">{value}</span>
        {sub && <span className="text-[9px] text-textSecondary font-semibold mt-0.5">{sub}</span>}
      </div>
    </Card>
  );

  return (
    <div className="flex flex-col gap-4 p-4 select-none pb-32 animate-fade-in">
      <div className="flex items-center justify-between text-left">
        <div className="flex flex-col">
          <span className="text-[10px] text-textSecondary font-bold uppercase tracking-wider">Платформа VVD CPA</span>
          <h1 className="text-2xl font-bold text-white mt-1">Анализ трафика</h1>
        </div>
        <button onClick={() => void load(true)} disabled={refreshing}
          className="w-11 h-11 rounded-full bg-bgCard/40 border border-white/10 flex items-center justify-center text-textSecondary active:scale-95 transition-all shadow-glass-inner">
          <RefreshCw size={16} className={refreshing ? 'animate-spin text-accentPurple' : ''} />
        </button>
      </div>

      {error && <Card padding="sm" className="border-error/30"><p className="text-xs text-error">{error}</p></Card>}

      <div className="flex bg-bgCard/35 backdrop-blur-md border border-white/[0.04] rounded-app-xs p-2 gap-2 overflow-x-auto no-scrollbar scrollable-container shadow-glass-inner">
        {filters.map(x => <button key={x.key} onClick={() => { triggerHaptic.lightImpact(); setFilter(x.key); }}
          className={`px-3 py-1.5 text-xs font-semibold rounded-app-xs transition-all whitespace-nowrap shrink-0 ${filter === x.key ? 'bg-accent-gradient text-white shadow-glow-purple' : 'text-textSecondary hover:text-textPrimary'}`}>
          {x.label}
        </button>)}
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between px-1">
          <span className="text-[10px] text-textSecondary font-bold uppercase tracking-wider">География</span>
          {selectedCountry !== 'all' && (
            <span className="text-[9px] text-accentPurple">Данные выбранной страны</span>
          )}
        </div>
        <div className="flex bg-bgCard/35 backdrop-blur-md border border-white/[0.04] rounded-app-xs p-2 gap-2 overflow-x-auto no-scrollbar scrollable-container shadow-glass-inner">
          <button
            onClick={() => { triggerHaptic.lightImpact(); setSelectedCountry('all'); }}
            className={`px-3 py-1.5 text-xs font-semibold rounded-app-xs transition-all whitespace-nowrap shrink-0 ${selectedCountry === 'all' ? 'bg-accent-gradient text-white shadow-glow-purple' : 'text-textSecondary hover:text-textPrimary'}`}
          >
            Все страны
          </button>
          {countries.map(c => (
            <button
              key={c.country_code}
              onClick={() => { triggerHaptic.lightImpact(); setSelectedCountry(c.country_code); }}
              className={`px-3 py-1.5 text-xs font-semibold rounded-app-xs transition-all whitespace-nowrap shrink-0 ${selectedCountry === c.country_code ? 'bg-accent-gradient text-white shadow-glow-purple' : 'text-textSecondary hover:text-textPrimary'}`}
            >
              {c.country_name || c.country_code}
            </button>
          ))}
        </div>
      </div>

      <Card variant="default" padding="none" className="relative flex flex-col p-4 overflow-hidden h-[230px] justify-between shadow-premium">
        <div className="flex items-center justify-between text-left">
          <span className="text-xs font-bold text-white">Динамика прибыли</span>
          <span className="text-[10px] text-textSecondary">{loading ? 'Загрузка...' : `${rows.length} записей`}</span>
        </div>
        <div className="w-full h-[120px] relative mt-4">
          <svg className="w-full h-full" viewBox="0 0 400 150" preserveAspectRatio="none">
            <defs><linearGradient id="chartGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#7C3AED" stopOpacity="0.25" /><stop offset="100%" stopColor="#7C3AED" stopOpacity="0" />
            </linearGradient></defs>
            <line x1="0" y1="35" x2="400" y2="35" stroke="#374151" strokeOpacity="0.15" strokeDasharray="4" />
            <line x1="0" y1="75" x2="400" y2="75" stroke="#374151" strokeOpacity="0.15" strokeDasharray="4" />
            <line x1="0" y1="115" x2="400" y2="115" stroke="#374151" strokeOpacity="0.15" strokeDasharray="4" />
            <path d={data.area} fill="url(#chartGradient)" />
            <path d={data.line} fill="none" stroke="#9D4EDD" strokeWidth="4" strokeLinecap="round" opacity="0.6" />
            <path d={data.line} fill="none" stroke="#F8FAFC" strokeWidth="2.5" strokeLinecap="round" />
          </svg>
        </div>
        <div className="flex justify-between text-[10px] text-textSecondary/80 px-2 border-t border-white/[0.04] pt-3 mt-1 font-semibold">
          <span>Начало</span><span>25%</span><span>50%</span><span>75%</span><span>Сейчас</span>
        </div>
      </Card>

      <div className="grid grid-cols-2 gap-3 text-left">
        {metric('Клики', data.clicks.toLocaleString('ru-RU'), <Eye size={12} />)}
        {metric('Конверсии', data.conversions, <ShieldAlert size={12} />, `CR: ${data.cr.toFixed(2)}%`)}
        {metric('Доход', `$${data.income.toFixed(2)}`, <Coins size={12} />)}
        {metric('EPC', `$${data.epc.toFixed(2)}`, <BarChart2 size={12} />)}
      </div>

      <div className="flex flex-col gap-3 text-left">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-white">Страны</h2>
          <span className="text-[10px] text-textSecondary">{countries.length} стран</span>
        </div>
        <Card padding="none" className="overflow-hidden border-white/5 shadow-glass-inner">
          {!countries.length ? <div className="p-4 text-xs text-textSecondary">Статистика по странам пока отсутствует</div> :
            [...countries].sort((a, b) => b.income - a.income).map((c, i) => {
              const cr = c.clicks ? c.conversions / c.clicks * 100 : 0;
              return <button
                key={`${c.country_code}-${i}`}
                onClick={() => { triggerHaptic.lightImpact(); setSelectedCountry(c.country_code); }}
                className={`w-full flex items-center justify-between p-4 border-b border-white/[0.04] last:border-b-0 text-left transition-all ${selectedCountry === c.country_code ? 'bg-accentPurple/10' : 'active:bg-white/[0.03]'}`}
              >
                <div className="flex flex-col">
                  <span className="text-sm font-bold text-white">{c.country_name || c.country_code}</span>
                  <span className="text-[10px] text-textSecondary mt-1">{c.country_code} · {c.clicks.toLocaleString('ru-RU')} кликов · CR {cr.toFixed(2)}%</span>
                </div>
                <div className="flex flex-col items-end">
                  <span className="text-sm font-bold text-success">${c.income.toFixed(2)}</span>
                  <span className="text-[10px] text-textSecondary mt-1">{c.conversions} конв.</span>
                </div>
              </button>;
            })}
        </Card>
      </div>
    </div>
  );
};
