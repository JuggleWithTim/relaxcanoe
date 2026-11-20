import { centerX, riverWidth } from "./course.js";

// The menu and controls can use the course before loading its 3D scenery.
export const environments = [
  {
    id: "pinebend",
    name: "Pinebend River",
    centerX,
    riverWidth,
    loadLandscape: () => import("./landscape.js"),
  },
];
