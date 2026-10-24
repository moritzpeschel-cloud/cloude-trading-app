'use strict';
// Cloude Trading – Handy-PWA (nur lesend). Anmeldung mit View-PIN -> Sitzungs-Token (180 Tage) im Gerät; die PIN wird nicht gespeichert.
const $=s=>document.querySelector(s),esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const AAD=new TextEncoder().encode('cloude-trading-v1'),b64=s=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
const AG=[['scanner','▦','Chart-Scanner'],['news','✉','News-Monitor'],['entry','⏱','Einstiegs-Timer'],['exit','⇥','Ausstiegs-Planer'],['timemachine','∞','Time Machine'],['risk','⛨','Risiko-Manager'],
['budget','€','Budget-Manager'],['order','➤','Order-Ausführer'],['alerts','🔔','Kurs-Alarme'],['earnings','◔','Earnings-Analyst'],['congress','⚖','Politiker-Tracker'],['claude','✦','KI-Prüfer']];
const BOT='moritz_goldtrading_bot';let TOK=localStorage.getItem('ct_tok'),GL=null,SNAP=null;
// ---- Daten: GET /api/state mit Sitzungs-Token (die PIN selbst wird nie gespeichert). Offline: letzter Stand aus localStorage.
async function refresh(){try{const r=await fetch('api/state',{cache:'no-store',headers:{Authorization:'Bearer '+TOK}});
  if(r.status==401){TOK=null;localStorage.removeItem('ct_tok');return showLock('Sitzung abgelaufen – bitte PIN erneut eingeben.')}
  const j=await r.json();if(!r.ok){const c=localStorage.getItem('ct_snap');if(c)render(JSON.parse(c),true);$('#age').textContent=j.error||'Fehler';return}
  localStorage.setItem('ct_snap',JSON.stringify(j));render(j,false)}
 catch(e){const c=localStorage.getItem('ct_snap');if(c)render(JSON.parse(c),true);else $('#age').textContent='offline – keine Daten'}}
function showLock(msg){$('#lock').classList.remove('hidden');$('#app').classList.add('hidden');$('#pwmsg').textContent=msg||''}
$('#pwf').onsubmit=async ev=>{ev.preventDefault();const b=$('#pwb');b.disabled=true;b.textContent='Prüfe …';$('#pwmsg').textContent='';
 try{const r=await fetch('api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({pin:$('#pw').value})});const j=await r.json().catch(()=>({}));
  if(!r.ok)throw new Error(j.error||'Anmeldung fehlgeschlagen');TOK=j.token;localStorage.setItem('ct_tok',TOK);$('#pw').value='';$('#lock').classList.add('hidden');await refresh()}
 catch(e){$('#pwmsg').textContent=e.message==='Failed to fetch'?'Server nicht erreichbar (startet evtl. gerade – 30 s warten).':e.message}finally{b.disabled=false;b.textContent='Entsperren'}};
$('#logout').onclick=e=>{e.preventDefault();if(!confirm('Dieses Gerät abmelden?'))return;TOK=null;localStorage.removeItem('ct_tok');localStorage.removeItem('ct_snap');showLock('')};
// ---- Darstellung
const eur=v=>v==null?'–':Number(v).toLocaleString('de-DE',{minimumFractionDigits:2,maximumFractionDigits:2})+' €';
const sg=v=>v==null?'–':(v>0?'+':v<0?'−':'')+Number(Math.abs(v)).toLocaleString('de-DE',{minimumFractionDigits:2,maximumFractionDigits:2})+' €',cls=v=>v>0?'up':v<0?'dn':'';
const tm=s=>s?String(s).replace('T',' ').slice(5,16).replace(/^(\d\d)-(\d\d)/,'$2.$1.'):'';
function render(s,offline){SNAP=s;$('#app').classList.remove('hidden');$('#lock').classList.add('hidden');setTimeout(()=>{try{pushStart()}catch(e){console.warn('push',e)}},0);
 const age=Math.max(0,Date.now()/1000-s.gen),a=$('#age');a.textContent=(offline?'offline · ':'')+'Stand '+new Date(s.gen*1000).toLocaleTimeString('de-DE',{hour:'2-digit',minute:'2-digit'})+(age>90?` (vor ${Math.round(age/60)} Min.)`:'');a.className='age'+(age>300?' stale':'');
 const ch=(c,t)=>`<span class="chip ${c}"><i></i>${t}</span>`;
 $('#chips').innerHTML=ch(s.connected?'ok':'bad',s.mode=='LIVE-DEMO'?(s.connected?'Demo verbunden':'Demo getrennt'):'Paper-Modus')+ch(s.kill?'bad':'ok',s.kill?'Not-Aus AN':'Not-Aus aus')
  +ch(s.auto.on?(s.mode=='LIVE-DEMO'&&!s.auto.armed?'warn':'ok'):'bad','Auto '+(s.auto.on?(s.mode=='LIVE-DEMO'&&!s.auto.armed?'AN (nicht freigegeben)':'AN'):'AUS'))+(s.limits?ch('ok','Limits '+esc(s.limits)):'')+(age>300?ch('warn','Bot sendet nicht'):'');
 const c=(l,v,k,sub)=>`<div><div class="l">${l}</div><div class="v ${k||''}">${v}</div>${sub?`<div class="s">${sub}</div>`:''}</div>`,A=s.acc;
 $('#acc').innerHTML=c('Kontostand',eur(A.balance),'',s.mode=='LIVE-DEMO'?'Demo':'Paper')+c('Equity',eur(A.equity))+c('Winrate',A.winrate==null?'–':Math.round(A.winrate*100)+' %','',`${A.wins||0} G / ${A.losses||0} V`)
  +c('Heute',sg(A.today),cls(A.today))+c('Woche',sg(A.week),cls(A.week))+c('Monat',sg(A.month),cls(A.month));
 if(!$('#cards').children.length)$('#cards').innerHTML=AG.map(([k,ic,nm])=>`<div class="agent" id="ag-${k}"><div class="ic">${ic}</div><div class="tx"><div class="nm">${nm}<span class="st" id="st-${k}">idle</span></div><div class="rs" id="rs-${k}">–</div></div></div>`).join('');
 for(const [k] of AG){const g=s.agents[k];if(!g)continue;const st=$('#st-'+k);st.className='st '+(g.s||'');st.textContent={working:'arbeitet',done:'fertig',error:'fehler'}[g.s]||g.s||'idle';$('#rs-'+k).textContent=g.t||'–'}
 const B='https://t.me/'+BOT+'?start=',L=(cmd,t,k)=>`<a class="${k||''}" href="${B+cmd}" data-c="${cmd}">${t}</a>`;
 $('#ctl').innerHTML=L('status','📊 Status')+L('notaus','🛑 Not-Aus','red')+L('weiter','✅ Weiter','green')+L('auto_an','🤖 Auto an','green')+L('auto_aus','⏸ Auto aus','red')+L('notaus_alles','⛔ Alles schließen','red');
 $('#ctl').querySelectorAll('a').forEach(x=>x.onclick=e=>{const m={notaus_alles:'Not-Aus und ALLE Positionen schließen?',notaus:'Not-Aus einschalten?',weiter:'Not-Aus ausschalten?',auto_aus:'Auto-Trading ausschalten?',auto_an:'Auto-Trading einschalten?'}[x.dataset.c];if(m&&!confirm(m+' (Telegram öffnet sich)'))e.preventDefault()});
 $('#pos').innerHTML=s.pos.length?s.pos.map(p=>`<div class="row"><div class="a"><b>${esc(p.side=='buy'?'KAUF':'VERKAUF')} ${esc(p.vol)} ${esc(p.sym)}</b><b class="${cls(p.pnl)}">${sg(p.pnl)}</b></div><div class="b">Einstieg ${esc(p.entry)} · SL ${esc(p.sl)} · TP ${esc(p.tp)} · ${tm(p.open)}</div></div>`).join(''):'<div class="muted">Keine offenen Positionen.</div>';
 $('#hist').innerHTML=s.hist.length?s.hist.map(h=>`<div class="row"><div class="a"><span>${esc(h.side=='buy'?'KAUF':'VERKAUF')} ${esc(h.vol)} ${esc(h.sym)}</span><b class="${cls(h.pnl)}">${sg(h.pnl)}</b></div><div class="b">${tm(h.close)} · ${esc(h.reason)}</div></div>`).join(''):'<div class="muted">Noch keine geschlossenen Trades.</div>';
 $('#dec').innerHTML=s.dec.length?s.dec.map(d=>`<div class="row"><div class="b">${tm(d.t)}</div><div>${esc(d.text)}</div>${(d.h||[]).map(h=>`<span class="hch ${esc(h.e||'')}" title="${esc(h.t)}">${esc(h.n)}${h.e?' · '+esc(h.e):''}</span>`).join('')}</div>`).join(''):'<div class="muted">Noch keine Entscheidungen.</div>';
 $('#foot').textContent=`Zyklen ${s.auto.cycles??'–'} · letzter Zyklus ${tm(s.auto.last)||'–'} · ${s.auto.result||''}`;
 if(!GL)GL=globe($('#globe'));
 // Beam + Blitz für neu fertig gewordene Helfer (seit letztem Snapshot)
 const ids=(s.events||[]).map(e=>e.id),mx=ids.length?Math.max(...ids):0;let seen=+(localStorage.getItem('ct_ev')||0);if(mx<seen)seen=0; // Bot neu gestartet -> IDs beginnen neu
 const neu=(s.events||[]).filter(e=>e.id>seen);localStorage.setItem('ct_ev',mx);
 if(seen&&neu.length){const ks=[...new Set(neu.map(e=>e.a))].slice(0,6);ks.forEach((k,i)=>setTimeout(()=>{const el=$('#ag-'+k);if(el)beam(el)},350+i*450))}}
function beam(card){const svg=$('#beams'),cv=$('#globe');if(!svg||!cv||!GL)return;const m=$('#app').getBoundingClientRect(),a=card.getBoundingClientRect(),g=cv.getBoundingClientRect();
 const x1=a.left+a.width/2-m.left,y1=a.top-m.top,cx=g.left+g.width/2-m.left,cy=g.top+g.height/2-m.top;const tgt=GL.randomFront(x1<cx);const x2=cx+tgt.x,y2=cy+tgt.y,mx=(x1+x2)/2,my=(y1+y2)/2;
 const ns='http://www.w3.org/2000/svg',id='g'+Math.random().toString(36).slice(2);
 svg.insertAdjacentHTML('beforeend',`<defs><linearGradient id="${id}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#0a84ff" stop-opacity=".1"/><stop offset="1" stop-color="#7cc4ff"/></linearGradient><filter id="f${id}"><feGaussianBlur stdDeviation="3"/></filter></defs>`);
 const d=`M${x1},${y1} Q${mx},${my} ${x2},${y2}`,p1=document.createElementNS(ns,'path'),p2=document.createElementNS(ns,'path'),dot=document.createElementNS(ns,'circle');
 [p1,p2].forEach((p,i)=>{p.setAttribute('d',d);p.setAttribute('fill','none');p.setAttribute('stroke',`url(#${id})`);p.setAttribute('stroke-width',i?2:7);p.setAttribute('stroke-linecap','round');if(!i)p.setAttribute('filter',`url(#f${id})`);svg.append(p)});
 dot.setAttribute('r',5);dot.setAttribute('fill','#dff1ff');svg.append(dot);const Lg=p2.getTotalLength();[p1,p2].forEach(p=>{p.style.strokeDasharray=Lg;p.style.strokeDashoffset=Lg});card.classList.add('flash');
 const t0=performance.now(),T=900;(function step(t){const k=Math.min(1,(t-t0)/T),e=1-Math.pow(1-k,3);[p1,p2].forEach(p=>p.style.strokeDashoffset=Lg*(1-e));const pt=p2.getPointAtLength(Lg*e);dot.setAttribute('cx',pt.x);dot.setAttribute('cy',pt.y);
  if(k<1)requestAnimationFrame(step);else{GL.hit(tgt);dot.remove();setTimeout(()=>card.classList.remove('flash'),500);const t1=performance.now();(function fade(t){const q=Math.min(1,(t-t1)/700);[p1,p2].forEach(p=>p.style.opacity=1-q);if(q<1)requestAnimationFrame(fade);else{p1.remove();p2.remove()}})(t1)}})(t0)}
// ---- Trade-Mitteilungen (Web-Push wie beim Gold Bot) + Verlauf + Toast, solange die App offen ist
const pushOK=()=>'serviceWorker'in navigator&&'PushManager'in window&&'Notification'in window,iOS=/iPhone|iPad|iPod/.test(navigator.userAgent),
 standalone=()=>matchMedia('(display-mode: standalone)').matches||navigator.standalone===true;let PINFO='';
const u8=s=>{const p='='.repeat((4-s.length%4)%4);return Uint8Array.from(atob((s+p).replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0))},
 keyOf=sub=>{try{return btoa(String.fromCharCode(...new Uint8Array(sub.options.applicationServerKey))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'')}catch(_){return''}};
const api=(p,o={})=>fetch(p,{...o,cache:'no-store',headers:{'Content-Type':'application/json',Authorization:'Bearer '+TOK,...(o.headers||{})}});
async function subscribe(ask){
 if(!pushOK()){PINFO=iOS&&!standalone()?'iPhone: zuerst in Safari „Teilen → Zum Home-Bildschirm“, dann die App vom Home-Bildschirm öffnen (iOS 16.4+).':'Dieser Browser unterstützt keine Mitteilungen.';return pushUI()}
 try{if(ask){const r=await Notification.requestPermission();if(r!=='granted'){PINFO='Mitteilungen nicht erlaubt – in den iPhone-Einstellungen → Mitteilungen → Cloude änderbar.';return pushUI()}}
  if(Notification.permission!=='granted')return pushUI();
  const k=await (await api('api/push/key')).json();if(!k.publicKey)throw new Error('Server ohne Push-Schlüssel');
  const reg=await navigator.serviceWorker.ready;let sub=await reg.pushManager.getSubscription();
  if(sub&&keyOf(sub)&&keyOf(sub)!==k.publicKey){await sub.unsubscribe();sub=null}
  if(!sub)sub=await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:u8(k.publicKey)});
  const r=await api('api/push/subscribe',{method:'POST',body:JSON.stringify({subscription:sub.toJSON()})});if(!r.ok)throw new Error('Server '+r.status);
  localStorage.setItem('ct_push','1');if(ask)PINFO='Mitteilungen sind aktiv ✓'}
 catch(e){PINFO='Fehler: '+(e&&e.message||e)}pushUI()}
async function unsubscribe(){try{const reg=await navigator.serviceWorker.ready,sub=await reg.pushManager.getSubscription();
 if(sub){await api('api/push/unsubscribe',{method:'POST',body:JSON.stringify({subscription:sub.toJSON()})}).catch(()=>{});await sub.unsubscribe()}}catch(_){}
 localStorage.setItem('ct_push','0');PINFO='Mitteilungen sind aus.';pushUI()}
function pushUI(){if(!$('#pstat')||!$('#pbox')||!$('#pinfo'))return;const perm=pushOK()?Notification.permission:'n/a',on=perm==='granted'&&localStorage.getItem('ct_push')==='1';
 $('#pstat').textContent=perm==='n/a'?(iOS&&!standalone()?'nur in der Home-Bildschirm-App':'nicht unterstützt'):perm==='denied'?'blockiert':on?'aktiv':'aus';
 $('#pbox').innerHTML=perm==='n/a'||perm==='denied'?'':on?'<button class="ghost" id="poff">Mitteilungen ausschalten</button>':'<button id="pon">🔔 Mitteilungen erlauben</button>';
 const a=$('#pon'),b=$('#poff');if(a)a.onclick=()=>subscribe(true);if(b)b.onclick=unsubscribe;
 $('#pinfo').textContent=PINFO||'Bei jeder Eröffnung: Symbol, BUY/SELL, Lot, Einstieg, SL/TP. Bei jeder Schließung: 🟢 +Gewinn / 🔴 −Verlust in €.'}
const evc=e=>e.color==='green'?'up':e.color==='red'?'dn':'';
async function loadEvents(){try{const r=await api('api/events');if(!r.ok)return;const j=await r.json(),ev=(j.events||[]).slice(0,15);
 $('#evs').innerHTML=ev.length?ev.map(e=>`<div class="row ev e${evc(e)}"><div class="a"><b class="${evc(e)}">${esc(e.title)}</b>${e.test?'<span class="tchip">TEST</span>':''}</div><div class="b">${esc(e.body)} · ${new Date(e.t*1000).toLocaleString('de-DE',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})}</div></div>`).join(''):'<div class="muted">Noch keine Trade-Mitteilungen.</div>'}catch(_){}}
function toast(e){if(!e||!e.title)return;const t=$('#toast');t.className='toast e'+evc(e);t.innerHTML=`<b>${esc(e.title)}</b><div>${esc(e.body||'')}</div>`;t.hidden=false;
 clearTimeout(toast.t);toast.t=setTimeout(()=>t.hidden=true,7000)}
if('serviceWorker'in navigator)navigator.serviceWorker.addEventListener('message',m=>{const d=m.data||{};if(d.type==='ct-event'){toast(d.event);loadEvents();refresh()}});
let pushInit=false;function pushStart(){if(pushInit||!TOK)return;pushInit=true;pushUI();loadEvents();setInterval(()=>{if(TOK&&!document.hidden)loadEvents()},60000);
 if(localStorage.getItem('ct_push')!=='0')subscribe(false)}   // Selbstheilung: Abo bei jedem Start neu anmelden (Render verliert es beim Neustart)
// ---- Start
(async()=>{if('serviceWorker'in navigator)navigator.serviceWorker.register('sw.js',{updateViaCache:'none'}).then(r=>r.update()).catch(()=>{});
 if(!TOK)showLock('');else await refresh();
 setInterval(()=>{if(TOK&&!document.hidden)refresh()},15000);document.addEventListener('visibilitychange',()=>{if(!document.hidden&&TOK)refresh()})})();
