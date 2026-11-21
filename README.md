# Maurizio Petrelli: personal website

Plain HTML, CSS and JavaScript. No framework, no build step.

| File          | Contains                                                         |
|---------------|------------------------------------------------------------------|
| `index.html`  | All the text: every section, every publication                   |
| `style.css`   | Layout and colours (basalt and pumice)                           |
| `fonts.css`, `fonts/` | Spectral and Schibsted Grotesk, served from this site (see below) |
| `script.js`   | Hero figure (crystal map), publication search, navigation        |
| `data/cpx-spots.js` | La Palma clinopyroxene spots: trace elements, clusters, ML pressure and temperature |
| `data/cpx-map.js`   | Cr, Sc, Zr and cluster map of a Tajogaite 2021 crystal           |
| `tools/build_data.py` | Rebuilds the two data files from the paper's repository        |
| `favicon.svg` | Browser tab icon                                                 |
| `portrait.jpg`| Portrait in the About section (4:5)                              |
| `lecture.jpg` | Lecture photo beside the first item in Now                       |
| `CNAME`       | The custom domain for GitHub Pages: www.mauriziopetrelli.info    |

## Editing

- **Text:** edit `index.html` directly. Each section is marked with a comment.
- **Publications:** one `<li>` per paper inside its year's `<section class="pub-year">`.
  `data-type` is `article`, `book` or `chapter`. The filter counts update by themselves.
- **Dark bands:** add `dark` to a section's class, e.g. `<section class="section dark" id="books">`.
  Remove it to make the section light again. Funding and Contact are dark by default.
- **Colours:** all in section 1 of `style.css` (light pumice values, then basalt values).
- **Type sizes:** six steps, also in section 1 of `style.css` (`--fs-meta` to `--fs-h2`); change one
  value there to resize every element that uses it.
- **Fonts:** Spectral (text and headings) and Schibsted Grotesk (navigation, labels, figure) are
  in `fonts/` and declared in `fonts.css`, so the site loads nothing from Google or other third
  parties. Both are under the SIL Open Font License 1.1 (`fonts/OFL-*.txt`, keep these files).
  `--serif` and `--sans` in section 1 of `style.css` choose where each family is used.
- **After editing `fonts.css`, `style.css`, `script.js`, a data file or a photo:** change the `?v=` value where
  `index.html` links to it (for example `style.css?v=20261121b` → `style.css?v=20261125`). Browsers
  keep copies for 10 minutes; a new value makes them fetch the new file at once.
- **Hero figure:** the crystal map plays once when the page opens (not at all for visitors who ask
  their system to reduce motion).
  The figure uses the data of Caracciolo et al. (2026), Nature Communications,
  doi:10.1038/s41467-026-77213-9, from their repository
  (https://github.com/AlbCaracc/Caracciolo_et_al_2026_CumbreVieja):
  - `data/cpx-map.js`: the calibrated map of Tajogaite crystal 5 (their Fig. 5), averaged to 6 µm pixels.
    Only clusters 0, 2 and 5 are used (`USE_CLUSTERS` in `tools/build_data.py`). Each pixel takes the
    nearest of their published means on Sc, Ti, V, Cr, Mn, Ni, Sr and Zr (log-transformed and
    standardised over the spots); with all six means, 93% of the 316 spots fall in their published
    cluster. Crystal fragments under 6 pixels are dropped and cluster patches under 4 pixels take
    the cluster around them (`MIN_FRAGMENT`, `MIN_PATCH`), so no isolated pixels are shown.
  - `data/cpx-spots.js`: the 316 spot analyses with their clusters, and pressure and temperature
    from the machine-learning clinopyroxene-only thermobarometer of Ágreda-López et al. (2024),
    Computers & Geosciences 193, 105707 (284 spots; 32 microlites have no EMPA analysis).
  - The right panel shows the 149 spots in the three clusters used and draws, for each cluster, a kernel density contour holding 90% of its
    spots and the centroid (mean P and T). Clusters appear in the order 0, 5, 2, set by `STEPS` near
    the top of section 2 of `script.js`.
  - To rebuild the data: `python tools/build_data.py <repository folder> .`

## Publishing on GitHub Pages

1. Create a public repository named `petrelli-m.github.io`.
2. Upload these files and folders, keeping `data/`, `fonts/` and `tools/` as folders.
3. Settings → Pages → Build and deployment → Deploy from a branch → `main`, `/ (root)` → Save.
4. The `CNAME` file sets the custom domain, `www.mauriziopetrelli.info`
   (shown in Settings → Pages → Custom domain). Keep it in the repository.
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
