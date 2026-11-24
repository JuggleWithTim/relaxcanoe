import * as THREE from "three";
import { createCanoe } from "./canoe.js";
import { createAtmosphere } from "./atmosphere.js";
import { createRiverWater } from "./water.js";
import { createVR } from "./vr.js";

export async function createWorld(container, env, startInVR = false) {
  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: false,
    powerPreference: "high-performance",
  });
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.04;
  const maxRatio = Math.min(window.devicePixelRatio || 1, 1.55);
  let ratio = maxRatio;
  renderer.setPixelRatio(ratio);
  const scene = new THREE.Scene();
  const sky = await new THREE.TextureLoader().loadAsync(
    "/assets/dawn-sky.webp",
  );
  sky.mapping = THREE.EquirectangularReflectionMapping;
  sky.colorSpace = THREE.SRGBColorSpace;
  scene.background = sky;
  scene.environment = sky;
  scene.backgroundRotation.y = scene.environmentRotation.y = -2.11;
  scene.environmentIntensity = 0.55;
  scene.backgroundIntensity = 1.15;
  scene.fog = new THREE.FogExp2(0xc4c5b2, 0.0026);
  const camera = new THREE.PerspectiveCamera(64, 1, 0.065, 1400);
  camera.rotation.order = "YXZ";
  const sunDirection = new THREE.Vector3(0.64, 0.282, -0.89).normalize();
  const atmosphere = createAtmosphere(scene, sky, sunDirection, env);
  const sunlight = new THREE.DirectionalLight(0xffdeab, 2.25);
  sunlight.position.copy(sunDirection);
  sunlight.castShadow = true;
  sunlight.shadow.mapSize.set(1024, 1024);
  Object.assign(sunlight.shadow.camera, {
    left: -18,
    right: 18,
    top: 18,
    bottom: -18,
    near: 1,
    far: 94,
  });
  sunlight.shadow.camera.updateProjectionMatrix();
  sunlight.shadow.normalBias = 0.015;
  sunlight.shadow.bias = -0.00012;
  scene.add(sunlight, sunlight.target);
  scene.add(new THREE.HemisphereLight(0xe4e8ec, 0x6d7557, 1.22));
  const { createLandscape } = await env.loadLandscape();
  const banks = createLandscape(scene, startInVR);
  const river = createRiverWater(scene, env, sunDirection, sky);
  const canoe = await createCanoe(scene);
  const rig = new THREE.Group();
  scene.add(rig);
  // XR owns this camera's local pose. Keep the desktop camera independent.
  const headset = camera.clone();
  rig.add(headset);
  const vr = createVR(renderer, rig, canoe.paddle);
  const resize = () => {
    if (renderer.xr.isPresenting) return;
    const w = container.clientWidth,
      h = container.clientHeight;
    renderer.setSize(w, h, false);
    camera.aspect = w / Math.max(1, h);
    camera.updateProjectionMatrix();
  };
  renderer.xr.addEventListener("sessionend", resize);
  new ResizeObserver(resize).observe(container);
  resize();
  container.append(renderer.domElement);
  let seconds = 0,
    slowTime = 0,
    fastTime = 0,
    lookX = 0,
    lookY = 0,
    desiredX = 0,
    desiredY = 0,
    pointer = null,
    lastX,
    lastY;
  renderer.domElement.style.touchAction = "none";
  renderer.domElement.addEventListener("pointerdown", (e) => {
    pointer = e.pointerId;
    lastX = e.clientX;
    lastY = e.clientY;
    renderer.domElement.setPointerCapture(pointer);
  });
  renderer.domElement.addEventListener("pointermove", (e) => {
    if (e.pointerId !== pointer) return;
    desiredX = THREE.MathUtils.clamp(
      desiredX - (e.clientX - lastX) * 0.003,
      -1.3,
      1.3,
    );
    desiredY = THREE.MathUtils.clamp(
      desiredY - (e.clientY - lastY) * 0.003,
      -0.55,
      0.48,
    );
    lastX = e.clientX;
    lastY = e.clientY;
  });
  renderer.domElement.addEventListener("lostpointercapture", () => {
    pointer = null;
    desiredX = 0;
    desiredY = 0;
  });
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  function render(dt, m, frameInterval = 0) {
    seconds += dt;
    const immersive = renderer.xr.isPresenting;
    renderer.shadowMap.enabled = !immersive;
    const bob = reduced || immersive
      ? 0
      : 0.009 * Math.sin(seconds * 1.08) + 0.004 * Math.sin(seconds * 1.9);
    const rocking = reduced || immersive
      ? 0
      : 0.005 * Math.sin(seconds * 0.85) + m.roll * 0.52;
    // Keep the small shadow frustum near the paddler. Snap to shadow texels
    // to keep fine rail and branch shadows steady while the boat drifts.
    const texel = 36 / 1024;
    sunlight.target.position.set(
      Math.round(m.x / texel) * texel,
      0,
      Math.round((-m.s - 3) / texel) * texel,
    );
    sunlight.position
      .copy(sunlight.target.position)
      .addScaledVector(sunDirection, 52);
    banks.update(m.s, m.x, immersive);
    atmosphere(m.s, m.x, seconds);
    canoe.group.position.set(m.x, bob, -m.s);
    canoe.group.rotation.order = "YXZ";
    canoe.group.rotation.set(0, m.yaw, rocking);
    if (!immersive) canoe.update(seconds, m.leftPhase, m.rightPhase);
    river.update(seconds, m, bob, immersive);
    if (immersive) {
      rig.position.copy(canoe.group.position);
      rig.rotation.y = m.yaw;
      renderer.render(scene, headset);
      return;
    }
    const ease = 1 - Math.exp(-5 * dt);
    lookX += (desiredX - lookX) * ease;
    lookY += (desiredY - lookY) * ease;
    camera.position.set(m.x, 1.08 + bob, -m.s);
    camera.rotation.set(-0.105 + lookY, m.yaw + lookX, rocking * 0.46);
    renderer.render(scene, camera);
    // Resist transient shader compilation stalls. Only scale after sustained slow frames.
    if (frameInterval > 0) {
      slowTime =
        frameInterval > 0.032
          ? slowTime + Math.min(0.15, frameInterval)
          : Math.max(0, slowTime - dt);
      fastTime = frameInterval < 0.021 ? fastTime + dt : 0;
      const next =
        slowTime > 2.8
          ? Math.max(0.62, ratio * 0.83)
          : fastTime > 18
            ? Math.min(maxRatio, ratio + 0.08)
            : ratio;
      if (next !== ratio) {
        ratio = next;
        renderer.setPixelRatio(ratio);
        resize();
        slowTime = fastTime = 0;
      }
    }
  }
  return {
    render,
    startVR: session => renderer.xr.setSession(session),
    samplePaddle: vr.sample,
    resetHands: vr.resetHands,
    setAnimationLoop: callback => renderer.setAnimationLoop(callback),
    stroke: (side, strength, m, contact) => river.stroke(side, strength, seconds, m, contact),
  };
}
