# Maurizio Petrelli: personal website

Plain HTML, CSS and JavaScript. No framework, no build step.

| File          | Contains                                                         |
|---------------|------------------------------------------------------------------|
| `index.html`  | All the text: every section, every publication                   |
| `style.css`   | Layout and colours (basalt and pumice)                           |
| `script.js`   | Hero figures (crystal map, TAS), publication search, nav         |
| `data/cpx-spots.js` | La Palma clinopyroxene spots: trace elements, clusters, ML pressure and temperature |
| `data/cpx-map.js`   | Cr, Sc, Zr and cluster map of a Tajogaite 2021 crystal           |
| `tools/build_data.py` | Rebuilds the two data files from the paper's repository        |
| `favicon.svg` | Browser tab icon                                                 |
| `portrait.jpg`| Portrait in the About section (4:5)                              |
| `lecture.jpg` | Full-width photo between Now and About                           |

## Editing

- **Text:** edit `index.html` directly. Each section is marked with a comment.
- **Publications:** one `<li>` per paper inside its year's `<section class="pub-year">`.
  `data-type` is `article`, `book` or `chapter`. The filter counts update by themselves.
- **Dark bands:** add `dark` to a section's class, e.g. `<section class="section dark" id="books">`.
  Remove it to make the section light again. Funding and Contact are dark by default.
- **Colours:** all in section 1 of `style.css` (light pumice values, then basalt values).
- **Hero figure:** on `<figure id="hero-figure">`, `data-show="map"` or `"tas"` picks the first view;
  `data-alternate="12"` switches view 12 s after each animation. Delete it to switch only with the buttons.
  The figure uses the data of Caracciolo et al. (2026), Nature Communications,
  doi:10.1038/s41467-026-77213-9, from their repository
  (https://github.com/AlbCaracc/Caracciolo_et_al_2026_CumbreVieja):
  - `data/cpx-map.js`: the calibrated map of Tajogaite crystal 5 (their Fig. 5), averaged to 6 µm pixels.
    Only clusters covering at least 5% of the crystal are used (0, 1, 2 and 5; set by `MIN_SHARE`
    in `tools/build_data.py`). Each pixel takes the nearest of their published means on Sc, Ti, V,
    Cr, Mn, Ni, Sr and Zr (log-transformed and standardised over the spots); with all six means,
    93% of the 316 spots fall in their published cluster.
  - `data/cpx-spots.js`: the 316 spot analyses with their clusters, and pressure and temperature
    from the machine-learning clinopyroxene-only thermobarometer of Ágreda-López et al. (2024),
    Computers & Geosciences 193, 105707 (284 spots; 32 microlites have no EMPA analysis).
  - The right panel shows the 196 spots in the four clusters used and draws, for each cluster, a kernel density contour holding 90% of its
    spots and the centroid (mean P and T). The order in which clusters appear is `STEPS`, near the
    top of section 2 of `script.js`.
  - To rebuild the data: `python tools/build_data.py <repository folder> .`

## Publishing on GitHub Pages

1. Create a public repository named `petrelli-m.github.io`.
2. Upload these files and folders, keeping `data/` and `tools/` as folders.
3. Settings → Pages → Build and deployment → Deploy from a branch → `main`, `/ (root)` → Save.
4. When the DNS is ready to switch: Settings → Pages → Custom domain:
   `www.mauriziopetrelli.info` → Save. GitHub adds a `CNAME` file with that name;
   keep it in the repository from then on.
5. At the DNS provider (Aruba), for `mauriziopetrelli.info`:
   - `@` A records: 185.199.108.153, 185.199.109.153, 185.199.110.153, 185.199.111.153
     (remove the old A record)
   - `@` AAAA records (optional): 2606:50c0:8000::153, 2606:50c0:8001::153,
     2606:50c0:8002::153, 2606:50c0:8003::153
   - `www` CNAME: `petrelli-m.github.io` (replaces `ghs.googlehosted.com`)
   - TXT `_github-pages-challenge-petrelli-m`: the code from
     GitHub → Settings (your profile) → Pages → Add a domain
6. When the DNS check in Settings → Pages passes, tick Enforce HTTPS.

The HTML, CSS and SVG pass the W3C Nu HTML Checker with no errors or warnings.
