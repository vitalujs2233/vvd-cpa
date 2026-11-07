import { apiRequest } from '@/shared/lib/api';
import {
  Search, PanelsTopLeft, Megaphone, Sparkles, BarChart3,
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
  search: Search, browser: PanelsTopLeft, megaphone: Megaphone, sparkles: Sparkles,
  chart: BarChart3, palette: Palette, globe: Globe2, server: Server, phone: Phone, grid: LayoutGrid
};
export const directoryIconOptions = [
  {id:'search',label:'Поиск'}, {id:'browser',label:'Браузер'},
  {id:'megaphone',label:'Реклама'}, {id:'sparkles',label:'AI'},
  {id:'chart',label:'Аналитика'}, {id:'palette',label:'Дизайн'},
  {id:'globe',label:'Сайты'}, {id:'server',label:'Сервер'},
  {id:'phone',label:'Телефон'}, {id:'grid',label:'Каталог'}
];
export const directoryApi = {
  published: () => apiRequest<DirectoryData>('/service-directory'),
  admin: () => apiRequest<DirectoryData>('/service-directory/admin'),
  save: (data: DirectoryData) => apiRequest<{success:boolean;version:number}>('/service-directory/admin', {
    method:'PUT',
    body:JSON.stringify(data),
  })
};
