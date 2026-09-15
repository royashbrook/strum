import { STRINGS, settings } from './analysis.js';
import { Microphone } from './microphone.js';
import { wirePwa } from './pwa.js';
let config = settings();
try { config = settings(JSON.parse(localStorage.getItem('strum.settings.v1'))); } catch {}
const $ = id => document.getElementById(id), canvas = document.querySelector('canvas'), ctx = canvas.getContext('2d');
let readings = STRINGS.map(s => ({ ...s, state:'quiet', cents:null, level:0 })), mode = 'idle', demo = false, frame;
const nodes = STRINGS.map(s => {
  const el = document.createElement('div'); el.className='string'; el.dataset.state='quiet';
  el.innerHTML=`<span class="note">${s.note}<span class="octave">${s.octave}</span></span><span class="reading">·</span>`;
  $('readings').append(el); return el;
});
function show(next) {
  readings = next;
  next.forEach((s,i) => {
    nodes[i].dataset.state=s.state;
    const text=s.state==='quiet'?'·':s.state==='uncertain'?'?':s.state==='tuned'?'✓':`${s.cents<0?'↑':'↓'} ${Math.abs(Math.round(s.cents))}¢`;
    nodes[i].querySelector('.reading').textContent=text;
    nodes[i].setAttribute('aria-label', `${s.note}${s.octave}: ${s.state}${s.state==='flat'||s.state==='sharp'?`, ${Math.abs(Math.round(s.cents))} cents`:''}`);
  });
}
function resetReadings(){show(STRINGS.map(s=>({...s,state:'quiet',cents:null,level:0})));}
function state(next,message){mode=next;$('status').textContent=message;$('listen').textContent=next==='requesting'?'cancel':next==='listening'?'stop listening':'listen';if(next!=='listening')resetReadings();}
const mic=new Microphone(show,state,()=>config);
$('listen').onclick=()=>{demo=false;$('demo').textContent='preview motion';if(mode==='listening'||mode==='requesting')mic.stop();else void mic.start();};
$('demo').onclick=()=>{mic.stop();demo=!demo;$('demo').textContent=demo?'stop preview':'preview motion';$('status').textContent=demo?'Motion preview. Simulated readings, not your microphone.':'Tap listen, then strum all six strings.';if(!demo)resetReadings();};
function silence(){demo=false;$('demo').textContent='preview motion';mic.stop();}
wirePwa(silence);
for(const page of ['tuner','about']) $('nav-'+page).onclick=()=>{silence();for(const id of ['tuner','about']){$(id).hidden=id!==page;$('nav-'+id).removeAttribute('aria-current');}$('nav-'+page).setAttribute('aria-current','page');};
for(const key of ['gate','rejection']){
  $(key).value=config[key];
  $(key).oninput=()=>{config=settings({...config,[key]:Number($(key).value)});labels();try{localStorage.setItem('strum.settings.v1',JSON.stringify(config));}catch{}};
}
function labels(){$('gate-label').textContent=config.gate+' dB';$('rejection-label').textContent=Math.round(config.rejection*100)+'%';} labels();resetReadings();
const reduced=matchMedia('(prefers-reduced-motion: reduce)');
function draw(time){
  if(document.hidden)return;
  const rect=canvas.getBoundingClientRect(), dpr=Math.min(devicePixelRatio||1,2);
  if(canvas.width!==Math.round(rect.width*dpr)||canvas.height!==Math.round(rect.height*dpr)){canvas.width=Math.round(rect.width*dpr);canvas.height=Math.round(rect.height*dpr);}
  ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,rect.width,rect.height);
  if(demo)show(STRINGS.map((s,i)=>({...s,cents:i===2?-15:i===4?9:0,state:i===2?'flat':i===4?'sharp':'tuned',level:.8})));
  const colors=getComputedStyle(document.documentElement), bottom=Math.max(20,rect.height-56);
  readings.forEach((s,i)=>{
    const x=rect.width*(i+.5)/6;
    const amplitude=reduced.matches?0:s.state==='quiet'?0:s.state==='tuned'?1.8:s.state==='uncertain'?3:Math.min(11,4+Math.abs(s.cents||0)/5);
    ctx.strokeStyle=colors.getPropertyValue(s.state==='tuned'?'--accent':s.state==='quiet'?'--line':s.state==='uncertain'?'--muted':'--warn').trim();
    ctx.lineWidth=3.6-i*.45;ctx.lineCap='round';ctx.beginPath();
    for(let y=8;y<=bottom;y+=2){const envelope=Math.sin(Math.PI*(y-8)/Math.max(1,bottom-8));const shift=amplitude*envelope*Math.sin(y*.045*(i+1)+time*.004);if(y===8)ctx.moveTo(x+shift,y);else ctx.lineTo(x+shift,y);}ctx.stroke();
    ctx.fillStyle=ctx.strokeStyle;ctx.beginPath();ctx.arc(x,8,4,0,Math.PI*2);ctx.fill();
  });
  frame=requestAnimationFrame(draw);
}
function redraw(){cancelAnimationFrame(frame);if(!document.hidden)frame=requestAnimationFrame(draw);}
document.addEventListener('visibilitychange',()=>{if(document.hidden){silence();cancelAnimationFrame(frame);}else redraw();});
addEventListener('pagehide',()=>{silence();cancelAnimationFrame(frame);});
addEventListener('pageshow',redraw);
frame=requestAnimationFrame(draw);
