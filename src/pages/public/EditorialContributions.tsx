import React,{useEffect,useState} from 'react';
import {ArrowLeft,ImagePlus,Plus,Send,Trash2} from 'lucide-react';
import {ContributionImage} from './ContributionImage';
import {editorialApi,type ArticleBlock,type ContributionContent,type CommunitySubmission,type EditorialCategory} from './editorialApi';

const emptyBlock=(type:ArticleBlock['type']):ArticleBlock=>({type,text:'',url:'',alt:''});
const inputClass='vvd-community-input';
const statusLabel:Record<string,string>={pending:'На проверке',revision:'Нужны правки',rejected:'Отклонено',published:'Опубликовано'};
const statusTime=(value:string)=>new Date(value).toLocaleDateString('ru-RU');
type Props={categories:EditorialCategory[];authenticated:boolean;onLogin:()=>void;onClose:()=>void};
export const EditorialContributions:React.FC<Props>=({categories,authenticated,onLogin,onClose})=>{
  const [form,setForm]=useState<ContributionContent>(()=>({
    rights_confirmed:true,author_name:'',category_id:categories[0]?.id||'',title:'',excerpt:'',cover_url:'',
    blocks:[emptyBlock('paragraph')]
  }));
  const [submissions,setSubmissions]=useState<CommunitySubmission[]>([]);
  const [loading,setLoading]=useState(false);
  const [busy,setBusy]=useState(false);
  const [uploading,setUploading]=useState(false);
  const [consent,setConsent]=useState(false);
  const [revisionId,setRevisionId]=useState<string|null>(null);
  const [error,setError]=useState('');
  const [message,setMessage]=useState('');
  useEffect(()=>{
    if(!authenticated)return;
    let alive=true;
    setLoading(true);
    void editorialApi.contributionsMine().then(result=>{
      if(alive)setSubmissions(result.submissions);
    }).catch(()=>{if(alive)setError('Не удалось получить историю отправленных статей. Проверьте вход через Telegram.');})
      .finally(()=>{if(alive)setLoading(false)});
    return()=>{alive=false};
  },[authenticated]);
  useEffect(()=>{
    if(!form.category_id&&categories.length)setForm(f=>({...f,category_id:categories[0].id}));
  },[categories,form.category_id]);
  const update=(patch:Partial<ContributionContent>)=>setForm(f=>({...f,...patch}));
  const blockUpdate=(index:number,patch:Partial<ArticleBlock>)=>update({
    blocks:form.blocks.map((item,i)=>i===index?{...item,...patch}:item)
  });
  const upload=async(file:File|null,index?:number)=>{
    if(!file||uploading)return;
    if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>5*1024*1024){
      setError('Допустимы изображения JPG, PNG или WebP до 5 МБ.');return;
    }
    setError('');setUploading(true);
    try{
      const url=await editorialApi.contributionUpload(file);
      if(index===undefined)update({cover_url:url});
      else blockUpdate(index,{url});
    }catch(e){setError('Не удалось загрузить фотографию: '+String(e));}
    finally{setUploading(false);}
  };
  const submit=async()=>{
    if(busy||uploading||!authenticated)return;
    setError('');setMessage('');
    if(!consent){setError('Подтвердите право использовать материалы.');return;}
    setBusy(true);
    try{
      if(revisionId)await editorialApi.contributionRevise(revisionId,form);
      else await editorialApi.contributionSubmit(form);
      const response=await editorialApi.contributionsMine();
      setSubmissions(response.submissions);
      setForm({rights_confirmed:true,author_name:form.author_name,category_id:form.category_id,
        title:'',excerpt:'',cover_url:'',blocks:[emptyBlock('paragraph')]});
      setConsent(false);
      setRevisionId(null);
      setMessage('Статья отправлена администратору. До одобрения она не видна читателям.');
    }catch(e){setError('Не удалось отправить статью: '+String(e));}
    finally{setBusy(false);}
  };
  return <section className="vvd-community">
    <button type="button" className="vvd-web-back" onClick={onClose}><ArrowLeft size={17}/> К статьям и категориям</button>
    <span className="vvd-web-eyebrow">АВТОРСКИЕ ПУБЛИКАЦИИ</span>
    <h2>{revisionId?'Доработать статью':'Предложить статью'}</h2>
    <p className="vvd-community-hint">Поделитесь полезной инструкцией, обзором или разбором. Все материалы сначала проверяет и при необходимости редактирует администратор VVD CPA. До его одобрения статья не публикуется.</p>
    {!authenticated?<div className="vvd-community-panel">
      <p>Чтобы предложить статью или увидеть статус своих материалов, войдите в аккаунт через Telegram.</p>
      <button type="button" className="vvd-web-gold-button" onClick={onLogin}>Войти через Telegram</button>
    </div>:<>
      {error&&<p role="alert" className="vvd-community-error">{error}</p>}
      {message&&<p role="status" className="vvd-community-success">{message}</p>}
      <div className="vvd-community-panel">
        <label>Ваше имя или ник автора<input className={inputClass} maxLength={60} value={form.author_name} onChange={e=>update({author_name:e.target.value})} placeholder="Имя, которое будет видно читателям"/></label>
        <label>Категория<select className={inputClass} value={form.category_id} onChange={e=>update({category_id:e.target.value})}>{categories.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
        <label>Название статьи<input className={inputClass} maxLength={180} value={form.title} onChange={e=>update({title:e.target.value})} placeholder="О чём ваш материал?"/></label>
        <label>Краткое описание<input className={inputClass} maxLength={500} value={form.excerpt} onChange={e=>update({excerpt:e.target.value})} placeholder="Что узнает читатель?"/></label>
        <label className="vvd-community-upload"><ImagePlus size={18}/> Фотообложка (JPG, PNG, WebP до 5 МБ)
          <input type="file" accept="image/jpeg,image/png,image/webp" disabled={uploading} onChange={e=>void upload(e.target.files?.[0]||null)}/>
        </label>
        {form.cover_url&&<div className="vvd-community-preview"><ContributionImage src={form.cover_url} alt="Фотообложка статьи"/><button type="button" onClick={()=>update({cover_url:''})}>Убрать обложку</button></div>}
        {revisionId&&<button type="button" className="vvd-web-outline-button" onClick={()=>{setRevisionId(null);setForm({rights_confirmed:true,author_name:'',category_id:categories[0]?.id||'',title:'',excerpt:'',cover_url:'',blocks:[emptyBlock('paragraph')]})}}>Отменить доработку</button>}
        <h3>Содержание статьи</h3>
        <p className="vvd-community-hint">Добавляйте заголовки, абзацы, фотографии и ссылки. Не размещайте чужие материалы без разрешения, скрытую рекламу или личные контакты.</p>
        {form.blocks.map((block,index)=><div className="vvd-community-block" key={index}>
          <div className="vvd-community-block-heading"><b>{index+1}. {({paragraph:'Абзац',heading:'Подзаголовок',image:'Изображение',link:'Ссылка',quote:'Цитата'} as Record<string,string>)[block.type]}</b>
            <button type="button" title="Удалить блок" disabled={form.blocks.length===1} onClick={()=>update({blocks:form.blocks.filter((_,i)=>i!==index)})}><Trash2 size={17}/></button>
          </div>
          {(block.type==='paragraph'||block.type==='heading'||block.type==='quote')&&<textarea className={inputClass} rows={block.type==='paragraph'?6:2} maxLength={12000} value={block.text} onChange={e=>blockUpdate(index,{text:e.target.value})} placeholder="Введите текст…"/>}
          {block.type==='link'&&<><input className={inputClass} maxLength={12000} value={block.text} onChange={e=>blockUpdate(index,{text:e.target.value})} placeholder="Название ссылки"/><input className={inputClass} value={block.url} onChange={e=>blockUpdate(index,{url:e.target.value})} placeholder="https://…"/></>}
          {block.type==='image'&&<>
            <label className="vvd-community-upload"><ImagePlus size={16}/> Загрузить фотографию<input type="file" accept="image/jpeg,image/png,image/webp" disabled={uploading} onChange={e=>void upload(e.target.files?.[0]||null,index)}/></label>
            {block.url&&<ContributionImage className="vvd-community-inline-image" src={block.url} alt="Загруженное изображение"/>}
            <input className={inputClass} maxLength={200} value={block.alt} onChange={e=>blockUpdate(index,{alt:e.target.value})} placeholder="Описание фотографии"/>
            <input className={inputClass} maxLength={12000} value={block.text} onChange={e=>blockUpdate(index,{text:e.target.value})} placeholder="Подпись (необязательно)"/>
          </>}
        </div>)}
        <div className="vvd-community-block-actions">
          {(['paragraph','heading','image','link','quote'] as ArticleBlock['type'][]).map(type=><button type="button" key={type} disabled={form.blocks.length>=24||uploading||(type==='image'&&form.blocks.filter(b=>b.type==='image').length>=8)} onClick={()=>update({blocks:[...form.blocks,emptyBlock(type)]})}><Plus size={14}/> {({paragraph:'Абзац',heading:'Заголовок',image:'Фото',link:'Ссылка',quote:'Цитата'} as Record<string,string>)[type]}</button>)}
        </div>
        <label className="vvd-community-consent"><input type="checkbox" checked={consent} onChange={e=>setConsent(e.target.checked)}/><span>Подтверждаю, что текст и изображения мои либо я имею право их использовать. Согласен, что администратор может полностью отредактировать, отклонить или опубликовать материал с указанным авторством.</span></label>
        <button type="button" className="vvd-web-gold-button" disabled={busy||uploading||!consent||form.author_name.trim().length<2||form.title.trim().length<8||form.excerpt.trim().length<20||!form.blocks.some(b=>b.type==='paragraph'&&b.text.trim().length>=100)} onClick={()=>void submit()}><Send size={16}/> {busy?'Отправляем…':revisionId?'Отправить исправленную статью':'Отправить на проверку'}</button>
        <p className="vvd-community-hint">До трёх предложений за 24 часа. Отправка не гарантирует публикацию.</p>
      </div>
      <div className="vvd-community-panel">
        <h3>Мои предложенные статьи</h3>
        {loading?<p>Загружаем…</p>:!submissions.length?<p className="vvd-community-hint">Пока нет отправленных материалов.</p>:submissions.map(s=><div key={s.id} className="vvd-community-my-item">
          <strong>{s.original.title}</strong>
          <span className="vvd-community-status">{statusLabel[s.status]||s.status}</span>
          <small>{statusTime(s.created_at)}</small>
          {s.moderator_note&&<p>Комментарий администратора: {s.moderator_note}</p>}
          {s.status==='revision'&&<button type="button" className="vvd-web-outline-button" onClick={()=>{setForm(structuredClone(s.original));setRevisionId(s.id);setConsent(false);setError('');setMessage('Внесите правки и повторно отправьте материал на проверку.');const scroller=document.querySelector('.vvd-web-portal, .scrollable-container');scroller?.scrollTo({top:0,behavior:'smooth'});}}>Исправить и отправить повторно</button>}
          {s.status==='published'&&s.article_slug&&<p className="vvd-community-hint">Статья опубликована в разделе «Статьи и кейсы».</p>}
        </div>)}
      </div>
    </>}
  </section>;
};
