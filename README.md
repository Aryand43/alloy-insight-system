# Process Insight

Two-stage SPA for additive-manufacturing process setup and multi-view analysis (raw frames, thresholded melt-pool data, 3D reconstruction, three-color volume, and threshold statistics).

Ships with a **data bridge** (`server/`) that reads the real research corpus in
`Backend-Data/` — 26 DED coupons of 316L — and serves it to the dashboard.

## Stack

- Vite + React 19 + TypeScript
- Tailwind CSS v4
- React Router, Zustand
- React Three Fiber + Three.js (3D panels)
- Express + ExcelJS (data bridge, run with tsx)

## Quick start

```bash
npm install
npm run dev
```

That starts both the data bridge (`:3001`) and the dashboard (`:5173`). Open
the printed local URL.

| Script | What it runs |
|--------|--------------|
| `npm run dev` | bridge + dashboard together |
| `npm run dev:server` | data bridge only |
| `npm run dev:web` | dashboard only |
| `npm run build` | typechecks app, node and server, then builds |

## Environment

| Variable | Default | Description |
|----------|---------|-------------|
| `VITE_USE_MOCK` | `false` | Set `true` to run the UI standalone on demo data |
| `VITE_API_BASE_URL` | `http://localhost:3001` | Data bridge origin |
| `PORT` | `3001` | Bridge port |
| `BACKEND_DATA_DIR` | `./Backend-Data` | Where the research corpus lives |
| `PUBLIC_BASE_URL` | `http://localhost:$PORT` | Origin used to build image URLs |

`Backend-Data/` is ~33 GB and ~195k files, so it is git-ignored. Point
`BACKEND_DATA_DIR` at it if it lives outside the repo.

## The data bridge

Reads only the Excel and PNG files that already exist — **MATLAB is never run**.

| Route | Reads from |
|-------|------------|
| `GET /catalog` | `meantemp/` filenames + `COUPON QUALITY.xlsx` |
| `POST /sessions` | body `{ config }`, `config.sampleId` required |
| `GET /sessions/:id` | in-memory store, revived from the id on a cache miss |
| `GET /sessions/:id/frames` | one frame per layer |
| `GET /sessions/:id/threshold/:frameId` | `meantemp_` + `meansize_` for that layer |
| `GET /sessions/:id/reconstruction` | per-layer melt-pool size |
| `GET /sessions/:id/three-color` | per-layer temp + size classification |
| `GET /sessions/:id/stats` | layer drift distribution |
| `GET /builds/:id/layers` | full layer series (debugging) |
| `GET /builds/:id/layers/:n/kiv/temp.png` | KIV histogram image |
| `GET /builds/:id/layers/:n/chart.svg` | generated layer chart (no-KIV builds) |
| `GET /sessions/:id/thermal/layers` | layer index for Alloy Insight |
| `GET /sessions/:id/thermal/layers/:n/frames` | windowed frame list (`offset`, `limit`) |
| `GET /sessions/:id/thermal/layers/:n/frames/:i/stats` | computed vs machine-logged melt-pool numbers |
| `GET /builds/:id/layers/:n/frames/:i/thermal.png` | rendered thermal frame (`overlay=1`, `roi=1`) |

### Coupon ids

`60047207r2` = 60 mm long · 4 passes · 72 layers · 0.7 mm increment · run 2.
Layers × increment ≈ 50 mm for every coupon. See
[docs/backend-data-integration-plan.md](docs/backend-data-integration-plan.md).

### Data coverage

- All **26** builds have per-layer mean temperature and melt-pool size.
- **2** builds (`60047207r2`, `60045010r2` — the best and worst 4-pass coupons)
  additionally have per-layer KIV histogram PNGs. The other 24 get a generated
  layer-profile chart, flagged `measured: false` so the UI never presents one
  as a captured image.
- **8** builds have raw `Frames/` from the machine; not yet used by the bridge.
- `60105010r4` is missing temperature values past layer 19 in the source
  spreadsheet — the bridge truncates that build rather than failing.

### Classification thresholds

Layers are scored on percent drift from the build's own **median** layer value
(median, not mean, because every build ramps up over its first layers).

Defaults are `2%` / `5%` for temperature, calibrated against the corpus: real
temperature drift tops out near 11% and 96% of layers sit within 5%, so the
`10%`/`30%` bins originally planned put every layer in "stable". Override per
request with `?tempStable=&tempTransition=&sizeStable=&sizeTransition=`.

## Two analysis modes

Setup offers two ways to run a build.

**Process Insight** — the per-layer spreadsheet summaries. Works for all 26
builds. One mean temperature and one melt-pool area per layer.

**Alloy Insight** — the raw thermal frames, thresholded at the melt temperature
to segment the melt-pool boundary. Available for the **7 builds** that recorded
frames *and* the `Data.dat` needed to map them to layers:
`60105010r3`, `60105609r4`, `60105609r5`, `60106308r2`, `60106308r3`,
`60107207r2`, `60107207r3` — all 10-pass. (`60105010r4` has 19,610 frames but
no `Data.dat`, so it is excluded.)

### How the thermal pipeline works

`Frames/*.dat` are 164 x 218 matrices of raw 12-bit camera counts.
`Backend-Data/CameraCalibration.dat` is a 4096-row lookup table converting those
counts to °C (980-2008 °C). The melt pool is the set of pixels above the
controller's threshold (raw count 497 = **1560 °C**, the `TemperatureMeltThreshold`
in every run header) inside the circular region it evaluates — radius 70 centred
at row 82, col 109.

This reproduces the machine's own detection: measured across three builds, the
segmented area matches the logged `meltpoolSize` at a ratio of 0.995-1.001
(sd <= 0.017), and mean temperature lands within a few °C. Every frame view shows
both numbers side by side so the agreement is visible.

Frames join to layers by nearest timestamp against `Data.dat` (120 ms tolerance),
then by the `z` column. A layer holds ~380 frames; the UI pins the layer on the
left and scrubs frames on the right, rolling over to the next layer at the end.

**Caveat:** ~38 frames in `60106308r3` are binary garbage rather than text. The
parser rejects them with a 422 rather than rendering noise.

## Stages

1. **Setup** (`/`) — material, process type, melt temperature, data source, configuration → **Run analysis**
2. **Analysis** (`/analysis/:sessionId`) — 2×2 visualization grid + statistics strip

