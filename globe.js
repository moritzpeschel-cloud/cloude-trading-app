// Punkt-Globus (aus der Desktop-Übersicht übernommen)
function globe(cv){const ctx=cv.getContext('2d'),N=2600,pts=[],lit=[],hits=[];let rot=0,R=200,W,H,dpr=devicePixelRatio||1;
 for(let i=0;i<N;i++){const y=1-2*(i+.5)/N,r=Math.sqrt(1-y*y),th=i*2.399963;pts.push([Math.cos(th)*r,y,Math.sin(th)*r])}
 const size=()=>{const b=cv.getBoundingClientRect();W=b.width;H=b.height;cv.width=W*dpr;cv.height=H*dpr;ctx.setTransform(dpr,0,0,dpr,0,0);R=Math.min(W,H)*.38};size();addEventListener('resize',size);
 const tilt=.35,ct=Math.cos(tilt),stt=Math.sin(tilt);
 const proj=([x,y,z])=>{const c=Math.cos(rot),s=Math.sin(rot);let X=x*c+z*s,Z=-x*s+z*c;let Y=y*ct-Z*stt;Z=y*stt+Z*ct;return[X*R,-Y*R,Z]};
 const easeOut=k=>1-Math.pow(1-k,3);
 // Blitz-Hüllkurve: 60 ms Anstieg, bis 450 ms weich zurück. Überlappende Treffer -> Maximum (nie hängenbleibend)
 const env=dt=>dt<0?0:dt<60?dt/60:dt<450?1-easeOut((dt-60)/390):0;
 const mix=(a,b,k)=>a+(b-a)*k;
 function frame(now){if(!document.body.contains(cv))return;now=performance.now();rot+=.0022;
  for(let i=hits.length-1;i>=0;i--)if(now-hits[i].t>1400)hits.splice(i,1);
  let F=0;for(const h of hits)F=Math.max(F,env(now-h.t));
  const waves=hits.map(h=>({p:h.p,k:(now-h.t)/1100})).filter(w=>w.k<1);
  ctx.clearRect(0,0,W,H);const cx=W/2,cy=H/2;
  const g=ctx.createRadialGradient(cx,cy,R*.2,cx,cy,R*1.45);g.addColorStop(0,`rgba(${mix(10,127,F)|0},${mix(80,212,F)|0},${mix(200,255,F)|0},${.20+F*.35})`);g.addColorStop(.7,`rgba(${mix(10,127,F)|0},${mix(90,212,F)|0},255,${.10+F*.25})`);g.addColorStop(1,'rgba(0,0,0,0)');ctx.fillStyle=g;ctx.fillRect(0,0,W,H);
  const g2=ctx.createRadialGradient(cx-R*.3,cy-R*.3,R*.1,cx,cy,R);g2.addColorStop(0,`rgba(${mix(40,127,F)|0},${mix(110,212,F)|0},255,${.20+F*.3})`);g2.addColorStop(1,`rgba(5,${mix(20,90,F)|0},${mix(60,140,F)|0},.35)`);ctx.beginPath();ctx.arc(cx,cy,R,0,7);ctx.fillStyle=g2;ctx.fill();
  ctx.strokeStyle=`rgba(${mix(90,127,F)|0},${mix(170,212,F)|0},255,${.35+F*.6})`;ctx.lineWidth=1.2+F*1.5;ctx.shadowColor=F>.05?'#7fd4ff':'#0a84ff';ctx.shadowBlur=30+F*50;ctx.stroke();ctx.shadowBlur=0;
  // Halo-Puls außen
  for(const h of hits){const k=(now-h.t)/900;if(k<0||k>1)continue;const e=easeOut(k);ctx.beginPath();ctx.arc(cx,cy,R*(1.02+e*.22),0,7);ctx.strokeStyle=`rgba(127,212,255,${(1-e)*.45})`;ctx.lineWidth=6*(1-e)+1;ctx.shadowColor='#7fd4ff';ctx.shadowBlur=24;ctx.stroke();ctx.shadowBlur=0}
  const cr=mix(110,127,F),cg=mix(180,212,F);
  for(const p of pts){const [x,y,z]=proj(p);if(z<-.05){ctx.fillStyle=`rgba(60,130,255,${.08+F*.12})`;ctx.fillRect(cx+x,cy+y,1,1);continue}
   let w=0;for(const v of waves){const ang=Math.acos(Math.max(-1,Math.min(1,p[0]*v.p[0]+p[1]*v.p[1]+p[2]*v.p[2])));const front=easeOut(v.k)*Math.PI*.9;const d=Math.abs(ang-front);if(d<.12)w=Math.max(w,(1-d/.12)*(1-v.k))}
   const a=Math.min(1,.35+z*.65+F*.45+w*.8);const s=1+z*1.1+w*1.6;
   ctx.fillStyle=w>.02?`rgba(${mix(cr,220,w)|0},${mix(cg,245,w)|0},255,${a})`:`rgba(${cr|0},${cg|0},255,${a})`;ctx.fillRect(cx+x-s/2,cy+y-s/2,s,s)}
  for(let i=lit.length-1;i>=0;i--){const L=lit[i];L.a*=.9965;if(L.a<.05){lit.splice(i,1);continue}const [x,y,z]=proj(L.p);if(z<0)continue;
   ctx.beginPath();ctx.arc(cx+x,cy+y,(L.big?3:1.3)+L.a*(L.big?5:1.8),0,7);ctx.fillStyle=`rgba(190,230,255,${L.a})`;ctx.shadowColor='#7fd4ff';ctx.shadowBlur=18;ctx.fill();ctx.shadowBlur=0}
  requestAnimationFrame(frame)}requestAnimationFrame(frame);
 return{radius:()=>R,flash:()=>hits.length?Math.max(...hits.map(h=>env(performance.now()-h.t))):0,randomFront(left){const c=Math.cos(rot),s=Math.sin(rot);let X=(left?-1:1)*(.15+Math.random()*.6),Y=(Math.random()-.5)*1.1,Zv=Math.sqrt(Math.max(.05,1-X*X-Y*Y));
   const yy=Y*ct+Zv*stt,zz=-Y*stt+Zv*ct;const x=X*c-zz*s,z=X*s+zz*c;return{p:[x,yy,z],x:X*R,y:-Y*R}},
  toward(ux,uy){const c=Math.cos(rot),s=Math.sin(rot),k=.3+Math.random()*.45,j=(Math.random()-.5)*.35;let X=ux*k-uy*j,Y=-uy*k-ux*j*.6;const n=Math.hypot(X,Y);if(n>.9){X*=.9/n;Y*=.9/n}const Zv=Math.sqrt(Math.max(.05,1-X*X-Y*Y));
   const yy=Y*ct+Zv*stt,zz=-Y*stt+Zv*ct;const x=X*c-zz*s,z=X*s+zz*c;return{p:[x,yy,z],x:X*R,y:-Y*R}},
  hit(t){hits.push({p:t.p,t:performance.now()});if(hits.length>8)hits.shift();lit.push({p:t.p,a:1,big:1});for(let i=0;i<10;i++)lit.push({p:pts[(Math.random()*N)|0],a:.6})}}}
