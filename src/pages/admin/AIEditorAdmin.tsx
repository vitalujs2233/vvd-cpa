import React,{useEffect,useMemo,useState} from 'react';
import {ArrowLeft,BookOpen,CheckCircle2,ExternalLink,FileClock,RefreshCw,Save,ShieldCheck,Sparkles,Trash2} from 'lucide-react';
import {apiRequest} from '@/shared/lib/api';

type Kind='article'|'service'|'category';
type Settings={enabled:boolean;version:number;last_attempt:string|null;last_success:string|null;last_kind:Kind;last_error:string;article_category_id:string;suggest_categories:boolean};
type ArticleBlock={type:'heading'|'paragraph'|'quote';text:string;url:string;alt:string};
type ArticleDraft={title:string;excerpt:string;seo_title:string;seo_description:string;tags:string[];blocks:ArticleBlock[];image_urls:string[];source_service_id:string;category_id?:string};
type CategoryDraft={name:string;description:string};
type ServiceDraft={name:string;description:string;benefits:string;discount_text:string;promo_code:string;website_url:string;image_url:string;source_name:string};
type Draft={id:string;kind:Kind;source_service_id:string|null;payload:ArticleDraft|ServiceDraft|CategoryDraft;status:'pending'|'applied';created_at:string;updated_at:string};
type Data={settings:Settings;drafts:Draft[];services:{id:string;name:string;category_id:string}[];categories:{id:string;name:string;active:boolean;show_on_web:boolean;show_in_mini_app:boolean}[]};
type ServiceEdit={name:string;description:string;benefits:string;discount_text:string;website_url:string;promo_code:string;show_on_web:boolean;show_in_mini_app:boolean};

const api={
 load:()=>apiRequest<Data>('/ai-editor/admin'),
 settings:(settings:Settings)=>apiRequest<{enabled:boolean;version:number}>('/ai-editor/admin',{
   method:'PUT',body:JSON.stringify({enabled:settings.enabled,version:settings.version,
     article_category_id:settings.article_category_id,suggest_categories:settings.suggest_categories})
 }),
 run:(kind:Kind,source_service_id:string,category_id:string,topic:string)=>apiRequest<{id:string;kind:Kind}>('/ai-editor/admin/run',{
   method:'POST',body:JSON.stringify({kind,source_service_id,category_id,topic})
 }),
 discard:(id:string)=>apiRequest<{success:boolean}>('/ai-editor/admin/drafts/'+encodeURIComponent(id)+'/discard',{method:'POST'}),
 applyArticle:(id:string)=>apiRequest<{success:boolean;slug:string}>('/ai-editor/admin/drafts/'+encodeURIComponent(id)+'/article',{method:'POST'}),
 approveCategory:(id:string)=>apiRequest<{success:boolean;category_id:string}>('/ai-editor/admin/drafts/'+encodeURIComponent(id)+'/category',{method:'POST'}),
 publishService:(id:string,data:ServiceEdit)=>apiRequest<{success:boolean;service_id:string}>('/ai-editor/admin/drafts/'+encodeURIComponent(id)+'/publish-service',{
   method:'POST',body:JSON.stringify(data)
 })
};
const input='w-full rounded-app-xs border border-white/15 bg-bgMain px-3 py-2.5 text-sm text-white outline-none focus:border-accentGold/40';
const errText=(error:unknown)=>error instanceof Error?error.message:'Не удалось выполнить действие';
const formatDate=(value:string|null)=>value?new Date(value).toLocaleString('ru-RU'):'Ещё не запускался';
const forService=(p:ServiceDraft):ServiceEdit=>({
  name:p.name,description:p.description,benefits:p.benefits,
  discount_text:p.discount_text||'',website_url:'',promo_code:'',
  show_on_web:true,show_in_mini_app:true
});
const textField=(label:string,value:string,onChange:(v:string)=>void,area=false,limit=750)=>(
  <label className="block text-xs text-textSecondary">{label}
    {area?<textarea rows={4} maxLength={limit} className={input} value={value} onChange={e=>onChange(e.target.value)}/>:
      <input className={input} maxLength={limit} value={value} onChange={e=>onChange(e.target.value)}/>}
  </label>
);

export const AIEditorAdmin:React.FC<{
  onBack:()=>void;
  openArticles:()=>void;
  openServices:()=>void;
}>=({onBack,openArticles,openServices})=>{
  const [data,setData]=useState<Data|null>(null);
  const [refresh,setRefresh]=useState(0);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');
  const [kind,setKind]=useState<Kind>('article');
  const [source,setSource]=useState('');
  const [categoryId,setCategoryId]=useState('');
  const [topic,setTopic]=useState('');
  const [editing,setEditing]=useState<string|null>(null);
  const [serviceEdit,setServiceEdit]=useState<ServiceEdit|null>(null);
  useEffect(()=>{
    let live=true;
    setError('');
    void api.load().then(v=>{if(live)setData(v);})
      .catch(e=>{if(live)setError('Не удалось загрузить AI-редактор: '+errText(e));});
    return()=>{live=false;};
  },[refresh]);
  const pending=useMemo(()=>data?.drafts.filter(d=>d.status==='pending')||[],[data]);
  const update=()=>setRefresh(x=>x+1);
  const action=async(job:()=>Promise<unknown>,message:string)=>{
    if(busy)return;
    setBusy(true);setError('');setNotice('');
    try{await job();setNotice(message);update();}
    catch(e){setError(errText(e));}finally{setBusy(false);}
  };
  const changeSettings=(changes:Partial<Settings>,message:string)=>{
    if(!data)return;
    void action(()=>api.settings({...data.settings,...changes}),message);
  };
  const toggle=()=>{
    if(!data)return;
    const enabled=!data.settings.enabled;
    changeSettings({enabled},enabled?'Авторедактор включён. Черновики готовятся без публикации.':'Авторедактор выключен. Черновики сохранены.');
  };
  const startRun=()=>{void action(()=>api.run(kind,kind==='category'?'':source,kind==='article'?categoryId:'',kind==='article'?topic.trim():''),
    'Gemini подготовил предложение. Проверь его ниже.')};
  const openService=(draft:Draft)=>{
    if(editing===draft.id){setEditing(null);return;}
    setEditing(draft.id);setServiceEdit(forService(draft.payload as ServiceDraft));
  };
  const changeService=(patch:Partial<ServiceEdit>)=>{
    setServiceEdit(current=>current?{...current,...patch}:null);
  };
  const publishService=(draft:Draft)=>{
    if(!serviceEdit||busy)return;
    if(!window.confirm('После подтверждения изменения исходного сервиса станут видны на выбранных площадках. Опубликовать?'))return;
    void action(()=>api.publishService(draft.id,serviceEdit),
      'Сервис обновлён и опубликован. Реферальная ссылка и промокод добавлены по вашему подтверждению.');
    setEditing(null);
  };
  return <div className="flex flex-col gap-4 p-4 pb-32 text-white">
    <button type="button" className="flex items-center gap-2 self-start text-sm text-accentBrightGold" onClick={onBack}>
      <ArrowLeft size={18}/> Админ-панель
    </button>
    <div className="flex items-start gap-3">
      <Sparkles size={28} className="shrink-0 text-accentBrightGold"/>
      <div>
        <h1 className="text-xl font-bold">AI-редактор VVD CPA</h1>
        <p className="mt-1 text-xs leading-5 text-textSecondary">Один Gemini на Render. Статьи и сервисы готовятся в черновики, без автоматической публикации.</p>
      </div>
    </div>
    {error&&<p role="alert" className="rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-300">{error}</p>}
    {notice&&<p role="status" className="rounded-lg border border-accentGold/20 bg-bgCard p-3 text-sm text-accentBrightGold">{notice}</p>}
    {!data?<button type="button" className="flex gap-2 text-sm text-accentBrightGold" onClick={update}><RefreshCw size={17}/> {error?'Повторить загрузку':'Загрузка настроек…'}</button>:<>
      <section className="rounded-card border border-accentGold/20 bg-bgCard p-4 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div><h2 className="font-bold text-white">Автоматическая подготовка</h2>
            <p className="mt-1 text-xs text-textSecondary">Около 3 материалов в неделю, пока Render работает</p>
          </div>
          <label className="flex shrink-0 items-center gap-2 text-xs text-white">
            <input type="checkbox" role="switch" disabled={busy} checked={data.settings.enabled} onChange={toggle} className="h-5 w-5 accent-[#BEA36A]"/>
            {data.settings.enabled?'Вкл.':'Выкл.'}
          </label>
        </div>
        <label className="block text-xs text-textSecondary">Категория автоматических статей
          <select className={input} disabled={busy} value={data.settings.article_category_id||''}
            onChange={e=>changeSettings({article_category_id:e.target.value},'Категория для авторедактора сохранена.')}>
            <option value="">Автоматически выбирать наименее заполненную категорию</option>
            {data.categories.map(c=><option key={c.id} value={c.id}>{c.name}{!c.active?' (скрыта)':''}</option>)}
          </select>
        </label>
        <label className="flex items-center gap-2 text-xs text-white">
          <input type="checkbox" disabled={busy} checked={data.settings.suggest_categories}
            onChange={e=>changeSettings({suggest_categories:e.target.checked},'Предложения категорий настроены.')}/>
          Предлагать новые категории автоматически
        </label>
        <p className="text-xs text-textSecondary">Новые категории — только предложения. Ты проверяешь их, а затем включаешь в обычном редакторе.</p>
        <p className="text-xs text-textSecondary">Последний успешный запуск: {formatDate(data.settings.last_success)}</p>
        {data.settings.last_error&&<p className="text-xs text-amber-200">Последняя попытка: {data.settings.last_error}</p>}
        <p className="text-xs text-textSecondary">Бесплатные лимиты Gemini общие с AI-моделями. При превышении лимита генерация пропускается, списаний внутри VVD CPA нет.</p>
      </section>
      <section className="rounded-card border border-accentGold/20 bg-bgCard p-4 space-y-3">
        <h2 className="font-bold text-white">Создать черновик сейчас</h2>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={()=>setKind('article')} className={'rounded-lg border px-3 py-2 text-xs '+(kind==='article'?'border-accentGold/60 text-accentBrightGold':'border-white/15 text-textSecondary')}>Статья / кейс</button>
          <button type="button" onClick={()=>setKind('service')} className={'rounded-lg border px-3 py-2 text-xs '+(kind==='service'?'border-accentGold/60 text-accentBrightGold':'border-white/15 text-textSecondary')}>Каталог сервисов</button>
          <button type="button" onClick={()=>setKind('category')} className={'rounded-lg border px-3 py-2 text-xs '+(kind==='category'?'border-accentGold/60 text-accentBrightGold':'border-white/15 text-textSecondary')}>Новая категория</button>
        </div>
        {kind==='article'&&<label className="block text-xs text-textSecondary">Для какой категории создать статью?
          <select className={input} value={categoryId} onChange={e=>setCategoryId(e.target.value)}>
            <option value="">Выбери категорию из списка</option>
            {data.categories.map(c=><option key={c.id} value={c.id}>{c.name}{!c.active?' (скрыта)':''}</option>)}
          </select>
        </label>}
        {kind==='article'&&<label className="block text-xs text-textSecondary">Конкретная тема или задание для Gemini (необязательно)
          <textarea className={input} rows={3} maxLength={300} value={topic}
            placeholder="Например: УБТ в TikTok для новичков — первые шаги и типичные ошибки"
            onChange={e=>setTopic(e.target.value)}/>
          <span className="mt-1 block text-[11px] text-textSecondary">AI будет писать по этой теме внутри выбранной категории. Факты и кейсы нужно проверить перед публикацией.</span>
        </label>}
        {kind!=='category'&&<label className="block text-xs text-textSecondary">Исходный сервис из каталога
          <select className={input} value={source} onChange={e=>setSource(e.target.value)}>
            <option value="">Автоматически выбрать</option>
            {data.services.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </label>}
        {kind==='category'&&<p className="text-xs text-textSecondary">Gemini предложит название и описание категории. Ты решаешь, добавлять ли её.</p>}
        {kind==='service'&&<p className="text-xs leading-5 text-textSecondary">Gemini улучшит описание выбранного существующего сервиса. Скидка переносится только из каталога, ссылки и промокоды не генерируются.</p>}
        <button type="button" disabled={busy||(kind==='service'&&!data.services.length)||(kind==='article'&&!categoryId)} onClick={startRun}
          className="flex w-full items-center justify-center gap-2 rounded-app-xs border border-accentGold/35 bg-accentGold/10 px-4 py-3 text-sm font-bold text-accentBrightGold disabled:opacity-50">
          <Sparkles size={18}/>{busy?'Выполняем действие…':'Подготовить черновик'}
        </button>
      </section>
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-bold text-white">Черновики AI ({pending.length})</h2>
        <button onClick={update} type="button" className="text-xs text-accentBrightGold flex items-center gap-1"><RefreshCw size={15}/> Обновить</button>
      </div>
      {!pending.length&&<p className="rounded-card border border-white/10 bg-bgCard p-4 text-sm text-textSecondary">Пока нет материалов на проверку. Запустите генерацию вручную или включите авторедактор.</p>}
      {pending.map(d=><section key={d.id} className="rounded-card border border-accentGold/20 bg-bgCard p-4 space-y-3">
        <div className="flex justify-between items-start gap-3">
          <div className="min-w-0">
            <p className="mb-1 text-[11px] text-accentBrightGold">{d.kind==='article'?'СТАТЬЯ · ЧЕРНОВИК':d.kind==='category'?'КАТЕГОРИЯ · ПРЕДЛОЖЕНИЕ':'СЕРВИС · ЧЕРНОВИК'}</p>
            <h3 className="font-bold text-white">{d.kind==='service'?(d.payload as ServiceDraft).name:d.kind==='category'?(d.payload as CategoryDraft).name:(d.payload as ArticleDraft).title}</h3>
            <p className="mt-1 text-xs text-textSecondary">{formatDate(d.created_at)}</p>
          </div>
          <FileClock size={20} className="shrink-0 text-textSecondary"/>
        </div>
        {d.kind==='category'?(()=>{
          const p=d.payload as CategoryDraft;
          return <>
            <p className="text-sm text-textSecondary">{p.description}</p>
            <button type="button" disabled={busy} className="flex w-full justify-center gap-2 rounded-lg border border-accentGold/30 px-3 py-2.5 text-sm text-accentBrightGold disabled:opacity-50"
              onClick={()=>void action(()=>api.approveCategory(d.id),'Категория сохранена скрытой. Добавь фото и включи её в редакторе статей.')}>
              <CheckCircle2 size={17}/> Добавить категорию в редактор
            </button>
          </>;
        })():d.kind==='article'?(()=>{
          const p=d.payload as ArticleDraft;
          return <>
            {p.image_urls?.[0]&&<img src={p.image_urls[0]} alt="" loading="lazy" className="aspect-video w-full rounded-lg object-cover"/>}
            <p className="text-xs text-accentBrightGold">Категория: {data.categories.find(c=>c.id===p.category_id)?.name||'AI-черновики'}</p>
            <p className="text-xs text-textSecondary">В редактор статья попадёт неопубликованной. При публикации доступны сайт и Mini App.</p>
            <p className="text-xs leading-5 text-textSecondary">{p.excerpt}</p>
            <details className="text-sm text-textSecondary">
              <summary className="cursor-pointer text-accentBrightGold">Прочитать подготовленный текст</summary>
              <div className="mt-3 space-y-3">{p.blocks.map((b,i)=><p key={i} className={'whitespace-pre-wrap leading-6 '+(b.type==='heading'?'font-bold text-white':'')}>{b.text}</p>)}</div>
            </details>
            <button disabled={busy} className="flex w-full justify-center gap-2 rounded-lg border border-accentGold/30 px-3 py-2.5 text-sm text-accentBrightGold disabled:opacity-50"
              onClick={()=>void action(()=>api.applyArticle(d.id),'Статья сохранена в разделе «Статьи и кейсы» как НЕопубликованный черновик.')}>
              <CheckCircle2 size={17}/> Перенести в черновики статей
            </button>
          </>;
        })():(()=>{
          const p=d.payload as ServiceDraft;
          return <>
            <p className="text-xs text-textSecondary">Исходная запись: {p.source_name}. Существующий сервис пока не менялся.</p>
            <p className="text-sm leading-6 text-textSecondary">{p.description}</p>
            {!!p.discount_text&&<p className="text-xs text-accentBrightGold">Скидка из каталога: {p.discount_text}</p>}
            <button type="button" onClick={()=>openService(d)} className="w-full rounded-lg border border-accentGold/30 px-3 py-2.5 text-sm text-accentBrightGold">
              {editing===d.id?'Свернуть редактор':'Проверить, добавить ссылку и промокод'}
            </button>
            {editing===d.id&&serviceEdit&&<div className="space-y-3 border-t border-white/10 pt-3">
              {textField('Название сервиса',serviceEdit.name,v=>changeService({name:v}),false,150)}
              {textField('Короткое описание',serviceEdit.description,v=>changeService({description:v}),true,750)}
              {textField('Описание преимуществ',serviceEdit.benefits,v=>changeService({benefits:v}),true,2400)}
              <div className="text-xs text-textSecondary">Скидка (только подтверждённая в каталоге): {p.discount_text||'Не указана'}</div>
              {textField('ТВОЯ HTTPS партнёрская ссылка',serviceEdit.website_url,v=>changeService({website_url:v}),false,2048)}
              {textField('ТВОЙ промокод (если есть)',serviceEdit.promo_code,v=>changeService({promo_code:v}),false,100)}
              <label className="flex gap-2 text-xs text-white"><input type="checkbox" checked={serviceEdit.show_on_web} onChange={e=>changeService({show_on_web:e.target.checked})}/> На сайте</label>
              <label className="flex gap-2 text-xs text-white"><input type="checkbox" checked={serviceEdit.show_in_mini_app} onChange={e=>changeService({show_in_mini_app:e.target.checked})}/> В Mini App</label>
              <p className="text-xs text-amber-200">Внимание: кнопка ниже обновит ИСХОДНУЮ карточку сервиса и сразу опубликует её. Перед этим проверь текст и ссылку.</p>
              <button disabled={busy||!serviceEdit.website_url.trim()} className="flex w-full items-center justify-center gap-2 rounded-lg bg-accentGold px-3 py-3 text-sm font-bold text-black disabled:opacity-50" onClick={()=>publishService(d)}>
                <Save size={17}/> Подтвердить публикацию сервиса
              </button>
            </div>}
          </>;
        })()}
        <button type="button" disabled={busy} onClick={()=>{
            if(window.confirm('Отклонить этот черновик?'))void action(()=>api.discard(d.id),'Черновик отклонён.');
          }} className="flex gap-2 items-center text-xs text-red-300 disabled:opacity-50">
          <Trash2 size={15}/> Отклонить черновик
        </button>
      </section>)}
      <section className="rounded-card border border-white/10 bg-bgCard p-3 space-y-3">
        <p className="text-xs text-textSecondary flex gap-2 items-center"><ShieldCheck size={18}/> AI никогда не публикует статьи без твоего подтверждения.</p>
        <button type="button" onClick={openArticles} className="flex w-full items-center justify-between border-b border-white/10 py-2 text-sm text-accentBrightGold"><span className="flex gap-2 items-center"><BookOpen size={17}/> Открыть редактор статей</span><ExternalLink size={16}/></button>
        <button type="button" onClick={openServices} className="flex w-full items-center justify-between py-2 text-sm text-accentBrightGold"><span>Открыть каталог сервисов</span><ExternalLink size={16}/></button>
      </section>
    </>}
  </div>;
};
