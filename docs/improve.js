// Verbesserungs-Labor Trend-Rücksetzer: neue Märkte + Filter, Lern/Prüf, nach Kosten inkl. Finanzierung
const fs=require('fs'),T=require('/home/user/cloude-trading-app/bot/ta');const D=process.argv[2];
const MK={XAUUSD:[.25,.06],XAGUSD:[.025,.06],BTCUSD:[15,.2],ETHUSD:[1.2,.2],SOLUSD:[.05,.2],XRPUSD:[.0008,.2],BNBUSD:[.4,.2],DOGEUSD:[.00012,.2],ADAUSD:[.0006,.2]};
function run(sym,opt){const [spr,fin]=MK[sym];const h=JSON.parse(fs.readFileSync(`${D}/${sym}_1h.json`)),d=JSON.parse(fs.readFileSync(`${D}/${sym}_1d.json`));
 // relative Spreads für neue Coins: 0,05 % vom Preis
 const s=T.compute(h),dc=d.map(x=>x.c),de=T.ema(dc,50);let j=0;const dT=t=>{while(j<d.length-1&&d[j+1].t<=t-864e5)j++;return j>=51?(dc[j]>de[j]&&de[j]>de[j-5]?1:dc[j]<de[j]&&de[j]<de[j-5]?-1:0):0};
 const an=opt.analyst?anBias(h,s,d):null;const atrRank=opt.vol?h.map((_,i)=>T.pctRank(s.atr,i,500)):null;
 const tr=[];let i=210;while(i<h.length-2){const a=s.atr[i],c=h[i].c;let t=dT(h[i].t);
  let ok=t&&(t>0?s.e20[i]>s.e50[i]:s.e20[i]<s.e50[i]);if(ok){ok=t>0?h[i].l<=s.e20[i]+.2*a&&c>s.e20[i]&&c>h[i].o:h[i].h>=s.e20[i]-.2*a&&c<s.e20[i]&&c<h[i].o;ok=ok&&(t>0?s.rsi[i]<=65:s.rsi[i]>=35)}
  if(ok&&opt.longOnly&&t<0)ok=false;
  if(ok&&opt.adx&&!(s.adx.adx[i]>=opt.adx))ok=false;
  if(ok&&an&&an[i]*t<=-.3)ok=false;
  if(ok&&atrRank&&atrRank[i]>opt.vol)ok=false;
  if(ok&&opt.hours){const H=new Date(h[i].t).getUTCHours();if(!opt.hours(H))ok=false}
  if(!ok){i++;continue}
  const cost=spr<0?c*-spr:spr,e=h[i+1].o+t*cost/2,risk=(opt.stopA||2)*a;let st=e-t*risk,hh=c,ex=null,k=i+1,maxH=opt.maxH||240;
  for(;k<Math.min(h.length,i+1+maxH);k++){const x=h[k];if(t>0?x.l<=st:x.h>=st){ex=t>0?Math.min(x.o,st):Math.max(x.o,st);break}hh=t>0?Math.max(hh,x.c):Math.min(hh,x.c);const n=hh-t*(opt.trailA||3.5)*s.atr[k];if(t*(n-st)>0)st=n}
  if(ex==null){k=Math.min(k,h.length-1);ex=h[k].c}tr.push({t:h[i+1].t,R:(t*(ex-e)-cost/2-e*fin*(k-i)/8760)/risk});i=k+1}
 const cut=h[Math.floor(h.length*.6)].t;return{A:tr.filter(x=>x.t<cut),Z:tr.filter(x=>x.t>=cut)}}
function anBias(h,s,d){ // vereinfachter Analyst: 1h-Score (wie helpers.tfState) als Bias
 return h.map((x,i)=>{if(i<60)return 0;const c=x.c,a=s.atr[i]||1;let sc=0;sc+=c>s.e20[i]?.25:-.25;sc+=s.e20[i]>s.e50[i]?.3:-.3;sc+=Math.max(-.25,Math.min(.25,(s.e20[i]-s.e20[i-5])/a/2));sc+=Math.max(-.1,Math.min(.1,(s.rsi[i]-50)/80));sc+=s.macd.hist[i]>0?.1:-.1;return sc})}
const st=t=>{const n=t.length;if(!n)return'n0';const s=t.reduce((a,x)=>a+x.R,0),gw=t.filter(x=>x.R>0).reduce((a,x)=>a+x.R,0),gl=-t.filter(x=>x.R<=0).reduce((a,x)=>a+x.R,0);return `n${String(n).padStart(4)} Ø${(s/n>=0?'+':'')+(s/n).toFixed(3)} PF${(gl?gw/gl:99).toFixed(2)}`};
const mode=process.argv[3];
if(mode==='coins'){for(const sym of ['SOLUSD','XRPUSD','BNBUSD','DOGEUSD','ADAUSD']){MK[sym][0]=-.0005;const r=run(sym,{});console.log(sym.padEnd(8),'LERN',st(r.A),'| PRÜF',st(r.Z))}}
else{const base=['XAUUSD','XAGUSD','BTCUSD','ETHUSD'];const V={
 'Basis (aktuell)':{},'+ Analyst-Veto':{analyst:1},'ADX ≥ 20':{adx:20},'ADX ≥ 25':{adx:25},'nur Kauf':{longOnly:1},'Vol-Filter (ATR < 90. Perz.)':{vol:.9},
 'ohne Asien-Nacht (22–6 UTC)':{hours:H=>H>=6&&H<22},'nur EU/US (7–20 UTC)':{hours:H=>H>=7&&H<=20},'max. 120 h halten':{maxH:120},'max. 480 h halten':{maxH:480}};
 for(const [n,o] of Object.entries(V)){let A=[],Z=[];for(const s of base){const r=run(s,o);A=A.concat(r.A);Z=Z.concat(r.Z)}console.log(n.padEnd(30),'LERN',st(A),'| PRÜF',st(Z))}}
