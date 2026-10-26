// CI-only entry: real local HTTP handlers; never imported by the production app.
import React from 'react';
import {createRoot} from 'react-dom/client';
import {MemoryRouter,Routes,Route} from 'react-router-dom';
import '../src/index.css';
import {ToolsProxy,MyProxies} from '../src/pages/tools/MarketplacePages';
import {marketApi} from '../src/pages/tools/marketApi';
const root='http://127.0.0.1:3012/tools-market/proxy-ipv4';
async function request(path:string,body?:unknown){
 const r=await fetch(root+path,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});
 const data=await r.json();if(!r.ok)throw Error(JSON.stringify(data));return data;
}
marketApi.proxyIpv4CheckoutConfig=()=>request('/checkout-config');
marketApi.proxyIpv4Catalog=kind=>request('/catalog?proxy_type='+kind);
marketApi.proxyIpv4Quote=body=>request('/quote',body);
marketApi.proxyIpv4Prepare=body=>request('/orders/prepare',body);
marketApi.proxyIpv4Orders=()=>request('/orders');
marketApi.proxyIpv4OrderStatus=id=>request('/orders/'+id+'/status');
marketApi.proxyIpv4OrderProxies=id=>request('/orders/'+id+'/proxies');
marketApi.proxyIpv4Purchase=(id,controlId)=>request('/orders/'+id+'/purchase'+(controlId?'?control_id='+controlId:''),{});
createRoot(document.getElementById('root')!).render(<MemoryRouter initialEntries={['/tools/proxy']}><p className="px-4 text-xs">Изолированный тест · имитация поставщика · тестовые средства</p><Routes><Route path="/tools/proxy" element={<ToolsProxy/>}/><Route path="/tools/proxy/my" element={<MyProxies/>}/></Routes></MemoryRouter>);
