import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Card } from '@/shared/ui/Card';

export const Referral: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div className="flex flex-col gap-4 p-4 pb-24 animate-fade-in">

      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate(-1)}
          className="w-11 h-11 rounded-full bg-bgCard/40 border border-white/10 flex items-center justify-center"
        >
          <ArrowLeft size={18} />
        </button>

        <div className="flex flex-col">
          <span className="text-[10px] uppercase tracking-wider text-accentGold font-bold">
            Кабинет
          </span>

          <h1 className="text-2xl font-bold text-white">
            Реферальная программа
          </h1>
        </div>
      </div>
      <Card padding="lg" className="text-center">

  <div className="text-[11px] uppercase tracking-widest text-accentGold font-bold">
    Реферальный баланс
  </div>

  <div className="text-4xl font-extrabold text-white mt-3">
    $0.00
  </div>

  <button
    className="mt-5 w-full rounded-xl bg-accentGold text-black font-bold py-3 transition hover:opacity-90"
  >
    Вывести
  </button>

</Card>

<Card padding="lg">

  <div className="text-[10px] uppercase tracking-widest text-accentGold font-bold">
    Моя ссылка
  </div>

  <div className="mt-3 text-sm text-white break-all">
    https://t.me/VVDCPAbot?start=VVD1
  </div>

  <button
    className="mt-4 w-full rounded-xl border border-accentGold text-accentGold py-3 font-bold"
  >
    Копировать ссылку
  </button>

</Card>

<Card padding="lg">

  <div className="flex justify-between">

    <span className="text-textSecondary">
      Приглашено
    </span>

    <span className="font-bold text-white">
      0
    </span>

  </div>

  <div className="mt-4 flex justify-between">

    <span className="text-textSecondary">
      Доход по рефералам
    </span>

    <span className="font-bold text-accentGold">
      $0.00
    </span>

  </div>

</Card>

<Card padding="lg">

  <div className="text-[10px] uppercase tracking-widest text-accentGold font-bold mb-4">
    Приглашённые
  </div>

  <div className="text-center text-textSecondary">

    Пока никто не зарегистрировался

  </div>

</Card>
