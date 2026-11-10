import React from 'react';
import {ArrowRight,BookOpen} from 'lucide-react';
import {Link} from 'react-router-dom';
import './UnifiedCategoryCard.css';

export const serviceCountLabel=(n:number)=>n+' '+(n%10===1&&n%100!==11?'предложение':n%10>=2&&n%10<=4&&(n%100<12||n%100>14)?'предложения':'предложений');

/** One visual category card shared by the website and Telegram Mini App. */
type Props={
  title:string;
  description:string;
  status:string;
  icon?:React.ElementType;
  imageUrl?:string;
  href?:string;
  to?:string;
  onClick?:(event:React.MouseEvent<HTMLElement>)=>void;
  className?:string;
};
export const UnifiedCategoryCard:React.FC<Props>=({
  title,status,icon:Icon=BookOpen,imageUrl,href,to,onClick,className=''
})=>{
  const content=<>
    <span className="vvd-unified-category-icon" aria-hidden="true">
      {imageUrl?<img src={imageUrl} alt="" loading="lazy" decoding="async"/>:<Icon size={24} strokeWidth={1.65}/>}
    </span>
    <span className="vvd-unified-category-title">{title}</span>
    <span className="vvd-unified-category-footer">
      <span>{status}</span><ArrowRight size={17} aria-hidden="true"/>
    </span>
  </>;
  const cls=('vvd-unified-category-card '+className).trim();
  if(to)return <Link className={cls} to={to} onClick={onClick} aria-label={title+' — открыть категорию'}>{content}</Link>;
  if(href)return <a className={cls} href={href} onClick={onClick} aria-label={title+' — открыть категорию'}>{content}</a>;
  return <button type="button" className={cls} onClick={onClick} aria-label={title+' — открыть категорию'}>{content}</button>;
};
