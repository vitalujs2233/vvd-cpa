import {CopyButton} from '@/shared/ui/CopyButton';
import {readApiSnapshot} from '@/shared/lib/viewSnapshot';
import React,{useEffect,useState} from 'react';
import {Link,useNavigate,useParams} from 'react-router-dom';
import {ArrowLeft,Plus,Copy,Trash2,ExternalLink,Upload,Image as PhotoIcon} from 'lucide-react';
import {Card} from '@/shared/ui/Card';
import {Button} from '@/shared/ui/Button';
import {marketApi,modelPageUrl,type Character} from './marketApi';
import {aiApi,fileUrl,type Smartlink,type Photo,type ModelStats,type ConversationSettings} from './aiApi';

const defaultModel:Character={name:'',slug:'',description:'',language:'ru',persona:'',greeting:'Привет! Давай пообщаемся 😊',offer_description:'',knowledge:'',goal:'',restrictions:'',photo_url:null,affiliate_url:null,button_label:'Посмотреть предложение',extra_url:null,status:'draft'};
const field='mt-1 w-full rounded-app-xs border border-white/10 bg-bgCard px-3 py-3 text-sm text-textPrimary outline-none focus:border-accentGold/60';
const errorText=(e:unknown)=>{const msg=e instanceof Error?e.message:'Ошибка соединения';return /Invalid or expired Telegram initData|Telegram authorization expired/i.test(msg)?'Сессия Telegram устарела. Полностью закройте Mini App и заново откройте его из бота.':msg;};
const Shell:React.FC<{children:React.ReactNode}>=({children})=><main className="flex flex-col gap-4 p-4 pb-28 animate-fade-in">{children}</main>;
const Header:React.FC<{title:string}>=({title})=>{const nav=useNavigate();return <div className="flex items-center gap-3"><button type="button" onClick={()=>nav(-1)} aria-label="Назад" className="rounded-app-xs border border-white/10 p-2 text-accentBrightGold"><ArrowLeft size={19}/></button><h1 className="text-xl font-bold">{title}</h1></div>};
const Field:React.FC<{label:string;value:string;set:(value:string)=>void;long?:boolean;placeholder?:string}>=({label,value,set,long,placeholder})=><label className="text-xs font-semibold text-textSecondary">{label}{long?<textarea value={value} onChange={e=>set(e.target.value)} placeholder={placeholder} className={field+' min-h-[85px] resize-y'}/>:<input value={value} onChange={e=>set(e.target.value)} placeholder={placeholder} className={field}/>}</label>;
const stateName=(x:string)=>x==='published'?'Опубликован':x==='disabled'?'Отключён':'Черновик';

export const AIModelsPage:React.FC=()=>{
  const [models,setModels]=useState<Character[]>(()=>readApiSnapshot('/tools-market/ai')?.models||[]),[stats,setStats]=useState<Record<string,ModelStats>>(()=>Object.fromEntries((readApiSnapshot('/tools-market/ai')?.models||[]).map((m:any)=>[m.id,readApiSnapshot('/ai-studio/models/'+m.id+'/stats')||{}]))),[error,setError]=useState(''),[busy,setBusy]=useState(!readApiSnapshot('/tools-market/ai'));
  useEffect(()=>{marketApi.models().then(async r=>{
    setModels(r.models);
    const results=await Promise.allSettled(r.models.filter(m=>m.id).map(m=>aiApi.stats(m.id!)));
    const out:Record<string,ModelStats>={};r.models.filter(m=>m.id).forEach((m,i)=>{const x=results[i];if(x.status==='fulfilled')out[m.id!]=x.value;});setStats(out);
  }).catch(e=>setError(errorText(e))).finally(()=>setBusy(false));},[]);
  return <Shell><Header title="AI Модель"/>
    <p className="text-xs text-textSecondary">Создавайте виртуальных персонажей и управляйте их страницами переписки.</p>
    <Link to="/tools/ai/new" className="flex items-center justify-center gap-2 rounded-app-xs bg-gold-gradient px-4 py-3 text-sm font-bold text-bgMain"><Plus size={17}/> Создать персонажа</Link>
    <h2 className="font-bold">Мои персонажи</h2>
    {error&&<p role="alert" className="text-xs text-error">{error}</p>}
    {busy?<p className="text-sm text-textSecondary">Загружаем персонажей…</p>:models.length===0?<Card className="p-6 text-center text-sm text-textSecondary">У вас пока нет персонажей.</Card>:
      models.map(m=><Card key={m.id} className="flex flex-col gap-3">
        <div className="flex items-center gap-3">
          {m.photo_url?<img src={m.photo_url} className="h-12 w-12 rounded-full object-cover" alt=""/>:<div className="flex h-12 w-12 items-center justify-center rounded-full bg-accentGold/10 text-accentBrightGold"><PhotoIcon size={23}/></div>}
          <div className="flex-1"><h3 className="text-sm font-bold">{m.name}</h3><p className="text-xs text-textSecondary">{stateName(m.status)} · {m.slug}</p></div>
        </div>
        <div className="grid grid-cols-4 gap-1 text-center text-[11px] text-textSecondary">{[['Визиты',stats[m.id||'']?.visits],['Чаты',stats[m.id||'']?.conversations],['Ответы AI',stats[m.id||'']?.messages],['Клики',stats[m.id||'']?.clicks]].map(([label,val])=><div key={String(label)} className="rounded-app-xs bg-white/[0.03] p-2"><b className="block text-sm text-textPrimary">{val??'—'}</b>{label}</div>)}</div>
        <p className="text-[11px] text-textSecondary">Тариф: {m.affiliate_url?'Ссылка настроена':'Не выбран'} · Расходы AI (оценка): {stats[m.id||'']?.cost_usd==null?'—':('</p>
        <div className="flex gap-2"><Link className="flex-1 rounded-app-xs border border-accentGold/30 p-3 text-center text-xs text-accentBrightGold" to={'/tools/ai/'+m.id}>Редактировать</Link>
          {m.status==='published'&&<a className="flex-1 rounded-app-xs border border-white/10 p-3 text-center text-xs" href={modelPageUrl(m.slug)} target="_blank" rel="noopener noreferrer">Открыть чат</a>}
          <CopyButton type="button" aria-label="Скопировать ссылку" text={modelPageUrl(m.slug)} className="rounded-app-xs border border-white/10 p-3"><Copy size={15}/></CopyButton>
        </div>
      </Card>)}
  </Shell>;
};
export const AIEditor:React.FC=()=>{
  const {id}=useParams();const nav=useNavigate();
  const [model,setModel]=useState<Character>(()=>readApiSnapshot('/tools-market/ai/'+id)||{...defaultModel}),[links,setLinks]=useState<Smartlink[]>(()=>readApiSnapshot('/ai-studio/my-smartlinks')?.links||[]),[photos,setPhotos]=useState<Photo[]>(()=>readApiSnapshot('/ai-studio/models/'+id+'/photos')?.photos||[]);
  const [tab,setTab]=useState<'profile'|'chat'|'photos'|'link'>('profile'),[linkKind,setLinkKind]=useState<'smartlink'|'external'>('smartlink');
  const [settings,setSettings]=useState<ConversationSettings>(()=>readApiSnapshot('/ai-studio/models/'+id+'/settings')||{chat_style:'friendly',reply_length:'medium',photo_mode:'combined'});
  const [chosen,setChosen]=useState(''),[customStyle,setCustomStyle]=useState(false),[uploading,setUploading]=useState(false),[rightsConfirmed,setRightsConfirmed]=useState(false),[saving,setSaving]=useState(false);
  const [error,setError]=useState(''),[notice,setNotice]=useState('');
  const update=(key:keyof Character,value:string|null)=>setModel(m=>({...m,[key]:value}));
  useEffect(()=>{if(id){marketApi.model(id).then(setModel).catch(e=>setError(errorText(e)));
    aiApi.settings(id).then(s=>{setSettings(s);setLinkKind(s.link_kind==='smartlink'?'smartlink':'external');setChosen(s.smartlink_id||'');}).catch(()=>{});
    aiApi.photos(id).then(x=>setPhotos(x.photos)).catch(()=>{});}
    aiApi.links().then(x=>setLinks(x.links)).catch(()=>{});
  },[id]);
  const save=async()=>{
    setSaving(true);setError('');setNotice('');
    try{
      const oldId=model.id;const data=await marketApi.saveModel({...model,status:model.status});
      const realId=data.id!;
      setModel(data);
      await aiApi.saveSettings(realId,settings);
      if(oldId){setNotice('Сохранено');}
      else {setNotice('Персонаж создан. Теперь можно загрузить фотографии и выбрать ссылку.');nav('/tools/ai/'+realId,{replace:true});}
    }catch(e){setError(errorText(e));}finally{setSaving(false);}
  };
  const saveLink=async()=>{
    if(!id)return;
    setSaving(true);setError('');
    try{await aiApi.chooseLink(id,linkKind,linkKind==='smartlink'?chosen:null,linkKind==='external'?model.affiliate_url:null,model.button_label,0);
      setNotice('Партнёрская ссылка сохранена.');}
    catch(e){setError(errorText(e))}finally{setSaving(false)}
  };
  const upload=async(e:React.ChangeEvent<HTMLInputElement>,asAvatar=false)=>{
    const f=e.target.files?.[0];if(!f||!id)return;
    if(!rightsConfirmed){setError('Сначала подтвердите права на фотографию');return;}
    if(f.size>4_000_000||!['image/jpeg','image/png','image/webp'].includes(f.type)){setError('JPG, PNG или WebP до 4 МБ');return;}
    setUploading(true);setError('');
    try{const p=await aiApi.upload(id,f);setPhotos(old=>[...old,p]);
      if(asAvatar){const saved=await marketApi.saveModel({...model,photo_url:fileUrl(p.url)});setModel(saved);}
      setNotice(asAvatar?'Аватар сохранён.':'Изображение сохранено.');}
    catch(e){setError(errorText(e))}finally{setUploading(false);e.target.value='';}
  };
  const avatar=async(p:Photo|null)=>{
    const val=p?fileUrl(p.url):null;
    const changed={...model,photo_url:val};setSaving(true);
    try{const saved=await marketApi.saveModel(changed);setModel(saved);setNotice('Аватар обновлён.');}
    catch(e){setError(errorText(e))}finally{setSaving(false);}
  };
  const deletePhoto=async(p:Photo)=>{
    if(!window.confirm('Удалить эту фотографию?'))return;
    try{await aiApi.removePhoto(p.id);setPhotos(x=>x.filter(i=>i.id!==p.id));if(model.photo_url===fileUrl(p.url))await avatar(null);}
    catch(e){setError(errorText(e))}
  };
  const changePhoto=async(p:Photo,patch:Partial<Photo>)=>{
    const next={...p,...patch};setPhotos(items=>items.map(x=>x.id===p.id?next:x));
    try{await aiApi.updatePhoto(p.id,next)}catch(e){setError(errorText(e))}
  };
  const profileValid=model.name.trim().length>=2&&/^[a-z0-9][a-z0-9-]{2,39}$/.test(model.slug);
  return <Shell><Header title={id?'Настройки персонажа':'Новый персонаж'}/>
    <div className="grid grid-cols-4 gap-1">{([['profile','Профиль'],['chat','Общение'],['photos','Фото'],['link','Ссылка']] as const).map(([k,v])=><button type="button" key={k} onClick={()=>setTab(k)} className={'rounded-app-xs border py-2 text-[11px] '+(tab===k?'border-accentGold bg-accentGold/10 text-accentBrightGold':'border-white/10 text-textSecondary')}>{v}</button>)}</div>
    {tab==='profile'&&<Card className="flex flex-col gap-3">
      <Field label="Имя персонажа" value={model.name} set={v=>update('name',v)} placeholder="Марина"/>
      <Field label="Адрес страницы" value={model.slug} set={v=>update('slug',v.toLowerCase().replace(/[^a-z0-9-]/g,''))} placeholder="marina-123"/>
      <Field label="Описание (необязательно)" value={model.description} set={v=>update('description',v)} long/>
      <label className="text-xs text-textSecondary">Язык<select className={field} value={model.language} onChange={e=>update('language',e.target.value)}><option value="ru">Русский</option><option value="en">Английский</option><option value="de">Немецкий</option></select></label>
      <label className="flex items-center gap-2 text-xs text-textSecondary"><input type="checkbox" checked={rightsConfirmed} onChange={e=>setRightsConfirmed(e.target.checked)}/> Подтверждаю права на загружаемый аватар.</label>
      {id?<label className="flex cursor-pointer items-center justify-center gap-2 rounded-app-xs border border-accentGold/30 p-3 text-sm text-accentBrightGold"><Upload size={16}/> Загрузить аватар<input type="file" className="hidden" disabled={!rightsConfirmed||uploading} accept="image/jpeg,image/png,image/webp" onChange={e=>void upload(e,true)}/></label>:
        <p className="text-xs text-textSecondary">Сначала сохраните профиль, чтобы загрузить аватар.</p>}
      {model.photo_url&&<div className="flex items-center gap-3"><img src={fileUrl(photos.find(p=>model.photo_url===fileUrl(p.url))?.preview_url||model.photo_url)} alt="Аватар" className="h-16 w-16 rounded-full object-cover"/><button type="button" className="text-xs text-accentBrightGold" disabled={saving} aria-busy={saving} onClick={()=>void avatar(null)}>{saving?'Сохранение…':'Удалить аватар'}</button></div>}
    </Card>}
    {tab==='chat'&&<Card className="flex flex-col gap-3">
      <Field label="Первое сообщение" value={model.greeting} set={v=>update('greeting',v)} long/>
      <label className="text-xs text-textSecondary">Стиль общения<select className={field} value={customStyle?'custom':settings.chat_style} onChange={e=>{setCustomStyle(e.target.value==='custom');setSettings(s=>({...s,chat_style:e.target.value==='custom'?'':e.target.value}));}}>
        <option value="friendly">Дружелюбный</option><option value="light">Лёгкий и непринуждённый</option><option value="talkative">Общительный</option><option value="calm">Спокойный</option><option value="custom">Собственный стиль</option>
      </select></label>
      {customStyle&&<Field label="Свой стиль" value={settings.chat_style} set={v=>setSettings(s=>({...s,chat_style:v}))} long/>}
      <label className="text-xs text-textSecondary">Длина ответов<select className={field} value={settings.reply_length} onChange={e=>setSettings(s=>({...s,reply_length:e.target.value as ConversationSettings['reply_length']}))}>
        <option value="short">Короткие</option><option value="medium">Средние</option><option value="detailed">Подробные</option></select></label>
      <details className="rounded-app-xs border border-white/10 p-3 text-xs"><summary className="cursor-pointer font-semibold">Дополнительные настройки</summary>
        <div className="mt-3 flex flex-col gap-3"><Field label="Что персонажу важно знать" value={model.knowledge} set={v=>update('knowledge',v)} long/><Field label="Ограничения общения" value={model.restrictions} set={v=>update('restrictions',v)} long/></div>
      </details>
      <p className="text-xs text-textSecondary">Собеседник всегда обозначается как виртуальный. Ответы генерируются только при доступном AI-провайдере.</p>
    </Card>}
    {tab==='photos'&&<Card className="flex flex-col gap-3">
      {!id?<p className="text-xs text-textSecondary">Сначала сохраните профиль, затем загрузите фотографии.</p>:<>
        <label className="flex items-center gap-2 text-xs text-textSecondary"><input type="checkbox" checked={rightsConfirmed} onChange={e=>setRightsConfirmed(e.target.checked)}/> Подтверждаю, что имею право использовать эти изображения.</label>
        <label className="flex cursor-pointer items-center justify-center gap-2 rounded-app-xs border border-accentGold/30 p-3 text-sm text-accentBrightGold"><Upload size={17}/>{uploading?'Загрузка…':'Загрузить фотографию'}<input disabled={!rightsConfirmed||uploading||photos.length>=12} className="hidden" type="file" accept="image/jpeg,image/png,image/webp" onChange={e=>void upload(e)}/></label>
        <p className="text-xs text-textSecondary">До 12 файлов, JPG/PNG/WebP, максимум 4 МБ. Используйте изображения, на которые у вас есть права.</p>
        <label className="text-xs text-textSecondary">Режим отправки<select className={field} value={settings.photo_mode} onChange={e=>setSettings(s=>({...s,photo_mode:e.target.value as ConversationSettings['photo_mode']}))}>
          <option value="combined">Комбинированный</option><option value="automatic">Автоматический</option><option value="rules">По правилам</option>
        </select></label>
        {photos.map(p=><div className="space-y-2 rounded-app-xs border border-white/10 p-3" key={p.id}>
          <div className="flex items-center gap-3"><img src={fileUrl(p.preview_url||p.url)} alt={p.title||'Фото'} className="h-16 w-16 rounded-app-xs object-cover"/><div className="flex-1 space-y-2">
            <button type="button" className="text-xs text-accentBrightGold" disabled={saving} aria-busy={saving} onClick={()=>void avatar(p)}>{saving?'Сохранение…':'Сделать аватаром'}</button>
            <button type="button" className="ml-3 text-xs text-textSecondary" onClick={()=>void deletePhoto(p)}><Trash2 size={14} className="inline"/> Удалить</button>
          </div></div>
          <input className={field} aria-label="Название фото" placeholder="Название" value={p.title} onChange={e=>void changePhoto(p,{title:e.target.value})}/>
          <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={p.auto_allowed} onChange={e=>void changePhoto(p,{auto_allowed:e.target.checked})}/> Разрешить автоматическую отправку</label>
          <input className={field} placeholder="Когда разрешено отправлять" value={p.send_rule} onChange={e=>void changePhoto(p,{send_rule:e.target.value})}/>
        </div>)}
        <p className="text-xs text-textSecondary">Серверные правила для автоматической отправки фото ещё не активированы: фотографии пока не отправляются собеседникам автоматически.</p>
      </>}
    </Card>}
    {tab==='link'&&<Card className="flex flex-col gap-4">
      <h2 className="text-sm font-bold">Куда направлять посетителей?</h2>
      <label className="flex gap-2 text-sm"><input type="radio" checked={linkKind==='smartlink'} onChange={()=>setLinkKind('smartlink')}/> Мой смартлинк VVD CPA</label>
      <label className="flex gap-2 text-sm"><input type="radio" checked={linkKind==='external'} onChange={()=>setLinkKind('external')}/> Сторонняя ссылка</label>
      {linkKind==='smartlink'?<label className="text-xs text-textSecondary">Выбрать мой смартлинк<select className={field} value={chosen} onChange={e=>setChosen(e.target.value)}>
        <option value="">Выберите ссылку</option>{links.map(l=><option key={l.id} value={l.id}>{l.title} — {l.url}</option>)}
      </select><p className="mt-2">В рамках установленных лимитов бесплатно. При отсутствии смартлинков создайте его в разделе «Офферы».</p></label>:
        <><Field label="Сторонняя HTTPS-ссылка" value={model.affiliate_url||''} set={v=>update('affiliate_url',v||null)} placeholder="https://example.com"/>
          <p className="text-xs text-textSecondary">Платный тариф. До подключения расчёта стоимости и списания USD генерация ответов для сторонних ссылок не активируется.</p></>}
      <Field label="Текст кнопки в чате" value={model.button_label} set={v=>update('button_label',v)}/>
      <Button isLoading={saving} disabled={!id||saving||(linkKind==='smartlink'?!chosen:!model.affiliate_url?.startsWith('https://'))} onClick={()=>void saveLink()}>Сохранить ссылку</Button>
    </Card>}
    {!profileValid&&<p className="text-xs text-textSecondary">Укажите имя от 2 символов и адрес от 3 до 40 символов латиницей, цифрами и дефисами.</p>}
    {error&&<p role="alert" className="text-xs text-error">{error}</p>}
    {notice&&<p role="status" className="text-xs text-accentBrightGold">{notice}</p>}
    <Button isLoading={saving} disabled={!profileValid||saving} onClick={()=>void save()}>{saving?'Сохраняем…':id?'Сохранить изменения':'Создать персонажа'}</Button>
    {id&&<Card className="flex flex-col gap-3">
      <label className="text-xs text-textSecondary">Публикация<select className={field} value={model.status} onChange={e=>update('status',e.target.value)}>
        <option value="draft">Черновик</option><option value="published">Опубликован</option><option value="disabled">Отключён</option>
      </select></label>
      <p className="text-xs text-textSecondary">После выбора статуса нажмите «Сохранить изменения». Публичная страница не требует входа в Telegram.</p>
      {model.status==='published'&&<a target="_blank" rel="noopener noreferrer" className="text-xs text-accentBrightGold" href={modelPageUrl(model.slug)}>Открыть публичный чат <ExternalLink size={14} className="inline"/></a>}
      <CopyButton type="button" text={modelPageUrl(model.slug)} className="text-left text-xs text-accentBrightGold"><Copy size={14} className="inline"/> Скопировать ссылку</CopyButton>
    </Card>}
    {id&&<button type="button" className="rounded-app-xs border border-red-500/30 p-3 text-sm text-red-300" onClick={async()=>{
      if(!window.confirm('Удалить персонажа, все чаты и фотографии без возможности восстановления?'))return;
      try{await aiApi.deleteModel(id);nav('/tools/ai',{replace:true});}catch(e){setError(errorText(e));}
    }}>Удалить персонажа</button>}
  </Shell>;
};
+Number(stats[m.id||'']?.cost_usd).toFixed(6))}</p>
        <div className="flex gap-2"><Link className="flex-1 rounded-app-xs border border-accentGold/30 p-3 text-center text-xs text-accentBrightGold" to={'/tools/ai/'+m.id}>Редактировать</Link>
          {m.status==='published'&&<a className="flex-1 rounded-app-xs border border-white/10 p-3 text-center text-xs" href={modelPageUrl(m.slug)} target="_blank" rel="noopener noreferrer">Открыть чат</a>}
          <CopyButton type="button" aria-label="Скопировать ссылку" text={modelPageUrl(m.slug)} className="rounded-app-xs border border-white/10 p-3"><Copy size={15}/></CopyButton>
        </div>
      </Card>)}
  </Shell>;
};
export const AIEditor:React.FC=()=>{
  const {id}=useParams();const nav=useNavigate();
  const [model,setModel]=useState<Character>(()=>readApiSnapshot('/tools-market/ai/'+id)||{...defaultModel}),[links,setLinks]=useState<Smartlink[]>(()=>readApiSnapshot('/ai-studio/my-smartlinks')?.links||[]),[photos,setPhotos]=useState<Photo[]>(()=>readApiSnapshot('/ai-studio/models/'+id+'/photos')?.photos||[]);
  const [tab,setTab]=useState<'profile'|'chat'|'photos'|'link'>('profile'),[linkKind,setLinkKind]=useState<'smartlink'|'external'>('smartlink');
  const [settings,setSettings]=useState<ConversationSettings>(()=>readApiSnapshot('/ai-studio/models/'+id+'/settings')||{chat_style:'friendly',reply_length:'medium',photo_mode:'combined'});
  const [chosen,setChosen]=useState(''),[customStyle,setCustomStyle]=useState(false),[uploading,setUploading]=useState(false),[rightsConfirmed,setRightsConfirmed]=useState(false),[saving,setSaving]=useState(false);
  const [error,setError]=useState(''),[notice,setNotice]=useState('');
  const update=(key:keyof Character,value:string|null)=>setModel(m=>({...m,[key]:value}));
  useEffect(()=>{if(id){marketApi.model(id).then(setModel).catch(e=>setError(errorText(e)));
    aiApi.settings(id).then(s=>{setSettings(s);setLinkKind(s.link_kind==='smartlink'?'smartlink':'external');setChosen(s.smartlink_id||'');}).catch(()=>{});
    aiApi.photos(id).then(x=>setPhotos(x.photos)).catch(()=>{});}
    aiApi.links().then(x=>setLinks(x.links)).catch(()=>{});
  },[id]);
  const save=async()=>{
    setSaving(true);setError('');setNotice('');
    try{
      const oldId=model.id;const data=await marketApi.saveModel({...model,status:model.status});
      const realId=data.id!;
      setModel(data);
      await aiApi.saveSettings(realId,settings);
      if(oldId){setNotice('Сохранено');}
      else {setNotice('Персонаж создан. Теперь можно загрузить фотографии и выбрать ссылку.');nav('/tools/ai/'+realId,{replace:true});}
    }catch(e){setError(errorText(e));}finally{setSaving(false);}
  };
  const saveLink=async()=>{
    if(!id)return;
    setSaving(true);setError('');
    try{await aiApi.chooseLink(id,linkKind,linkKind==='smartlink'?chosen:null,linkKind==='external'?model.affiliate_url:null,model.button_label,0);
      setNotice('Партнёрская ссылка сохранена.');}
    catch(e){setError(errorText(e))}finally{setSaving(false)}
  };
  const upload=async(e:React.ChangeEvent<HTMLInputElement>,asAvatar=false)=>{
    const f=e.target.files?.[0];if(!f||!id)return;
    if(!rightsConfirmed){setError('Сначала подтвердите права на фотографию');return;}
    if(f.size>4_000_000||!['image/jpeg','image/png','image/webp'].includes(f.type)){setError('JPG, PNG или WebP до 4 МБ');return;}
    setUploading(true);setError('');
    try{const p=await aiApi.upload(id,f);setPhotos(old=>[...old,p]);
      if(asAvatar){const saved=await marketApi.saveModel({...model,photo_url:fileUrl(p.url)});setModel(saved);}
      setNotice(asAvatar?'Аватар сохранён.':'Изображение сохранено.');}
    catch(e){setError(errorText(e))}finally{setUploading(false);e.target.value='';}
  };
  const avatar=async(p:Photo|null)=>{
    const val=p?fileUrl(p.url):null;
    const changed={...model,photo_url:val};setSaving(true);
    try{const saved=await marketApi.saveModel(changed);setModel(saved);setNotice('Аватар обновлён.');}
    catch(e){setError(errorText(e))}finally{setSaving(false);}
  };
  const deletePhoto=async(p:Photo)=>{
    if(!window.confirm('Удалить эту фотографию?'))return;
    try{await aiApi.removePhoto(p.id);setPhotos(x=>x.filter(i=>i.id!==p.id));if(model.photo_url===fileUrl(p.url))await avatar(null);}
    catch(e){setError(errorText(e))}
  };
  const changePhoto=async(p:Photo,patch:Partial<Photo>)=>{
    const next={...p,...patch};setPhotos(items=>items.map(x=>x.id===p.id?next:x));
    try{await aiApi.updatePhoto(p.id,next)}catch(e){setError(errorText(e))}
  };
  const profileValid=model.name.trim().length>=2&&/^[a-z0-9][a-z0-9-]{2,39}$/.test(model.slug);
  return <Shell><Header title={id?'Настройки персонажа':'Новый персонаж'}/>
    <div className="grid grid-cols-4 gap-1">{([['profile','Профиль'],['chat','Общение'],['photos','Фото'],['link','Ссылка']] as const).map(([k,v])=><button type="button" key={k} onClick={()=>setTab(k)} className={'rounded-app-xs border py-2 text-[11px] '+(tab===k?'border-accentGold bg-accentGold/10 text-accentBrightGold':'border-white/10 text-textSecondary')}>{v}</button>)}</div>
    {tab==='profile'&&<Card className="flex flex-col gap-3">
      <Field label="Имя персонажа" value={model.name} set={v=>update('name',v)} placeholder="Марина"/>
      <Field label="Адрес страницы" value={model.slug} set={v=>update('slug',v.toLowerCase().replace(/[^a-z0-9-]/g,''))} placeholder="marina-123"/>
      <Field label="Описание (необязательно)" value={model.description} set={v=>update('description',v)} long/>
      <label className="text-xs text-textSecondary">Язык<select className={field} value={model.language} onChange={e=>update('language',e.target.value)}><option value="ru">Русский</option><option value="en">Английский</option><option value="de">Немецкий</option></select></label>
      <label className="flex items-center gap-2 text-xs text-textSecondary"><input type="checkbox" checked={rightsConfirmed} onChange={e=>setRightsConfirmed(e.target.checked)}/> Подтверждаю права на загружаемый аватар.</label>
      {id?<label className="flex cursor-pointer items-center justify-center gap-2 rounded-app-xs border border-accentGold/30 p-3 text-sm text-accentBrightGold"><Upload size={16}/> Загрузить аватар<input type="file" className="hidden" disabled={!rightsConfirmed||uploading} accept="image/jpeg,image/png,image/webp" onChange={e=>void upload(e,true)}/></label>:
        <p className="text-xs text-textSecondary">Сначала сохраните профиль, чтобы загрузить аватар.</p>}
      {model.photo_url&&<div className="flex items-center gap-3"><img src={fileUrl(photos.find(p=>model.photo_url===fileUrl(p.url))?.preview_url||model.photo_url)} alt="Аватар" className="h-16 w-16 rounded-full object-cover"/><button type="button" className="text-xs text-accentBrightGold" disabled={saving} aria-busy={saving} onClick={()=>void avatar(null)}>{saving?'Сохранение…':'Удалить аватар'}</button></div>}
    </Card>}
    {tab==='chat'&&<Card className="flex flex-col gap-3">
      <Field label="Первое сообщение" value={model.greeting} set={v=>update('greeting',v)} long/>
      <label className="text-xs text-textSecondary">Стиль общения<select className={field} value={customStyle?'custom':settings.chat_style} onChange={e=>{setCustomStyle(e.target.value==='custom');setSettings(s=>({...s,chat_style:e.target.value==='custom'?'':e.target.value}));}}>
        <option value="friendly">Дружелюбный</option><option value="light">Лёгкий и непринуждённый</option><option value="talkative">Общительный</option><option value="calm">Спокойный</option><option value="custom">Собственный стиль</option>
      </select></label>
      {customStyle&&<Field label="Свой стиль" value={settings.chat_style} set={v=>setSettings(s=>({...s,chat_style:v}))} long/>}
      <label className="text-xs text-textSecondary">Длина ответов<select className={field} value={settings.reply_length} onChange={e=>setSettings(s=>({...s,reply_length:e.target.value as ConversationSettings['reply_length']}))}>
        <option value="short">Короткие</option><option value="medium">Средние</option><option value="detailed">Подробные</option></select></label>
      <details className="rounded-app-xs border border-white/10 p-3 text-xs"><summary className="cursor-pointer font-semibold">Дополнительные настройки</summary>
        <div className="mt-3 flex flex-col gap-3"><Field label="Что персонажу важно знать" value={model.knowledge} set={v=>update('knowledge',v)} long/><Field label="Ограничения общения" value={model.restrictions} set={v=>update('restrictions',v)} long/></div>
      </details>
      <p className="text-xs text-textSecondary">Собеседник всегда обозначается как виртуальный. Ответы генерируются только при доступном AI-провайдере.</p>
    </Card>}
    {tab==='photos'&&<Card className="flex flex-col gap-3">
      {!id?<p className="text-xs text-textSecondary">Сначала сохраните профиль, затем загрузите фотографии.</p>:<>
        <label className="flex items-center gap-2 text-xs text-textSecondary"><input type="checkbox" checked={rightsConfirmed} onChange={e=>setRightsConfirmed(e.target.checked)}/> Подтверждаю, что имею право использовать эти изображения.</label>
        <label className="flex cursor-pointer items-center justify-center gap-2 rounded-app-xs border border-accentGold/30 p-3 text-sm text-accentBrightGold"><Upload size={17}/>{uploading?'Загрузка…':'Загрузить фотографию'}<input disabled={!rightsConfirmed||uploading||photos.length>=12} className="hidden" type="file" accept="image/jpeg,image/png,image/webp" onChange={e=>void upload(e)}/></label>
        <p className="text-xs text-textSecondary">До 12 файлов, JPG/PNG/WebP, максимум 4 МБ. Используйте изображения, на которые у вас есть права.</p>
        <label className="text-xs text-textSecondary">Режим отправки<select className={field} value={settings.photo_mode} onChange={e=>setSettings(s=>({...s,photo_mode:e.target.value as ConversationSettings['photo_mode']}))}>
          <option value="combined">Комбинированный</option><option value="automatic">Автоматический</option><option value="rules">По правилам</option>
        </select></label>
        {photos.map(p=><div className="space-y-2 rounded-app-xs border border-white/10 p-3" key={p.id}>
          <div className="flex items-center gap-3"><img src={fileUrl(p.preview_url||p.url)} alt={p.title||'Фото'} className="h-16 w-16 rounded-app-xs object-cover"/><div className="flex-1 space-y-2">
            <button type="button" className="text-xs text-accentBrightGold" disabled={saving} aria-busy={saving} onClick={()=>void avatar(p)}>{saving?'Сохранение…':'Сделать аватаром'}</button>
            <button type="button" className="ml-3 text-xs text-textSecondary" onClick={()=>void deletePhoto(p)}><Trash2 size={14} className="inline"/> Удалить</button>
          </div></div>
          <input className={field} aria-label="Название фото" placeholder="Название" value={p.title} onChange={e=>void changePhoto(p,{title:e.target.value})}/>
          <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={p.auto_allowed} onChange={e=>void changePhoto(p,{auto_allowed:e.target.checked})}/> Разрешить автоматическую отправку</label>
          <input className={field} placeholder="Когда разрешено отправлять" value={p.send_rule} onChange={e=>void changePhoto(p,{send_rule:e.target.value})}/>
        </div>)}
        <p className="text-xs text-textSecondary">Серверные правила для автоматической отправки фото ещё не активированы: фотографии пока не отправляются собеседникам автоматически.</p>
      </>}
    </Card>}
    {tab==='link'&&<Card className="flex flex-col gap-4">
      <h2 className="text-sm font-bold">Куда направлять посетителей?</h2>
      <label className="flex gap-2 text-sm"><input type="radio" checked={linkKind==='smartlink'} onChange={()=>setLinkKind('smartlink')}/> Мой смартлинк VVD CPA</label>
      <label className="flex gap-2 text-sm"><input type="radio" checked={linkKind==='external'} onChange={()=>setLinkKind('external')}/> Сторонняя ссылка</label>
      {linkKind==='smartlink'?<label className="text-xs text-textSecondary">Выбрать мой смартлинк<select className={field} value={chosen} onChange={e=>setChosen(e.target.value)}>
        <option value="">Выберите ссылку</option>{links.map(l=><option key={l.id} value={l.id}>{l.title} — {l.url}</option>)}
      </select><p className="mt-2">В рамках установленных лимитов бесплатно. При отсутствии смартлинков создайте его в разделе «Офферы».</p></label>:
        <><Field label="Сторонняя HTTPS-ссылка" value={model.affiliate_url||''} set={v=>update('affiliate_url',v||null)} placeholder="https://example.com"/>
          <p className="text-xs text-textSecondary">Платный тариф. До подключения расчёта стоимости и списания USD генерация ответов для сторонних ссылок не активируется.</p></>}
      <Field label="Текст кнопки в чате" value={model.button_label} set={v=>update('button_label',v)}/>
      <Button isLoading={saving} disabled={!id||saving||(linkKind==='smartlink'?!chosen:!model.affiliate_url?.startsWith('https://'))} onClick={()=>void saveLink()}>Сохранить ссылку</Button>
    </Card>}
    {!profileValid&&<p className="text-xs text-textSecondary">Укажите имя от 2 символов и адрес от 3 до 40 символов латиницей, цифрами и дефисами.</p>}
    {error&&<p role="alert" className="text-xs text-error">{error}</p>}
    {notice&&<p role="status" className="text-xs text-accentBrightGold">{notice}</p>}
    <Button isLoading={saving} disabled={!profileValid||saving} onClick={()=>void save()}>{saving?'Сохраняем…':id?'Сохранить изменения':'Создать персонажа'}</Button>
    {id&&<Card className="flex flex-col gap-3">
      <label className="text-xs text-textSecondary">Публикация<select className={field} value={model.status} onChange={e=>update('status',e.target.value)}>
        <option value="draft">Черновик</option><option value="published">Опубликован</option><option value="disabled">Отключён</option>
      </select></label>
      <p className="text-xs text-textSecondary">После выбора статуса нажмите «Сохранить изменения». Публичная страница не требует входа в Telegram.</p>
      {model.status==='published'&&<a target="_blank" rel="noopener noreferrer" className="text-xs text-accentBrightGold" href={modelPageUrl(model.slug)}>Открыть публичный чат <ExternalLink size={14} className="inline"/></a>}
      <CopyButton type="button" text={modelPageUrl(model.slug)} className="text-left text-xs text-accentBrightGold"><Copy size={14} className="inline"/> Скопировать ссылку</CopyButton>
    </Card>}
    {id&&<button type="button" className="rounded-app-xs border border-red-500/30 p-3 text-sm text-red-300" onClick={async()=>{
      if(!window.confirm('Удалить персонажа, все чаты и фотографии без возможности восстановления?'))return;
      try{await aiApi.deleteModel(id);nav('/tools/ai',{replace:true});}catch(e){setError(errorText(e));}
    }}>Удалить персонажа</button>}
  </Shell>;
};
