# Alloy Insight

Two-stage SPA for additive-manufacturing process setup and multi-view analysis (raw frames, thresholded melt-pool data, 3D reconstruction, three-color volume, and threshold statistics).

## Stack

- Vite + React 19 + TypeScript
- Tailwind CSS v4
- React Router, Zustand
- React Three Fiber + Three.js (3D panels)

## Quick start

```bash
npm install
npm run dev
```

Open the printed local URL (default `http://localhost:5173`).

## Environment

| Variable | Default | Description |
|----------|---------|-------------|
| `VITE_USE_MOCK` | `true` | When not `false`, all API calls use in-memory mock adapters |
| `VITE_API_BASE_URL` | `http://localhost:3001` | Backend origin when mock mode is off |

Copy `.env` or set these in `.env.local`.

### Switching to a real backend

Set:

```env
VITE_USE_MOCK=false
VITE_API_BASE_URL=https://your-api.example
```

Expected routes (JSON):

| Method | Path | Body / response |
|--------|------|-----------------|
| `POST` | `/sessions` | Body `{ config }` → session `{ id, config, status, createdAt }` |
| `GET` | `/sessions/:id` | Session |
| `GET` | `/sessions/:id/frames` | `Frame[]` |
| `GET` | `/sessions/:id/threshold/:frameId` | `ThresholdOverlay` |
| `GET` | `/sessions/:id/reconstruction` | `MeshPayload` |
| `GET` | `/sessions/:id/three-color` | `ThreeColorPayload` |
| `GET` | `/sessions/:id/stats` | `ThresholdStats` |

Types live under `src/domain/types.ts`. Client entry: `src/api/sessions.ts`.

## Stages

1. **Setup** (`/`) — material, process type, melt temperature, data source, configuration → **Run analysis**
2. **Analysis** (`/analysis/:sessionId`) — 2×2 visualization grid + statistics strip

## Scripts

```bash
npm run dev      # development server
npm run build    # typecheck + production build
npm run preview  # preview production build
```
