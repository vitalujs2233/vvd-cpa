import React,{useMemo,useState} from 'react';
import { Check, ChevronDown, ChevronUp, Search, Layers } from 'lucide-react';
import { directoryIcons, directoryIconOptions, directoryIconGroups } from '@/pages/tools/serviceDirectoryApi';

type Props = {value:string;onChange:(icon:string)=>void;label:string};

export const DirectoryIconPicker:React.FC<Props> = ({value,onChange,label}) => {
  const [expanded,setExpanded]=useState(false);
  const [search,setSearch]=useState('');
  const [group,setGroup]=useState('Все');
  const options=useMemo(()=>{
    const query=search.trim().toLocaleLowerCase('ru');
    return directoryIconOptions.filter(option=>(group==='Все'||option.group===group)&&
      (!query||option.label.toLocaleLowerCase('ru').includes(query)||option.id.includes(query)));
  },[group,search]);
  const chosen=directoryIconOptions.find(option=>option.id===value);
  const Selected=directoryIcons[value]||Layers;
  return <section className="flex flex-col gap-3 rounded-card border border-accentGold/25 bg-accentGold/[0.04] p-3">
    <div className="flex items-center justify-between gap-3">
      <div className="min-w-0">
        <b className="text-sm text-white">{label}</b>
        <p className="mt-1 text-xs text-textSecondary">Выбрано: {chosen?.label||'Стандартная иконка'}</p>
      </div>
      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-app-xs border border-accentGold/45 bg-accentGold/10 text-accentBrightGold">
        <Selected size={26} strokeWidth={1.8}/>
      </span>
    </div>
    <button type="button" aria-expanded={expanded} onClick={()=>setExpanded(v=>!v)}
      className="flex min-h-11 w-full items-center justify-center gap-2 rounded-app-xs border border-accentGold/40 bg-accentGold/10 px-3 py-2.5 text-sm font-semibold text-accentBrightGold">
      {expanded?'Скрыть список иконок':'Выбрать или изменить иконку'}
      {expanded?<ChevronUp size={16}/>:<ChevronDown size={16}/>}
    </button>
    {expanded&&<div className="flex flex-col gap-3">
      <label className="flex items-center gap-2 rounded-app-xs border border-white/15 bg-bgMain px-3 py-2.5">
        <Search size={17} className="shrink-0 text-textSecondary"/>
        <input type="search" value={search} onChange={e=>setSearch(e.target.value)}
          placeholder="Найти иконку..." aria-label="Поиск иконки"
          className="min-w-0 flex-1 bg-transparent text-sm text-white outline-none placeholder:text-textSecondary"/>
      </label>
      <div className="flex flex-wrap gap-2">
        {['Все',...directoryIconGroups].map(name=><button key={name} type="button"
          aria-pressed={group===name} onClick={()=>setGroup(name)}
          className={'rounded-full border px-3 py-1.5 text-xs '+(group===name
            ?'border-accentGold bg-accentGold/15 font-bold text-accentBrightGold'
            :'border-white/15 text-textSecondary')}>{name}</button>)}
      </div>
      <div className="max-h-72 overflow-y-auto overscroll-contain rounded-app-xs border border-white/10 p-1.5">
        {options.length===0&&<p className="p-3 text-center text-xs text-textSecondary">Нет иконок по этому запросу.</p>}
        <div className="grid grid-cols-4 gap-1.5">
          {options.map(option=>{
            const Icon=directoryIcons[option.id]||Layers;
            const selected=option.id===value;
            return <button key={option.id} type="button" aria-label={'Иконка: '+option.label}
              aria-pressed={selected}
              onClick={()=>{onChange(option.id);setExpanded(false);}}
              className={'relative flex min-h-[75px] flex-col items-center justify-center gap-1 rounded-app-xs border px-1.5 py-2 text-center '+(selected
                ?'border-accentGold bg-accentGold/20 text-accentBrightGold'
                :'border-white/10 bg-bgMain/60 text-textSecondary')}>
              <Icon size={25} strokeWidth={1.8}/>
              <span className="text-[10px] leading-3">{option.label}</span>
              {selected&&<Check size={12} className="absolute right-1 top-1 text-accentBrightGold"/>}
            </button>;
          })}
        </div>
      </div>
      <p className="text-[11px] text-textSecondary">Выбери одну из {directoryIconOptions.length} иконок. Она будет показана в каталоге после сохранения.</p>
    </div>}
  </section>;
};
