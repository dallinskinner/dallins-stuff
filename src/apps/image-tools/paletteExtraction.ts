import { oklabToRgb, rgbToOklab } from './colorConversion'

// k-means over every pixel is wasted work — a few thousand samples give the same result in a
// fraction of the time.
const MAX_SAMPLES = 8000
const MAX_ITERATIONS = 10
// k-means++ init is random, so a single run can land in a bad local optimum (e.g. spending a
// cluster on an anti-aliased edge-color band instead of a real but less numerous flat region).
// Running it several times and keeping the lowest-inertia result makes that much less likely.
const RESTARTS = 5

interface LabPoint {
  l: number
  a: number
  b: number
}

function distanceSquared(p: LabPoint, q: LabPoint): number {
  const dl = p.l - q.l
  const da = p.a - q.a
  const db = p.b - q.b
  return dl * dl + da * da + db * db
}

/** k-means++ init: first centroid is random, each subsequent one is chosen with probability
 *  proportional to its squared distance from the nearest existing centroid. Spreads centroids out
 *  across the actual color distribution instead of risking several landing near each other. */
function initCentroids(points: LabPoint[], k: number): LabPoint[] {
  const centroids: LabPoint[] = [points[Math.floor(Math.random() * points.length)]]

  while (centroids.length < k) {
    const distances = points.map((p) => Math.min(...centroids.map((c) => distanceSquared(p, c))))
    const total = distances.reduce((sum, d) => sum + d, 0)
    if (total === 0) break // all remaining points coincide with an existing centroid

    let target = Math.random() * total
    let chosen = points[points.length - 1]
    for (let i = 0; i < points.length; i++) {
      target -= distances[i]
      if (target <= 0) {
        chosen = points[i]
        break
      }
    }
    centroids.push(chosen)
  }

  return centroids
}

/** Runs one k-means trial to convergence and reports its inertia (total squared distance from each
 *  point to its assigned centroid) alongside the resulting centroids, so callers can compare trials
 *  and keep the best one. */
function runKMeans(points: LabPoint[], k: number): { centroids: LabPoint[]; inertia: number } {
  let centroids = initCentroids(points, k)
  let assignments = new Array(points.length).fill(-1)
  let distances = new Array(points.length).fill(Infinity)

  for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
    const nextAssignments: number[] = []
    const nextDistances: number[] = []
    for (const p of points) {
      let best = 0
      let bestDist = Infinity
      for (let c = 0; c < centroids.length; c++) {
        const dist = distanceSquared(p, centroids[c])
        if (dist < bestDist) {
          bestDist = dist
          best = c
        }
      }
      nextAssignments.push(best)
      nextDistances.push(bestDist)
    }

    const changed = nextAssignments.some((a, i) => a !== assignments[i])
    assignments = nextAssignments
    distances = nextDistances
    if (!changed && iter > 0) break

    const sums = centroids.map(() => ({ l: 0, a: 0, b: 0, count: 0 }))
    points.forEach((p, i) => {
      const sum = sums[assignments[i]]
      sum.l += p.l
      sum.a += p.a
      sum.b += p.b
      sum.count++
    })

    centroids = sums
      .filter((sum) => sum.count > 0)
      .map((sum) => ({ l: sum.l / sum.count, a: sum.a / sum.count, b: sum.b / sum.count }))
  }

  const inertia = distances.reduce((sum, d) => sum + d, 0)
  return { centroids, inertia }
}

/** Clusters the image's pixels in OKLab space and returns each cluster's average color — the
 *  "average of all the yellowish pixels, average of all the bluish pixels" behavior, generalized to
 *  however many clusters best summarize the image. May return fewer than `k` colors if the image
 *  doesn't have that many distinct clusters. */
export function extractPalette(imageData: ImageData, k: number): { r: number; g: number; b: number }[] {
  const { data } = imageData
  const pixelCount = data.length / 4
  const stride = Math.max(1, Math.ceil(pixelCount / MAX_SAMPLES))

  const points: LabPoint[] = []
  for (let i = 0; i < pixelCount; i += stride) {
    const offset = i * 4
    points.push(rgbToOklab(data[offset], data[offset + 1], data[offset + 2]))
  }
  if (points.length === 0) return []

  const targetK = Math.min(k, points.length)
  let best = runKMeans(points, targetK)
  for (let i = 1; i < RESTARTS; i++) {
    const trial = runKMeans(points, targetK)
    if (trial.inertia < best.inertia) best = trial
  }

  return best.centroids.map((c) => oklabToRgb(c.l, c.a, c.b))
}
