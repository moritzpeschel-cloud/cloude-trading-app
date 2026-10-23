// Offline-Cache für die App-Hülle (cache-first, im Hintergrund aktualisiert). /api/* wird nie gecacht.
const V='ct-v5',SHELL=['./','index.html','style.css','app.js','globe.js','manifest.webmanifest','icons/icon-192.png','icons/apple-touch-icon.png'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(V).then(c=>c.addAll(SHELL)).then(()=>self.skipWaiting()))});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==V).map(k=>caches.delete(k)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',e=>{const u=new URL(e.request.url);if(e.request.method!=='GET'||u.origin!==location.origin||u.pathname.includes('/api/'))return;
 e.respondWith(caches.open(V).then(c=>c.match(e.request).then(hit=>{const net=fetch(e.request).then(n=>{if(n.ok)c.put(e.request,n.clone());return n}).catch(()=>hit);return hit||net})))});
// Trade-Mitteilungen (Web-Push, wie Gold Bot). Text kommt fertig vom Server: 🟢/🔴 + Betrag im Titel, grünes/rotes Symbol.
self.addEventListener('push',e=>{let d={};try{d=e.data?e.data.json():{}}catch(_){d={title:'Cloude Trading',body:e.data?e.data.text():''}}
 e.waitUntil(Promise.all([self.registration.showNotification(d.title||'Cloude Trading',{body:d.body||'',tag:d.tag||undefined,renotify:!!d.tag,icon:d.icon||'icons/icon-192.png',
  badge:'icons/icon-192.png',data:{id:d.id},timestamp:Date.now()}),
  self.clients.matchAll({type:'window',includeUncontrolled:true}).then(cs=>cs.forEach(c=>c.postMessage({type:'ct-event',event:d})))]))});
self.addEventListener('notificationclick',e=>{e.notification.close();e.waitUntil(self.clients.matchAll({type:'window',includeUncontrolled:true}).then(cs=>{
 for(const c of cs)if('focus'in c)return c.focus();return self.clients.openWindow('./')}))});
