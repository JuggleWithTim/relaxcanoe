import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createTrackedPaddle } from './vr-paddle.js';

// The profile's 25 bones are siblings, expressed in the same reference space
// as XRHand joints. Upload all their poses with one WebXR call per hand.
function createHandMesh(side, parent) {
  let model, bones, joints, matrices, lastHand, loading = false;
  function update(frame, hand, space) {
    if (model) model.visible = false;
    if (!hand) return false;
    if (!loading) {
      loading = true;
      new GLTFLoader().load(`/models/hands/${side}.glb`, gltf => {
        model = gltf.scene;
        model.visible = false;
        const mesh = model.getObjectByProperty('isSkinnedMesh', true);
        mesh.frustumCulled = false;
        bones = mesh.skeleton.bones;
        matrices = new Float32Array(16 * bones.length);
        for (const bone of bones) bone.matrixAutoUpdate = false;
        parent.add(model);
      }, undefined, error => console.warn('Hand mesh unavailable', error));
    }
    if (!model) return false;
    if (hand !== lastHand) {
      joints = bones.map(bone => hand.get(bone.name));
      lastHand = hand;
    }
    if (!frame.fillPoses(joints, space, matrices)) return false;
    bones.forEach((bone, i) => {
      bone.matrix.fromArray(matrices, 16 * i);
      bone.matrixWorldNeedsUpdate = true;
    });
    model.visible = true;
    return true;
  }
  return update;
}

// All hand poses, the camera and the paddle share a seated, boat-local space.
// Boat translation and yaw live on the parent rig and never enter hand deltas.
export function createVR(renderer, rig, paddle) {
  const xr = renderer.xr;
  xr.enabled = true;
  xr.setReferenceSpaceType('local');
  xr.setFramebufferScaleFactor(0.8);
  const tracked = createTrackedPaddle(paddle);
  const markers = new THREE.Group();
  rig.add(markers);
  const body = new THREE.CapsuleGeometry(0.027, 0.058, 4, 10);
  const thumb = new THREE.SphereGeometry(0.018, 10, 8);
  const glove = new THREE.MeshStandardMaterial({ color: 0x485452, roughness: 0.85 });
  const ready = new THREE.MeshStandardMaterial({ color: 0xd8be86, roughness: 0.8 });
  const hands = ['left', 'right'].map(side => {
    const marker = new THREE.Mesh(body, glove);
    const finger = new THREE.Mesh(thumb, glove);
    finger.position.set(side === 'left' ? 0.022 : -0.022, 0.019, -0.012);
    marker.add(finger);
    markers.add(marker);
    return { side, marker, mesh: createHandMesh(side, markers), position: marker.position, rotation: marker.quaternion, closed: false };
  });
  const orientation = new THREE.Euler(0, 0, 0, 'YXZ');
  const rotation = new THREE.Quaternion();
  const present = [];
  let baseSpace, needsSeat = true;
  function resetHands() {
    tracked.rack();
    for (const hand of hands) {
      hand.marker.visible = hand.closed = false;
      hand.source = null;
    }
  }
  function recenter() {
    needsSeat = true;
    resetHands();
  }
  const finger = new THREE.Vector3();
  function readHand(hand, source, frame, space) {
    if (source?.hand) {
      const joint = name => frame.getJointPose(source.hand.get(name), space)?.transform;
      const index = joint('index-finger-tip');
      const thumb = joint('thumb-tip');
      const palm = joint('middle-finger-metacarpal');
      if (!index || !thumb || !palm) return false;
      hand.position.copy(index.position);
      const gap = hand.position.distanceTo(thumb.position);
      const knuckle = joint('middle-finger-phalanx-proximal');
      const middleTip = joint('middle-finger-tip');
      const curled = knuckle && middleTip &&
        finger.copy(middleTip.position).distanceTo(knuckle.position) < (hand.closed ? 0.055 : 0.040);
      hand.closed = gap < (hand.closed ? 0.042 : 0.025) || Boolean(curled);
      if (curled) hand.position.copy(middleTip.position).lerp(knuckle.position, 0.5);
      else hand.position.lerp(thumb.position, 0.5);
      hand.rotation.copy(palm.orientation);
      return true;
    }
    if (!source?.gripSpace) return false;
    const pose = frame.getPose(source.gripSpace, space);
    if (!pose || pose.emulatedPosition) return false;
    hand.position.copy(pose.transform.position);
    hand.rotation.copy(pose.transform.orientation);
    hand.closed = Boolean(source.gamepad?.buttons[1]?.pressed);
    return true;
  }

  function sample(frame, dt) {
    const space = needsSeat ? baseSpace : xr.getReferenceSpace();
    const viewer = frame.getViewerPose(space);
    if (!viewer || viewer.emulatedPosition) {
      resetHands();
      return;
    }
    if (needsSeat) {
      const { position, orientation: facing } = viewer.transform;
      orientation.setFromQuaternion(rotation.copy(facing));
      rotation.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, orientation.y);
      const origin = new XRRigidTransform(
        { x: position.x, y: position.y - 1.08, z: position.z }, rotation,
      );
      xr.setReferenceSpace(baseSpace.getOffsetReferenceSpace(origin));
      needsSeat = false;
      return;
    }
    present.length = 0;
    const sources = Array.from(frame.session.inputSources);
    for (const hand of hands) {
      hand.source = sources.find(s => s.handedness === hand.side);
      const visible = readHand(hand, hand.source, frame, space);
      const skinned = hand.mesh(frame, visible && hand.source.hand, space);
      hand.marker.visible = visible && !skinned;
      if (visible) {
        present.push(hand);
        hand.marker.material = tracked.project(hand) !== null ? ready : glove;
      } else {
        hand.closed = false;
      }
    }
    const blade = tracked.update(present, dt);
    if (blade?.entry) {
      for (const hand of present) {
        if (tracked.holds(hand)) {
          const motor = hand.source.gamepad?.hapticActuators?.[0];
          motor?.pulse?.(Math.min(0.35, 0.08 + blade.velocity.length() * 0.09), 32)?.catch(() => {});
        }
      }
    }
    return blade;
  }
  xr.addEventListener('sessionstart', () => {
    baseSpace = xr.getReferenceSpace();
    baseSpace.addEventListener('reset', recenter);
    recenter();
    markers.visible = true;
  });
  xr.addEventListener('sessionend', () => {
    baseSpace?.removeEventListener('reset', recenter);
    baseSpace = null;
    markers.visible = false;
    resetHands();
  });
  markers.visible = false;
  return { sample, resetHands };
}
