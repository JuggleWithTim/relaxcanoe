# Stillwater

Stillwater is a first-person canoeing game set on Pinebend River. Leave the paddle at rest to drift with the current, or alternate sides to travel faster. There are no objectives, scores, or finish line.

## Play locally

Use Node.js 22.12 or later.

```sh
npm ci
npm run dev
```

Open the local URL printed by Vite. Choose **Begin canoeing**. WebGL 2 and browser audio support are required for the full experience. A browser may ask for a click to enable audio on a controller-only start.

| Input | Action |
| --- | --- |
| Left / right arrow | Paddle on that side. Hold for repeated strokes. |
| Xbox LT / RT | Paddle on the left or right. Trigger pressure controls stroke strength. |
| Touch paddle buttons | Paddle on a touchscreen. |
| Drag the scene | Look around. Release to face the bow. |
| Esc or pause button | Pause. Resume from the same position. |

## Development

The Vite build is fully static and bundles its models, textures, fonts, and sound recordings.

```sh
npm run build
npm run preview
```

Run the focused control checks with `node --test tests/paddling.test.js`. They exercise drift, steering, pressure, alternating strokes, pause, and bank limits.

The course in `src/course.js` provides a centerline and half-width in metres. Each entry in `src/environments.js` supplies course functions and a scenery loader. The canoe, current, map, and water renderer share the selected course. Pinebend streams eleven 48-metre terrain sections around the boat, with increasingly coarse bank meshes and fewer objects downstream. The renderer adjusts pixel density to sustained frame times.

## Art and sound

The playable canoe and feathered wooden paddle are modeled in Blender. Run this command from the repository root to rebuild the bundled glTF.

```sh
blender -b -P art/build_canoe.py
```

The arrival screen uses a generated Pinebend illustration. The live water uses planar reflections, shallows, moving capillary waves, and paddle-entry ripples. The sky uses a reduced-resolution version of Poly Haven's [Qwantani Dawn](https://polyhaven.com/a/qwantani_dawn), provided under CC0. Audio and terrain credits are included alongside their assets. The bundled fonts carry the SIL Open Font License.
