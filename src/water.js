import * as THREE from "three";
import { Water } from "three/addons/objects/Water.js";

export function createRiverWater(scene, env, sunDirection, sky) {
  const rows = 138,
    cols = 9,
    step = 3.5;
  const geometry = new THREE.BufferGeometry();
  const positions = new THREE.Float32BufferAttribute(
    new Float32Array(rows * cols * 3),
    3,
  );
  const shores = new THREE.Float32BufferAttribute(
    new Float32Array(rows * cols),
    1,
  );
  const indices = [];
  for (let r = 0; r < rows - 1; r++)
    for (let c = 0; c < cols - 1; c++) {
      const a = r * cols + c;
      indices.push(a, a + 1, a + cols, a + 1, a + cols + 1, a + cols);
    }
  geometry.setAttribute("position", positions);
  geometry.setAttribute("bankDistance", shores);
  geometry.setIndex(indices);
  const normals = new THREE.Float32BufferAttribute(
    new Float32Array(rows * cols * 3),
    3,
  );
  for (let i = 0; i < normals.count; i++) normals.setZ(i, 1);
  geometry.setAttribute("normal", normals);
  const water = new Water(geometry, {
    textureWidth: 768,
    textureHeight: 512,
    clipBias: 0.001,
    sunDirection,
    sunColor: 0xffe6b1,
    waterColor: 0x234e43,
    distortionScale: 0.65,
  });
  const mat = water.material;
  const spots = Array.from(
    { length: 6 },
    () => new THREE.Vector4(0, 0, -100, 0),
  );
  const stones = new THREE.TextureLoader().load(
    "/assets/terrain/dry_river_pebbles.webp",
  );
  stones.wrapS = stones.wrapT = THREE.RepeatWrapping;
  stones.colorSpace = THREE.SRGBColorSpace;
  const waveMap = new THREE.TextureLoader().load("/assets/water-slopes.png");
  waveMap.wrapS = waveMap.wrapT = THREE.RepeatWrapping;
  waveMap.anisotropy = 4;
  Object.assign(mat.uniforms, {
    waveMap: { value: waveMap },
    immersive: { value: false },
    skyMap: { value: sky },
    rings: { value: spots },
    boat: { value: new THREE.Vector4() },
    stones: { value: stones },
  });
  mat.vertexShader =
    "attribute float bankDistance; varying float shore;\n" +
    mat.vertexShader.replace(
      "worldPosition = mirrorCoord.xyzw;",
      "worldPosition = mirrorCoord.xyzw; shore = bankDistance;",
    );
  mat.fragmentShader =
    "uniform bool immersive; uniform sampler2D skyMap; uniform sampler2D waveMap; uniform vec4 rings[6]; uniform vec4 boat; uniform sampler2D stones; varying float shore;\n" +
    mat.fragmentShader;
  mat.fragmentShader = mat.fragmentShader
    .replace(
      "vec4 noise = getNoise( worldPosition.xz * size );",
      `
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
    vec2 current=vec2(sin(p.y*.07)*.17,-.38);
    vec2 eddy=(texture2D(waveMap,(p-current*time)/6.9).rg-.5);
    vec2 capillary=texture2D(waveMap,p*.46+eddy*.06+vec2(time*.008,time*.067)).rg-.5;
    slope=slope*.64+eddy*.19+capillary*.088;
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
    vec4 noise=vec4(slope.x, slope.y,1.,1.);`,
    )
    .replace("eye-worldPosition.xyz", "cameraPosition-worldPosition.xyz")
    .replace("float theta =", `
      if (immersive) {
        vec3 ray = reflect(-eyeDirection, surfaceNormal);
        vec2 uv = vec2(atan(ray.z, ray.x)*.15915494+.522, asin(clamp(ray.y,-1.,1.))*.31830989+.5);
        reflectionSample = mix(texture2D(skyMap,uv).rgb, vec3(.17,.24,.19), .55*exp(-5.*abs(ray.y)));
      }
      float theta =`)
    .replace("float rf0 = 0.3;", "float rf0 = 0.085;")
    .replace(
      "vec3 outgoingLight = albedo;",
      `
    float shallow=exp(-max(0.,shore)*.5);
    vec3 bed=texture2D(stones,p*.53+slope*.13).rgb;
    vec3 under=mix(vec3(.016,.067,.057),bed*vec3(.60,.67,.49),shallow);
    float grazing=.10+.86*pow(1.-max(dot(eyeDirection,surfaceNormal),0.),3.8);
    vec3 halfway=normalize(sunDirection+eyeDirection);
    float sunGlint=pow(max(0.,dot(surfaceNormal,halfway)),1850.);
    float sunlightAtSurface = getShadowMask();
    vec3 outgoingLight=mix(under*mix(.70,1.,sunlightAtSurface),reflectionSample,grazing)
      +sunColor*(specularLight*.16+sunGlint*.76)*sunlightAtSurface;
    `,
    );
  const reflectScene = water.onBeforeRender;
  water.onBeforeRender = function (renderer, scene, camera) {
    if (!renderer.xr.isPresenting) reflectScene.call(this, renderer, scene, camera);
  };
  water.rotation.x = -Math.PI / 2;
  water.receiveShadow = true;
  scene.add(water);
  let chunk = NaN,
    nextRing = 0;
  return {
    update(time, m, heave, immersive) {
      const index = Math.floor(m.s / 28);
      if (index !== chunk || mat.uniforms.immersive.value !== immersive) {
        chunk = index;
        mat.uniforms.immersive.value = immersive;
        for (let r = 0; r < rows; r++) {
          const s = chunk * 28 + (immersive ? (r - rows / 2) * 5.5 : r * step - 67),
            half = env.riverWidth(s),
            mid = env.centerX(s);
          for (let c = 0; c < cols; c++) {
            const cross = ((c / (cols - 1)) * 2 - 1) * (half + 1.6),
              i = r * cols + c;
            positions.setXYZ(i, mid + cross, s, 0);
            shores.setX(i, half - Math.abs(cross));
          }
        }
        positions.needsUpdate = shores.needsUpdate = true;
        geometry.computeBoundingSphere();
      }
      mat.uniforms.time.value = time;
      mat.uniforms.boat.value.set(m.x, -m.s, m.yaw, heave);
    },
    stroke(side, strength, time, m, contact) {
      const x = contact?.x ?? (side === "left" ? -0.72 : 0.72),
        z = contact?.z ?? -1.28;
      spots[nextRing].set(
        m.x + x * Math.cos(m.yaw) + z * Math.sin(m.yaw),
        -m.s - x * Math.sin(m.yaw) + z * Math.cos(m.yaw),
        time,
        strength,
      );
      nextRing = (nextRing + 1) % spots.length;
    },
  };
}
