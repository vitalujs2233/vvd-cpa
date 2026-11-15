import React from 'react';
import {Ban,MessageSquare,RefreshCcw} from 'lucide-react';
import {MemoryRouter,Route,Routes,useNavigate} from 'react-router-dom';
import {Chat as SupportChat} from '@/pages/chat/Chat';

export type BlockNotice={
  title:string;
  message:string;
};
export const DEFAULT_BLOCK_NOTICE:BlockNotice={
  title:'Ваш аккаунт заблокирован',
  message:'Доступ к VVD CPA временно ограничен. Свяжитесь со службой поддержки для уточнения причины и рассмотрения блокировки.'
};

const Notice:React.FC<{notice:BlockNotice;onRefresh:()=>void;checking:boolean}>=({notice,onRefresh,checking})=>{
  const navigate=useNavigate();
  return <main role="alert" className="flex min-h-[100dvh] items-center justify-center bg-[#090807] p-5 text-[#f5e8cc]">
    <div className="w-full max-w-md rounded-[24px] border border-red-500/35 bg-gradient-to-b from-[#251412] to-[#100e0d] p-7 text-center shadow-xl">
      <div className="mx-auto mb-5 flex h-[76px] w-[76px] items-center justify-center rounded-full border border-red-500/40 bg-red-500/10 text-red-400">
        <Ban size={40} strokeWidth={1.7}/>
      </div>
      <div className="mb-3 text-[11px] font-semibold tracking-[.22em] text-[#cba76c]">VVD CPA · PREMIUM NETWORK</div>
      <h1 className="mb-4 text-2xl font-bold text-white">{notice.title}</h1>
      <p className="whitespace-pre-line break-words text-sm leading-7 text-[#ddcbc4]">{notice.message}</p>
      <button type="button" onClick={()=>navigate('/support?latest=1')}
        className="mt-7 flex w-full items-center justify-center gap-2 rounded-xl bg-[#e9bd65] px-5 py-3.5 font-bold text-[#251b12]">
        <MessageSquare size={18}/> Связаться с поддержкой
      </button>
      <p className="mt-2 text-xs text-[#bba79c]">Обращение попадёт в существующую службу поддержки VVD CPA.</p>
      <button type="button" disabled={checking} onClick={onRefresh}
        className="mx-auto mt-6 flex items-center gap-2 text-xs text-[#c6b19b] disabled:opacity-50">
        <RefreshCcw size={15}/> {checking?'Проверяем…':'Проверить доступ'}
      </button>
    </div>
  </main>;
};

// The existing private support ticket screen works even though all account tabs
// are hidden. Its back button returns to this notice, not to the normal profile.
export const BlockedAccount:React.FC<{notice:BlockNotice;onRefresh:()=>void;checking:boolean}>=({notice,onRefresh,checking})=>
  <MemoryRouter>
    <Routes>
      <Route path="/support" element={<div className="h-[100dvh] bg-bgMain"><SupportChat/></div>}/>
      <Route path="*" element={<Notice notice={notice} onRefresh={onRefresh} checking={checking}/>}/>
    </Routes>
  </MemoryRouter>;
