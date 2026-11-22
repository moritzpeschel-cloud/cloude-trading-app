// Forex-Labor: 10 Paare, Lern (60 %) / Prüf (40 %), nach Spread+Kommission+Finanzierung (3 % p.a.)
const fs=require('fs'),T=require('/home/user/cloude-trading-app/bot/ta');const D=process.argv[2];
const PAIRS={EURUSD:.0001,GBPUSD:.00013,USDJPY:.014,USDCAD:.00015,USDCHF:.00015,NZDUSD:.00016,EURJPY:.018,GBPJPY:.028,EURGBP:.00013,AUDJPY:.018};
const COMM=s=>/JPY/.test(s)?.009:.00006;   // 2×3 $ je Lot ≈ Preis-Einheiten
const agg=(b,n)=>{const o=[];let g=null;for(const x of b){const k=Math.floor(x.t/(n*3600e3));if(!g||g.k!==k){g&&o.push(g);g={k,t:x.t,o:x.o,h:x.h,l:x.l,c:x.c}}else{g.h=Math.max(g.h,x.h);g.l=Math.min(g.l,x.l);g.c=x.c}}g&&o.push(g);return o};
function sim(b,sig,cost,fin,stepH){const tr=[];let i=1;while(i<b.length-2){const s=sig(i);if(!s){i++;continue}const e=b[i+1].o+s.dir*cost/2,risk=s.risk;let st=e-s.dir*risk,ex=null,k=i+1;
 for(;k<Math.min(b.length,i+1+s.maxHold);k++){const x=b[k];if(s.dir>0?x.l<=st:x.h>=st){ex=s.dir>0?Math.min(x.o,st):Math.max(x.o,st);break}
  if(s.target!=null){const tg=e+s.dir*s.target;if(s.dir>0?x.h>=tg:x.l<=tg){ex=tg;break}}if(s.exitFn&&s.exitFn(k,e)){ex=x.c;break}if(s.trail){const n=s.trail(k);if(n!=null&&s.dir*(n-st)>0)st=n}}
 if(ex==null){k=Math.min(k,b.length-1);ex=b[k].c}const hrs=(k-i)*stepH;tr.push({t:b[i+1].t,R:(s.dir*(ex-e)-cost/2-e*fin*hrs/8760)/risk});i=k+1}return tr}
const st=t=>{const n=t.length;if(!n)return'n0';const s=t.reduce((a,x)=>a+x.R,0),w=t.filter(x=>x.R>0).length,gw=t.filter(x=>x.R>0).reduce((a,x)=>a+x.R,0),gl=-t.filter(x=>x.R<=0).reduce((a,x)=>a+x.R,0);return `n${String(n).padStart(4)} Ø${(s/n>=0?'+':'')+(s/n).toFixed(3)} PF${(gl?gw/gl:99).toFixed(2)} WR${Math.round(w/n*100)}%`};
const S={
 // B) Tages-Donchian-Trendfolge 55/20, Stop 2 ATR, Ausstieg 20-Tage-Gegenextrem
 donchD(h,d){const s=T.compute(d),d55=T.donchian(d,55),d20=T.donchian(d,20);return{b:d,step:24,sig:i=>{if(i<60||isNaN(s.atr[i]))return null;const c=d[i].c,dir=c>d55.hi[i]?1:c<d55.lo[i]?-1:0;if(!dir)return null;return{dir,risk:2*s.atr[i],maxHold:200,trail:k=>dir>0?d20.lo[k]:d20.hi[k]}}}},
 // C) Tages-RSI-2 beidseitig mit SMA200-Filter, Ausstieg SMA5-Kreuz, Stop 2,5 ATR
 rsi2D(h,d){const s=T.compute(d),c=d.map(x=>x.c),r2=T.rsi(c,2),s200=T.sma(c,200),s5=T.sma(c,5);return{b:d,step:24,sig:i=>{if(i<205)return null;const dir=c[i]>s200[i]&&r2[i]<10?1:c[i]<s200[i]&&r2[i]>90?-1:0;if(!dir)return null;
  return{dir,risk:2.5*s.atr[i],maxHold:10,exitFn:k=>dir>0?c[k]>s5[k]:c[k]<s5[k]}}}},
 // D) 4h-Bollinger-Rückkehr in Seitwärtsphasen (ADX<20), Ziel Bandmitte, Stop 1,5 ATR
 bbRev4h(h,d){const b=agg(h,4),s=T.compute(b),bb=T.boll(b.map(x=>x.c),20,2.5);return{b,step:4,sig:i=>{if(i<60||isNaN(s.adx.adx[i]))return null;if(s.adx.adx[i]>=20)return null;const c=b[i].c;const dir=c<bb.lo[i]?1:c>bb.up[i]?-1:0;if(!dir)return null;
  return{dir,risk:1.5*s.atr[i],maxHold:30,exitFn:k=>dir>0?b[k].c>=bb.mid[k]:b[k].c<=bb.mid[k]}}}},
 // E) London-Ausbruch: Asien-Spanne 0–7 UTC, Ausbruch 7–11 UTC, Stop andere Seite, Ziel 1,5 R, Ausstieg 20 UTC
 london(h,d){const s=T.compute(h);const day=t=>Math.floor(t/864e5),hr=t=>new Date(t).getUTCHours();const rng=new Map();
  for(const x of h){if(hr(x.t)<7){const k=day(x.t),r=rng.get(k)||{hi:-1e9,lo:1e9};r.hi=Math.max(r.hi,x.h);r.lo=Math.min(r.lo,x.l);rng.set(k,r)}}const used=new Set();
  return{b:h,step:1,sig:i=>{const x=h[i],H=hr(x.t),k=day(x.t);if(H<7||H>10||used.has(k))return null;const r=rng.get(k);if(!r)return null;const w=r.hi-r.lo,a=s.atr[i];if(!(w>0)||w>3*a*4||isNaN(a))return null;
   const dir=x.c>r.hi?1:x.c<r.lo?-1:0;if(!dir)return null;used.add(k);const risk=Math.max(w,a);return{dir,risk,target:1.5*risk,maxHold:Math.max(1,20-H),exitFn:null}}}},
 // A) Trend-Rücksetzer 1h mit Tagesfilter (Referenz, wie Playbook)
 pull1h(h,d){const s=T.compute(h),dc=d.map(x=>x.c),de=T.ema(dc,50);let j=0;const dT=t=>{while(j<d.length-1&&d[j+1].t<=t-864e5)j++;return j>=51?(dc[j]>de[j]&&de[j]>de[j-5]?1:dc[j]<de[j]&&de[j]<de[j-5]?-1:0):0};
  return{b:h,step:1,sig:i=>{if(i<210||isNaN(s.atr[i]))return null;const a=s.atr[i],c=h[i].c,t=dT(h[i].t);if(!t)return null;if(t>0?!(s.e20[i]>s.e50[i]):!(s.e20[i]<s.e50[i]))return null;
   const touch=t>0?h[i].l<=s.e20[i]+.2*a&&c>s.e20[i]&&c>h[i].o:h[i].h>=s.e20[i]-.2*a&&c<s.e20[i]&&c<h[i].o;if(!touch||(t>0?s.rsi[i]>65:s.rsi[i]<35))return null;let hh=c;
   return{dir:t,risk:2*a,maxHold:240,trail:k=>{hh=t>0?Math.max(hh,h[k].c):Math.min(hh,h[k].c);return hh-t*3.5*s.atr[k]}}}}},
};
for(const [name,mk] of Object.entries(S)){let A=[],Z=[];const per=[];
 for(const [p,spr] of Object.entries(PAIRS)){const h=JSON.parse(fs.readFileSync(`${D}/${p}_1h.json`)),d=JSON.parse(fs.readFileSync(`${D}/${p}_1d.json`));const {b,step,sig}=mk(h,d);const tr=sim(b,sig,spr+COMM(p),.03,step);const cut=b[Math.floor(b.length*.6)].t;
  const a=tr.filter(x=>x.t<cut),z=tr.filter(x=>x.t>=cut);A=A.concat(a);Z=Z.concat(z);per.push(`${p}:${a.length?(a.reduce((s,x)=>s+x.R,0)/a.length).toFixed(2):'-'}/${z.length?(z.reduce((s,x)=>s+x.R,0)/z.length).toFixed(2):'-'}`)}
 console.log(name.padEnd(8),'LERN',st(A),'| PRÜF',st(Z));console.log('   je Paar (Lern/Prüf Ø R):',per.join(' '))}
