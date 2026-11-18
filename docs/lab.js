// Strategie-Labor: echte Daten, Train (erste 60 %) / Test (letzte 40 %), Kosten inkl. Spread+Kommission
const fs=require('fs'),R='/home/user/cloude-trading-app/bot/',T=require(R+'ta'),I=require(R+'instruments');const D=process.argv[2],ONLY=process.argv[3];
const agg=(b,n)=>{const o=[];let g=null;for(const x of b){const k=Math.floor(x.t/(n*3600e3));if(!g||g.k!==k){g&&o.push(g);g={k,t:x.t,o:x.o,h:x.h,l:x.l,c:x.c,v:x.v}}else{g.h=Math.max(g.h,x.h);g.l=Math.min(g.l,x.l);g.c=x.c;g.v+=x.v}}g&&o.push(g);return o};
// generischer Simulator: sig(i)->{dir,stop,target?,trail?(fn),maxHold,exitFn?}; Einstieg Open i+1
function sim(b,sig,cost){const tr=[];let i=1;while(i<b.length-2){const s=sig(i);if(!s){i++;continue}
 const e=b[i+1].o+s.dir*cost/2,risk=Math.abs(e-s.stop);if(!(risk>0)){i++;continue}let st=s.stop,ex=null,k=i+1,why='zeit';
 for(;k<Math.min(b.length,i+1+s.maxHold);k++){const x=b[k];if(s.dir>0?x.l<=st:x.h>=st){ex=Math.min(x.o,st)*(s.dir>0?1:0)+(s.dir<0?Math.max(x.o,st):0);why='stop';break}
  if(s.target&&(s.dir>0?x.h>=s.target:x.l<=s.target)){ex=s.target;why='ziel';break}
  if(s.exitFn&&s.exitFn(k)){ex=x.c;why='regel';break}
  if(s.trail){const n=s.trail(k);if(n!=null&&s.dir*(n-st)>0)st=n}}
 if(ex==null){k=Math.min(k,b.length-1);ex=b[k].c}
 tr.push({t:b[i+1].t,R:(s.dir*(ex-e)-cost/2)/risk,why});i=k+1}return tr}
const stat=t=>{const n=t.length;if(!n)return{n:0};const s=t.reduce((a,x)=>a+x.R,0),w=t.filter(x=>x.R>0);const gl=-t.filter(x=>x.R<=0).reduce((a,x)=>a+x.R,0);let eq=0,pk=0,dd=0;for(const x of t){eq+=x.R;pk=Math.max(pk,eq);dd=Math.max(dd,pk-eq)}
 return{n,wr:w.length/n,avg:s/n,pf:gl?w.reduce((a,x)=>a+x.R,0)/gl:99,dd}};
const STRATS={
 // A) Trend-Rücksetzer mit Tages-Filter, Chandelier-Trailing 3 ATR
 pullbackHTF(b,d,inst){const s=T.compute(b),dc=d.map(x=>x.c),de=T.ema(dc,50),dmap=new Map();let j=0;
  const dTrend=t=>{while(j<d.length-1&&d[j+1].t<=t-864e5)j++;const k=j;return k>=51&&!isNaN(de[k])?(dc[k]>de[k]&&de[k]>de[k-5]?1:dc[k]<de[k]&&de[k]<de[k-5]?-1:0):0};
  return i=>{if(i<210||isNaN(s.atr[i]))return null;const a=s.atr[i],c=b[i].c,t=dTrend(b[i].t);if(!t)return null;
   const up=s.e20[i]>s.e50[i],dn=s.e20[i]<s.e50[i];if(t>0&&!up||t<0&&!dn)return null;
   const touch=t>0?b[i].l<=s.e20[i]+.2*a&&c>s.e20[i]&&c>b[i].o:b[i].h>=s.e20[i]-.2*a&&c<s.e20[i]&&c<b[i].o;if(!touch)return null;
   const r=s.rsi[i];if(t>0?r>65:r<35)return null;
   let hh=c;return{dir:t,stop:c-t*2*a,maxHold:240,trail:k=>{hh=t>0?Math.max(hh,b[k].c):Math.min(hh,b[k].c);return hh-t*3*s.atr[k]}}}},
 // B) 4h-Ausbruch 55/20 (Turtle), Stop 2 ATR, Ausstieg 20-Kerzen-Gegenextrem
 breakout4h(b,d,inst){const h4=agg(b,4),s=T.compute(h4),dc55=T.donchian(h4,55),dc20=T.donchian(h4,20);this.bars=h4;
  return i=>{if(i<60||isNaN(s.atr[i]))return null;const c=h4[i].c,a=s.atr[i];const dir=c>dc55.hi[i]?1:c<dc55.lo[i]?-1:0;if(!dir)return null;
   if(dir>0?c<s.e200[i]:c>s.e200[i])return null;
   return{dir,stop:c-dir*2*a,maxHold:300,trail:k=>dir>0?dc20.lo[k]:dc20.hi[k]}}},
 // C) RSI-2-Rückkehr Tagesbasis, nur long über SMA200, Ausstieg Close>SMA5, Not-Stop 2,5 ATR
 rsi2daily(b,d,inst){const s=T.compute(d),r2=T.rsi(d.map(x=>x.c),2),s200=T.sma(d.map(x=>x.c),200),s5=T.sma(d.map(x=>x.c),5);this.bars=d;
  return i=>{if(i<205||isNaN(s.atr[i]))return null;const c=d[i].c;if(!(c>s200[i]&&r2[i]<10))return null;
   return{dir:1,stop:c-2.5*s.atr[i],maxHold:10,exitFn:k=>d[k].c>s5[k]}}},
};
const out=[];
for(const sym of Object.keys(I.ALL)){if(ONLY&&!ONLY.split(',').includes(sym))continue;const inst=I.ALL[sym];const b=JSON.parse(fs.readFileSync(`${D}/${sym}_1h.json`)),d=JSON.parse(fs.readFileSync(`${D}/${sym}_1d.json`));
 const cost=inst.spread+2*inst.comm/inst.cs;
 for(const [name,mk] of Object.entries(STRATS)){const ctx={bars:b};const sig=mk.call(ctx,b,d,inst),bars=ctx.bars;const tr=sim(bars,sig,cost);const cut=bars[Math.floor(bars.length*.6)].t;
  const a=stat(tr.filter(x=>x.t<cut)),z=stat(tr.filter(x=>x.t>=cut));out.push({sym,strat:name,trN:a.n,trAvg:a.avg&&+a.avg.toFixed(3),trPF:a.pf&&+a.pf.toFixed(2),teN:z.n,teAvg:z.avg&&+z.avg.toFixed(3),tePF:z.pf&&+z.pf.toFixed(2),teWR:z.wr&&+(z.wr*100).toFixed(0),teDD:z.dd&&+z.dd.toFixed(1)})}}
console.table(out);fs.writeFileSync(D+'/../res/lab_out.json',JSON.stringify(out));
