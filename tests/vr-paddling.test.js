import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Object3D, Quaternion, Vector3 } from 'three';
import { createTrackedPaddle } from '../src/vr-paddle.js';
import { createVRMotion } from '../src/vr-motion.js';

const dt = 1 / 72;
const straight = { centerX: () => 0, riverWidth: () => 12 };
function stroke({ vx = 0, vz = 0, nx = 0, nz = 1, x = 0.8, z = -1.2, immersion = 1 }) {
  return { position: { x, z }, velocity: { x: vx, y: 0, z: vz }, normal: { x: nx, y: 0, z: nz }, immersion };
}
function drive(blade, seconds = 1) {
  const dynamics = createVRMotion(straight);
  const m = { x: 0, s: 0, yaw: 0 };
  for (let i = 0; i < Math.round(seconds / dt); i++) dynamics.update(m, dt, blade);
  return m;
}

test('pull, backstroke, draw and feather produce distinct responses', () => {
  const drift = drive(null);
  assert.deepEqual(drive(stroke({ vz: 2, immersion: 0 })), drift);
  const right = drive(stroke({ vz: 2 }));
  const left = drive(stroke({ vz: 2, x: -0.8 }));
  assert.ok(right.s > drift.s + 0.5 && right.yaw > 0.1);
  assert.equal(right.s, left.s);
  assert.equal(right.yaw, -left.yaw);
  assert.ok(drive(stroke({ vz: -2 })).s < 0);
  assert.ok(drive(stroke({ vx: -2, nx: 1, nz: 0 })).x > 0.5);
  assert.ok(drive(stroke({ vz: 2, nx: 1, nz: 0 })).s < right.s - 0.35);
  assert.ok(drive(stroke({ vz: 2, immersion: 0.2 })).s < right.s);
});

test('immersive heading can turn through a full circle and banks contain sideways travel', () => {
  assert.ok(drive(stroke({ vz: 2 }), 80).yaw > 2 * Math.PI);
  const m = drive(stroke({ vx: -2, nx: 1, nz: 0 }), 50);
  assert.equal(m.x, straight.riverWidth() - 3.4);
});

test('a rigid two-handed paddle follows both grips, enters water once and resets on tracking gaps', () => {
  const model = new Object3D();
  const paddle = createTrackedPaddle(model);
  paddle.rack();
  const makeHand = distance => ({
    position: new Vector3(0, -distance, 0).applyQuaternion(model.quaternion).add(model.position),
    rotation: new Quaternion(), closed: true,
  });
  const upper = makeHand(0), lower = makeHand(0.55);
  const hands = [lower, upper]; // Shaft hand takes hold first.
  assert.equal(paddle.update(hands, dt), null);
  assert.equal(paddle.update(hands, dt).immersion, 0);
  upper.position.set(0.2, 1.03, -0.32);
  lower.position.set(0.53, 0.59, -0.32);
  assert.equal(paddle.update(hands, dt), null); // large tracking jump
  const shaft = new Vector3(0, -0.55, 0).applyQuaternion(model.quaternion).add(model.position);
  assert.ok(shaft.distanceTo(lower.position) < 1e-6);
  assert.ok(model.position.distanceTo(upper.position) < 1e-6);
  for (const hand of hands) hand.position.y += 0.2;
  assert.equal(paddle.update(hands, dt).immersion, 0);
  let entries = 0;
  for (let i = 0; i < 35; i++) {
    for (const hand of hands) hand.position.y -= 0.01;
    const blade = paddle.update(hands, dt);
    if (blade.entry) entries++;
  }
  assert.equal(entries, 1);
  const rest = paddle.update(hands, dt);
  assert.ok(rest.immersion > 0.4 && rest.velocity.length() === 0);
  assert.equal(paddle.update(hands, 1), null);
  const before = model.quaternion.clone();
  assert.equal(paddle.update([upper], dt), null);
  assert.ok(before.angleTo(model.quaternion) < 1e-6);
  assert.equal(paddle.update([], dt), null);
  assert.deepEqual(model.position.toArray(), [-0.30, 0.65, -0.32]);
});
