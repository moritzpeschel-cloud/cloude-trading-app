const fs=require('fs');const L=fs.readFileSync(__dirname+'/lab.js','utf8');
// lab.js als Modul nutzen: STRATS/sim/stat herausziehen
const src=L.split('const out=[];')[0].replace("const D=process.argv[2],ONLY=process.argv[3];","");eval(src+';global.sim=sim;global.stat=stat;global.T=T;global.I=I;global.agg=agg;');
const D=process.argv[2];
function pull(b,d,{stopA,trailA,rsiMax,touchA}){const s=T.compute(b),dc=d.map(x=>x.c),de=T.ema(dc,50);let j=0;
 const dTrend=t=>{while(j<d.length-1&&d[j+1].t<=t-864e5)j++;const k=j;return k>=51&&!isNaN(de[k])?(dc[k]>de[k]&&de[k]>de[k-5]?1:dc[k]<de[k]&&de[k]<de[k-5]?-1:0):0};
 return i=>{if(i<210||isNaN(s.atr[i]))return null;const a=s.atr[i],c=b[i].c,t=dTrend(b[i].t);if(!t)return null;const up=s.e20[i]>s.e50[i],dn=s.e20[i]<s.e50[i];if(t>0&&!up||t<0&&!dn)return null;
  const touch=t>0?b[i].l<=s.e20[i]+touchA*a&&c>s.e20[i]&&c>b[i].o:b[i].h>=s.e20[i]-touchA*a&&c<s.e20[i]&&c<b[i].o;if(!touch)return null;const r=s.rsi[i];if(t>0?r>rsiMax:r<100-rsiMax)return null;
  let hh=c;return{dir:t,stop:c-t*stopA*a,maxHold:240,trail:k=>{hh=t>0?Math.max(hh,b[k].c):Math.min(hh,b[k].c);return hh-t*trailA*s.atr[k]}}}}
function rsi2(d,{lvl,exitN}){const s=T.compute(d),c=d.map(x=>x.c),r2=T.rsi(c,2),s200=T.sma(c,200),sx=T.sma(c,exitN);
 return i=>{if(i<205||isNaN(s.atr[i]))return null;if(!(c[i]>s200[i]&&r2[i]<lvl))return null;return{dir:1,stop:c[i]-2.5*s.atr[i],maxHold:10,exitFn:k=>c[k]>sx[k]}}}
const run=(syms,mk)=>{let A=[],Z=[];for(const sym of syms){const inst=I.ALL[sym],b=JSON.parse(fs.readFileSync(`${D}/${sym}_1h.json`)),d=JSON.parse(fs.readFileSync(`${D}/${sym}_1d.json`));const {bars,sig}=mk(b,d);const tr=sim(bars,sig,inst.spread+2*inst.comm/inst.cs);const cut=bars[Math.floor(bars.length*.6)].t;A=A.concat(tr.filter(x=>x.t<cut));Z=Z.concat(tr.filter(x=>x.t>=cut))}const a=stat(A),z=stat(Z);return `train n${a.n} ${a.avg.toFixed(3)} pf${a.pf.toFixed(2)} | test n${z.n} ${z.avg.toFixed(3)} pf${z.pf.toFixed(2)}`};
const MC=['XAUUSD','XAGUSD','BTCUSD','ETHUSD'];
console.log('--- Trend-Rücksetzer Metalle+Krypto: stopA/trailA/rsiMax/touchA');
for(const stopA of [1.5,2,2.5])for(const trailA of [2,3,4])console.log(`stop ${stopA} trail ${trailA}:`,run(MC,(b,d)=>({bars:b,sig:pull(b,d,{stopA,trailA,rsiMax:65,touchA:.2})})));
for(const rsiMax of [60,70,100])console.log(`rsiMax ${rsiMax}:`,run(MC,(b,d)=>({bars:b,sig:pull(b,d,{stopA:2,trailA:3,rsiMax,touchA:.2})})));
for(const touchA of [0,.4])console.log(`touch ${touchA}:`,run(MC,(b,d)=>({bars:b,sig:pull(b,d,{stopA:2,trailA:3,rsiMax:65,touchA})})));
console.log('--- Gegenprobe: gleiche Regel auf Devisen/Aktien');
console.log('FX:',run(['EURUSD','GBPUSD','USDJPY'],(b,d)=>({bars:b,sig:pull(b,d,{stopA:2,trailA:3,rsiMax:65,touchA:.2})})));
console.log('--- RSI-2 Indizes: lvl/exitN');
const IX=['US500','NAS100','GER40'];
for(const lvl of [5,10,15])for(const exitN of [3,5,10])console.log(`lvl ${lvl} exit SMA${exitN}:`,run(IX,(b,d)=>({bars:d,sig:rsi2(d,{lvl,exitN})})));
