/**
 * Super-resolution for the thermal frames, trained on this camera's own data.
 *
 * The model is a sub-pixel regressor in the A+ / ESPCN family: each native
 * pixel's 5x5 neighbourhood is contrast-normalised, matched to one of a small
 * set of learned patch clusters, and that cluster's linear map predicts the
 * r x r block of detail to add on top of a bicubic baseline. Training is
 * self-supervised — frames are downscaled by r, and the model learns to put
 * back what the downscale removed — so the only supervision needed is the
 * corpus itself.
 *
 * It is a real learned model rather than a sharpening filter: the clusters
 * specialise (flat interior, melt-pool boundary, spatter), and the gain over
 * bicubic is measured on frames held out of training.
 *
 * Shared by the trainer and the browser so both use identical maths; nothing
 * here touches the DOM or Node.
 */

export interface SuperResolutionModel {
  /** Upscale factor the model was fitted for. */
  scale: number
  /** Neighbourhood side length in native pixels; must be odd. */
  patch: number
  /** Cluster centroids over contrast-normalised patches, k x patch². */
  centroids: number[][]
  /** Per-cluster linear map, k x (scale² x patch²). */
  weights: number[][][]
  /** Per-cluster bias, k x scale². */
  biases: number[][]
  /** Temperature range the model was normalised over, °C. */
  domain: [number, number]
  meta: {
    trainedOn: string
    /** Measured on held-out frames, in dB. */
    psnrBicubic: number
    psnrModel: number
  }
}

export interface Grid {
  values: Float32Array
  width: number
  height: number
}

function clampIndex(v: number, max: number): number {
  return v < 0 ? 0 : v >= max ? max - 1 : v
}

export function sampleGrid(grid: Grid, row: number, col: number): number {
  return grid.values[clampIndex(row, grid.height) * grid.width + clampIndex(col, grid.width)]
}

/** Catmull-Rom, the usual cubic kernel for image resampling. */
function cubic(a: number, b: number, c: number, d: number, t: number): number {
  const t2 = t * t
  const t3 = t2 * t
  return (
    b +
    0.5 * t * (c - a) +
    0.5 * t2 * (2 * a - 5 * b + 4 * c - d) +
    0.5 * t3 * (-a + 3 * b - 3 * c + d)
  )
}

/**
 * Bicubic upscale. This is both the comparison baseline and the surface the
 * model's predicted detail is added to, so it lives here rather than in the
 * panel — the trainer has to produce residuals against exactly this.
 */
export function bicubicUpscale(grid: Grid, scale: number): Grid {
  const width = grid.width * scale
  const height = grid.height * scale
  const out = new Float32Array(width * height)

  for (let y = 0; y < height; y++) {
    const sy = (y + 0.5) / scale - 0.5
    const r0 = Math.floor(sy)
    const fy = sy - r0
    for (let x = 0; x < width; x++) {
      const sx = (x + 0.5) / scale - 0.5
      const c0 = Math.floor(sx)
      const fx = sx - c0

      const rows = [0, 0, 0, 0]
      for (let m = -1; m <= 2; m++) {
        rows[m + 1] = cubic(
          sampleGrid(grid, r0 + m, c0 - 1),
          sampleGrid(grid, r0 + m, c0),
          sampleGrid(grid, r0 + m, c0 + 1),
          sampleGrid(grid, r0 + m, c0 + 2),
          fx,
        )
      }
      out[y * width + x] = cubic(rows[0], rows[1], rows[2], rows[3], fy)
    }
  }
  return { values: out, width, height }
}

/** Box-downscale by an integer factor — how a coarser sensor would integrate. */
export function boxDownscale(grid: Grid, scale: number): Grid {
  const width = Math.floor(grid.width / scale)
  const height = Math.floor(grid.height / scale)
  const out = new Float32Array(width * height)
  const area = scale * scale

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let sum = 0
      for (let dy = 0; dy < scale; dy++) {
        for (let dx = 0; dx < scale; dx++) {
          sum += grid.values[(y * scale + dy) * grid.width + x * scale + dx]
        }
      }
      out[y * width + x] = sum / area
    }
  }
  return { values: out, width, height }
}

export interface PatchFeature {
  /** Contrast-normalised neighbourhood. */
  vector: Float32Array
  /** Local mean and contrast, needed to put the prediction back in scale. */
  mean: number
  scaleFactor: number
}

/**
 * Local contrast normalisation.
 *
 * Melt-pool frames span ~1,000 °C between the pool and its surroundings. Left
 * unnormalised, the clusters would simply sort patches by temperature; divided
 * through by local contrast they sort by *structure*, which is what the
 * detail reconstruction depends on.
 */
export function patchFeature(grid: Grid, row: number, col: number, patch: number): PatchFeature {
  const half = patch >> 1
  const n = patch * patch
  const vector = new Float32Array(n)

  let sum = 0
  let i = 0
  for (let dy = -half; dy <= half; dy++) {
    for (let dx = -half; dx <= half; dx++) {
      const v = sampleGrid(grid, row + dy, col + dx)
      vector[i++] = v
      sum += v
    }
  }
  const mean = sum / n

  let variance = 0
  for (let k = 0; k < n; k++) {
    const d = vector[k] - mean
    variance += d * d
  }
  // The floor keeps flat patches — the still background — from being amplified.
  const scaleFactor = Math.max(Math.sqrt(variance / n), 1e-3)

  for (let k = 0; k < n; k++) vector[k] = (vector[k] - mean) / scaleFactor
  return { vector, mean, scaleFactor }
}

export function nearestCluster(model: SuperResolutionModel, vector: Float32Array): number {
  let best = 0
  let bestDistance = Infinity
  for (let c = 0; c < model.centroids.length; c++) {
    const centroid = model.centroids[c]
    let distance = 0
    for (let k = 0; k < vector.length; k++) {
      const d = vector[k] - centroid[k]
      distance += d * d
      if (distance >= bestDistance) break
    }
    if (distance < bestDistance) {
      bestDistance = distance
      best = c
    }
  }
  return best
}

/**
 * Upscales a native-resolution grid by the model's factor.
 *
 * Bicubic first, then the learned residual per native pixel. Values stay in
 * the units they arrived in (°C here) — the model normalises internally.
 */
export function superResolve(grid: Grid, model: SuperResolutionModel): Grid {
  const { scale, patch } = model
  const out = bicubicUpscale(grid, scale)

  for (let row = 0; row < grid.height; row++) {
    for (let col = 0; col < grid.width; col++) {
      const feature = patchFeature(grid, row, col, patch)
      const cluster = nearestCluster(model, feature.vector)
      const weights = model.weights[cluster]
      const bias = model.biases[cluster]

      for (let sub = 0; sub < scale * scale; sub++) {
        const row_ = weights[sub]
        let acc = bias[sub]
        for (let k = 0; k < feature.vector.length; k++) acc += row_[k] * feature.vector[k]

        const y = row * scale + ((sub / scale) | 0)
        const x = col * scale + (sub % scale)
        // Residuals are learned in normalised units, so scale them back.
        out.values[y * out.width + x] += acc * feature.scaleFactor
      }
    }
  }
  return out
}

/** Peak signal-to-noise ratio in dB, for comparing reconstructions. */
export function psnr(a: Float32Array, b: Float32Array, peak: number): number {
  let sum = 0
  for (let i = 0; i < a.length; i++) {
    const d = a[i] - b[i]
    sum += d * d
  }
  const mse = sum / a.length
  return mse <= 0 ? Infinity : 10 * Math.log10((peak * peak) / mse)
}
