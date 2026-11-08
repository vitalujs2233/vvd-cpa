import { apiRequest, API_BASE_URL } from '@/shared/lib/api';
import { readApiSnapshot } from '@/shared/lib/viewSnapshot';
import {
  Search, Megaphone, Target, MousePointerClick, BarChart3, TrendingUp, PieChart, Activity, Filter, Network, Link2, Share2, Sparkles, Bot, Brain, Wand2, Palette, Image, Video, Camera, Clapperboard, PenTool, Lightbulb, Music, Mic, BookOpen, Monitor, Laptop, Smartphone, Globe2, Server, Cloud, Database, Cpu, Code2, Terminal, Shield, Lock, Key, Fingerprint, Settings2, Wrench, Phone, Mail, MessageCircle, Users, Briefcase, Building2, Store, Wallet, CreditCard, Coins, Gift, Tag, ShoppingCart, Star, Crown, Rocket, Zap, Flame, MapPin, Layers, LayoutGrid, Package,
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
  icon: string;
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
  search: Search,
  megaphone: Megaphone,
  target: Target,
  mouse: MousePointerClick,
  chart: BarChart3,
  trending: TrendingUp,
  pie: PieChart,
  activity: Activity,
  filter: Filter,
  network: Network,
  link: Link2,
  share: Share2,
  sparkles: Sparkles,
  bot: Bot,
  brain: Brain,
  wand: Wand2,
  palette: Palette,
  image: Image,
  video: Video,
  camera: Camera,
  clapper: Clapperboard,
  pen: PenTool,
  lightbulb: Lightbulb,
  music: Music,
  mic: Mic,
  book: BookOpen,
  browser: Monitor,
  laptop: Laptop,
  smartphone: Smartphone,
  globe: Globe2,
  server: Server,
  cloud: Cloud,
  database: Database,
  cpu: Cpu,
  code: Code2,
  terminal: Terminal,
  shield: Shield,
  lock: Lock,
  key: Key,
  fingerprint: Fingerprint,
  settings: Settings2,
  wrench: Wrench,
  phone: Phone,
  mail: Mail,
  chat: MessageCircle,
  users: Users,
  briefcase: Briefcase,
  building: Building2,
  store: Store,
  wallet: Wallet,
  credit: CreditCard,
  coins: Coins,
  gift: Gift,
  tag: Tag,
  cart: ShoppingCart,
  star: Star,
  crown: Crown,
  rocket: Rocket,
  zap: Zap,
  flame: Flame,
  map: MapPin,
  layers: Layers,
  grid: LayoutGrid,
  package: Package,
};
export const directoryIconGroups = ["Реклама","Контент","Технологии","Бизнес"] as const;
export const directoryIconOptions: {id:string;label:string;group:string}[] = [
  {id:'search',label:'Поиск',group:'Реклама'},
  {id:'megaphone',label:'Реклама',group:'Реклама'},
  {id:'target',label:'Таргетинг',group:'Реклама'},
  {id:'mouse',label:'Клики',group:'Реклама'},
  {id:'chart',label:'Аналитика',group:'Реклама'},
  {id:'trending',label:'Рост',group:'Реклама'},
  {id:'pie',label:'Статистика',group:'Реклама'},
  {id:'activity',label:'Активность',group:'Реклама'},
  {id:'filter',label:'Фильтры',group:'Реклама'},
  {id:'network',label:'Рекламная сеть',group:'Реклама'},
  {id:'link',label:'Ссылки',group:'Реклама'},
  {id:'share',label:'Распространение',group:'Реклама'},
  {id:'sparkles',label:'Искусственный интеллект',group:'Контент'},
  {id:'bot',label:'Бот',group:'Контент'},
  {id:'brain',label:'Нейросеть',group:'Контент'},
  {id:'wand',label:'Генерация',group:'Контент'},
  {id:'palette',label:'Дизайн',group:'Контент'},
  {id:'image',label:'Изображения',group:'Контент'},
  {id:'video',label:'Видео',group:'Контент'},
  {id:'camera',label:'Камера',group:'Контент'},
  {id:'clapper',label:'Видеомонтаж',group:'Контент'},
  {id:'pen',label:'Редактор',group:'Контент'},
  {id:'lightbulb',label:'Идеи',group:'Контент'},
  {id:'music',label:'Музыка',group:'Контент'},
  {id:'mic',label:'Аудио',group:'Контент'},
  {id:'book',label:'Обучение',group:'Контент'},
  {id:'browser',label:'Браузер',group:'Технологии'},
  {id:'laptop',label:'Ноутбук',group:'Технологии'},
  {id:'smartphone',label:'Смартфон',group:'Технологии'},
  {id:'globe',label:'Сайты',group:'Технологии'},
  {id:'server',label:'Сервер',group:'Технологии'},
  {id:'cloud',label:'Облако',group:'Технологии'},
  {id:'database',label:'База данных',group:'Технологии'},
  {id:'cpu',label:'Процессор',group:'Технологии'},
  {id:'code',label:'Код',group:'Технологии'},
  {id:'terminal',label:'Терминал',group:'Технологии'},
  {id:'shield',label:'Защита',group:'Технологии'},
  {id:'lock',label:'Замок',group:'Технологии'},
  {id:'key',label:'Ключ',group:'Технологии'},
  {id:'fingerprint',label:'Отпечаток',group:'Технологии'},
  {id:'settings',label:'Настройки',group:'Технологии'},
  {id:'wrench',label:'Инструменты',group:'Технологии'},
  {id:'phone',label:'Телефон',group:'Бизнес'},
  {id:'mail',label:'Почта',group:'Бизнес'},
  {id:'chat',label:'Сообщения',group:'Бизнес'},
  {id:'users',label:'Пользователи',group:'Бизнес'},
  {id:'briefcase',label:'Работа',group:'Бизнес'},
  {id:'building',label:'Компания',group:'Бизнес'},
  {id:'store',label:'Магазин',group:'Бизнес'},
  {id:'wallet',label:'Кошелёк',group:'Бизнес'},
  {id:'credit',label:'Оплата',group:'Бизнес'},
  {id:'coins',label:'Монеты',group:'Бизнес'},
  {id:'gift',label:'Подарок',group:'Бизнес'},
  {id:'tag',label:'Скидки',group:'Бизнес'},
  {id:'cart',label:'Покупки',group:'Бизнес'},
  {id:'star',label:'Звезда',group:'Бизнес'},
  {id:'crown',label:'Премиум',group:'Бизнес'},
  {id:'rocket',label:'Запуск',group:'Бизнес'},
  {id:'zap',label:'Молния',group:'Бизнес'},
  {id:'flame',label:'Огонь',group:'Бизнес'},
  {id:'map',label:'География',group:'Бизнес'},
  {id:'layers',label:'Слои',group:'Бизнес'},
  {id:'grid',label:'Каталог',group:'Бизнес'},
  {id:'package',label:'Пакет',group:'Бизнес'},
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
  uploadImage: async (id:string,image:File) => {
    const body=new FormData();
    body.append('image',image);
    const uploaded=await apiRequest<{image_url:string}>(
      '/service-directory/admin/images/'+encodeURIComponent(id),{method:'POST',body}
    );
    return API_BASE_URL+uploaded.image_url;
  },
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
