import {currentSignedSession} from './browserSession';
// Display only; always refresh on mount. Never used to authorize financial operations.
let session = '';
const snapshots = new Map<string, unknown>();
function scope() {
  const current = currentSignedSession();
  if (current !== session) { snapshots.clear(); session = current; }
}
export function readSnapshot<T>(key: string): T | undefined {
  scope(); return snapshots.get(key) as T | undefined;
}
export function saveSnapshot<T>(key: string, value: T) {
  scope();
  if (snapshots.size >= 1000 && !snapshots.has(key)) snapshots.delete(snapshots.keys().next().value!);
  snapshots.set(key, value);
}

export const readApiSnapshot=<T=any>(path:string)=>readSnapshot<T>('api:'+path);
