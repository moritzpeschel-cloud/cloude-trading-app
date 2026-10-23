// Offline-Cache für die App-Hülle (cache-first, im Hintergrund aktualisiert). /api/* wird nie gecacht.
const V='ct-v3',SHELL=['./','index.html','style.css','app.js','globe.js','manifest.webmanifest','icons/icon-192.png','icons/apple-touch-icon.png'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(V).then(c=>c.addAll(SHELL)).then(()=>self.skipWaiting()))});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==V).map(k=>caches.delete(k)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',e=>{const u=new URL(e.request.url);if(e.request.method!=='GET'||u.origin!==location.origin||u.pathname.includes('/api/'))return;
 e.respondWith(caches.open(V).then(c=>c.match(e.request).then(hit=>{const net=fetch(e.request).then(n=>{if(n.ok)c.put(e.request,n.clone());return n}).catch(()=>hit);return hit||net})))});
