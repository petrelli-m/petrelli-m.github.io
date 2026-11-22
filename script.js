/* =================================================================
   script.js: Maurizio Petrelli

   No page text lives here: all content is in index.html.
   0. Shared helpers
   1. Hero figures: the crystal map and the projects map, under two tabs
   2. Crystal map and the clusters in pressure–temperature space
   2b. Projects map: REALISE and REALI3SE
   3. Publications: search and filter over the list in index.html
   4. Navigation: underline the section in view
   5. Portrait: show a hint if portrait.jpg is missing
   6. Project news: the latest items of data/news.js, under Now
   7. External links: open in a new tab, with an icon
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


/* 1. HERO FIGURES ---------------------------------------------------
   Once the page has painted, shows the two tabs and plays the figure of
   the selected one (REALISE and REALI3SE at startup); choosing the other
   tab shows its figure and plays its animation. */

(function heroFigures() {
  const tablist = document.querySelector('.figure-tabs');
  const tabs = tablist ? Array.from(tablist.querySelectorAll('[role="tab"]')) : [];
  const panelOf = tab => document.getElementById(tab.getAttribute('aria-controls'));
  const crystal = { canvas: document.getElementById('crystal-map'), readout: document.getElementById('figure-readout') };
  const projects = { canvas: document.getElementById('projects-map'), readout: document.getElementById('projects-readout') };
  const haveCrystal = crystal.canvas && crystal.readout && typeof CPX_SPOTS !== 'undefined' && typeof CPX_MAP !== 'undefined';
  const haveProjects = projects.canvas && projects.readout && typeof PROJECTS !== 'undefined' && typeof LAND !== 'undefined';

  const fontsReady = document.fonts ? document.fonts.ready : Promise.resolve();
  fontsReady.then(() => requestAnimationFrame(() => setTimeout(() => {
    const figures = new Map();
    if (haveProjects) {
      figures.set('tab-projects', createProjectsMap(projects.canvas, projects.readout, projects.readout.textContent, PROJECTS, LAND));
    }
    if (haveCrystal) {
      figures.set('tab-crystal', createCrystalMap(crystal.canvas, crystal.readout, crystal.readout.textContent, CPX_SPOTS, CPX_MAP));
    }
    if (!figures.size || !tabs.length) return;

    // Show one figure, play its animation and stop the other one
    function select(tab, moveFocus) {
      tabs.forEach(t => {
        const on = t === tab;
        t.setAttribute('aria-selected', String(on));
        t.tabIndex = on ? 0 : -1;
        panelOf(t).hidden = !on;
        if (!on && figures.has(t.id)) figures.get(t.id).stop();
      });
      if (moveFocus) tab.focus();
      figures.get(tab.id).start();
    }

    // Only one figure could be drawn: show it, without tabs
    if (figures.size === 1) {
      select(tabs.find(t => figures.has(t.id)), false);
      return;
    }

    // Tabs: click, or arrow keys, Home and End when a tab has focus.
    // The tab marked aria-selected="true" in index.html plays at startup.
    tabs.forEach((tab, i) => {
      tab.addEventListener('click', () => {
        if (tab.getAttribute('aria-selected') !== 'true') select(tab, false);
      });
      tab.addEventListener('keydown', event => {
        const to = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: tabs.length - 1 }[event.key];
        if (to === undefined) return;
        event.preventDefault();
        select(tabs[(to + tabs.length) % tabs.length], true);
      });
    });
    tablist.hidden = false;
    select(tabs.find(t => t.getAttribute('aria-selected') === 'true') || tabs[0], false);
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
  // Shown in the periodic-table tile at the top right of the map
  const ELEMENT_TILE = {
    Cr: { number: 24, name: 'Chromium' },
    Sc: { number: 21, name: 'Scandium' },
    Zr: { number: 40, name: 'Zirconium' }
  };

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

  // For the last c columns of the map, the first row with crystal in it:
  // the element tile sits in this empty corner, clear of the crystal
  const firstRowFromRight = [0];
  for (let c = 1; c <= W; c++) {
    const rows = pixels.filter(p => p.i >= W - c).map(p => p.j);
    firstRowFromRight.push(rows.length ? Math.min(...rows) : H);
  }

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
  const MAP_HOLD = 1800;            // each element map stays this long, in full
  const MAP_FADE = 800;             // cross-fade from one element map to the next
  const T_SC = [T_SCAN + MAP_HOLD, T_SCAN + MAP_HOLD + MAP_FADE];          // to Sc
  const T_ZR = [T_SC[1] + MAP_HOLD, T_SC[1] + MAP_HOLD + MAP_FADE];        // then to Zr
  const T_ASSIGN = T_ZR[1] + MAP_HOLD;  // all pixels fade to their cluster colour together
  const ASSIGN_SPAN = 900;
  const T_STEPS = T_ASSIGN + 1700;  // clusters appear in the plot, core to rim
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
    reserveReadoutSpace();
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
    let title = narrow ? 'LA-ICP-MS map' : 'LA-ICP-MS map, Tajogaite 2021';
    if (clustering) title = narrow ? 'Clusters' : 'Clusters, Tajogaite 2021';
    ctx.font = `500 ${fontSize + 1}px ${colours.sans}`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'bottom';
    ctx.fillStyle = rgba(colours.ink, 1);
    ctx.fillText(title, map.x, map.y - 8);

    // Element shown, as in the periodic table; fades out when clustering starts
    const tileAlpha = easeOut(clamp01(t / 600)) * (1 - assigned(t));
    if (tileAlpha > 0) {
      drawElementTile(tileAlpha, [
        ['Cr', 1 - scMix],
        ['Sc', scMix * (1 - zrMix)],
        ['Zr', zrMix]
      ]);
    }

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

  // Rounded square with atomic number, symbol and name, at the top right
  // of the map; while the map changes element, the old and new cross-fade
  function drawElementTile(alpha, shown) {
    const { map } = layout;
    const cell = map.w / W;
    let size = Math.round(Math.min(48, Math.max(30, map.w * 0.185)));
    const clearBelow = map.y + firstRowFromRight[Math.min(W, Math.ceil(size / cell))] * cell - 3;
    size = Math.max(26, Math.min(size, clearBelow));
    const x = map.x + map.w - size;
    const y = Math.max(0, clearBelow - size);
    const radius = size * 0.14;

    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + size, y, x + size, y + size, radius);
    ctx.arcTo(x + size, y + size, x, y + size, radius);
    ctx.arcTo(x, y + size, x, y, radius);
    ctx.arcTo(x, y, x + size, y, radius);
    ctx.closePath();
    ctx.fillStyle = rgba(colours.paper, 0.92 * alpha);
    ctx.fill();
    ctx.strokeStyle = rgba(colours.ink, 0.7 * alpha);
    ctx.lineWidth = 1;
    ctx.stroke();

    const withName = size >= 40;
    shown.forEach(([symbol, weight]) => {
      if (weight <= 0) return;
      const a = alpha * weight;
      const { number, name } = ELEMENT_TILE[symbol];
      ctx.fillStyle = rgba(colours.muted, a);
      ctx.font = `400 ${Math.round(size * 0.19)}px ${colours.sans}`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText(String(number), x + size * 0.11, y + size * 0.09);
      ctx.fillStyle = rgba(colours.ink, a);
      ctx.font = `600 ${Math.round(size * 0.42)}px ${colours.sans}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(symbol, x + size / 2, y + size * (withName ? 0.54 : 0.6));
      if (withName) {
        ctx.fillStyle = rgba(colours.muted, a);
        ctx.font = `400 ${Math.round(size * 0.155)}px ${colours.sans}`;
        ctx.textBaseline = 'alphabetic';
        ctx.fillText(name, x + size / 2, y + size * 0.9);
      }
    });
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

  const describePixel = p =>
    `Tajogaite 2021 crystal: Cr ${ppm(p.ppm[0])} ppm, Sc ${ppm(p.ppm[1])} ppm, ` +
    `Zr ${ppm(p.ppm[2])} ppm, cluster ${p.cluster}, ${CLUSTER_ABOUT[p.cluster]}`;

  const describeSpot = s =>
    `${[s.eruption, s.rock, s.position].filter(Boolean).join(', ')}: ${s.p.toFixed(1)} kbar ` +
    `(${Math.round(s.depth)} km) and ${Math.round(s.t)} °C, cluster ${s.cluster}, ${CLUSTER_ABOUT[s.cluster]}`;

  // Keep the caption the same height whatever it says: measure the longest
  // texts at the current width and reserve their height, so the figure
  // does not jump when the readout changes from one line to two
  const longestReadouts = [
    ...pixels.map(describePixel),
    ...ptSpots.map(describeSpot),
    ...clusters.map(describeCluster)
  ].sort((a, b) => b.length - a.length).slice(0, 12);

  function reserveReadoutSpace() {
    const width = readout.clientWidth;
    if (!width) return;
    const probe = readout.cloneNode(false);
    probe.removeAttribute('id');
    probe.setAttribute('aria-hidden', 'true');
    probe.style.cssText = `position: absolute; visibility: hidden; width: ${width}px; min-height: 0`;
    readout.after(probe);
    let tallest = 0;
    [defaultReadout, ...longestReadouts].forEach(text => {
      probe.textContent = text;
      tallest = Math.max(tallest, probe.offsetHeight);
    });
    probe.remove();
    readout.style.minHeight = `${tallest}px`;
  }

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
        readout.textContent = describePixel(p);
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

  reserveReadoutSpace();
  return { start, stop: () => cancelAnimationFrame(frameId) };
}


/* 2b. PROJECTS MAP -------------------------------------------------
   REALISE and REALI3SE: logos, titles, EU contributions and consortia.
   The map opens on Europe and draws the REALISE network from Perugia,
   then zooms out to draw REALI3SE and its partners in the Americas and
   Africa. Filled dots are beneficiaries, rings associated partners; a
   place in both projects is split, REALISE left and REALI3SE right.
   Pointing at a place lists its organisations, pointing at a logo gives
   the project. Data: data/projects.js (editable) and data/land.js. */

function createProjectsMap(canvas, readout, defaultReadout, data, land) {
  const ctx = canvas.getContext('2d');
  const rad = d => (d * Math.PI) / 180;
  const mercator = (lon, lat) => [rad(lon), Math.log(Math.tan(Math.PI / 4 + rad(lat) / 2))];
  const ROLE_RANK = { coordinator: 3, beneficiary: 2, partner: 1 };

  /* --- Projects and places ---------------------------------------- */

  const projects = data.projects.map((p, n) => {
    const image = new Image();
    image.decoding = 'async';
    image.src = p.logo;
    image.addEventListener('load', () => draw(now));
    const organisations = data.sites.flatMap(s => s.organisations
      .filter(o => o[p.id]).map(o => ({ role: o[p.id], country: s.country })));
    const years = p.period.match(/\d{4}/g);
    return {
      ...p, n, image,
      rgb: hexToRgb(p.colour),
      side: n === 0 ? 1 : -1,                                  // arcs bend one way per project
      years: years ? `${years[0]}–${years[years.length - 1]}` : p.period,
      beneficiaries: organisations.filter(o => o.role !== 'partner').length,
      partners: organisations.filter(o => o.role === 'partner').length,
      countries: new Set(organisations.map(o => o.country)).size
    };
  });

  const sites = data.sites.map(s => {
    const [x, y] = mercator(s.lon, s.lat);
    const role = {};
    projects.forEach(p => {
      role[p.id] = s.organisations.map(o => o[p.id]).filter(Boolean)
        .sort((a, b) => ROLE_RANK[b] - ROLE_RANK[a])[0] || null;
    });
    return { ...s, x, y, role };
  });
  const hub = sites.find(s => s.role[projects[0].id] === 'coordinator') || sites[0];

  // Land dots: column indices of land in each row (data/land.js)
  const landRows = land.rows.map(row => {
    const cols = [];
    let c = 0;
    row.split(' ').filter(Boolean).map(Number).forEach((n, k) => {
      if (k % 2) for (let i = 0; i < n; i++) cols.push(c + i);
      c += n;
    });
    return cols;
  });
  const rowStep = (land.step * Math.sqrt(3)) / 2;

  // Views: Europe for REALISE (places within 30° W–45° E), everything for REALI3SE
  const box = list => list.reduce((b, s) => [
    Math.min(b[0], s.x), Math.min(b[1], s.y), Math.max(b[2], s.x), Math.max(b[3], s.y)
  ], [Infinity, Infinity, -Infinity, -Infinity]);
  const europeBox = box(sites.filter(s => s.role[projects[0].id] && s.lon > -30 && s.lon < 45));
  const worldBox = box(sites);


  /* --- Timeline (ms) ---------------------------------------------- */

  const T_LAND = 700;               // land fades in
  const T_BLOCK = [200, 4900];      // each project's text block appears
  const T_NET = [800, 5500];        // each project's arcs start
  const NET_SPAN = [2400, 2600];
  const T_ZOOM = [3400, 5300];      // Europe to world
  const COUNT_SPAN = 1800;          // EU contribution counts up
  const T_END = 8600;

  // Arcs from the hub, nearest first; long arcs take longer
  const arcs = projects.flatMap(p => {
    const targets = sites.filter(s => s !== hub && s.role[p.id])
      .map(s => ({ s, d: Math.hypot(s.x - hub.x, s.y - hub.y) }))
      .sort((a, b) => a.d - b.d);
    const span = NET_SPAN[p.n];
    return targets.map(({ s, d }, k) => {
      const duration = 420 + 700 * clamp01(d / 2);
      const start = T_NET[p.n] + (targets.length > 1 ? k * (span - duration) / (targets.length - 1) : 0);
      return { p, s, start: Math.max(T_NET[p.n], start), end: Math.max(T_NET[p.n], start) + duration };
    });
  });
  const arrival = new Map(arcs.map(a => [`${a.p.id}|${a.s.place}`, a.end]));
  const arrivedAt = (p, s, t) => clamp01((t - (s === hub ? T_NET[p.n] - 300
    : arrival.get(`${p.id}|${s.place}`) ?? Infinity)) / 260);


  /* --- Drawing ---------------------------------------------------- */

  const landLayer = document.createElement('canvas');
  const landCtx = landLayer.getContext('2d');
  let landKey = '';

  let size = { width: 0, height: 0, ratio: 1 };
  let layout = null;
  let colours = null;
  let views = null;
  let hover = null;
  let frameId = 0;
  let t0 = 0;
  let now = Infinity;

  function fit(b, rect, pad, maxScale) {
    const scale = Math.min((rect.w - 2 * pad) / Math.max(b[2] - b[0], 1e-3),
      (rect.h - 2 * pad) / Math.max(b[3] - b[1], 1e-3), maxScale);
    return { cx: (b[0] + b[2]) / 2, cy: (b[1] + b[3]) / 2, scale };
  }

  const TITLE_SIZE = 13;            // project titles, desktop layout only
  const TITLE_LINE = 16;

  function wrap(text, maxWidth, maxLines) {
    const lines = [];
    let line = '';
    text.split(' ').forEach(word => {
      const next = line ? `${line} ${word}` : word;
      if (ctx.measureText(next).width <= maxWidth || !line) line = next;
      else { lines.push(line); line = word; }
    });
    if (line) lines.push(line);
    return lines.length <= maxLines ? lines : null;
  }

  function resize() {
    size = fitCanvas(canvas);
    colours = themeColours(canvas);
    const { width, height } = size;
    const narrow = width < 480;
    let map;
    const blocks = [];

    if (narrow) {
      // Two columns above the map: logo, EU contribution, consortium
      const colW = (width - 12) / 2;
      const cardH = Math.round((colW - 12) / 3.9 + 12);
      const rowH = cardH + 52;
      projects.forEach(p => blocks.push({ x: p.n * (colW + 12), y: 0, w: colW, cardH, title: null }));
      map = { x: 0, y: rowH + 6, w: width, h: Math.max(10, height - rowH - 6) };
    } else {
      // Info column on the left, map on the right
      const infoW = Math.round(width * 0.36);
      const cardH = Math.round((infoW - 16) / 3.9 + 16);
      ctx.font = `italic 300 ${TITLE_SIZE}px ${colours.serif}`;
      const titles = projects.map(p => wrap(p.title, infoW, 5));
      // Block height: card, title lines, EU contribution and two lines of facts
      const blockH = lines => cardH + (lines ? 10 + lines.length * TITLE_LINE : 0) + 26 + 8 + 42;
      const fits = titles.every(Boolean) && blockH(titles[0]) + blockH(titles[1]) + 20 <= height - 28;
      let y = 0;
      projects.forEach(p => {
        const title = fits ? titles[p.n] : null;
        blocks.push({ x: 0, y, w: infoW, cardH, title });
        y += blockH(title) + 20;
      });
      map = { x: infoW + 22, y: 0, w: width - infoW - 22, h: height };
    }

    layout = { narrow, map, blocks };
    const pad = narrow ? 14 : 26;
    views = {
      europe: fit(europeBox, map, pad, map.w / rad(44)),
      world: fit(worldBox, map, pad, Infinity)
    };
    landKey = '';
    reserveReadoutSpace();
    draw(now);
  }

  function viewAt(t) {
    const k = clamp01((t - T_ZOOM[0]) / (T_ZOOM[1] - T_ZOOM[0]));
    const e = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;   // ease in and out
    const a = views.europe;
    const b = views.world;
    return { cx: lerp(a.cx, b.cx, e), cy: lerp(a.cy, b.cy, e), scale: Math.exp(lerp(Math.log(a.scale), Math.log(b.scale), e)) };
  }

  const toScreen = (view, x, y) => [
    layout.map.x + layout.map.w / 2 + (x - view.cx) * view.scale,
    layout.map.y + layout.map.h / 2 - (y - view.cy) * view.scale
  ];

  // Land as dots, redrawn only when the view changes
  function drawLand(view, alpha) {
    const { width, height, ratio } = size;
    const key = `${view.cx.toFixed(5)}|${view.cy.toFixed(5)}|${view.scale.toFixed(2)}|${width}|${height}`;
    if (key !== landKey) {
      landKey = key;
      landLayer.width = canvas.width;
      landLayer.height = canvas.height;
      landCtx.setTransform(ratio, 0, 0, ratio, 0, 0);
      landCtx.clearRect(0, 0, width, height);
      const { map } = layout;
      const spacing = land.step * view.scale;
      const stride = spacing < 2.6 ? 2 : 1;                     // thin out when zoomed far out
      const dot = Math.max(0.6, Math.min(2.6, spacing * stride * 0.3));
      landCtx.fillStyle = rgba(colours.muted, 0.42);
      landCtx.beginPath();
      landRows.forEach((cols, r) => {
        if (r % stride) return;
        const [, sy] = toScreen(view, 0, land.yTop - r * rowStep);
        if (sy < map.y - 3 || sy > map.y + map.h + 3) return;
        const shift = r % 2 ? land.step / 2 : 0;
        cols.forEach(c => {
          if (c % stride) return;
          const [sx] = toScreen(view, land.x0 + shift + c * land.step, 0);
          if (sx < map.x - 3 || sx > map.x + map.w + 3) return;
          if (dot > 1.9) {
            landCtx.moveTo(sx + dot, sy);
            landCtx.arc(sx, sy, dot, 0, 2 * Math.PI);
          } else {
            landCtx.rect(sx - dot, sy - dot, 2 * dot, 2 * dot);
          }
        });
      });
      landCtx.fill();
    }
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = alpha;
    ctx.drawImage(landLayer, 0, 0);
    ctx.restore();
  }

  // Quadratic arc from the hub, bent to one side; points up to fraction f
  function arcPoints(view, p, s, f) {
    const [x0, y0] = toScreen(view, hub.x, hub.y);
    const [x1, y1] = toScreen(view, s.x, s.y);
    const dx = x1 - x0;
    const dy = y1 - y0;
    const len = Math.hypot(dx, dy) || 1;
    let nx = -dy / len;
    let ny = dx / len;
    if (ny > 0) { nx = -nx; ny = -ny; }                          // bend upwards first
    const bend = len * 0.2 * p.side;
    const cx = (x0 + x1) / 2 + nx * bend;
    const cy = (y0 + y1) / 2 + ny * bend;
    const steps = Math.max(8, Math.round(len / 6));
    const points = [];
    for (let i = 0; i <= steps * f; i++) {
      const u = i / steps;
      points.push([(1 - u) * (1 - u) * x0 + 2 * (1 - u) * u * cx + u * u * x1,
        (1 - u) * (1 - u) * y0 + 2 * (1 - u) * u * cy + u * u * y1]);
    }
    return points;
  }

  function drawArcs(view, t) {
    const focus = hover && hover.site ? hover.site : null;
    arcs.forEach(a => {
      const f = easeOut(clamp01((t - a.start) / (a.end - a.start)));
      if (f <= 0) return;
      const points = arcPoints(view, a.p, a.s, f);
      if (points.length < 2) return;
      const dim = focus && focus !== a.s ? 0.25 : 1;
      ctx.strokeStyle = rgba(a.p.rgb, (focus === a.s ? 0.95 : 0.62) * dim);
      ctx.lineWidth = focus === a.s ? 1.8 : 1.15;
      ctx.beginPath();
      points.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.stroke();
      if (f < 1) {                                                // travelling head
        const [x, y] = points[points.length - 1];
        ctx.fillStyle = rgba(a.p.rgb, 0.35);
        ctx.beginPath(); ctx.arc(x, y, 4.5, 0, 2 * Math.PI); ctx.fill();
        ctx.fillStyle = rgba(a.p.rgb, 1);
        ctx.beginPath(); ctx.arc(x, y, 1.8, 0, 2 * Math.PI); ctx.fill();
      }
    });
  }

  // One mark per project: filled (beneficiary) or ring (partner), as a
  // whole dot or as the left or right half when the place is in both
  function drawMark(x, y, r, p, role, half, alpha) {
    if (r < 1) return;
    const [a0, a1] = half === 'left' ? [Math.PI / 2, 1.5 * Math.PI]
      : half === 'right' ? [-Math.PI / 2, Math.PI / 2] : [0, 2 * Math.PI];
    ctx.beginPath();
    if (role === 'partner') {
      ctx.arc(x, y, r - 0.8, a0, a1);
      ctx.strokeStyle = rgba(p.rgb, alpha);
      ctx.lineWidth = 1.6;
      ctx.stroke();
    } else {
      if (half) ctx.moveTo(x, y);
      ctx.arc(x, y, r, a0, a1);
      ctx.closePath();
      ctx.fillStyle = rgba(p.rgb, alpha);
      ctx.fill();
    }
  }

  function drawSites(view, t, fontSize) {
    const { map, narrow } = layout;
    const r = narrow ? 3.4 : 4.2;
    sites.forEach(s => {
      const shown = projects.map(p => (s.role[p.id] ? arrivedAt(p, s, t) : 0));
      const scale = Math.max(...shown);
      if (scale <= 0) return;
      const [x, y] = toScreen(view, s.x, s.y);
      if (x < map.x - 10 || x > map.x + map.w + 10 || y < map.y - 10 || y > map.y + map.h + 10) return;
      const both = shown[0] > 0 && shown[1] > 0;
      const dim = hover && hover.site && hover.site !== s ? 0.45 : 1;
      const rr = (s === hub ? r * 1.45 : r) * (hover && hover.site === s ? 1.35 : 1);

      // Dark halo so the mark stands out over land and arcs
      ctx.fillStyle = rgba(colours.paper, 0.85);
      ctx.beginPath(); ctx.arc(x, y, rr * easeOut(scale) + 1.6, 0, 2 * Math.PI); ctx.fill();
      projects.forEach((p, n) => {
        if (shown[n] <= 0) return;
        drawMark(x, y, rr * easeOut(shown[n]), p, s.role[p.id], both ? (n === 0 ? 'left' : 'right') : null, dim);
      });

      if (s === hub) {                                            // coordinator: a ring that breathes
        const phase = Number.isFinite(t) ? (t % 1800) / 1800 : 1;
        ctx.strokeStyle = rgba(colours.ink, (Number.isFinite(t) ? 0.5 * (1 - phase) : 0.35) * dim);
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(x, y, rr + 3 + (Number.isFinite(t) ? 9 * phase : 3), 0, 2 * Math.PI); ctx.stroke();
      }

      if (s.label && scale > 0.5) {
        ctx.font = `${s === hub ? 500 : 400} ${fontSize}px ${colours.sans}`;
        ctx.fillStyle = rgba(s === hub ? colours.ink : colours.muted, dim * clamp01((scale - 0.5) * 2));
        const right = x + rr + 6 + ctx.measureText(s.label).width < map.x + map.w;
        const lx = right ? x + rr + 6 : x - rr - 6;
        ctx.textAlign = right ? 'left' : 'right';
        ctx.textBaseline = 'middle';
        ctx.strokeStyle = rgba(colours.paper, 0.85 * dim);         // dark edge over the land dots
        ctx.lineWidth = 3;
        ctx.lineJoin = 'round';
        ctx.strokeText(s.label, lx, y);
        ctx.fillText(s.label, lx, y);
      }
    });
  }

  function roundedRect(x, y, w, h, radius) {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + w, y, x + w, y + h, radius);
    ctx.arcTo(x + w, y + h, x, y + h, radius);
    ctx.arcTo(x, y + h, x, y, radius);
    ctx.arcTo(x, y, x + w, y, radius);
    ctx.closePath();
  }

  const millions = v => `€${(v / 1e6).toFixed(2)} million`;

  // Logo on a white card, title, EU contribution counting up, consortium
  function drawBlock(p, b, t, fontSize) {
    const { narrow } = layout;
    const k = easeOut(clamp01((t - T_BLOCK[p.n]) / 600));
    if (k <= 0) return;
    const lift = (1 - k) * 10;
    const focused = hover && hover.project === p;

    ctx.save();
    ctx.globalAlpha = k;
    roundedRect(b.x, b.y + lift, b.w, b.cardH, 5);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    if (focused) {
      ctx.strokeStyle = rgba(p.rgb, 1);
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    if (p.image.complete && p.image.naturalWidth) {
      const pad = narrow ? 6 : 8;
      const w = b.w - 2 * pad;
      const h = Math.min(b.cardH - 2 * pad, (w * p.image.naturalHeight) / p.image.naturalWidth);
      const iw = (h * p.image.naturalWidth) / p.image.naturalHeight;
      ctx.drawImage(p.image, b.x + (b.w - iw) / 2, b.y + lift + (b.cardH - h) / 2, iw, h);
    }

    let y = b.y + lift + b.cardH;
    if (b.title) {
      ctx.font = `italic 300 ${TITLE_SIZE}px ${colours.serif}`;
      ctx.fillStyle = rgba(colours.ink, 0.92);
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
      y += 10;
      b.title.forEach(line => { y += TITLE_LINE; ctx.fillText(line, b.x, y); });
    }

    // EU contribution, counting up
    const count = easeOut(clamp01((t - T_NET[p.n]) / COUNT_SPAN));
    const budgetSize = narrow ? 19 : 26;
    ctx.font = `300 ${budgetSize}px ${colours.serif}`;
    ctx.fillStyle = rgba(colours.ink, 1);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    y += budgetSize + (narrow ? 6 : 8);
    ctx.fillText(millions(p.contribution * count), b.x, y);
    ctx.fillStyle = rgba(p.rgb, 1);
    ctx.fillRect(b.x, y + 6, Math.min(b.w, narrow ? 28 : 40) * count, 2);

    // Consortium, once the count is done
    const facts = clamp01((t - T_NET[p.n] - COUNT_SPAN + 300) / 500);
    ctx.globalAlpha = k * facts;
    ctx.font = `400 ${fontSize}px ${colours.sans}`;
    ctx.fillStyle = rgba(colours.muted, 1);
    const consortium = `${p.beneficiaries} beneficiaries, ${p.partners} partners, ${p.countries} countries`;
    if (narrow) {
      ctx.fillText(`${p.beneficiaries + p.partners} organisations, ${p.countries} countries`, b.x, y + 22);
    } else {
      ctx.fillText(`EU contribution, ${p.years}`, b.x, y + 22);
      ctx.fillStyle = rgba(colours.ink, 1);
      ctx.fillText(consortium, b.x, y + 38);
    }
    ctx.restore();
    b.box = { x: b.x, y: b.y, w: b.w, h: y + 42 - b.y };
  }

  // EU emblem (12 gold stars on blue) with the funding statement
  function drawEmblem(x, y, h, fontSize, alpha) {
    const w = h * 1.5;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = '#003399';
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = '#FFCC00';
    for (let i = 0; i < 12; i++) {
      const a = (i * Math.PI) / 6;
      const sx = x + w / 2 + Math.sin(a) * h / 3;
      const sy = y + h / 2 - Math.cos(a) * h / 3;
      const outer = h / 18;
      ctx.beginPath();
      for (let j = 0; j < 10; j++) {
        const rr = j % 2 ? outer * 0.382 : outer;
        const b = -Math.PI / 2 + (j * Math.PI) / 5;
        ctx[j ? 'lineTo' : 'moveTo'](sx + Math.cos(b) * rr, sy + Math.sin(b) * rr);
      }
      ctx.closePath();
      ctx.fill();
    }
    ctx.font = `400 ${fontSize}px ${colours.sans}`;
    ctx.fillStyle = rgba(colours.ink, 1);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText('Funded by the European Union', x + w + 7, y + h / 2);
    ctx.restore();
  }

  // Key to the marks, on a dark backing in the map's lower left corner
  function drawLegend(x, y, fontSize, alpha) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.font = `400 ${fontSize}px ${colours.sans}`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    const w = 48 + ctx.measureText('beneficiary').width + ctx.measureText('associated partner').width;
    ctx.fillStyle = rgba(colours.paper, 0.85);
    ctx.fillRect(x - 2, y - 9, w, 18);
    drawMark(x + 4, y, 4, { rgb: colours.muted }, 'beneficiary', null, 1);
    ctx.fillStyle = rgba(colours.muted, 1);
    ctx.fillText('beneficiary', x + 13, y);
    const x2 = x + 22 + ctx.measureText('beneficiary').width;
    drawMark(x2 + 4, y, 4, { rgb: colours.muted }, 'partner', null, 1);
    ctx.fillStyle = rgba(colours.muted, 1);
    ctx.fillText('associated partner', x2 + 13, y);
    ctx.restore();
  }

  function draw(t) {
    const { width, height, ratio } = size;
    if (!layout || width < 20) return;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, width, height);
    const { map, narrow, blocks } = layout;
    const fontSize = narrow ? 10 : 11;
    const view = viewAt(t);

    ctx.save();
    ctx.beginPath();
    ctx.rect(map.x, map.y, map.w, map.h);
    ctx.clip();
    drawLand(view, easeOut(clamp01(t / T_LAND)));
    drawArcs(view, t);
    drawSites(view, t, fontSize);
    ctx.restore();

    projects.forEach((p, n) => drawBlock(p, blocks[n], t, fontSize));

    const legendAlpha = clamp01((t - T_NET[0]) / 600);
    drawLegend(map.x + 4, map.y + map.h - 11, fontSize, legendAlpha);
    if (!narrow) drawEmblem(0, height - 20, 18, fontSize, legendAlpha);
  }


  /* --- Animation -------------------------------------------------- */

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
    readout.textContent = defaultReadout;
    now = reduceMotion ? Infinity : 0;
    resize();
    if (!reduceMotion) frameId = requestAnimationFrame(frame);
  }

  function stop() {
    cancelAnimationFrame(frameId);
  }


  /* --- Readout: the place or project under the pointer ------------ */

  const ROLE_WORD = { coordinator: 'coordinator', beneficiary: 'beneficiary', partner: 'associated partner' };

  function describeRoles(o) {
    const roles = projects.filter(p => o[p.id]);
    if (roles.length > 1 && roles.every(p => o[p.id] === o[roles[0].id])) {
      const role = o[roles[0].id];
      return `${ROLE_WORD[role]} ${role === 'coordinator' ? 'of' : 'in'} ${roles.map(p => p.id).join(' and ')}`;
    }
    return roles.map(p => `${p.id} ${ROLE_WORD[o[p.id]]}`).join(', ');
  }

  const describeSite = s => `${s.place}, ${s.country}. ` +
    s.organisations.map(o => `${o.name}: ${describeRoles(o)}`).join('; ');

  const describeProject = p => `${p.id}, ${p.action}: ${p.title}. ${p.period}` +
    `${p.people ? `, ${p.people}` : ''}, EU contribution €${p.contribution.toLocaleString('en-GB', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}.`;

  // Keep the caption the same height whatever it says
  const longestReadouts = [...sites.map(describeSite), ...projects.map(describeProject)]
    .sort((a, b) => b.length - a.length).slice(0, 6);

  function reserveReadoutSpace() {
    const width = readout.clientWidth;
    if (!width) return;
    const probe = readout.cloneNode(false);
    probe.removeAttribute('id');
    probe.setAttribute('aria-hidden', 'true');
    probe.style.cssText = `position: absolute; visibility: hidden; width: ${width}px; min-height: 0`;
    readout.after(probe);
    let tallest = 0;
    [defaultReadout, ...longestReadouts].forEach(text => {
      probe.textContent = text;
      tallest = Math.max(tallest, probe.offsetHeight);
    });
    probe.remove();
    readout.style.minHeight = `${tallest}px`;
  }

  function showItem(event) {
    if (now !== Infinity) return;
    const box = canvas.getBoundingClientRect();
    const px = event.clientX - box.left;
    const py = event.clientY - box.top;
    const view = viewAt(now);
    hover = null;

    const near = sites.map(s => {
      const [x, y] = toScreen(view, s.x, s.y);
      return { s, d: Math.hypot(x - px, y - py) };
    }).filter(n => n.d <= 9).sort((a, b) => a.d - b.d)[0];
    const block = layout.blocks.find(b => b.box && px >= b.box.x && px <= b.box.x + b.box.w &&
      py >= b.box.y && py <= b.box.y + b.box.h);

    if (near) {
      hover = { site: near.s };
      readout.textContent = describeSite(near.s);
    } else if (block) {
      const p = projects[layout.blocks.indexOf(block)];
      hover = { project: p };
      readout.textContent = describeProject(p);
    }
    if (!hover) readout.textContent = defaultReadout;
    draw(now);
  }

  function clearItem() {
    if (!hover) return;
    hover = null;
    readout.textContent = defaultReadout;
    if (now === Infinity) draw(now);
  }

  canvas.addEventListener('pointermove', showItem);
  canvas.addEventListener('pointerdown', showItem);
  canvas.addEventListener('pointerleave', clearItem);
  new ResizeObserver(() => { if (!canvas.closest('[hidden]')) resize(); }).observe(canvas);

  reserveReadoutSpace();
  return { start, stop };
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

  // Each word typed must match the start of a word in the entry, so
  // "nature" finds "Nature Communications" but not "signature"
  const escape = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  function update() {
    const terms = fold(input.value).split(/\s+/).filter(Boolean)
      .map(term => new RegExp(`(^|[^a-z0-9])${escape(term)}`));
    let shown = 0;

    items.forEach(li => {
      const match = (filter === 'all' || li.dataset.type === filter) &&
        terms.every(term => term.test(text.get(li)));
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


/* 6. PROJECT NEWS ---------------------------------------------------
   Lists the newest items of data/news.js, which GitHub copies every
   morning from the REALISE and REALI3SE websites. If the file is missing
   or empty, the block stays hidden. */

(function projectNews() {
  const NEWS_SHOWN = 4;
  const box = document.getElementById('project-news');
  if (!box || typeof PROJECT_NEWS === 'undefined' || PROJECT_NEWS.length === 0) return;
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const list = box.querySelector('ul');

  PROJECT_NEWS.slice(0, NEWS_SHOWN).forEach(item => {
    if (!/^https:\/\//.test(item.url)) return;
    const [year, month, day] = item.date.split('-').map(Number);

    const time = document.createElement('time');
    time.className = 'num';
    time.dateTime = item.date;
    time.textContent = `${day} ${MONTHS[month - 1]} ${year}`;

    const link = document.createElement('a');
    link.href = item.url;
    link.textContent = item.title;

    const project = document.createElement('span');
    project.className = 'project';
    project.textContent = item.project;

    const li = document.createElement('li');
    li.append(time, link, project);
    list.append(li);
  });

  box.hidden = list.children.length === 0;
})();


/* 7. EXTERNAL LINKS -------------------------------------------------
   Every link to another website opens in a new tab and gets a small icon
   after its last word (".external-tail" in style.css). Screen readers
   announce it with the note "Opens in a new tab" at the end of index.html.
   Links within the page, email and phone links are left as they are.
   Runs after section 6, so the project news links are included. */

(function externalLinks() {
  const note = document.getElementById('new-tab-note');

  // Wrap the last word of the link's text, so the icon stays beside it
  function addIcon(link) {
    const walker = document.createTreeWalker(link, NodeFilter.SHOW_TEXT);
    let last = null;
    while (walker.nextNode()) {
      if (walker.currentNode.textContent.trim()) last = walker.currentNode;
    }
    if (!last) return;
    const text = last.textContent.replace(/\s+$/, '');
    const cut = text.search(/\S+$/);
    const tail = document.createElement('span');
    tail.className = 'external-tail';
    tail.textContent = text.slice(cut);
    if (tail.textContent.length > 30) tail.classList.add('long');  // e.g. a long DOI: let it wrap
    last.textContent = text.slice(0, cut);
    last.after(tail);
  }

  document.querySelectorAll('a[href]').forEach(link => {
    if (!/^https?:$/.test(link.protocol) || link.hostname === location.hostname) return;
    link.target = '_blank';
    link.relList.add('noopener');
    link.classList.add('external');
    if (note) link.setAttribute('aria-describedby', note.id);
    addIcon(link);
  });
})();
