import { environments } from './environments.js';
import { createPaddling } from './paddling.js';
import { createSound } from './sound.js';
import { drawChart } from './chart.js';

const env=environments[0];
const el=id=>document.getElementById(id);
const root=el('experience'), enter=el('enter'), pauseButton=el('pause-btn'), soundButton=el('sound-toggle');
const sound=createSound({onStateChange:syncSound});
let world, mode='arrival', loading=false, muted=false;
try { muted=localStorage.getItem('stillwater-muted')==='true'; } catch {}
function setMode(next) {
  mode=root.dataset.mode=next;
  const playing=next==='playing';
  pauseButton.hidden=!playing;
  el('touch-controls').hidden=!playing;
  document.querySelector('.arrival').inert=playing;
  if(next==='paused'){
    enter.querySelector('span').textContent='Resume canoeing';
    el('map-label').textContent='Canoe position';
    drawChart(el('chart'),env.centerX,env.riverWidth,controls.motion.s,controls.motion.x);
    enter.focus({preventScroll:true});
  }
}
function syncSound(){
  sound.setMuted(muted);
  soundButton.querySelector('use').setAttribute('href', muted?'#mute':'#sound');
  const blocked=!muted && sound.isBlocked;
  soundButton.querySelector('span').textContent=blocked?'Enable sound':muted?'Sound off':'Sound on';
  soundButton.setAttribute('aria-label',muted||blocked?'Enable sound':'Mute sound');
  soundButton.setAttribute('aria-pressed',String(!muted&&!blocked));
}
async function begin(){
  if(loading||document.hidden||mode==='playing')return;
  sound.start();sound.setPaused(false);
  if(!world){
    loading=true;enter.disabled=true;enter.querySelector('span').textContent='Opening river…';
    el('status').textContent='';
    try {
      const {createWorld}=await import('./world.js');
      world=await createWorld(el('world'),env);
      world.render(0,controls.motion);
    } catch(error){
      console.error('River initialization failed',error);
      el('status').textContent='The 3D river needs WebGL 2. Enable graphics acceleration and try again.';
      enter.querySelector('span').textContent='Retry canoeing';
      sound.setPaused(true);
      return;
    } finally {loading=false;enter.disabled=false;}
  }
  if(document.hidden){pause();return;}
  setMode('playing');pauseButton.focus({preventScroll:true});
}
function pause(){
  if(!world)return;
  controls.clear();sound.setPaused(true);setMode('paused');
}
const controls=createPaddling({
  ...env,onActivate:begin,onStroke(side,strength){
    sound.stroke(side,strength);world?.stroke(side,strength,controls.motion);
  }
});
enter.addEventListener('click',begin);pauseButton.addEventListener('click',pause);
document.addEventListener('keydown',e=>{
  if(e.key==='Escape'&&mode==='playing'){e.preventDefault();pause();}
});
document.addEventListener('visibilitychange',()=>{
  if(document.hidden&&mode==='playing')pause();
});
let unlocking=false;
for(const event of ['pointerdown','keydown'])soundButton.addEventListener(event,()=>{unlocking=!muted && sound.isBlocked;});
soundButton.addEventListener('click',()=>{
  muted=unlocking?false:!muted;unlocking=false;syncSound();
  if(!muted){sound.start();sound.setPaused(mode==='paused');}
  try{localStorage.setItem('stillwater-muted',String(muted));}catch{}
});
syncSound();
const full=el('fullscreen');
if(!document.fullscreenEnabled)full.hidden=true;
full.addEventListener('click',async()=>{
  try{if(document.fullscreenElement)await document.exitFullscreen();else await root.requestFullscreen();}
  catch{full.title='Fullscreen is unavailable in this browser window';}
});
document.addEventListener('fullscreenchange',()=>{
  full.setAttribute('aria-label',document.fullscreenElement?'Exit fullscreen':'Enter fullscreen');
  full.querySelector('use').setAttribute('href',document.fullscreenElement?'#collapse':'#expand');
});
for(const button of el('touch-controls').querySelectorAll('button')){
  const side=button.dataset.side;
  button.addEventListener('pointerdown',e=>{
    e.preventDefault();button.setPointerCapture(e.pointerId);controls.touch(side,true);
  });
  button.addEventListener('lostpointercapture',()=>controls.touch(side,false));
}
drawChart(el('chart'),env.centerX,env.riverWidth);
let last=performance.now();
function frame(now){
  requestAnimationFrame(frame);
  const interval=Math.max(0,(now-last)/1000);
  last=now;
  const dt=Math.min(.09,interval),play=mode==='playing'&&!document.hidden;
  const motion=controls.update(dt,play);
  if(play)world.render(dt,motion,interval);
  sound.update(dt,motion);
}
requestAnimationFrame(frame);
