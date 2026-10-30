// Tiny IndexedDB wrapper
const open = () => new Promise((res, rej) => { const r = indexedDB.open('ava-studio', 1); r.onupgradeneeded = () => { const d = r.result; d.createObjectStore('projects', { keyPath: 'id' }); d.createObjectStore('blobs'); }; r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
let dbp; const db = () => (dbp ||= open());
const tx = async (store, mode, fn) => { const d = await db(); return new Promise((res, rej) => { const t = d.transaction(store, mode); const req = fn(t.objectStore(store)); t.oncomplete = () => res(req?.result); t.onerror = () => rej(t.error); }); };
export const put = (p) => tx('projects', 'readwrite', (s) => s.put(p));
export const all = () => tx('projects', 'readonly', (s) => s.getAll());
export const del = (id) => tx('projects', 'readwrite', (s) => s.delete(id));
export const putBlob = (k, b) => tx('blobs', 'readwrite', (s) => s.put(b, k));
export const getBlob = (k) => tx('blobs', 'readonly', (s) => s.get(k));
export const delBlob = (k) => tx('blobs', 'readwrite', (s) => s.delete(k));
