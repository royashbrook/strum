import { settings } from './analysis.js';
import { TUNINGS, tuningFor } from './tunings.js';
import { Microphone } from './microphone.js';
import { wirePwa } from './pwa.js';
import { rememberTuning } from './tuning-memory.js';
import { easePitch } from './pitch-motion.js';
import { listeningProfiles, listeningProfile } from './listening.js';
import { containTaps } from './gestures.js';
let profile = 'quiet';
try { profile = listeningProfile(localStorage.getItem('strum.listening.v2'), JSON.parse(localStorage.getItem('strum.settings.v1'))); } catch {}
let config = settings(listeningProfiles[profile]);
let tuning = tuningFor();
try { tuning = tuningFor(localStorage.getItem('strum.tuning.v1')); } catch {}
const $ = id => document.getElementById(id);
let readings = [], mode = 'idle', frame, activePage = 'tuner', heardNote = false;
const tuningMemory = [];
const motion = tuning.strings.map(() => ({value:0, velocity:0}));
const nodes = tuning.strings.map(s => {
  const el = document.createElement('div'); el.className='string'; el.dataset.state='quiet';el.setAttribute('role','group');
  el.innerHTML=`<div class="pitch-lane" aria-hidden="true"><span class="rail"></span><span class="target"></span><span class="pitch-position"><span class="bead"><span class="direction"></span><span class="thumb"></span></span></span></div><div class="note-label"><span class="note">${s.note}<span class="octave">${s.octave}</span></span><span class="reading">·</span><span class="reading-detail"></span></div>`;
  $('readings').append(el); return el;
});
function show(next) {
  readings = next;
  next.forEach((s,i) => {
    nodes[i].dataset.state=s.state;
    nodes[i].dataset.held=String(!!s.held);
    nodes[i].dataset.tracking=String(!!s.tracking);
    nodes[i].querySelector('.direction').textContent=s.state==='flat'?'↑':s.state==='sharp'?'↓':s.state==='uncertain'?'·':'';
    const label={quiet:'·',uncertain:'?',checking:'…',tuned:'tuned',flat:'low',sharp:'high'}[s.state];
    nodes[i].querySelector('.reading').textContent=label;
    nodes[i].querySelector('.reading-detail').textContent=s.held?'last ✓':s.state==='tuned'?`✓ ${Math.round(s.cents)}¢`:s.state==='flat'||s.state==='sharp'?`${s.cents<0?'↑':'↓'} ${Math.abs(Math.round(s.cents))}¢`:'';
    nodes[i].setAttribute('aria-label', `${s.note}${s.octave}: ${s.held?'in tune when last heard':s.state==='flat'?'low, tighten gently':s.state==='sharp'?'high, loosen gently':s.state}${s.state==='flat'||s.state==='sharp'?`, ${Math.abs(Math.round(s.cents))} cents`:''}`);
  });
}
function resetReadings(){tuningMemory.length=0;motion.forEach(m=>{m.value=0;m.velocity=0;});show(tuning.strings.map(s=>({...s,state:'quiet',cents:null,level:0})));}
for(const t of TUNINGS)$('tuning').add(new Option(t.name,t.id));
function tuningLabels(){
  $('tuning').value=tuning.id;
  tuning.strings.forEach((s,i)=>{nodes[i].querySelector('.note').innerHTML=`${s.note}<span class="octave">${s.octave}</span>`;});
  $('tuning-summary').textContent=`${tuning.name}: ${tuning.strings.map(s=>s.note).join(' ')}. A4 = 440 Hz.`;
}
$('tuning').onchange=()=>{
  tuning=tuningFor($('tuning').value);tuningLabels();resetReadings();
  try{localStorage.setItem('strum.tuning.v1',tuning.id);}catch{}
};
tuningLabels();
function placeCue(){
  if(activePage!=='tuner'||document.hidden)return;
  const ear=$('listen').getBoundingClientRect(),room=$('instrument').getBoundingClientRect(),cue=$('strum-cue');
  const x=room.x+room.width/2,y=room.y+room.height*.46;
  for(const [name,value] of Object.entries({earX:ear.x+ear.width/2-16,earY:ear.y+ear.height/2-12,guitarX:x-18,guitarY:y+12,centreX:x,centreY:y}))cue.style.setProperty('--'+name,value+'px');
}
function cue(){
  $('strum-cue').hidden=heardNote||activePage!=='tuner'||document.hidden||!['idle','listening'].includes(mode);
  $('strum-cue').dataset.stage=mode==='listening'?'strum':'tap';placeCue();
}
function state(next,message){
  mode=next;
  const label=next==='requesting'?'cancel':next==='listening'?'stop listening':'listen';
  $('listen-label').textContent=label;$('listen').setAttribute('aria-label',label);$('listen').title=label;
  $('listen').setAttribute('aria-pressed',String(next==='listening'));
  $('listen').dataset.mode=next;
  $('status').textContent=next==='listening'?(heardNote?'Let it ring.':'Strum your guitar.'):message;
  $('settings-status').textContent=message;$('settings-status').hidden=next==='listening';
  $('input-signal').hidden=next!=='listening';if(next!=='listening')resetReadings();cue();
}
const mic=new Microphone((next,volume,capture)=>{
  if(!heardNote&&next.some(s=>['flat','sharp','tuned'].includes(s.state))){heardNote=true;$('status').textContent='Let it ring.';cue();}
  show(rememberTuning(next,tuningMemory));
  $('input-level').value=Math.max(-100,volume);
  $('input-label').textContent=volume<=-100?'no sound reaching the mic':next.some(s=>['flat','sharp','tuned'].includes(s.state))?'note found':volume<config.gate?'too quiet, move closer':'sound, but no clear note';
  $('input-signal').dataset.heard=String(next.some(s=>['flat','sharp','tuned'].includes(s.state)));
  $('input-db').textContent=volume<=-100?'< -100 dB':Math.round(volume)+' dB';
  const flag=value=>value===true?'on':value===false?'off':'not reported';
  $('mic-details').textContent=`${capture.sampleRate} Hz · ${capture.channelCount??'?'} channel(s). Noise reduction: ${flag(capture.noiseSuppression)}. Echo cancellation: ${flag(capture.echoCancellation)}. Automatic gain: ${flag(capture.autoGainControl)}.`;
},state,()=>({...config,tuning:tuning.id}));
$('listen').onclick=()=>{navigate('tuner');if(mode==='listening'||mode==='requesting')mic.stop();else void mic.start();};
function silence(){mic.stop();}
wirePwa(silence);
function navigate(page){
  activePage=page;
  if(page==='about'||(page==='settings'&&mode==='requesting'))silence();
  for(const id of ['tuner','settings','about'])$(id).hidden=id!==page;
  for(const id of ['settings','about']){
    const button=$('nav-'+id),open=id===page;
    button.setAttribute('aria-expanded',String(open));button.toggleAttribute('data-current',open);
    button.setAttribute('aria-label',open?'Back to tuner':id==='settings'?'Listening settings':'About');
    button.title=button.getAttribute('aria-label');
  }
  $('listen').toggleAttribute('data-current',page==='tuner');$('install-coach').hidden=true;
  $(page==='tuner'?'listen':page+'-title').focus();cue();
}
for(const page of ['settings','about'])$('nav-'+page).onclick=()=>navigate(activePage===page?'tuner':page);
document.addEventListener('keydown',event=>{if(event.key==='Escape'&&activePage!=='tuner')navigate('tuner');});
$('install-shortcut').onclick=()=>{$('nav-about').click();$('install').click();};
for(const input of document.querySelectorAll('input[name=room]'))input.onchange=()=>{
  profile=input.value;config=settings(listeningProfiles[profile]);labels();
  try{localStorage.setItem('strum.listening.v2',profile);}catch{}
};
$('precision').onchange=()=>{$('instrument').classList.toggle('precision', $('precision').checked);};
function labels(){
  document.querySelector(`input[name=room][value=${profile}]`).checked=true;
  $('threshold').textContent=config.gate+' dB';
  $('input-level').low=config.gate;
} labels();resetReadings();
containTaps(document.querySelector('main'));
const cueLayout=new ResizeObserver(placeCue);cueLayout.observe($('instrument'));cueLayout.observe($('listen'));
const reduced=matchMedia('(prefers-reduced-motion: reduce)');
let previousTime=0;
function draw(time){
  if(document.hidden)return;
  const dt=previousTime?(time-previousTime)/1000:0;previousTime=time;
  readings.forEach((s,i)=>{
    const known=['flat','sharp','checking','tuned'].includes(s.state);
    const target=s.state==='tuned'?0:known?Math.max(-80,Math.min(80,s.cents||0)):motion[i].value;
    const value=easePitch(motion[i],target,dt,reduced.matches);
    // The position box fills the lane, so percentage transforms adapt without
    // layout reads on every frame. Sharp is above centre, flat is below it.
    nodes[i].querySelector('.pitch-position').style.transform=`translateY(${-value*.48}%)`;
    nodes[i].dataset.settled=String(Math.abs(value)<3);
  });
  frame=requestAnimationFrame(draw);
}
function redraw(){cancelAnimationFrame(frame);previousTime=0;cue();if(!document.hidden)frame=requestAnimationFrame(draw);}
document.addEventListener('visibilitychange',()=>{if(document.hidden){silence();cancelAnimationFrame(frame);}else redraw();});
addEventListener('pagehide',()=>{silence();cancelAnimationFrame(frame);});
addEventListener('pageshow',redraw);
cue();$('listen').setAttribute('data-current','');frame=requestAnimationFrame(draw);
