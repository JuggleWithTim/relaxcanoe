// The GLB pivot is the palm grip. Its shaft points along local -Y and the
// broad face of the blade is perpendicular to local Z. All distances are metres.
import { MathUtils, Quaternion, Vector3 } from 'three';

const down = new Vector3(0, -1, 0);
const bladeRoot = 0.86, bladeTip = 1.429;
const rackDirection = new Vector3(1, -0.16, -0.08).normalize();

export function createTrackedPaddle(paddle) {
  const axis = new Vector3(), between = new Vector3(), offset = new Vector3();
  const swing = new Quaternion();
  const previous = new Vector3();
  const blade = {
    position: new Vector3(), normal: new Vector3(), velocity: new Vector3(),
    immersion: 0, entry: false,
  };
  let tracking = false, wet = false;
  const grips = new Map();

  function rack() {
    grips.clear();
    tracking = wet = false;
    paddle.position.set(-0.30, 0.65, -0.32);
    paddle.quaternion.setFromUnitVectors(down, rackDirection);
  }

  function project(hand) {
    axis.copy(down).applyQuaternion(paddle.quaternion);
    offset.subVectors(hand.position, paddle.position);
    const distance = MathUtils.clamp(offset.dot(axis), 0, 0.74);
    return offset.addScaledVector(axis, -distance).length() < 0.14 ? distance : null;
  }

  function update(hands, dt) {
    let changed = false;
    for (const [hand, grip] of grips) {
      if (!hands.includes(hand) || !hand.closed || hand.source !== grip.source) {
        grips.delete(hand);
        changed = true;
      }
    }
    for (const hand of hands) {
      if (!hand.closed || grips.has(hand)) continue;
      const distance = project(hand);
      const other = grips.values().next().value;
      if (distance === null || (other && Math.abs(distance - other.distance) < 0.12)) continue;
      grips.set(hand, { distance, rotation: new Quaternion(), source: hand.source });
      changed = true;
    }
    if (!grips.size) {
      rack();
      return null;
    }
    // Rebase wrist twist when a hand joins or leaves so the paddle stays put.
    if (changed) {
      for (const [hand, grip] of grips) {
        grip.rotation.copy(hand.rotation).invert().multiply(paddle.quaternion);
      }
      tracking = false;
    }
    const iterator = grips.entries();
    const [first, grip] = iterator.next().value;
    paddle.quaternion.multiplyQuaternions(first.rotation, grip.rotation);
    axis.copy(down).applyQuaternion(paddle.quaternion);
    if (grips.size === 2) {
      const [second, other] = iterator.next().value;
      between.subVectors(second.position, first.position);
      if (between.lengthSq() > 0.0064) {
        between.normalize().multiplyScalar(Math.sign(other.distance - grip.distance));
        swing.setFromUnitVectors(axis, between);
        paddle.quaternion.premultiply(swing);
        axis.copy(between);
      }
    }
    paddle.position.copy(first.position).addScaledVector(axis, -grip.distance);
    blade.normal.set(0, 0, 1).applyQuaternion(paddle.quaternion);
    blade.position.copy(paddle.position).addScaledVector(axis, (bladeRoot + bladeTip) / 2);
    const rootY = paddle.position.y + axis.y * bladeRoot;
    const tipY = paddle.position.y + axis.y * bladeTip;
    const low = Math.min(rootY, tipY), high = Math.max(rootY, tipY);
    blade.immersion = MathUtils.clamp(-low / Math.max(0.001, high - low), 0, 1);
    // The open space inside the hull is dry at the waterline.
    const station = Math.abs((blade.position.z + 1.2) / 2.45);
    if (station < 1 && Math.abs(blade.position.x) < 0.46 * (1 - station ** 1.9) ** 0.86) {
      blade.immersion = 0;
    }
    blade.velocity.subVectors(blade.position, previous);
    const continuous = tracking && dt > 0 && dt < 0.10 && blade.velocity.lengthSq() < 0.35 ** 2;
    previous.copy(blade.position);
    tracking = true;
    blade.entry = continuous && !wet && blade.immersion > 0.06;
    wet = blade.immersion > (wet ? 0.01 : 0.06);
    if (!continuous) return null;
    blade.velocity.multiplyScalar(1 / dt).clampLength(0, 5);
    return blade;
  }

  return { update, rack, project, holds: hand => grips.has(hand) };
}
