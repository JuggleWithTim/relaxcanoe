import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const bladeAxis = new THREE.Vector3(0, -1, 0);
const stowedAxis = new THREE.Vector3(-0.035, -0.04, -1).normalize();
const gripAtRest = new THREE.Vector3(0.235, 0.31, -0.55);
const stowedRotation = new THREE.Quaternion().setFromUnitVectors(bladeAxis, stowedAxis);
const laidFlat = new THREE.Quaternion().setFromAxisAngle(bladeAxis, 0.16);
stowedRotation.multiply(laidFlat);

// The upper hand stays below eye level while the tip catches the river at
// phase 0.2. Azimuth lets the blade swing alongside the gunwale on recovery.
const length = 1.429;
const stroke = [
  // phase, tip outboard, tip height, tip fore/aft, upper hand height, azimuth, feather
  [0,    0.84,  0.18, -1.75, 0.82,  38, -0.60],
  [0.20, 0.81,  0.00, -1.65, 0.88,  30, -0.14],
  [0.33, 0.76, -0.28, -1.32, 0.87,  52,  0.01],
  [0.48, 0.73, -0.32, -0.84, 0.87,  79,  0.03],
  [0.60, 0.74, -0.26, -0.39, 0.86, 104,  0.08],
  [0.73, 0.83,  0.01, -0.23, 0.82, 119,  0.64],
  [0.85, 0.97,  0.18, -0.88, 0.79,  93,  1.04],
  [1,    0.84,  0.18, -1.75, 0.82,  38, -0.60],
];

export async function createCanoe(scene) {
  const { scene: group } = await new GLTFLoader().loadAsync(
    `${import.meta.env.BASE_URL}models/cedar-canoe.glb`
  );
  group.name = 'Cedar canoe';
  group.traverse(object => {
    if (object.isMesh) {
      if (object.material.map) object.material.map.anisotropy = 4;
      object.receiveShadow = true;
      object.castShadow = true;
    }
  });
  const paddle = group.getObjectByName('Paddle');
  paddle.position.copy(gripAtRest);
  paddle.quaternion.copy(stowedRotation);
  scene.add(group);

  const target = new THREE.Vector3();
  const direction = new THREE.Vector3();
  const rotation = new THREE.Quaternion();
  const feather = new THREE.Quaternion();
  let lastTime;

  function update(time, leftPhase, rightPhase) {
    const dt = Math.min(0.1, Math.max(0, time - (lastTime ?? time)));
    lastTime = time;
    const phase = Math.max(leftPhase, rightPhase);
    if (phase < 0) {
      target.copy(gripAtRest);
      rotation.copy(stowedRotation);
    } else {
      const side = leftPhase > rightPhase ? -1 : 1;
      const index = stroke.findIndex((pose, i) => i > 0 && pose[0] >= phase);
      const end = index < 0 ? stroke.length - 1 : index;
      const a = stroke[end - 1], b = stroke[end];
      const t = THREE.MathUtils.clamp((phase - a[0]) / (b[0] - a[0]), 0, 1);
      const mix = i => THREE.MathUtils.lerp(a[i], b[i], t);
      const vertical = (mix(2) - mix(4)) / length;
      const horizontal = Math.sqrt(1 - vertical * vertical);
      const angle = THREE.MathUtils.degToRad(mix(5));
      direction.set(Math.sin(angle) * horizontal * side, vertical, -Math.cos(angle) * horizontal);
      target.set(mix(1) * side, mix(2), mix(3)).addScaledVector(direction, -length);
      rotation.setFromUnitVectors(bladeAxis, direction);
      feather.setFromAxisAngle(bladeAxis, mix(6) * side);
      rotation.multiply(feather);
    }
    const blend = -Math.expm1(-dt * (phase < 0 ? 5 : 17));
    paddle.position.lerp(target, blend);
    paddle.quaternion.slerp(rotation, blend);
  }
  return { group, paddle, update };
}
