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

## Canoe in VR on Quest 3S

Open the HTTPS build in Meta Quest Browser. Sit facing the direction you want to use as the bow and choose **Enter VR**. Your starting head position sets the seat height. You can lean and look over either shoulder as the canoe moves.

The paddle starts across your lap. Put one hand on the wooden palm grip and the other farther along the shaft. Hold the side grip buttons on the Touch Plus controllers, or close your tracked hands around the wood. A thumb-and-index pinch also works. You can release one hand to change your grip. Releasing both brings the paddle back to your lap.

Plant the blade beside the canoe and pull it toward your hip to move forward. Push it toward the bow to back up, draw it toward the hull to move sideways, or sweep a wide arc to turn. A deeper, broadside blade catches more water. Turn the blade edge-on or lift it clear for recovery. Exit VR through the headset menu to pause at your current position.

For a local build, run `npm run dev`, connect the headset over USB with Developer Mode and USB debugging enabled, then run `adb reverse tcp:5173 tcp:5173`. Open `http://localhost:5173` in the headset browser. Substitute the port Vite prints if it differs. [Meta's headset debugging guide](https://developers.meta.com/vr/documentation/web/browser-remote-debugging/)

## Development

The Vite build is fully static and bundles its models, textures, fonts, and sound recordings.

```sh
npm run build
npm run preview
```

Run the control checks with `node --test`. They cover desktop input, tracked paddle grips, water contact, directional strokes, turning and bank limits.

The course in `src/course.js` provides a centerline and half-width in metres. Each entry in `src/environments.js` supplies course functions and a scenery loader. The canoe, current, map, and water renderer share the selected course. Pinebend streams eleven 48-metre terrain sections around the boat, with increasingly coarse bank meshes and fewer objects downstream. The renderer adjusts pixel density to sustained frame times.

## Art and sound

The tracked hand meshes come from the Immersive Web Working Group’s [WebXR Input Profiles](https://github.com/immersive-web/webxr-input-profiles/tree/main/packages/assets/profiles/generic-hand) under the bundled MIT license.

The playable canoe and feathered wooden paddle are modeled in Blender. Run this command from the repository root to rebuild the bundled glTF.

```sh
blender -b -P art/build_canoe.py
```

The arrival screen uses a generated Pinebend illustration. The live water uses planar reflections, shallows, moving capillary waves, and paddle-entry ripples. The sky uses a reduced-resolution version of Poly Haven's [Qwantani Dawn](https://polyhaven.com/a/qwantani_dawn), provided under CC0. Audio and terrain credits are included alongside their assets. The bundled fonts carry the SIL Open Font License.
