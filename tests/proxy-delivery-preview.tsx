// Isolated screenshot fixture: never imported by the application entry point.
import React from 'react';
import {createRoot} from 'react-dom/client';
import '../src/index.css';
import {ProxyOrders} from '../src/pages/tools/ProxyOrders';
import {marketApi} from '../src/pages/tools/marketApi';
const partial=new URLSearchParams(location.search).has('partial');
const order={id:'fixture-order',proxy_type:'ipv4',selection:{country:'DEU',days:30,count:partial?5:1},amount_usd:'12.50',status:'fulfilled',created_at:'2026-10-25T12:00:00Z'};
marketApi.proxyIpv4Orders=async()=>({orders:[order],purchases_enabled:false});
marketApi.proxyIpv4CheckoutConfig=async()=>({purchases_enabled:false,supported_purchase_types:[]});
marketApi.proxyIpv4OrderProxies=async()=>({status:'fulfilled',expected_count:order.selection.count,delivery_pending:partial,proxies:[{id:'fixture-ip',host:'192.0.2.10',endpoints:[{protocol:'HTTPS',port:'8080'},{protocol:'SOCKS5',port:'1080'}],login:'demo-user',password:'example-only',expires_at:'2026-11-25T12:00:00Z'}]});
marketApi.proxyIpv4Purchase=async()=>{throw new Error('Purchases forbidden in fixture');};
createRoot(document.getElementById('root')!).render(<main className="flex flex-col gap-4 p-4 pb-12"><p className="text-xs text-textSecondary">Тестовые данные · без покупки</p><h1 className="text-xl font-bold">Мои прокси</h1><ProxyOrders/></main>);
