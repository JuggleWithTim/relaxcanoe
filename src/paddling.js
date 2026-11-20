const sides = ['left', 'right'];
const keySides = { ArrowLeft: 'left', ArrowRight: 'right' };
const clamp = (v, low, high) => Math.max(low, Math.min(v, high));
const damp = (rate, dt) => -Math.expm1(-rate * dt);

function triggerValue(button) {
  if (!button) return 0;
  const value = typeof button === 'number' ? button : (button.value ?? Number(button.pressed));
  return value > 0.075 ? clamp(value, 0, 1) : 0;
}

export function createPaddling({ centerX, riverWidth, onStroke = () => {}, onActivate = () => {} }) {
  // Relative to the local current so a resting canoe naturally follows bends.
  let across = 0, heading = 0, turnRate = 0, boost = 0;
  const tangent = s => Math.atan2(centerX(s + 2) - centerX(s - 2), 4);
  const motion = {
    x: centerX(0), s: 0, yaw: -tangent(0), speed: 0.78, roll: 0,
    leftPhase: -1, rightPhase: -1, gamepad: false, across: 0
  };
  const keys = {left: 0, right: 0}, touches = {left: 0, right: 0};
  const triggers = {left: 0, right: 0}, queued = {left: 0, right: 0};
  let active = null, previous = 'right', phase = 0, strength = 0;

  function press(side, value) {
    queued[side] = value;
    onActivate();
  }

  function keydown(event) {
    const side = keySides[event.key];
    if (!side || event.altKey || event.ctrlKey || event.metaKey ||
        event.target?.closest?.('input, textarea, select, [contenteditable="true"]')) return;
    event.preventDefault();
    if (!keys[side] && !event.repeat) {
      keys[side] = 1;
      press(side, 1);
    }
  }

  function keyup(event) {
    const side = keySides[event.key];
    if (side) keys[side] = 0;
  }

  function touch(side, pressed) {
    if (!sides.includes(side)) return;
    if (pressed && !touches[side]) press(side, 1);
    touches[side] = pressed ? 1 : 0;
  }

  function clear() {
    for (const side of sides) {
      keys[side] = touches[side] = queued[side] = 0;
    }
    active = null;
    motion.leftPhase = motion.rightPhase = -1;
  }

  // Read the standard Xbox layout each animation frame. Gamepads can appear
  // only after their first physical input and can disconnect between frames.
  function pollGamepads() {
    let left = 0, right = 0;
    motion.gamepad = false;
    try {
      for (const pad of navigator.getGamepads?.() ?? []) {
        if (!pad || pad.connected === false || pad.mapping !== 'standard') continue;
        motion.gamepad = true;
        left = Math.max(left, triggerValue(pad.buttons[6]));
        right = Math.max(right, triggerValue(pad.buttons[7]));
      }
    } catch {
      // Embedded browsers can disable the Gamepad API through permissions policy.
    }
    for (const side of sides) {
      const value = side === 'left' ? left : right;
      if (value && !triggers[side]) press(side, value);
      triggers[side] = value;
    }
  }

  function pressure(side) {
    return Math.max(keys[side], touches[side], triggers[side], queued[side]);
  }

  function update(dt, running = true) {
    pollGamepads();
    if (!running || document.hidden) return motion;
    dt = clamp(dt, 0, 0.1);

    // One blade alternates when both inputs are held. A short tap is queued
    // until the current stroke finishes its recovery.
    if (!active) {
      const next = previous === 'left' ? 'right' : 'left';
      active = pressure(next) ? next : (pressure(previous) ? previous : null);
      if (active) {
        strength = pressure(active);
        queued[active] = 0;
        phase = 0;
        previous = active;
      }
    }
    let torque = 0, push = 0;
    if (active) {
      const old = phase;
      phase += dt / (1.34 - 0.18 * strength);
      if (old < 0.2 && phase >= 0.2) onStroke(active, strength);
      // Thrust gradually builds after blade entry and ends before recovery.
      if (phase > 0.2 && phase < 0.65) {
        const pull = Math.sin(Math.PI * (phase - 0.2) / 0.45) * strength;
        push = pull * 2;
        torque = (active === 'left' ? 1 : -1) * pull * 0.62;
      }
      if (phase >= 1) active = null;
    }
    motion.leftPhase = active === 'left' ? phase : -1;
    motion.rightPhase = active === 'right' ? phase : -1;
    boost = clamp(boost * Math.exp(-0.7 * dt) + push * dt, 0, 2.4);
    const limit = Math.max(1, riverWidth(motion.s) - 1.8);
    const bank = clamp(across / limit, -1, 1);
    turnRate += (torque - 1.25 * turnRate - 0.32 * heading - 0.38 * bank ** 5) * dt;
    heading = clamp(heading + turnRate * dt, -0.88, 0.88);

    const flow = 0.78 + 0.1 * Math.sin(motion.s * 0.027);
    motion.speed = flow + boost;
    motion.s += (flow + boost * Math.cos(heading)) * dt / Math.hypot(1, Math.tan(tangent(motion.s)));
    const newLimit = Math.max(1, riverWidth(motion.s) - 1.8);
    across = clamp(across + (Math.sin(heading) * (boost + 0.32) - 0.55 * bank ** 5) * dt, -newLimit, newLimit);
    motion.x = centerX(motion.s) + across;
    motion.across = across / newLimit;
    motion.yaw += (-tangent(motion.s) - heading - motion.yaw) * damp(3.5, dt);
    motion.roll += (torque * 0.055 - turnRate * 0.06 - motion.roll) * damp(3.8, dt);
    return motion;
  }

  window.addEventListener('keydown', keydown);
  window.addEventListener('keyup', keyup);
  window.addEventListener('blur', clear);
  return {
    update, touch, clear, motion,
    dispose() {
      window.removeEventListener('keydown', keydown);
      window.removeEventListener('keyup', keyup);
      window.removeEventListener('blur', clear);
    }
  };
}
