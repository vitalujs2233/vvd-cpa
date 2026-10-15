import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, ArrowRight, Bot, CheckCircle2, ChevronRight, Clock3,
  Globe2, MessageSquare, Phone, Server, Sparkles, Wallet, Wrench,
} from 'lucide-react';
import { Card } from '@/shared/ui/Card';
import { Button } from '@/shared/ui/Button';
import { triggerHaptic } from '@/shared/lib/telegram';
import { useStarsWallet } from '@/shared/lib/StarsWalletContext';

// Demos remain free until real supplier APIs are available.
const DemoNotice: React.FC = () => (
  <p className="rounded-app-xs border border-accentGold/25 bg-accentGold/10 px-3 py-2 text-xs leading-5 text-accentLightGold">
    Демо бесплатно: реальные AI, SMS и прокси ещё не подключены. Stars-кредиты не списываются.
  </p>
);

const WalletPreview: React.FC = () => {
  const { stars, loading, error, paymentsEnabled, refresh } = useStarsWallet();
  return (
    <div className="flex flex-col gap-1 rounded-app-xs border border-white/10 bg-white/[0.03] px-4 py-3">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-2 text-xs text-textSecondary">
          <Wallet size={15} /> Баланс инструментов
        </span>
        <strong className="text-accentBrightGold">⭐ {stars ?? '—'}</strong>
      </div>
      <p className="text-[11px] leading-4 text-textSecondary">
        {error || (loading ? 'Обновляем баланс…' : paymentsEnabled ?
          'Баланс доступен для подключённых услуг.' :
          'Платные услуги пока недоступны. Демонстрации бесплатны.')}
      </p>
      <button type="button" onClick={() => void refresh()}
        className="self-end text-[11px] font-bold text-accentBrightGold">Обновить</button>
    </div>
  );
};

const ToolHeader: React.FC<{ title: string; subtitle: string }> = ({ title, subtitle }) => {
  const navigate = useNavigate();
  return (
    <header className="flex items-center gap-3">
      <button type="button" aria-label="Назад к инструментам"
        onClick={() => { triggerHaptic.lightImpact(); navigate('/tools'); }}
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-app-xs border border-white/10 bg-white/[0.04] text-accentBrightGold">
        <ArrowLeft size={19} />
      </button>
      <div className="min-w-0">
        <h1 className="text-xl font-bold text-textPrimary">{title}</h1>
        <p className="text-xs text-textSecondary">{subtitle}</p>
      </div>
    </header>
  );
};

const toolLinks = [
  { to: '/tools/ai', name: 'AI Модель', detail: 'Выбор модели и токенов', icon: Bot },
  { to: '/tools/numbers', name: 'Виртуальные номера', detail: 'Страны, сервисы и SMS', icon: Phone },
  { to: '/tools/proxy', name: 'Прокси сервис', detail: 'Протоколы и параметры', icon: Globe2 },
];

export const Tools: React.FC = () => (
  <main className="flex flex-col gap-4 p-4 pb-24 animate-fade-in">
    <div className="flex items-center gap-3">
      <div className="flex h-12 w-12 items-center justify-center rounded-app-xs border border-accentGold/25 bg-accentGold/10 text-accentBrightGold">
        <Wrench size={23} />
      </div>
      <div>
        <h1 className="text-2xl font-bold text-textPrimary">Инструменты</h1>
        <p className="text-xs text-textSecondary">Рабочий центр VVD CPA</p>
      </div>
    </div>
    <DemoNotice />
    <WalletPreview />
    <div className="grid grid-cols-2 gap-3">
      {toolLinks.map(({ to, name, detail, icon: Icon }, index) => (
        <Link key={to} to={to} onClick={() => triggerHaptic.lightImpact()}
          className={index === 0 ? 'col-span-2' : 'col-span-1'}>
          <Card className="flex h-full min-h-[160px] flex-col justify-between gap-4 hover-lift">
            <div className="flex items-start justify-between">
              <div className="flex h-11 w-11 items-center justify-center rounded-app-xs border border-accentGold/20 bg-accentGold/10 text-accentBrightGold">
                <Icon size={21} />
              </div>
              <ChevronRight size={17} className="text-textSecondary" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-textPrimary">{name}</h2>
              <p className="mt-1 text-[11px] leading-4 text-textSecondary">{detail}</p>
            </div>
          </Card>
        </Link>
      ))}
    </div>
  </main>
);

type Country = { id: string; flag: string; title: string };
const countries: Country[] = [
  { id: 'LV', flag: '🇱🇻', title: 'Латвия' },
  { id: 'DE', flag: '🇩🇪', title: 'Германия' },
  { id: 'PL', flag: '🇵🇱', title: 'Польша' },
];
const smsServices = [
  { id: 'demo', title: 'Тестовый сервис' },
  { id: 'sample', title: 'Демо-получение SMS' },
];
type SmsOrder = { country: Country; service: string };

export const VirtualNumbers: React.FC = () => {
  const [countryId, setCountryId] = useState('LV');
  const [serviceId, setServiceId] = useState('demo');
  const [order, setOrder] = useState<SmsOrder | null>(null);
  const [remaining, setRemaining] = useState(60);
  const [code, setCode] = useState<string | null>(null);
  const country = countries.find((entry) => entry.id === countryId) || countries[0];
  const service = smsServices.find((entry) => entry.id === serviceId) || smsServices[0];

  useEffect(() => {
    if (!order) return;
    const tick = window.setInterval(() => setRemaining((value) => Math.max(0, value - 1)), 1000);
    const sample = window.setTimeout(() => setCode('000000'), 6000);
    return () => { window.clearInterval(tick); window.clearTimeout(sample); };
  }, [order]);

  const preview = () => {
    setOrder({ country, service: service.title });
    setRemaining(60);
    setCode(null);
    triggerHaptic.lightImpact();
  };

  return (
    <main className="flex flex-col gap-4 p-4 pb-24 animate-fade-in">
      <ToolHeader title="Виртуальные номера" subtitle="Демонстрация заказа и получения SMS" />
      <DemoNotice /><WalletPreview />
      <Card className="flex flex-col gap-4">
        <label className="flex flex-col gap-2 text-xs font-semibold text-textSecondary">
          Страна
          <select value={countryId} disabled={Boolean(order)} onChange={(event) => setCountryId(event.target.value)}
            className="w-full rounded-app-xs border border-white/10 bg-bgCard p-3 text-sm text-textPrimary disabled:opacity-50">
            {countries.map((item) => <option key={item.id} value={item.id}>{item.flag} {item.title}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-2 text-xs font-semibold text-textSecondary">
          Сервис для SMS
          <select value={serviceId} disabled={Boolean(order)} onChange={(event) => setServiceId(event.target.value)}
            className="w-full rounded-app-xs border border-white/10 bg-bgCard p-3 text-sm text-textPrimary disabled:opacity-50">
            {smsServices.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}
          </select>
        </label>
        <div className="flex items-center justify-between border-t border-white/10 pt-3 text-sm">
          <span className="text-textSecondary">Стоимость демонстрации</span>
          <strong className="text-accentBrightGold">Бесплатно</strong>
        </div>
        {!order && <Button type="button" onClick={preview}>Показать демо <ArrowRight className="ml-2" size={16} /></Button>}
      </Card>
      {order && (
        <Card variant="glow" aria-live="polite" className="flex flex-col gap-3">
          <h2 className="flex items-center gap-2 text-sm font-bold"><MessageSquare size={17} className="text-accentBrightGold" /> Ожидание SMS</h2>
          <p className="text-xs text-textSecondary">{order.country.flag} {order.country.title} · {order.service} · Бесплатно</p>
          <p className="text-xs text-textSecondary">Номер: +000 000 0000 (не существует)</p>
          <p className="flex items-center gap-2 text-xs text-accentBrightGold">
            <Clock3 size={15} /> {String(Math.floor(remaining / 60)).padStart(2, '0') + ':' + String(remaining % 60).padStart(2, '0')}
          </p>
          <div className="rounded-app-xs border border-white/10 bg-bgMain p-4 text-center font-mono text-xl tracking-widest text-white">
            {code ?? (remaining === 0 ? 'Время истекло' : 'Ожидание кода…')}
          </div>
          {code && <p className="flex items-center gap-2 text-xs text-success"><CheckCircle2 size={15} /> Тестовый код — не реальное SMS</p>}
          <Button variant="secondary" type="button" onClick={() => { setOrder(null); setCode(null); setRemaining(60); }}>Новый демо-заказ</Button>
        </Card>
      )}
    </main>
  );
};

type ProxyItem = {
  id: string; protocol: 'HTTP' | 'SOCKS5'; flag: string;
  country: string; period: string; address: string;
};
const demoProxies: ProxyItem[] = [
  { id: 'lv', protocol: 'HTTP', flag: '🇱🇻', country: 'Латвия', period: '1 день', address: '192.0.2.10:8080' },
  { id: 'de', protocol: 'SOCKS5', flag: '🇩🇪', country: 'Германия', period: '7 дней', address: '198.51.100.7:1080' },
  { id: 'pl', protocol: 'HTTP', flag: '🇵🇱', country: 'Польша', period: '30 дней', address: '203.0.113.20:3128' },
];

export const ProxyService: React.FC = () => {
  const [issued, setIssued] = useState<ProxyItem | null>(null);
  const preview = (item: ProxyItem) => {
    setIssued(item);
    triggerHaptic.lightImpact();
  };

  return (
    <main className="flex flex-col gap-4 p-4 pb-24 animate-fade-in">
      <ToolHeader title="Прокси сервис" subtitle="Демонстрационный каталог" />
      <DemoNotice /><WalletPreview />
      {demoProxies.map((item) => (
        <Card key={item.id} className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3">
            <strong className="flex items-center gap-2 text-sm"><Server size={16} className="text-accentBrightGold" /> {item.protocol}</strong>
            <strong className="text-accentBrightGold">Бесплатно</strong>
          </div>
          <p className="text-xs text-textSecondary">{item.flag} {item.country} · {item.period}</p>
          <Button type="button" size="md" className="w-full" onClick={() => preview(item)}>Показать демо</Button>
        </Card>
      ))}
      {issued && (
        <Card variant="glow" aria-live="polite" className="flex flex-col gap-3">
          <h2 className="flex items-center gap-2 text-sm font-bold"><CheckCircle2 size={16} className="text-success" /> Демонстрационная выдача</h2>
          <p className="text-xs text-textSecondary">IP из зарезервированных тестовых диапазонов. Подключение невозможно.</p>
          <div className="break-all rounded-app-xs border border-white/10 bg-bgMain p-3 font-mono text-xs leading-6">
            <div>Тип: {issued.protocol}</div>
            <div>IP:Порт: {issued.address}</div>
            <div>Логин: demo_user</div>
            <div>Пароль: demo_only</div>
          </div>
        </Card>
      )}
    </main>
  );
};

const demoModels = [
  { id: 'basic', title: 'AI Basic · Demo', cost: 100, description: 'Демонстрационный запуск без API' },
  { id: 'plus', title: 'AI Plus · Demo', cost: 250, description: 'Макет расширенной модели' },
];

export const AiModel: React.FC = () => {
  const [modelId, setModelId] = useState('basic');
  const [tokens, setTokens] = useState(1000);
  const [message, setMessage] = useState('');
  const model = demoModels.find((item) => item.id === modelId) || demoModels[0];
  const run = () => {
    if (tokens < model.cost) { setMessage('Недостаточно учебных токенов.'); return; }
    setTokens((current) => current - model.cost);
    setMessage('Демо-запрос выполнен. Использовано ' + model.cost + ' учебных токенов. Реальные ⭐ не списывались; AI-ответ не генерировался.');
    triggerHaptic.success();
  };

  return (
    <main className="flex flex-col gap-4 p-4 pb-24 animate-fade-in">
      <ToolHeader title="AI Модель" subtitle="Выбор модели и учебные токены" />
      <DemoNotice /><WalletPreview />
      <Card variant="glow" className="flex items-center justify-between">
        <span className="flex items-center gap-2 text-sm font-bold"><Sparkles size={17} className="text-accentBrightGold" /> Демо-токены</span>
        <strong className="text-xl text-accentBrightGold">{tokens}</strong>
      </Card>
      {demoModels.map((item) => (
        <label key={item.id} className={'flex cursor-pointer items-center gap-3 rounded-card border-2 p-4 ' +
          (modelId === item.id ? 'border-accentGold/60 bg-accentGold/10' : 'border-white/10 bg-bgCard')}>
          <input type="radio" name="demo-ai-model" checked={modelId === item.id} value={item.id}
            onChange={() => { setModelId(item.id); setMessage(''); }} className="accent-amber-400" />
          <span className="flex-1">
            <strong className="block text-sm">{item.title}</strong>
            <span className="text-xs text-textSecondary">{item.description}</span>
          </span>
          <span className="text-xs font-bold text-accentBrightGold">{item.cost} ток.</span>
        </label>
      ))}
      <Button type="button" disabled={tokens < model.cost} onClick={run}>
        Запустить демо <ArrowRight className="ml-2" size={16} />
      </Button>
      {message && <Card variant="outlined" aria-live="polite"><p className="text-sm text-textSecondary">{message}</p></Card>}
      <Link className="text-center text-xs text-accentBrightGold" to="/tools">Вернуться к инструментам</Link>
    </main>
  );
};
