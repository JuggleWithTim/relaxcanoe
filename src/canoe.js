import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const bladeAxis = new THREE.Vector3(0, -1, 0);
const stowedAxis = new THREE.Vector3(-0.035, -0.04, -1).normalize();
const gripAtRest = new THREE.Vector3(0.235, 0.31, -0.55);
const stowedRotation = new THREE.Quaternion().setFromUnitVectors(bladeAxis, stowedAxis);
const laidFlat = new THREE.Quaternion().setFromAxisAngle(bladeAxis, 0.16);
stowedRotation.multiply(laidFlat);

// Each pose gives the blade tip relative to the seat, then a direction from
// grip to blade. The calibrated sweep crosses the water at phase 0.2.
const stroke = [
  // phase, tip outboard, tip height, tip fore/aft, axis x/y/z, feather
  [0,    0.71,  0.24, -1.29,  0.33, -0.68, -0.65, -0.60],
  [0.20, 0.72,  0.00, -1.28,  0.41, -0.75, -0.51, -0.14],
  [0.33, 0.70, -0.30, -1.07,  0.43, -0.84, -0.34,  0.01],
  [0.60, 0.68, -0.32, -0.36,  0.45, -0.89,  0.06,  0.08],
  [0.73, 0.78,  0.00, -0.12,  0.57, -0.76,  0.32,  0.58],
  [0.85, 0.86,  0.30, -0.54,  0.55, -0.80,  0.00,  1.04],
  [1,    0.71,  0.24, -1.29,  0.33, -0.68, -0.65, -0.60],
];

export async function createCanoe(scene) {
  const { scene: group } = await new GLTFLoader().loadAsync(
    `${import.meta.env.BASE_URL}models/cedar-canoe.glb`
  );
  group.name = 'Cedar canoe';
  group.traverse(object => {
    if (object.isMesh) {
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
      direction.set(mix(4) * side, mix(5), mix(6)).normalize();
      target.set(mix(1) * side, mix(2), mix(3)).addScaledVector(direction, -1.574);
      rotation.setFromUnitVectors(bladeAxis, direction);
      feather.setFromAxisAngle(bladeAxis, mix(7) * side);
      rotation.multiply(feather);
    }
    const blend = -Math.expm1(-dt * (phase < 0 ? 5 : 17));
    paddle.position.lerp(target, blend);
    paddle.quaternion.slerp(rotation, blend);
  }
  return { group, update };
}
