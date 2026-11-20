import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createPaddling } from '../src/paddling.js';

function setup(overrides = {}) {
  globalThis.window = new EventTarget();
  globalThis.document = { hidden: false };
  const pads = [];
  Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: () => pads });
  let activations = 0;
  const strokes = [];
  const controls = createPaddling({
    centerX: () => 0, riverWidth: () => 9,
    onActivate: () => activations++, onStroke: (side, force) => strokes.push([side, force]),
    ...overrides
  });
  return {
    controls, pads, strokes, activations: () => activations,
    run(seconds, running = true) {
      for (let n = 0; n < seconds * 60; n++) controls.update(1 / 60, running);
      return { ...controls.motion };
    },
    key(type, key) {
      const event = Object.assign(new Event(type, { cancelable: true }), { key });
      window.dispatchEvent(event);
    }
  };
}

test('resting canoe drifts along a bend and pauses in place', () => {
  const { run } = setup({centerX: s => 5 * Math.sin(s * 0.05)});
  const motion = run(10);
  assert.ok(motion.s > 6 && motion.s < 9);
  assert.equal(motion.x, 5 * Math.sin(motion.s * 0.05));
  assert.deepEqual(run(2, false), motion);
});

test('single keyboard taps complete mirrored strokes and produce opposing yaw', () => {
  for (const [key, side, direction] of [['ArrowLeft','left',-1], ['ArrowRight','right',1]]) {
    const { key: send, run, strokes, activations } = setup();
    send('keydown', key);
    send('keyup', key);
    const motion = run(1);
    assert.equal(activations(), 1);
    assert.deepEqual(strokes, [[side, 1]]);
    assert.ok(motion.yaw * direction > 0.035);
    run(2);
    assert.equal(strokes.length, 1);
  }
});

test('controller input activates from the menu, scales thrust, and releases on disconnect', () => {
  function drive(force, side) {
    const pilot = setup();
    const buttons = Array.from({ length: 17 }, () => ({value: 0}));
    buttons[side === 'left' ? 6 : 7].value = force;
    pilot.pads.push({ mapping: 'standard', connected: true, buttons });
    const waiting = pilot.run(1, false);
    assert.equal(waiting.s, 0);
    assert.equal(pilot.activations(), 1);
    assert.equal(waiting.gamepad, true);
    const result = pilot.run(3.2);
    assert.ok(pilot.strokes.length >= 2);
    assert.ok(pilot.strokes.every(([recordedSide, value]) => recordedSide === side && value === force));
    pilot.pads.length = 0;
    pilot.run(2);
    const count = pilot.strokes.length;
    assert.equal(pilot.run(2).gamepad, false);
    assert.equal(count, pilot.strokes.length);
    return result;
  }
  assert.ok(drive(1, 'left').s > drive(0.3, 'right').s + 0.5);
});

test('holding both touch controls alternates a single blade', () => {
  const {controls, run, strokes} = setup();
  controls.touch('left', true);
  controls.touch('right', true);
  run(5);
  assert.deepEqual(strokes.slice(0,4).map(([side]) => side), ['left','right','left','right']);
  controls.clear();
  const count = strokes.length;
  run(2);
  assert.equal(strokes.length, count);
});

test('continuous same-side paddling stays within the shoreline on long runs', () => {
  const centerX = s => Math.sin(s * 0.05) * 15;
  const riverWidth = s => 7 + 2 * Math.sin(s * 0.13);
  const { controls, run } = setup({centerX, riverWidth});
  controls.touch('left', true);
  for (let n = 0; n < 900; n++) {
    const p = run(1);
    assert.ok(Math.abs(p.x - centerX(p.s)) <= riverWidth(p.s) - 1.79);
  }
});
