import { centerX, riverWidth } from './course.js';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { closeBankTrees, nearTreeLayout } from './riverbank-trees.js';

// Distances follow the river downstream. A bank offset of zero is the waterline.
const TAU = Math.PI * 2;
const SECTION = 48;
const assets = '/assets/terrain/';
function hash(x, y) {
  let n = Math.imul(x, 374761393) + Math.imul(y, 668265263);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

function noise(x, y) {
  const i = Math.floor(x), j = Math.floor(y);
  const u = x - i, v = y - j;
  const a = u * u * (3 - 2 * u), b = v * v * (3 - 2 * v);
  return THREE.MathUtils.lerp(
    THREE.MathUtils.lerp(hash(i, j), hash(i + 1, j), a),
    THREE.MathUtils.lerp(hash(i, j + 1), hash(i + 1, j + 1), a), b);
}

function rng(seed) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function groundHeight(s, d, side) {
  const x = centerX(s) + side * (riverWidth(s) + d);
  const relief = noise(x * 0.034, s * 0.034);
  const hills = noise(x * 0.010, s * 0.010);
  if (d <= 0) return Math.max(-2.5, d * (0.26 + 0.4 * relief));
  const beach = (0.55 + 1.4 * relief) * (1 - Math.exp(-d * 0.21));
  const slope = Math.max(d - 4 - 7 * relief, 0);
  return beach + slope * (0.035 + 0.31 * hills + 0.06 * relief)
    + (noise(x * 0.33, s * 0.33) - 0.5) * Math.min(0.4, d * 0.1);
}

function geometry(position, indices, attributes) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(position, 3));
  for (const [name, [data, size]] of Object.entries(attributes)) {
    g.setAttribute(name, new THREE.Float32BufferAttribute(data, size));
  }
  if (indices.length) g.setIndex(indices);
  return g;
}

function texture(loader, name, repeat = true) {
  const map = loader.load(assets + name);
  map.colorSpace = THREE.SRGBColorSpace;
  if (repeat) map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.anisotropy = 4;
  return map;
}

function createMaterials() {
  const loader = new THREE.TextureLoader();
  const forest = texture(loader, 'forest_ground_04.webp');
  const bank = new THREE.MeshLambertMaterial({
    map: texture(loader, 'dry_river_pebbles.webp'), vertexColors: true,
  });
  bank.onBeforeCompile = shader => {
    shader.uniforms.forestMap = { value: forest };
    shader.vertexShader = 'attribute float cover; varying float groundCover;\n' + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>',
      '#include <begin_vertex>\n groundCover = cover;');
    shader.fragmentShader = 'uniform sampler2D forestMap; varying float groundCover;\n' + shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace('#include <map_fragment>', `
      vec4 gravel = texture2D(map, vMapUv);
      vec4 floorSample = texture2D(forestMap, vMapUv * 0.51);
      diffuseColor *= mix(gravel, floorSample, smoothstep(0.1, 0.9, groundCover));
    `);
  };
  const trees = new THREE.MeshBasicMaterial({
    map: texture(loader, 'trees.webp', false),
    alphaTest: 0.31, vertexColors: true, side: THREE.DoubleSide,
  });
  trees.onBeforeCompile = shader => {
    shader.vertexShader = 'attribute vec2 offset;\n' + shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', `
      vec3 transformed = position;
      vec2 toCamera = normalize(cameraPosition.xz - position.xz + vec2(0.00001));
      transformed.xz += vec2(toCamera.y, -toCamera.x) * offset.x;
      transformed.y += offset.y;
    `);
  };
  const rocks = new THREE.MeshLambertMaterial({map: texture(loader, 'mossy_rock.webp')});
  const grass = new THREE.MeshLambertMaterial({side: THREE.DoubleSide, vertexColors: true});
  const bark = new THREE.MeshLambertMaterial({map:texture(loader,'fir-bark.webp'), vertexColors:true});
  const needles = new THREE.MeshLambertMaterial({
    map:texture(loader,'spruce-bough.webp',false), side:THREE.DoubleSide, alphaTest:0.26,
    vertexColors:true, color:0xcdd0b7, emissive:0x151b12,
  });
  return {bank, trees, rocks, grass, bark, needles};
}

const depths = [
  [-4, -1, 0, 0.8, 1.8, 3, 4.4, 6, 8, 11, 15, 20, 28, 38, 51, 68, 90, 120],
  [-4, 0, 1.8, 4.4, 8, 15, 28, 51, 90, 120],
  [-4, 0, 4.4, 15, 38, 68, 120],
];

function makeBanks(start, detail, material) {
  const pos = [], idx = [], uv = [], cover = [], colors = [];
  const ds = depths[detail], n = ds.length, length = [24, 8, 4][detail];
  for (const side of [-1, 1]) {
    const first = pos.length / 3;
    for (let j = 0; j <= length; j++) {
      const s = start + SECTION * j / length;
      for (let k = 0; k < n; k++) {
        const d = ds[k], x = centerX(s) + side * (riverWidth(s) + d);
        pos.push(x, groundHeight(s, d, side), -s);
        uv.push(x * 0.51, -s * 0.51);
        const patch = noise(x * 0.19, s * 0.19);
        const moss = THREE.MathUtils.smoothstep(d + 2.8 * patch, 2, 6);
        const tone = (0.72 + 0.44 * patch) * (0.63 + 0.37 * THREE.MathUtils.smoothstep(d, 0, 1.4));
        cover.push(moss);
        colors.push(tone * (1 - 0.28*moss), tone * (1 + 0.19*moss), tone * (1 - 0.27*moss));
        if (j === length || k === n - 1) continue;
        const a = first + j*n + k, b = a + 1, c = a + n, e = c + 1;
        if (side === 1) idx.push(a,b,c,b,e,c);
        else idx.push(a,c,b,b,c,e);
      }
    }
  }
  const g = geometry(pos, idx, {uv:[uv,2], cover:[cover,1], color:[colors,3]});
  g.computeVertexNormals();
  const mesh = new THREE.Mesh(g, material);
  mesh.receiveShadow = true;
  return mesh;
}

function makeForest(start, detail, material, nearTrees) {
  const pos = [], idx = [], uv = [], offsets = [], colors = [];
  const ratios = [0.352, 0.492, 0.445, 0.322];
  const random = rng(hash(start, 181) * 4294967295);
  function plant(x, y, s, h, width, type, shade) {
    const a = pos.length / 3;
    const mirror = random() < 0.5;
    const tint = random() * 0.19;
    for (let j = 0; j < 4; j++) {
      const u = j === 1 || j === 2 ? 1 : 0, v = j >= 2 ? 1 : 0;
      pos.push(x, y, -s);
      offsets.push((u - 0.5) * width, h * v);
      uv.push((type + (mirror ? 1-u : u)) / 4, v);
      const light = shade * (0.75 + 0.25*v);
      colors.push(light * (0.83 + tint), light * (0.90 + tint*0.4), light * (0.91 + tint));
    }
    idx.push(a,a+1,a+2,a,a+2,a+3);
  }
  // Independent sequences keep the same trunks in place when a section upgrades.
  for (const side of [-1,1]) {
    for (let i = 0; i < 250; i++) {
      const s = start + random()*SECTION;
      const d = 3 + Math.pow(random(),1.4)*100;
      const x = centerX(s) + side*(riverWidth(s)+d);
      const variant = random(), hRandom = random(), widthRandom = random(), thinning = random();
      const type = variant < 0.49 ? 0 : variant < 0.70 ? 1 : variant < 0.87 ? 2 : 3;
      const h = (type === 2 ? 4 : 6.2) + hRandom * (type === 3 ? 11 : 16);
      const width = h * ratios[type] * (0.87 + 0.47*widthRandom);
      const clearing = noise(x*0.048,s*0.048);
      const shade = 0.72 + 0.36 * noise(x*0.08, s*0.08) + 0.10 * hRandom;
      const keep = d > 9.5 && thinning > (detail === 2 ? 0.43 : detail === 1 ? 0.14 : 0);
      // Consume sprite RNG regardless of detail so retained silhouettes coincide.
      if (keep && (d > 9 || clearing > 0.39) && (clearing > 0.23 || hRandom > 0.72)) {
        plant(x,groundHeight(s,d,side)-0.12,s,h,width,type,shade);
      } else { random(); random(); }
    }
    for (let i = 0; i < 75; i++) {
      const s = start + random()*SECTION, d = 2.3 + random()*13;
      const x = centerX(s) + side*(riverWidth(s)+d), h = 0.7 + 2.9*random();
      const type = random() < 0.74 ? 2 : 3;
      if (detail < 2) plant(x,groundHeight(s,d,side)-0.03,s,h,h*(0.70+random()*0.37),type,0.72);
      else {random();random();random();}
    }
  }
  if(detail>0) {
    for(const {base,height} of nearTrees) plant(base.x,base.y,-base.z,height,height*0.40,0,0.93);
  }
  const g = geometry(pos,idx,{offset:[offsets,2],uv:[uv,2],color:[colors,3]});
  g.computeBoundingSphere();
  g.boundingSphere.radius += 24;
  return new THREE.Mesh(g, material);
}

function makeRockGeometry(seed) {
  const g = new THREE.IcosahedronGeometry(1, 1);
  const p = g.getAttribute('position'), uv = g.getAttribute('uv');
  for (let i=0;i<p.count;i++) {
    const x=p.getX(i), y=p.getY(i), z=p.getZ(i);
    const rough = 0.78 + 0.4 * noise(x*4+seed, z*4+y*1.9);
    p.setXYZ(i, x*rough + y*0.14, Math.sign(y)*Math.pow(Math.abs(y),0.76)*rough, z*rough);
    uv.setXY(i,(x+0.57*y)*0.66+0.5,(z+0.42*y)*0.66+0.5);
  }
  g.computeVertexNormals();
  return g;
}

function makeRocks(start, detail, material, shape) {
  const random = rng(hash(start, 744) * 4294967295);
  const count = detail === 0 ? 90 : 26;
  const mesh = new THREE.InstancedMesh(shape,material,count);
  const transform = new THREE.Object3D(), tint = new THREE.Color();
  for (let i = 0; i<count; i++) {
    const s = start+random()*SECTION, side = random()<0.5 ? 1 : -1;
    const d = random()*6.8-2.1, x = centerX(s)+side*(riverWidth(s)+d);
    const size = i < 6 ? 0.48+random()*1.32 : 0.07+Math.pow(random(),2)*0.48;
    transform.position.set(x,groundHeight(s,d,side)-size*0.14,-s);
    transform.rotation.set(random()*0.35,random()*TAU,random()*0.35);
    transform.scale.set(size*(0.9+random()),size*(0.54+random()*0.47),size*(0.8+random()*0.8));
    transform.updateMatrix();
    mesh.setMatrixAt(i,transform.matrix);
    const tone=(0.70+random()*0.37)*(d<0.45?0.66:1);
    mesh.setColorAt(i,tint.setRGB(tone*0.90,tone*0.94,tone));
  }
  mesh.receiveShadow = true;
  mesh.castShadow = detail===0;
  mesh.computeBoundingSphere();
  return mesh;
}

function makeSedges(start, mat) {
  const pos=[], color=[], idx=[];
  const random = rng(hash(start, 885)*4294967295);
  for (let i=0;i<520;i++) {
    const s0=start+random()*SECTION, side=random()<0.5?-1:1;
    const d=0.20+Math.pow(random(),1.7)*7.9, x0=centerX(s0)+side*(riverWidth(s0)+d);
    if (noise(x0*0.17,s0*0.15)<0.36) continue;
    const h=0.17+random()*0.65, tone=0.63+random()*0.38;
    for (let j=0;j<12;j++) {
      const angle=random()*TAU, dirX=Math.cos(angle),dirZ=Math.sin(angle);
      const spread=random()*h*0.56, w=(0.012+0.015*random())*h;
      const x=x0+dirX*spread, z=-s0+dirZ*spread;
      const offset=side*(x-centerX(-z))-riverWidth(-z);
      const y=groundHeight(-z,offset,side)-0.035, high=h*(0.6+random()*0.60);
      const lean=high*(0.22+0.84*random()), a=pos.length/3;
      pos.push(x+dirZ*w,y,z-dirX*w,x-dirZ*w,y,z+dirX*w,
        x+dirX*lean*0.4-dirZ*w*0.5,y+high*0.72,z+dirZ*lean*0.4+dirX*w*0.5,
        x+dirX*lean,y+high,z+dirZ*lean);
      idx.push(a,a+1,a+2,a,a+2,a+3);
      for(const light of [0.5,0.5,0.90,1.05]) color.push(0.20*tone*light,0.30*tone*light,0.067*tone*light);
    }
  }
  const g=geometry(pos,idx,{color:[color,3]});
  g.computeVertexNormals();
  return new THREE.Mesh(g,mat);
}

function makeMountains() {
  const tex = texture(new THREE.TextureLoader(),'alpine-range.webp',false);
  const g = new THREE.CylinderGeometry(650,650,315,160,1,true);
  const pos=g.attributes.position, uv=g.attributes.uv;
  for(let i=0;i<pos.count;i++) {
    const theta=Math.atan2(pos.getX(i),-pos.getZ(i));
    const u=(theta+Math.PI)/TAU*3+0.04;
    // Mirror successive panoramas so distant ridgelines meet without seams.
    uv.setX(i,1-Math.abs((((u%2)+2)%2)-1));
  }
  const mat = new THREE.MeshBasicMaterial({map:tex,side:THREE.BackSide,alphaTest:0.28,fog:false,color:0xd7e2ee});
  const backdrop=new THREE.Mesh(g,mat);
  backdrop.position.y=103;
  return backdrop;
}

export function createLandscape(scene) {
  const materials = createMaterials();
  const rockShape = makeRockGeometry(29);
  const mountains=makeMountains();
  if (scene.fog) {
    mountains.material.onBeforeCompile = shader => {
      shader.uniforms.distantHaze={value:scene.fog.color};
      shader.fragmentShader='uniform vec3 distantHaze;\n'+shader.fragmentShader;
      shader.fragmentShader=shader.fragmentShader.replace('#include <opaque_fragment>',
        'outgoingLight = mix(outgoingLight,distantHaze,0.30);\n#include <opaque_fragment>');
    };
  }
  const bankPosition=(s,d,side) => new THREE.Vector3(centerX(s)+side*(riverWidth(s)+d),groundHeight(s,d,side),-s);
  scene.add(mountains);
  const sections=new Map();
  const prepared=new Map();
  let previous=NaN, pending=false;
  let granite=[];
  new GLTFLoader().load(assets+'granite.glb',gltf => {
    gltf.scene.traverse(mesh => { if(mesh.isMesh) granite.push(mesh); });
    for(const item of [...sections.values(),...prepared.values()]) addOutcrop(item);
  });

  function addOutcrop(item) {
    if (!granite.length || item.detail>1 || item.outcrop) return;
    const start=item.n*SECTION, random=rng(hash(start,111)*4294967295);
    const source=granite[Math.floor(random()*granite.length)];
    const count=9, mesh=new THREE.InstancedMesh(source.geometry,source.material,count);
    const side=random()<0.50?-1:1, s0=start+SECTION*(0.33+0.34*random());
    const transform=new THREE.Object3D();
    for(let i=0;i<count;i++) {
      const s=s0+(random()-0.5)*21;
      const d=-1.4+random()*4.9;
      const size=(i<3?3.8:1.1)+random()*(i<3?2.6:2.3);
      transform.position.copy(bankPosition(s,d,side));
      transform.position.y+=size*0.057;
      transform.rotation.set((random()-0.5)*0.27,random()*TAU,(random()-0.5)*0.22);
      transform.scale.set(size,size*(0.74+0.52*random()),size);
      transform.updateMatrix();mesh.setMatrixAt(i,transform.matrix);
    }
    mesh.receiveShadow=true;mesh.castShadow=item.detail===0;
    item.group.add(mesh);item.outcrop=mesh;
  }
  function remove(item) {
    scene.remove(item.group);
    item.job?.return();
    for (const mesh of item.group.children) {
      if (mesh.isInstancedMesh) mesh.dispose();
      else mesh.geometry.dispose();
    }
  }
  function* build(item) {
    const {n,detail,group}=item, start=n*SECTION;
    const trees=nearTreeLayout(start,SECTION,bankPosition,rng(hash(start,442)*4294967295));
    group.add(makeBanks(start,detail,materials.bank)); yield;
    group.add(makeForest(start,detail,materials.trees,trees)); yield;
    if (detail<2) group.add(makeRocks(start,detail,materials.rocks,rockShape));
    if (detail===0) {
      group.add(makeSedges(start,materials.grass)); yield;
      const wood=yield* closeBankTrees(trees,start,SECTION,bankPosition,rng(hash(start,442)*4294967295),materials);
      group.add(...wood);
    }
    addOutcrop(item);
  }
  function newSection(n,detail) {
    const group=new THREE.Group();
    group.name='Riverbank '+n+' LOD '+detail;
    const item={n,detail,group};
    item.job=build(item);
    return item;
  }
  function detailAt(distance) {
    return distance<=1 ? 0 : distance<=3 ? 1 : 2;
  }
  // Build the next four replacements off-scene in small idle slices. Ordinary
  // section crossings only attach prepared buffers and retire the old sections.
  function prepareNext(current) {
    if(pending) return;
    const next=current+1;
    for(let n=next-2;n<=next+8;n++) {
      const detail=detailAt(Math.abs(n-next));
      if(sections.get(n)?.detail===detail || prepared.get(n)?.ready) continue;
      const item=prepared.get(n) ?? newSection(n,detail);
      prepared.set(n,item);pending=true;
      const run=() => {
        pending=false;
        if(current!==previous || prepared.get(n)!==item) return;
        item.ready=item.job.next().done;
      };
      if(window.requestIdleCallback) window.requestIdleCallback(run,{timeout:220});
      else setTimeout(run,0);
      return;
    }
  }
  function update(s, x = centerX(s)) {
    mountains.position.x=x;
    mountains.position.z=-s;
    const current=Math.floor(s/SECTION);
    if(current===previous) {
      if(s-current*SECTION>3) prepareNext(current);
      return;
    }
    previous=current;
    for(const [n,item] of sections) {
      if(n<current-2 || n>current+8) { remove(item); sections.delete(n); }
    }
    for(let n=current-2;n<=current+8;n++) {
      const detail=detailAt(Math.abs(n-current)), old=sections.get(n);
      if(old?.detail===detail) continue;
      const staged=prepared.get(n);
      const item=staged?.detail===detail ? staged : newSection(n,detail);
      if(item===staged) prepared.delete(n);
      if(!item.ready) { while(!item.job.next().done) { /* first load or a jump */ } }
      if(old) remove(old);
      scene.add(item.group);sections.set(n,item);
    }
    for(const item of prepared.values()) remove(item);
    prepared.clear();
  }
  update(0);
  return { update };
}
