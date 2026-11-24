import { environments } from "./environments.js";
import { createPaddling } from "./paddling.js";
import { createVRMotion } from "./vr-motion.js";
import { createSound } from "./sound.js";
import { drawChart } from "./chart.js";

const env = environments[0];
const el = (id) => document.getElementById(id);
const root = el("experience"),
  enter = el("enter"),
  enterVR = el("enter-vr"),
  pauseButton = el("pause-btn"),
  soundButton = el("sound-toggle");
root.dataset.river = env.id;
document.title = `Stillwater — ${env.name}`;
el("world").setAttribute("aria-label", `First-person canoeing on ${env.name}`);
const sound = createSound({ onStateChange: syncSound });
let world,
  mode = "arrival",
  loading = false,
  muted = false;
try {
  muted = localStorage.getItem("stillwater-muted") === "true";
} catch {}
function setMode(next) {
  mode = root.dataset.mode = next;
  const playing = next === "playing";
  pauseButton.hidden = !playing;
  el("touch-controls").hidden = !playing;
  document.querySelector(".arrival").inert = playing;
  if (next === "paused") {
    enter.querySelector("span").textContent = "Resume canoeing";
    el("map-label").textContent = "Canoe position";
    drawChart(
      el("chart"),
      env.centerX,
      env.riverWidth,
      controls.motion.s,
      controls.motion.x,
    );
    enter.focus({ preventScroll: true });
  }
}
function syncSound() {
  sound.setMuted(muted);
  soundButton
    .querySelector("use")
    .setAttribute("href", muted ? "#mute" : "#sound");
  const blocked = !muted && sound.isBlocked;
  soundButton.querySelector("span").textContent = blocked
    ? "Enable sound"
    : muted
      ? "Sound off"
      : "Sound on";
  soundButton.setAttribute(
    "aria-label",
    muted || blocked ? "Enable sound" : "Mute sound",
  );
  soundButton.setAttribute("aria-pressed", String(!muted && !blocked));
}
const vrMotion = createVRMotion(env);
let session = null;
async function begin(immersive = false) {
  if (loading || document.hidden || mode === "playing") return;
  loading = enter.disabled = enterVR.disabled = true;
  el("status").textContent = "";
  let requested;
  try {
    sound.start();
    if (immersive) {
      // Request from the click itself, while transient user activation is live.
      requested = session = await navigator.xr.requestSession("immersive-vr", {
        optionalFeatures: ["hand-tracking"],
      });
      session.addEventListener("end", leaveVR, { once: true });
      session.addEventListener("visibilitychange", onVRVisibility);
      vrMotion.reset();
      controls.clear();
    }
    sound.setPaused(false);
    if (!world) {
      enter.querySelector("span").textContent = "Opening river…";
      const { createWorld } = await import("./world.js");
      world = await createWorld(el("world"), env, immersive);
      cancelAnimationFrame(menuFrame);
      world.setAnimationLoop(frame);
    }
    if (immersive) {
      if (requested !== session) return;
      await world.startVR(session);
      if (requested !== session) return;
      onVRVisibility();
    } else if (document.hidden) {
      pause();
      return;
    }
    last = performance.now();
    setMode("playing");
    if (!immersive) pauseButton.focus({ preventScroll: true });
  } catch (error) {
    console.error("Canoe launch failed", error);
    if (session) await session.end().catch(() => {});
    if (!world) el("world").replaceChildren();
    sound.setPaused(true);
    el("status").textContent = immersive
      ? "VR could not start. Check headset permissions and try Enter VR again."
      : /webgl|context/i.test(String(error))
        ? "The river needs WebGL 2. Enable graphics acceleration and try again."
        : "Some river assets could not load. Check your connection and try again.";
  } finally {
    loading = enter.disabled = enterVR.disabled = false;
    if (mode !== "playing") enter.querySelector("span").textContent = world ? "Resume canoeing" : "Begin canoeing";
  }
}
function leaveVR(event) {
  if (event.target !== session) return;
  session.removeEventListener("visibilitychange", onVRVisibility);
  session = null;
  controls.resumeFromVR();
  if (world) pause();
  else sound.setPaused(true);
}
function onVRVisibility() {
  world?.resetHands();
  last = performance.now();
  sound.setPaused(session.visibilityState !== "visible");
}
function pause() {
  if (!world) return;
  controls.clear();
  sound.setPaused(true);
  setMode("paused");
}
const controls = createPaddling({
  ...env,
  onActivate: () => begin(),
  onStroke(side, strength) {
    sound.stroke(side, strength);
    world?.stroke(side, strength, controls.motion);
  },
});
enter.addEventListener("click", () => begin());
enterVR.addEventListener("click", () => begin(true));
async function detectVR() {
  try {
    const supported = await navigator.xr?.isSessionSupported("immersive-vr");
    enterVR.hidden = el("vr-guide").hidden = !supported;
  } catch {
    enterVR.hidden = el("vr-guide").hidden = true;
  }
}
detectVR();
navigator.xr?.addEventListener("devicechange", detectVR);
pauseButton.addEventListener("click", () => session ? session.end() : pause());
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && mode === "playing") {
    e.preventDefault();
    if (session) session.end();
    else pause();
  }
});
document.addEventListener("visibilitychange", () => {
  if (!session && document.hidden && mode === "playing") pause();
});
let unlocking = false;
for (const event of ["pointerdown", "keydown"])
  soundButton.addEventListener(event, () => {
    unlocking = !muted && sound.isBlocked;
  });
soundButton.addEventListener("click", () => {
  muted = unlocking ? false : !muted;
  unlocking = false;
  syncSound();
  if (!muted) {
    sound.start();
    sound.setPaused(mode === "paused");
  }
  try {
    localStorage.setItem("stillwater-muted", String(muted));
  } catch {}
});
syncSound();
const full = el("fullscreen");
if (!document.fullscreenEnabled) full.hidden = true;
full.addEventListener("click", async () => {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await root.requestFullscreen();
  } catch {
    full.title = "Fullscreen is unavailable in this browser window";
  }
});
document.addEventListener("fullscreenchange", () => {
  full.setAttribute(
    "aria-label",
    document.fullscreenElement ? "Exit fullscreen" : "Enter fullscreen",
  );
  full
    .querySelector("use")
    .setAttribute("href", document.fullscreenElement ? "#collapse" : "#expand");
});
for (const button of el("touch-controls").querySelectorAll("button")) {
  const side = button.dataset.side;
  button.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    button.setPointerCapture(e.pointerId);
    controls.touch(side, true);
  });
  button.addEventListener("lostpointercapture", () =>
    controls.touch(side, false),
  );
}
drawChart(el("chart"), env.centerX, env.riverWidth);
let last = performance.now();
function frame(now, xrFrame) {
  const interval = Math.max(0, (now - last) / 1000);
  last = now;
  const dt = Math.min(0.09, interval);
  if (xrFrame) {
    if (mode !== "playing" || session?.visibilityState !== "visible") return;
    const blade = world.samplePaddle(xrFrame, interval);
    if (blade === undefined) return; // Await a calibrated, tracked viewer pose.
    const motion = controls.motion;
    if (blade?.entry) {
      const side = blade.position.x < 0 ? "left" : "right";
      const strength = Math.min(1, 0.25 + blade.velocity.length() * 0.3);
      sound.stroke(side, strength);
      world.stroke(side, strength, motion, blade.position);
    }
    vrMotion.update(motion, dt, blade);
    world.render(dt, motion);
    sound.update(dt, motion);
  } else if (!session) {
    const play = mode === "playing" && !document.hidden;
    const motion = controls.update(dt, play);
    if (play) world.render(dt, motion, interval);
    sound.update(dt, motion);
  }
}
// Poll gamepads on the arrival screen before the lazy-loaded renderer exists.
let menuFrame;
function pollMenu(now) {
  frame(now);
  menuFrame = requestAnimationFrame(pollMenu);
}
menuFrame = requestAnimationFrame(pollMenu);
