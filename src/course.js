// Pinebend River. Station s increases downstream, in metres.
const startX = 11 * Math.sin(-0.6) + 24 * Math.sin(0.5) + 3.5 * Math.sin(0.5);

export function centerX(s) {
  return (
    11 * Math.sin(s * 0.014 - 0.6) +
    24 * Math.sin(s * 0.0057 + 0.5) +
    3.5 * Math.sin(s * 0.029 + 0.5) -
    startX
  );
}

export function riverWidth(s) {
  return (
    16.4 +
    3.2 * Math.sin(s * 0.021 + 0.1) +
    2.3 * Math.sin(s * 0.009 - 0.2) +
    0.65 * Math.sin(s * 0.067)
  );
}
