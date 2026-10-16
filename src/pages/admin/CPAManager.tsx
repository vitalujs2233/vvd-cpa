import React,{useEffect,useState} from 'react';
import {ArrowLeft,Plus,Save} from 'lucide-react';
import {Card} from '@/shared/ui/Card';
import {cpaApi,type Network,type Vertical,type Offer} from '@/pages/offers/cpaApi';
type Section='networks'|'verticals'|'offers';
const input='w-full rounded-app-xs border border-white/10 bg-bgCard px-3 py-2.5 text-sm text-textPrimary outline-none focus:border-accentPurple/50';
const sampleNetwork:Network={id:0,name:'',website:'',description:'',is_active:true,connection_notes:'',offers_count:0};
const sampleVertical:Vertical={slug:'',title:'',description:'',icon_name:'layers',display_order:0,is_active:false,offers_count:0};
const sampleOffer:Offer={id:'',title:'',vertical_slug:'',network_id:null,description:'',icon_name:'layers',image_url:null,offer_type:'offer',source_url:null,geo:'',traffic_restrictions:'',payment_model:'CPA',currency:'USD',payout_terms:'',status:'draft',display_order:0,commission_percent:'20',hold_override_days:10};
export const CPAManager:React.FC<{onBack:()=>void}>=({onBack})=>{
 const [section,setSection]=useState<Section>('networks');
 const [networks,setNetworks]=useState<Network[]>([]),[verticals,setVerticals]=useState<Vertical[]>([]),[offers,setOffers]=useState<Offer[]>([]);
 const [editing,setEditing]=useState(false),[network,setNetwork]=useState<Network>(sampleNetwork),[vertical,setVertical]=useState<Vertical>(sampleVertical),[offer,setOffer]=useState<Offer>(sampleOffer);
 const [exists,setExists]=useState(false),[saving,setSaving]=useState(false),[loading,setLoading]=useState(true),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const reload=async()=>{setLoading(true);setError('');try{
   const [a,b,c]=await Promise.all([cpaApi.networks(),cpaApi.verticals(),cpaApi.offers()]);
   setNetworks(a.items);setVerticals(b.items);setOffers(c.items);
 }catch(e){setError(e instanceof Error?e.message:'Ошибка сервера')}finally{setLoading(false)}};
 useEffect(()=>{void reload()},[]);
 const start=()=>{setNetwork({...sampleNetwork});setVertical({...sampleVertical});setOffer({...sampleOffer});setExists(false);setEditing(true);setNotice('');setError('')};
 const edit=(value:Network|Vertical|Offer)=>{if(section==='networks')setNetwork(value as Network);if(section==='verticals')setVertical(value as Vertical);if(section==='offers')setOffer(value as Offer);setExists(true);setEditing(true);setError('');setNotice('')};
 const save=async()=>{setSaving(true);setError('');try{
   if(section==='networks')await cpaApi.saveNetwork(network);
   if(section==='verticals')await cpaApi.saveVertical(vertical,exists);
   if(section==='offers')await cpaApi.saveOffer(offer,exists);
   setNotice('Сохранено');setEditing(false);await reload();
 }catch(e){setError(e instanceof Error?e.message:'Ошибка сохранения')}finally{setSaving(false)}};
 const n=(key:keyof Network,value:unknown)=>setNetwork(x=>({...x,[key]:value}));
 const v=(key:keyof Vertical,value:unknown)=>setVertical(x=>({...x,[key]:value}));
 const o=(key:keyof Offer,value:unknown)=>setOffer(x=>({...x,[key]:value}));
 const row=(title:string,value:string|number,fn:(s:string)=>void,textarea=false,readonly=false)=><label className="block text-xs text-textSecondary">{title}{textarea?<textarea className={input+' mt-1 min-h-20'} value={value} onChange={e=>fn(e.target.value)}/>:<input className={input+' mt-1'} value={value} disabled={readonly} onChange={e=>fn(e.target.value)}/>}</label>;
 const check=(label:string,checked:boolean,fn:(v:boolean)=>void)=><label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={checked} onChange={e=>fn(e.target.checked)}/>{label}</label>;
 const option=(label:string,value:string,values:Array<[string,string]>,fn:(value:string)=>void)=><label className="block text-xs text-textSecondary">{label}<select value={value} className={input+' mt-1'} onChange={e=>fn(e.target.value)}>{values.map(([id,title])=><option key={id} value={id}>{title}</option>)}</select></label>;
 return <div className="flex flex-col gap-4 animate-fade-in">
  <div className="flex items-center gap-3"><button type="button" onClick={()=>editing?setEditing(false):onBack()} aria-label="Назад" className="rounded-full border border-white/10 p-3"><ArrowLeft size={17}/></button><h2 className="text-xl font-bold">CPA · {section==='networks'?'Партнёрские сети':section==='verticals'?'Вертикали':'Управление офферами'}</h2></div>
  <div className="grid grid-cols-3 gap-1">{([['networks','Сети'],['verticals','Вертикали'],['offers','Офферы']] as const).map(([id,title])=><button key={id} type="button" onClick={()=>{setSection(id);setEditing(false);setError('')}} className={'rounded-app-xs border p-2 text-xs '+(section===id?'border-accentPurple text-white bg-accentPurple/10':'border-white/10 text-textSecondary')}>{title}</button>)}</div>
  {error&&<p role="alert" className="text-xs text-error">{error}</p>}
  {notice&&<p role="status" className="text-xs text-success">{notice}</p>}
  {editing?<Card padding="lg" className="flex flex-col gap-3">
    {section==='networks'&&<>
      {row('Название сети',network.name,s=>n('name',s))}
      {row('HTTPS-сайт',network.website||'',s=>n('website',s))}
      {row('Описание',network.description,s=>n('description',s),true)}
      {row('Настройки подключения (без API-ключей)',network.connection_notes,s=>n('connection_notes',s),true)}
      {check('Активна',network.is_active,s=>n('is_active',s))}
      {exists&&<p className="text-xs text-textSecondary">Связанных офферов: {network.offers_count}</p>}
    </>}
    {section==='verticals'&&<>
      {row('Slug (латиница)',vertical.slug,s=>v('slug',s.toLowerCase().replace(/[^a-z0-9-]/g,'')),false,exists)}
      {row('Название',vertical.title,s=>v('title',s))}
      {row('Описание',vertical.description,s=>v('description',s),true)}
      {option('Иконка',vertical.icon_name,[['layers','Каталог'],['heart','Сердце'],['sparkles','Искры'],['video','Видео'],['gamepad','Игры'],['smartphone','Телефон'],['globe','Мир']],s=>v('icon_name',s))}
      {row('Порядок',vertical.display_order,s=>v('display_order',Number(s)||0))}
      {check('Опубликована',vertical.is_active,s=>v('is_active',s))}
      {exists&&<p className="text-xs text-textSecondary">Всего офферов: {vertical.offers_count}</p>}
    </>}
    {section==='offers'&&<>
      {row('ID оффера',offer.id,s=>o('id',s),false,exists)}
      {row('Название',offer.title,s=>o('title',s))}
      {option('Вертикаль',offer.vertical_slug,[['','Выберите вертикаль'],...verticals.map(x=>[x.slug,x.title] as [string,string])],s=>o('vertical_slug',s))}
      {option('Сеть',String(offer.network_id??''),[['','Без сети'],...networks.map(x=>[String(x.id),x.name] as [string,string])],s=>o('network_id',s?Number(s):null))}
      {row('Описание',offer.description,s=>o('description',s),true)}
      {option('Тип',offer.offer_type,[['offer','Обычный оффер'],['smartlink','Смартлинк']],s=>o('offer_type',s))}
      {row('Исходная HTTPS-ссылка (только администратор)',offer.source_url||'',s=>o('source_url',s||null))}
      {row('Изображение HTTPS (необязательно)',offer.image_url||'',s=>o('image_url',s||null))}
      {row('Иконка',offer.icon_name,s=>o('icon_name',s))}
      {row('Разрешённые GEO',offer.geo,s=>o('geo',s))}
      {row('Ограничения трафика',offer.traffic_restrictions,s=>o('traffic_restrictions',s),true)}
      {option('Модель оплаты',offer.payment_model,[['CPA','CPA'],['CPL','CPL'],['RevShare','RevShare'],['CPI','CPI'],['Other','Другая']],s=>o('payment_model',s))}
      {row('Валюта',offer.currency,s=>o('currency',s.toUpperCase()))}
      {row('Условия и ставка',offer.payout_terms,s=>o('payout_terms',s),true)}
      {option('Статус',offer.status,[['draft','Черновик'],['published','Опубликован'],['disabled','Отключён']],s=>o('status',s as Offer['status']))}
      {row('Порядок',offer.display_order,s=>o('display_order',Number(s)||0))}
      {row('Комиссия сети (%) — настройка для будущих этапов',offer.commission_percent,s=>o('commission_percent',s))}
      {row('Холд (дней) — настройка для будущих этапов',offer.hold_override_days,s=>o('hold_override_days',Number(s)||0))}
      <p className="text-[11px] text-textSecondary">Эти настройки пока не меняют postback, начисления и персональные ссылки.</p>
    </>}
    <button type="button" disabled={saving} onClick={()=>void save()} className="flex items-center justify-center gap-2 rounded-app-xs bg-accentPurple/70 p-3 text-sm font-bold disabled:opacity-50"><Save size={16}/>{saving?'Сохранение…':'Сохранить'}</button>
  </Card>:<>
    <button type="button" onClick={start} className="flex items-center justify-center gap-2 rounded-app-xs border border-accentPurple/40 bg-accentPurple/10 p-3 text-sm"><Plus size={16}/> {section==='networks'?'Добавить сеть':section==='verticals'?'Добавить вертикаль':'Добавить оффер'}</button>
    {loading&&<p className="text-xs text-textSecondary">Загрузка…</p>}
    {!loading&&(section==='networks'?networks:section==='verticals'?verticals:offers).length===0&&<Card padding="lg" className="text-center text-xs text-textSecondary">Пока нет записей</Card>}
    {!loading&&(section==='networks'?networks:section==='verticals'?verticals:offers).map((item:Network|Vertical|Offer)=>{
      const heading='name'in item?item.name:item.title;const key='id'in item?String(item.id):item.slug;
      const meta='offers_count'in item?item.offers_count+' офферов':'status'in item?item.status:'';
      return <Card key={key} padding="sm" className="flex items-center justify-between gap-2"><div><h3 className="text-sm font-bold">{heading}</h3><p className="text-xs text-textSecondary">{meta}</p></div><button type="button" onClick={()=>edit(item)} className="rounded-app-xs border border-white/10 px-3 py-2 text-xs text-accentPurple">Изменить</button></Card>;
    })}
  </>}
 </div>;
};
