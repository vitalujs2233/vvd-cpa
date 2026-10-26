// Isolated screenshot fixture: never imported by the application entry point.
import React from 'react';
import {createRoot} from 'react-dom/client';
import '../src/index.css';
import {MemoryRouter,Routes,Route} from 'react-router-dom';
import {ToolsProxy} from '../src/pages/tools/MarketplacePages';
import {ProxyOrders} from '../src/pages/tools/ProxyOrders';
import {marketApi} from '../src/pages/tools/marketApi';
const mobile=new URLSearchParams(location.search).has('mobile');
const partial=new URLSearchParams(location.search).has('partial');
const order={id:'fixture-order',proxy_type:'ipv4',selection:{country:'DEU',days:30,count:partial?5:1},amount_usd:'12.50',status:'fulfilled',created_at:'2026-10-25T12:00:00Z'};
marketApi.proxyIpv4Orders=async()=>({orders:[order],purchases_enabled:false});
marketApi.proxyIpv4CheckoutConfig=async()=>({purchases_enabled:false,supported_purchase_types:[]});
marketApi.proxyIpv4OrderProxies=async()=>({status:'fulfilled',expected_count:order.selection.count,delivery_pending:partial,proxies:[{id:'fixture-ip',host:'192.0.2.10',endpoints:[{protocol:'HTTPS',port:'8080'},{protocol:'SOCKS5',port:'1080'}],login:'demo-user',password:'example-only',expires_at:'2026-11-25T12:00:00Z'}]});
marketApi.proxyIpv4Purchase=async()=>{throw new Error('Purchases forbidden in fixture');};
if(mobile){
  marketApi.proxyIpv4CheckoutConfig=async()=>({purchases_enabled:true,supported_purchase_types:['ipv6'],unsupported_reason:'Покупка временно недоступна: поставщик не связывает выданные прокси с заказом. Безопасная автоматическая выдача ещё не подтверждена.'});
  marketApi.proxyIpv4Catalog=async type=>({type,minimum_count:1,purchases_enabled:false,data:{countries:[{code:'GBR',name:'England'}],days:[3],tariffs:[{country:'GBR',mobileOperator:[{name:'three_unitedkingdom',rotationTime:[0]}]}]}});
  marketApi.proxyIpv4Quote=async()=>({customer_total_usd:'33.80',purchases_enabled:false});
  marketApi.proxyIpv4Prepare=async selection=>{
    const prepared={...order,id:'11111111-1111-4111-8111-111111111111',proxy_type:selection.proxy_type,selection:{country:selection.country,days:selection.days,count:selection.count},amount_usd:'33.80',status:'prepared'};
    marketApi.proxyIpv4Orders=async()=>({orders:[prepared],purchases_enabled:false});
    return {id:prepared.id,status:'prepared',customer_total_usd:'33.80'};
  };
}
createRoot(document.getElementById('root')!).render(mobile?<MemoryRouter><Routes><Route path="/" element={<ToolsProxy/>}/><Route path="/tools/proxy/my" element={<main className="p-4"><h1>Мои прокси</h1><ProxyOrders/></main>}/></Routes></MemoryRouter>:<main className="flex flex-col gap-4 p-4 pb-12"><p className="text-xs text-textSecondary">Тестовые данные · без покупки</p><h1 className="text-xl font-bold">Мои прокси</h1><ProxyOrders/></main>);
