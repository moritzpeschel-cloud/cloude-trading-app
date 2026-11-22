const fs=require('fs'),T=require('/home/user/cloude-trading-app/bot/ta');const D=process.argv[2];
const IX=['US500','NAS100','US30','US2000','GER40','EU50','FRA40','UK100','JP225','AUS200','HK50'];
function run(sym,v){const d=JSON.parse(fs.readFileSync(`${D}/${sym}_1d10.json`));const c=d.map(x=>x.c),s=T.compute(d),r2=T.rsi(c,2),s200=T.sma(c,200),s5=T.sma(c,5);const cost=c[c.length-1]*.0002;const tr=[];let i=205;
 while(i<d.length-2){const ibs=(d[i].c-d[i].l)/((d[i].h-d[i].l)||1);let sig=c[i]>s200[i]&&(v.ibs?ibs<v.ibs&&r2[i]<(v.lvl||100):r2[i]<v.lvl);if(!sig){i++;continue}
  const e=d[i+1].o+cost/2,risk=2.5*s.atr[i];let st=e-risk,ex=null,k=i+1;for(;k<Math.min(d.length,i+1+10);k++){const x=d[k];if(x.l<=st){ex=Math.min(x.o,st);break}if(c[k]>(v.exitHigh?d[k-1].h:s5[k])){ex=x.c;break}}
  if(ex==null){k=Math.min(k,d.length-1);ex=c[k]}tr.push({t:d[i+1].t,R:(ex-e-cost/2-e*.06*(k-i)/365)/risk});i=k+1}
 const cut=d[Math.floor(d.length*.6)].t;return{A:tr.filter(x=>x.t<cut),Z:tr.filter(x=>x.t>=cut)}}
const st=t=>{const n=t.length;if(!n)return'n0';const s=t.reduce((a,x)=>a+x.R,0),gw=t.filter(x=>x.R>0).reduce((a,x)=>a+x.R,0),gl=-t.filter(x=>x.R<=0).reduce((a,x)=>a+x.R,0);return `n${String(n).padStart(4)} Ø${(s/n>=0?'+':'')+(s/n).toFixed(3)} PF${(gl?gw/gl:99).toFixed(2)} WR${Math.round(t.filter(x=>x.R>0).length/n*100)}%`};
for(const [name,v] of Object.entries({'RSI-2 <10, Exit SMA5':{lvl:10},'RSI-2 <5, Exit SMA5':{lvl:5},'IBS <0.2 + RSI-2 <30':{ibs:.2,lvl:30},'RSI-2 <10, Exit über Vortageshoch':{lvl:10,exitHigh:1}})){
 let A=[],Z=[];const per=[];for(const s of IX){const r=run(s,v);A=A.concat(r.A);Z=Z.concat(r.Z);const m=t=>t.length?(t.reduce((a,x)=>a+x.R,0)/t.length).toFixed(2):'-';per.push(`${s}:${m(r.A)}/${m(r.Z)}`)}
 console.log(name.padEnd(34),'LERN',st(A),'| PRÜF',st(Z));console.log('   ',per.join(' '))}
