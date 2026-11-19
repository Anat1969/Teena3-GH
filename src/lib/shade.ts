// מפת גבהים ובדיקת צל. כל בניין נצרב לרשת של 2 מטר, וקרן אל השמש נבדקת מולה.
// כך אותו חישוב משרת את מפת שעות השמש על הקרקע ואת ניתוח הדירה.
import { type Building, type Pt, inside } from './site.ts'
import { type Sun, sunAt } from './sun.ts'

export interface HeightMap { n: number; cell: number; half: number; h: Float32Array; id: Int16Array; maxH: number }

export function buildHeightMap(buildings: Building[], half = 420, cell = 2): HeightMap {
  const n = Math.round((2 * half) / cell)
  const h = new Float32Array(n * n), id = new Int16Array(n * n)
  let maxH = 0
  for (const b of buildings) {
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity
    for (const [x, y] of b.pts) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y) }
    const i0 = Math.max(0, Math.floor((x0 + half) / cell)), i1 = Math.min(n - 1, Math.floor((x1 + half) / cell))
    const j0 = Math.max(0, Math.floor((y0 + half) / cell)), j1 = Math.min(n - 1, Math.floor((y1 + half) / cell))
    for (let j = j0; j <= j1; j++)
      for (let i = i0; i <= i1; i++) {
        const p: Pt = [(i + 0.5) * cell - half, (j + 0.5) * cell - half]
        if (b.h > h[j * n + i] && inside(p, b.pts)) { h[j * n + i] = b.h; id[j * n + i] = b.id }
      }
    maxH = Math.max(maxH, b.h)
  }
  return { n, cell, half, h, id, maxH }
}

/** מחזיר את מזהה הבניין שמצל על הנקודה, או 0 אם היא בשמש. */
export function blocker(hm: HeightMap, x: number, y: number, z: number, sun: Sun, skipId = 0): number {
  if (sun.altitude <= 0) return -1
  const { n, cell, half, h, id } = hm
  const reach = Math.min(700, (hm.maxH - z) / sun.tan)
  for (let dist = cell; dist < reach; dist += cell) {
    const i = Math.floor((x + sun.ex * dist + half) / cell), j = Math.floor((y + sun.ey * dist + half) / cell)
    if (i < 0 || j < 0 || i >= n || j >= n) return 0
    const k = j * n + i
    if (h[k] > z + dist * sun.tan && id[k] !== skipId) return id[k]
  }
  return 0
}

const STEP = 0.25 // רבע שעה
export function daySamples(day: number): { hour: number; sun: Sun }[] {
  const out = []
  for (let hour = 4.5; hour <= 20; hour += STEP) {
    const sun = sunAt(day, hour)
    if (sun.altitude > 2) out.push({ hour, sun })
  }
  return out
}

/** שעות שמש ישירה על הקרקע ביום נתון. תא שבתוך בניין מקבל -1. */
export function groundSunHours(hm: HeightMap, day: number, half = 300, cell = 3): { n: number; half: number; hours: Float32Array; max: number } {
  const n = Math.round((2 * half) / cell), hours = new Float32Array(n * n)
  const samples = daySamples(day).filter((_, i) => i % 2 === 0) // חצי שעה
  for (let j = 0; j < n; j++)
    for (let i = 0; i < n; i++) {
      const x = (i + 0.5) * cell - half, y = (j + 0.5) * cell - half
      const gi = Math.floor((x + hm.half) / hm.cell), gj = Math.floor((y + hm.half) / hm.cell)
      if (hm.h[gj * hm.n + gi] > 0) { hours[j * n + i] = -1; continue }
      let t = 0
      for (const s of samples) if (!blocker(hm, x, y, 0.5, s.sun)) t += 0.5
      hours[j * n + i] = t
    }
  return { n, half, hours, max: samples.length * 0.5 }
}

export interface FacadeDay { hours: number; first: number | null; last: number | null; blocked: Map<number, number>; possible: number }
/** שמש ישירה על נקודה בחזית: השמש מול החזית, ואין בניין אחר בדרך. */
export function facadeSun(hm: HeightMap, at: Pt, nx: number, ny: number, z: number, day: number, ownId: number): FacadeDay {
  const r: FacadeDay = { hours: 0, first: null, last: null, blocked: new Map(), possible: 0 }
  const x = at[0] + nx * 1.5, y = at[1] + ny * 1.5
  for (const s of daySamples(day)) {
    if (s.sun.ex * nx + s.sun.ey * ny < 0.05) continue
    r.possible += STEP
    const b = blocker(hm, x, y, z, s.sun, ownId)
    if (b) { r.blocked.set(b, (r.blocked.get(b) ?? 0) + STEP); continue }
    r.hours += STEP
    r.first ??= s.hour
    r.last = s.hour + STEP
  }
  return r
}
