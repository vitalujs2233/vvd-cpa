import React,{useEffect,useState} from 'react';
import {ArrowDown,ArrowUp,Check,ImagePlus,RefreshCw,Save,ShieldCheck,Trash2,X} from 'lucide-react';
import {ContributionImage} from '@/pages/public/ContributionImage';
import {editorialApi,type ArticleBlock,type ContributionContent,type CommunitySubmission,type EditorialCategory} from '@/pages/public/editorialApi';

const input='w-full rounded-app-xs border border-white/15 bg-bgMain px-3 py-2.5 text-sm text-white outline-none focus:border-accentGold';
const labels:Record<string,string>={pending:'На проверке',revision:'Нужны правки',rejected:'Отклонено',published:'Опубликовано'};
const blocks:Record<ArticleBlock['type'],string>={heading:'Подзаголовок',paragraph:'Абзац',image:'Фото',link:'Ссылка',quote:'Цитата'};
export const EditorialSubmissionAdmin:React.FC<{categories:EditorialCategory[];onPublished:()=>void}>=({categories,onPublished})=>{
  const [items,setItems]=useState<CommunitySubmission[]>([]);
  const [selected,setSelected]=useState<string|null>(null);
  const [content,setContent]=useState<ContributionContent|null>(null);
  const [note,setNote]=useState('');
  const [busy,setBusy]=useState(false);
  const [uploading,setUploading]=useState(false);
  const [error,setError]=useState('');
  const [message,setMessage]=useState('');
  const [loadAttempt,setLoadAttempt]=useState(0);
  useEffect(()=>{
    let live=true;
    void editorialApi.contributionsAdmin().then(r=>{if(live)setItems(r.submissions)})
      .catch(e=>{if(live)setError('Не удалось загрузить предложения: '+String(e))});
    return()=>{live=false};
  },[loadAttempt]);
  const active=items.find(x=>x.id===selected);
  const select=(item:CommunitySubmission)=>{
    setSelected(item.id);
    setContent(structuredClone(item.edited||item.original));
    setNote(item.moderator_note||'');setError('');setMessage('');
  };
  const update=(part:Partial<ContributionContent>)=>setContent(c=>c?{...c,...part}:c);
  const updateBlock=(index:number,part:Partial<ArticleBlock>)=>{
    if(content)update({blocks:content.blocks.map((b,i)=>i===index?{...b,...part}:b)});
  };
  const upload=async(file:File|null,index?:number)=>{
    if(!file||uploading)return;
    if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>5*1024*1024){setError('Только JPG, PNG, WebP до 5 МБ');return;}
    setUploading(true);setError('');
    try{
      const url=await editorialApi.upload('review-'+crypto.randomUUID().replace(/-/g,'').slice(0,24),file);
      if(index===undefined)update({cover_url:url});else updateBlock(index,{url});
    }catch(e){setError('Ошибка фото: '+String(e))}
    finally{setUploading(false)}
  };
  const review=async(action:'save'|'approve'|'reject'|'revision')=>{
    if(!active||!content||busy||uploading)return;
    if(action==='approve'&&!window.confirm('Опубликовать эту отредактированную статью на сайте и в Mini App?'))return;
    if(action==='reject'&&!window.confirm('Отклонить предложенную статью?'))return;
    setBusy(true);setError('');setMessage('');
    try{
      await editorialApi.contributionReview(active.id,action,content,note);
      setMessage(action==='approve'?'Статья опубликована на сайте и в Mini App.':action==='save'?'Правки сохранены.':'Решение сохранено, автор увидит статус и комментарий.');
      setSelected(null);setContent(null);setLoadAttempt(n=>n+1);
      if(action==='approve')onPublished();
    }catch(e){setError('Не удалось сохранить решение: '+String(e))}
    finally{setBusy(false)}
  };
  return <section className="rounded-card border border-accentGold/25 bg-bgCard p-3 space-y-3">
    <div className="flex justify-between items-center gap-2"><div><h2 className="font-bold text-white">Предложенные статьи ({items.filter(x=>x.status==='pending').length} на проверке)</h2><p className="text-xs text-textSecondary">Все публикации проверяются вручную</p></div>
      <button type="button" className="text-accentBrightGold" onClick={()=>setLoadAttempt(n=>n+1)} aria-label="Обновить предложения"><RefreshCw size={17}/></button>
    </div>
    {error&&<p role="alert" className="text-sm text-red-300">{error}</p>}
    {message&&<p role="status" className="text-sm text-accentBrightGold">{message}</p>}
    {!items.length?<p className="text-sm text-textSecondary">Пока нет предложенных материалов.</p>:items.map(item=><div key={item.id} className="border-t border-white/10 pt-3 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0"><b className="text-sm text-white">{item.original.title}</b>
          <p className="text-xs text-textSecondary">Автор: {item.original.author_name} · Telegram ID: {item.author_uid} · {labels[item.status]||item.status}</p>
        </div>
        <button type="button" className="text-accentBrightGold text-xs shrink-0" onClick={()=>selected===item.id?setSelected(null):select(item)}>{selected===item.id?'Закрыть':'Проверить'}</button>
      </div>
      {selected===item.id&&content&&<div className="space-y-3 rounded-lg border border-accentGold/20 bg-black/30 p-3">
        <details className="text-sm text-textSecondary"><summary className="cursor-pointer text-accentBrightGold">Оригинал, присланный автором (не изменяется)</summary>
          <div className="mt-3 space-y-2">
            <p><b>Автор:</b> {item.original.author_name}</p><p><b>Заголовок:</b> {item.original.title}</p><p><b>Описание:</b> {item.original.excerpt}</p>
            {item.original.cover_url&&<ContributionImage className="max-h-48 rounded-lg" src={item.original.cover_url} alt="Оригинальная обложка"/>}
            {item.original.blocks.map((b,i)=><div key={i} className="rounded-md border border-white/10 p-2 break-words">
              <small>{blocks[b.type]}</small>
              {b.text&&<p className="whitespace-pre-wrap">{b.text}</p>}
              {b.url&&<p className="break-all">{b.url}</p>}
              {b.type==='image'&&b.url&&<ContributionImage src={b.url} alt={b.alt||'Иллюстрация автора'} className="max-h-40 rounded-lg"/>}
            </div>)}
          </div>
        </details>
        <h3 className="font-bold text-white">Редактирование перед публикацией</h3>
        <label className="block text-xs text-textSecondary">Публичное имя автора<input className={input} maxLength={60} value={content.author_name} onChange={e=>update({author_name:e.target.value})}/></label>
        <label className="block text-xs text-textSecondary">Название<input className={input} maxLength={180} value={content.title} onChange={e=>update({title:e.target.value})}/></label>
        <label className="block text-xs text-textSecondary">Категория<select className={input} value={content.category_id} onChange={e=>update({category_id:e.target.value})}>{categories.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
        <label className="block text-xs text-textSecondary">Описание<textarea className={input} rows={3} maxLength={500} value={content.excerpt} onChange={e=>update({excerpt:e.target.value})}/></label>
        <label className="block text-xs text-textSecondary">HTTPS обложка<input className={input} value={content.cover_url} onChange={e=>update({cover_url:e.target.value})}/></label>
        <label className="block text-xs text-accentBrightGold">Заменить обложку<input className={input} type="file" accept="image/jpeg,image/png,image/webp" disabled={uploading} onChange={e=>void upload(e.target.files?.[0]||null)}/></label>
        {content.cover_url&&<ContributionImage className="max-h-48 rounded-lg" src={content.cover_url} alt="Обложка после модерации"/>}
        <h4 className="text-sm font-bold text-white">Содержание</h4>
        {content.blocks.map((b,i)=><div key={i} className="rounded-lg border border-white/10 p-2 space-y-2">
          <div className="flex justify-between items-center">
            <select className="bg-bgMain text-xs text-accentBrightGold" value={b.type} onChange={e=>updateBlock(i,{type:e.target.value as ArticleBlock['type']})}>{Object.entries(blocks).map(([type,label])=><option key={type} value={type}>{label}</option>)}</select>
            <div className="flex gap-2">
              <button disabled={i===0} aria-label="Блок выше" onClick={()=>{const updated=[...content.blocks];[updated[i-1],updated[i]]=[updated[i],updated[i-1]];update({blocks:updated})}}><ArrowUp size={16}/></button>
              <button disabled={i===content.blocks.length-1} aria-label="Блок ниже" onClick={()=>{const updated=[...content.blocks];[updated[i+1],updated[i]]=[updated[i],updated[i+1]];update({blocks:updated})}}><ArrowDown size={16}/></button>
              <button disabled={content.blocks.length===1} aria-label="Удалить блок" onClick={()=>update({blocks:content.blocks.filter((_,j)=>j!==i)})}><Trash2 size={16}/></button>
            </div>
          </div>
          {(b.type!=='image'&&b.type!=='link')?<textarea className={input} rows={b.type==='paragraph'?6:2} value={b.text} onChange={e=>updateBlock(i,{text:e.target.value})}/>:
            <><input className={input} value={b.text} onChange={e=>updateBlock(i,{text:e.target.value})} placeholder={b.type==='image'?'Подпись':'Текст ссылки'}/>
              <input className={input} value={b.url} onChange={e=>updateBlock(i,{url:e.target.value})} placeholder="https://…"/>
              {b.type==='image'&&<><label className="text-xs text-accentBrightGold flex items-center gap-2"><ImagePlus size={15}/> Загрузить фото<input type="file" accept="image/jpeg,image/png,image/webp" disabled={uploading} onChange={e=>void upload(e.target.files?.[0]||null,i)}/></label>
                <input className={input} maxLength={200} value={b.alt} onChange={e=>updateBlock(i,{alt:e.target.value})} placeholder="Описание фото"/></>}
            </>}
        </div>)}
        <div className="flex flex-wrap gap-2">{(Object.keys(blocks) as ArticleBlock['type'][]).map(type=><button type="button" key={type} disabled={content.blocks.length>=24} className="text-xs rounded-lg border border-accentGold/40 px-2 py-1 text-accentBrightGold" onClick={()=>update({blocks:[...content.blocks,{type,text:'',url:'',alt:''}]})}>+ {blocks[type]}</button>)}</div>
        <label className="block text-xs text-textSecondary">Комментарий автору<textarea className={input} maxLength={1000} rows={2} value={note} onChange={e=>setNote(e.target.value)} placeholder="Причина отказа или необходимые правки"/></label>
        {active?.status==='published'?<p className="text-xs text-accentBrightGold">Уже опубликовано. Дальнейшее редактирование выполняется в редакторе публикаций ниже.</p>:
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={busy||uploading} className="rounded-lg bg-accentGold px-3 py-2 text-xs font-bold text-black flex items-center gap-1" onClick={()=>void review('approve')}><Check size={14}/> Одобрить и опубликовать</button>
            <button type="button" disabled={busy||uploading} className="rounded-lg border border-accentGold/40 px-3 py-2 text-xs text-accentBrightGold flex items-center gap-1" onClick={()=>void review('save')}><Save size={14}/> Сохранить правки</button>
            <button type="button" disabled={busy||uploading} className="rounded-lg border border-white/20 px-3 py-2 text-xs text-white flex items-center gap-1" onClick={()=>void review('revision')}><ShieldCheck size={14}/> На доработку</button>
            <button type="button" disabled={busy||uploading} className="rounded-lg border border-red-400/40 px-3 py-2 text-xs text-red-300 flex items-center gap-1" onClick={()=>void review('reject')}><X size={14}/> Отклонить</button>
          </div>}
      </div>}
    </div>)}
  </section>;
};
