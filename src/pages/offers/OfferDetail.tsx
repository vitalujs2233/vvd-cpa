import React, { useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
  ArrowLeft, Globe, Calendar, DollarSign, Check, X, 
  Copy, CheckCircle2, Link as LinkIcon 
} from 'lucide-react';
import { Card } from '@/shared/ui/Card';
import { Button } from '@/shared/ui/Button';
import { Input } from '@/shared/ui/Input';
import { triggerHaptic, getTelegramUser } from '@/shared/lib/telegram';

interface DetailData {
  title: string;
  geo: string;
  hold: string;
  payout: string;
  description: string;
  allowedTraffic: string[];
  forbiddenTraffic: string[];
  smartlinkSuffix: string;
}

const OFFERS_DETAILS_MAP: Record<string, DetailData> = {
  'adult-dating': {
    title: 'Adult Dating',
    geo: 'Worldwide',
    hold: '10 дней',
    payout: '$0.10 - $50',
    description: 'Лучшие офферы в категории Adult Dating. Высокий конверт на мобильном трафике с фокусом на CPL-модели (регистрации).',
    allowedTraffic: ['Social Media', 'Content Ads', 'Native Ads'],
    forbiddenTraffic: ['Incentive Traffic', 'Fraud / Bot', 'Motivated traffic'],
    smartlinkSuffix: 'jgb123',
  },
  'mainstream-dating': {
    title: 'Mainstream Dating',
    geo: 'Worldwide',
    hold: '10 дней',
    payout: '$0.10 - $50',
    description: 'Офферы классических знакомств (Mainstream). Отличный EPC на Tier-1 и Tier-2 гео при работе с органическим трафиком.',
    allowedTraffic: ['SEO / Blogs', 'Social Media', 'Teaser networks'],
    forbiddenTraffic: ['Incentive Traffic', 'Motivated traffic', 'Fraud'],
    smartlinkSuffix: 'gh786',
  },
  'nutra': {
    title: 'Nutra',
    geo: 'Worldwide',
    hold: '10 дней',
    payout: '$0.10 - $50',
    description: 'Лучшие офферы в категории Nutra. Проверенные связки на похудение, потенцию и омоложение с высокими ставками аппрува.',
    allowedTraffic: ['Social Media', 'Native Ads', 'Teaser networks'],
    forbiddenTraffic: ['Incentive Traffic', 'In-App Spam', 'Fraud'],
    smartlinkSuffix: 'nu540',
  },
  'crypto': {
    title: 'Crypto',
    geo: 'Worldwide',
    hold: '10 дней',
    payout: '$10 - $950',
    description: 'Премиальные офферы крипто-брокеров и крипто-роботов. Максимальные выплаты по CPA за первый депозит пользователя.',
    allowedTraffic: ['Search Ads (PPC)', 'SEO Traffic', 'Native Ads'],
    forbiddenTraffic: ['Incentive Traffic', 'In-App Spam', 'Fraud / Motivated'],
    smartlinkSuffix: 'cr901',
  },
  'gaming': {
    title: 'Gaming',
    geo: 'Worldwide',
    hold: '10 дней',
    payout: '$0.10 - $50',
    description: 'Офферы браузерных и мобильных онлайн-игр. Простые целевые действия (регистрация или установка приложения).',
    allowedTraffic: ['Social Media', 'In-App Ads', 'Popunder'],
    forbiddenTraffic: ['Fraud / Bot', 'Incentive Traffic', 'Motivated traffic'],
    smartlinkSuffix: 'gm420',
  },
  'utilities': {
    title: 'Utilities',
    geo: 'Worldwide',
    hold: '10 дней',
    payout: '$0.10 - $50',
    description: 'Офферы мобильных утилит (VPN, клинеры, антивирусы). Быстрый конверт по CPI за прямую установку из App Store/Google Play.',
    allowedTraffic: ['Popunder / Redirect', 'Native Ads', 'In-App Ads'],
    forbiddenTraffic: ['Fraud / Bot', 'Incentive Traffic', 'Motivated traffic'],
    smartlinkSuffix: 'ut890',
  },
};

export const OfferDetail: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedLink, setGeneratedLink] = useState('');
  const [copied, setCopied] = useState(false);

  const data = useMemo(() => {
    return OFFERS_DETAILS_MAP[id || 'adult-dating'] || OFFERS_DETAILS_MAP['adult-dating'];
  }, [id]);

  const handleBack = () => {
    triggerHaptic.lightImpact();
    navigate('/offers');
  };

 const handleGenerateLink = async () => {console.log("Кнопка нажата");
  triggerHaptic.mediumImpact();
  setIsGenerating(true);

  try {
 const telegramUser = getTelegramUser();

console.log("Telegram User:", telegramUser);

const telegramId =
  (telegramUser as any).telegram_id ??
  (telegramUser as any).id;

console.log("Telegram ID:", telegramId);

   const verticalMap: Record<string, string> = {
  "adult-dating": "adult",
  "mainstream-dating": "mainstream",
  "nutra": "nutra",
  "crypto": "crypto",
  "gaming": "gaming",
  "utilities": "utilities",
};

const vertical = verticalMap[id || "adult-dating"];

const response = await fetch(
  `https://vvd-cpa-v2.onrender.com/smartlink/${telegramId}/${vertical}`
);

    const result = await response.json();

    if (result.success) {
      setGeneratedLink(result.smartlink);
      triggerHaptic.success();
    }
  } catch (error) {
    console.error(error);
  }

  setIsGenerating(false);
};

  const handleCopyLink = () => {
    if (!generatedLink) return;
    
    navigator.clipboard.writeText(generatedLink).then(() => {
      triggerHaptic.success();
      setCopied(true);
      
      setTimeout(() => {
        setCopied(false);
      }, 2500);
    });
  };

  return (
    // Убрали раздутый p-16 (64px) и gap-20 (80px), заменив на плотную мобильную сетку p-4 (16px) и gap-4
    <div className="flex flex-col gap-4 p-4 select-none pb-32 animate-fade-in">
      
      {/* Кнопка назад и заголовок */}
      <div className="flex items-center gap-3 text-left">
        <button 
          onClick={handleBack}
          className="w-11 h-11 rounded-full bg-bgCard/40 border border-white/10 flex items-center justify-center text-textSecondary hover:text-textPrimary active:scale-95 transition-transform shadow-glass-inner"
        >
          <ArrowLeft size={18} />
        </button>
        <div className="flex flex-col">
          <span className="text-[10px] text-accentPurple font-bold uppercase tracking-wider">Вертикаль</span>
          <h1 className="text-xl font-bold text-white leading-tight mt-0.5">{data.title}</h1>
        </div>
      </div>

      {/* Сетка условий оффера (gap-12 заменен на gap-3) */}
      <div className="grid grid-cols-2 gap-3 text-left">
        {/* ГЕО */}
        <Card padding="sm" className="flex items-center gap-3 border-white/5 shadow-glass-inner bg-white/[0.01]">
          <div className="w-9 h-9 rounded-full bg-accentPurple/10 border border-accentPurple/20 flex items-center justify-center text-accentPurple shadow-[0_0_10px_rgba(124,58,237,0.1)]">
            <Globe size={16} />
          </div>
          <div className="flex flex-col">
            <span className="text-[9px] text-textSecondary font-bold uppercase tracking-wider">Гео</span>
            <span className="text-xs font-bold text-textPrimary mt-0.5">{data.geo}</span>
          </div>
        </Card>

        {/* Холд */}
        <Card padding="sm" className="flex items-center gap-3 border-white/5 shadow-glass-inner bg-white/[0.01]">
          <div className="w-9 h-9 rounded-full bg-accentPurple/10 border border-accentPurple/20 flex items-center justify-center text-accentPurple shadow-[0_0_10px_rgba(124,58,237,0.1)]">
            <Calendar size={16} />
          </div>
          <div className="flex flex-col">
            <span className="text-[9px] text-textSecondary font-bold uppercase tracking-wider">Холд</span>
            <span className="text-xs font-bold text-white mt-0.5">{data.hold}</span>
          </div>
        </Card>

        {/* Выплаты */}
        <Card padding="sm" className="flex items-center gap-3 col-span-2 border-white/5 shadow-glass-inner bg-white/[0.01]">
          <div className="w-9 h-9 rounded-full bg-success/10 border border-success/20 flex items-center justify-center text-success shadow-[0_0_10px_rgba(34,197,94,0.1)]">
            <DollarSign size={16} />
          </div>
          <div className="flex flex-col">
            <span className="text-[9px] text-textSecondary font-bold uppercase tracking-wider">Выплаты по CPA</span>
            <span className="text-xs font-bold text-success mt-0.5">{data.payout}</span>
          </div>
        </Card>
      </div>

      {/* SmartLink Card (gap-16 заменен на gap-3, px-8 py-4 в бадже заменен на px-2 py-1) */}
      <Card variant="glow" padding="lg" className="flex flex-col gap-3 relative overflow-hidden border-accentPurple/30 bg-accentPurple/[0.01] shadow-glow-purple">
        <div className="absolute -right-24 -top-24 w-48 h-48 bg-accent-gradient rounded-full blur-3xl opacity-10 pointer-events-none" />

        <div className="flex justify-between items-center text-left">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-accentPink/10 border border-accentPink/20 flex items-center justify-center text-accentPink drop-shadow-[0_0_10px_#C026D3]">
              <LinkIcon size={20} />
            </div>
            <div className="flex flex-col">
              <span className="text-xs font-bold text-white">Индивидуальный SmartLink</span>
              <span className="text-[9px] text-textSecondary font-semibold mt-0.5">Динамический ротатор офферов</span>
            </div>
          </div>
          
          {/* Статус Active */}
          <div className="flex items-center gap-1.5 px-2 py-1 bg-success/5 border border-success/20 rounded-app-xs">
            <span className="w-1.5 h-1.5 rounded-full bg-success shadow-[0_0_8px_#22C55E] animate-pulse" />
            <span className="text-[9px] font-bold text-success uppercase tracking-wider">Active</span>
          </div>
        </div>

        {/* Генератор ссылок */}
        {!generatedLink ? (
          <Button 
            variant="primary" 
            size="lg" 
            className="w-full shadow-glow-purple"
            isLoading={isGenerating}
            onClick={handleGenerateLink}
          >
            Получить SmartLink
          </Button>
        ) : (
          <div className="flex flex-col gap-2 animate-fade-in">
            <div className="flex gap-2">
              <Input 
                value={generatedLink} 
                readOnly 
                className="flex-1"
                onClick={(e) => (e.target as HTMLInputElement).select()}
              />
              <Button 
                variant="secondary" 
                size="md" 
                className="w-12 h-12 px-0 flex items-center justify-center shrink-0 border border-white/5 rounded-app-xs shadow-glass-inner"
                onClick={handleCopyLink}
              >
                <Copy size={16} />
              </Button>
            </div>
            {/* Статус копирования */}
            <div className={`flex items-center gap-1.5 text-[10px] text-success transition-all duration-300 px-1 font-semibold justify-center ${copied ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-1 h-0 pointer-events-none'}`}>
              <CheckCircle2 size={12} className="drop-shadow-[0_0_4px_#22C55E]" />
              <span>Ссылка скопирована в буфер обмена!</span>
            </div>
          </div>
        )}
      </Card>

      {/* Описание */}
      <div className="flex flex-col gap-2 text-left">
        <span className="text-xs font-bold text-white px-2">Описание вертикали</span>
        <Card padding="md" className="text-xs text-textSecondary leading-relaxed border-white/5 shadow-glass-inner bg-white/[0.01]">
          {data.description}
        </Card>
      </div>

      {/* Правила Трафика (gap-12 заменен на gap-3, gap-10 на gap-2) */}
      <div className="grid grid-cols-2 gap-3 text-left">
        {/* Разрешенный трафик */}
        <div className="flex flex-col gap-2">
          <span className="text-[10px] font-bold text-success uppercase tracking-widest px-2">Разрешен</span>
          <Card padding="sm" className="flex-1 flex flex-col gap-2 border-success/10 bg-success/[0.01] shadow-glass-inner">
            {data.allowedTraffic.map((traffic, index) => (
              <div key={index} className="flex items-start gap-1.5">
                <Check size={14} className="text-success mt-0.5 shrink-0 drop-shadow-[0_0_4px_#22C55E]" />
                <span className="text-[10px] font-bold text-textSecondary leading-tight">{traffic}</span>
              </div>
            ))}
          </Card>
        </div>

        {/* Запрещенный трафик */}
        <div className="flex flex-col gap-2">
          <span className="text-[10px] font-bold text-error uppercase tracking-widest px-2">Запрещен</span>
          <Card padding="sm" className="flex-1 flex flex-col gap-2 border-error/10 bg-error/[0.01] shadow-glass-inner">
            {data.forbiddenTraffic.map((traffic, index) => (
              <div key={index} className="flex items-start gap-1.5">
                <X size={14} className="text-error mt-0.5 shrink-0 drop-shadow-[0_0_4px_#EF4444]" />
                <span className="text-[10px] font-bold text-textSecondary leading-tight">{traffic}</span>
              </div>
            ))}
          </Card>
        </div>
      </div>
    </div>
  );
};
