import { apiRequest } from '@/shared/lib/api';
import { readApiSnapshot } from '@/shared/lib/viewSnapshot';
import {
  Search, Monitor, Megaphone, Sparkles, BarChart3,
  Palette, Globe2, Server, Phone, LayoutGrid,
  type LucideIcon
} from 'lucide-react';

export type DirectoryCategory = {
  id: string;
  name: string;
  description: string;
  icon: string;
  sort_order: number;
  active: boolean;
};
export type DirectoryService = {
  id: string;
  category_id: string;
  name: string;
  description: string;
  benefits: string;
  image_url: string;
  website_url: string;
  discount_text: string;
  promo_code: string;
  partner_link: boolean;
  active: boolean;
  sort_order: number;
};
export type DirectoryData = {
  version: number;
  categories: DirectoryCategory[];
  services: DirectoryService[];
};
export const directoryIcons: Record<string, LucideIcon> = {
  search: Search, browser: Monitor, megaphone: Megaphone, sparkles: Sparkles,
  chart: BarChart3, palette: Palette, globe: Globe2, server: Server, phone: Phone, grid: LayoutGrid
};
export const directoryIconOptions = [
  {id:'search',label:'Поиск'}, {id:'browser',label:'Браузер'},
  {id:'megaphone',label:'Реклама'}, {id:'sparkles',label:'AI'},
  {id:'chart',label:'Аналитика'}, {id:'palette',label:'Дизайн'},
  {id:'globe',label:'Сайты'}, {id:'server',label:'Сервер'},
  {id:'phone',label:'Телефон'}, {id:'grid',label:'Каталог'}
];
// Public catalog data is shared by all directory screens. Keep the last good copy
// so navigation never starts from an empty list while a new GET is pending.
const CACHE_KEY = 'vvd_service_directory_public_v1';
const MAX_CACHE_AGE = 7 * 24 * 60 * 60 * 1000;
const REFRESH_INTERVAL = 60 * 1000;
let memory: {at:number;data:DirectoryData}|null = null;
let pending:Promise<DirectoryData>|null = null;

const validDirectory = (value:unknown):value is DirectoryData => {
  if (!value || typeof value!=='object') return false;
  const data=value as Partial<DirectoryData>;
  return typeof data.version==='number' && Array.isArray(data.categories) && Array.isArray(data.services);
};

const remember = (data:DirectoryData) => {
  const value={at:Date.now(),data};
  memory=value;
  try {localStorage.setItem(CACHE_KEY,JSON.stringify(value));} catch {/* storage may be blocked in Telegram */ }
  return data;
};

const cachedDirectory = ():DirectoryData|null => {
  if(memory)return memory.data;
  // Startup warmup already uses this app-wide in-memory snapshot.
  const startup=readApiSnapshot<DirectoryData>('/service-directory');
  if(validDirectory(startup))return remember(startup);
  try {
    const value=JSON.parse(localStorage.getItem(CACHE_KEY)||'null') as {at:number;data:DirectoryData}|null;
    if(value && Number.isFinite(value.at) && Date.now()-value.at<MAX_CACHE_AGE &&
      Date.now()>=value.at && validDirectory(value.data)){
      memory=value;
      return value.data;
    }
  }catch {/* private mode or corrupted cache */ }
  return null;
};

const publishedDirectory = (refresh=false):Promise<DirectoryData> => {
  const old=cachedDirectory();
  if(!refresh && old && memory && Date.now()-memory.at<REFRESH_INTERVAL)return Promise.resolve(old);
  if(pending)return pending;
  const task=apiRequest<DirectoryData>('/service-directory').then(value=>{
    if(!validDirectory(value))throw new Error('Неверный формат каталога.');
    return remember(value);
  }).finally(()=>{if(pending===task)pending=null;});
  pending=task;
  return task;
};

export const directoryApi = {
  snapshot:cachedDirectory,
  published:publishedDirectory,
  admin: () => apiRequest<DirectoryData>('/service-directory/admin'),
  save: async (data:DirectoryData) => {
    const result=await apiRequest<{success:boolean;version:number}>('/service-directory/admin', {
      method:'PUT',
      body:JSON.stringify(data),
    });
    // Publish to the navigation cache immediately after an admin edit.
    const categories=data.categories.filter(c=>c.active)
      .sort((a,b)=>a.sort_order-b.sort_order||a.name.localeCompare(b.name));
    const visible=new Set(categories.map(c=>c.id));
    const services=data.services.filter(s=>s.active&&!!s.website_url&&visible.has(s.category_id))
      .sort((a,b)=>a.sort_order-b.sort_order||a.name.localeCompare(b.name));
    remember({version:result.version,categories,services});
    return result;
  }
};
