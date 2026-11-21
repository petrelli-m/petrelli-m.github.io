"""Build data/cpx-spots.js and data/cpx-map.js for the hero figure.

Source: the repository of Caracciolo et al. (2026), Nature Communications,
https://github.com/AlbCaracc/Caracciolo_et_al_2026_CumbreVieja

Usage:
    python tools/build_data.py <path to that repository> <path to this site>

Needs numpy, pandas, scipy and openpyxl.
"""

import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd
from scipy import ndimage

REPO = Path(sys.argv[1])
SITE = Path(sys.argv[2])

WORKBOOK = REPO / 'Caracciolo et al_LaPalma_SupplementData1-11.xlsx'
MAP_DIR = (REPO / 'Maps_SingleSpots_LaPalma/2021LaPalma/Maps/118537_cpx5'
           / 'export_calibrated 1_118537-cpx5/time00000_level00000')

ELEMENTS = ['Sc', 'Ti', 'V', 'Cr', 'Mn', 'Ni', 'Sr', 'Zr']   # clustering elements
SHOWN = ['Cr', 'Sc', 'Zr']                                    # elements drawn on the map
CHANNEL = {'Ca': 'Ca _42Ca_', 'Sc': 'Sc _45Sc_', 'Ti': 'Ti _47Ti_', 'V': 'V _51V_', 'Cr': 'Cr _52Cr_',
           'Mn': 'Mn _55Mn_', 'Ni': 'Ni _60Ni_', 'Sr': 'Sr _88Sr_', 'Zr': 'Zr _90Zr_'}
CA_BACKGROUND = 1e5          # as in the paper's notebooks: Ca below this is not crystal
MICRONS = 3                  # map pixel size
BLOCK = 2                    # average 2 × 2 pixels: 6 µm pixels on the page
MIN_SHARE = 0.05             # clusters covering less of the crystal than this are not used
# Line separating the attached small grain (upper left) from the main crystal,
# in map pixels (x, y): only pixels to the lower right are kept
CUT = (82, 40, 33, 102)


def js_value(v):
    if v is None:
        return 'null'
    if isinstance(v, str):
        return json.dumps(v, ensure_ascii=False)
    if isinstance(v, float) and v.is_integer() and abs(v) < 10:
        return f'{v:.1f}'
    return str(v)


def ppm(v):
    """Concentration as written in the data files."""
    if isinstance(v, str) or pd.isna(v):
        return None
    return round(float(v)) if v >= 10 else round(float(v), 1)


# --- Spots: trace elements (SDT4) joined to ML pressure and temperature (SDT2)

empa = pd.read_excel(WORKBOOK, sheet_name='Supplementary Data 2_Cpx Empa', header=3)
laser = pd.read_excel(WORKBOOK, sheet_name='Supplementary Data 4_Cpx LA', header=3)
PT = ['P (kbar)', '16_Percentile - P (kbar)', '84_Percentile - P (kbar)',
      'T (C)', '16_Percentile - T (C)', '84_Percentile - T (C)']
spots = laser.merge(empa.dropna(subset=['LA-ICP-MS_#'])[['LA-ICP-MS_#', 'Mg#'] + PT],
                    on='LA-ICP-MS_#', how='left', validate='one_to_one')
paired = spots['Cpx EMPA Mg#'].notna() | spots['Mg#'].notna()
assert np.allclose(spots.loc[paired, 'Cpx EMPA Mg#'], spots.loc[paired, 'Mg#']), 'EMPA and LA spots do not match'

ORDER = {'El Charco 1712': 0, 'Teneguia 1971': 1, 'Tajogaite 2021': 2}
spots = spots.assign(order=spots['Eruption'].map(ORDER)).sort_values(['order', 'LA-ICP-MS_#'], kind='stable')

rows = []
for _, r in spots.iterrows():
    eruption = 'Teneguía 1971' if r['Eruption'] == 'Teneguia 1971' else r['Eruption']
    lower = lambda v: None if pd.isna(v) else str(v).strip().lower()
    rounded = lambda v, d: None if pd.isna(v) else round(float(v), d)
    rows.append([eruption, lower(r['Rock']), lower(r['Textural position']), int(r['Cluster'])]
                + [ppm(r[e]) for e in ELEMENTS]
                + [rounded(r[c], 2) for c in PT[:3]] + [rounded(r[c], 1) for c in PT[3:]])

(SITE / 'data/cpx-spots.js').write_text('''/* =================================================================
   data/cpx-spots.js  (built by tools/build_data.py)
   Clinopyroxene single-spot analyses from La Palma (Canary Islands):
   316 LA-ICP-MS spots from the El Charco 1712, Teneguía 1971 and
   Tajogaite 2021 eruptions, with the k-means cluster (0–5) published in
   Caracciolo A., Ubide T., Ágreda-López M., et al., Petrelli M. (2026).
   Recurrent evacuation of mantle mush in ocean islands revealed by
   clinopyroxene from La Palma. Nature Communications 17, 9362.
   https://doi.org/10.1038/s41467-026-77213-9
   (Supplementary Data 4, joined to Supplementary Data 2 on the
   LA-ICP-MS_# helper column.)

   One row per spot:
     eruption, rock, textural position, cluster,
     Sc, Ti, V, Cr, Mn, Ni, Sr, Zr (ppm; null = below detection limit),
     P, P 16th percentile, P 84th percentile (kbar),
     T, T 16th percentile, T 84th percentile (°C).
   P and T come from the machine-learning clinopyroxene-only
   thermobarometer of Ágreda-López M., et al. (2024), Computers &
   Geosciences 193, 105707, applied to the EMPA analysis of the same
   spot: the median of 1000 Monte Carlo runs and its 16th–84th
   percentiles. null = no EMPA analysis for that spot (32 microlites).
   ================================================================= */

const CPX_SPOTS = {
  elements: ''' + json.dumps(ELEMENTS) + ''',
  rows: [
''' + ',\n'.join('    [' + ', '.join(js_value(v) for v in r) + ']' for r in rows) + '\n  ]\n};\n', encoding='utf-8')


# --- Cluster means of the spots: log10 ppm, standardised over the 316 spots

values = spots[ELEMENTS].apply(pd.to_numeric, errors='coerce').to_numpy(float)
floor = np.nanmin(np.where(values > 0, values, np.nan), axis=0) / 2      # below detection: half the lowest value
logs = np.log10(np.where(np.isnan(values) | (values <= 0), floor, values))
mean, sd = logs.mean(0), logs.std(0)
z = (logs - mean) / sd
labels = spots['Cluster'].to_numpy(int)
centroids = np.array([z[labels == k].mean(0) for k in range(6)])
agreement = (np.argmin(((z[:, None, :] - centroids) ** 2).sum(-1), 1) == labels).mean()
print(f'spots in their published cluster by nearest mean: {agreement:.1%}')


# --- Map: Tajogaite 2021 crystal 5 (the paper's Fig. 5), main crystal only

read = lambda e: pd.read_csv(MAP_DIR / f'channel_{CHANNEL[e]}.csv', header=None).to_numpy(float)
cube = np.stack([read(e) for e in ELEMENTS], -1)
crystal = read('Ca') >= CA_BACKGROUND
y, x = np.mgrid[0:crystal.shape[0], 0:crystal.shape[1]]
x1, y1, x2, y2 = CUT
main_side = (y2 - y1) * (x - x1) - (x2 - x1) * (y - y1) > 0
parts, _ = ndimage.label(ndimage.binary_closing(crystal, iterations=2) & main_side)
largest = np.argmax(np.bincount(parts.ravel())[1:]) + 1
keep = crystal & main_side & (parts == largest)

rows_kept, cols_kept = np.where(keep)
top, bottom = rows_kept.min(), rows_kept.max() + 1
left, right = cols_kept.min(), cols_kept.max() + 1
height = -(-(bottom - top) // BLOCK)
width = -(-(right - left) // BLOCK)

# Average 2 × 2 pixels; blocks mostly outside the crystal or in a hole have no data
blocks = np.full((height, width, len(ELEMENTS)), np.nan)
for j in range(height):
    for i in range(width):
        rs = slice(top + j * BLOCK, top + (j + 1) * BLOCK)
        cs = slice(left + i * BLOCK, left + (i + 1) * BLOCK)
        inside = keep[rs, cs]
        if inside.sum() >= 2:
            blocks[j, i] = cube[rs, cs][inside].mean(0)
filled = ~np.isnan(blocks[..., 0])
zmap = (np.log10(np.maximum(blocks[filled], floor)) - mean) / sd
distance = ((zmap[:, None, :] - centroids) ** 2).sum(-1)

# Clusters covering at least MIN_SHARE of the crystal; each pixel then takes the nearest of these
share = np.bincount(distance.argmin(1), minlength=6) / filled.sum()
used = [k for k in range(6) if share[k] >= MIN_SHARE]
print('share of the crystal by cluster:', ', '.join(f'{k}: {s:.1%}' for k, s in enumerate(share)), '-> used', used)
labels_map = np.full(filled.shape, -1)
labels_map[filled] = np.array(used)[distance[:, used].argmin(1)]

out = {e: [] for e in SHOWN}
out['cluster'] = []
for j in range(height):
    line = {e: [] for e in out}
    for i in range(width):
        if not filled[j, i]:
            for e in line:
                line[e].append('.')
            continue
        for e in SHOWN:
            v = max(float(blocks[j, i, ELEMENTS.index(e)]), 0.1)
            line[e].append(f'{v:.3g}' if v < 1000 else str(round(v)))
        line['cluster'].append(str(labels_map[j, i]))
    for e in out:
        out[e].append(' '.join(line[e]))

body = ',\n'.join(f'  {e}: [\n' + ',\n'.join(f'    "{r}"' for r in out[e]) + '\n  ]' for e in out)
(SITE / 'data/cpx-map.js').write_text(f'''/* =================================================================
   data/cpx-map.js  (built by tools/build_data.py)
   Laser-ablation map of clinopyroxene 5 from the 2021 Tajogaite
   eruption (La Palma), the crystal of Fig. 5 in
   Caracciolo A., Ubide T., Ágreda-López M., et al., Petrelli M. (2026).
   Nature Communications 17, 9362. https://doi.org/10.1038/s41467-026-77213-9
   Calibrated data from the paper's repository (Zenodo,
   https://doi.org/10.5281/zenodo.21081067). Crystal pixels have Ca
   counts of at least 1e5, as in the paper; the attached small grain is
   cut away; 2 × 2 pixels are averaged, giving {MICRONS * BLOCK} µm pixels.

   One string per map row, values separated by spaces; "." = no data
   (inclusion, crack or outside the crystal).
     Cr, Sc, Zr  ppm (values below 0.1 written as 0.1)
     cluster     nearest published cluster mean on log-transformed,
                 standardised {", ".join(ELEMENTS)}
                 (means and scaling from the 316 spot analyses), among
                 the clusters that cover at least {MIN_SHARE:.0%} of the
                 crystal: those listed in "clusters".
   ================================================================= */

const CPX_MAP = {{
  micronsPerPixel: {MICRONS * BLOCK},
  clusters: {json.dumps(used)},
  width: {width},
  height: {height},
{body}
}};
''', encoding='utf-8')
print('map', width, 'x', height, 'pixels kept', sum(v != '.' for r in out['cluster'] for v in r.split()))
