import {apiRequest} from './api';
import {currentSignedSession} from './browserSession';
import {readApiSnapshot} from './viewSnapshot';

/** Shared signed-session prefetch queue for VVD CPA screens. */
type Job={
  session:string;priority:number;task:()=>Promise<unknown>;
  resolve:(value:unknown)=>void;reject:(error:unknown)=>void;
};
let session='';
let running=0;
let queue:Job[]=[];
const pending=new Map<string,Promise<unknown>>();
const MAX_PARALLEL=3;

function signedSession(){
  const current=currentSignedSession();
  if(current!==session){
    for(const job of queue)job.reject(new Error('Сессия изменилась'));
    queue=[];
    pending.clear();
    session=current;
  }
  return current;
}
function runQueue(){
  while(running<MAX_PARALLEL&&queue.length){
    queue.sort((a,b)=>b.priority-a.priority);
    const job=queue.shift()!;
    if(job.session!==signedSession()){job.reject(new Error('Сессия изменилась'));continue;}
    running++;
    void Promise.resolve().then(job.task).then(value=>{
      if(job.session===signedSession())job.resolve(value);
      else job.reject(new Error('Сессия изменилась'));
    },job.reject).finally(()=>{running--;runQueue();});
  }
}
/** Queue a read without changing the live page's own refresh semantics. */
export function warmTask<T>(key:string,task:()=>Promise<T>,priority=10):Promise<T>{
  const current=signedSession();
  if(!current)return Promise.reject(new Error('Нужна авторизация Telegram'));
  const token=JSON.stringify([current,key]);
  const existing=pending.get(token);
  if(existing)return existing as Promise<T>;
  let resolve!:(value:unknown)=>void;
  let reject!:(error:unknown)=>void;
  const promise=new Promise<unknown>((res,rej)=>{resolve=res;reject=rej;});
  pending.set(token,promise);
  void promise.then(()=>{if(pending.get(token)===promise)pending.delete(token);},
    ()=>{if(pending.get(token)===promise)pending.delete(token);});
  queue.push({session:current,priority,task,resolve,reject});
  runQueue();
  return promise as Promise<T>;
}
/** Preload a page using the same snapshot read by its mounted screen. */
export function warmApiPage<T=unknown>(path:string,priority=10):Promise<T|undefined>{
  const cached=readApiSnapshot<T>(path);
  if(cached!==undefined)return Promise.resolve(cached);
  return warmTask('api:'+path,()=>apiRequest<T>(path),priority);
}
