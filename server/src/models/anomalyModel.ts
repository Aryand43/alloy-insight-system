/**
 * GENERATED FILE. Do not edit by hand.
 * Run `npx tsx scripts/train-anomaly-model.ts` to refit.
 *
 * Fitted 2026-10-08 on Backend-Data.
 *
 * Layer model: 348 steady-state layers from the best-ranked
 * coupon families (60047207, 60076308, 60105609).
 *   - held out 60047207: best 0.0%-0.0%, worst 2.3%-43.9%
 *   - held out 60076308: best 3.4%-3.4%, worst 6.7%-51.2%
 *   - held out 60105609: best 1.9%-3.8%, worst 6.7%-75.6%
 *
 * Frame model: 39544 frames from the best-ranked runs with
 * frame data. Localises deviation within a layer; it does not predict coupon quality. Flag rates are 0.9%-1.1% for best-ranked runs and 0.7%-0.7% for worst-ranked.
 */
import type { GaussianModel } from '../services/mahalanobis.js'

export const LAYER_MODEL: GaussianModel = {
  "features": [
    "tempDriftPct",
    "sizeDriftPct",
    "tempJumpPct",
    "sizeJumpPct",
    "tempCurvature"
  ],
  "mean": [
    -0.07136942290575164,
    -2.257084596302022,
    0.0555157525405804,
    0.4240157696788712,
    0.3736796874481694
  ],
  "inverseCovariance": [
    [
      19.015396650607407,
      -1.2486848411324756,
      -4.670123740546429,
      0.8671913454031642,
      0.12596498735711037
    ],
    [
      -1.2486848411324756,
      0.12954986303730523,
      0.634527280410349,
      -0.03301869735189096,
      0.10649412464278044
    ],
    [
      -4.670123740546427,
      0.6345272804103489,
      15.459987864996025,
      -0.305218911908034,
      -1.6121818244408426
    ],
    [
      0.867191345403165,
      -0.03301869735189085,
      -0.30521891190803374,
      0.3836154411077843,
      -0.11264078147011908
    ],
    [
      0.12596498735710962,
      0.10649412464278049,
      -1.6121818244408426,
      -0.1126407814701191,
      10.898008307341074
    ]
  ],
  "alertThreshold": 5.902000699396853,
  "watchThreshold": 3.365769578513119
}

export const FRAME_MODEL: GaussianModel = {
  "features": [
    "sizeDriftPct",
    "tempDriftPct",
    "roughnessPct"
  ],
  "mean": [
    1.9614058492627795,
    -0.21001432469889555,
    1.8537817931328378
  ],
  "inverseCovariance": [
    [
      0.007155224913732068,
      -0.002943542399362101,
      0.005012115711242476
    ],
    [
      -0.0029435423993621006,
      0.30246064315329424,
      0.08948261701041613
    ],
    [
      0.005012115711242476,
      0.08948261701041614,
      0.20897209505976974
    ]
  ],
  "alertThreshold": 4.80054093761495,
  "watchThreshold": 2.930797099785714
}

export const MODEL_META = {
  name: 'Steady-state deviation model',
  layerTrainedOn:
    "348 steady-state layers from the coupons ranked best (60047207, 60076308, 60105609)",
  layerValidation: "Fitted on the steady-state layers of the coupons ranked best in COUPON QUALITY.xlsx. Held out by family: held out 60047207: best 0.0%-0.0%, worst 2.3%-43.9%; held out 60076308: best 3.4%-3.4%, worst 6.7%-51.2%; held out 60105609: best 1.9%-3.8%, worst 6.7%-75.6%.",
  frameValidation: "Localises deviation within a layer; it does not predict coupon quality. Flag rates are 0.9%-1.1% for best-ranked runs and 0.7%-0.7% for worst-ranked.",
} as const
