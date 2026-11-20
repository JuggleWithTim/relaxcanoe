// The near-bank crowns use layered, pitched sprays attached to tapered boughs.
// Trunks, branches and logs are merged per river section to keep draws bounded.
import * as THREE from 'three';

const TAU = 2*Math.PI;
const v3 = (x,y,z) => new THREE.Vector3(x,y,z);

class Batch {
  position=[]; uv=[]; color=[]; index=[];
  vertex(p,u,v,tint=1) {
    this.position.push(p.x,p.y,p.z);
    this.uv.push(u,v);
    this.color.push(tint,tint,tint);
    return this.position.length/3-1;
  }
  mesh(material) {
    const g=new THREE.BufferGeometry();
    for(const [name,data,size] of [['position',this.position,3],['uv',this.uv,2],['color',this.color,3]]) {
      g.setAttribute(name,new THREE.Float32BufferAttribute(data,size));
    }
    g.setIndex(this.index);
    g.computeVertexNormals();
    const mesh=new THREE.Mesh(g,material);
    mesh.receiveShadow=true;
    mesh.castShadow=true;
    return mesh;
  }
}

// A tube follows the actual axis of each limb, so the bark grain runs lengthwise.
function limb(batch,a,b,r0,r1,tint,sides=6) {
  const axis=b.clone().sub(a), length=axis.length();
  axis.normalize();
  const u=v3(0,0,0).crossVectors(axis,Math.abs(axis.y)>0.95?v3(0,0,1):v3(0,1,0)).normalize();
  const v=v3(0,0,0).crossVectors(axis,u);
  const first=batch.position.length/3;
  for(let i=0;i<=sides;i++) {
    const angle=TAU*i/sides, normal=u.clone().multiplyScalar(Math.cos(angle)).addScaledVector(v,Math.sin(angle));
    batch.vertex(a.clone().addScaledVector(normal,r0), i/sides, 0, tint);
    batch.vertex(b.clone().addScaledVector(normal,r1), i/sides, length/1.3, tint);
    if(i<sides) {
      const k=first+2*i;
      batch.index.push(k,k+2,k+1,k+2,k+3,k+1);
    }
  }
  const end=batch.vertex(b,0.5,0.5,tint*1.2);
  for(let i=0;i<sides;i++) batch.index.push(end,first+i*2+1,first+i*2+3);
}

function crownSpray(batch,base,angle,length,width,pitch,curl,tint) {
  const dx=Math.cos(angle), dz=Math.sin(angle);
  const first=batch.position.length/3;
  const slices=3;
  for(let i=0;i<=slices;i++) {
    const t=i/slices;
    const down=Math.sin(t*Math.PI)*0.23;
    for(let j=0;j<3;j++) {
      const across=(j-1)*width/2;
      const sag=(j===1?0:0.43)*width*(0.3+0.7*Math.sin(t*Math.PI));
      batch.vertex(v3(base.x+t*length*dx+dz*across,base.y+(pitch*t-down+curl*t*t)*length-sag,
        base.z+t*length*dz-dx*across),j/2,t,tint*(0.80+t*0.20));
      if(i<slices && j<2) {
        const k=first+3*i+j;
        batch.index.push(k,k+1,k+3,k+1,k+4,k+3);
      }
    }
  }
}

function spruce(wood,needles,base,height,random) {
  const leanX=(random()-0.5)*height*0.085, leanZ=(random()-0.5)*height*0.07;
  const stem=t=>v3(base.x+leanX*t*t,base.y+height*t,base.z+leanZ*t*t);
  const r=height*(0.012+0.004*random());
  const tint=0.67+random()*0.25;
  for(let i=0;i<3;i++) {
    const lo=i/3,hi=(i+1)/3;
    limb(wood,stem(lo),stem(hi),r*(1-0.97*lo),r*(1-0.97*hi),tint,8);
  }
  for(let i=0;i<6;i++) {
    const angle=random()*TAU, x=Math.cos(angle),z=Math.sin(angle), length=r*(3.4+random()*3);
    const knee=base.clone().add(v3(x*length*0.33,0.06,z*length*0.33));
    limb(wood,base.clone().add(v3(0,0.39,0)),knee,r*0.64,r*0.48,tint);
    limb(wood,knee,base.clone().add(v3(x*length,-0.12,z*length)),r*0.48,0.018,tint);
  }
  const bare=0.12+0.18*random(), girth=(0.16+0.07*random())*height;
  const levels=12+Math.floor(random()*5);
  let turn=random()*TAU;
  for(let i=0;i<levels;i++) {
    const f=i/levels, y=bare+(1-bare)*f;
    const spread=girth*Math.pow(1-f,0.74);
    const limbs=7+Math.floor(random()*3);
    turn+=2.4+random()*0.31;
    for(let j=0;j<limbs;j++) {
      const angle=turn+TAU*(j+0.40*(random()-0.5))/limbs;
      const base=stem(y+(random()-0.5)*0.028);
      const length=spread*(0.83+0.35*random());
      const pitch=-0.36+f*0.70+(random()-0.5)*0.35;
      const width=length*(0.62+random()*0.36);
      const curl=0.10+0.16*random();
      crownSpray(needles,base,angle,length,width,pitch,curl,0.75+0.4*random());
    }
  }
  for(let i=0;i<8;i++) {
    const f=0.10+bare*random(), base=stem(f),angle=random()*TAU;
    const length=height*(0.025+random()*0.05);
    const split=base.clone().add(v3(Math.cos(angle)*length,-0.1,Math.sin(angle)*length));
    limb(wood,base,split,r*0.16,r*0.06,tint,4);
    limb(wood,split,split.clone().add(v3(Math.cos(angle+0.3)*length*0.48,0.17,Math.sin(angle+0.3)*length*0.48)),r*0.06,0.005,tint,4);
  }
}

function fallenTimber(wood,at,side,s,random) {
  const d=0.75+random()*2.4, length=4.1+random()*6.9, dir=random()<0.5?-1:1;
  const a=at(s,d,side), b=at(s+length*dir,d-1.5-random()*1.9,side);
  const r=0.16+random()*0.13;
  a.y+=r*0.68; b.y=Math.max(-0.28,b.y)+r*0.6;
  const delta=b.clone().sub(a);
  const mid=a.clone().addScaledVector(delta,0.48);
  mid.y+=0.07;
  limb(wood,a,mid,r,r*0.81,1.13,10);
  limb(wood,mid,b,r*0.81,r*0.61,1.13,10);
  for(let i=0;i<9;i++) {
    const along=0.11+0.84*random(), len=0.33+random()*0.80;
    const origin=a.clone().addScaledVector(delta,along), theta=random()*TAU;
    const tip=origin.clone().add(v3(Math.sin(theta)*len,0.16+0.48*random(),Math.cos(theta)*len+dir*0.24));
    limb(wood,origin,tip,r*0.25,0.012+random()*0.025,1.04,5);
  }
  for(let i=0;i<9;i++) {
    const theta=random()*TAU, spread=0.43+0.39*random();
    const bend=a.clone().add(v3(Math.cos(theta)*spread,0.05+spread*0.55,Math.sin(theta)*spread));
    const tip=bend.clone().add(v3(Math.cos(theta+0.2)*0.21,-0.42,Math.sin(theta+0.2)*0.21));
    limb(wood,a,bend,r*0.56,r*0.22,0.79,5);limb(wood,bend,tip,r*0.22,0.008,0.8,4);
  }
}

export function nearTreeLayout(start,length,at,random) {
  const trees=[];
  for(const side of [-1,1]) {
    for(let i=0;i<7;i++) {
      const s=start+(i+0.15+0.7*random())*length/7;
      const d=2.7+Math.pow(random(),1.3)*9.0;
      const base=at(s,d,side);
      base.y-=0.08;
      trees.push({base,height:6.4+random()*9.4});
    }
  }
  return trees;
}

export function* closeBankTrees(trees,start,length,at,random,materials) {
  const wood=new Batch(),needles=new Batch();
  for(const tree of trees) {
    spruce(wood,needles,tree.base,tree.height,random);
    yield;
  }
  for(const side of [-1,1]) fallenTimber(wood,at,side,start+random()*length,random);
  return [wood.mesh(materials.bark),needles.mesh(materials.needles)];
}
