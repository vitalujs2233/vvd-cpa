import React,{useEffect,useState} from 'react';
import {authorizedFetch} from '@/shared/lib/api';
import {Card} from '@/shared/ui/Card';
import {Button} from '@/shared/ui/Button';

type Credit={conversion_id:string;remaining:string;hold_until:string;network_verified:boolean;
  disputed:boolean;early_releasable:string;settlement_reference:string|null};
type Snapshot={success:boolean;real_finance_active:boolean;early_release_enabled?:boolean;
  cpa_hold:string;real_withdrawable:string;credits:Credit[]};
const API='https://vvd-cpa-v2.onrender.com';
export const CPAUserHold:React.FC<{partnerCode:string}>=({partnerCode})=>{
  const [data,setData]=useState<Snapshot|null>(null),[chosen,setChosen]=useState('');
  const [amount,setAmount]=useState(''),[reason,setReason]=useState('');
  const [busy,setBusy]=useState(false),[notice,setNotice]=useState('');
  const [requestId,setRequestId]=useState<string|null>(null);
  const base=API+'/admin/cpa/partners/'+encodeURIComponent(partnerCode);
  const load=async()=>{
    const r=await authorizedFetch(base+'/hold');
    if(!r.ok)throw new Error('CPA hold пока недоступен');
    const json:Snapshot=await r.json();
    if(!json.success)throw new Error('Вебмастер не найден');
    setData(json);
  };
  useEffect(()=>{
    setData(null);setChosen('');setNotice('');
    load().catch(e=>setNotice(String(e.message||e)));
  },[partnerCode]);
  const selected=data?.credits.find(x=>x.conversion_id===chosen);
  const send=async(endpoint:string,body:object)=>{
    const r=await authorizedFetch(base+endpoint,{method:'POST',
      headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
    const json=await r.json();
    if(!r.ok||!json.success)throw new Error(typeof json.detail==='string'?json.detail:'Операция отклонена');
    return json;
  };
  const release=async()=>{
    if(!selected||busy||!data?.early_release_enabled||!data.real_finance_active)return;
    if(!/^\d+(\.\d{1,2})?$/.test(amount)||Number(amount)<=0||
       Number(amount)>Number(selected.early_releasable)){
      setNotice('Недопустимая сумма CPA hold');return;
    }
    if(reason.trim().length<12||reason.trim().length>60){
      setNotice('Введите причину длиной от 12 до 60 символов');return;
    }
    const id=requestId||crypto.randomUUID();setRequestId(id);
    if(!window.confirm('Вебмастер: '+partnerCode+'\nНачисление: '+chosen+
      '\nВыпустить USD '+amount+'\nПричина: '+reason.trim()+
      '\n\nСумма станет доступной к запросу выплаты РАНЬШЕ 10 суток. Подтвердить?'))return;
    setBusy(true);setNotice('');
    try{
      const v=await send('/release',{conversion_id:chosen,amount,
        reason:reason.trim(),request_id:id});
      setNotice(v.duplicate?'Повтор запроса: дополнительного начисления нет':
        'Выпущено USD '+v.amount+'; запись добавлена в CPA Ledger.');
      setRequestId(null);setAmount('');setReason('');await load();
    }catch(e){setNotice(e instanceof Error?e.message:'Выпуск отклонён');}
    finally{setBusy(false);}
  };
  const field=(name:string,value:string,change:(v:string)=>void)=>
    <input aria-label={name} placeholder={name} value={value}
      onChange={e=>change(e.target.value)}
      className="w-full rounded-lg bg-black/40 border border-white/20 p-2 text-xs text-white"/>;
  return <Card padding="md" className="flex flex-col gap-3 text-left border-yellow-500/20">
    <div className="text-sm font-bold text-yellow-300">CPA Hold — досрочный выпуск</div>
    <div className="text-xs text-textSecondary">Вебмастер: {partnerCode}</div>
    {!data&&!notice&&<div className="text-xs text-textSecondary">Загрузка CPA Ledger…</div>}
    {data&&<>
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div><span className="text-textSecondary">CPA hold</span><div className="text-white font-bold">USD {data.cpa_hold}</div></div>
        <div><span className="text-textSecondary">Реально доступно</span><div className="text-success font-bold">USD {data.real_withdrawable}</div></div>
      </div>
      {!data.real_finance_active&&<div className="text-xs text-yellow-300">
        Финансовая граница неактивна. Ручной выпуск запрещён.</div>}
      {data.real_finance_active&&!data.early_release_enabled&&<div className="text-xs text-yellow-300">
        Ручной выпуск сейчас недоступен.</div>}
      <label className="text-xs text-textSecondary">Конкретное подтверждённое начисление
        <select aria-label="CPA начисление" value={chosen}
          onChange={e=>{setChosen(e.target.value);setRequestId(null);}}
          className="w-full mt-1 rounded-lg bg-black/40 border border-white/20 p-2 text-xs text-white">
          <option value="">Выберите начисление</option>
          {data.credits.map(x=><option key={x.conversion_id} value={x.conversion_id}>
            {x.conversion_id.slice(0,8)} · USD {x.remaining} · {x.disputed?'спор':'в холде'}
          </option>)}
        </select>
      </label>
      {selected&&<>
        <div className="text-xs text-textSecondary">
          Обычная дата выпуска: {new Date(selected.hold_until).toLocaleString('ru-RU')}
          <div>Остаток: USD {selected.remaining}; доступно досрочно: USD {selected.early_releasable}</div>
          {selected.disputed&&<div className="text-red-400">Спорные средства нельзя выпускать.</div>}
        </div>
        {field('Сумма досрочного выпуска USD',amount,v=>{setAmount(v);setRequestId(null);})}
        <textarea aria-label="Причина досрочного выпуска" placeholder="Обязательная причина (12–60 символов)"
          value={reason} rows={2} onChange={e=>{setReason(e.target.value);setRequestId(null);}}
          className="rounded-lg bg-black/40 border border-white/20 p-2 text-xs text-white"/>
        <Button onClick={release} disabled={busy||!data.real_finance_active||
          !data.early_release_enabled||selected.disputed||
          Number(selected.early_releasable)<=0}>
          {busy?'Проверка...':'Выпустить из холда'}
        </Button>
      </>}
    </>}
    {notice&&<div role="status" className="text-xs text-yellow-300">{notice}</div>}
  </Card>;
};
