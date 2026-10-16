import React,{useEffect,useState} from 'react';
import { Link,useNavigate,useParams } from 'react-router-dom';
import { ArrowLeft,ArrowRight,Check,Copy,ExternalLink,Image as ImageIcon,MessageSquare,Plus,Save,UserRound } from 'lucide-react';
import {Card} from '@/shared/ui/Card';
import {Button} from '@/shared/ui/Button';
import {marketApi,modelPageUrl,type Character,type PublicCharacter} from './marketApi';

const blank:Character={name:'',slug:'',description:'',language:'ru',persona:'',greeting:'',offer_description:'',knowledge:'',goal:'',restrictions:'',photo_url:null,affiliate_url:null,button_label:'Узнать больше',extra_url:null,status:'draft'};
const input='mt-1 w-full rounded-app-xs border border-white/10 bg-bgCard px-3 py-3 text-sm text-textPrimary outline-none focus:border-accentGold/60';
const textArea=input+' min-h-[94px] resize-y';
const message=(e:unknown)=>e instanceof Error?e.message:'Не удалось выполнить запрос';
const Wrapper:React.FC<{children:React.ReactNode}>=({children})=><main className="flex flex-col gap-4 p-4 pb-28 animate-fade-in">{children}</main>;
const Back:React.FC<{title:string}>=({title})=>{const n=useNavigate();return <div className="flex items-center gap-3"><button type="button" onClick={()=>n(-1)} aria-label="Назад" className="rounded-app-xs border border-white/10 p-2 text-accentBrightGold"><ArrowLeft size={20}/></button><h1 className="text-xl font-bold">{title}</h1></div>;};
const Field:React.FC<{title:string;value:string;onChange:(v:string)=>void;multiline?:boolean;placeholder?:string;max?:number}>=({title,value,onChange,multiline,placeholder,max})=><label className="block text-xs font-semibold text-textSecondary">{title}{multiline?<textarea className={textArea} placeholder={placeholder} maxLength={max||3000} value={value} onChange={e=>onChange(e.target.value)}/>:<input className={input} placeholder={placeholder} maxLength={max||200} value={value} onChange={e=>onChange(e.target.value)}/>}</label>;
const PublicPreview:React.FC<{model:Character|PublicCharacter}>=({model})=><Card className="flex flex-col gap-3">
  <div className="flex items-center gap-3">{model.photo_url?<img className="h-16 w-16 rounded-full object-cover" src={model.photo_url} alt=""/>:<div className="flex h-16 w-16 items-center justify-center rounded-full bg-accentGold/10"><UserRound size={25} className="text-accentBrightGold"/></div>}
    <div><h2 className="font-bold">{model.name||'Имя персонажа'}</h2><span className="text-xs text-accentBrightGold">AI-персонаж</span></div>
  </div><p className="text-sm text-textSecondary">{model.description||'Описание персонажа'}</p>
  <div className="rounded-app-xs border border-white/10 bg-white/[0.03] p-3 text-sm"><MessageSquare size={15} className="mb-2 text-accentBrightGold"/>{model.greeting||'Приветствие появится здесь'}</div>
  <p className="text-xs text-textSecondary">AI-чат пока не подключён. Отправка сообщений недоступна.</p>
  <input disabled className={input+' opacity-60'} placeholder="Сообщение (недоступно)"/>
  {model.affiliate_url?<a href={model.affiliate_url} target="_blank" rel="noopener noreferrer sponsored" className="rounded-app-xs border border-accentGold/40 p-3 text-center text-sm font-bold text-accentBrightGold">{model.button_label||'Узнать больше'}</a>:<div className="text-xs text-textSecondary">Партнёрская ссылка не добавлена</div>}
</Card>;

export const AIModelsPage:React.FC=()=>{
  const [models,setModels]=useState<Character[]>([]),[busy,setBusy]=useState(true),[error,setError]=useState('');
  useEffect(()=>{marketApi.models().then(r=>setModels(r.models)).catch(e=>setError(message(e))).finally(()=>setBusy(false));},[]);
  return <Wrapper><Back title="AI-модели"/>
    <Link to="/tools/ai/new" className="flex items-center justify-center gap-2 rounded-app-xs bg-gold-gradient p-3 text-sm font-bold text-bgMain"><Plus size={17}/> Создать модель</Link>
    <h2 className="text-base font-bold">Мои модели</h2>{error&&<p role="alert" className="text-xs text-error">{error}</p>}
    {busy?<Card><p className="text-sm text-textSecondary">Загружаем…</p></Card>:models.length===0?<Card className="py-8 text-center"><p className="text-sm font-semibold">У вас пока нет AI-моделей</p><p className="mt-2 text-xs text-textSecondary">Создайте профиль AI-персонажа и сохраните его настройки</p></Card>:models.map(m=><Card key={m.id} className="flex flex-col gap-3">
      <div className="flex items-center justify-between"><div><b className="text-sm">{m.name}</b><p className="text-xs text-textSecondary">{m.slug} · {m.status==='published'?'Опубликована':m.status==='disabled'?'Отключена':'Черновик'}</p></div><span className="text-xs text-accentBrightGold">AI</span></div>
      <div className="flex gap-2"><Link to={'/tools/ai/'+m.id} className="flex-1 rounded-app-xs border border-accentGold/35 p-2 text-center text-xs text-accentBrightGold">Управление</Link>
      {m.status==='published'&&<a className="flex-1 rounded-app-xs border border-white/10 p-2 text-center text-xs" target="_blank" rel="noopener noreferrer" href={modelPageUrl(m.slug)}>Открыть страницу</a>}</div>
    </Card>)}
    <p className="text-xs text-textSecondary">Профили сохраняются. Генерация AI-ответов и платные тарифы появятся после подключения провайдера.</p>
  </Wrapper>;
};

export const AIEditor:React.FC=()=>{
  const {id}=useParams(),nav=useNavigate();
  const [model,setModel]=useState<Character>({...blank}),[step,setStep]=useState(0),[saving,setSaving]=useState(false),[error,setError]=useState(''),[photoPreview,setPhotoPreview]=useState<string|null>(null);
  useEffect(()=>{if(!id)return;marketApi.model(id).then(setModel).catch(e=>setError(message(e)));},[id]);
  const update=(key:keyof Character)=>(value:string)=>setModel(prev=>({...prev,[key]:value}));
  const safeLink=(v:string|null)=>!v||(/^https:\/\/[^\s/]+/i.test(v)&&!v.includes('@'));
  const validBase=model.name.trim().length>=2&&/^[a-z0-9][a-z0-9-]{2,39}$/.test(model.slug);
  const validLinks=safeLink(model.affiliate_url)&&safeLink(model.photo_url)&&safeLink(model.extra_url);
  const save=async()=>{
    setSaving(true);setError('');
    try{const saved=await marketApi.saveModel(model);nav('/tools/ai/'+saved.id,{replace:true});}
    catch(e){setError(message(e));}finally{setSaving(false);}
  };
  const steps=['Профиль','Настройки AI','Ссылки','Предпросмотр','Сохранение'];
  return <Wrapper><Back title={id?'Управление моделью':'Создание AI-модели'}/>
    <div className="grid grid-cols-5 gap-1">{steps.map((label,i)=><button type="button" key={label} onClick={()=>setStep(i)} className={'rounded-app-xs border px-1 py-2 text-[10px] '+(step===i?'border-accentGold bg-accentGold/10 text-accentBrightGold':'border-white/10 text-textSecondary')}>{i+1}</button>)}</div>
    <p className="text-xs text-textSecondary">Шаг {step+1} из 5 · {steps[step]}</p>
    {step===0&&<Card className="flex flex-col gap-3">
      <Field title="Имя персонажа" value={model.name} onChange={update('name')} max={80}/>
      <Field title="Имя публичной страницы (латиница, цифры, дефис)" value={model.slug} onChange={v=>update('slug')(v.toLowerCase().replace(/[^a-z0-9-]/g,''))} max={40} placeholder="my-ai-profile"/>
      <Field title="Краткое описание" value={model.description} onChange={update('description')} multiline max={500}/>
      <label className="text-xs text-textSecondary">Язык общения<select value={model.language} onChange={e=>update('language')(e.target.value)} className={input}><option value="ru">Русский</option><option value="en">English</option><option value="de">Deutsch</option></select></label>
      <Field title="HTTPS-ссылка на фотографию" value={model.photo_url||''} onChange={v=>setModel(p=>({...p,photo_url:v||null}))} placeholder="https://..."/>
      <label className="text-xs text-textSecondary">Предпросмотр фотографии (локально, не загружается на сервер)<input className={input} type="file" accept="image/png,image/jpeg,image/webp" onChange={e=>{const f=e.target.files?.[0];if(!f)return;if(f.size>2_000_000){setError('Файл более 2 МБ');return;}const r=new FileReader();r.onload=()=>setPhotoPreview(String(r.result));r.readAsDataURL(f);}}/></label>
      {photoPreview&&<img src={photoPreview} alt="Локальный предпросмотр" className="h-20 w-20 rounded-app-xs object-cover"/>}
      <p className="text-xs text-textSecondary">Постоянная загрузка фото требует подключения хранилища. Пока можно указать HTTPS-ссылку.</p>
    </Card>}
    {step===1&&<Card className="flex flex-col gap-3">
      <Field title="Характер и стиль общения" multiline value={model.persona} onChange={update('persona')}/>
      <Field title="Приветственное сообщение" multiline value={model.greeting} onChange={update('greeting')} max={500}/>
      <Field title="Описание предложения" multiline value={model.offer_description} onChange={update('offer_description')}/>
      <Field title="Информация, которую AI может использовать" multiline value={model.knowledge} onChange={update('knowledge')} max={5000}/>
      <Field title="Целевое действие посетителя" multiline value={model.goal} onChange={update('goal')}/>
      <Field title="Ограничения ответов" multiline value={model.restrictions} onChange={update('restrictions')}/>
      <p className="text-xs text-textSecondary">Настройки сохраняются, но ещё не передаются в генеративную модель.</p>
    </Card>}
    {step===2&&<Card className="flex flex-col gap-3"><Field title="Партнёрская HTTPS-ссылка" value={model.affiliate_url||''} onChange={v=>setModel(p=>({...p,affiliate_url:v||null}))}/>
      <Field title="Текст кнопки" value={model.button_label} onChange={update('button_label')} max={80}/>
      <Field title="Дополнительная HTTPS-ссылка" value={model.extra_url||''} onChange={v=>setModel(p=>({...p,extra_url:v||null}))}/>
      <p className="text-xs text-textSecondary">Используйте только разрешённые рекламные предложения. Ссылки проходят проверку на сервере.</p>
    </Card>}
    {step===3&&<PublicPreview model={model}/>}
    {step===4&&<Card className="flex flex-col gap-3">
      <p className="text-sm">Сохраните профиль. Настоящий AI-чат пока недоступен.</p>
      <label className="text-xs text-textSecondary">Статус страницы<select value={model.status} onChange={e=>update('status')(e.target.value)} className={input}><option value="draft">Черновик</option><option value="published">Опубликована (без AI-чата)</option><option value="disabled">Отключена</option></select></label>
      <Button disabled={saving||!validBase||!validLinks} onClick={()=>void save()}>{saving?'Сохранение…':'Сохранить настройки'}</Button>
    </Card>}
    {!validBase&&<p role="status" className="text-xs text-textSecondary">Заполните имя (2+ символа) и адрес (3–40 символов, латиница, цифры, дефис).</p>}
    {!validLinks&&<p role="alert" className="text-xs text-error">Разрешены только корректные HTTPS-ссылки.</p>}
    {error&&<p role="alert" className="text-xs text-error">{error}</p>}
    <div className="flex gap-2"><Button variant="secondary" disabled={step===0} onClick={()=>setStep(Math.max(0,step-1))}>Назад</Button><Button disabled={step===4} onClick={()=>setStep(Math.min(4,step+1))}>Далее <ArrowRight size={15} className="ml-1"/></Button></div>
    {id&&<Card className="flex flex-col gap-3"><p className="text-sm font-bold">Публичная страница</p><button type="button" className="text-left text-xs text-accentBrightGold" onClick={()=>navigator.clipboard?.writeText(modelPageUrl(model.slug))}><Copy size={15} className="mr-2 inline"/>Копировать ссылку</button>{model.status==='published'&&<a target="_blank" rel="noopener noreferrer" href={modelPageUrl(model.slug)} className="text-xs text-accentBrightGold">Открыть публичную страницу →</a>}<p className="text-xs text-textSecondary">Тарифы и статистика появятся после подключения API. Цена не задана.</p></Card>}
  </Wrapper>;
};

export const PublicAIPage:React.FC<{slug:string}>=({slug})=>{
  const [model,setModel]=useState<PublicCharacter|null>(null),[error,setError]=useState('');
  useEffect(()=>{marketApi.publicModel(slug).then(setModel).catch(e=>setError(message(e)));},[slug]);
  return <div className="mx-auto min-h-screen max-w-xl bg-bgMain p-4 text-textPrimary"><h1 className="mb-4 text-xl font-bold">VVD CPA</h1>{model?<PublicPreview model={model}/>:<Card><p>{error||'Загрузка AI-профиля…'}</p></Card>}</div>;
};
