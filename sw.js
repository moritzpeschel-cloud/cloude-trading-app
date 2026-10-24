// App-Hülle: NETWORK-FIRST (immer aktuelle Version vom Server, Cache nur als Offline-Notnagel). /api/* wird nie gecacht.
// Neue Version wird sofort aktiv (skipWaiting + clients.claim), alte Caches werden gelöscht. Bei jeder Änderung V hochzählen.
const V='ct-v8',SHELL=['./','index.html','style.css','app.js','globe.js','manifest.webmanifest','icons/icon-192.png','icons/apple-touch-icon.png'];
self.addEventListener('install',e=>{self.skipWaiting();e.waitUntil(caches.open(V).then(c=>Promise.all(SHELL.map(u=>fetch(u,{cache:'no-store'}).then(r=>r.ok&&c.put(u,r)).catch(()=>{})))))});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==V).map(k=>caches.delete(k)))).then(()=>self.clients.claim()))});
self.addEventListener('message',e=>{if(e.data==='skipWaiting')self.skipWaiting()});
self.addEventListener('fetch',e=>{const q=e.request,u=new URL(q.url);if(q.method!=='GET'||u.origin!==location.origin||u.pathname.includes('/api/')||u.pathname==='/healthz')return;
 const nav=q.mode==='navigate'||(q.headers.get('accept')||'').includes('text/html');
 e.respondWith((async()=>{const c=await caches.open(V);
  try{const n=await fetch(q,{cache:'no-store'});if(n.ok&&n.type==='basic')c.put(nav?'./':q,n.clone());return n}
  catch(err){const hit=await c.match(nav?'./':q,{ignoreSearch:nav})||(nav&&await c.match('index.html'));if(hit)return hit;
   return new Response(nav?'<meta charset="utf-8"><body style="background:#03050b;color:#ccc;font:16px system-ui;padding:40px">Server nicht erreichbar – in 30 s erneut öffnen.</body>':'',{status:503,headers:{'Content-Type':nav?'text/html; charset=utf-8':'text/plain'}})}})())});
// Trade-Mitteilungen (Web-Push, wie Gold Bot). Text kommt fertig vom Server: 🟢/🔴 + Betrag im Titel, grünes/rotes Symbol.
self.addEventListener('push',e=>{let d={};try{d=e.data?e.data.json():{}}catch(_){d={title:'Cloude Trading',body:e.data?e.data.text():''}}
 e.waitUntil(Promise.all([self.registration.showNotification(d.title||'Cloude Trading',{body:d.body||'',tag:d.tag||undefined,renotify:!!d.tag,icon:d.icon||'icons/icon-192.png',
  badge:'icons/icon-192.png',data:{id:d.id},timestamp:Date.now()}),
  self.clients.matchAll({type:'window',includeUncontrolled:true}).then(cs=>cs.forEach(c=>c.postMessage({type:'ct-event',event:d})))]))});
self.addEventListener('notificationclick',e=>{e.notification.close();e.waitUntil(self.clients.matchAll({type:'window',includeUncontrolled:true}).then(cs=>{
 for(const c of cs)if('focus'in c)return c.focus();return self.clients.openWindow('./')}))});
