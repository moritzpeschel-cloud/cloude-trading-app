const fs=require('fs');const L=fs.readFileSync(__dirname+'/lab.js','utf8');const src=L.split('const out=[];')[0].replace("const D=process.argv[2],ONLY=process.argv[3];","");eval(src+';global.sim=sim;global.T=T;global.I=I;');
const G=fs.readFileSync(__dirname+'/grid.js','utf8');eval(G.split("const run=")[0].split("const D=process.argv[2];")[1]+';global.pull=pull;global.rsi2=rsi2;');
const D=process.argv[2];
// sim mit Ende-Zeit
function sim2(b,sig,cost){const tr=[];let i=1;while(i<b.length-2){const s=sig(i);if(!s){i++;continue}const e=b[i+1].o+s.dir*cost/2,risk=Math.abs(e-s.stop);let st=s.stop,ex=null,k=i+1;
 for(;k<Math.min(b.length,i+1+s.maxHold);k++){const x=b[k];if(s.dir>0?x.l<=st:x.h>=st){ex=s.dir>0?Math.min(x.o,st):Math.max(x.o,st);break}if(s.exitFn&&s.exitFn(k)){ex=x.c;break}if(s.trail){const n=s.trail(k);if(n!=null&&s.dir*(n-st)>0)st=n}}
 if(ex==null){k=Math.min(k,b.length-1);ex=b[k].c}const hrs=(b[k].t-b[i+1].t)/3600e3+1;tr.push({t0:b[i+1].t,t1:b[k].t+3600e3,R:(s.dir*(ex-e)-cost/2-e*FIN*hrs/8760)/risk});i=k+1}return tr}
let FIN=0;
let all=[];
for(const sym of ['XAUUSD','XAGUSD','BTCUSD','ETHUSD']){FIN=/BTC|ETH/.test(sym)?.20:.06;const inst=I.ALL[sym],b=JSON.parse(fs.readFileSync(`${D}/${sym}_1h.json`)),d=JSON.parse(fs.readFileSync(`${D}/${sym}_1d.json`));
 all=all.concat(sim2(b,pull(b,d,{stopA:2,trailA:3.5,rsiMax:65,touchA:.2}),inst.spread+2*inst.comm/inst.cs).map(x=>({...x,sym,g:inst.group})))}
for(const sym of ['US500','NAS100','GER40']){FIN=.06;const inst=I.ALL[sym],d=JSON.parse(fs.readFileSync(`${D}/${sym}_1d.json`));
 all=all.concat(sim2(d,rsi2(d,{lvl:10,exitN:5}),inst.spread).map(x=>({...x,sym,g:'index'})))}
all.sort((a,b)=>a.t0-b.t0);
const from=Math.max(...['XAUUSD','BTCUSD','US500'].map(s=>JSON.parse(fs.readFileSync(`${D}/${s}_1h.json`))[220].t));
function port(tr,risk=.0075){let eq=1e4,pk=eq,dd=0,open=[],taken=0,R=0;const months={};
 for(const x of tr){if(x.t0<from)continue;open=open.filter(o=>o.t1>x.t0);if(open.length>=4||open.filter(o=>o.g===x.g).length>=2)continue;open.push(x);taken++;R+=x.R;eq+=eq*risk*x.R;pk=Math.max(pk,eq);dd=Math.max(dd,(pk-eq)/pk);const m=new Date(x.t1).toISOString().slice(0,7);months[m]=(months[m]||0)+x.R}
 return {taken,R:+R.toFixed(1),endEq:Math.round(eq),maxDD:(dd*100).toFixed(1)+'%',months}}
const cut=all[Math.floor(all.length*.6)].t0;
const yrs=t=>(t[t.length-1].t1-Math.max(from,t[0].t0))/(365*864e5);
for(const [n,set] of [['Lernphase',all.filter(x=>x.t0<cut)],['Prüfphase (ungesehen)',all.filter(x=>x.t0>=cut)]]){const p=port(set);const y=yrs(set);
 console.log(n,new Date(Math.max(from,set[0].t0)).toISOString().slice(0,10),'bis',new Date(set[set.length-1].t1).toISOString().slice(0,10),`(${y.toFixed(2)} J.)`,'Trades',p.taken,'Summe',p.R,'R | 10.000 € →',p.endEq,'€ | p.a.',((Math.pow(p.endEq/1e4,1/y)-1)*100).toFixed(0)+'%','| max. Rückgang',p.maxDD);
 const m=Object.values(p.months);console.log('  Monate positiv:',m.filter(v=>v>0).length,'von',m.length)}

console.log('--- Beitrag je Markt (Prüfphase, nach Finanzierung, ohne Limits)');
for(const sym of ['XAUUSD','XAGUSD','BTCUSD','ETHUSD','US500','NAS100','GER40']){const t=all.filter(x=>x.sym===sym&&x.t0>=cut);const s=t.reduce((a,x)=>a+x.R,0);console.log(sym.padEnd(7),'n',String(t.length).padStart(4),'Ø',(s/t.length).toFixed(3),'Summe',s.toFixed(1))}
