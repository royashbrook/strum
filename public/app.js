import { STRINGS, settings } from './analysis.js';
import { Microphone } from './microphone.js';
import { wirePwa } from './pwa.js';
import { rememberTuning } from './tuning-memory.js';
let config = settings();
try { config = settings(JSON.parse(localStorage.getItem('strum.settings.v1'))); } catch {}
const $ = id => document.getElementById(id), canvas = document.querySelector('canvas'), ctx = canvas.getContext('2d');
let readings = STRINGS.map(s => ({ ...s, state:'quiet', cents:null, level:0 })), mode = 'idle', frame;
const tuningMemory = [];
const nodes = STRINGS.map(s => {
  const el = document.createElement('div'); el.className='string'; el.dataset.state='quiet';
  el.innerHTML=`<span class="note">${s.note}<span class="octave">${s.octave}</span></span><span class="reading">·</span><span class="reading-detail"></span>`;
  $('readings').append(el); return el;
});
function show(next) {
  readings = next;
  next.forEach((s,i) => {
    nodes[i].dataset.state=s.state;
    nodes[i].dataset.held=String(!!s.held);
    const label={quiet:'·',uncertain:'?',checking:'…',tuned:'tuned',flat:'low',sharp:'high'}[s.state];
    nodes[i].querySelector('.reading').textContent=label;
    nodes[i].querySelector('.reading-detail').textContent=s.held?'last ✓':s.state==='tuned'?`✓ ${Math.round(s.cents)}¢`:s.state==='flat'||s.state==='sharp'?`${s.cents<0?'↑':'↓'} ${Math.abs(Math.round(s.cents))}¢`:'';
    nodes[i].setAttribute('aria-label', `${s.note}${s.octave}: ${s.held?'in tune when last heard':s.state==='flat'?'low, tighten gently':s.state==='sharp'?'high, loosen gently':s.state}${s.state==='flat'||s.state==='sharp'?`, ${Math.abs(Math.round(s.cents))} cents`:''}`);
  });
}
function resetReadings(){tuningMemory.length=0;show(STRINGS.map(s=>({...s,state:'quiet',cents:null,level:0})));}
function state(next,message){mode=next;$('status').textContent=message;$('listen').textContent=next==='requesting'?'cancel':next==='listening'?'stop listening':'listen';$('input-signal').hidden=next!=='listening';if(next!=='listening')resetReadings();}
const mic=new Microphone((next,volume,capture)=>{
  show(rememberTuning(next,tuningMemory));
  $('input-level').value=Math.max(-100,volume);
  $('input-label').textContent=volume<=-100?'no sound yet':volume<config.gate?'below sensitivity':'hearing sound';
  $('input-db').textContent=volume<=-100?'< -100 dB':Math.round(volume)+' dB';
  const flag=value=>value===true?'on':value===false?'off':'not reported';
  $('mic-details').textContent=`${capture.sampleRate} Hz · ${capture.channelCount??'?'} channel(s). Noise reduction: ${flag(capture.noiseSuppression)}. Echo cancellation: ${flag(capture.echoCancellation)}. Automatic gain: ${flag(capture.autoGainControl)}.`;
},state,()=>config);
$('listen').onclick=()=>{if(mode==='listening'||mode==='requesting')mic.stop();else void mic.start();};
function silence(){mic.stop();}
wirePwa(silence);
for(const page of ['tuner','about']) $('nav-'+page).onclick=()=>{silence();for(const id of ['tuner','about']){$(id).hidden=id!==page;$('nav-'+id).hidden=id===page;}$('install-coach').hidden=true;$(page==='about'?'about-title':'listen').focus();};
$('install-shortcut').onclick=()=>{$('nav-about').click();$('install').click();};
function save(){try{localStorage.setItem('strum.settings.v1',JSON.stringify(config));}catch{}}
$('gate').oninput=()=>{config=settings({...config,gate:-Number($('gate').value)});labels();save();};
$('rejection').onchange=()=>{config=settings({...config,rejection:Number($('rejection').value)});labels();save();};
function labels(){
  $('gate').value=-config.gate;$('gate-label').textContent=config.gate+' dB';
  $('gate').setAttribute('aria-valuetext',`${config.gate} decibels; higher sensitivity hears quieter notes`);
  $('input-level').low=config.gate;
  // Preserve saved fine-grained values until a different preset is chosen.
  const old=$('saved-filter');if(old)old.remove();
  if(![.15,.35,.75].includes(config.rejection)){
    const option=new Option(config.rejection<.3?'gentle (saved)':config.rejection<.7?'balanced (saved)':'strict (saved)',config.rejection);
    option.id='saved-filter';$('rejection').append(option);
  }
  $('rejection').value=config.rejection;
} labels();resetReadings();
const reduced=matchMedia('(prefers-reduced-motion: reduce)');
function draw(time){
  if(document.hidden)return;
  const rect=canvas.getBoundingClientRect(), dpr=Math.min(devicePixelRatio||1,2);
  if(canvas.width!==Math.round(rect.width*dpr)||canvas.height!==Math.round(rect.height*dpr)){canvas.width=Math.round(rect.width*dpr);canvas.height=Math.round(rect.height*dpr);}
  ctx.setTransform(dpr,0,0,dpr,0,0);ctx.clearRect(0,0,rect.width,rect.height);
  const colors=getComputedStyle(document.documentElement), bottom=Math.max(20,rect.height-80);
  readings.forEach((s,i)=>{
    const x=rect.width*(i+.5)/6;
    const amplitude=reduced.matches||s.held?0:s.state==='quiet'?0:s.state==='tuned'?1.8:s.state==='uncertain'?3:Math.min(11,4+Math.abs(s.cents||0)/5);
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
