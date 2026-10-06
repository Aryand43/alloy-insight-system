/**
 * The small amount of linear algebra the anomaly model needs.
 *
 * Kept dependency-free and shared by the trainer and the server so a model
 * can never be scored with different maths than it was fitted with.
 */

export interface GaussianModel {
  /** Feature names, in the order the vectors use. */
  features: string[]
  mean: number[]
  /** Inverse covariance, so scoring needs no factorisation at request time. */
  inverseCovariance: number[][]
  /** Score above which a point is flagged outright. */
  alertThreshold: number
  /** Score above which a point is worth watching but not flagging. */
  watchThreshold: number
}

export function mean(rows: number[][]): number[] {
  const d = rows[0].length
  const out = new Array<number>(d).fill(0)
  for (const r of rows) for (let i = 0; i < d; i++) out[i] += r[i]
  return out.map((v) => v / rows.length)
}

/** Sample covariance, with a small ridge so the inverse always exists. */
export function covariance(rows: number[][], mu: number[], ridge = 1e-6): number[][] {
  const d = mu.length
  const c: number[][] = Array.from({ length: d }, () => new Array<number>(d).fill(0))
  for (const r of rows) {
    for (let i = 0; i < d; i++) {
      for (let j = 0; j < d; j++) c[i][j] += (r[i] - mu[i]) * (r[j] - mu[j])
    }
  }
  const n = Math.max(rows.length - 1, 1)
  for (let i = 0; i < d; i++) {
    for (let j = 0; j < d; j++) c[i][j] /= n
    c[i][i] += ridge
  }
  return c
}

/** Gauss-Jordan inverse with partial pivoting. */
export function invert(matrix: number[][]): number[][] {
  const n = matrix.length
  const a = matrix.map((row, i) => [
    ...row,
    ...Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)),
  ])

  for (let col = 0; col < n; col++) {
    let pivot = col
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(a[r][col]) > Math.abs(a[pivot][col])) pivot = r
    }
    if (Math.abs(a[pivot][col]) < 1e-12) {
      throw new Error('matrix is singular — cannot invert covariance')
    }
    if (pivot !== col) [a[col], a[pivot]] = [a[pivot], a[col]]

    const d = a[col][col]
    for (let j = 0; j < 2 * n; j++) a[col][j] /= d

    for (let r = 0; r < n; r++) {
      if (r === col) continue
      const f = a[r][col]
      if (f === 0) continue
      for (let j = 0; j < 2 * n; j++) a[r][j] -= f * a[col][j]
    }
  }

  return a.map((row) => row.slice(n))
}

/** Distance of one feature vector from the model's centre, in sd-like units. */
export function score(model: GaussianModel, vector: number[]): number {
  const d = vector.length
  let acc = 0
  for (let i = 0; i < d; i++) {
    const di = vector[i] - model.mean[i]
    for (let j = 0; j < d; j++) {
      acc += di * model.inverseCovariance[i][j] * (vector[j] - model.mean[j])
    }
  }
  return Math.sqrt(Math.max(acc, 0))
}

export function quantile(values: number[], q: number): number {
  const sorted = [...values].sort((a, b) => a - b)
  if (!sorted.length) return 0
  const pos = (sorted.length - 1) * q
  const lo = Math.floor(pos)
  const hi = Math.ceil(pos)
  return lo === hi ? sorted[lo] : sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo)
}

export function median(values: number[]): number {
  return quantile(values, 0.5)
}

/** Fits the model and sets both thresholds from the training distribution. */
export function fit(
  rows: number[][],
  features: string[],
  watchQuantile = 0.95,
  alertQuantile = 0.99,
): GaussianModel {
  if (rows.length < features.length * 10) {
    throw new Error(
      `too little training data: ${rows.length} rows for ${features.length} features`,
    )
  }
  const mu = mean(rows)
  const inverseCovariance = invert(covariance(rows, mu))
  const base: GaussianModel = {
    features,
    mean: mu,
    inverseCovariance,
    alertThreshold: 0,
    watchThreshold: 0,
  }
  const scores = rows.map((r) => score(base, r))
  return {
    ...base,
    watchThreshold: quantile(scores, watchQuantile),
    alertThreshold: quantile(scores, alertQuantile),
  }
}
