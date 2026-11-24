const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// Integrate horizontal momentum relative to the river current. The hull's
// centre is 1.2 m forward of the camera/seat origin used by the scene.
export function createVRMotion({ centerX, riverWidth }) {
  let vx = 0, vz = 0, spin = 0;
  function reset() { vx = vz = spin = 0; }
  function update(m, dt, blade) {
    const sin = Math.sin(m.yaw), cos = Math.cos(m.yaw);
    let lateral = vx * cos - vz * sin, aft = vx * sin + vz * cos;
    let fx = 0, fz = 0, torque = 0;
    if (blade?.immersion > 0) {
      const { position, velocity, normal } = blade;
      const rx = position.x, rz = position.z + 1.2;
      const ux = velocity.x + lateral + spin * rz;
      const uz = velocity.z + aft - spin * rx;
      const broadside = ux * normal.x + velocity.y * normal.y + uz * normal.z;
      const drag = clamp(broadside * Math.abs(broadside), -9, 9);
      fx = -blade.immersion * (1.9 * drag * normal.x + 0.12 * ux);
      fz = -blade.immersion * (1.9 * drag * normal.z + 0.12 * uz);
      torque = (rz * fx - rx * fz) * 0.48;
    }
    lateral = clamp((lateral + fx * dt) * Math.exp(-1.55 * dt), -3, 3);
    aft = clamp((aft + fz * dt) * Math.exp(-0.34 * dt), -4, 4);
    spin = clamp((spin + torque * dt) * Math.exp(-1.65 * dt), -0.95, 0.95);
    vx = lateral * cos + aft * sin;
    vz = -lateral * sin + aft * cos;

    const slope = (centerX(m.s + 2) - centerX(m.s - 2)) / 4;
    const flow = (0.78 + 0.1 * Math.sin(m.s * 0.027)) / Math.hypot(1, slope);
    m.yaw += spin * dt;
    m.s += (flow - vz) * dt + 1.2 * (cos - Math.cos(m.yaw));
    m.x += (vx + slope * flow) * dt + 1.2 * (Math.sin(m.yaw) - sin);
    const limit = Math.max(1, riverWidth(m.s) - 3.4);
    const mid = centerX(m.s);
    const across = clamp(m.x - mid, -limit, limit);
    if ((m.x - mid - across) * vx > 0) vx = 0;
    m.x = mid + across;
    m.across = across / limit;
    m.speed = Math.hypot(vx + slope * flow, vz - flow);
    m.roll = 0;
    return m;
  }
  return { reset, update };
}
