import { centerX, riverWidth, createLandscape } from './landscape.js';

// Each river supplies its own course, shoreline and scenery to the same boat.
export const pinebend = {
  id: 'pinebend', name: 'Pinebend River', centerX, riverWidth, createLandscape,
};
export const environments = [pinebend];
