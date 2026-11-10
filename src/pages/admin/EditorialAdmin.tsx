import React,{useEffect,useState} from 'react';
import {ArrowLeft,ArrowDown,ArrowUp,ExternalLink,Eye,ImagePlus,Plus,Save,Trash2} from 'lucide-react';
import {editorialApi,type Article,type ArticleBlock,type EditorialCategory,type EditorialData} from '@/pages/public/editorialApi';

const input='w-full rounded-app-xs border border-white/15 bg-bgMain px-3 py-2.5 text-sm text-white outline-none focus:border-accentGold';
const slugify=(value:string)=>value.toLowerCase().trim().replace(/[^a-z0-9-]+/g,'-').replace(/^-+|-+$/g,'').slice(0,90);
const newId=()=>crypto.randomUUID().replace(/-/g,'').slice(0,16);
const emptyCategory=():EditorialCategory=>({id:'category-'+newId(),name:'',description:'',image_url:'',sort_order:100,active:true,show_on_web:true,show_in_mini_app:true});
const emptyArticle=(categoryId:string):Article=>({slug:'article-'+newId(),title:'',category_id:categoryId,excerpt:'',cover_url:'',seo_title:'',seo_description:'',tags:[],blocks:[],published:false,show_on_web:true,show_in_mini_app:true,published_at:'',updated_at:''});
const emptyBlock=(type:ArticleBlock['type']):ArticleBlock=>({type,text:'',url:'',alt:''});
const blockName:Record<ArticleBlock['type'],string>={paragraph:'Абзац',heading:'Заголовок',image:'Изображение',link:'Ссылка',quote:'Цитата'};

export const EditorialAdmin:React.FC<{onBack:()=>void}>=({onBack})=>{
  const [data,setData]=useState<EditorialData|null>(null);
  const [category,setCategory]=useState<EditorialCategory|null>(null);
  const [article,setArticle]=useState<Article|null>(null);
  const [editingSlug,setEditingSlug]=useState<string|null>(null);
  const [categoryDirty,setCategoryDirty]=useState(false);
  const [articleDirty,setArticleDirty]=useState(false);
  const [saving,setSaving]=useState(false);
  const [uploading,setUploading]=useState(false);
  const [categoryUploading,setCategoryUploading]=useState(false);
  const [error,setError]=useState('');
  const [message,setMessage]=useState('');
  const [refresh,setRefresh]=useState(0);
  useEffect(()=>{let live=true;editorialApi.admin().then(result=>{if(live)setData(result)}).catch(e=>{if(live)setError('Не удалось открыть редактор: '+String(e))});return()=>{live=false};},[refresh]);
  const updateArticle=(change:Partial<Article>)=>{setArticle(a=>a?{...a,...change}:a);setArticleDirty(true);};
  const updateBlock=(index:number,change:Partial<ArticleBlock>)=>{
    if(!article)return;
    updateArticle({blocks:article.blocks.map((b,i)=>i===index?{...b,...change}:b)});
  };
  const applyCategory=()=>{
    if(!data||!category?.name.trim())return setError('Введите название категории.');
    if(categoryUploading)return setError('Дождитесь окончания загрузки изображения.');
    setData({...data,categories:[...data.categories.filter(c=>c.id!==category.id),{...category,name:category.name.trim()}]});
    setCategory(null);setCategoryDirty(true);setMessage('Категория добавлена в список. Сохраните изменения.');setError('');
  };
  const applyArticle=()=>{
    if(!data||!article?.title.trim())return setError('Введите заголовок статьи.');
    if(!article.category_id)return setError('Выберите категорию.');
    if(!/^[a-z0-9][a-z0-9-]*$/.test(article.slug))return setError('Адрес статьи: только латинские буквы, цифры и дефисы.');
    if(article.published&&article.show_on_web===false&&article.show_in_mini_app===false)return setError('Выберите хотя бы одно место публикации.');
    if(article.published&&!article.blocks.some(b=>b.text.trim()||b.url))return setError('Добавьте содержание статьи перед публикацией.');
    if(data.articles.some(a=>a.slug===article.slug&&a.slug!==editingSlug))return setError('Такой адрес статьи уже занят.');
    const other=data.articles.filter(a=>a.slug!==(editingSlug||article.slug));
    const now=new Date().toISOString();
    const saved={...article,updated_at:now,published_at:article.published?(article.published_at||now):article.published_at};
    setData({...data,articles:[...other,saved]});
    setArticle(null);setEditingSlug(null);setArticleDirty(true);setError('');setMessage('Материал добавлен в список. Нажмите «Сохранить изменения».');
  };
  const save=async()=>{
    if(!data||saving||uploading||categoryUploading)return;
    if(article||category)return setError('Сначала нажмите «Применить» в редакторе.');
    setSaving(true);setMessage('');setError('');
    try{
      const result=await editorialApi.save(data);
      setData({...data,version:result.version});setArticleDirty(false);setCategoryDirty(false);
      setMessage('Сохранено! Опубликованные материалы доступны на выбранных площадках: сайте и/или Telegram Mini App.');
    }catch(e){setError(e instanceof Error?e.message:'Ошибка сохранения');}
    finally{setSaving(false)}
  };
  const uploadCategoryImage=async(file:File|null)=>{
    if(!file||!category||categoryUploading)return;
    if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>5*1024*1024){
      setError('Выберите JPG, PNG или WebP до 5 МБ.');return;
    }
    const id=category.id;
    setCategoryUploading(true);setError('');setMessage('');
    try{
      const url=await editorialApi.upload('category-'+newId(),file);
      setCategory(current=>current?.id===id?{...current,image_url:url}:current);
      setMessage('Фото категории загружено. Нажмите «Применить», затем «Сохранить».');
    }catch(e){
      setError('Не удалось загрузить фото категории: '+String(e));
    }finally{setCategoryUploading(false);}
  };
  const upload=async(file:File|null,mode:'cover'|'block',index=0)=>{
    if(!file||!article||uploading)return;
    if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>5*1024*1024){setError('Допустимы JPG, PNG и WebP до 5 МБ.');return;}
    setUploading(true);setError('');
    try{
      const url=await editorialApi.upload('article-'+newId(),file);
      if(mode==='cover')updateArticle({cover_url:url});else updateBlock(index,{url});
      setMessage('Изображение загружено. Не забудьте применить статью и сохранить изменения.');
    }catch(e){setError('Ошибка загрузки изображения: '+String(e));}finally{setUploading(false);}
  };
  if(!data)return <div className="p-4 text-textSecondary">{error||'Загружаем редактор…'} <button onClick={()=>setRefresh(v=>v+1)} className="text-accentBrightGold">Повторить</button></div>;
  return <div className="flex flex-col gap-4 p-4 pb-32">
    <button onClick={onBack} className="flex gap-2 items-center text-accentBrightGold text-sm"><ArrowLeft size={18}/> Админ-панель</button>
    <div><h1 className="text-xl font-bold text-white">Статьи и кейсы</h1><p className="text-xs text-textSecondary mt-1">Категории, редактор публикаций и SEO</p></div>
    {error&&<p role="alert" className="rounded-lg border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-300">{error}</p>}
    {message&&<p role="status" className="rounded-lg border border-accentGold/30 p-3 text-sm text-accentBrightGold">{message}</p>}
    <div className="flex gap-2"><a href="https://vitalujs2233.github.io/vvd-cpa/?page=articles" target="_blank" rel="noopener noreferrer" className="text-xs text-accentBrightGold flex gap-1 items-center"><ExternalLink size={14}/> Посмотреть статьи на сайте</a></div>
    <div className="rounded-card border border-accentGold/25 bg-bgCard p-3 flex items-center justify-between gap-2">
      <div><b className="text-sm text-white">Изменения</b><p className="text-xs text-textSecondary">{articleDirty||categoryDirty?'Есть несохранённые изменения':'Всё сохранено'}</p></div>
      <button disabled={saving||uploading||categoryUploading} onClick={()=>void save()} className="rounded-lg bg-accentGold px-4 py-2 text-sm font-bold text-black flex gap-2"><Save size={16}/>{saving?'Сохраняем…':'Сохранить'}</button>
    </div>
    <section className="rounded-card border border-white/10 bg-bgCard p-3 space-y-3">
      <div className="flex justify-between items-center"><h2 className="font-bold text-white">Категории ({data.categories.length})</h2><button className="text-accentBrightGold text-xs flex gap-1" onClick={()=>{setCategory(emptyCategory());setArticle(null)}}><Plus size={15}/> Добавить</button></div>
      {data.categories.map(c=><div key={c.id} className="flex items-center justify-between gap-2 border-t border-white/10 pt-2"><span className="flex min-w-0 items-center gap-3 text-sm text-white">
          {c.image_url?<img src={c.image_url} alt="" className="h-12 w-16 shrink-0 rounded-lg object-cover border border-accentGold/20"/>:<span className="h-12 w-16 shrink-0 rounded-lg border border-accentGold/20 bg-black/40 flex items-center justify-center"><ImagePlus size={18} className="text-accentBrightGold"/></span>}
          <span className="truncate">{c.name} {!c.active&&<small className="text-textSecondary"> (скрыта)</small>}</span>
        </span><div className="flex gap-2"><button className="text-accentBrightGold text-xs" onClick={()=>{setCategory({...c});setArticle(null)}}>Изменить</button><button aria-label="Удалить категорию" className="text-red-300" onClick={()=>{
        if(data.articles.some(a=>a.category_id===c.id)){setError('Сначала перенесите или удалите статьи этой категории.');return}
        if(window.confirm('Удалить категорию?')){setData({...data,categories:data.categories.filter(x=>x.id!==c.id)});setCategoryDirty(true);}
      }}><Trash2 size={16}/></button></div></div>)}
      {category&&<div className="space-y-2 rounded-lg bg-black/40 p-3">
        <label className="text-xs text-textSecondary">Название<input className={input} value={category.name} maxLength={100} onChange={e=>setCategory({...category,name:e.target.value})}/></label>
        <label className="text-xs text-textSecondary">Описание<textarea className={input} rows={2} maxLength={300} value={category.description} onChange={e=>setCategory({...category,description:e.target.value})}/></label>
        <div className="space-y-2">
          <label className="block text-xs text-textSecondary">Изображение категории (JPG, PNG, WebP до 5 МБ)
            <input type="file" accept="image/jpeg,image/png,image/webp" disabled={categoryUploading}
              className={input} onChange={e=>void uploadCategoryImage(e.target.files?.[0]||null)}/>
          </label>
          {categoryUploading&&<p className="text-xs text-accentBrightGold">Загружаем изображение…</p>}
          {category.image_url&&<div className="space-y-2">
            <img src={category.image_url} alt={'Обложка категории '+category.name} className="w-full max-h-52 rounded-lg object-cover border border-accentGold/30"/>
            <button type="button" className="text-xs text-red-300" onClick={()=>setCategory({...category,image_url:''})}>Убрать изображение</button>
          </div>}
          <label className="block text-xs text-textSecondary">Или HTTPS-ссылка на изображение
            <input className={input} inputMode="url" placeholder="https://..." value={category.image_url||''}
              onChange={e=>setCategory({...category,image_url:e.target.value})}/>
          </label>
        </div>
        <label className="block text-xs text-textSecondary">Порядок сортировки
          <input className={input} type="number" min={-10000} max={10000} value={category.sort_order} onChange={e=>setCategory({...category,sort_order:Number(e.target.value)})}/>
          <span className="block mt-1 text-[11px] text-textSecondary">Меньшее число показывается раньше. Например, 10 будет перед 100.</span>
        </label>
        <label className="text-sm text-white flex gap-2"><input type="checkbox" checked={category.active} onChange={e=>setCategory({...category,active:e.target.checked})}/> Категория активна</label>
        <div className="rounded-lg border border-accentGold/20 bg-accentGold/[0.05] p-3 space-y-2">
          <b className="text-sm text-white">Где показывать категорию</b>
          <label className="flex items-center gap-2 text-sm text-white"><input type="checkbox" checked={category.show_on_web!==false} onChange={e=>setCategory({...category,show_on_web:e.target.checked})}/> На сайте</label>
          <label className="flex items-center gap-2 text-sm text-white"><input type="checkbox" checked={category.show_in_mini_app!==false} onChange={e=>setCategory({...category,show_in_mini_app:e.target.checked})}/> В Telegram Mini App</label>
          <p className="text-xs text-textSecondary">Отключённая категория скрывает свои публикации на выбранной площадке.</p>
        </div>
        <div className="flex gap-2"><button disabled={categoryUploading} className="rounded-lg bg-accentGold text-black px-3 py-2 text-sm disabled:opacity-60" onClick={applyCategory}>Применить</button><button className="text-sm text-textSecondary" onClick={()=>setCategory(null)}>Отмена</button></div>
      </div>}
    </section>
    <section className="rounded-card border border-white/10 bg-bgCard p-3 space-y-3">
      <div className="flex justify-between items-center"><h2 className="font-bold text-white">Публикации ({data.articles.length})</h2><button disabled={!data.categories.length} className="text-accentBrightGold text-xs flex gap-1" onClick={()=>{setArticle(emptyArticle(data.categories[0]?.id||''));setEditingSlug(null);setCategory(null)}}><Plus size={15}/> Новая статья</button></div>
      {data.articles.map(a=><div key={a.slug} className="flex justify-between items-center gap-2 border-t border-white/10 pt-2"><div><b className="text-sm text-white">{a.title}</b><p className="text-xs text-textSecondary">{a.published?'Опубликовано: '+(a.show_on_web!==false&&a.show_in_mini_app!==false?'сайт и Mini App':a.show_on_web!==false?'сайт':a.show_in_mini_app!==false?'Mini App':'не выбрана площадка'):'Черновик'} · {data.categories.find(c=>c.id===a.category_id)?.name||'Без категории'} · <Eye size={13} className="inline-block align-middle"/> {(a.view_count??0).toLocaleString('ru-RU')} просмотров</p></div><div className="flex gap-2"><button className="text-accentBrightGold text-xs" onClick={()=>{setArticle({...a,blocks:a.blocks.map(b=>({...b}))});setEditingSlug(a.slug);setCategory(null)}}>Изменить</button><button className="text-red-300" aria-label="Удалить статью" onClick={()=>{if(window.confirm('Удалить эту статью?')){setData({...data,articles:data.articles.filter(x=>x.slug!==a.slug)});setArticleDirty(true)}}}><Trash2 size={16}/></button></div></div>)}
      {article&&<div className="space-y-3 border-t border-accentGold/30 pt-3">
        <h3 className="font-bold text-white">Редактор статьи</h3>
        <label className="block text-xs text-textSecondary">Заголовок<input className={input} maxLength={180} value={article.title} onChange={e=>updateArticle({title:e.target.value})}/></label>
        <label className="block text-xs text-textSecondary">Адрес статьи (латиница, без пробелов)<div className="flex gap-2"><input className={input} value={article.slug} maxLength={100} onChange={e=>updateArticle({slug:slugify(e.target.value)})}/><button className="text-accentBrightGold text-xs" onClick={()=>updateArticle({slug:slugify(article.title)||article.slug})}>Из заголовка</button></div></label>
        <label className="block text-xs text-textSecondary">Категория<select className={input} value={article.category_id} onChange={e=>updateArticle({category_id:e.target.value})}>{data.categories.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
        <label className="block text-xs text-textSecondary">Краткое описание для карточки<textarea className={input} rows={3} maxLength={500} value={article.excerpt} onChange={e=>updateArticle({excerpt:e.target.value})}/></label>
        <label className="block text-xs text-textSecondary">Фото обложки <input type="file" accept="image/png,image/jpeg,image/webp" disabled={uploading} className={input} onChange={e=>void upload(e.target.files?.[0]||null,'cover')}/></label>
        {article.cover_url&&<img className="max-h-48 rounded-lg object-cover" src={article.cover_url} alt="Обложка"/>}
        <label className="block text-xs text-textSecondary">Или HTTPS-ссылка на обложку<input className={input} value={article.cover_url} onChange={e=>updateArticle({cover_url:e.target.value})}/></label>
        <label className="block text-xs text-textSecondary">Хештеги (через запятую)<input className={input} value={article.tags.join(', ')} onChange={e=>updateArticle({tags:e.target.value.split(',').map(t=>t.trim().replace(/^#/,'')).filter(Boolean).slice(0,20)})}/></label>
        <div className="rounded-lg bg-black/30 border border-white/10 p-3 space-y-3">
          <h4 className="text-white font-bold">Полный текст статьи</h4>
          <p className="text-xs text-textSecondary">Добавляй блоки по порядку: текст, заголовки, картинки, ссылки и цитаты.</p>
          {article.blocks.map((block,index)=><div className="rounded-lg border border-white/10 p-3 space-y-2" key={index}>
            <div className="flex justify-between items-center"><b className="text-xs text-accentBrightGold">{index+1}. {blockName[block.type]}</b><div className="flex gap-2">
              <button aria-label="Выше" disabled={index===0} onClick={()=>{const blocks=[...article.blocks];[blocks[index-1],blocks[index]]=[blocks[index],blocks[index-1]];updateArticle({blocks})}}><ArrowUp size={17}/></button>
              <button aria-label="Ниже" disabled={index===article.blocks.length-1} onClick={()=>{const blocks=[...article.blocks];[blocks[index],blocks[index+1]]=[blocks[index+1],blocks[index]];updateArticle({blocks})}}><ArrowDown size={17}/></button>
              <button aria-label="Удалить блок" className="text-red-300" onClick={()=>updateArticle({blocks:article.blocks.filter((_,i)=>i!==index)})}><Trash2 size={17}/></button>
            </div></div>
            {(block.type==='paragraph'||block.type==='heading'||block.type==='quote')&&<textarea rows={block.type==='paragraph'?6:2} className={input} value={block.text} onChange={e=>updateBlock(index,{text:e.target.value})} placeholder="Текст…"/>}
            {block.type==='link'&&<><input className={input} value={block.text} onChange={e=>updateBlock(index,{text:e.target.value})} placeholder="Текст ссылки"/><input className={input} value={block.url} onChange={e=>updateBlock(index,{url:e.target.value})} placeholder="https://…"/></>}
            {block.type==='image'&&<><label className="flex items-center gap-2 text-xs text-accentBrightGold"><ImagePlus size={18}/> Загрузить изображение<input type="file" accept="image/png,image/jpeg,image/webp" className="max-w-full text-xs" disabled={uploading} onChange={e=>void upload(e.target.files?.[0]||null,'block',index)}/></label>
              <input className={input} value={block.url} onChange={e=>updateBlock(index,{url:e.target.value})} placeholder="Или https://…"/>
              {block.url&&<img src={block.url} className="max-h-40 rounded-lg" alt="Изображение статьи"/>}
              <input className={input} value={block.alt} onChange={e=>updateBlock(index,{alt:e.target.value})} placeholder="Описание картинки (alt)"/>
              <input className={input} value={block.text} onChange={e=>updateBlock(index,{text:e.target.value})} placeholder="Подпись под изображением"/></>}
          </div>)}
          <div className="flex flex-wrap gap-2">{(Object.keys(blockName) as ArticleBlock['type'][]).map(type=><button key={type} className="rounded-lg border border-accentGold/35 px-2.5 py-2 text-xs text-accentBrightGold" onClick={()=>updateArticle({blocks:[...article.blocks,emptyBlock(type)]})}><Plus size={12} className="inline"/> {blockName[type]}</button>)}</div>
        </div>
        <div className="border border-white/10 rounded-lg p-3 space-y-2"><h4 className="text-sm font-bold text-white">SEO для Google</h4>
          <label className="block text-xs text-textSecondary">SEO title<input className={input} maxLength={180} value={article.seo_title} onChange={e=>updateArticle({seo_title:e.target.value})}/></label>
          <label className="block text-xs text-textSecondary">Meta description<textarea className={input} rows={2} maxLength={300} value={article.seo_description} onChange={e=>updateArticle({seo_description:e.target.value})}/></label>
        </div>
        <div className="rounded-lg border border-accentGold/30 bg-accentGold/[0.05] p-3 space-y-3">
          <h4 className="font-bold text-white text-sm">Публикация</h4>
          <label className="flex gap-2 text-sm text-white items-center"><input type="checkbox" checked={article.published} onChange={e=>updateArticle({published:e.target.checked})}/> Опубликовать (снять галочку — сохранить черновиком)</label>
          <p className="text-xs text-textSecondary">Выбери, где статья будет доступна после публикации:</p>
          <label className="flex gap-2 text-sm text-white items-center"><input type="checkbox" checked={article.show_on_web!==false} onChange={e=>updateArticle({show_on_web:e.target.checked})}/> На сайте VVD CPA</label>
          <label className="flex gap-2 text-sm text-white items-center"><input type="checkbox" checked={article.show_in_mini_app!==false} onChange={e=>updateArticle({show_in_mini_app:e.target.checked})}/> В Telegram Mini App</label>
          <p className="text-xs text-accentBrightGold">Обе галочки — публикация сразу в двух местах. Изменения вступят в силу после «Применить статью» и «Сохранить».</p>
        </div>
        <div className="flex gap-2"><button disabled={uploading} className="rounded-lg bg-accentGold text-black px-4 py-2 text-sm font-bold" onClick={applyArticle}>Применить статью</button><button className="text-textSecondary text-sm" onClick={()=>{setArticle(null);setEditingSlug(null);}}>Отмена</button></div>
      </div>}
    </section>
  </div>;
};
