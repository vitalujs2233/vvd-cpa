import React,{useEffect,useMemo,useState} from 'react';
import {Link} from 'react-router-dom';
import {ArrowLeft,ChevronDown,ChevronUp,ExternalLink,Layers,Plus,Save,Trash2} from 'lucide-react';
import {directoryApi,directoryIconOptions,type DirectoryCategory,type DirectoryData,type DirectoryService} from '@/pages/tools/serviceDirectoryApi';

const field='w-full rounded-app-xs border border-white/15 bg-bgMain px-3 py-2.5 text-sm text-white outline-none focus:border-accentGold/60';
const makeId=(prefix:string)=>prefix+'-'+crypto.randomUUID().slice(0,12);
const newCategory=():DirectoryCategory=>({id:makeId('category'),name:'',description:'',icon:'grid',sort_order:100,active:true});
const newService=(categoryId:string):DirectoryService=>({id:makeId('service'),category_id:categoryId,name:'',description:'',benefits:'',image_url:'',website_url:'',discount_text:'',promo_code:'',partner_link:false,active:false,sort_order:100});

export const ServiceDirectoryAdmin:React.FC<{onBack:()=>void}>=({onBack})=>{
  const [data,setData]=useState<DirectoryData|null>(null);
  const [tab,setTab]=useState<'categories'|'services'>('categories');
  const [categoryForm,setCategoryForm]=useState<DirectoryCategory|null>(null);
  const [serviceForm,setServiceForm]=useState<DirectoryService|null>(null);
  const [dirty,setDirty]=useState(false);
  const [saving,setSaving]=useState(false);
  const [notice,setNotice]=useState('');
  const [error,setError]=useState('');
  useEffect(()=>{
    let live=true;
    directoryApi.admin().then(v=>{if(live){setData(v);setError('');}})
      .catch(()=>{if(live)setError('Не удалось загрузить каталог. Проверьте соединение и откройте раздел ещё раз.');});
    return()=>{live=false;};
  },[]);
  const categories=useMemo(()=>[...(data?.categories||[])].sort((a,b)=>a.sort_order-b.sort_order),[data]);
  const services=useMemo(()=>[...(data?.services||[])].sort((a,b)=>a.sort_order-b.sort_order),[data]);
  const modify=(fn:(d:DirectoryData)=>DirectoryData)=>{setData(d=>d?fn(d):d);setDirty(true);setNotice('');setError('');};

  const applyCategory=()=>{
    if(!categoryForm)return;
    if(!categoryForm.name.trim()){setError('Введите название категории.');return;}
    const item={...categoryForm,name:categoryForm.name.trim(),description:categoryForm.description.trim()};
    modify(d=>({...d,categories:d.categories.some(c=>c.id===item.id)?
      d.categories.map(c=>c.id===item.id?item:c):[...d.categories,item]}));
    setCategoryForm(null);
    setNotice('Категория добавлена в список. Теперь сохраните каталог.');
  };
  const applyService=()=>{
    if(!serviceForm)return;
    if(!serviceForm.name.trim()){setError('Введите название сервиса.');return;}
    if(!serviceForm.category_id){setError('Сначала создайте категорию.');return;}
    if(serviceForm.active&&!serviceForm.website_url.startsWith('https://')){setError('Для опубликованного сервиса нужна HTTPS-ссылка.');return;}
    if((serviceForm.image_url&&!serviceForm.image_url.startsWith('https://'))||
       (serviceForm.website_url&&!serviceForm.website_url.startsWith('https://'))){setError('В ссылках можно использовать только HTTPS.');return;}
    const item={...serviceForm,name:serviceForm.name.trim()};
    modify(d=>({...d,services:d.services.some(s=>s.id===item.id)?
      d.services.map(s=>s.id===item.id?item:s):[...d.services,item]}));
    setServiceForm(null);
    setNotice('Сервис добавлен в список. Теперь сохраните каталог.');
  };
  const save=async()=>{
    if(!data||saving)return;
    if(categoryForm||serviceForm){setError('Сначала нажмите «Применить» в открытом редакторе.');return;}
    setSaving(true);setError('');setNotice('');
    try{
      const res=await directoryApi.save(data);
      setData({...data,version:res.version});
      setDirty(false);
      setNotice('Каталог сохранён. Опубликованные категории и сервисы видны в Mini App.');
    }catch(e){
      setError(e instanceof Error?e.message:'Не удалось сохранить каталог. Проверьте ссылки и соединение.');
    }finally{setSaving(false);}
  };

  return <div className="flex flex-col gap-4 p-4 pb-32">
    <button type="button" className="flex items-center gap-2 text-sm font-semibold text-accentBrightGold" onClick={onBack}><ArrowLeft size={18}/> Админ-панель</button>
    <div className="flex items-start justify-between gap-3">
      <div><h1 className="text-xl font-bold text-white">Каталог сервисов</h1><p className="mt-1 text-xs leading-5 text-textSecondary">Категории, предложения и партнёрские ссылки</p></div>
      <Link to="/tools/directory" className="flex shrink-0 items-center gap-1 text-xs text-accentBrightGold"><ExternalLink size={14}/> Каталог</Link>
    </div>
    <div className="rounded-card border border-accentGold/20 bg-accentGold/[0.06] p-3 text-xs leading-5 text-textSecondary">
      Меняйте категории и предложения здесь. На сайте будут показаны только включённые категории и опубликованные сервисы. Партнёрские ссылки, промокоды и скидки добавляются вручную, без API.
    </div>
    {error&&<p role="alert" className="rounded-card border border-red-500/25 bg-red-500/[0.07] p-3 text-xs text-red-300">{error}</p>}
    {notice&&<p role="status" className="rounded-card border border-accentGold/20 p-3 text-xs text-accentBrightGold">{notice}</p>}
    <div className="grid grid-cols-2 gap-2">
      <button type="button" onClick={()=>{setTab('categories');setServiceForm(null);}} className={'rounded-app-xs border p-3 text-sm font-bold '+(tab==='categories'?'border-accentGold bg-accentGold/10 text-accentBrightGold':'border-white/15 bg-bgCard text-textSecondary')}>Категории ({categories.length})</button>
      <button type="button" onClick={()=>{setTab('services');setCategoryForm(null);}} className={'rounded-app-xs border p-3 text-sm font-bold '+(tab==='services'?'border-accentGold bg-accentGold/10 text-accentBrightGold':'border-white/15 bg-bgCard text-textSecondary')}>Сервисы ({services.length})</button>
    </div>
    {!data?<p className="text-xs text-textSecondary">Загружаем управление каталогом…</p>:<>

      {tab==='categories'&&<>
        <button type="button" onClick={()=>{setCategoryForm(newCategory());setError('');}} className="flex items-center justify-center gap-2 rounded-app-xs border border-accentGold/40 bg-accentGold/10 px-3 py-3 text-sm font-bold text-accentBrightGold"><Plus size={17}/> Добавить категорию</button>
        {categoryForm&&<div className="flex flex-col gap-3 rounded-card border border-accentGold/45 bg-bgCard p-4">
          <b className="text-sm text-white">Редактор категории</b>
          <label className="text-xs text-textSecondary">Название<input className={field} value={categoryForm.name} onChange={e=>setCategoryForm({...categoryForm,name:e.target.value})} placeholder="Например: Спай-сервисы" maxLength={100}/></label>
          <label className="text-xs text-textSecondary">Краткое описание<textarea className={field} value={categoryForm.description} onChange={e=>setCategoryForm({...categoryForm,description:e.target.value})} rows={2} maxLength={300}/></label>
          <div className="grid grid-cols-2 gap-3">
            <label className="text-xs text-textSecondary">Иконка<select className={field} value={categoryForm.icon} onChange={e=>setCategoryForm({...categoryForm,icon:e.target.value})}>{directoryIconOptions.map(o=><option key={o.id} value={o.id}>{o.label}</option>)}</select></label>
            <label className="text-xs text-textSecondary">Порядок<input type="number" className={field} value={categoryForm.sort_order} onChange={e=>setCategoryForm({...categoryForm,sort_order:Number(e.target.value)||0})}/></label>
          </div>
          <label className="flex items-center gap-2 text-xs text-white"><input type="checkbox" checked={categoryForm.active} onChange={e=>setCategoryForm({...categoryForm,active:e.target.checked})}/> Показывать категорию</label>
          <div className="flex gap-2">
            <button type="button" onClick={applyCategory} className="flex-1 rounded-app-xs bg-gold-gradient px-3 py-2.5 text-sm font-bold text-bgMain">Применить</button>
            <button type="button" onClick={()=>setCategoryForm(null)} className="rounded-app-xs border border-white/20 px-3 py-2.5 text-xs">Отмена</button>
          </div>
        </div>}
        {categories.map(c=><div key={c.id} className="rounded-card border border-accentGold/20 bg-bgCard p-3">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0"><b className="text-sm text-white">{c.name}</b><p className="mt-1 text-xs text-textSecondary">{c.description}</p><p className="mt-2 text-[11px] text-accentBrightGold">{data.services.filter(s=>s.category_id===c.id).length} сервисов · {c.active?'Виден':'Скрыт'}</p></div>
            <button type="button" className="rounded-app-xs border border-white/15 px-3 py-2 text-xs text-accentBrightGold" onClick={()=>{setCategoryForm({...c});setServiceForm(null);setError('');}}>Изменить</button>
          </div>
          <div className="mt-3 flex flex-wrap gap-3 border-t border-white/[0.06] pt-3">
            <button type="button" onClick={()=>modify(d=>({...d,categories:d.categories.map(x=>x.id===c.id?{...x,active:!x.active}:x)}))} className="text-xs text-textSecondary">{c.active?'Скрыть':'Показать'}</button>
            <button type="button" onClick={()=>modify(d=>({...d,categories:d.categories.map(x=>x.id===c.id?{...x,sort_order:x.sort_order-10}:x)}))} aria-label={'Поднять '+c.name}><ChevronUp size={16}/></button>
            <button type="button" onClick={()=>modify(d=>({...d,categories:d.categories.map(x=>x.id===c.id?{...x,sort_order:x.sort_order+10}:x)}))} aria-label={'Опустить '+c.name}><ChevronDown size={16}/></button>
            <button type="button" className="ml-auto text-xs text-red-300" onClick={()=>{
              const count=data.services.filter(s=>s.category_id===c.id).length;
              if(!window.confirm('Удалить категорию «'+c.name+'»'+(count?' и связанные с ней предложения ('+count+')':'')+'?'))return;
              modify(d=>({...d,categories:d.categories.filter(x=>x.id!==c.id),services:d.services.filter(s=>s.category_id!==c.id)}));
            }}><Trash2 size={14}/></button>
          </div>
        </div>)}
      </>}

      {tab==='services'&&<>
        <button type="button" disabled={!categories.length} onClick={()=>{setServiceForm(newService(categories[0]?.id||''));setError('');}} className="flex items-center justify-center gap-2 rounded-app-xs border border-accentGold/40 bg-accentGold/10 px-3 py-3 text-sm font-bold text-accentBrightGold disabled:opacity-40"><Plus size={17}/> Добавить сервис</button>
        {serviceForm&&<div className="flex flex-col gap-3 rounded-card border border-accentGold/45 bg-bgCard p-4">
          <b className="text-sm text-white">Редактор предложения</b>
          <label className="text-xs text-textSecondary">Категория<select className={field} value={serviceForm.category_id} onChange={e=>setServiceForm({...serviceForm,category_id:e.target.value})}>{categories.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
          <label className="text-xs text-textSecondary">Название сервиса<input className={field} value={serviceForm.name} onChange={e=>setServiceForm({...serviceForm,name:e.target.value})} maxLength={150}/></label>
          <label className="text-xs text-textSecondary">Краткое описание<textarea className={field} rows={3} value={serviceForm.description} onChange={e=>setServiceForm({...serviceForm,description:e.target.value})} maxLength={750}/></label>
          <label className="text-xs text-textSecondary">Преимущества (каждое с новой строки)<textarea className={field} rows={4} value={serviceForm.benefits} onChange={e=>setServiceForm({...serviceForm,benefits:e.target.value})} maxLength={2400}/></label>
          <label className="text-xs text-textSecondary">HTTPS-ссылка на логотип или картинку<input className={field} type="url" value={serviceForm.image_url} onChange={e=>setServiceForm({...serviceForm,image_url:e.target.value})} placeholder="https://..." maxLength={2048}/></label>
          {serviceForm.image_url.startsWith('https://')&&<img src={serviceForm.image_url} alt="Предпросмотр картинки" className="h-28 w-full rounded-card border border-white/10 object-contain"/>}
          <label className="text-xs text-textSecondary">Ссылка на сервис / партнёрская ссылка<input className={field} type="url" value={serviceForm.website_url} onChange={e=>setServiceForm({...serviceForm,website_url:e.target.value})} placeholder="https://..." maxLength={2048}/></label>
          <label className="text-xs text-textSecondary">Скидка или бонус (только подтверждённые)<input className={field} value={serviceForm.discount_text} onChange={e=>setServiceForm({...serviceForm,discount_text:e.target.value})} placeholder="Например: скидка 10% по промокоду" maxLength={300}/></label>
          <div className="grid grid-cols-2 gap-3">
            <label className="text-xs text-textSecondary">Промокод<input className={field} value={serviceForm.promo_code} onChange={e=>setServiceForm({...serviceForm,promo_code:e.target.value})} maxLength={100}/></label>
            <label className="text-xs text-textSecondary">Порядок<input className={field} type="number" value={serviceForm.sort_order} onChange={e=>setServiceForm({...serviceForm,sort_order:Number(e.target.value)||0})}/></label>
          </div>
          <label className="flex items-center gap-2 text-xs text-white"><input type="checkbox" checked={serviceForm.partner_link} onChange={e=>setServiceForm({...serviceForm,partner_link:e.target.checked})}/> Это партнёрская ссылка</label>
          <label className="flex items-center gap-2 text-xs text-white"><input type="checkbox" checked={serviceForm.active} onChange={e=>setServiceForm({...serviceForm,active:e.target.checked})}/> Опубликовать сервис в каталоге</label>
          <div className="flex gap-2">
            <button type="button" onClick={applyService} className="flex-1 rounded-app-xs bg-gold-gradient px-3 py-2.5 text-sm font-bold text-bgMain">Применить</button>
            <button type="button" onClick={()=>setServiceForm(null)} className="rounded-app-xs border border-white/20 px-3 py-2.5 text-xs">Отмена</button>
          </div>
        </div>}
        {services.length===0&&<p className="rounded-card border border-accentGold/15 bg-bgCard p-4 text-xs text-textSecondary">Пока нет сервисов. Нажмите «Добавить сервис», выберите категорию и заполните карточку.</p>}
        {services.map(s=><div key={s.id} className="rounded-card border border-accentGold/20 bg-bgCard p-3">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0"><b className="text-sm text-white">{s.name}</b><p className="mt-1 text-xs text-textSecondary">{data.categories.find(c=>c.id===s.category_id)?.name||'Без категории'}</p><p className="mt-2 text-[11px] text-accentBrightGold">{s.active?'Опубликован':'Скрыт'}</p></div>
            <button type="button" onClick={()=>{setServiceForm({...s});setCategoryForm(null);setError('');}} className="rounded-app-xs border border-white/15 px-3 py-2 text-xs text-accentBrightGold">Изменить</button>
          </div>
          <div className="mt-3 flex items-center gap-4 border-t border-white/[0.06] pt-3">
            <button type="button" onClick={()=>modify(d=>({...d,services:d.services.map(x=>x.id===s.id?{...x,active:!x.active}:x)}))} className="text-xs text-textSecondary">{s.active?'Скрыть':'Опубликовать'}</button>
            <button type="button" className="ml-auto text-xs text-red-300" onClick={()=>{if(window.confirm('Удалить предложение «'+s.name+'»?'))modify(d=>({...d,services:d.services.filter(x=>x.id!==s.id)}));}}><Trash2 size={14}/></button>
          </div>
        </div>)}
      </>}
      <div className="sticky bottom-2 z-20 rounded-card border border-accentGold/40 bg-[#16130c]/95 p-3 shadow-xl backdrop-blur">
        <button type="button" disabled={saving||!dirty} onClick={()=>void save()} className="flex w-full items-center justify-center gap-2 rounded-app-xs bg-gold-gradient px-3 py-3 text-sm font-bold text-bgMain disabled:opacity-50"><Save size={17}/>{saving?'Сохраняем…':dirty?'Сохранить изменения':'Все изменения сохранены'}</button>
        {dirty&&<p className="mt-2 text-center text-[11px] text-textSecondary">Изменения пока только в редакторе — нажмите «Сохранить изменения».</p>}
      </div>
    </>}
  </div>;
};
