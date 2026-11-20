import * as THREE from 'three';
import { createCanoe } from './canoe.js';
import { createAtmosphere } from './atmosphere.js';
import { createRiverWater } from './water.js';

export async function createWorld(container,env) {
  const renderer=new THREE.WebGLRenderer({antialias:true,alpha:false,powerPreference:'high-performance'});
  renderer.toneMapping=THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure=1.04;
  const maxRatio=Math.min(window.devicePixelRatio||1,1.55);
  let ratio=maxRatio;
  renderer.setPixelRatio(ratio);
  const scene=new THREE.Scene();
  const sky=await new THREE.TextureLoader().loadAsync('/assets/dawn-sky.webp');
  sky.mapping=THREE.EquirectangularReflectionMapping;
  sky.colorSpace=THREE.SRGBColorSpace;
  scene.background=sky;scene.environment=sky;
  scene.backgroundRotation.y=scene.environmentRotation.y=-2.11;
  scene.environmentIntensity=.55;scene.backgroundIntensity=1.15;
  scene.fog=new THREE.FogExp2(0xc4c5b2,.0026);
  const camera=new THREE.PerspectiveCamera(64,1,.065,1400);
  camera.rotation.order='YXZ';
  const sunDirection=new THREE.Vector3(.64,.282,-.89).normalize();
  const atmosphere=createAtmosphere(scene,sky,sunDirection,env);
  const sunlight=new THREE.DirectionalLight(0xffdeab,2.25);
  sunlight.position.copy(sunDirection);scene.add(sunlight);
  scene.add(new THREE.HemisphereLight(0xe4e8ec,0x6d7557,1.22));
  const banks=env.createLandscape(scene);
  const river=createRiverWater(scene,env,sunDirection);
  const canoe=await createCanoe(scene);
  const resize=()=>{
    const w=container.clientWidth,h=container.clientHeight;
    renderer.setSize(w,h,false);
    camera.aspect=w/Math.max(1,h);camera.updateProjectionMatrix();
  };
  new ResizeObserver(resize).observe(container);resize();
  container.append(renderer.domElement);
  let seconds=0, slowTime=0, fastTime=0, lookX=0, lookY=0, desiredX=0, desiredY=0, pointer=null, lastX,lastY;
  renderer.domElement.style.touchAction='none';
  renderer.domElement.addEventListener('pointerdown',e=>{
    pointer=e.pointerId;lastX=e.clientX;lastY=e.clientY;
    renderer.domElement.setPointerCapture(pointer);
  });
  renderer.domElement.addEventListener('pointermove',e=>{
    if(e.pointerId!==pointer)return;
    desiredX=THREE.MathUtils.clamp(desiredX-(e.clientX-lastX)*.003,-1.3,1.3);
    desiredY=THREE.MathUtils.clamp(desiredY-(e.clientY-lastY)*.003,-.55,.48);
    lastX=e.clientX;lastY=e.clientY;
  });
  renderer.domElement.addEventListener('lostpointercapture',()=>{pointer=null;desiredX=0;desiredY=0});
  const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
  function render(dt,m,frameInterval=0){
    seconds+=dt;
    const bob=reduced?0:.009*Math.sin(seconds*1.08)+.004*Math.sin(seconds*1.9);
    const rocking=reduced?0:.005*Math.sin(seconds*.85)+m.roll*.52;
    banks.update(m.s,m.x);
    atmosphere(m.s,m.x,seconds);
    canoe.group.position.set(m.x,bob,-m.s);
    canoe.group.rotation.order='YXZ';
    canoe.group.rotation.set(0,m.yaw,rocking);
    canoe.update(seconds,m.leftPhase,m.rightPhase);
    river.update(seconds,m,bob);
    const ease=1-Math.exp(-5*dt);
    lookX+=(desiredX-lookX)*ease;lookY+=(desiredY-lookY)*ease;
    camera.position.set(m.x,1.08+bob,-m.s);
    camera.rotation.set(-.105+lookY,m.yaw+lookX,rocking*.46);
    renderer.render(scene,camera);
    // Resist transient shader compilation stalls. Only scale after sustained slow frames.
    if(frameInterval>0){
      slowTime=frameInterval>.032?slowTime+Math.min(.15,frameInterval):Math.max(0,slowTime-dt);
      fastTime=frameInterval<.021?fastTime+dt:0;
      const next=slowTime>2.8?Math.max(.62,ratio*.83):fastTime>18?Math.min(maxRatio,ratio+.08):ratio;
      if(next!==ratio){ratio=next;renderer.setPixelRatio(ratio);resize();slowTime=fastTime=0;}
    }
  }
  return {render,stroke:(side,strength,m)=>river.stroke(side,strength,seconds,m)};
}
