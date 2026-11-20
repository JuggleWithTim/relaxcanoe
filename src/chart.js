// A local chart of the current reach. The rotating transform fits its course
// across the wide map window while preserving the proportions of the banks.
export function drawChart(
  canvas,
  course,
  riverWidth,
  station = 0,
  canoeX = course(station),
) {
  const g = canvas.getContext("2d");
  const w = canvas.width,
    h = canvas.height;
  const angle = 0.91,
    co = Math.cos(angle),
    si = Math.sin(angle);
  const midX = course(station),
    px = w * 0.43,
    py = h * 0.52,
    scale = 1.08;
  const project = (x, s) => [
    px + scale * ((x - midX) * co + (s - station) * si),
    py + scale * ((x - midX) * si - (s - station) * co),
  ];
  function elevation(i, j) {
    const x = midX + ((i - px) * co + (j - py) * si) / scale;
    const s = station + ((i - px) * si - (j - py) * co) / scale;
    const d = Math.max(0, Math.abs(x - course(s)) - riverWidth(s));
    return (
      d * (0.7 + 0.2 * Math.sin(s * 0.028 + x * 0.025)) +
      Math.min(1, d * 0.035) *
        (10 * Math.sin(x * 0.06 + s * 0.022) +
          6 * Math.cos(s * 0.09) +
          3 * Math.sin(x * 0.14 + s * 0.04))
    );
  }
  g.fillStyle = "#29382f";
  g.fillRect(0, 0, w, h);
  // Trace equal-height contours with a small marching-squares grid.
  const step = 6,
    cols = Math.ceil(w / step) + 1,
    rows = Math.ceil(h / step) + 1;
  const heights = Array.from({ length: rows }, (_, j) =>
    Array.from({ length: cols }, (_, i) => elevation(i * step, j * step)),
  );
  for (let level = 3; level < 235; level += 8) {
    g.strokeStyle = (level - 3) % 32 === 0 ? "#75816a" : "#566550";
    g.lineWidth = 1;
    g.beginPath();
    for (let j = 0; j < rows - 1; j++)
      for (let i = 0; i < cols - 1; i++) {
        const v = [
          heights[j][i],
          heights[j][i + 1],
          heights[j + 1][i + 1],
          heights[j + 1][i],
        ];
        const x = i * step,
          y = j * step,
          pts = [
            [x, y],
            [x + step, y],
            [x + step, y + step],
            [x, y + step],
          ];
        let n = 0;
        for (let k = 0; k < 4; k++) {
          const b = (k + 1) % 4;
          if (v[k] < level === v[b] < level) continue;
          const f = (level - v[k]) / (v[b] - v[k]);
          const u = pts[k][0] + (pts[b][0] - pts[k][0]) * f,
            z = pts[k][1] + (pts[b][1] - pts[k][1]) * f;
          if (n++ % 2 === 0) g.moveTo(u, z);
          else g.lineTo(u, z);
        }
      }
    g.stroke();
  }
  g.beginPath();
  for (const sign of [-1, 1]) {
    for (let i = 0; i <= 120; i++) {
      const s = station + (sign < 0 ? i - 60 : 60 - i) * 6;
      const p = project(course(s) + sign * riverWidth(s), s);
      if (sign < 0 && i === 0) g.moveTo(...p);
      else g.lineTo(...p);
    }
  }
  g.closePath();
  g.fillStyle = "#81948a";
  g.fill();
  g.strokeStyle = "#a9ada0";
  g.lineWidth = 1;
  g.stroke();
  g.setLineDash([4, 6]);
  g.beginPath();
  for (let i = -60; i <= 60; i++) {
    const s = station + i * 6,
      p = project(course(s), s);
    if (i === -60) g.moveTo(...p);
    else g.lineTo(...p);
  }
  g.strokeStyle = "#dfdec6";
  g.stroke();
  g.setLineDash([]);
  const [x, y] = project(canoeX, station);
  g.beginPath();
  g.arc(x, y, 14, 0, Math.PI * 2);
  g.fillStyle = "#eacc8540";
  g.fill();
  g.strokeStyle = "#ffdea9";
  g.lineWidth = 1;
  g.stroke();
  g.beginPath();
  g.arc(x, y, 6, 0, Math.PI * 2);
  g.fillStyle = "#ffe1a4";
  g.fill();
  g.lineWidth = 2;
  g.strokeStyle = "#384039";
  g.stroke();
}
