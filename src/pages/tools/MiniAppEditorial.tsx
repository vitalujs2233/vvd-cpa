import React, {useCallback} from 'react';
import {useNavigate, useParams} from 'react-router-dom';
import {ArrowLeft, Newspaper} from 'lucide-react';
import {PublicEditorial} from '@/pages/public/PublicEditorial';
import '@/pages/public/PublicWebsite.css';
import {triggerHaptic} from '@/shared/lib/telegram';

// The Mini App reuses the same published article feed, cards and complete articles
// as the public website. Drafts remain hidden by the existing editorial API.
const noopMetadata=()=>{};

export const MiniAppEditorial:React.FC=()=>{
  const navigate=useNavigate();
  const {slug=''}=useParams<{slug:string}>();
  const openArticle=useCallback((nextSlug:string)=>{
    navigate('/tools/articles/'+encodeURIComponent(nextSlug));
  },[navigate]);
  const openList=useCallback(()=>navigate('/tools/articles'),[navigate]);
  return <main className="vvd-miniapp-editorial min-h-full p-4 pb-28 text-textPrimary">
    <div className="mb-2 flex items-center gap-3">
      <button type="button" aria-label="Вернуться к инструментам"
        onClick={()=>{triggerHaptic.lightImpact();navigate('/tools');}}
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-app-xs border border-white/10 bg-bgCard/80 text-accentBrightGold">
        <ArrowLeft size={19}/>
      </button>
      <div className="flex min-w-0 items-center gap-2">
        <Newspaper size={20} className="shrink-0 text-accentBrightGold"/>
        <div>
          <strong className="text-base text-white">Статьи и кейсы</strong>
          <p className="text-xs text-textSecondary">База знаний VVD CPA</p>
        </div>
      </div>
    </div>
    <PublicEditorial slug={slug} surface="mini" onArticle={openArticle} onBack={openList} onMetadata={noopMetadata}/>
  </main>;
};
