/* =================================================================
   script.js: Maurizio Petrelli

   No page text lives here: all content is in index.html.
   0. Shared helpers
   1. Hero figure: starts the crystal map
   2. Crystal map and the clusters in pressure–temperature space
   3. Publications: search and filter over the list in index.html
   4. Navigation: underline the section in view
   5. Portrait: show a hint if portrait.jpg is missing
   ================================================================= */

'use strict';


/* 0. SHARED HELPERS ------------------------------------------------ */

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const clamp01 = v => Math.max(0, Math.min(1, v));
const easeOut = t => 1 - Math.pow(1 - t, 3);
const lerp = (a, b, t) => a + (b - a) * t;

function hexToRgb(hex) {
  let h = hex.trim().replace('#', '');
  if (h.length === 3) h = h.split('').map(c => c + c).join('');
  return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16));
}

function rgba(rgb, a) {
  return `rgba(${Math.round(rgb[0])}, ${Math.round(rgb[1])}, ${Math.round(rgb[2])}, ${a})`;
}

function mixRgb(a, b, t) {
  return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
}

// Colours from style.css, as seen by a given element (light or dark band)
function themeColours(element) {
  const css = getComputedStyle(element);
  const token = name => css.getPropertyValue(name).trim();
  return {
    ink: hexToRgb(token('--ink')),
    muted: hexToRgb(token('--muted')),
    paper: hexToRgb(token('--paper')),
    serif: token('--serif'),
    sans: token('--sans')
  };
}

// Size a canvas for the screen; returns its size in CSS pixels
function fitCanvas(canvas) {
  const box = canvas.getBoundingClientRect();
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.max(1, Math.round(box.width * ratio));
  canvas.height = Math.max(1, Math.round(box.height * ratio));
  return { width: box.width, height: box.height, ratio };
}


/* 1. HERO FIGURE ----------------------------------------------------
   Draws the crystal map once the page has painted, and plays it once. */

(function heroFigure() {
  const canvas = document.getElementById('crystal-map');
  const readout = document.getElementById('figure-readout');
  if (!canvas || !readout || typeof CPX_SPOTS === 'undefined' || typeof CPX_MAP === 'undefined') return;

  const fontsReady = document.fonts ? document.fonts.ready : Promise.resolve();
  fontsReady.then(() => requestAnimationFrame(() => setTimeout(() => {
    createCrystalMap(canvas, readout, readout.textContent, CPX_SPOTS, CPX_MAP).start();
  }, 0)));
})();


/* 2. CRYSTAL MAP AND CLUSTER PRESSURE–TEMPERATURE -------------------
   After Caracciolo et al. (2026), Nature Communications,
   doi:10.1038/s41467-026-77213-9.
   Left: the paper's Fig. 5 crystal from the 2021 Tajogaite eruption
   (data/cpx-map.js), shown as Cr, Sc and Zr maps, then coloured by
   cluster. Only clusters 0, 2 and 5 are used; each pixel takes the
   nearest of their published means on eight trace elements, and
   isolated pixels are cleaned away, by tools/build_data.py.
   Right: depth and temperature of the spot analyses in those clusters
   (data/cpx-spots.js), from the machine-learning clinopyroxene-only
   thermobarometer of Ágreda-López et al. (2024), Computers &
   Geosciences 193, 105707. For each cluster: a kernel density
   estimate, drawn as the contour holding 90% of its spots,
   and the centroid (mean P and T). The clusters appear in the order
   they grew, from core to rim, and each lights up in the crystal. */

function createCrystalMap(canvas, readout, defaultReadout, spotData, mapData) {
  const ctx = canvas.getContext('2d');
  const W = mapData.width;
  const H = mapData.height;
  const ELEMENTS = ['Cr', 'Sc', 'Zr'];

  // What each cluster records, after the paper
  const CLUSTER_ABOUT = [
    'evolved core, from the crystal mush',
    'evolved core, a little richer in Cr, Sc and Ni',
    'outer rim, grown during ascent',
    'inner rim, fractionated after recharge',
    'rare core, low in Ti and V',
    'grown from the basanite recharge'
  ];

  // Cluster colours as in the paper (Okabe–Ito, readable with colour-blindness)
  const CLUSTER_RGB = ['#E69F00', '#56B4E9', '#009E73', '#F0E442', '#0072B2', '#D55E00'].map(hexToRgb);

  // Clusters used (set in tools/build_data.py and listed in data/cpx-map.js)
  const USED = mapData.clusters;

  // The order in which the clusters appear: core to rim (0, 5, 2), after the paper's
  // model (Fig. 9). Clusters not used are left out, and so are steps left empty.
  const STEPS = [
    { title: 'Evolved cores', clusters: [0, 1, 4] },
    { title: 'Basanite recharge', clusters: [5] },
    { title: 'Inner rims after recharge', clusters: [3] },
    { title: 'Outer rims, during ascent', clusters: [2] }
  ].map(step => ({ ...step, clusters: step.clusters.filter(k => USED.includes(k)) }))
    .filter(step => step.clusters.length > 0);

  // Pressure to depth as in the paper: 2800 kg/m³ above the Moho, 3100 kg/m³ below
  const MOHO_KM = 12;
  const DENSITY = { crust: 2800, mantle: 3100 };

  // Depths of the 2021 earthquakes (km), as shown in the paper's Fig. 7
  const SEISMICITY_KM = [[4, 12], [20, 25]];

  // Colour scale for concentrations (after matplotlib "magma", dark end trimmed)
  const SCALE = ['#3B0F70', '#641A80', '#8C2981', '#B73779', '#DE4968', '#F7705C', '#FE9F6D', '#FECF92', '#FCFDBF'].map(hexToRgb);
  const scaleColour = t => {
    const x = clamp01(t) * (SCALE.length - 1);
    const i = Math.min(SCALE.length - 2, Math.floor(x));
    return mixRgb(SCALE[i], SCALE[i + 1], x - i);
  };

  // Colour-scale ranges (ppm), as in the paper's Fig. 5
  const RANGE = { Cr: [0.1, 2000], Sc: [20, 140], Zr: [80, 700] };

  // Plot ranges: temperature (°C) and depth (km)
  const PLOT = { t0: 900, t1: 1175, d0: 0, d1: 44 };

  /* --- The published spot analyses and the crystal map ------------ */

  const spots = spotData.rows.map(r => ({ eruption: r[0], rock: r[1], position: r[2], cluster: r[3], p: r[12], t: r[15] }));

  const parse = rows => rows.map(row => row.split(' ').map(v => (v === '.' ? null : Number(v))));
  const grids = ELEMENTS.map(e => parse(mapData[e]));
  const clusterGrid = parse(mapData.cluster);
  const pixels = [];
  for (let j = 0; j < H; j++) {
    for (let i = 0; i < W; i++) {
      if (clusterGrid[j][i] === null) continue;
      const ppm = grids.map(g => g[j][i]);
      const scale = ELEMENTS.map((e, n) => {
        const [lo, hi] = RANGE[e].map(Math.log10);
        return scaleColour((Math.log10(ppm[n]) - lo) / (hi - lo));
      });
      pixels.push({ i, j, ppm, scale, cluster: clusterGrid[j][i] });
    }
  }
  const pixelAt = new Map(pixels.map((p, n) => [p.j * W + p.i, n]));

  /* --- Pressure, temperature and density estimates ---------------- */

  const kbarPerKm = rho => (rho * 9.80665 * 1000) / 1e8;
  const mohoKbar = MOHO_KM * kbarPerKm(DENSITY.crust);
  const depthOf = p => (p <= mohoKbar
    ? p / kbarPerKm(DENSITY.crust)
    : MOHO_KM + (p - mohoKbar) / kbarPerKm(DENSITY.mantle));

  // Spots with a pressure and temperature (32 microlites have none)
  const ptSpots = spots.filter(s => s.p !== null && USED.includes(s.cluster)).map(s => ({ ...s, depth: depthOf(s.p) }));

  // Kernel density estimate on a grid of cell centres, in temperature and depth
  const GX = 110;
  const GY = 88;
  const cellT = (PLOT.t1 - PLOT.t0) / GX;
  const cellD = (PLOT.d1 - PLOT.d0) / GY;
  const MIN_SPOTS = 5;               // fewer spots than this: centroid only

  const quantile = (values, q) => {
    const v = [...values].sort((a, b) => a - b);
    const x = (v.length - 1) * q;
    const i = Math.floor(x);
    return v[i] + (v[Math.min(i + 1, v.length - 1)] - v[i]) * (x - i);
  };
  // Spread for the bandwidth: standard deviation or IQR/1.349, whichever is smaller
  const spread = v => {
    const m = v.reduce((a, b) => a + b, 0) / v.length;
    const s = Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / (v.length - 1));
    const iqr = (quantile(v, 0.75) - quantile(v, 0.25)) / 1.349;
    return iqr > 0 ? Math.min(s, iqr) : s;
  };

  // Gaussian kernel; depth is reflected at the surface, where pressure cannot go below zero
  const kernel = (dt, d, di, ht, hd) =>
    Math.exp(-0.5 * (dt / ht) ** 2) * (Math.exp(-0.5 * ((d - di) / hd) ** 2) + Math.exp(-0.5 * ((d + di) / hd) ** 2));

  // Contour segments at one level, by marching squares over the grid
  function contour(grid, level) {
    const segments = [];
    const at = (i, j) => grid[j * GX + i];
    for (let j = 0; j < GY - 1; j++) {
      for (let i = 0; i < GX - 1; i++) {
        const a = at(i, j);
        const b = at(i + 1, j);
        const c = at(i + 1, j + 1);
        const d = at(i, j + 1);
        const index = (a >= level ? 8 : 0) | (b >= level ? 4 : 0) | (c >= level ? 2 : 0) | (d >= level ? 1 : 0);
        if (index === 0 || index === 15) continue;
        const top = [i + (level - a) / (b - a), j];
        const right = [i + 1, j + (level - b) / (c - b)];
        const bottom = [i + (level - d) / (c - d), j + 1];
        const left = [i, j + (level - a) / (d - a)];
        const centreIn = (a + b + c + d) / 4 >= level;
        switch (index) {
          case 1: case 14: segments.push([left, bottom]); break;
          case 2: case 13: segments.push([bottom, right]); break;
          case 3: case 12: segments.push([left, right]); break;
          case 4: case 11: segments.push([top, right]); break;
          case 6: case 9: segments.push([top, bottom]); break;
          case 7: case 8: segments.push([left, top]); break;
          case 5: segments.push(...(centreIn ? [[left, top], [bottom, right]] : [[top, right], [left, bottom]])); break;
          case 10: segments.push(...(centreIn ? [[top, right], [left, bottom]] : [[left, top], [bottom, right]])); break;
        }
      }
    }
    return segments;
  }

  const clusters = USED.map(k => {
    const members = ptSpots.filter(s => s.cluster === k);
    const n = members.length;
    const pMean = members.reduce((sum, s) => sum + s.p, 0) / n;
    const tMean = members.reduce((sum, s) => sum + s.t, 0) / n;
    const cluster = { k, members, n, pMean, tMean, depthMean: depthOf(pMean), rgb: CLUSTER_RGB[k], step: STEPS.findIndex(s => s.clusters.includes(k)) };
    if (n < MIN_SPOTS) return cluster;

    // Bandwidths: Scott's rule for two dimensions
    const ht = spread(members.map(s => s.t)) * n ** (-1 / 6);
    const hd = spread(members.map(s => s.depth)) * n ** (-1 / 6);
    const grid = new Float32Array(GX * GY);
    members.forEach(s => {
      const i0 = Math.max(0, Math.floor((s.t - 3 * ht - PLOT.t0) / cellT));
      const i1 = Math.min(GX - 1, Math.ceil((s.t + 3 * ht - PLOT.t0) / cellT));
      const j1 = Math.min(GY - 1, Math.ceil((s.depth + 3 * hd - PLOT.d0) / cellD));
      for (let j = 0; j <= j1; j++) {
        const d = PLOT.d0 + (j + 0.5) * cellD;
        for (let i = i0; i <= i1; i++) {
          grid[j * GX + i] += kernel(PLOT.t0 + (i + 0.5) * cellT - s.t, d, s.depth, ht, hd);
        }
      }
    });

    // Contour level: the density at the spots, so that the contour holds 90% of them
    const atSpots = members.map(s => members.reduce((sum, o) => sum + kernel(s.t - o.t, s.depth, o.depth, ht, hd), 0));
    const level90 = quantile(atSpots, 0.1);

    // Shading for the cluster in focus
    const image = document.createElement('canvas');
    image.width = GX;
    image.height = GY;
    const imageCtx = image.getContext('2d');
    const shade = imageCtx.createImageData(GX, GY);
    grid.forEach((v, n2) => {
      const a = clamp01((v - 0.8 * level90) / (0.2 * level90));        // inside the 90% contour
      shade.data.set([...cluster.rgb, Math.round(255 * 0.3 * a)], n2 * 4);
    });
    imageCtx.putImageData(shade, 0, 0);

    return Object.assign(cluster, { grid, level90, image, lines90: contour(grid, level90) });
  });

  // Typical uncertainty: median half-width of the 16th–84th percentile ranges
  const withPT = spotData.rows.filter(r => r[12] !== null && USED.includes(r[3]));
  const halfP = quantile(withPT.map(r => (r[14] - r[13]) / 2), 0.5);
  const halfT = quantile(withPT.map(r => (r[17] - r[16]) / 2), 0.5);

  /* --- Timeline (ms) ---------------------------------------------- */

  const T_SCAN = 2000;              // laser maps the crystal, Cr first
  const T_SC = [2300, 2700];        // colour scale changes to Sc
  const T_ZR = [2900, 3300];        // then to Zr
  const T_ASSIGN = 3600;            // all pixels fade to their cluster colour together
  const ASSIGN_SPAN = 900;
  const T_STEPS = 5300;             // clusters appear in the plot, core to rim
  const STEP_SPAN = 1300;
  const T_ALL = T_STEPS + STEPS.length * STEP_SPAN;
  const T_END = T_ALL + 500;


  /* --- Drawing ---------------------------------------------------- */

  const image = document.createElement('canvas');
  image.width = W;
  image.height = H;
  const imageCtx = image.getContext('2d');
  const imageData = imageCtx.createImageData(W, H);

  let size = { width: 0, height: 0, ratio: 1 };
  let layout = null;
  let colours = null;
  let hover = null;
  let frameId = 0;
  let t0 = 0;
  let now = Infinity;

  function resize() {
    size = fitCanvas(canvas);
    colours = themeColours(canvas);
    const { width, height } = size;
    const narrow = width < 480;
    const top = narrow ? 22 : 28;
    const under = narrow ? 34 : 42;
    const mapH = Math.max(10, Math.min(height - top - under, (width * 0.42 * H) / W));
    const mapW = (mapH * W) / H;
    const gap = narrow ? 42 : 58;
    const right = narrow ? 6 : 34;
    layout = {
      narrow,
      map: { x: 0, y: top, w: mapW, h: mapH },
      plot: { x: mapW + gap, y: top, w: Math.max(10, width - mapW - gap - right), h: Math.max(10, mapH - (narrow ? 22 : 28)) }
    };
    draw(now);
  }

  const toX = t => layout.plot.x + ((t - PLOT.t0) / (PLOT.t1 - PLOT.t0)) * layout.plot.w;
  const toY = d => layout.plot.y + ((d - PLOT.d0) / (PLOT.d1 - PLOT.d0)) * layout.plot.h;
  const gridX = i => toX(PLOT.t0 + (i + 0.5) * cellT);
  const gridY = j => toY(PLOT.d0 + (j + 0.5) * cellD);
  const assigned = t => easeOut(clamp01((t - T_ASSIGN) / ASSIGN_SPAN));
  const stepShown = (s, t) => easeOut(clamp01((t - T_STEPS - s * STEP_SPAN) / 500));

  // Clusters in focus: those appearing, or the one under the pointer; null = all
  function focusAt(t) {
    if (hover && hover.cluster !== undefined) return [hover.cluster];
    if (t < T_STEPS || t >= T_ALL) return null;
    return STEPS[Math.floor((t - T_STEPS) / STEP_SPAN)].clusters;
  }

  function draw(t) {
    const { width, height, ratio } = size;
    if (!layout || width < 20) return;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, width, height);

    const { map, narrow } = layout;
    const fontSize = narrow ? 10 : 11;
    const revealed = Math.floor(clamp01(t / T_SCAN) * H);
    const scMix = easeOut(clamp01((t - T_SC[0]) / (T_SC[1] - T_SC[0])));
    const zrMix = easeOut(clamp01((t - T_ZR[0]) / (T_ZR[1] - T_ZR[0])));
    const clustering = t >= T_ASSIGN;
    const focus = focusAt(t);
    const mapFocus = hover && hover.pixel !== undefined ? null : focus;

    // Map pixels: concentration, then cluster; clusters out of focus turn grey
    imageData.data.fill(0);
    pixels.forEach(p => {
      if (p.j >= revealed) return;
      let rgb = mixRgb(mixRgb(p.scale[0], p.scale[1], scMix), p.scale[2], zrMix);
      rgb = mixRgb(rgb, CLUSTER_RGB[p.cluster], assigned(t));
      if (mapFocus && !mapFocus.includes(p.cluster)) {
        const grey = 0.3 * rgb[0] + 0.59 * rgb[1] + 0.11 * rgb[2];
        rgb = mixRgb([grey, grey, grey], colours.paper, 0.72);
      }
      const o = (p.j * W + p.i) * 4;
      imageData.data[o] = rgb[0];
      imageData.data[o + 1] = rgb[1];
      imageData.data[o + 2] = rgb[2];
      imageData.data[o + 3] = 255;
    });
    imageCtx.putImageData(imageData, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(image, map.x, map.y, map.w, map.h);

    // Laser line while mapping
    if (revealed > 0 && revealed < H) {
      ctx.fillStyle = rgba(colours.ink, 0.85);
      ctx.fillRect(map.x, map.y + (revealed / H) * map.h, map.w, 1.5);
    }

    // Scale bar: 100 µm
    const bar = (100 / mapData.micronsPerPixel / W) * map.w;
    const barY = map.y + map.h - 4;
    ctx.fillStyle = rgba(colours.ink, 0.9);
    ctx.fillRect(map.x + map.w - bar, barY, bar, 3);
    ctx.font = `400 ${fontSize}px ${colours.sans}`;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'bottom';
    ctx.fillText('100 µm', map.x + map.w, barY - 3);

    // Title above the map
    const element = zrMix > 0.5 ? 'Zr' : scMix > 0.5 ? 'Sc' : 'Cr';
    let title = narrow ? `${element} map` : `${element} map, Tajogaite 2021`;
    if (clustering) title = narrow ? 'Clusters' : 'Clusters, Tajogaite 2021';
    ctx.font = `500 ${fontSize + 1}px ${colours.sans}`;
    ctx.textAlign = 'left';
    ctx.fillStyle = rgba(colours.ink, 1);
    ctx.fillText(title, map.x, map.y - 8);

    // Under the map: colour scale, then cluster key
    const keyY = map.y + map.h + (narrow ? 12 : 16);
    ctx.font = `400 ${fontSize}px ${colours.sans}`;
    if (!clustering) {
      const [lo, hi] = RANGE[element];
      const barW = map.w * 0.9;
      for (let x = 0; x < barW; x++) {
        ctx.fillStyle = rgba(scaleColour(x / barW), 1);
        ctx.fillRect(map.x + x, keyY, 1, 6);
      }
      ctx.fillStyle = rgba(colours.muted, 1);
      ctx.textBaseline = 'top';
      ctx.textAlign = 'left';
      ctx.fillText(String(lo), map.x, keyY + 9);
      ctx.textAlign = 'right';
      ctx.fillText(`${hi} ppm`, map.x + barW, keyY + 9);
    } else {
      const keyAlpha = clamp01((t - T_ASSIGN) / 400);
      const step = Math.min(narrow ? 24 : 30, map.w / USED.length);
      ctx.textBaseline = 'middle';
      ctx.textAlign = 'left';
      USED.forEach((k, n) => {
        const x = map.x + n * step;
        const dim = mapFocus && !mapFocus.includes(k) ? 0.35 : 1;
        ctx.fillStyle = rgba(CLUSTER_RGB[k], keyAlpha * dim);
        ctx.fillRect(x, keyY, 10, 10);
        ctx.fillStyle = rgba(colours.ink, keyAlpha * dim);
        ctx.fillText(String(k), x + 13, keyY + 5);
      });
    }

    drawPlot(t, fontSize, focus);

    // Pixel under the pointer
    if (hover && hover.pixel !== undefined) {
      const p = pixels[hover.pixel];
      const cell = map.w / W;
      ctx.strokeStyle = rgba(colours.ink, 1);
      ctx.lineWidth = 1.5;
      ctx.strokeRect(map.x + p.i * cell - 1, map.y + p.j * cell - 1, cell + 2, cell + 2);
    }
  }

  function drawPlot(t, fontSize, focus) {
    const { plot, narrow } = layout;
    const frameAlpha = easeOut(clamp01(t / 600));
    const ink = a => rgba(colours.ink, a * frameAlpha);
    const muted = a => rgba(colours.muted, a * frameAlpha);

    // 2021 earthquakes (grey bands) and the Moho
    SEISMICITY_KM.forEach(([a, b]) => {
      ctx.fillStyle = ink(0.07);
      ctx.fillRect(plot.x, toY(a), plot.w, toY(b) - toY(a));
    });
    const moho = Math.round(toY(MOHO_KM)) + 0.5;
    ctx.strokeStyle = ink(0.45);
    ctx.lineWidth = 1;
    ctx.setLineDash([5, 4]);
    ctx.beginPath(); ctx.moveTo(plot.x, moho); ctx.lineTo(plot.x + plot.w, moho); ctx.stroke();
    ctx.setLineDash([]);

    ctx.font = `400 ${fontSize}px ${colours.sans}`;
    ctx.fillStyle = muted(1);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    ctx.fillText('Moho', plot.x + 4, moho - 2);
    ctx.fillText(narrow ? 'Grey: earthquakes' : 'Grey: 2021 earthquakes', plot.x + 4, plot.y + plot.h - 4);

    // Typical uncertainty of one spot (16th–84th percentile)
    const ux = toX(PLOT.t0 + 18);
    const uDepth = 36;
    const uP = (uDepth - MOHO_KM) * kbarPerKm(DENSITY.mantle) + mohoKbar;
    const uy = toY(uDepth);
    ctx.strokeStyle = ink(0.7);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(toX(PLOT.t0 + 18 - halfT), uy); ctx.lineTo(toX(PLOT.t0 + 18 + halfT), uy);
    ctx.moveTo(ux, toY(depthOf(uP - halfP))); ctx.lineTo(ux, toY(depthOf(uP + halfP)));
    ctx.stroke();
    ctx.textBaseline = 'middle';
    ctx.fillText(narrow ? '±1σ' : '±1σ, typical spot', toX(PLOT.t0 + 18 + halfT) + 5, uy);

    // Axes: temperature below, depth left, pressure right
    [950, 1000, 1050, 1100, 1150].forEach(v => {
      const x = Math.round(toX(v)) + 0.5;
      ctx.strokeStyle = ink(0.08);
      ctx.beginPath(); ctx.moveTo(x, plot.y); ctx.lineTo(x, plot.y + plot.h); ctx.stroke();
      if (narrow && v % 100) return;
      ctx.fillStyle = muted(1);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillText(String(v), x, plot.y + plot.h + 5);
    });
    [0, 10, 20, 30, 40].forEach(v => {
      ctx.fillStyle = muted(1);
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(v), plot.x - 6, Math.round(toY(v)) + 0.5);
    });
    if (!narrow) {
      [0, 2, 4, 6, 8, 10, 12].forEach(v => {
        const y = Math.round(toY(depthOf(v))) + 0.5;
        ctx.strokeStyle = ink(0.5);
        ctx.beginPath(); ctx.moveTo(plot.x + plot.w, y); ctx.lineTo(plot.x + plot.w + 4, y); ctx.stroke();
        ctx.fillStyle = muted(1);
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(String(v), plot.x + plot.w + 7, y);
      });
    }
    ctx.strokeStyle = ink(0.5);
    ctx.beginPath();
    ctx.moveTo(plot.x + 0.5, plot.y);
    ctx.lineTo(plot.x + 0.5, plot.y + plot.h + 0.5);
    ctx.lineTo(plot.x + plot.w, plot.y + plot.h + 0.5);
    if (!narrow) ctx.lineTo(plot.x + plot.w, plot.y);
    ctx.stroke();

    ctx.font = `500 ${fontSize}px ${colours.sans}`;
    ctx.fillStyle = ink(1);
    ctx.textAlign = 'right';
    ctx.textBaseline = 'top';
    ctx.fillText('Temperature (°C)', plot.x + plot.w, plot.y + plot.h + 18);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    ctx.fillText('Depth (km)', plot.x - (narrow ? 30 : 40), plot.y - 8);
    if (!narrow) {
      ctx.textAlign = 'right';
      ctx.fillText('kbar', plot.x + plot.w + 30, plot.y - 8);
    }

    // Clusters: shading and spots for those in focus, contours for all shown, then centroids
    const shown = c => (c.step < 0 ? 0 : stepShown(c.step, t));
    const inFocus = c => !focus || focus.includes(c.k);
    const segmentsPath = lines => {
      ctx.beginPath();
      lines.forEach(([[i0, j0], [i1, j1]]) => {
        ctx.moveTo(gridX(i0), gridY(j0));
        ctx.lineTo(gridX(i1), gridY(j1));
      });
    };

    ctx.save();
    ctx.beginPath();
    ctx.rect(plot.x, plot.y, plot.w, plot.h);
    ctx.clip();
    clusters.forEach(c => {
      const a = shown(c);
      if (a <= 0 || !c.image || !focus || !inFocus(c)) return;
      ctx.globalAlpha = a;
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(c.image, plot.x, plot.y, plot.w, plot.h);
      ctx.globalAlpha = 1;
    });
    clusters.forEach(c => {
      const a = shown(c);
      if (a <= 0 || !c.image) return;
      const dim = inFocus(c) ? 1 : 0.3;
      ctx.strokeStyle = rgba(c.rgb, a * dim);
      ctx.lineWidth = 2;
      segmentsPath(c.lines90);
      ctx.stroke();
    });
    clusters.forEach(c => {
      const a = shown(c);
      if (a <= 0 || !(c.n < MIN_SPOTS || (focus && inFocus(c)))) return;
      ctx.fillStyle = rgba(c.rgb, a * 0.9);
      c.members.forEach(s => {
        ctx.beginPath();
        ctx.arc(toX(s.t), toY(s.depth), narrow ? 1.6 : 2, 0, Math.PI * 2);
        ctx.fill();
      });
    });
    ctx.restore();

    clusters.forEach(c => {
      const a = shown(c) * (inFocus(c) ? 1 : 0.35);
      if (a <= 0) return;
      const x = toX(c.tMean);
      const y = toY(c.depthMean);
      const arm = narrow ? 5 : 6.5;
      const cross = () => {
        ctx.beginPath();
        ctx.moveTo(x - arm, y); ctx.lineTo(x + arm, y);
        ctx.moveTo(x, y - arm); ctx.lineTo(x, y + arm);
        ctx.stroke();
      };
      ctx.lineWidth = 5;
      ctx.strokeStyle = rgba(colours.paper, a);
      cross();
      ctx.lineWidth = 2.25;
      ctx.strokeStyle = rgba(c.rgb, a);
      cross();
      ctx.font = `500 ${fontSize}px ${colours.sans}`;
      ctx.lineWidth = 3;
      ctx.strokeStyle = rgba(colours.paper, a);
      ctx.fillStyle = rgba(colours.ink, a);
      ctx.textAlign = 'left';
      ctx.textBaseline = 'bottom';
      ctx.strokeText(String(c.k), x + arm, y - 2);
      ctx.fillText(String(c.k), x + arm, y - 2);
    });

    // Spot under the pointer
    if (hover && hover.spot) {
      ctx.strokeStyle = rgba(colours.ink, 1);
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(toX(hover.spot.t), toY(hover.spot.depth), 5, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Plot title: the clusters appearing, or the data source
    let title = narrow ? `${ptSpots.length} spots` : `${ptSpots.length} spots, ML thermobarometer`;
    if (focus && !hover) {
      const step = STEPS.find(s => s.clusters === focus);
      title = narrow ? step.title : `${step.clusters.length > 1 ? 'Clusters' : 'Cluster'} ${step.clusters.join(', ')}: ${step.title.toLowerCase()}`;
    }
    ctx.font = `500 ${fontSize + 1}px ${colours.sans}`;
    ctx.fillStyle = ink(1);
    ctx.textAlign = 'right';
    ctx.textBaseline = 'bottom';
    ctx.fillText(title, plot.x + plot.w, plot.y - 8);
  }

  function frame(time) {
    if (!t0) t0 = time;
    now = time - t0;
    draw(now);
    if (now < T_END) {
      frameId = requestAnimationFrame(frame);
    } else {
      now = Infinity;
      draw(now);
    }
  }

  // Plays the animation once (or shows the end state when motion is reduced)
  function start() {
    cancelAnimationFrame(frameId);
    t0 = 0;
    hover = null;
    now = reduceMotion ? Infinity : 0;
    resize();
    if (!reduceMotion) frameId = requestAnimationFrame(frame);
  }

  /* --- Readout: the pixel, spot or cluster under the pointer ------ */

  const ppm = v => Number(v.toPrecision(3)).toLocaleString('en-GB');
  const done = () => now === Infinity;

  const describeCluster = c =>
    `Cluster ${c.k}, ${CLUSTER_ABOUT[c.k]}: ${c.n} spots, centroid ${c.pMean.toFixed(1)} kbar ` +
    `(${Math.round(c.depthMean)} km) and ${Math.round(c.tMean)} °C`;

  const describeSpot = s =>
    `${[s.eruption, s.rock, s.position].filter(Boolean).join(', ')}: ${s.p.toFixed(1)} kbar ` +
    `(${Math.round(s.depth)} km) and ${Math.round(s.t)} °C, cluster ${s.cluster}, ${CLUSTER_ABOUT[s.cluster]}`;

  function showItem(event) {
    if (!done()) return;
    const box = canvas.getBoundingClientRect();
    const px = event.clientX - box.left;
    const py = event.clientY - box.top;
    const { map, plot } = layout;
    hover = null;

    if (px >= map.x && px < map.x + map.w && py >= map.y && py < map.y + map.h) {
      const i = Math.floor(((px - map.x) / map.w) * W);
      const j = Math.floor(((py - map.y) / map.h) * H);
      const n = pixelAt.get(j * W + i);
      if (n !== undefined) {
        const p = pixels[n];
        hover = { pixel: n, cluster: p.cluster };
        readout.textContent = `Tajogaite 2021 crystal: Cr ${ppm(p.ppm[0])} ppm, Sc ${ppm(p.ppm[1])} ppm, ` +
          `Zr ${ppm(p.ppm[2])} ppm, cluster ${p.cluster}, ${CLUSTER_ABOUT[p.cluster]}`;
      }
    } else if (px >= plot.x && px <= plot.x + plot.w && py >= plot.y && py <= plot.y + plot.h) {
      const near = (x, y) => Math.hypot(x - px, y - py);
      const centre = clusters.filter(c => near(toX(c.tMean), toY(c.depthMean)) <= 9)
        .sort((a, b) => near(toX(a.tMean), toY(a.depthMean)) - near(toX(b.tMean), toY(b.depthMean)))[0];
      const focusNow = hover ? [hover.cluster] : null;
      const spot = ptSpots.filter(s => near(toX(s.t), toY(s.depth)) <= 5 && (!focusNow || focusNow.includes(s.cluster)))
        .sort((a, b) => near(toX(a.t), toY(a.depth)) - near(toX(b.t), toY(b.depth)))[0];

      // Inside a 90% contour: the cluster with the highest relative density there
      const i = Math.floor((((px - plot.x) / plot.w) * (PLOT.t1 - PLOT.t0)) / cellT);
      const j = Math.floor((((py - plot.y) / plot.h) * (PLOT.d1 - PLOT.d0)) / cellD);
      const inside = clusters.filter(c => c.grid && c.grid[j * GX + i] >= c.level90)
        .sort((a, b) => b.grid[j * GX + i] / b.level90 - a.grid[j * GX + i] / a.level90)[0];

      if (centre) {
        hover = { cluster: centre.k };
        readout.textContent = describeCluster(centre);
      } else if (spot) {
        hover = { cluster: spot.cluster, spot };
        readout.textContent = describeSpot(spot);
      } else if (inside) {
        hover = { cluster: inside.k };
        readout.textContent = describeCluster(inside);
      }
    }

    if (!hover) readout.textContent = defaultReadout;
    draw(now);
  }

  function clearItem() {
    if (!hover) return;
    hover = null;
    readout.textContent = defaultReadout;
    if (done()) draw(now);
  }

  canvas.addEventListener('pointermove', showItem);
  canvas.addEventListener('pointerdown', showItem);
  canvas.addEventListener('pointerleave', clearItem);
  new ResizeObserver(() => { if (!canvas.closest('[hidden]')) resize(); }).observe(canvas);

  return { start };
}


/* 3. PUBLICATIONS ---------------------------------------------------
   Works on the <li data-type="..."> items in index.html. To add a
   paper, copy an <li> there; nothing needs changing here. */

(function publications() {
  const tools = document.getElementById('pub-tools');
  const list = document.getElementById('pub-list');
  if (!tools || !list) return;

  const input = document.getElementById('pub-search');
  const status = document.getElementById('pub-status');
  const buttons = Array.from(tools.querySelectorAll('[data-filter]'));
  const groups = Array.from(list.querySelectorAll('.pub-year'));
  const items = Array.from(list.querySelectorAll('li'));

  // Searchable text for each item, including its year; accents and
  // curly apostrophes are ignored, so "agreda" finds "Ágreda"
  const fold = s => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[\u2018\u2019]/g, "'").toLowerCase();
  const text = new Map(items.map(li => {
    const year = li.closest('.pub-year').querySelector('h3').textContent;
    return [li, fold(`${year} ${li.textContent}`.replace(/\s+/g, ' '))];
  }));

  let filter = 'all';

  buttons.forEach(button => {
    const type = button.dataset.filter;
    const n = type === 'all' ? items.length : items.filter(li => li.dataset.type === type).length;
    button.querySelector('.count').textContent = String(n);
    button.addEventListener('click', () => {
      filter = type;
      buttons.forEach(b => b.setAttribute('aria-pressed', String(b === button)));
      update();
    });
  });

  input.addEventListener('input', update);

  function update() {
    const terms = fold(input.value).split(/\s+/).filter(Boolean);
    let shown = 0;

    items.forEach(li => {
      const match = (filter === 'all' || li.dataset.type === filter) &&
        terms.every(term => text.get(li).includes(term));
      li.hidden = !match;
      if (match) shown++;
    });

    groups.forEach(group => {
      group.hidden = !group.querySelector('li:not([hidden])');
    });

    if (shown === items.length) {
      status.textContent = `${items.length} publications`;
    } else if (shown > 0) {
      status.textContent = `Showing ${shown} of ${items.length} publications`;
    } else {
      status.textContent = 'No publications match. Try an author surname, a journal or a year.';
    }
  }

  tools.hidden = false;
  update();
})();


/* 4. NAVIGATION ---------------------------------------------------- */

(function navigationState() {
  const links = Array.from(document.querySelectorAll('.nav-links a'));
  const byId = new Map(links.map(a => [a.hash.slice(1), a]));

  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      links.forEach(a => a.removeAttribute('aria-current'));
      const link = byId.get(entry.target.id);
      if (link) link.setAttribute('aria-current', 'true');
    });
  }, { rootMargin: '-40% 0px -55% 0px' });

  document.querySelectorAll('main section[id]').forEach(section => observer.observe(section));
})();


/* 5. PORTRAIT ------------------------------------------------------ */

(function portraitFallback() {
  const img = document.querySelector('.portrait img');
  if (!img) return;
  const markMissing = () => img.closest('.portrait').classList.add('is-missing');
  if (img.complete && img.naturalWidth === 0) markMissing();
  else img.addEventListener('error', markMissing);
})();
