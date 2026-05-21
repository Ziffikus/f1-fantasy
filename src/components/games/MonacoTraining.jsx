import { useEffect, useRef, useState, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuthStore } from '../../stores/authStore'
import './MonacoTraining.css'

// ── Mathematische Kurvenglättung (Catmull-Rom-Spline) ────────────────────────

// Berechnet einen weichen Zwischenpunkt zwischen p1 und p2
function interpolateCatmullRom(p0, p1, p2, p3, t) {
  const t2 = t * t;
  const t3 = t2 * t;

  const x = 0.5 * (
    (2 * p1[0]) +
    (-p0[0] + p2[0]) * t +
    (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 +
    (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3
  );

  const y = 0.5 * (
    (2 * p1[1]) +
    (-p0[1] + p2[1]) * t +
    (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 +
    (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3
  );

  return [x, y];
}

// Vervielfacht die Punkte, um enge Kurven sauber abzurunden
function subdivideTrack(rawPoints, subdivisions = 4) {
  const N = rawPoints.length;
  const smoothPoints = [];

  for (let i = 0; i < N; i++) {
    const p0 = rawPoints[(i - 1 + N) % N];
    const p1 = rawPoints[i];
    const p2 = rawPoints[(i + 1) % N];
    const p3 = rawPoints[(i + 2) % N];

    for (let j = 0; j < subdivisions; j++) {
      const t = j / subdivisions;
      smoothPoints.push(interpolateCatmullRom(p0, p1, p2, p3, t));
    }
  }
  return smoothPoints;
}

// ── Exakte Monaco-Ideallinie (Punkte 0 bis 101 aus der JSON) ────────────────
const RAW = [
  [887.23, 286.84], [908.66, 299.65], [927.31, 290.55], [950.0, 268.97],
  [940.92, 248.58], [926.91, 238.8],  [907.83, 226.0],  [883.63, 210.14],
  [854.28, 191.18], [826.07, 173.36], [802.25, 162.17], [777.23, 154.72],
  [751.15, 150.81], [724.14, 150.28], [696.48, 152.9],  [670.1, 158.09],
  [644.49, 165.61], [619.31, 175.36], [603.19, 183.64], [577.94, 198.65],
  [551.14, 215.24], [527.35, 229.98], [502.13, 244.82], [481.69, 236.19],
  [458.03, 233.02], [438.2, 248.12],  [430.73, 272.88], [413.45, 286.93],
  [390.02, 305.14], [365.51, 324.19], [343.94, 340.22], [322.24, 356.13],
  [299.03, 363.28], [274.71, 346.21], [252.14, 326.21], [236.19, 311.13],
  [236.15, 286.91], [226.28, 263.01], [206.65, 239.02], [191.64, 220.84],
  [169.83, 212.33],