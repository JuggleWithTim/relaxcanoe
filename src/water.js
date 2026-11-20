import * as THREE from 'three';
import { Water } from 'three/addons/objects/Water.js';

export function createRiverWater(scene, env, sunDirection) {
  const rows=138, cols=9, step=3.5;
  const geometry = new THREE.BufferGeometry();
  const positions = new THREE.Float32BufferAttribute(new Float32Array(rows*cols*3),3);
  const shores = new THREE.Float32BufferAttribute(new Float32Array(rows*cols),1);
  const indices=[];
  for(let r=0;r<rows-1;r++)for(let c=0;c<cols-1;c++){
    const a=r*cols+c;indices.push(a,a+1,a+cols,a+1,a+cols+1,a+cols);
  }
  geometry.setAttribute('position',positions);geometry.setAttribute('bankDistance',shores);geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const water = new Water(geometry,{textureWidth:768, textureHeight:512, clipBias:.001, sunDirection, sunColor:0xffe6b1,waterColor:0x234e43,distortionScale:.65});
  const mat=water.material;
  const spots=Array.from({length:6},()=>new THREE.Vector4(0,0,-100,0));
  const stones=new THREE.TextureLoader().load('/assets/terrain/dry_river_pebbles.webp');
  stones.wrapS=stones.wrapT=THREE.RepeatWrapping;stones.colorSpace=THREE.SRGBColorSpace;
  Object.assign(mat.uniforms,{rings:{value:spots},boat:{value:new THREE.Vector4()},stones:{value:stones}});
  mat.vertexShader='attribute float bankDistance; varying float shore;\n'+mat.vertexShader.replace('worldPosition = mirrorCoord.xyzw;', 'worldPosition = mirrorCoord.xyzw; shore = bankDistance;');
  mat.fragmentShader='uniform vec4 rings[6]; uniform vec4 boat; uniform sampler2D stones; varying float shore;\n'+mat.fragmentShader;
  mat.fragmentShader=mat.fragmentShader.replace('vec4 noise = getNoise( worldPosition.xz * size );',`
    vec2 p = worldPosition.xz;
    // Remove the water surface inside the open hull at its waterline.
    vec2 d=p-boat.xy;
    vec2 local=vec2(dot(d,vec2(cos(boat.z),-sin(boat.z))),dot(d,vec2(sin(boat.z),cos(boat.z))));
    float t=abs((-local.y-1.2)/2.45);
    if(t<1.0) {
      float beam=.008+.462*pow(max(0.,1.-pow(t,1.9)),.86);
      float bottom=-.143+.253*pow(t,3.8)+boat.w;
      float rim=.25+.34*pow(t,3.6)+.052*pow(t,13.)+boat.w;
      if(bottom<0. && abs(local.x)<beam*sqrt(max(0.,1.-pow(1.+bottom/(rim-bottom),2.)))) discard;
    }
    // Intersecting ripples are stretched by the current. Distant fine waves
    // fade out before they become smaller than a screen pixel.
    float footprint=max(length(dFdx(p)),length(dFdy(p)));
    float bend=1.5*sin(p.x*.21+p.y*.13)+.7*cos(p.x*.57-p.y*.28-time*.18);
    float glide=1.0-smoothstep(.035,.32,footprint);
    vec2 slope=vec2(.011,.026)*cos(dot(p,vec2(.94,2.7))+bend+time*1.05)
              +vec2(-.012,.019)*cos(dot(p,vec2(-2.2,4.5))+bend*1.3+time*1.53)
              +vec2(.017,.011)*cos(dot(p,vec2(4.4,1.7))+bend-time*.78)
              +glide*(vec2(.009,.024)*cos(dot(p,vec2(5.9,14.5))+3.*bend+time*2.05)
              +vec2(-.01,.014)*cos(dot(p,vec2(-10.7,19.7))+4.*bend+time*2.65));
    for(int i=0;i<6;i++){
      float age=time-rings[i].z;
      if(age>=0. && age<4.){
        vec2 dr=p-rings[i].xy-vec2(0.,-age*.13);
        float radius=length(dr), delta=radius-.82*age;
        slope+=dr/max(.06,radius)*cos(delta*23.)*.095*exp(-delta*delta*14.-age*.78)*rings[i].w;
      }
    }
    float trail = local.y-1.2;
    if(trail>0. && trail<9.){
      float offset=abs(local.x)-trail*.26-.25;
      slope.y+=.04*cos(offset*15.)*exp(-offset*offset*5.-trail*.28);
    }
    vec4 noise=vec4(slope.x, slope.y,1.,1.);`).replace('float rf0 = 0.3;', 'float rf0 = 0.085;')
    .replace('vec3 outgoingLight = albedo;',`
    float shallow=exp(-max(0.,shore)*.5);
    vec3 bed=texture2D(stones,p*.53+slope*.13).rgb;
    vec3 under=mix(vec3(.016,.067,.057),bed*vec3(.60,.67,.49),shallow);
    float grazing=.10+.86*pow(1.-max(dot(eyeDirection,surfaceNormal),0.),3.8);
    vec3 outgoingLight=mix(under,reflectionSample,grazing)+specularLight*.38;
    `);
  water.rotation.x=-Math.PI/2;scene.add(water);
  let chunk=NaN, nextRing=0;
  return {
    update(time,m,heave) {
      const index=Math.floor(m.s/28);
      if(index!==chunk){
        chunk=index;
        for(let r=0;r<rows;r++){
          const s=chunk*28-67+r*step,half=env.riverWidth(s),mid=env.centerX(s);
          for(let c=0;c<cols;c++){
            const cross=(c/(cols-1)*2-1)*(half+1.6),i=r*cols+c;
            positions.setXYZ(i,mid+cross,s,0);shores.setX(i,half-Math.abs(cross));
          }
        }
        positions.needsUpdate=shores.needsUpdate=true;geometry.computeBoundingSphere();
      }
      mat.uniforms.time.value=time;mat.uniforms.boat.value.set(m.x,-m.s,m.yaw,heave);
    },
    stroke(side,strength,time,m) {
      const x=side==='left'?-.72:.72,z=-1.28;
      spots[nextRing].set(m.x+x*Math.cos(m.yaw)+z*Math.sin(m.yaw),-m.s-x*Math.sin(m.yaw)+z*Math.cos(m.yaw),time,strength);
      nextRing=(nextRing+1)%spots.length;
    }
  };
}
