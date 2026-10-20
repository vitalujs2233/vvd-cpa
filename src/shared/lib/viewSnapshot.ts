// Display only; always refresh on mount. Never used to authorize financial operations.
let session = '';
const snapshots = new Map<string, unknown>();
function scope() {
  const current = window.Telegram?.WebApp?.initData || '';
  if (current !== session) { snapshots.clear(); session = current; }
}
export function readSnapshot<T>(key: string): T | undefined {
  scope(); return snapshots.get(key) as T | undefined;
}
export function saveSnapshot<T>(key: string, value: T) {
  scope();
  if (snapshots.size >= 80 && !snapshots.has(key)) snapshots.delete(snapshots.keys().next().value!);
  snapshots.set(key, value);
}
