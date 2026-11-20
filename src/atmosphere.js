import * as THREE from 'three';

export function createAtmosphere(scene, panorama, sun, env) {
  // Add a low morning sun to the photographed sky. Its reflection is captured
  // in the same offscreen pass as the banks and the mist.
  const sky=new THREE.Mesh(new THREE.SphereGeometry(980,44,22),new THREE.ShaderMaterial({
    side:THREE.BackSide, depthWrite:false, uniforms:{skyMap:{value:panorama},sun:{value:sun}},
    vertexShader:`varying vec3 ray;
      void main(){ray=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader:`uniform sampler2D skyMap;uniform vec3 sun;varying vec3 ray;
      void main(){
        vec3 dir=normalize(ray);
        vec2 uv=vec2(atan(dir.z,dir.x)*.15915494+.522,asin(dir.y)*.31830989+.5);
        vec3 sky=texture2D(skyMap,uv).rgb;
        float angle=max(0.,dot(dir,sun));
        float veil=exp(-max(0.,dir.y)*3.2);
        sky=mix(sky,vec3(.92,.72,.47),veil*.30);
        sky+=vec3(1.,.65,.28)*(.21*pow(angle,10.)+.64*pow(angle,120.)+1.4*pow(angle,1500.)+3.*smoothstep(.99974,.99992,angle));
        gl_FragColor=vec4(sky,1.);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`
  }));
  sky.renderOrder=-100;scene.add(sky);
  const positions=[],uv=[],index=[];
  for(let i=0;i<8;i++){
    const base=i*4;
    positions.push(-60,-.12,-i*36,60,-.12,-i*36,60,4.3,-i*36,-60,4.3,-i*36);
    uv.push(0,0,1,0,1,1,0,1);index.push(base,base+1,base+2,base,base+2,base+3);
  }
  const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geo.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geo.setIndex(index);
  const mist=new THREE.Mesh(geo,new THREE.ShaderMaterial({
    transparent:true, depthWrite:false, side:THREE.DoubleSide,forceSinglePass:true,
    uniforms:{t:{value:0},eyeStation:{value:0}},
    vertexShader:`varying vec2 vUv;varying vec3 w;void main(){vUv=uv;w=(modelMatrix*vec4(position,1.)).xyz;gl_Position=projectionMatrix*viewMatrix*vec4(w,1.);}`,
    fragmentShader:`varying vec2 vUv;varying vec3 w;uniform float t;uniform float eyeStation;
      float hash(vec2 p){return fract(sin(dot(p,vec2(17.34,71.79)))*4375.14);}
      float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
        return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+1.),f.x),f.y);}
      void main(){float n=noise(w.xz*.062+vec2(t*.02,0.))*.67+noise(w.xz*.19+vUv.y*.25)*.33;
        float opacity=.30*smoothstep(8.,60.,-w.z-eyeStation)*smoothstep(.02,.21,vUv.y)*(1.-smoothstep(.15,.32+n*.66,vUv.y));
        opacity*=smoothstep(0.,.18,vUv.x)*smoothstep(0.,.18,1.-vUv.x)*n;
        gl_FragColor=vec4(.82,.76,.61,opacity);
        #include <colorspace_fragment>
      }`
  }));
  scene.add(mist);
  return function update(s,x,time){
    sky.position.set(x,0,-s);mist.position.set(env.centerX(s),0,-Math.floor(s/36)*36);
    mist.material.uniforms.t.value=time;mist.material.uniforms.eyeStation.value=s;
  };
}
