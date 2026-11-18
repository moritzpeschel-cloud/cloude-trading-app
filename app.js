'use strict';
// MP Trading Dashboard v2 – Handy-PWA (nur lesend). Anmeldung mit View-PIN -> Sitzungs-Token (180 Tage) im Gerät; die PIN wird nicht gespeichert.
// Ansichten: Übersicht · Trades · Helfer (Globus) · Analyse · Mehr. Alle Kennzahlen werden lokal aus dem Bot-Snapshot berechnet.
const $=s=>document.querySelector(s),$$=s=>[...document.querySelectorAll(s)],esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
// Die 11 Helfer im Ring um den Globus (k, Icon, Name, Kurzname, Aufgabe) + KI-Prüfer
const AG=[['scanner','▦','Chart-Scanner','Scanner','scannt Charts nach Ausbrüchen'],['news','✉','News-Monitor','News','liest Schlagzeilen'],['entry','⏱','Einstiegs-Timer','Einstieg','wartet auf Kerzenschluss'],
['exit','⇥','Ausstiegs-Planer','Ausstieg','setzt SL & TP'],['timemachine','∞','Time Machine','Time M.','10.000 Zukünfte'],['risk','⛨','Risiko-Manager','Risiko','Limits pro Trade / Tag'],
['budget','€','Budget-Manager','Budget','Konto & Tages-P/L'],['order','➤','Order-Ausführer','Order','führt geprüfte Orders aus'],['alerts','🔔','Kurs-Alarme','Alarme','beobachtet Preise'],
['earnings','◔','Earnings-Analyst','Earnings','Termine & Zahlen'],['congress','⚖','Politiker-Tracker','Politiker','STOCK-Act-Meldungen']];
const KI=['claude','✦','KI-Prüfer','KI','prüft jede Order'],ALL=[...AG,KI];
const BOT='moritz_goldtrading_bot';let TOK=localStorage.getItem('ct_tok'),GL=null,SNAP=null,OPEN=null,VIEW='home';
// ---- lokale Einstellungen (nur dieses Gerät)
const SET=Object.assign({theme:'auto',priv:false,anim:true,goal:0,ctype:'pl',crange:'all',tfilt:'all'},JSON.parse(localStorage.getItem('ct_set')||'{}'));
const saveSet=()=>localStorage.setItem('ct_set',JSON.stringify(SET));
const tap=()=>{try{navigator.vibrate&&navigator.vibrate(8)}catch(_){}};

// ================= Daten =================
async function refresh(){const rb=$('#brefresh');rb&&rb.classList.add('spin');
 try{const r=await fetch('api/state',{cache:'no-store',headers:{Authorization:'Bearer '+TOK}});
  if(r.status==401){TOK=null;localStorage.removeItem('ct_tok');return showLock('Sitzung abgelaufen – bitte PIN erneut eingeben.')}
  const j=await r.json();if(!r.ok){const c=localStorage.getItem('ct_snap');if(c)render(JSON.parse(c),true);else showApp();$('#age').textContent=j.error||'Fehler';return}
  localStorage.setItem('ct_snap',JSON.stringify(j));render(j,false)}
 catch(e){const c=localStorage.getItem('ct_snap');if(c)render(JSON.parse(c),true);else{showApp();$('#age').textContent='offline – keine Daten'}}
 finally{setTimeout(()=>rb&&rb.classList.remove('spin'),400)}}
function showLock(msg){$('#lock').classList.remove('hidden');$('#app').classList.add('hidden');$('#pwmsg').textContent=msg||''}
function showApp(){$('#app').classList.remove('hidden');$('#lock').classList.add('hidden')}
$('#pwf').onsubmit=async ev=>{ev.preventDefault();const b=$('#pwb');b.disabled=true;b.textContent='Prüfe …';$('#pwmsg').textContent='';
 try{const r=await fetch('api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({pin:$('#pw').value})});const j=await r.json().catch(()=>({}));
  if(!r.ok)throw new Error(j.error||'Anmeldung fehlgeschlagen');TOK=j.token;localStorage.setItem('ct_tok',TOK);$('#pw').value='';$('#lock').classList.add('hidden');await refresh()}
 catch(e){$('#pwmsg').textContent=e.message==='Failed to fetch'?'Server nicht erreichbar (startet evtl. gerade – 30 s warten).':e.message}finally{b.disabled=false;b.textContent='Entsperren'}};
$('#logout').onclick=e=>{e.preventDefault();if(!confirm('Dieses Gerät abmelden?'))return;TOK=null;['ct_tok','ct_snap','ct_eqh'].forEach(k=>localStorage.removeItem(k));showLock('')};

// ================= Format =================
const nf=(v,d=2)=>Number(v).toLocaleString('de-DE',{minimumFractionDigits:d,maximumFractionDigits:d});
const eur=v=>v==null||isNaN(v)?'–':nf(v)+' €';
const sg=v=>v==null||isNaN(v)?'–':(v>0?'+':v<0?'−':'')+nf(Math.abs(v))+' €',cls=v=>v>0?'up':v<0?'dn':'';
const pct=v=>v==null||isNaN(v)?'–':Math.round(v*100)+' %';
const tm=s=>s?String(s).replace('T',' ').slice(5,16).replace(/^(\d\d)-(\d\d)/,'$2.$1.'):'';
const hm=s=>s?String(s).replace('T',' ').slice(11,16):'';
const pd=t=>{if(!t)return null;const d=new Date(String(t).replace(' ','T'));return isNaN(d)?null:d};
const dk=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
const WD=['So','Mo','Di','Mi','Do','Fr','Sa'];
function dayLabel(k){const t=new Date(),y=new Date(Date.now()-864e5);if(k===dk(t))return'Heute';if(k===dk(y))return'Gestern';const d=pd(k+'T12:00');return d?`${WD[d.getDay()]}, ${k.slice(8,10)}.${k.slice(5,7)}.`:k}
const ago=d=>{const s=Math.max(0,(Date.now()-d)/1000);return s<60?'gerade eben':s<3600?`vor ${Math.round(s/60)} Min.`:s<86400?`vor ${Math.round(s/3600)} Std.`:`vor ${Math.round(s/86400)} T.`};
const M=h=>`<span class="m">${h}</span>`;
const side=s=>String(s||'').toLowerCase()==='buy'||String(s).toUpperCase()==='KAUF';
const sym3=s=>esc(String(s||'?').replace(/[^A-Za-z0-9]/g,'').slice(0,3).toUpperCase());

// ================= Kennzahlen =================
// Geschlossene Trades: bevorzugt s.trades (mit Strategie), sonst s.hist
function closed(s){const T=(s.trades||[]).filter(t=>t.st!=='open'&&t.pnl!=null);
 if(T.length)return T.map(t=>({...t,d:pd(t.t)})).sort((a,b)=>(a.d||0)-(b.d||0));
 return (s.hist||[]).filter(h=>h.pnl!=null).map(h=>({by:'–',sym:h.sym,side:h.side,vol:h.vol,pnl:+h.pnl,t:h.close,reason:h.reason,d:pd(h.close)})).sort((a,b)=>(a.d||0)-(b.d||0))}
function stats(C){const W=C.filter(t=>t.pnl>0),L=C.filter(t=>t.pnl<0),gw=W.reduce((a,t)=>a+t.pnl,0),gl=-L.reduce((a,t)=>a+t.pnl,0);
 let cur=0,curW=null,maxW=0,maxL=0,rw=0,rl=0;for(const t of C){if(t.pnl>0){rw++;rl=0}else if(t.pnl<0){rl++;rw=0}maxW=Math.max(maxW,rw);maxL=Math.max(maxL,rl)}
 for(let i=C.length-1;i>=0;i--){const w=C[i].pnl>0;if(C[i].pnl===0)break;if(curW===null)curW=w;if(w!==curW)break;cur++}
 let peak=0,dd=0,cum=0;for(const t of C){cum+=t.pnl;peak=Math.max(peak,cum);dd=Math.max(dd,peak-cum)}
 return{n:C.length,w:W.length,l:L.length,wr:C.length?W.length/C.length:null,pf:gl?gw/gl:(gw?Infinity:null),avgW:W.length?gw/W.length:null,avgL:L.length?-gl/L.length:null,
  best:C.reduce((a,t)=>!a||t.pnl>a.pnl?t:a,null),worst:C.reduce((a,t)=>!a||t.pnl<a.pnl?t:a,null),exp:C.length?(gw-gl)/C.length:null,net:gw-gl,cur,curW,maxW,maxL,dd}}
// Equity-Verlauf: jeder Snapshot speichert einen Punkt auf dem Gerät (max. 45 Tage, ≥ 2 Min. Abstand)
function eqPush(s){if(!s||!s.acc||s.acc.equity==null)return;let H=[];try{H=JSON.parse(localStorage.getItem('ct_eqh')||'[]')}catch(_){}
 const t=s.gen*1000,last=H[H.length-1];if(last&&t-last[0]<120e3){if(t>=last[0])last[1]=+s.acc.equity}else H.push([t,+s.acc.equity]);
 const cut=Date.now()-45*864e5;H=H.filter(p=>p[0]>cut).slice(-3000);localStorage.setItem('ct_eqh',JSON.stringify(H))}
const eqHist=()=>{try{return JSON.parse(localStorage.getItem('ct_eqh')||'[]')}catch(_){return[]}};

// ================= Navigation / Theme =================
function go(v){if(!$('#v-'+v))v='home';VIEW=v;localStorage.setItem('ct_view',v);$$('.view').forEach(x=>x.classList.toggle('on',x.id==='v-'+v));$$('#tabbar button').forEach(b=>b.classList.toggle('on',b.dataset.v===v));
 scrollTo({top:0});if(v==='agents')requestAnimationFrame(()=>{layoutRing();GL&&GL.resize()});if(v==='home')requestAnimationFrame(renderChart)}
$$('#tabbar button').forEach(b=>b.onclick=()=>{tap();go(b.dataset.v)});
document.addEventListener('click',e=>{const g=e.target.closest('[data-go]');if(g){tap();go(g.dataset.go)}});
const mq=matchMedia('(prefers-color-scheme: light)');
function applyTheme(){const t=SET.theme==='auto'?(mq.matches?'light':'dark'):SET.theme;document.documentElement.dataset.theme=t;
 const m=document.querySelector('meta[name=theme-color]');if(m)m.content=t==='light'?'#f2f3f7':'#07080c';segOn('#theme',SET.theme)}
mq.addEventListener&&mq.addEventListener('change',applyTheme);
function applyPriv(){document.body.classList.toggle('priv',!!SET.priv);const u=$('#bpriv use');if(u)u.setAttribute('href',SET.priv?'#i-eyeoff':'#i-eye');$$('.ltg').forEach(x=>x.checked=!!SET[x.dataset.k])}
$('#bpriv').onclick=()=>{tap();SET.priv=!SET.priv;saveSet();applyPriv()};
$('#brefresh').onclick=()=>{tap();refresh();loadEvents()};
function segOn(sel,v){$$(sel+' button').forEach(b=>b.classList.toggle('on',b.dataset.v===v))}
function seg(sel,key,cb){$$(sel+' button').forEach(b=>b.onclick=()=>{tap();SET[key]=b.dataset.v;saveSet();segOn(sel,SET[key]);cb&&cb()});segOn(sel,SET[key])}
seg('#theme','theme',applyTheme);seg('#ctype','ctype',renderChart);seg('#crange','crange',renderChart);seg('#tfilt','tfilt',()=>SNAP&&renderTrades(SNAP));
$$('.ltg').forEach(x=>x.onchange=()=>{SET[x.dataset.k]=x.checked;saveSet();applyPriv()});
const gi=$('#goal');gi.value=SET.goal||'';gi.onchange=()=>{SET.goal=Math.max(0,+gi.value||0);saveSet();SNAP&&renderKpis(SNAP)};
$('#q').oninput=()=>SNAP&&renderTrades(SNAP);

// ================= Hauptrender =================
let LASTEQ=null;
function render(s,offline){SNAP=s;s.pos=s.pos||[];s.hist=s.hist||[];s.dec=s.dec||[];s.acc=s.acc||{};s.auto=s.auto||{};s.agents=s.agents||{};
 showApp();setTimeout(()=>{try{pushStart()}catch(e){console.warn('push',e)}},0);eqPush(s);
 render.off=offline;tick();renderBanner(s);renderHome(s);renderTrades(s);renderAgents(s);renderStats(s);renderMore(s);prefsUI(s.prefs)}
// Live-Anzeige oben (läuft jede Sekunde)
function tick(){const s=SNAP;if(!s)return;const age=Math.max(0,Date.now()/1000-s.gen),d=$('#ldot');
 $('#age').textContent=(render.off?'offline · ':'')+(age<60?'Live · '+Math.round(age)+' s':'Stand '+new Date(s.gen*1000).toLocaleTimeString('de-DE',{hour:'2-digit',minute:'2-digit'})+` (${ago(s.gen*1000)})`);
 d.className=render.off||age>300?'bad':age>90?'warn':'ok'}
setInterval(tick,1000);
function renderBanner(s){const age=Date.now()/1000-s.gen,B=[];
 if(s.halt)B.push(['bad','🛑 Tageslimit erreicht – Handel bis morgen gesperrt']);if(s.kill)B.push(['bad','⛔ Not-Aus ist aktiv']);
 if(age>300)B.push(['warn',`⚠️ Bot sendet seit ${Math.round(age/60)} Min. nicht`]);$('#banner').innerHTML=B.map(([c,t])=>`<div class="bnr ${c}">${t}</div>`).join('')}

// ---- Übersicht
function countUp(el,to){const from=LASTEQ==null||!SET.anim?to:LASTEQ;LASTEQ=to;if(to==null){el.textContent='–';return}if(from===to){el.textContent=eur(to);return}
 const t0=performance.now(),T=700;(function f(t){const k=Math.min(1,(t-t0)/T),e=1-Math.pow(1-k,3);el.textContent=eur(from+(to-from)*e);if(k<1)requestAnimationFrame(f)})(t0)}
function renderHome(s){const A=s.acc;
 $('#hmode').textContent=s.mode=='LIVE-DEMO'?'Demo-Konto':'Paper';countUp($('#heq'),A.equity!=null?+A.equity:A.balance!=null?+A.balance:null);
 $('#hbal').textContent=eur(A.balance);const fl=A.equity!=null&&A.balance!=null?A.equity-A.balance:s.pos.reduce((a,p)=>a+(+p.pnl||0),0);
 $('#hflt').textContent=sg(fl);$('#hflt').className='m '+cls(fl);
 $('#periods').innerHTML=[['Heute',A.today],['Woche',A.week],['Monat',A.month]].map(([l,v])=>`<div class="per"><span>${l}</span><b class="m ${cls(v)}">${sg(v)}</b></div>`).join('');
 const ch=(c,t)=>`<span class="chip ${c}"><i></i>${t}</span>`,age=Date.now()/1000-s.gen,na=s.mode=='LIVE-DEMO'&&!s.auto.armed;
 $('#chips').innerHTML=ch(s.connected?'ok':'bad',s.mode=='LIVE-DEMO'?(s.connected?'Demo verbunden':'Demo getrennt'):'Paper-Modus')+ch(s.auto.on?(na?'warn':'ok'):'bad','Auto '+(s.auto.on?(na?'AN · nicht freigegeben':'AN'):'AUS'))
  +ch(s.kill?'bad':'ok',s.kill?'Not-Aus AN':'Not-Aus aus')+(s.limits?ch('ok','Limits '+esc(s.limits)):'')+(age>300?ch('warn','Bot sendet nicht'):'');
 renderKpis(s);
 $('#poscnt').textContent=s.pos.length||'';
 $('#pos').innerHTML=s.pos.length?s.pos.map(posCard).join(''):'<div class="empty">Keine offenen Positionen</div>';
 const H=closed(s).slice(-5).reverse();
 $('#hist').innerHTML=H.length?`<div class="tl">${H.map((t,i)=>tradeRow(t,'h'+i,1)).join('')}</div>`:'<div class="empty">Noch keine geschlossenen Trades</div>';
 bindRows('#hist',H.reduce((o,t,i)=>(o['h'+i]=t,o),{}));
 // Helfer-Kurzübersicht
 const G=ALL.map(a=>[a,s.agents[a[0]]||{}]),c=k=>G.filter(([,g])=>g.s===k).length;
 const act=G.filter(([,g])=>g.t).sort((x,y)=>({error:0,working:1,done:2}[x[1].s]??3)-({error:0,working:1,done:2}[y[1].s]??3)).slice(0,3);
 $('#agmini').innerHTML=`<div class="agm"><span class="agp working"><i></i>${c('working')} arbeiten</span><span class="agp done"><i></i>${c('done')} fertig</span>${c('error')?`<span class="agp error"><i></i>${c('error')} Fehler</span>`:''}</div>`
  +(act.length?act.map(([a,g])=>`<div class="agl"><span class="ic">${a[1]}</span><div><b>${esc(a[2])}</b><div>${esc(g.t)}</div></div></div>`).join(''):'<div class="hint">Noch keine Meldungen der Helfer.</div>');
 if(VIEW==='home')renderChart()}
function ring(p,c){const r=18,L=2*Math.PI*r,o=L*(1-Math.max(0,Math.min(1,p||0)));return`<svg class="rg ${c||''}" viewBox="0 0 46 46"><circle class="bgc" cx="23" cy="23" r="${r}"/><circle class="fgc" cx="23" cy="23" r="${r}" stroke-dasharray="${L.toFixed(1)}" stroke-dashoffset="${o.toFixed(1)}"/></svg>`}
function renderKpis(s){const A=s.acc,S=stats(closed(s)),wr=A.winrate!=null?A.winrate:S.wr,g=+SET.goal||0,td=+A.today||0;
 const pf=S.pf==null?'–':S.pf===Infinity?'∞':nf(S.pf);
 const k=[`<div class="kpi">${ring(wr)}<div class="tx"><span>Trefferquote</span><b>${pct(wr)}</b><small>${A.wins??S.w} G · ${A.losses??S.l} V</small></div></div>`,
  `<div class="kpi"><div class="kico">⚖️</div><div class="tx"><span>Profit-Faktor</span><b class="${S.pf>=1?'up':S.pf!=null?'dn':''}">${pf}</b><small>${S.n} Trades</small></div></div>`,
  g?`<button class="kpi" id="kgoal">${ring(td/g,td>=g?'up':td<0?'dn':'')}<div class="tx"><span>Tagesziel</span><b class="m">${Math.round(Math.max(0,td/g)*100)} %</b><small class="m">${sg(td)} / ${nf(g,0)} €</small></div></button>`
   :`<button class="kpi" id="kgoal"><div class="kico">🎯</div><div class="tx"><span>Tagesziel</span><b>Setzen</b><small>tippen</small></div></button>`,
  `<div class="kpi"><div class="kico">${S.curW?'🔥':S.cur?'🧊':'➖'}</div><div class="tx"><span>Serie</span><b class="${S.curW?'up':S.cur?'dn':''}">${S.cur?S.cur+'×':'–'}</b><small>${S.cur?(S.curW?'Gewinne':'Verluste')+' in Folge':'Rekord '+S.maxW+'×'}</small></div></div>`];
 $('#kpis').innerHTML=k.join('');
 $('#kgoal').onclick=()=>{tap();const v=prompt('Tagesziel in € (0 = aus)',SET.goal||'');if(v==null)return;SET.goal=Math.max(0,+String(v).replace(',','.')||0);saveSet();gi.value=SET.goal||'';renderKpis(SNAP)}}
function posCard(p){const b=side(p.side),e=+p.entry,sl=+p.sl,tp=+p.tp;let rr='';if(e&&sl&&tp&&e!==sl)rr=`R:R 1 : ${nf(Math.abs(tp-e)/Math.abs(e-sl),1)}`;const od=pd(p.open);
 return`<div class="pcard"><div class="a"><div class="ps"><span class="av ${b?'b':'s'}">${sym3(p.sym)}</span><div>${esc(p.sym)} <span class="sd ${b?'b':'s'}">${b?'BUY':'SELL'}</span><div class="hint">${esc(p.vol)} Lot</div></div></div><b class="m ${cls(p.pnl)}">${sg(p.pnl)}</b></div>
 <div class="lv"><div>Einstieg<b>${esc(p.entry??'–')}</b></div><div>Stop-Loss<b class="dn">${esc(p.sl||'–')}</b></div><div>Take-Profit<b class="up">${esc(p.tp||'–')}</b></div></div>
 <div class="ft"><span>${od?'offen '+ago(od).replace('vor ','seit '):tm(p.open)}</span><span class="rr">${rr}</span></div></div>`}
function tradeRow(t,id,full){const b=side(t.side),o=t.st==='open';
 return`<button class="ti" data-id="${id}"><span class="av ${b?'b':'s'}">${sym3(t.sym)}</span><div class="mid"><div class="r1">${esc(t.sym)} <span class="sd ${b?'b':'s'}">${b?'BUY':'SELL'}</span>${o?'<span class="op">OFFEN</span>':''}</div>
 <div class="r2">${t.by&&t.by!=='–'?esc(t.by)+' · ':''}${full?tm(t.t):(hm(t.t)||tm(t.t))} · ${esc(t.vol)} Lot${t.reason?' · '+esc(t.reason):''}</div></div><div class="rt"><b class="m ${cls(t.pnl)}">${sg(t.pnl)}</b></div></button>`}
function bindRows(sel,map){$$(sel+' .ti').forEach(x=>x.onclick=()=>{tap();const t=map[x.dataset.id];if(t)tradeSheet(t)})}
function tradeSheet(t){const b=side(t.side),kv=(k,v)=>v==null||v===''?'':`<div class="kv"><span>${k}</span><b>${v}</b></div>`;
 sheet(`<div class="sh-h"><span class="av ${b?'b':'s'}">${sym3(t.sym)}</span><div><h3>${esc(t.sym)}</h3><div>${b?'Kauf (Long)':'Verkauf (Short)'} · ${esc(t.vol)} Lot</div></div></div>
 <div class="sh-pl m ${cls(t.pnl)}">${sg(t.pnl)}</div>${kv('Status',t.st==='open'?'<span class="op">OFFEN</span>':'Geschlossen')}${kv('Gesetzt von',t.by&&t.by!=='–'?esc(t.by):null)}
 ${kv('Zeit',tm(t.t))}${kv('Grund',t.reason?esc(t.reason):null)}${kv('Einstieg',t.entry!=null?esc(t.entry):null)}${kv('Stop-Loss',t.sl?esc(t.sl):null)}${kv('Take-Profit',t.tp?esc(t.tp):null)}`)}

// ---- Chart (SVG, Finger-Scrubbing). P/L = kumuliert aus geschlossenen Trades, Equity = auf dem Gerät gesammelter Verlauf
const RANGE={'1d':864e5,'7d':7*864e5,'30d':30*864e5,all:Infinity};
function chartData(){const s=SNAP;if(!s)return[];const cut=Date.now()-RANGE[SET.crange];
 if(SET.ctype==='eq'){const P=eqHist().filter(p=>p[0]>=cut).map(p=>({x:p[0],y:p[1],l:new Date(p[0]).toLocaleString('de-DE',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})}));return P}
 const C=closed(s).filter(t=>!t.d||+t.d>=cut);let c=0;const P=[{x:0,y:0,l:'Start'}];C.forEach((t,i)=>{c+=t.pnl;P.push({x:i+1,y:c,l:`${esc(t.sym)} ${sg(t.pnl)} · ${tm(t.t)}`})});return P.length>1?P:[]}
function renderChart(){const el=$('#chart'),tip=$('#ctip');if(!el||!SNAP)return;const P=chartData(),W=el.clientWidth||340,H=150,pad=8;
 if(P.length<2){el.innerHTML=`<svg viewBox="0 0 ${W} ${H}"><text class="nod" x="${W/2}" y="${H/2}" text-anchor="middle">${SET.ctype==='eq'?'Equity-Verlauf wird ab jetzt auf diesem Gerät gesammelt':'Keine Trades in diesem Zeitraum'}</text></svg>`;tip.innerHTML='';return}
 const xs=P.map(p=>p.x),ys=P.map(p=>p.y),x0=Math.min(...xs),x1=Math.max(...xs);let y0=Math.min(...ys),y1=Math.max(...ys);if(SET.ctype==='pl'){y0=Math.min(0,y0);y1=Math.max(0,y1)}if(y1===y0){y1+=1;y0-=1}
 const X=x=>pad+(x-x0)/((x1-x0)||1)*(W-2*pad),Y=y=>pad+14+(1-(y-y0)/(y1-y0))*(H-2*pad-14);
 const up=P[P.length-1].y>=(SET.ctype==='pl'?0:P[0].y),col=up?'var(--up)':'var(--dn)',gid='cg'+(up?'u':'d');
 const d=P.map((p,i)=>(i?'L':'M')+X(p.x).toFixed(1)+','+Y(p.y).toFixed(1)).join('');
 el.innerHTML=`<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none"><defs><linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${up?'#22c55e':'#f43f5e'}" stop-opacity=".35"/><stop offset="1" stop-color="${up?'#22c55e':'#f43f5e'}" stop-opacity="0"/></linearGradient></defs>
  ${SET.ctype==='pl'?`<line class="zr" x1="0" x2="${W}" y1="${Y(0)}" y2="${Y(0)}"/>`:''}<path d="${d}L${X(x1)},${H}L${X(x0)},${H}Z" fill="url(#${gid})"/><path class="ln" d="${d}" stroke="${col}"/>
  <line class="cur" id="ccur" y1="0" y2="${H}" x1="-9" x2="-9"/><circle class="dot" id="cdot" r="5" fill="${col}" cx="${X(P[P.length-1].x)}" cy="${Y(P[P.length-1].y)}"/></svg>`;
 const def=()=>{const l=P[P.length-1],f=P[0],dv=l.y-f.y;tip.innerHTML=SET.ctype==='pl'?`Realisiert <b class="m ${cls(l.y)}">${sg(l.y)}</b> · ${P.length-1} Trades`:`<b class="m">${eur(l.y)}</b> <span class="m ${cls(dv)}">${sg(dv)}</span> im Zeitraum`;
  $('#ccur').setAttribute('x1',-9);$('#ccur').setAttribute('x2',-9);$('#cdot').setAttribute('cx',X(l.x));$('#cdot').setAttribute('cy',Y(l.y))};def();
 const sv=el.querySelector('svg'),mv=e=>{const r=sv.getBoundingClientRect(),px=(e.clientX-r.left)/r.width*W;let bi=0,bd=1e9;P.forEach((p,i)=>{const dd=Math.abs(X(p.x)-px);if(dd<bd){bd=dd;bi=i}});const p=P[bi];
  $('#ccur').setAttribute('x1',X(p.x));$('#ccur').setAttribute('x2',X(p.x));$('#cdot').setAttribute('cx',X(p.x));$('#cdot').setAttribute('cy',Y(p.y));
  tip.innerHTML=`<b class="m ${SET.ctype==='pl'?cls(p.y):''}">${SET.ctype==='pl'?sg(p.y):eur(p.y)}</b> · ${p.l}`};
 sv.onpointerdown=mv;sv.onpointermove=mv;sv.onpointerleave=def;sv.onpointerup=e=>{if(e.pointerType!=='mouse')setTimeout(def,1200)}}
addEventListener('resize',()=>{if(VIEW==='home')renderChart()});

// ---- Trades
function allTrades(s){const T=(s.trades||[]).map(t=>({...t,d:pd(t.t)}));if(T.length)return T.sort((a,b)=>(b.d||0)-(a.d||0));
 const O=s.pos.map(p=>({by:'–',sym:p.sym,side:p.side,vol:p.vol,pnl:p.pnl,t:p.open,st:'open',entry:p.entry,sl:p.sl,tp:p.tp,d:pd(p.open)}));return[...O,...closed(s).reverse()]}
let BYF='';
function renderTrades(s){const S=s.by_sum||[];
 $('#bysum').innerHTML=S.length?S.map(x=>`<button class="bycard${BYF===x.by?' sel':''}" data-by="${esc(x.by)}"><div class="bn">${esc(x.by)}</div><div class="bv m ${cls(x.pnl)}">${sg(x.pnl)}</div><div class="bs">${x.n} Trades · ${pct(x.wr)}${x.open?` · ${x.open} offen`:''}</div></button>`).join(''):'<div class="hint">Noch keine Strategie-Daten.</div>';
 $$('#bysum .bycard').forEach(b=>b.onclick=()=>{tap();BYF=BYF===b.dataset.by?'':b.dataset.by;renderTrades(SNAP)});
 const q=$('#q').value.trim().toLowerCase(),f=SET.tfilt;
 const L=allTrades(s).filter(t=>(!BYF||t.by===BYF)&&(!q||String(t.sym).toLowerCase().includes(q)||String(t.by||'').toLowerCase().includes(q))
  &&(f==='all'||(f==='open'&&t.st==='open')||(f==='win'&&t.st!=='open'&&t.pnl>0)||(f==='loss'&&t.st!=='open'&&t.pnl<0)));
 const sum=L.reduce((a,t)=>a+(+t.pnl||0),0);
 $('#tsum').innerHTML=`<span>${L.length} Trades${BYF?' · '+esc(BYF):''}</span><span>Summe <b class="m ${cls(sum)}">${sg(sum)}</b></span>`;
 if(!L.length){$('#tlist').innerHTML='<div class="empty">Keine passenden Trades</div>';return}
 const G=new Map();L.forEach((t,i)=>{const k=t.d?dk(t.d):'?';if(!G.has(k))G.set(k,[]);G.get(k).push([t,'t'+i])});const map={};
 $('#tlist').innerHTML=[...G].map(([k,a])=>{const ds=a.reduce((x,[t])=>x+(t.st!=='open'?+t.pnl||0:0),0);a.forEach(([t,id])=>map[id]=t);
  return`<div class="dayh"><span>${k==='?'?'Ohne Datum':dayLabel(k)}</span><b class="m ${cls(ds)}">${sg(ds)}</b></div><div class="card tl" >${a.map(([t,id])=>tradeRow(t,id)).join('')}</div>`}).join('');
 bindRows('#tlist',map)}
$('#bexport').onclick=async()=>{tap();if(!SNAP)return;const T=allTrades(SNAP),q=v=>'"'+String(v??'').replace(/"/g,'""')+'"';
 const csv='﻿'+['Zeit;Symbol;Richtung;Lot;P/L (EUR);Status;Gesetzt von;Grund'].concat(T.map(t=>[t.t,t.sym,side(t.side)?'BUY':'SELL',t.vol,t.pnl==null?'':String(t.pnl).replace('.',','),t.st==='open'?'offen':'geschlossen',t.by,t.reason].map(q).join(';'))).join('\n');
 const name=`mp-trades-${dk(new Date())}.csv`,file=new File([csv],name,{type:'text/csv'});
 try{if(navigator.canShare&&navigator.canShare({files:[file]})){await navigator.share({files:[file],title:'MP Trading – Trades'});return}}catch(e){if(e&&e.name==='AbortError')return}
 const a=document.createElement('a');a.href=URL.createObjectURL(file);a.download=name;document.body.append(a);a.click();setTimeout(()=>{URL.revokeObjectURL(a.href);a.remove()},1000)};

// ---- Helfer-Ring um den Globus
function renderAgents(s){if(!$('#cards').children.length){$('#cards').innerHTML=AG.map(([k,ic,nm,sh])=>`<button class="agent" id="ag-${k}" data-k="${k}" aria-label="${esc(nm)}"><span class="ic">${ic}</span><span class="nm">${esc(sh)}</span><span class="st" id="st-${k}"></span></button>`).join('')
   +`<button class="agent ki" id="ag-claude" data-k="claude"><span class="ic">✦</span><span class="nm">KI-Prüfer</span><span class="st" id="st-claude"></span></button>`;
  $$('#cards .agent').forEach(b=>b.onclick=()=>{tap();OPEN=OPEN===b.dataset.k?null:b.dataset.k;agDetail()});addEventListener('resize',layoutRing)}
 for(const [k] of ALL){const g=s.agents[k]||{};const st=$('#st-'+k);if(!st)continue;st.className='st '+(g.s||'');$('#ag-'+k).classList.toggle('working',g.s==='working')}
 const w=ALL.filter(a=>(s.agents[a[0]]||{}).s==='working').length;$('#agsum').textContent=`${ALL.length} Helfer · ${w} aktiv`;
 agDetail();
 $('#dec').innerHTML=s.dec.length?s.dec.map(d=>`<div class="jr"><div class="t">${tm(d.t)}</div><div>${esc(d.text)}</div>${(d.h||[]).map(h=>`<span class="hch ${esc(h.e||'')}" title="${esc(h.t)}">${esc(h.n)}${h.e?' · '+esc(h.e):''}</span>`).join('')}</div>`).join(''):'<div class="empty">Noch keine Entscheidungen</div>';
 if(!GL){GL=globe($('#globe'));if(VIEW==='agents')layoutRing()}
 // Strahl + Blitz für neu fertig gewordene Helfer (seit letztem Snapshot)
 const ids=(s.events||[]).map(e=>e.id),mx=ids.length?Math.max(...ids):0;let seen=+(localStorage.getItem('ct_ev')||0);if(mx<seen)seen=0;
 const neu=(s.events||[]).filter(e=>e.id>seen);localStorage.setItem('ct_ev',mx);
 if(seen&&neu.length&&VIEW==='agents'&&SET.anim){const ks=[...new Set(neu.map(e=>e.a))].slice(0,8);ks.forEach((k,i)=>setTimeout(()=>{const el=$('#ag-'+k);if(el)beam(el)},350+i*450))}}
// Ring: 11 Badges gleichmäßig auf einem Kreis (Positionen per CSSOM – CSP erlaubt keine Inline-Styles)
function layoutRing(){const ring=$('#ring');if(!ring||!ring.clientWidth)return;const W=ring.clientWidth,H=ring.clientHeight,cx=W/2,cy=H/2,els=AG.map(a=>$('#ag-'+a[0])).filter(Boolean);if(!els.length)return;
 const bw=els[0].offsetWidth,bh=els[0].offsetHeight,rx=W/2-bw/2-4,ry=H/2-bh/2-4;
 els.forEach((el,i)=>{const t=-Math.PI/2+i*2*Math.PI/els.length;el.style.left=(cx+Math.cos(t)*rx-bw/2)+'px';el.style.top=(cy+Math.sin(t)*ry-bh/2)+'px'});
 const ki=$('#ag-claude');if(ki){ki.style.left=(cx-ki.offsetWidth/2)+'px';ki.style.top=(cy+W*.58*.38+6)+'px'}}
const ST={working:'arbeitet',done:'fertig',error:'Fehler'};
function agDetail(){const el=$('#agdet');$$('.agent').forEach(b=>b.classList.toggle('sel',b.dataset.k===OPEN));
 const a=ALL.find(x=>x[0]===OPEN);if(!a||!SNAP){el.classList.remove('open');el.innerHTML='';return}const g=SNAP.agents[a[0]]||{};
 el.innerHTML=`<div class="ic">${a[1]}</div><div class="tx"><div class="nm">${esc(a[2])}<span class="pill ${esc(g.s||'')}">${esc(ST[g.s]||g.s||'bereit')}</span></div><div class="jb">${esc(a[4])}</div><div class="rs">${esc(g.t||'Noch keine Meldung.')}</div></div><button class="x" aria-label="schließen">×</button>`;
 el.classList.add('open');el.querySelector('.x').onclick=()=>{OPEN=null;agDetail()}}
function beam(card){const svg=$('#beams'),cv=$('#globe');if(!svg||!cv||!GL)return;const m=$('#app').getBoundingClientRect(),a=card.getBoundingClientRect(),g=cv.getBoundingClientRect();
 const cx=g.left+g.width/2-m.left,cy=g.top+g.height/2-m.top,bx=a.left+a.width/2-m.left,by=a.top+a.height/2-m.top,dl=Math.hypot(bx-cx,by-cy)||1,ux=(bx-cx)/dl,uy=(by-cy)/dl;
 const x1=bx-ux*a.width*.35,y1=by-uy*a.height*.35,tgt=GL.toward(ux,uy),x2=cx+tgt.x,y2=cy+tgt.y,mx=(x1+x2)/2-uy*18,my=(y1+y2)/2+ux*18;
 const ns='http://www.w3.org/2000/svg',id='g'+Math.random().toString(36).slice(2);
 svg.insertAdjacentHTML('beforeend',`<defs><linearGradient id="${id}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#8b5cf6" stop-opacity=".2"/><stop offset="1" stop-color="#9ae8ff"/></linearGradient><filter id="f${id}"><feGaussianBlur stdDeviation="3"/></filter></defs>`);
 const d=`M${x1},${y1} Q${mx},${my} ${x2},${y2}`,p1=document.createElementNS(ns,'path'),p2=document.createElementNS(ns,'path'),dot=document.createElementNS(ns,'circle');
 [p1,p2].forEach((p,i)=>{p.setAttribute('d',d);p.setAttribute('fill','none');p.setAttribute('stroke',`url(#${id})`);p.setAttribute('stroke-width',i?2:7);p.setAttribute('stroke-linecap','round');if(!i)p.setAttribute('filter',`url(#f${id})`);svg.append(p)});
 dot.setAttribute('r',4.5);dot.setAttribute('fill','#e6f5ff');svg.append(dot);const Lg=p2.getTotalLength();[p1,p2].forEach(p=>{p.style.strokeDasharray=Lg;p.style.strokeDashoffset=Lg});card.classList.add('flash');
 const t0=performance.now(),T=850;(function step(t){const k=Math.min(1,(t-t0)/T),e=1-Math.pow(1-k,3);[p1,p2].forEach(p=>p.style.strokeDashoffset=Lg*(1-e));const pt=p2.getPointAtLength(Lg*e);dot.setAttribute('cx',pt.x);dot.setAttribute('cy',pt.y);
  if(k<1)requestAnimationFrame(step);else{GL.hit(tgt);dot.remove();setTimeout(()=>card.classList.remove('flash'),500);const t1=performance.now();(function fade(t){const q=Math.min(1,(t-t1)/700);[p1,p2].forEach(p=>p.style.opacity=1-q);if(q<1)requestAnimationFrame(fade);else{p1.remove();p2.remove()}})(t1)}})(t0)}

// ---- Analyse
let CALSEL=null;
function renderStats(s){renderWeek(s);const C=closed(s),S=stats(C);
 // Kalender (5 Wochen, Mo–So)
 const byDay={};C.forEach(t=>{if(!t.d)return;const k=dk(t.d);(byDay[k]=byDay[k]||{p:0,n:0});byDay[k].p+=t.pnl;byDay[k].n++});
 const today=new Date();today.setHours(12,0,0,0);const start=new Date(today);start.setDate(today.getDate()-((today.getDay()+6)%7)-28);
 const days=[];for(let i=0;i<35;i++){const d=new Date(start);d.setDate(start.getDate()+i);days.push(d)}
 const mxp=Math.max(1,...days.map(d=>Math.abs((byDay[dk(d)]||{}).p||0)));
 $('#cal').innerHTML=`<div class="cal">${['Mo','Di','Mi','Do','Fr','Sa','So'].map(w=>`<div class="wd">${w}</div>`).join('')}${days.map(d=>{const k=dk(d),v=byDay[k];
  return`<button class="cd${d>today?' fut':''}${k===dk(today)?' today':''}${k===CALSEL?' sel':''}${v&&v.p?' hv':''}" data-k="${k}" data-v="${v?v.p:''}">${d.getDate()}</button>`}).join('')}</div>`;
 $$('#cal .cd').forEach(b=>{const v=+b.dataset.v;if(b.dataset.v!==''&&v){const a=.25+.75*Math.min(1,Math.abs(v)/mxp);b.style.background=v>0?`rgba(34,197,94,${a})`:`rgba(244,63,94,${a})`}
  b.onclick=()=>{tap();CALSEL=b.dataset.k;$$('#cal .cd').forEach(x=>x.classList.toggle('sel',x===b));calInfo(byDay)}});calInfo(byDay);
 // Kennzahlen
 const c=(l,v,k,sub)=>`<div class="st2"><span>${l}</span><b class="${k||''}">${v}</b>${sub?`<small>${sub}</small>`:''}</div>`;
 $('#kstats').innerHTML=S.n?[c('Netto realisiert',M(sg(S.net)),cls(S.net),`${S.n} Trades`),c('Trefferquote',pct(S.wr),'',`${S.w} G · ${S.l} V`),
  c('Ø Gewinn',M(sg(S.avgW)),'up'),c('Ø Verlust',M(sg(S.avgL)),'dn'),c('Profit-Faktor',S.pf===Infinity?'∞':S.pf==null?'–':nf(S.pf),S.pf>=1?'up':'dn','Gewinne / Verluste'),
  c('Erwartungswert',M(sg(S.exp)),cls(S.exp),'pro Trade'),c('Bester Trade',M(sg(S.best&&S.best.pnl)),'up',S.best?esc(S.best.sym)+' · '+tm(S.best.t):''),
  c('Schlechtester',M(sg(S.worst&&S.worst.pnl)),'dn',S.worst?esc(S.worst.sym)+' · '+tm(S.worst.t):''),c('Max. Drawdown',M(S.dd?'−'+eur(S.dd):eur(0)),S.dd?'dn':'','von Hoch zu Tief'),
  c('Längste Serie',`${S.maxW}× / ${S.maxL}×`,'','Gewinn / Verlust')].join(''):'<div class="empty">Noch keine geschlossenen Trades</div>';
 // Long vs. Short
 const lo=C.filter(t=>side(t.side)),sh=C.filter(t=>!side(t.side)),sum=a=>a.reduce((x,t)=>x+t.pnl,0),wr=a=>a.length?a.filter(t=>t.pnl>0).length/a.length:null;
 $('#ls').innerHTML=C.length?`<div class="lsbar"><i class="l" data-w="${lo.length/C.length*100}"></i><i class="s" data-w="${sh.length/C.length*100}"></i></div>
  <div class="lsg"><div><span>▲ Long · ${lo.length}</span><b class="m ${cls(sum(lo))}">${sg(sum(lo))}</b><small>Trefferquote ${pct(wr(lo))}</small></div><div><span>▼ Short · ${sh.length}</span><b class="m ${cls(sum(sh))}">${sg(sum(sh))}</b><small>Trefferquote ${pct(wr(sh))}</small></div></div>`:'<div class="empty">Noch keine Daten</div>';
 // Nach Symbol
 const bs={};C.forEach(t=>{const k=t.sym||'?';(bs[k]=bs[k]||{p:0,n:0,w:0});bs[k].p+=t.pnl;bs[k].n++;if(t.pnl>0)bs[k].w++});
 const SY=Object.entries(bs).sort((a,b)=>b[1].p-a[1].p),mxs=Math.max(1e-9,...SY.map(([,v])=>Math.abs(v.p)));
 $('#bysym').innerHTML=SY.length?`<div class="bars">${SY.map(([k,v])=>`<div class="br"><div class="a"><span>${esc(k)}<small>${v.n} Trades · ${pct(v.w/v.n)}</small></span><b class="m ${cls(v.p)}">${sg(v.p)}</b></div><div class="trk"><i class="${v.p<0?'dn':''}" data-w="${Math.abs(v.p)/mxs*100}"></i></div></div>`).join('')}</div>`:'<div class="empty">Noch keine Daten</div>';
 // Nach Uhrzeit
 const hr=Array.from({length:24},()=>0),hn=Array(24).fill(0);C.forEach(t=>{const h=+(String(t.t||'').replace('T',' ').slice(11,13));if(!isNaN(h)&&String(t.t||'').length>12){hr[h]+=t.pnl;hn[h]++}});
 const mh=Math.max(1e-9,...hr.map(Math.abs)),bi=hr.indexOf(Math.max(...hr));
 $('#byhour').innerHTML=hn.some(Boolean)?`<div class="hrs">${hr.map(v=>`<div class="h"><i class="${v<0?'dn':''}" data-h="${Math.abs(v)/mh*50}" data-neg="${v<0?1:0}"></i></div>`).join('')}</div>
  <div class="hlab"><span>0</span><span>6</span><span>12</span><span>18</span><span>23 Uhr</span></div>${hr[bi]>0?`<div class="hbest">⏰ Beste Zeit: <b>${bi}–${bi+1} Uhr</b> (<span class="m up">${sg(hr[bi])}</span>, ${hn[bi]} Trades)</div>`:''}`:'<div class="empty">Noch keine Daten</div>';
 requestAnimationFrame(()=>{$$('#v-stats [data-w]').forEach(x=>x.style.width=(+x.dataset.w).toFixed(1)+'%');
  $$('#byhour [data-h]').forEach(x=>{const h=+x.dataset.h;x.style.height=Math.max(h?1.5:0,h)+'%';if(x.dataset.neg==='1')x.style.top='50%';else x.style.bottom='50%'})})}
function calInfo(byDay){const k=CALSEL||dk(new Date()),v=byDay[k];$('#calinfo').innerHTML=`${dayLabel(k)}: `+(v?`<b class="m ${cls(v.p)}">${sg(v.p)}</b> · ${v.n} Trade${v.n>1?'s':''}`:'keine geschlossenen Trades')}
function renderWeek(s){const w=s.week,el=$('#wk'),d=x=>x?x.slice(8,10)+'.'+x.slice(5,7)+'.':'';
 if(!w){el.innerHTML='<div class="empty">Noch kein Wochen-Report (Bot-Update ausstehend)</div>';return}
 $('#wkr').textContent=`KW ${w.kw} · ${d(w.from)}–${d(w.to)}`;const bt=t=>t?`${esc(t.sym)} <b class="m ${cls(t.pnl)}">${sg(t.pnl)}</b>`:'–';
 el.innerHTML=(s.halt?'<div class="wkhalt">🛑 Tageslimit heute erreicht – alle Trades geschlossen, Handel bis morgen gesperrt</div>':'')+
 `<div class="wktot"><div><span>Gesamt</span><b class="m ${cls(w.pnl)}">${sg(w.pnl)}</b></div><div><span>Trades</span><b>${w.trades}</b></div><div><span>Trefferquote</span><b>${pct(w.wr)}</b></div></div>`+
 (w.by&&w.by.length?w.by.map(x=>`<div class="wkby"><div class="a"><span>${esc(x.by)}</span><b class="m ${cls(x.pnl)}">${sg(x.pnl)}</b></div><div class="b">${x.n} Trades · ${pct(x.wr)} · Bester: ${bt(x.best)} · Schlechtester: ${bt(x.worst)}</div></div>`).join(''):'<div class="empty">Diese Woche noch keine geschlossenen Trades</div>')+
 '<div class="hint">Auch per Telegram: So 20:00 und /woche</div>'}

// ---- Mehr: Telegram-Steuerung
function renderMore(s){const B='https://t.me/'+BOT+'?start=',L=(cmd,ic,t,k)=>`<a class="${k||''}" href="${B+cmd}" data-c="${cmd}"><span>${ic}</span>${t}</a>`;
 if(!$('#ctl').children.length){$('#ctl').innerHTML=L('status','📊','Status')+L('auto_an','🤖','Auto an','green')+L('auto_aus','⏸','Auto aus','red')+L('weiter','✅','Weiter','green')+L('notaus','🛑','Not-Aus','red')+L('notaus_alles','⛔','Alles schließen','red');
  $$('#ctl a').forEach(x=>x.onclick=e=>{tap();const m={notaus_alles:'Not-Aus und ALLE Positionen schließen?',notaus:'Not-Aus einschalten?',weiter:'Not-Aus ausschalten?',auto_aus:'Auto-Trading ausschalten?',auto_an:'Auto-Trading einschalten?'}[x.dataset.c];if(m&&!confirm(m+' (Telegram öffnet sich)'))e.preventDefault()})}
 $('#foot').textContent=`Zyklen ${s.auto.cycles??'–'} · letzter Zyklus ${tm(s.auto.last)||'–'}${s.auto.result?' · '+s.auto.result:''}`}

// ---- Bottom-Sheet
function sheet(html){$('#sheetc').innerHTML=html;const sh=$('#sheet');sh.hidden=false;const pn=$('#sheetpn');pn.style.transform=''}
function closeSheet(){$('#sheet').hidden=true}
$('#sheetbd').onclick=closeSheet;
(()=>{let y0=null;const pn=$('#sheetpn');pn.addEventListener('touchstart',e=>{y0=pn.scrollTop<=0?e.touches[0].clientY:null},{passive:true});
 pn.addEventListener('touchmove',e=>{if(y0==null)return;const dy=e.touches[0].clientY-y0;if(dy>0)pn.style.transform=`translateY(${dy}px)`},{passive:true});
 pn.addEventListener('touchend',e=>{if(y0==null)return;const dy=e.changedTouches[0].clientY-y0;y0=null;if(dy>90)closeSheet();else pn.style.transform=''})})();
// ---- Ziehen zum Aktualisieren
(()=>{let y0=null,dy=0;const p=$('#ptr');
 addEventListener('touchstart',e=>{y0=scrollY<=0&&!$('#app').classList.contains('hidden')&&$('#sheet').hidden?e.touches[0].clientY:null;dy=0},{passive:true});
 addEventListener('touchmove',e=>{if(y0==null)return;dy=Math.max(0,e.touches[0].clientY-y0);const k=Math.min(1,dy/80);p.style.opacity=k;p.style.transform=`translateY(${Math.min(dy,90)-50}px) rotate(${dy*3}deg)`},{passive:true});
 addEventListener('touchend',async()=>{if(y0==null)return;y0=null;if(dy>80){tap();p.classList.add('go');await refresh();loadEvents()}p.classList.remove('go');p.style.opacity=0;p.style.transform=''},{passive:true})})();

// ================= Einstellungen: Mitteilungs-Schalter (im Bot gespeichert) =================
let PREFS=null,PBUSY=false;
function prefsUI(p){if(p&&!PBUSY&&(!PREFS||(p.t||0)>=(PREFS.t||0)))PREFS=p;const P=PREFS||{open:true,close:true,telegram:true,push:true};
 $$('.tg').forEach(x=>{x.checked=P[x.dataset.k]!==false;x.onchange=savePrefs});const b=$('#ptest');if(b&&!b.onclick)b.onclick=testMsg}
async function savePrefs(){const b={};$$('.tg').forEach(x=>b[x.dataset.k]=x.checked);PBUSY=true;$('#prefmsg').textContent='Speichere …';
 try{const r=await api('api/prefs',{method:'POST',body:JSON.stringify(b)});const j=await r.json();if(!r.ok)throw new Error(j.error||r.status);PREFS=j.prefs;$('#prefmsg').textContent='Gespeichert ✓ – der Bot übernimmt es in ≤ 30 s.'}
 catch(e){$('#prefmsg').textContent='Fehler: '+e.message}finally{PBUSY=false}}
async function testMsg(){const b=$('#ptest');b.disabled=true;$('#prefmsg').textContent='Sende Test …';
 try{const r=await api('api/notify/test',{method:'POST',body:'{}'});const j=await r.json();if(!r.ok)throw new Error(j.error||r.status);
  $('#prefmsg').textContent=`Test gesendet ✓ · Push an ${j.push&&j.push.sent||0} Gerät(e) · Telegram ${j.telegram==='angefragt'?'folgt in ≤ 30 s':'aus'}`;loadEvents()}
 catch(e){$('#prefmsg').textContent='Fehler: '+e.message}finally{b.disabled=false}}

// ================= Trade-Mitteilungen (Web-Push) + Verlauf + Toast =================
const pushOK=()=>'serviceWorker'in navigator&&'PushManager'in window&&'Notification'in window,iOS=/iPhone|iPad|iPod/.test(navigator.userAgent),
 standalone=()=>matchMedia('(display-mode: standalone)').matches||navigator.standalone===true;let PINFO='';
const u8=s=>{const p='='.repeat((4-s.length%4)%4);return Uint8Array.from(atob((s+p).replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0))},
 keyOf=sub=>{try{return btoa(String.fromCharCode(...new Uint8Array(sub.options.applicationServerKey))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'')}catch(_){return''}};
const api=(p,o={})=>fetch(p,{...o,cache:'no-store',headers:{'Content-Type':'application/json',Authorization:'Bearer '+TOK,...(o.headers||{})}});
async function subscribe(ask){
 if(!pushOK()){PINFO=iOS&&!standalone()?'iPhone: zuerst in Safari „Teilen → Zum Home-Bildschirm“, dann die App vom Home-Bildschirm öffnen (iOS 16.4+).':'Dieser Browser unterstützt keine Mitteilungen.';return pushUI()}
 try{if(ask){const r=await Notification.requestPermission();if(r!=='granted'){PINFO='Mitteilungen nicht erlaubt – in den iPhone-Einstellungen → Mitteilungen änderbar.';return pushUI()}}
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
function pushUI(){const perm=pushOK()?Notification.permission:'n/a',on=perm==='granted'&&localStorage.getItem('ct_push')==='1';
 $('#pstat').textContent=perm==='n/a'?(iOS&&!standalone()?'nur in der Home-Bildschirm-App':'nicht unterstützt'):perm==='denied'?'blockiert':on?'aktiv':'aus';
 $('#pbox').innerHTML=perm==='n/a'||perm==='denied'?'':on?'<button class="btn ghost" id="poff">Ausschalten</button>':'<button class="btn pri" id="pon">🔔 Erlauben</button>';
 const a=$('#pon'),b=$('#poff');if(a)a.onclick=()=>subscribe(true);if(b)b.onclick=unsubscribe;
 $('#pinfo').textContent=PINFO||'Bei jeder Eröffnung: Symbol, BUY/SELL, Lot, Einstieg, SL/TP. Bei jeder Schließung: 🟢 +Gewinn / 🔴 −Verlust in €.'}
const evc=e=>e.color==='green'?'up':e.color==='red'?'dn':'';
async function loadEvents(){try{const r=await api('api/events');if(!r.ok)return;const j=await r.json(),ev=(j.events||[]).slice(0,15);
 $('#evs').innerHTML=ev.length?ev.map(e=>`<div class="ev e${evc(e)}"><div><b class="${evc(e)}">${esc(e.title)}</b>${e.test?'<span class="tchip">TEST</span>':''}</div><div class="b">${esc(e.body)} · ${new Date(e.t*1000).toLocaleString('de-DE',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})}</div></div>`).join(''):'<div class="empty">Noch keine Trade-Mitteilungen</div>'}catch(_){}}
function toast(e){if(!e||!e.title)return;const t=$('#toast');t.className='toast e'+evc(e);t.innerHTML=`<b>${esc(e.title)}</b><div>${esc(e.body||'')}</div>`;t.hidden=false;tap();
 clearTimeout(toast.t);toast.t=setTimeout(()=>t.hidden=true,7000);t.onclick=()=>t.hidden=true}
if('serviceWorker'in navigator)navigator.serviceWorker.addEventListener('message',m=>{const d=m.data||{};if(d.type==='ct-event'){toast(d.event);loadEvents();refresh()}});
let pushInit=false;function pushStart(){if(pushInit||!TOK)return;pushInit=true;pushUI();loadEvents();setInterval(()=>{if(TOK&&!document.hidden)loadEvents()},60000);
 if(localStorage.getItem('ct_push')!=='0')subscribe(false)}   // Selbstheilung: Abo bei jedem Start neu anmelden (Render verliert es beim Neustart)

// ================= Start =================
applyTheme();applyPriv();go(localStorage.getItem('ct_view')||'home');
(async()=>{if('serviceWorker'in navigator)navigator.serviceWorker.register('sw.js',{updateViaCache:'none'}).then(r=>r.update()).catch(()=>{});
 if(!TOK)showLock('');else await refresh();
 setInterval(()=>{if(TOK&&!document.hidden)refresh()},15000);document.addEventListener('visibilitychange',()=>{if(!document.hidden&&TOK)refresh()})})();
