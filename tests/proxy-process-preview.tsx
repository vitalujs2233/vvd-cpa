// Test-only entry point; never imported by the production app.
import React from 'react';
import {createRoot} from 'react-dom/client';
import '../src/index.css';
import {ProxyOrders} from '../src/pages/tools/ProxyOrders';
import {marketApi} from '../src/pages/tools/marketApi';
async function start(){
 const all=await (await fetch('./proxy-process-results.json')).json();
 if(all.mock_only!==true)throw Error('Only generated mock data permitted');
 const scenario=all.scenarios[Number(new URLSearchParams(location.search).get('case')||0)];
 marketApi.proxyIpv4Orders=async()=>scenario.orders;
 marketApi.proxyIpv4OrderStatus=async()=>scenario.orders.orders[0];
 marketApi.proxyIpv4OrderProxies=async()=>scenario.delivery;
 marketApi.proxyIpv4CheckoutConfig=async()=>({purchases_enabled:false,supported_purchase_types:[]});
 marketApi.proxyIpv4Purchase=async()=>{throw Error('Browser purchases forbidden');};
 createRoot(document.getElementById('root')!).render(<main className="p-4 flex flex-col gap-4"><p>Имитация · {scenario.kind} · {scenario.phase}</p><h1>Мои прокси</h1><ProxyOrders/></main>);
}
void start();
