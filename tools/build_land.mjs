/* Builds data/land.js: the dotted land of the projects map in the hero.

   Usage, from the site folder:
     npm install world-atlas@2 topojson-client@3 d3-geo@3
     node tools/build_land.mjs

   Land is Natural Earth 1:50m (public domain), from the world-atlas
   package. The dots lie on a staggered grid in Mercator coordinates
   (x = longitude in radians, y = ln tan(pi/4 + latitude/2)), so they keep
   an even spacing on the Mercator map drawn by script.js. Each row is
   stored as run lengths: sea, land, sea, land, ... dots. */

import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { feature } from 'topojson-client';
import { geoBounds, geoContains } from 'd3-geo';

const require = createRequire(import.meta.url);
const topology = JSON.parse(readFileSync(require.resolve('world-atlas/land-50m.json'), 'utf8'));
const land = feature(topology, topology.objects.land);

// One feature per polygon, with its bounding box, so that each point is
// tested only against the few polygons that could contain it
const polygons = (land.type === 'FeatureCollection' ? land.features : [land])
  .flatMap(f => (f.geometry.type === 'MultiPolygon'
    ? f.geometry.coordinates.map(coordinates => ({ type: 'Polygon', coordinates }))
    : [f.geometry]))
  .map(geometry => ({ geometry, bounds: geoBounds(geometry) }));
const inBounds = ([[w, s], [e, n]], lon, lat) =>
  lat >= s && lat <= n && (w <= e ? lon >= w && lon <= e : lon >= w || lon <= e);
const isLandAt = (lon, lat) =>
  polygons.some(p => inBounds(p.bounds, lon, lat) && geoContains(p.geometry, [lon, lat]));

const STEP_DEG = 0.6;                        // dot spacing along a row
const LON = [-170, 90];                      // extent of the grid
const LAT = [-56, 74];

const rad = d => (d * Math.PI) / 180;
const mercY = lat => Math.log(Math.tan(Math.PI / 4 + rad(lat) / 2));
const invY = y => (2 * Math.atan(Math.exp(y)) - Math.PI / 2) * 180 / Math.PI;

const step = rad(STEP_DEG);
const rowStep = step * Math.sqrt(3) / 2;     // staggered rows
const x0 = rad(LON[0]);
const cols = Math.floor((rad(LON[1]) - x0) / step);
const yTop = mercY(LAT[1]);
const rows = Math.floor((yTop - mercY(LAT[0])) / rowStep);

const runs = [];
let dots = 0;
for (let r = 0; r < rows; r++) {
  const y = yTop - r * rowStep;
  const shift = r % 2 ? step / 2 : 0;
  const row = [];
  let current = false, length = 0;
  for (let c = 0; c < cols; c++) {
    const lon = ((x0 + shift + c * step) * 180) / Math.PI;
    const isLand = isLandAt(lon, invY(y));
    if (isLand) dots++;
    if (isLand === current) length++;
    else { row.push(length); current = isLand; length = 1; }
  }
  if (current) row.push(length);           // trailing sea is implied
  runs.push(row.join(' '));
}

const out = `/* =================================================================
   data/land.js  (built by tools/build_land.mjs; do not edit by hand)
   Land of the projects map: Natural Earth 1:50m (public domain), as
   ${dots} dots on a staggered Mercator grid. Each row lists run lengths
   of sea, land, sea, land, ... dots; odd rows are shifted half a step.
   ================================================================= */

const LAND = {
  step: ${step},
  x0: ${x0},
  yTop: ${yTop},
  rows: [
${runs.map(r => `    '${r}'`).join(',\n')}
  ]
};
`;
writeFileSync(new URL('../data/land.js', import.meta.url), out);
console.log(`data/land.js: ${rows} rows, ${cols} columns, ${dots} land dots, ${out.length} bytes`);
