import React, { useState, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
  ArrowLeft, Globe, Calendar, DollarSign, Check, X, 
  Copy, CheckCircle2, AlertCircle, Link as LinkIcon 
} from 'lucide-react';
import { Card } from '@/shared/ui/Card';
import { Button } from '@/shared/ui/Button';
import { Input } from '@/shared/ui/Input';
import { triggerHaptic } from '@/shared/lib/telegram';

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

// База данных по макетам (2.1 - 2.7)
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

  // Состояния для работы генератора ссылок
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedLink, setGeneratedLink] = useState('');
  const [copied, setCopied] = useState(false);

  // Получаем данные по ID или берем дефолтный Adult Dating, если ID некорректен
  const data = useMemo(() => {
    return OFFERS_DETAILS_MAP[id || 'adult-dating'] || OFFERS_DETAILS_MAP['adult-dating'];
  }, [id]);

  const handleBack = () => {
    triggerHaptic.lightImpact();
    navigate('/offers');
  };

  const handleGenerateLink = () => {
    triggerHaptic.mediumImpact();
    setIsGenerating(true);
    
    // Имитация задержки генерации на 1 секунду для создания реалистичного UX
    setTimeout(() => {
      setGeneratedLink(`https://demo.vvdcpa.link/${data.smartlinkSuffix}`);
      setIsGenerating(false);
      triggerHaptic.success();
    }, 1000);
  };

  const handleCopyLink = () => {
    if (!generatedLink) return;
    
    navigator.clipboard.writeText(generatedLink).then(() => {
      triggerHaptic.success();
      setCopied(true);
      
      // Сбрасываем плашку "Скопировано" через 2.5 секунды
      setTimeout(() => {
        setCopied(false);
      }, 2500);
    });
  };

  return (
    <div className="flex flex-col gap-16 p-16 select-none pb-32">
      {/* Кнопка назад и Заголовок страницы */}
      <div className="flex items-center gap-12 text-left">
        <button 
          onClick={handleBack}
          className="w-10 h-10 rounded-app-xs bg-bgCard border border-gray-800/40 flex items-center justify-center text-textSec active:scale-95 transition-transform duration-100"
        >
          <ArrowLeft size={18} />
        </button>
        <div className="flex flex-col">
          <span className="text-[10px] text-accent font-semibold uppercase tracking-wider">Категория</span>
          <h1 className="text-xl font-bold text-white leading-tight">{data.title}</h1>
        </div>
      </div>

      {/* Сетка условий оффера */}
      <div className="grid grid-cols-2 gap-12 text-left">
        {/* Geo */}
        <Card padding="sm" className="flex items-center gap-12">
          <div className="w-8 h-8 rounded-app-xs bg-accentDark/40 flex items-center justify-center text-accent">
            <Globe size={16} />
          </div>
          <div className="flex flex-col">
            <span className="text-[10px] text-textMuted font-semibold uppercase">Гео</span>
            <span className="text-xs font-bold text-white mt-0.5">{data.geo}</span>
          </div>
        </Card>

        {/* Hold */}
        <Card padding="sm" className="flex items-center gap-12">
          <div className="w-8 h-8 rounded-app-xs bg-accentDark/40 flex items-center justify-center text-accent">
            <Calendar size={16} />
          </div>
          <div className="flex flex-col">
            <span className="text-[10px] text-textMuted font-semibold uppercase">Холд</span>
            <span className="text-xs font-bold text-white mt-0.5">{data.hold}</span>
          </div>
        </Card>

        {/* Выплаты */}
        <Card padding="sm" className="flex items-center gap-12 col-span-2">
          <div className="w-8 h-8 rounded-app-xs bg-accentDark/40 flex items-center justify-center text-accent">
            <DollarSign size={16} />
          </div>
          <div className="flex flex-col">
            <span className="text-[10px] text-textMuted font-semibold uppercase">Выплаты (CPA)</span>
            <span className="text-xs font-bold text-success mt-0.5">{data.payout}</span>
          </div>
        </Card>
      </div>

      {/* Генератор SmartLink */}
      <Card variant="accent" padding="md" className="flex flex-col gap-12">
        <div className="flex items-center gap-8 text-left">
          <LinkIcon size={16} className="text-accent" />
          <span className="text-xs font-bold text-white">Индивидуальный SmartLink</span>
        </div>

        {!generatedLink ? (
          <Button 
            variant="primary" 
            size="md" 
            className="w-full h-11"
            isLoading={isGenerating}
            onClick={handleGenerateLink}
          >
            Получить SmartLink
          </Button>
        ) : (
          <div className="flex flex-col gap-8">
            <div className="flex gap-8">
              <Input 
                value={generatedLink} 
                readOnly 
                className="flex-1"
                onClick={(e) => (e.target as HTMLInputElement).select()}
              />
              <Button 
                variant="outline" 
                size="md" 
                className="w-12 h-10 px-0 flex items-center justify-center"
                onClick={handleCopyLink}
              >
                <Copy size={16} />
              </Button>
            </div>
            {/* Анимированное плавающее уведомление о копировании */}
            <div className={`flex items-center gap-6 text-[10px] text-success transition-all duration-300 px-1 font-medium ${copied ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-1'}`}>
              <CheckCircle2 size={12} />
              <span>Ссылка успешно скопирована в буфер обмена!</span>
            </div>
          </div>
        )}
      </Card>

      {/* Блок Описания */}
      <div className="flex flex-col gap-8 text-left">
        <span className="text-xs font-bold text-white px-1">Описание вертикали</span>
        <Card padding="md" className="text-xs text-textSec leading-relaxed">
          {data.description}
        </Card>
      </div>

      {/* Правила Трафика по макету */}
      <div className="grid grid-cols-2 gap-12 text-left">
        {/* Разрешенный трафик */}
        <div className="flex flex-col gap-8">
          <span className="text-[10px] font-semibold text-success uppercase tracking-wider px-1">Разрешен</span>
          <Card padding="sm" className="flex-1 flex flex-col gap-8 border-success/10 bg-success/[0.02]">
            {data.allowedTraffic.map((traffic, index) => (
              <div key={index} className="flex items-start gap-6">
                <Check size={12} className="text-success mt-0.5 shrink-0" />
                <span className="text-[10px] font-medium text-textSec leading-tight">{traffic}</span>
              </div>
            ))}
          </Card>
        </div>

        {/* Запрещенный трафик */}
        <div className="flex flex-col gap-8">
          <span className="text-[10px] font-semibold text-error uppercase tracking-wider px-1">Запрещен</span>
          <Card padding="sm" className="flex-1 flex flex-col gap-8 border-error/10 bg-error/[0.02]">
            {data.forbiddenTraffic.map((traffic, index) => (
              <div key={index} className="flex items-start gap-6">
                <X size={12} className="text-error mt-0.5 shrink-0" />
                <span className="text-[10px] font-medium text-textSec leading-tight">{traffic}</span>
              </div>
            ))}
          </Card>
        </div>
      </div>
    </div>
  );
};
